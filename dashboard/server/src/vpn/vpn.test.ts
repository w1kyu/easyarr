import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type Services } from '../app.js';
import { secretsStore } from '../state/index.js';
import { Mutex } from '../state/mutex.js';
import { countHealthRestarts, diagnoseGluetunLog } from './errors.js';
import { VpnFiles } from './files.js';
import { GluetunClient } from './gluetun.js';
import { PortSync } from './port-sync.js';
import { VpnService } from './service.js';

const KEY = 'wOEI9rqqbDwnN8/Bpp22sVz48T71vJ4fYmFWujulwUU=';
const API_KEY = 'a'.repeat(32);

/** A tiny HTTP server with a swappable handler. */
async function fakeServer(
  handler: (req: IncomingMessage) => { status?: number; body: unknown },
): Promise<{ url: string; server: Server; requests: IncomingMessage[] }> {
  const requests: IncomingMessage[] = [];
  const server = createServer((req, res) => {
    requests.push(req);
    const { status = 200, body } = handler(req);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, server, requests };
}

let dir: string;
let vpnDir: string;
let gluetun: Awaited<ReturnType<typeof fakeServer>>;
let homeIp: Awaited<ReturnType<typeof fakeServer>>;
let gl: { status: string; ip: string; country: string; ports: number[] };
let home: string;
let nowMs: number;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-vpn-'));
  vpnDir = path.join(dir, 'vpn');
  await fs.mkdir(path.join(vpnDir, 'easyarr', 'custom'), { recursive: true });
  const secrets = secretsStore(dir);
  const { value } = await secrets.load();
  await secrets.save({ ...value, apiKeys: { gluetun: API_KEY } });
  gl = { status: 'running', ip: '185.159.157.10', country: 'Netherlands', ports: [] };
  home = '203.0.113.50';
  nowMs = Date.parse('2026-10-31T12:00:00Z');
  gluetun = await fakeServer((req) => {
    if (req.headers['x-api-key'] !== API_KEY) return { status: 401, body: 'Unauthorized' };
    if (req.url === '/v1/vpn/status') return { body: { status: gl.status } };
    if (req.url === '/v1/publicip/ip') return { body: { public_ip: gl.ip, country: gl.country } };
    if (req.url === '/v1/portforward') return { body: { port: gl.ports[0] ?? 0, ports: gl.ports } };
    return { status: 404, body: {} };
  });
  homeIp = await fakeServer(() => ({ body: { ip: home } }));
});
afterEach(async () => {
  gluetun.server.close();
  homeIp.server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

function services(
  over: { connectTimeoutSec?: number; resolve?: (h: string) => Promise<string> } = {},
) {
  const lock = new Mutex();
  const vpn = new VpnService({
    stateDir: dir,
    files: new VpnFiles(vpnDir),
    gluetun: new GluetunClient({ baseUrl: gluetun.url, apiKey: async () => API_KEY }),
    lock,
    homeIpUrls: [homeIp.url],
    now: () => new Date(nowMs),
    testWaitMs: 50,
    pollMs: 10,
    ...over,
  });
  const portSync = new PortSync(async () => null, {
    listenPort: async () => 0,
    setListenPort: async () => undefined,
  });
  return { lock, vpn, portSync } satisfies Services;
}

async function make(svc: Services = services()) {
  return buildApp({
    config: { version: 't', webDir: dir, licensesDir: dir, stateDir: dir, dataDir: dir, vpnDir },
    collectSystemInfo: async () => ({
      arch: 'x64',
      totalMemoryBytes: 16 * 1024 ** 3,
      disk: { freeBytes: 1e12, totalBytes: 2e12 },
      gpu: { kind: 'none', devices: [] },
    }),
    services: svc,
  });
}
type App = Awaited<ReturnType<typeof make>>;
const postJson = (app: App, url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, payload: payload as object });
const get = async (app: App, url: string) => (await app.inject({ method: 'GET', url })).json();
const vpnFile = (name: string) => fs.readFile(path.join(vpnDir, 'easyarr', name), 'utf8');
const writeWrapperStatus = (state: string, sinceMs = nowMs, extra = {}) =>
  fs.writeFile(
    path.join(vpnDir, 'easyarr', 'status.json'),
    JSON.stringify({
      state,
      since: Math.floor(sinceMs / 1000),
      pid: 7,
      exitCode: null,
      restarts: 0,
      retryAt: null,
      configFingerprint: 'x',
      ...extra,
    }),
  );
const proton = (over = {}) => ({
  provider: 'protonvpn',
  protocol: 'wireguard',
  fields: { wgPrivateKey: KEY },
  ...over,
});

describe('VPN settings API', () => {
  it('starts unconfigured', async () => {
    const app = await make();
    expect(await get(app, '/api/vpn/config')).toEqual({ config: null });
    expect(await get(app, '/api/vpn/status')).toMatchObject({
      connection: 'not_configured',
      provider: null,
    });
  });

  it('validates with i18n keys and writes nothing on errors', async () => {
    const app = await make();
    const res = await postJson(app, '/api/vpn/config', proton({ fields: { wgPrivateKey: 'x' } }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'invalid',
      issues: [{ path: 'fields.wgPrivateKey', message: 'vpn.error.wgKey' }],
    });
    await expect(vpnFile('vpn.env')).rejects.toThrow();
  });

  it('writes vpn.env (mode 600) for the wrapper; keeps the key out of state.json and responses', async () => {
    const app = await make();
    const res = await postJson(
      app,
      '/api/vpn/config',
      proton({ portForwarding: true, locations: ['Netherlands'] }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(KEY);
    expect(res.json().config).toMatchObject({
      provider: 'protonvpn',
      savedSecrets: ['wgPrivateKey'],
      fields: {},
      portForwarding: true,
    });
    expect(await vpnFile('vpn.env')).toBe(
      `VPN_SERVICE_PROVIDER=protonvpn\nVPN_TYPE=wireguard\nWIREGUARD_PRIVATE_KEY=${KEY}\nSERVER_COUNTRIES=Netherlands\nVPN_PORT_FORWARDING=on\n`,
    );
    expect((await fs.stat(path.join(vpnDir, 'easyarr', 'vpn.env'))).mode & 0o777).toBe(0o600);
    const state = await fs.readFile(path.join(dir, 'state.json'), 'utf8');
    expect(state).not.toContain(KEY);
    const secrets = JSON.parse(await fs.readFile(path.join(dir, 'secrets.json'), 'utf8'));
    expect(secrets.vpn).toEqual({ fields: { wgPrivateKey: KEY } });
    expect((await get(app, '/api/vpn/config')).config.savedSecrets).toEqual(['wgPrivateKey']);
  });

  it('keeps a saved key when the field is left empty; a new provider needs its own', async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton());
    const again = await postJson(
      app,
      '/api/vpn/config',
      proton({ fields: { wgPrivateKey: '' }, locations: ['Switzerland'] }),
    );
    expect(again.statusCode).toBe(200);
    expect(await vpnFile('vpn.env')).toContain(`WIREGUARD_PRIVATE_KEY=${KEY}`);
    expect(await vpnFile('vpn.env')).toContain('SERVER_COUNTRIES=Switzerland');
    const other = await postJson(app, '/api/vpn/config', {
      provider: 'mullvad',
      protocol: 'wireguard',
      fields: { wgAddresses: '10.64.1.2/32' },
    });
    expect(other.json().issues).toEqual([
      { path: 'fields.wgPrivateKey', message: 'vpn.error.required' },
    ]);
  });

  it('custom WireGuard: resolves a hostname endpoint; custom OpenVPN: saves the file (600)', async () => {
    const app = await make(services({ resolve: async () => '198.51.100.4' }));
    const conf = `[Interface]\nPrivateKey = ${KEY}\nAddress = 10.13.13.2/32\n[Peer]\nPublicKey = ${KEY}\nEndpoint = vpn.example.org:51820\n`;
    const res = await postJson(app, '/api/vpn/config', {
      provider: 'custom',
      protocol: 'wireguard',
      fields: { wgConfig: conf },
    });
    expect(res.statusCode).toBe(200);
    expect(await vpnFile('vpn.env')).toContain('VPN_ENDPOINT_IP=198.51.100.4');

    const failing = await make(
      services({
        resolve: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    );
    const bad = await postJson(failing, '/api/vpn/config', {
      provider: 'custom',
      protocol: 'wireguard',
      fields: { wgConfig: conf },
    });
    expect(bad.json().issues).toEqual([
      { path: 'fields.wgConfig', message: 'vpn.error.endpointResolve' },
    ]);

    await postJson(app, '/api/vpn/config', {
      provider: 'custom',
      protocol: 'openvpn',
      fields: { ovpnConfig: 'client\nremote 198.51.100.9 1194\n' },
    });
    expect(await vpnFile('custom/client.ovpn')).toContain('remote 198.51.100.9');
    expect((await fs.stat(path.join(vpnDir, 'easyarr/custom/client.ovpn'))).mode & 0o777).toBe(
      0o600,
    );
    expect(await vpnFile('vpn.env')).toContain(
      'OPENVPN_CUSTOM_CONFIG=/gluetun/easyarr/custom/client.ovpn',
    );
    // Switching away removes the file with its secrets.
    await postJson(app, '/api/vpn/config', proton());
    await expect(vpnFile('custom/client.ovpn')).rejects.toThrow();
  });

  it('reconnect asks the wrapper to reload', async () => {
    const app = await make();
    expect((await postJson(app, '/api/vpn/reconnect')).statusCode).toBe(409);
    await postJson(app, '/api/vpn/config', proton());
    expect((await postJson(app, '/api/vpn/reconnect')).statusCode).toBe(200);
    expect(await vpnFile('reload')).toMatch(/^\d+\n$/);
  });
});

describe('VPN status', () => {
  it('no wrapper status → the vpn container is missing', async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton());
    expect(await get(app, '/api/vpn/status')).toMatchObject({
      connection: 'unknown',
      problem: { code: 'vpnContainer' },
    });
  });

  it('connecting until Gluetun reports a running tunnel with a public IP', async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton({ portForwarding: true }));
    // Gluetun from before the save is still running → reload pending.
    await writeWrapperStatus('running', nowMs - 60_000);
    expect((await get(app, '/api/vpn/status')).connection).toBe('connecting');
    await writeWrapperStatus('running', nowMs);
    gl.status = 'starting';
    expect((await get(app, '/api/vpn/status')).connection).toBe('connecting');
    gl.status = 'running';
    expect(await get(app, '/api/vpn/status')).toMatchObject({
      connection: 'connected',
      wrapper: 'running',
      publicIp: { ip: '185.159.157.10', country: 'Netherlands' },
      portForwarding: { mode: 'auto', port: null, state: 'waiting' },
    });
    gl.ports = [51413];
    expect((await get(app, '/api/vpn/status')).portForwarding).toEqual({
      mode: 'auto',
      port: 51413,
      state: 'active',
    });
    expect(gluetun.requests.every((r) => r.headers['x-api-key'] === API_KEY)).toBe(true);
  });

  it("explains a crash from Gluetun's log", async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton());
    await writeWrapperStatus('crashed', nowMs, { exitCode: 1 });
    await fs.writeFile(
      path.join(vpnDir, 'easyarr', 'gluetun.log'),
      '2026-10-31T12:00:00Z INFO [routing] default route found\n2026-10-31T12:00:01Z ERROR VPN settings: provider settings: wireguard settings: private key is not valid: wgtypes: incorrect key size: 31\n',
    );
    expect(await get(app, '/api/vpn/status')).toMatchObject({
      connection: 'error',
      problem: { code: 'wrongKey', line: expect.stringContaining('private key is not valid') },
    });
  });

  it('gives up waiting after the timeout (handshake never completes)', async () => {
    const app = await make(services({ connectTimeoutSec: 90 }));
    await postJson(app, '/api/vpn/config', proton());
    await writeWrapperStatus('running', nowMs);
    gl.status = 'starting';
    await fs.writeFile(
      path.join(vpnDir, 'easyarr', 'gluetun.log'),
      '2026-10-31T12:00:30Z WARN [vpn] restarting VPN because it failed to pass the healthcheck: startup check: all check tries failed\n',
    );
    expect((await get(app, '/api/vpn/status')).connection).toBe('connecting');
    nowMs += 120_000;
    expect(await get(app, '/api/vpn/status')).toMatchObject({
      connection: 'error',
      problem: { code: 'unreachable' },
    });
  });
});

