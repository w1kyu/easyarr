import {
  AI_PROMPT_ERROR_MAX,
  AI_PROMPT_GOAL_MAX,
  AI_PROMPT_GOAL_PLACEHOLDER,
  AI_PROMPT_MAX_CHARS,
  APP_NAME,
  docUrl,
  getVpnProvider,
  LLMS_TXT_URL,
  LOG_SOURCES,
  leaksSecret,
  parseWizardAnswers,
  redactText,
  redactValue,
  visibleWizardSteps,
  type AiPromptView,
  type HelpContext,
  type KnownValue,
  type LogLine,
  type LogSource,
  type LogView,
  type ServiceId,
  type StatusView,
  type SystemInfo,
} from '@easyarr/shared';
import { zipSync, strToU8 } from 'fflate';
import type { Secrets, State } from '../state/schema.js';
import { knownValues } from './known.js';

/**
 * Diagnostics bundle + "Get help with AI" prompt (SPEC §13, D-016, D-074).
 *
 * Everything that leaves EasyArr through here is redacted with the full list of values EasyArr
 * stores (knownValues) plus the redactor's patterns, and checked once more before it's handed out:
 * if a stored secret would still be in the output, the request fails instead (fail closed).
 */
export interface DiagnosticsDeps {
  version: string;
  /** Umbrel's APP_VERSION; null outside Umbrel. */
  appVersion: string | null;
  state(): Promise<State>;
  secrets(): Promise<Secrets>;
  systemInfo(): Promise<SystemInfo>;
  status(): Promise<StatusView>;
  log(source: LogSource): Promise<LogView>;
  now?: () => Date;
}

export interface DiagnosticsOptions {
  /** Also hide LAN addresses (10.x, 192.168.x, …). */
  privateIps?: boolean;
}

/** The summary in diagnostics.json: no secrets, no IPs, no media titles. */
export interface DiagnosticsReport {
  generatedAt: string;
  app: { name: string; version: string; appVersion: string | null; umbrelOs: string | null };
  system: {
    arch: string;
    memoryGb: number;
    disk: { freeGb: number; totalGb: number } | null;
    gpu: string;
  };
  wizard: { finished: boolean; done: string[]; open: string[] };
  setup: {
    downloadMethod: string | null;
    libraries: string[];
    quality: string | null;
    vpn: {
      mode: string | null;
      provider: string | null;
      protocol: string | null;
      portForwarding: boolean | null;
      freePlan: boolean | null;
      lastTest: { ok: boolean; code: string | null; homeIpHidden: boolean | null } | null;
    };
    usenet: { servers: number; indexers: number } | null;
    searchSites: string | null;
  };
  services: { id: ServiceId; state: string; version: string | null; used: boolean }[];
  vpn: {
    connection: string;
    wrapper: string | null;
    runningForSeconds: number | null;
    country: string | null;
    portForwarding: string;
    problem: string | null;
  };
  wiring: {
    lastRun: { at: string; mode: string; ok: boolean; changes: number } | null;
    resources: Record<string, number>;
    oneTimeSettings: number;
  };
  backups: { automatic: boolean; lastAuto: { at: string; ok: boolean } | null } | null;
  warnings: string[];
}

const GB = 1024 ** 3;
const round1 = (n: number) => Math.round(n * 10) / 10;

