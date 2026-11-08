import { lookup } from 'node:dns/promises';
import {
  APP_ID,
  compareVersions,
  DISK_WARNING_FREE_SHARE,
  GITHUB_OWNER,
  parseWizardAnswers,
  SERVICES,
  type DownloadItem,
  type LogSource,
  type LogView,
  type ServiceId,
  type ServiceStatus,
  type StatusView,
  type StatusWarning,
  type VpnStatusView,
} from '@easyarr/shared';
import { redactString } from '../redact.js';
import type { IndexerHealth } from './indexer-health.js';
import type { Secrets, State } from '../state/index.js';
import {
  jellyfinImage,
  jellyfinRecent,
  parseGluetunLog,
  probeService,
  qbittorrentQueue,
  sabnzbdQueue,
  serviceLog,
  type Probe,
  type ProbeDeps,
} from './collect.js';

export interface StatusServiceOptions extends ProbeDeps {
  version: string;
  /** Umbrel's APP_VERSION (the installed app version); null outside Umbrel. */
  appVersion: string | null;
  state(): Promise<State>;
  secrets(): Promise<Secrets>;
  vpn(): Promise<VpnStatusView>;
  disk(): Promise<{ freeBytes: number; totalBytes: number } | null>;
  /** Last lines of Gluetun's log. */
  vpnLog(): Promise<string[]>;
  /** The store's manifest for the update check; null = unknown. */
  latestVersion?: () => Promise<string | null>;
  /** Is the official Umbrel Jellyfin app installed too? */
  officialJellyfin?: () => Promise<boolean>;
  /** The search-site check's last result (IndexerHealer). */
  indexerHealth?: () => IndexerHealth | null;
  now?: () => number;
}