describe('VPN test + wizard step 5', () => {
  async function wizardToVpnStep(app: App) {
    for (const [step, body] of [
      ['welcome', { started: true }],
      ['system', { acknowledgedProblems: false }],
      ['account', { username: 'kevin', password: 'summer-rain7' }],
      ['download', { method: 'torrents' }],
    ] as const) {
      expect((await postJson(app, `/api/wizard/${step}`, body)).statusCode).toBe(200);
    }
  }

  it('passes when connected and the VPN IP differs from the home IP; unlocks "configured"', async () => {
    const app = await make();
    await wizardToVpnStep(app);
    await postJson(app, '/api/vpn/config', proton());
    await writeWrapperStatus('running', nowMs);
    const res = await postJson(app, '/api/vpn/test');
    expect(res.json()).toMatchObject({
      ok: true,
      code: null,
      publicIp: '185.159.157.10',
      country: 'Netherlands',
      homeIpHidden: true,
    });
    expect((await get(app, '/api/vpn/config')).config.lastTest).toMatchObject({ ok: true });
    expect((await postJson(app, '/api/wizard/vpn', { mode: 'configured' })).statusCode).toBe(200);
    // Changing the settings needs a new test.
    await postJson(app, '/api/vpn/config', proton({ locations: ['Switzerland'] }));
    expect((await postJson(app, '/api/wizard/vpn', { mode: 'configured' })).statusCode).toBe(400);
  });

  it('fails loudly when the "VPN" shows the home IP', async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton());
    await writeWrapperStatus('running', nowMs);
    home = gl.ip;
    expect((await postJson(app, '/api/vpn/test')).json()).toMatchObject({
      ok: false,
      code: 'homeIpVisible',
      homeIpHidden: false,
    });
  });

  it('home IP unknown → still ok, marked as not checked', async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton());
    await writeWrapperStatus('running', nowMs);
    home = 'not an ip';
    expect((await postJson(app, '/api/vpn/test')).json()).toMatchObject({
      ok: true,
      homeIpHidden: null,
    });
  });

  it('reports the problem when not connected', async () => {
    const app = await make();
    await postJson(app, '/api/vpn/config', proton());
    await writeWrapperStatus('crashed', nowMs);
    await fs.writeFile(
      path.join(vpnDir, 'easyarr', 'gluetun.log'),
      '2026-10-31 ERROR [openvpn] AUTH: Received control message: AUTH_FAILED\n',
    );
    expect((await postJson(app, '/api/vpn/test')).json()).toMatchObject({
      ok: false,
      code: 'authFailed',
      problemLine: expect.stringContaining('AUTH_FAILED'),
    });
  });
});