export class DiagnosticsService {
  constructor(private readonly deps: DiagnosticsDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async known(): Promise<KnownValue[]> {
    return knownValues(await this.deps.state(), await this.deps.secrets());
  }

  /** The structured summary, already redacted. */
  async report(opts: DiagnosticsOptions = {}): Promise<DiagnosticsReport> {
    const [state, info, status, known] = await Promise.all([
      this.deps.state(),
      this.deps.systemInfo().catch(() => null),
      this.deps.status().catch(() => null),
      this.known(),
    ]);
    const answers = parseWizardAnswers(state.wizard.answers);
    const visible = visibleWizardSteps(answers);
    const done = visible.filter((s) => state.wizard.completedSteps.includes(s));
    const libs = answers.library?.libraries;
    const resources: Record<string, number> = {};
    for (const e of state.wiring.ledger) resources[e.service] = (resources[e.service] ?? 0) + 1;
    const vpn = status?.vpn;
    const report: DiagnosticsReport = {
      generatedAt: this.now().toISOString(),
      app: {
        name: APP_NAME,
        version: this.deps.appVersion ?? this.deps.version,
        appVersion: this.deps.appVersion,
        // umbrelOS doesn't tell apps its version (and there's no Docker socket to ask, CLAUDE.md).
        umbrelOs: null,
      },
      system: info
        ? {
            arch: info.arch,
            memoryGb: round1(info.totalMemoryBytes / GB),
            disk: info.disk
              ? {
                  freeGb: round1(info.disk.freeBytes / GB),
                  totalGb: round1(info.disk.totalBytes / GB),
                }
              : null,
            gpu: info.gpu.kind,
          }
        : { arch: 'unknown', memoryGb: 0, disk: null, gpu: 'unknown' },
      wizard: {
        finished: state.wizard.completedSteps.includes('finish'),
        done,
        open: visible.filter((s) => !done.includes(s)),
      },
      setup: {
        downloadMethod: answers.download?.method ?? null,
        libraries: libs
          ? Object.entries(libs)
              .filter(([, on]) => on)
              .map(([k]) => k)
          : [],
        quality: answers.library?.quality ?? null,
        vpn: {
          mode: answers.vpn?.mode ?? null,
          provider: state.vpn?.provider ?? null,
          protocol: state.vpn?.protocol ?? null,
          portForwarding: state.vpn?.portForwarding ?? null,
          freePlan: state.vpn?.freePlan ?? null,
          lastTest: state.vpn?.lastTest
            ? {
                ok: state.vpn.lastTest.ok,
                code: state.vpn.lastTest.code,
                homeIpHidden: state.vpn.lastTest.homeIpHidden,
              }
            : null,
        },
        usenet: answers.usenet
          ? { servers: answers.usenet.servers.length, indexers: answers.usenet.indexers.length }
          : null,
        searchSites: answers.indexers?.mode ?? null,
      },
      services: (status?.services ?? []).map((s) => ({
        id: s.id,
        state: s.state,
        version: s.version,
        used: s.used,
      })),
      vpn: {
        connection: vpn?.connection ?? 'unknown',
        wrapper: vpn?.wrapper ?? null,
        runningForSeconds: vpn?.runningFor ?? null,
        country: vpn?.publicIp?.country ?? null,
        portForwarding: vpn?.portForwarding.state ?? 'off',
        problem: vpn?.problem?.code ?? null,
      },
      wiring: {
        lastRun: state.wiring.lastRun,
        resources,
        oneTimeSettings: state.wiring.applied.length,
      },
      backups: state.backups
        ? {
            automatic: state.backups.enabled,
            lastAuto: state.backups.lastAuto
              ? { at: state.backups.lastAuto.at, ok: state.backups.lastAuto.ok }
              : null,
          }
        : null,
      warnings: (status?.warnings ?? []).map((w) =>
        w.services?.length ? `${w.code} (${w.services.join(', ')})` : w.code,
      ),
    };
    return redactValue(report, { known, privateIps: opts.privateIps ?? false });
  }

  /** Every log source, redacted (the services' own logs come through their APIs). */
  async logs(opts: DiagnosticsOptions = {}): Promise<Map<LogSource, LogView>> {
    const known = await this.known();
    const out = new Map<LogSource, LogView>();
    await Promise.all(
      LOG_SOURCES.map(async (source) => {
        const view = await this.deps
          .log(source)
          .catch((): LogView => ({ source, available: false, lines: [] }));
        out.set(source, {
          ...view,
          lines: view.lines.map((l) => ({
            ...l,
            message: redactText(l.message, { known, privateIps: opts.privateIps ?? false }),
          })),
        });
      }),
    );
    return out;
  }

  /** The zip from SPEC §13: diagnostics.json, the AI prompt, one file per log. */
  async bundle(opts: DiagnosticsOptions = {}): Promise<{ name: string; zip: Uint8Array }> {
    const [report, logs, prompt, known] = await Promise.all([
      this.report(opts),
      this.logs(opts),
      this.aiPrompt({ area: 'general' }, undefined, opts),
      this.known(),
    ]);
    const files: Record<string, string> = {
      'README.txt': readme(),
      'diagnostics.json': `${JSON.stringify(report, null, 2)}\n`,
      'ai-prompt.txt': `${prompt.prompt}\n`,
    };
    for (const [source, view] of logs) {
      files[`logs/${source}.log`] = view.available
        ? view.lines.map(formatLine).join('\n') + '\n'
        : `(${source} didn't answer, so its log couldn't be read)\n`;
    }
    for (const [name, text] of Object.entries(files)) {
      if (leaksSecret(text, known)) throw new RedactionError(name);
    }
    const stamp = this.now().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const zip = zipSync(
      Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
      { level: 6, mtime: this.now() },
    );
    return { name: `easyarr-diagnostics-${stamp}.zip`, zip };
  }

  /**
   * The text the user pastes into an AI chat (SPEC §13 template). Log lines are added last and
   * trimmed first so the whole prompt, including the user's own words, stays under the cap.
   */
  async aiPrompt(
    context: HelpContext,
    error?: string,
    opts: DiagnosticsOptions = {},
  ): Promise<AiPromptView> {
    const [state, report, known] = await Promise.all([
      this.deps.state(),
      this.report(opts),
      this.known(),
    ]);
    const redact = (t: string) => redactText(t, { known, privateIps: opts.privateIps ?? false });
    const docs = docsFor(context, state.vpn?.provider ?? null);
    const errorText = error ? redact(error.trim().slice(0, AI_PROMPT_ERROR_MAX)) : null;

    const head = [
      '[Context]',
      `I use ${APP_NAME}, a free app for umbrelOS (a home server system). ${APP_NAME} bundles a media stack and connects it automatically: Jellyfin (watch), Jellyseerr (request movies and shows), Sonarr/Radarr/Lidarr (find TV, movies, music), Prowlarr (search sites), qBittorrent and/or SABnzbd (download), Bazarr (subtitles), plus helpers (Recyclarr, Unpackerr, Cleanuparr, FlareSolverr). Downloads run behind a VPN with a kill switch (Gluetun). A setup wizard and a dashboard handle the settings.`,
      `I am a beginner. Please answer step by step in plain words. Avoid terminal commands unless there is no other way: ${APP_NAME} is meant to be used from its dashboard only.`,
      `${APP_NAME} documentation for AI assistants: ${LLMS_TXT_URL}`,
      'Passwords, keys, usernames, IP addresses and server names below were replaced with [REDACTED:…] on purpose.',
      '',
      '[System]',
      systemLine(report),
      '',
      '[State]',
      ...stateLines(report),
      '',
      '[Problem]',
      `Where: ${whereText(context)}`,
      `Error shown: ${errorText ?? '(none, see the logs below)'}`,
    ];
    const tail = [
      '',
      '[Docs]',
      ...docs.map((d) => `- ${d.title}: ${docUrl(d.slug)}`),
      '',
      '[Question]',
      `What I was trying to do: ${AI_PROMPT_GOAL_PLACEHOLDER}`,
    ];

    const fixed = [...head, '', ...tail].join('\n');
    // Room for the logs: the cap minus everything else, minus what the user may still type.
    let budget = AI_PROMPT_MAX_CHARS - fixed.length - AI_PROMPT_GOAL_MAX - 64;
    const candidates = await this.promptLogLines(context, redact);
    const picked: string[] = [];
    let truncated = false;
    // Newest first, so trimming drops the oldest lines.
    for (const line of [...candidates].reverse()) {
      if (line.length + 1 > budget) {
        truncated = true;
        break;
      }
      picked.unshift(line);
      budget -= line.length + 1;
    }
    const logBlock =
      picked.length > 0
        ? ['Recent log lines (redacted, oldest first):', ...picked]
        : ['Recent log lines: none that look related.'];
    const prompt = [...head, ...logBlock, ...tail].join('\n');
    if (leaksSecret(prompt, known)) throw new RedactionError('ai-prompt');
    return { prompt, truncated };
  }

  /** ~50 relevant lines: warnings/errors from the sources that fit the context, plus the newest. */
  private async promptLogLines(
    context: HelpContext,
    redact: (t: string) => string,
  ): Promise<string[]> {
    const sources = sourcesFor(context);
    const views = await Promise.all(
      sources.map((s) =>
        this.deps.log(s).catch((): LogView => ({ source: s, available: false, lines: [] })),
      ),
    );
    const per = Math.max(10, Math.floor(60 / Math.max(1, views.length)));
    const out: { time: string; text: string }[] = [];
    for (const view of views) {
      if (!view.available) {
        out.push({ time: '', text: `${view.source}: (not answering, no log)` });
        continue;
      }
      const problems = view.lines.filter((l) => l.level === 'warn' || l.level === 'error');
      const chosen = (problems.length > 0 ? problems : view.lines).slice(-per);
      for (const l of chosen) {
        const msg = redact(l.message).replace(/\s+/g, ' ').slice(0, 300);
        out.push({
          time: l.time ?? '',
          text: `${view.source} ${l.time ?? ''} ${l.level.toUpperCase()} ${msg}`.replace(
            / +/g,
            ' ',
          ),
        });
      }
    }
    // Interleave by time so a reader sees cause and effect in order.
    return out.sort((a, b) => a.time.localeCompare(b.time)).map((l) => l.text);
  }
}

export class RedactionError extends Error {
  constructor(where: string) {
    super(`refusing to hand out ${where}: a stored secret survived redaction`);
    this.name = 'RedactionError';
  }
}

function formatLine(l: LogLine): string {
  return `${l.time ?? '-'} ${l.level.toUpperCase().padEnd(5)} ${l.message}`;
}

function readme(): string {
  return [
    `${APP_NAME} diagnostics`,
    '',
    'This zip helps someone (or an AI assistant) understand a problem with your setup.',
    'Passwords, API keys, VPN keys, usernames, e-mail addresses, your public IP address and the',
    'names of your Usenet/VPN servers and search sites were replaced with [REDACTED:…].',
    'Have a look at the files before you share them.',
    '',
    '- diagnostics.json: versions, hardware, setup choices, app health, VPN state (no IPs)',
    '- ai-prompt.txt: a ready-made question for an AI chat',
    '- logs/: the newest lines of each app’s log',
    '',
  ].join('\n');
}

function systemLine(r: DiagnosticsReport): string {
  const disk = r.system.disk
    ? `${r.system.disk.freeGb} GB free of ${r.system.disk.totalGb} GB`
    : 'unknown';
  return [
    `${APP_NAME} ${r.app.version}`,
    `umbrelOS ${r.app.umbrelOs ?? '(version not visible to apps)'}`,
    `CPU ${r.system.arch}`,
    `RAM ${r.system.memoryGb} GB`,
    `disk ${disk}`,
    `GPU ${r.system.gpu}`,
  ].join(' · ');
}

function stateLines(r: DiagnosticsReport): string[] {
  const s = r.setup;
  const down = r.services.filter((x) => x.used && x.state === 'down').map((x) => x.id);
  const starting = r.services.filter((x) => x.used && x.state === 'starting').map((x) => x.id);
  const vpn =
    s.vpn.mode === 'skipped'
      ? 'skipped by the user (downloads go out without a VPN)'
      : `${s.vpn.provider ?? 'not set up'}${s.vpn.protocol ? ` (${s.vpn.protocol})` : ''}, ${r.vpn.connection}` +
        (r.vpn.problem ? `, problem: ${r.vpn.problem}` : '') +
        (s.vpn.portForwarding ? `, port forwarding ${r.vpn.portForwarding}` : '');
  const lines = [
    `Setup wizard: ${r.wizard.finished ? 'finished' : `not finished (open steps: ${r.wizard.open.join(', ') || 'none'})`}`,
    `Download method: ${s.downloadMethod ?? 'not chosen'} · Libraries: ${s.libraries.join(', ') || 'none'} · Quality: ${s.quality ?? '-'}`,
    `VPN: ${vpn}`,
  ];
  if (s.usenet)
    lines.push(`Usenet: ${s.usenet.servers} server(s), ${s.usenet.indexers} indexer(s)`);
  if (s.searchSites) lines.push(`Torrent search sites: ${s.searchSites}`);
  lines.push(
    r.services.length === 0
      ? 'Apps: status unknown'
      : `Apps: ${down.length === 0 && starting.length === 0 ? 'all used apps answer' : ''}${down.length ? `not answering: ${down.join(', ')}` : ''}${starting.length ? `${down.length ? '; ' : ''}starting: ${starting.join(', ')}` : ''}`,
  );
  const versions = r.services.filter((x) => x.version).map((x) => `${x.id} ${x.version}`);
  if (versions.length) lines.push(`App versions: ${versions.join(', ')}`);
  const run = r.wiring.lastRun;
  lines.push(
    run
      ? `Last time ${APP_NAME} connected the apps: ${run.at} (${run.mode}), ${run.ok ? 'worked' : 'had problems'}, ${run.changes} change(s)`
      : `${APP_NAME} hasn't connected the apps yet`,
  );
  if (r.warnings.length) lines.push(`Warnings on the dashboard: ${r.warnings.join(', ')}`);
  return lines;
}

const STEP_NAMES: Record<string, string> = {
  welcome: 'Welcome',
  system: 'System check',
  account: 'Account',
  download: 'Download method',
  vpn: 'VPN',
  usenet: 'Usenet',
  indexers: 'Search sites (torrent indexers)',
  library: 'What do you want (libraries, languages, quality)',
  finish: 'Finish (connecting the apps)',
};

function whereText(c: HelpContext): string {
  if (c.step) return `Setup wizard → ${STEP_NAMES[c.step] ?? c.step} step`;
  return {
    general: `${APP_NAME} in general`,
    wizard: 'Setup wizard',
    finish: 'Setup wizard → Finish (connecting the apps)',
    dashboard: `${APP_NAME} dashboard`,
    vpn: 'VPN settings',
    settings: 'Settings',
    backup: 'Backups',
    restore: 'Restoring a backup',
  }[c.area];
}

function sourcesFor(c: HelpContext): LogSource[] {
  const key = c.step ?? c.area;
  switch (key) {
    case 'vpn':
      return ['vpn', 'easyarr'];
    case 'usenet':
      return ['sabnzbd', 'prowlarr', 'easyarr'];
    case 'indexers':
      return ['prowlarr', 'easyarr'];
    case 'download':
      return ['qbittorrent', 'sabnzbd', 'easyarr'];
    case 'backup':
    case 'restore':
    case 'settings':
    case 'welcome':
    case 'system':
    case 'account':
    case 'library':
      return ['easyarr'];
    default:
      // Finish, dashboard, general: everything that could be involved.
      return [...LOG_SOURCES];
  }
}

interface DocLink {
  slug: string;
  title: string;
}

/** Docs pages that match where the user was (they exist in docs/; checked by a test). */
export function docsFor(c: HelpContext, vpnProvider: string | null): DocLink[] {
  const help: DocLink = { slug: 'getting-help', title: 'Getting help' };
  const trouble: DocLink = { slug: 'troubleshooting', title: 'Troubleshooting' };
  const how: DocLink = { slug: 'how-it-works', title: 'How EasyArr works' };
  const vpn: DocLink[] = [{ slug: 'vpn/README', title: 'VPN basics' }];
  const guide = vpnProvider ? getVpnProvider(vpnProvider)?.tutorial : undefined;
  if (guide && guide !== 'vpn/README') {
    vpn.push({
      slug: guide,
      title: `VPN guide for ${getVpnProvider(vpnProvider ?? '')?.name ?? ''}`,
    });
  }
  const key = c.step ?? c.area;
  const byKey: Partial<Record<string, DocLink[]>> = {
    system: [{ slug: 'system-requirements', title: 'System requirements' }],
    vpn,
    download: [
      { slug: 'torrents-101', title: 'Torrents explained' },
      { slug: 'usenet-101', title: 'Usenet explained' },
    ],
    usenet: [{ slug: 'usenet-101', title: 'Usenet explained' }],
    indexers: [{ slug: 'indexers', title: 'Search sites (indexers)' }],
    library: [{ slug: 'quality-presets', title: 'Quality presets' }],
    backup: [{ slug: 'backup-restore', title: 'Backup & restore' }],
    restore: [{ slug: 'backup-restore', title: 'Backup & restore' }],
  };
  const specific = byKey[key] ?? [];
  return [...specific, trouble, how, help];
}
