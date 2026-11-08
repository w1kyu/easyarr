import type { ServiceId } from '@easyarr/shared';
import type { Logger } from 'pino';
import type { ProbeDeps } from './collect.js';

/** The Servarr apps whose indexers can be "backed off" (API base incl. URL base). */
const APPS = {
  prowlarr: '/apps/prowlarr/api/v1',
  sonarr: '/apps/sonarr/api/v3',
  radarr: '/apps/radarr/api/v3',
  lidarr: '/apps/lidarr/api/v1',
} as const satisfies Partial<Record<ServiceId, string>>;
type App = keyof typeof APPS;

/** Prowlarr's search sites as of the last check; null = not checked yet / Prowlarr unreachable. */
export interface IndexerHealth {
  at: string;
  /** Enabled search sites in Prowlarr. */
  total: number;
  /** Of those, still paused after the last check. */
  blocked: number;
}

export interface IndexerHealerDeps extends ProbeDeps {
  /** False while the VPN is down or connecting: tests would only fail and lengthen the pause. */
  canReach(): Promise<boolean>;
  /** Which of Sonarr/Radarr/Lidarr the setup uses. */
  used(): Promise<Set<ServiceId>>;
  log?: Pick<Logger, 'info' | 'warn'>;
  now?: () => number;
}

export type HealResult = 'skipped' | 'checked' | 'failed';

/**
 * After a failed search, Prowlarr and Sonarr/Radarr/Lidarr pause ("back off") an indexer for up to
 * 24 h, and Prowlarr answers the apps with 429 meanwhile, so a short outage (VPN server, DNS,
 * Cloudflare) stops all new downloads for hours. A successful indexer test clears the pause right
 * away (`IndexerFactory.Test` → `RecordSuccess`); a failed one raises it by at most one level. So
 * every few minutes EasyArr tests the paused ones: Prowlarr's first, then the apps' (their indexers
 * point at Prowlarr, so testing them is pointless while all of Prowlarr's are still paused).
 */
export class IndexerHealer {
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private first: NodeJS.Timeout | undefined;
  private health: IndexerHealth | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: IndexerHealerDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** The last check's result for the home screen's warning. */
  last(): IndexerHealth | null {
    return this.health;
  }

  async runOnce(): Promise<HealResult> {
    if (this.running) return 'skipped';
    this.running = true;
    try {
      if (!(await this.deps.canReach())) return 'skipped';
      const keys = await this.deps.keys();
      const prowlarr = await this.heal('prowlarr', keys);
      this.health = {
        at: new Date(this.now()).toISOString(),
        total: prowlarr.total,
        blocked: prowlarr.blocked,
      };
      if (prowlarr.total > 0 && prowlarr.blocked === prowlarr.total) return 'checked';
      const used = await this.deps.used();
      for (const app of ['sonarr', 'radarr', 'lidarr'] as const) {
        if (used.has(app)) await this.heal(app, keys);
      }
      return 'checked';
    } catch (err) {
      this.health = null;
      this.deps.log?.warn({ err: (err as Error).message }, 'search site check failed');
      return 'failed';
    } finally {
      this.running = false;
    }
  }

  /** Tests every enabled, paused indexer of one app; returns what's still paused afterwards. */
  private async heal(app: App, keys: Record<string, string>) {
    const base = `${this.deps.url(app)}${APPS[app]}`;
    const key = keys[app] ?? '';
    const [indexers, statuses] = await Promise.all([
      this.call<Indexer[]>('GET', `${base}/indexer`, key),
      this.call<IndexerStatus[]>('GET', `${base}/indexerstatus`, key),
    ]);
    const now = this.now();
    const paused = new Set(
      statuses
        .filter((s) => s.disabledTill && Date.parse(s.disabledTill) > now)
        .map((s) => s.indexerId),
    );
    const enabled = indexers.filter((i) => isEnabled(app, i));
    let blocked = 0;
    const healed: string[] = [];
    for (const indexer of enabled.filter((i) => paused.has(i.id))) {
      const ok = await this.call('POST', `${base}/indexer/test`, key, indexer).then(
        () => true,
        () => false,
      );
      if (ok) healed.push(String(indexer.name ?? indexer.id));
      else blocked++;
    }
    if (healed.length > 0) {
      this.deps.log?.info({ app, indexers: healed }, 'paused search sites work again, resumed');
    }
    return { total: enabled.length, blocked };
  }

  private async call<T>(method: string, url: string, key: string, body?: unknown): Promise<T> {
    const f = this.deps.fetch ?? fetch;
    const res = await f(url, {
      method,
      headers: {
        'x-api-key': key,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // A test runs a real search through the VPN; give slow sites (Cloudflare) time.
      signal: AbortSignal.timeout(method === 'POST' ? 60_000 : (this.deps.timeoutMs ?? 8000)),
    });
    if (!res.ok) throw new Error(`${method} ${new URL(url).pathname} → HTTP ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  start(intervalMs = 5 * 60_000, firstAfterMs = 60_000): void {
    this.stop();
    const first = setTimeout(() => void this.runOnce(), firstAfterMs);
    first.unref();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
    this.first = first;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.first) clearTimeout(this.first);
    this.timer = undefined;
    this.first = undefined;
  }
}

interface Indexer {
  id: number;
  name?: string | null;
  /** Prowlarr */
  enable?: boolean;
  /** Sonarr/Radarr/Lidarr */
  enableRss?: boolean;
  enableAutomaticSearch?: boolean;
  enableInteractiveSearch?: boolean;
}

interface IndexerStatus {
  indexerId: number;
  disabledTill?: string | null;
}

function isEnabled(app: App, i: Indexer): boolean {
  if (app === 'prowlarr') return i.enable === true;
  return Boolean(i.enableRss || i.enableAutomaticSearch || i.enableInteractiveSearch);
}
