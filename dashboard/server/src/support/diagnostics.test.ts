import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AI_PROMPT_GOAL_MAX,
  AI_PROMPT_GOAL_PLACEHOLDER,
  AI_PROMPT_MAX_CHARS,
  fillAiPrompt,
  LLMS_TXT_URL,
  LOG_SOURCES,
  REPO_URL,
  type LogSource,
  type LogView,
  type StatusView,
} from '@easyarr/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { LogBuffer, createLogger } from '../logger.js';
import {
  defaultSecrets,
  defaultState,
  secretsStore,
  stateStore,
  type Secrets,
  type State,
} from '../state/index.js';
import { DiagnosticsService, docsFor } from './diagnostics.js';

// Every kind of secret EasyArr stores (fake values).
const S = {
  sonarrKey: '3f1c0b8a9d2e4f6071829a3b4c5d6e7f',
  jellyfinKey: 'ab12cd34ef56ab12cd34ef56ab12cd34',
  password: 'correct-horse-battery',
  wgKey: 'eF3wq8m0Hk1ZgX5bQ2yP9tL7cV4nR6sD0aJ8uK2iMWg=',
  vpnUser: 'p1234567+pmp',
  vpnPassword: 'vpn-pass-9876',
  usenetPassword: 'n3wsP4ss!x',
  indexerKey: 'idxkey0123456789abcdefXYZ',
  username: 'mira_k',
  usenetUser: 'usenetuser42',
  usenetHost: 'news.eweka.nl',
  indexerHost: 'api.nzbgeek.info',
  publicIp: '185.213.154.69',
  homeIp: '84.150.12.34',
  email: 'mira@example.com',
};
const SECRETS = [
  S.sonarrKey,
  S.jellyfinKey,
  S.password,
  S.wgKey,
  S.vpnPassword,
  S.usenetPassword,
  S.indexerKey,
];
const IDENTIFYING = [
  S.username,
  S.usenetUser,
  S.usenetHost,
  S.indexerHost,
  S.publicIp,
  S.homeIp,
  S.email,
  S.vpnUser,
];

function finishedState(): State {
  const s = defaultState(new Date('2026-11-01T10:00:00Z'));
  s.wizard.completedSteps = [
    'welcome',
    'system',
    'account',
    'download',
    'vpn',
    'usenet',
    'indexers',
    'library',
    'finish',
  ];
  s.wizard.answers = {
    account: { username: S.username },
    download: { method: 'both' },
    vpn: { mode: 'configured' },
    usenet: {
      servers: [
        {
          id: 'eweka',
          preset: 'eweka',
          host: S.usenetHost,
          port: 563,
          ssl: true,
          username: S.usenetUser,
          connections: 20,
        },
      ],
      indexers: [
        {
          id: 'geek',
          preset: null,
          name: 'NZBgeek',
          url: `https://${S.indexerHost}`,
          apiPath: '/api',
        },
      ],
    },
    indexers: { mode: 'added' },
  };
  s.account = { username: S.username, passwordHash: 'scrypt$x', updatedAt: '2026-11-01T10:00:00Z' };
  s.vpn = {
    provider: 'protonvpn',
    protocol: 'wireguard',
    locations: ['Netherlands'],
    portForwarding: true,
    forwardedPort: 51413,
    freePlan: false,
    fields: { wgAddresses: '10.2.0.2/32' },
    configuredAt: '2026-11-01T10:00:00Z',
    lastTest: {
      ok: true,
      at: '2026-11-01T10:01:00Z',
      code: null,
      publicIp: S.publicIp,
      country: 'Netherlands',
      homeIpHidden: true,
    },
  };
  s.wiring.lastRun = { at: '2026-11-01T10:05:00Z', mode: 'run', ok: false, changes: 12 };
  s.wiring.ledger = [
    {
      key: 'sonarr.dc.qbit',
      service: 'sonarr',
      kind: 'downloadclient',
      id: '1',
      name: 'qBittorrent',
      createdAt: 'x',
      adopted: false,
    },
  ];
  return s;
}

function secrets(): Secrets {
  return {
    ...defaultSecrets(),
    apiKeys: { sonarr: S.sonarrKey, jellyfin: S.jellyfinKey },
    account: { password: S.password },
    vpn: { fields: { wgPrivateKey: S.wgKey, username: S.vpnUser, password: S.vpnPassword } },
    usenet: { servers: { eweka: S.usenetPassword }, indexers: { geek: S.indexerKey } },
  };
}