describe('API access (D-041)', () => {
  it('refuses other apps on the Docker network; health stays open', async () => {
    const app = await make();
    for (const url of ['/api/vpn/status', '/api/wizard', '/api/system-check']) {
      const res = await app.inject({ method: 'GET', url, remoteAddress: '10.21.0.7' });
      expect(res.statusCode, url).toBe(403);
    }
    const post = await app.inject({
      method: 'POST',
      url: '/api/vpn/config',
      remoteAddress: '10.21.0.7',
      payload: proton(),
    });
    expect(post.statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/api/health', remoteAddress: '10.21.0.7' }))
        .statusCode,
    ).toBe(200);
    // Forged X-Forwarded-For doesn't help.
    const forged = await app.inject({
      method: 'GET',
      url: '/api/wizard',
      remoteAddress: '10.21.0.7',
      headers: { 'x-forwarded-for': '127.0.0.1' },
    });
    expect(forged.statusCode).toBe(403);
  });

  it("allows Umbrel's gateway when configured", async () => {
    const app = await buildApp({
      config: {
        version: 't',
        webDir: dir,
        licensesDir: dir,
        stateDir: dir,
        dataDir: dir,
        vpnDir,
        trustedClients: ['127.0.0.1', '10.21.0.1'],
      },
      services: services(),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/vpn/status',
      remoteAddress: '::ffff:10.21.0.1',
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('port forwarding sync', () => {
  const qbit = (port: number, fail = false) => {
    const calls: number[] = [];
    return {
      calls,
      client: {
        listenPort: async () => {
          if (fail) throw new Error('down');
          return port;
        },
        setListenPort: async (p: number) => void calls.push(p),
      },
    };
  };

  it('sets qBittorrent to the forwarded port only when it differs', async () => {
    const q = qbit(6881);
    expect(await new PortSync(async () => 51413, q.client).runOnce()).toBe('updated');
    expect(q.calls).toEqual([51413]);
    const same = qbit(51413);
    expect(await new PortSync(async () => 51413, same.client).runOnce()).toBe('unchanged');
    expect(same.calls).toEqual([]);
  });

  it('does nothing without a forwarded port and survives qBittorrent being down', async () => {
    const q = qbit(6881);
    expect(await new PortSync(async () => null, q.client).runOnce()).toBe('skipped');
    expect(await new PortSync(async () => 51413, qbit(0, true).client).runOnce()).toBe('failed');
  });

  it('uses the forwarded port from Gluetun via the VPN service', async () => {
    const svc = services();
    const app = await make(svc);
    await postJson(app, '/api/vpn/config', proton({ portForwarding: true }));
    await writeWrapperStatus('running', nowMs);
    gl.ports = [40000];
    expect(await svc.vpn.desiredListenPort()).toBe(40000);
    gl.status = 'stopped';
    expect(await svc.vpn.desiredListenPort()).toBeNull();
  });

  it('talks to the real qBittorrent API shape', async () => {
    const { QbittorrentClient } = await import('./port-sync.js');
    let posted = '';
    const q = await fakeServer((req) => {
      if (req.url === '/api/v2/app/preferences') return { body: { listen_port: 6881 } };
      return { body: '' };
    });
    q.server.on('request', (req: IncomingMessage) => {
      if (req.method === 'POST') {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => (posted = data));
      }
    });
    const client = new QbittorrentClient(q.url);
    expect(await client.listenPort()).toBe(6881);
    await client.setListenPort(40000);
    await new Promise((r) => setTimeout(r, 20));
    expect(decodeURIComponent(posted.replace(/^json=/, ''))).toBe(
      JSON.stringify({ listen_port: 40000, random_port: false, upnp: false }),
    );
    q.server.close();
  });
});

describe('Gluetun log diagnosis', () => {
  it('maps known messages to plain-language codes', () => {
    const cases: [string, string][] = [
      ['ERROR VPN settings: ... private key is not valid', 'wrongKey'],
      ['ERROR [openvpn] AUTH: Received control message: AUTH_FAILED', 'authFailed'],
      ['ERROR VPN settings: no server found: for VPN wireguard; country atlantis', 'noServer'],
      [
        'ERROR [openvpn] OpenSSL: error:0A000086:SSL routines::certificate verify failed',
        'certificate',
      ],
      [
        'WARN [vpn] restarting VPN because it failed to pass the healthcheck: startup check',
        'unreachable',
      ],
      ['ERROR creating tun device: open /dev/net/tun: no such file or directory', 'system'],
      ['ERROR VPN settings: OpenVPN user is empty', 'invalidSettings'],
      ['ERROR something entirely new', 'unknown'],
    ];
    for (const [line, code] of cases) {
      expect(diagnoseGluetunLog(['INFO starting', line])?.code, line).toBe(code);
    }
    expect(
      diagnoseGluetunLog(['INFO all good', 'INFO [ip getter] Public IP address is 1.2.3.4']),
    ).toBeNull();
  });

  it('the newest problem wins; health restarts are counted', () => {
    const lines = [
      'WARN [vpn] restarting VPN because it failed to pass the healthcheck: x',
      'ERROR [openvpn] AUTH_FAILED',
      'WARN [vpn] restarting VPN because it failed to pass the healthcheck: y',
    ];
    expect(diagnoseGluetunLog(lines)?.code).toBe('unreachable');
    expect(countHealthRestarts(lines)).toBe(2);
  });
});
