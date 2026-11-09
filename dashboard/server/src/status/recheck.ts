import type { ServiceId } from '@easyarr/shared';
import type { Logger } from 'pino';
import type { ProbeDeps } from './collect.js';

const APPS = {
  radarr: '/apps/radarr/api/v3',
  sonarr: '/apps/sonarr/api/v3',
} as const satisfies Partial<Record<ServiceId, string>>;
type App = keyof typeof APPS;

/** Searches started per app per check; checks run every 10 min → at most 18 per hour per app. */
export const MAX_SEARCHES_PER_CHECK = 3;
/** Pause between two searches, so indexers see a trickle, not a burst. */
export const SEARCH_GAP_MS = 20_000;
/** How many of the longest-unsearched missing items one check looks at. */
const PAGE_SIZE = 50;

export interface RecheckDeps extends ProbeDeps {
  /** 0 = off. */
  hours(): Promise<number>;
  /** False while the VPN is down: searches would only fail and get the indexers paused. */
  canReach(): Promise<boolean>;
  /** False while every search site is paused (searching then only extends the pause). */
  sitesUsable(): boolean;
  /** Which of Sonarr/Radarr the setup uses. */
  used(): Promise<Set<ServiceId>>;
  log?: Pick<Logger, 'info' | 'warn'>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type RecheckResult = 'off' | 'skipped' | { searched: number };

interface Missing {
  id: number;
  lastSearchTime?: string | null;
  isAvailable?: boolean;
  seriesId?: number;
  seasonNumber?: number;
}

/**
 * Owner's item 10 (D-067): Sonarr/Radarr search a monitored item once when it's added and then only
 * watch new releases (RSS), so a request that found nothing stays "Missing" for good. Every
 * `hours`, EasyArr asks them to search again, through their own commands (MoviesSearch,
 * SeasonSearch, EpisodeSearch): the longest-unsearched first (`lastSearchTime`, which every search
 * updates, Cleanuparr's included), skipping what's already downloading, movies not released yet,
 * and anything searched within `hours`. A few per check with gaps in between, so indexers aren't
 * flooded. Several missing episodes of one season become one season search, which also finds
 * whole-season packs (item 9).
 */
export class MissingRecheck {
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private first: NodeJS.Timeout | undefined;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: RecheckDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async runOnce(): Promise<RecheckResult> {
    if (this.running) return 'skipped';
    this.running = true;
    try {
      const hours = await this.deps.hours();
      if (hours <= 0) return 'off';
      if (!(await this.deps.canReach()) || !this.deps.sitesUsable()) return 'skipped';
      const keys = await this.deps.keys();
      const used = await this.deps.used();
      let searched = 0;
      for (const app of Object.keys(APPS) as App[]) {
        if (!used.has(app)) continue;
        try {
          searched += await this.recheck(app, keys[app] ?? '', hours);
        } catch (err) {
          this.deps.log?.warn({ app, err: (err as Error).message }, 'missing re-search failed');
        }
      }
      if (searched > 0) this.deps.log?.info({ searched }, 'searched again for missing items');
      return { searched };
    } finally {
      this.running = false;
    }
  }

  private async recheck(app: App, key: string, hours: number): Promise<number> {
    const cutoff = this.now() - hours * 3600_000;
    const due = (m: Missing) => !m.lastSearchTime || Date.parse(m.lastSearchTime) < cutoff;
    const queue = await this.call<{ records?: Record<string, unknown>[] }>(
      app,
      key,
      'GET',
      '/queue?pageSize=1000',
    );
    const busy = new Set(
      (queue.records ?? []).map((r) => Number(r[app === 'radarr' ? 'movieId' : 'episodeId'])),
    );
    const sortKey = app === 'radarr' ? 'movies.lastSearchTime' : 'episodes.lastSearchTime';
    const page = await this.call<{ records?: Missing[] }>(
      app,
      key,
      'GET',
      `/wanted/missing?monitored=true&pageSize=${PAGE_SIZE}&sortKey=${sortKey}&sortDirection=ascending`,
    );
    const missing = (page.records ?? []).filter(
      (m) => !busy.has(m.id) && due(m) && (app === 'sonarr' || m.isAvailable !== false),
    );
    const commands: Record<string, unknown>[] = [];
    if (app === 'radarr') {
      for (const m of missing) commands.push({ name: 'MoviesSearch', movieIds: [m.id] });
    } else {
      const seasons = new Map<string, Missing[]>();
      for (const m of missing) {
        const k = `${m.seriesId}:${m.seasonNumber}`;
        seasons.set(k, [...(seasons.get(k) ?? []), m]);
      }
      for (const eps of seasons.values()) {
        const [first] = eps;
        if (!first) continue;
        commands.push(
          eps.length > 1
            ? { name: 'SeasonSearch', seriesId: first.seriesId, seasonNumber: first.seasonNumber }
            : { name: 'EpisodeSearch', episodeIds: [first.id] },
        );
      }
    }
    const batch = commands.slice(0, MAX_SEARCHES_PER_CHECK);
    for (const [i, body] of batch.entries()) {
      if (i > 0) await this.sleep(SEARCH_GAP_MS);
      await this.call(app, key, 'POST', '/command', body);
    }
    return batch.length;
  }

  private async call<T>(app: App, key: string, method: string, path: string, body?: unknown) {
    const f = this.deps.fetch ?? fetch;
    const res = await f(`${this.deps.url(app)}${APPS[app]}${path}`, {
      method,
      headers: {
        'x-api-key': key,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(this.deps.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new Error(`${app} ${method} ${path.split('?')[0]}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  start(intervalMs = 10 * 60_000, firstAfterMs = 3 * 60_000): void {
    this.stop();
    this.first = setTimeout(() => void this.runOnce(), firstAfterMs);
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.first.unref();
    this.timer.unref();
  }

  stop(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = undefined;
    this.timer = undefined;
  }
}