/** Log lines that contain everything above, the way services really print things. */
function nastyLines(source: LogSource): LogView {
  const lines = [
    `GET /api/v3/system/status?apikey=${S.sonarrKey} returned 401`,
    `Jellyfin auth MediaBrowser Token="${S.jellyfinKey}" for user ${S.username}`,
    `Failed to connect: Server ${S.usenetHost}:563 rejected ${S.usenetUser} / ${S.usenetPassword}`,
    `Indexer https://${S.indexerHost}/api?t=caps&apikey=${S.indexerKey} timed out`,
    `[wireguard] private key ${S.wgKey} public IP ${S.publicIp}`,
    `OpenVPN AUTH user ${S.vpnUser} password ${S.vpnPassword}`,
    `login ${S.password} from ${S.homeIp} (${S.email})`,
  ].map((message, i) => ({
    time: `2026-11-01T10:0${i}:00Z`,
    level: i % 2 ? ('error' as const) : ('warn' as const),
    message: `${source}: ${message}`,
  }));
  return { source, available: source !== 'lidarr', lines: source === 'lidarr' ? [] : lines };
}

const status: StatusView = {
  at: '2026-11-01T10:10:00Z',
  version: '0.0.17',
  mode: 'simple',
  services: [
    { id: 'sonarr', state: 'ok', version: '4.0.20.2900', used: true },
    { id: 'radarr', state: 'down', version: null, used: true },
  ],
  vpn: {
    connection: 'connected',
    provider: 'protonvpn',
    protocol: 'wireguard',
    wrapper: 'running',
    runningFor: 3600,
    publicIp: { ip: S.publicIp, country: 'Netherlands', city: 'Amsterdam' },
    portForwarding: { mode: 'auto', port: 51413, state: 'active' },
    problem: null,
  },
  downloads: { items: [], speedBps: 0, reachable: { qbittorrent: true, sabnzbd: true } },
  disk: { freeBytes: 1e12, totalBytes: 6e12 },
  recent: null,
  warnings: [{ code: 'serviceDown', services: ['radarr'] }],
  stuck: [],
};

function service(over: Partial<ConstructorParameters<typeof DiagnosticsService>[0]> = {}) {
  return new DiagnosticsService({
    version: '0.0.0-dev',
    appVersion: '0.0.17',
    state: async () => finishedState(),
    secrets: async () => secrets(),
    systemInfo: async () => ({
      arch: 'x64',
      totalMemoryBytes: 24 * 1024 ** 3,
      disk: { freeBytes: 1e12, totalBytes: 6e12 },
      gpu: { kind: 'dri', devices: ['/dev/dri/renderD128'] },
    }),
    status: async () => status,
    log: async (s) => nastyLines(s),
    now: () => new Date('2026-11-01T10:15:00Z'),
    ...over,
  });
}

function file(files: Record<string, Uint8Array>, name: string): string {
  const bytes = files[name];
  if (!bytes) throw new Error(`${name} missing from the zip`);
  return strFromU8(bytes);
}

function expectClean(text: string, label: string) {
  for (const v of [...SECRETS, ...IDENTIFYING]) {
    expect(text.includes(v), `${label} contains ${v}`).toBe(false);
  }
}