/** The store manifest says which version Umbrel would update to (there are no GitHub releases). */
export const STORE_MANIFEST_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/umbrel-app-store/master/${APP_ID}/umbrel-app.yml`;

export async function fetchStoreVersion(f: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await f(STORE_MANIFEST_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const m = /^version:\s*['"]?([0-9][^'"\s]*)['"]?\s*$/m.exec(await res.text());
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The official Jellyfin app's container (umbrel-apps/jellyfin: APP_HOST jellyfin_server_1). */
export async function officialJellyfinInstalled(): Promise<boolean> {
  try {
    await lookup('jellyfin_server_1');
    return true;
  } catch {
    return false;
  }
}

/** A value cached for `ttlMs`; concurrent callers share one fetch. */
class Cached<T> {
  private value: { at: number; v: T } | null = null;
  private pending: Promise<T> | null = null;
  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
    private readonly now: () => number,
  ) {}
  async get(): Promise<T> {
    if (this.value && this.now() - this.value.at < this.ttlMs) return this.value.v;
    this.pending ??= this.load().then(
      (v) => {
        this.value = { at: this.now(), v };
        this.pending = null;
        return v;
      },
      (err: unknown) => {
        this.pending = null;
        throw err;
      },
    );
    return this.pending;
  }
}

/** Which services the user's setup needs; unused ones are shown but never warn. */
export function usedServices(state: State): Set<ServiceId> {
  const answers = parseWizardAnswers(state.wizard.answers);
  const method = answers.download?.method ?? 'torrents';
  const libs = answers.library?.libraries ?? { movies: true, tv: true, music: true };
  const used = new Set<ServiceId>(['jellyfin', 'jellyseerr', 'prowlarr', 'recyclarr', 'bazarr']);
  if (method !== 'usenet') used.add('qbittorrent').add('flaresolverr');
  if (method !== 'torrents') used.add('sabnzbd');
  used.add('unpackerr').add('cleanuparr');
  if (libs.tv) used.add('sonarr');
  if (libs.movies) used.add('radarr');
  if (libs.music) used.add('lidarr');
  return used;
}

/** Every secret value EasyArr knows, for masking inside log text. */
export function secretValues(s: Secrets): string[] {
  return [
    ...Object.values(s.apiKeys),
    ...(s.account ? [s.account.password] : []),
    ...Object.values(s.vpn?.fields ?? {}),
    ...Object.values(s.usenet?.servers ?? {}),
    ...Object.values(s.usenet?.indexers ?? {}),
  ];
}

/**
 * GET /api/status (SPEC §12): one poll for the whole home screen. Service health is cached a few
 * seconds (the page polls every 5 s and several tabs may be open); versions and the update check
 * change rarely and are cached much longer.
 */
export class StatusService {
  private readonly now: () => number;
  private readonly probes: Cached<Record<string, Probe>>;
  private readonly versions = new Map<ServiceId, string>();
  private readonly latest: Cached<string | null>;
  private readonly official: Cached<boolean>;
  private readonly recent: Cached<StatusView['recent']>;

  constructor(private readonly opts: StatusServiceOptions) {
    this.now = opts.now ?? Date.now;
    this.probes = new Cached(4_000, () => this.probeAll(), this.now);
    this.latest = new Cached(6 * 3600_000, opts.latestVersion ?? (async () => null), this.now);
    this.official = new Cached(10 * 60_000, opts.officialJellyfin ?? (async () => false), this.now);
    this.recent = new Cached(60_000, () => jellyfinRecent(opts), this.now);
  }

  private async probeAll(): Promise<Record<string, Probe>> {
    const entries = await Promise.all(
      SERVICES.map(async (s) => [s.id, await probeService(s.id, this.opts)] as const),
    );
    return Object.fromEntries(entries);
  }

  async view(): Promise<StatusView> {
    const [state, probes, vpn, disk, qbit, sab, recent, latest, official] = await Promise.all([
      this.opts.state(),
      this.probes.get(),
      this.opts.vpn(),
      this.opts.disk(),
      qbittorrentQueue(this.opts),
      sabnzbdQueue(this.opts),
      this.recent.get().catch(() => null),
      this.latest.get().catch(() => null),
      this.official.get().catch(() => false),
    ]);
    const used = usedServices(state);
    const services: ServiceStatus[] = SERVICES.map((s) => {
      const p = probes[s.id] ?? { state: 'down' as const, version: null };
      // Keep the last known version while a service restarts.
      if (p.version) this.versions.set(s.id, p.version);
      return {
        id: s.id,
        state: p.state,
        version: p.version ?? this.versions.get(s.id) ?? null,
        used: used.has(s.id),
      };
    });
    const items: DownloadItem[] = [...(qbit ?? []), ...(sab ?? [])];
    const warnings = this.warnings(state, services, vpn, disk, latest, official);
    return {
      at: new Date(this.now()).toISOString(),
      version: this.opts.appVersion ?? this.opts.version,
      mode: state.ui.mode,
      services,
      vpn,
      downloads: {
        items,
        speedBps: items.reduce((n, i) => n + i.speedBps, 0),
        reachable: { qbittorrent: qbit !== null, sabnzbd: sab !== null },
      },
      disk,
      recent,
      warnings,
    };
  }

  private warnings(
    state: State,
    services: ServiceStatus[],
    vpn: VpnStatusView,
    disk: StatusView['disk'],
    latest: string | null,
    official: boolean,
  ): StatusWarning[] {
    const out: StatusWarning[] = [];
    const vpnSkipped = parseWizardAnswers(state.wizard.answers).vpn?.mode === 'skipped';
    if (vpn.connection === 'not_configured') {
      if (!vpnSkipped) out.push({ code: 'vpnNotConfigured' });
    } else if (vpn.connection === 'error') {
      out.push({ code: 'vpnDown' });
    }
    if (disk && disk.totalBytes > 0 && disk.freeBytes / disk.totalBytes < DISK_WARNING_FREE_SHARE) {
      out.push({
        code: 'diskLow',
        freePercent: Math.floor((disk.freeBytes / disk.totalBytes) * 100),
      });
    }
    // Behind the VPN everything is "down" while the VPN is down; one warning is enough then.
    const vpnBlocked = vpn.connection === 'error' || vpn.connection === 'connecting';
    const down = services
      .filter((s) => s.used && s.state === 'down')
      .filter((s) => !(vpnBlocked && SERVICES.find((x) => x.id === s.id)?.network === 'vpn'))
      .map((s) => s.id);
    if (down.length > 0) out.push({ code: 'serviceDown', services: down });
    // Every search site paused: nothing new can be found. Not while the VPN is down (that warning
    // already says it) or Prowlarr itself is down.
    const sites = this.opts.indexerHealth?.() ?? null;
    if (
      sites &&
      sites.total > 0 &&
      sites.blocked === sites.total &&
      !vpnBlocked &&
      !down.includes('prowlarr')
    ) {
      out.push({ code: 'indexersDown' });
    }
    if (official) out.push({ code: 'officialJellyfin' });
    if (state.wiring.lastRun && !state.wiring.lastRun.ok) out.push({ code: 'wiringProblems' });
    const installed = this.opts.appVersion;
    if (installed && latest && compareVersions(latest, installed) > 0) {
      out.push({ code: 'updateAvailable', version: latest });
    }
    return out;
  }

  async image(id: string) {
    return jellyfinImage(this.opts, id);
  }

  /** Redacted log lines for the advanced mode's log viewer. */
  async log(source: LogSource): Promise<LogView> {
    const secrets = secretValues(await this.opts.secrets());
    let lines =
      source === 'vpn'
        ? parseGluetunLog(
            (await this.opts.vpnLog())
              // The dashboard's own status checks every 30 s would bury everything else.
              .filter((l) => !/\[http server\] \d{3} GET \/v1\//.test(l))
              .join('\n'),
          )
        : await serviceLog(source, this.opts);
    const available = lines !== null;
    lines ??= [];
    return {
      source,
      available,
      lines: lines.map((l) => ({ ...l, message: redactString(l.message, secrets) })),
    };
  }
}