describe('diagnostics bundle', () => {
  it('has the summary, the prompt and every log, with nothing secret or identifying in it', async () => {
    const { name, zip } = await service().bundle();
    expect(name).toBe('easyarr-diagnostics-2026-11-01-1015.zip');
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(
      [
        'README.txt',
        'ai-prompt.txt',
        'diagnostics.json',
        ...LOG_SOURCES.map((s) => `logs/${s}.log`),
      ].sort(),
    );
    for (const [file, bytes] of Object.entries(files)) expectClean(strFromU8(bytes), file);
    const report = JSON.parse(file(files, 'diagnostics.json')) as Record<string, unknown>;
    expect(report['app']).toMatchObject({ version: '0.0.17', name: 'EasyArr' });
    expect(report['system']).toMatchObject({ arch: 'x64', memoryGb: 24, gpu: 'dri' });
    expect(report['wizard']).toMatchObject({ finished: true, open: [] });
    expect(report['setup']).toMatchObject({
      downloadMethod: 'both',
      vpn: {
        provider: 'protonvpn',
        protocol: 'wireguard',
        lastTest: { ok: true, homeIpHidden: true },
      },
      usenet: { servers: 1, indexers: 1 },
    });
    expect(report['vpn']).toMatchObject({
      connection: 'connected',
      country: 'Netherlands',
      portForwarding: 'active',
    });
    expect(report['wiring']).toMatchObject({ resources: { sonarr: 1 }, lastRun: { ok: false } });
    expect(report['warnings']).toEqual(['serviceDown (radarr)']);
    expect(file(files, 'logs/lidarr.log')).toMatch(/didn't answer/);
    // The markers say what was there.
    expect(file(files, 'logs/sonarr.log')).toContain('[REDACTED:apikey]');
    expect(file(files, 'logs/sonarr.log')).toContain('[REDACTED:host]');
  });

  it('keeps LAN addresses unless asked to hide them', async () => {
    const svc = service({
      log: async (source) => ({
        source,
        available: true,
        lines: [{ time: null, level: 'info', message: 'dashboard at 192.168.2.208' }],
      }),
    });
    const keep = file(unzipSync((await svc.bundle()).zip), 'logs/vpn.log');
    expect(keep).toContain('192.168.2.208');
    const hide = file(unzipSync((await svc.bundle({ privateIps: true })).zip), 'logs/vpn.log');
    expect(hide).not.toContain('192.168.2.208');
    expect(hide).toContain('[REDACTED:private-ip]');
  });

  it('refuses to hand anything out when a stored secret survives redaction', async () => {
    // The log was redacted with a list that didn't have the password yet (secrets.json changed in
    // between); the final check, made with the current list, catches it.
    const raw = service({
      log: async (source) => ({
        source,
        available: true,
        lines: [{ time: null, level: 'info', message: `x ${S.password} y` }],
      }),
      secrets: (() => {
        let n = 0;
        return async () => (n++ < 3 ? { ...secrets(), account: null } : secrets());
      })(),
    });
    await expect(raw.bundle()).rejects.toThrow(/survived redaction/);
  });
});

describe('AI help prompt', () => {
  it('follows the SPEC template, with docs links and llms.txt, and no secrets', async () => {
    const { prompt, truncated } = await service().aiPrompt(
      { area: 'wizard', step: 'vpn' },
      `Connecting failed: wrong key ${S.wgKey}`,
    );
    expect(truncated).toBe(false);
    for (const section of [
      '[Context]',
      '[System]',
      '[State]',
      '[Problem]',
      '[Docs]',
      '[Question]',
    ]) {
      expect(prompt).toContain(section);
    }
    expect(prompt.indexOf('[Context]')).toBeLessThan(prompt.indexOf('[Question]'));
    expect(prompt).toContain(LLMS_TXT_URL);
    expect(prompt).toContain('Where: Setup wizard → VPN step');
    expect(prompt).toContain('Error shown: Connecting failed: wrong key [REDACTED:key]');
    expect(prompt).toContain(`${REPO_URL}/blob/main/docs/vpn/README.md`);
    expect(prompt).toContain(`${REPO_URL}/blob/main/docs/vpn/protonvpn.md`);
    expect(prompt).toContain('EasyArr 0.0.17');
    expect(prompt).toContain('RAM 24 GB');
    expect(prompt).toContain('not answering: radarr');
    expect(prompt).toContain('Recent log lines');
    // VPN context: VPN + EasyArr logs only.
    expect(prompt).toMatch(/\nvpn 2026-11-01T10:0\d:00Z/);
    expect(prompt).not.toMatch(/\nsonarr 2026/);
    expect(prompt.endsWith(`What I was trying to do: ${AI_PROMPT_GOAL_PLACEHOLDER}`)).toBe(true);
    expectClean(prompt, 'prompt');
  });

  it('stays under the cap with the longest allowed question, trimming logs first', async () => {
    const many: LogView['lines'] = Array.from({ length: 400 }, (_, i) => ({
      time: `2026-11-01T10:${String(i % 60).padStart(2, '0')}:00Z`,
      level: 'error',
      message: `Something went wrong number ${i} ${'x'.repeat(250)}`,
    }));
    const svc = service({ log: async (source) => ({ source, available: true, lines: many }) });
    const { prompt, truncated } = await svc.aiPrompt({ area: 'dashboard' }, 'e'.repeat(5000));
    expect(truncated).toBe(true);
    const filled = fillAiPrompt(prompt, 'q'.repeat(AI_PROMPT_GOAL_MAX * 3));
    expect(filled.length).toBeLessThanOrEqual(AI_PROMPT_MAX_CHARS);
    expect(filled).toContain('q'.repeat(AI_PROMPT_GOAL_MAX));
    expect(filled).not.toContain('q'.repeat(AI_PROMPT_GOAL_MAX + 1));
    // The error text is cut too, and the structure survives.
    expect(prompt).toContain('[Question]');
  });

  it('redacts what the user types into the question', () => {
    const filled = fillAiPrompt(
      `x\nWhat I was trying to do: ${AI_PROMPT_GOAL_PLACEHOLDER}`,
      `my IP is ${S.homeIp}, mail ${S.email}`,
    );
    expect(filled).toBe(
      'x\nWhat I was trying to do: my IP is [REDACTED:ip], mail [REDACTED:email]',
    );
  });

  it('links only docs that exist', () => {
    const docsDir = path.resolve(__dirname, '../../../../docs');
    for (const ctx of [
      { area: 'general' as const },
      { area: 'backup' as const },
      { area: 'wizard' as const, step: 'system' as const },
      { area: 'wizard' as const, step: 'download' as const },
      { area: 'wizard' as const, step: 'usenet' as const },
      { area: 'wizard' as const, step: 'indexers' as const },
      { area: 'wizard' as const, step: 'library' as const },
    ]) {
      for (const d of docsFor(ctx, null)) {
        expect(existsSync(path.join(docsDir, `${d.slug}.md`)), d.slug).toBe(true);
      }
    }
    for (const provider of ['protonvpn', 'mullvad', 'pia', 'airvpn', 'custom', 'windscribe']) {
      for (const d of docsFor({ area: 'vpn' }, provider)) {
        expect(existsSync(path.join(docsDir, `${d.slug}.md`)), d.slug).toBe(true);
      }
    }
  });
});

describe('/api/diagnostics routes', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-diag-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('downloads the zip and returns the prompt; EasyArr’s own log is in both, redacted', async () => {
    const stateDir = path.join(dir, 'state');
    await stateStore(stateDir).save(finishedState());
    await secretsStore(stateDir).save(secrets());
    const logBuffer = new LogBuffer();
    const logger = createLogger('info', logBuffer);
    const app = await buildApp({
      config: {
        version: '1.2.3',
        webDir: dir,
        licensesDir: '/nonexistent',
        stateDir,
        dataDir: dir,
      },
      logger,
      logBuffer,
      collectSystemInfo: async () => ({
        arch: 'arm64',
        totalMemoryBytes: 8 * 1024 ** 3,
        disk: null,
        gpu: { kind: 'none', devices: [] },
      }),
    });
    // Loading the stores told the redactor about every stored value.
    await stateStore(stateDir).load();
    await secretsStore(stateDir).load();
    logger.warn(
      `wiring: Sonarr refused key ${S.sonarrKey} for ${S.username} at ${S.usenetHost}:563`,
    );

    const zipRes = await app.inject({ method: 'GET', url: '/api/diagnostics' });
    expect(zipRes.statusCode).toBe(200);
    expect(zipRes.headers['content-type']).toBe('application/zip');
    expect(zipRes.headers['cache-control']).toBe('no-store');
    expect(String(zipRes.headers['content-disposition'])).toMatch(
      /^attachment; filename="easyarr-diagnostics-\d{4}-\d{2}-\d{2}-\d{4}\.zip"$/,
    );
    const files = unzipSync(zipRes.rawPayload);
    const own = file(files, 'logs/easyarr.log');
    expect(own).toContain('wiring: Sonarr refused key [REDACTED:apikey] for [REDACTED:username]');
    for (const [file, bytes] of Object.entries(files)) expectClean(strFromU8(bytes), file);

    const p = await app.inject({
      method: 'GET',
      url: `/api/diagnostics/ai-prompt?context=finish&error=${encodeURIComponent(`HTTP 401 ${S.sonarrKey}`)}`,
    });
    expect(p.statusCode).toBe(200);
    const body = p.json<{ prompt: string; truncated: boolean }>();
    expect(body.prompt).toContain('Where: Setup wizard → Finish');
    expect(body.prompt).toContain('Error shown: HTTP 401 [REDACTED:apikey]');
    expect(body.prompt).toContain('CPU arm64');
    expect(body.prompt).toMatch(/easyarr .* WARN wiring: Sonarr refused key \[REDACTED:apikey\]/);
    expectClean(body.prompt, 'prompt');

    // Unknown contexts fall back to "general" instead of failing.
    const g = await app.inject({ method: 'GET', url: '/api/diagnostics/ai-prompt?context=nope:x' });
    expect(g.json<{ prompt: string }>().prompt).toContain('Where: EasyArr in general');
  });
});
