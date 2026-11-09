import type { ServiceId, StuckAction, StuckItem, StuckKind } from '@easyarr/shared';
import type { Logger } from 'pino';
import { NONE_YOU_NEED } from '../wiring/languages.js';
import type { ProbeDeps } from './collect.js';

/**
 * "Why didn't it download?" (owner's item 11, D-068). Every few minutes EasyArr looks at what's
 * missing or stuck and asks Sonarr/Radarr why, with their own interactive search (the list the
 * "Search" button in their UI shows, rejections included). It turns that into plain cases with a
 * one-click way out. It never grabs a release the user didn't agree to, unless they switched on
 * "Accept alternatives automatically".
 *
 * Facts (Sonarr v4.0.20.3012 / Radarr v6.4.4.10685, `*.Api.V3/Indexers/ReleaseController.cs`):
 * GET /release?movieId= | ?episodeId= | ?seriesId=&seasonNumber= returns every release found,
 * prioritised, with `rejections` (English text only). POST /release {guid, indexerId} grabs one of
 * them even when it was rejected, but only for 30 minutes after the search (cache), so "accept"
 * searches again first. Rejection texts (DecisionEngine/Specifications): "{q} is not wanted in
 * profile", "Custom Formats … below … profile minimum …", "Not enough seeders: …", "Release is
 * blocklisted". Untagged releases count as the original language.
 */

const APPS = {
  radarr: '/apps/radarr/api/v3',
  sonarr: '/apps/sonarr/api/v3',
} as const satisfies Partial<Record<ServiceId, string>>;
type App = keyof typeof APPS;

/** A missing item is looked at once it has been searched and missing for this long. */
export const STUCK_AFTER_MS = 12 * 3600_000;
/** How long one item's verdict is kept before asking again. */
export const VERDICT_TTL_MS = 6 * 3600_000;
/** "Not now" hides an item this long. */
export const DISMISS_MS = 7 * 24 * 3600_000;
/** Interactive searches per app per check (each one queries every search site). */
const SEARCHES_PER_CHECK = 1;
const SEARCH_TIMEOUT_MS = 120_000;
/** Never offered, whatever the user wants: recordings from a cinema and the like. */
const CAM_LIKE = /^(CAM|TELESYNC|TELECINE|WORKPRINT|DVDSCR|REGIONAL)$/i;

export interface StuckDeps extends ProbeDeps {
  canReach(): Promise<boolean>;
  sitesUsable(): boolean;
  used(): Promise<Set<ServiceId>>;
  /** Settings → Advanced "Accept alternatives automatically". */
  autoAccept(): Promise<boolean>;
  log?: Pick<Logger, 'info' | 'warn'>;
  now?: () => number;
}

type Release = {
  guid?: string;
  indexerId?: number;
  title?: string;
  rejected?: boolean;
  temporarilyRejected?: boolean;
  rejections?: string[];
  customFormats?: { name?: string }[];
  languages?: { name?: string }[];
  quality?: { quality?: { name?: string } };
  size?: number;
  seeders?: number | null;
  protocol?: string;
};

type Reason = 'language' | 'quality' | 'seeders' | 'blocklisted' | 'other';

/** Where a missing item's releases come from (the interactive search query). */
interface Target {
  app: App;
  query: string;
  /** Command for "search again". */
  command: Record<string, unknown>;
}

interface Entry {
  item: StuckItem;
  checkedAt: number;
  target?: Target;
  release?: { guid: string; indexerId: number };
  /** Queue record id (downloadProblem) or Seerr request id (requestFailed). */
  ref?: number;
}

export function reasonsOf(r: Release): Set<Reason> {
  const out = new Set<Reason>();
  const none = (r.customFormats ?? []).some((f) => f.name === NONE_YOU_NEED);
  const camLike = CAM_LIKE.test(r.quality?.quality?.name ?? '');
  for (const text of r.rejections ?? []) {
    if (/is not wanted in profile/i.test(text)) out.add(camLike ? 'other' : 'quality');
    else if (/below .*profile minimum/i.test(text)) out.add(none ? 'language' : 'other');
    else if (/not enough seeders/i.test(text)) out.add('seeders');
    else if (/blocklisted/i.test(text)) out.add('blocklisted');
    else out.add('other');
  }
  return out;
}

const only = (set: Set<Reason>, allowed: Reason[]) =>
  set.size > 0 && [...set].every((r) => allowed.includes(r));

/** The verdict for one item's search results; null = nothing for the user to do. */
export function classify(releases: Release[]): { kind: StuckKind; release?: Release } | null {
  if (releases.length === 0) return { kind: 'nothingFound' };
  // Something acceptable (or merely delayed) exists: Sonarr/Radarr take it themselves.
  if (releases.some((r) => !r.rejected || r.temporarilyRejected)) return null;
  const withReasons = releases.map((r) => ({ r, why: reasonsOf(r) }));
  const offers = withReasons
    .filter((x) => only(x.why, ['language', 'quality']))
    .filter((x) => x.r.protocol !== 'torrent' || (x.r.seeders ?? 1) > 0)
    // Fewer compromises first; otherwise keep the app's own order (best first).
    .sort((a, b) => a.why.size - b.why.size);
  const best = offers[0];
  if (best) {
    const kind =
      best.why.size === 2 ? 'languageQuality' : best.why.has('language') ? 'language' : 'quality';
    return { kind, release: best.r };
  }
  const blocked = withReasons.find((x) => only(x.why, ['blocklisted']));
  if (blocked) return { kind: 'blocklisted', release: blocked.r };
  if (withReasons.every((x) => x.why.has('seeders'))) return { kind: 'noSeeders' };
  return { kind: 'nothingFound' };
}

const ACTIONS: Record<StuckKind, StuckAction[]> = {
  language: ['accept', 'dismiss'],
  quality: ['accept', 'dismiss'],
  languageQuality: ['accept', 'dismiss'],
  blocklisted: ['accept', 'dismiss'],
  nothingFound: ['retry', 'dismiss'],
  noSeeders: ['retry', 'dismiss'],
  downloadProblem: ['replace', 'dismiss'],
  requestFailed: ['retry', 'dismiss'],
  autoAccepted: ['dismiss'],
};

const pad = (n: unknown) => String(n ?? 0).padStart(2, '0');

export class StuckFinder {
  private readonly entries = new Map<string, Entry>();
  private readonly dismissed = new Map<string, number>();
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private first: NodeJS.Timeout | undefined;
  private readonly now: () => number;

  constructor(private readonly deps: StuckDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** For the home screen, oldest first. */
  list(): StuckItem[] {
    const now = this.now();
    return [...this.entries.values()]
      .filter((e) => (this.dismissed.get(e.item.id) ?? 0) < now)
      .map((e) => e.item)
      .sort((a, b) => a.since.localeCompare(b.since));
  }

  async runOnce(): Promise<'skipped' | 'checked'> {
    if (this.running) return 'skipped';
    this.running = true;
    try {
      const used = await this.deps.used();
      const keys = await this.deps.keys();
      if (used.has('jellyseerr') && keys['jellyseerr']) {
        await this.failedRequests(keys['jellyseerr']).catch((err: unknown) =>
          this.deps.log?.warn({ err: (err as Error).message }, 'request page check failed'),
        );
      }
      if (!(await this.deps.canReach()) || !this.deps.sitesUsable()) return 'skipped';
      for (const app of Object.keys(APPS) as App[]) {
        if (!used.has(app)) continue;
        try {
          await this.check(app, keys[app] ?? '');
        } catch (err) {
          this.deps.log?.warn({ app, err: (err as Error).message }, 'stuck check failed');
        }
      }
      return 'checked';
    } finally {
      this.running = false;
    }
  }

  /** Runs a button from the home screen. 'changed' = the situation is different now (reloaded). */
  async act(id: string, action: StuckAction): Promise<'ok' | 'changed' | 'unknown'> {
    const e = this.entries.get(id);
    if (!e || !e.item.actions.includes(action)) return 'unknown';
    const keys = await this.deps.keys();
    if (action === 'dismiss') {
      this.dismissed.set(id, this.now() + DISMISS_MS);
      if (e.item.kind === 'autoAccepted') this.entries.delete(id);
      return 'ok';
    }
    if (action === 'retry' && e.item.kind === 'requestFailed' && e.ref !== undefined) {
      await this.seerr(keys['jellyseerr'] ?? '', 'POST', `/request/${e.ref}/retry`);
      this.entries.delete(id);
      return 'ok';
    }
    if (action === 'replace' && e.ref !== undefined) {
      const app = id.split(':')[0] as App;
      await this.call(
        app,
        keys[app] ?? '',
        'DELETE',
        `/queue/${e.ref}?removeFromClient=true&blocklist=true&skipRedownload=false`,
      );
      this.entries.delete(id);
      return 'ok';
    }
    const t = e.target;
    if (!t) return 'unknown';
    const key = keys[t.app] ?? '';
    if (action === 'retry') {
      await this.call(t.app, key, 'POST', '/command', t.command);
      this.entries.delete(id);
      return 'ok';
    }
    // accept: search again (the app only remembers results for 30 min), then grab the same release.
    const releases = await this.releases(t, key);
    const same = e.release
      ? releases.find((r) => r.guid === e.release?.guid && r.indexerId === e.release?.indexerId)
      : undefined;
    if (!same?.guid || same.indexerId === undefined) {
      this.store(id, e.item, t, releases);
      return 'changed';
    }
    await this.call(t.app, key, 'POST', '/release', { guid: same.guid, indexerId: same.indexerId });
    this.entries.delete(id);
    return 'ok';
  }

  private async check(app: App, key: string) {
    const now = this.now();
    const queue = await this.call<{ records?: Record<string, unknown>[] }>(
      app,
      key,
      'GET',
      `/queue?pageSize=1000&${app === 'radarr' ? 'includeMovie=true' : 'includeSeries=true&includeEpisode=true'}`,
    );
    const busy = new Set<number>();
    const live = new Set<string>();
    for (const q of queue.records ?? []) {
      busy.add(Number(q[app === 'radarr' ? 'movieId' : 'episodeId']));
      const state = String(q['trackedDownloadState'] ?? '');
      const status = String(q['trackedDownloadStatus'] ?? '');
      if (
        !['importBlocked', 'failedPending'].includes(state) &&
        !['warning', 'error'].includes(status)
      )
        continue;
      const id = `${app}:queue:${String(q['id'])}`;
      live.add(id);
      if (this.entries.has(id)) continue;
      const messages = (q['statusMessages'] as { messages?: string[] }[] | undefined) ?? [];
      const detail =
        messages.flatMap((m) => m.messages ?? [])[0] ?? String(q['errorMessage'] ?? '');
      this.entries.set(id, {
        item: {
          id,
          kind: 'downloadProblem',
          type: app === 'radarr' ? 'movie' : 'series',
          title: queueTitle(app, q),
          ...(detail ? { detail } : {}),
          since: new Date(now).toISOString(),
          actions: ACTIONS.downloadProblem,
        },
        checkedAt: now,
        ref: Number(q['id']),
      });
    }

    const page = await this.call<{ records?: Record<string, unknown>[] }>(
      app,
      key,
      'GET',
      `/wanted/missing?monitored=true&pageSize=100&${app === 'radarr' ? 'sortKey=movies.lastSearchTime' : 'includeSeries=true&sortKey=episodes.lastSearchTime'}&sortDirection=ascending`,
    );
    const targets = new Map<string, { target: Target; title: string; since: number }>();
    for (const m of page.records ?? []) {
      if (busy.has(Number(m['id'])) || !m['lastSearchTime']) continue;
      if (app === 'radarr' && m['isAvailable'] === false) continue;
      const since = Date.parse(String(m[app === 'radarr' ? 'added' : 'airDateUtc'] ?? ''));
      if (!Number.isFinite(since) || now - since < STUCK_AFTER_MS) continue;
      if (app === 'radarr') {
        targets.set(`radarr:movie:${String(m['id'])}`, {
          target: {
            app,
            query: `movieId=${String(m['id'])}`,
            command: { name: 'MoviesSearch', movieIds: [m['id']] },
          },
          title: `${String(m['title'] ?? '?')}${m['year'] ? ` (${String(m['year'])})` : ''}`,
          since,
        });
        continue;
      }
      const series = (m['series'] as Record<string, unknown> | undefined) ?? {};
      const seasonId = `sonarr:season:${String(m['seriesId'])}:${String(m['seasonNumber'])}`;
      const existing = targets.get(seasonId);
      const single = targets.get(`pending:${seasonId}`);
      if (existing) continue;
      if (single) {
        // A second missing episode of the season: search the whole season (finds packs).
        targets.delete(`pending:${seasonId}`);
        targets.set(seasonId, {
          target: {
            app,
            query: `seriesId=${String(m['seriesId'])}&seasonNumber=${String(m['seasonNumber'])}`,
            command: {
              name: 'SeasonSearch',
              seriesId: m['seriesId'],
              seasonNumber: m['seasonNumber'],
            },
          },
          title: `${String(series['title'] ?? '?')} – season ${String(m['seasonNumber'])}`,
          since: Math.min(since, single.since),
        });
        continue;
      }
      targets.set(`pending:${seasonId}`, {
        target: {
          app,
          query: `episodeId=${String(m['id'])}`,
          command: { name: 'EpisodeSearch', episodeIds: [m['id']] },
        },
        title: `${String(series['title'] ?? '?')} S${pad(m['seasonNumber'])}E${pad(m['episodeNumber'])}`,
        since,
      });
    }
    const wanted = new Map<string, { target: Target; title: string; since: number }>();
    for (const [k, v] of targets) {
      const id = k.startsWith('pending:')
        ? `sonarr:episode:${v.target.query.split('=')[1] ?? ''}`
        : k;
      wanted.set(id, v);
    }
    // Forget what arrived or started downloading.
    for (const id of [...this.entries.keys()]) {
      if (!id.startsWith(`${app}:`)) continue;
      if (id.includes(':queue:') ? !live.has(id) : !wanted.has(id)) this.entries.delete(id);
    }
    // Ask about the ones not looked at for the longest time.
    const due = [...wanted.entries()]
      .filter(([id]) => (this.entries.get(id)?.checkedAt ?? 0) < now - VERDICT_TTL_MS)
      .filter(([id]) => (this.dismissed.get(id) ?? 0) < now)
      .sort(
        (a, b) =>
          (this.entries.get(a[0])?.checkedAt ?? 0) - (this.entries.get(b[0])?.checkedAt ?? 0),
      )
      .slice(0, SEARCHES_PER_CHECK);
    for (const [id, w] of due) {
      const releases = await this.releases(w.target, key);
      const base = {
        id,
        kind: 'nothingFound' as StuckKind,
        type: (app === 'radarr' ? 'movie' : 'series') as StuckItem['type'],
        title: w.title,
        since: new Date(w.since).toISOString(),
        actions: [] as StuckAction[],
      };
      const entry = this.store(id, base, w.target, releases);
      if (entry && (await this.deps.autoAccept()) && entry.release && isFallback(entry.item.kind)) {
        await this.call(app, key, 'POST', '/release', entry.release);
        entry.item = { ...entry.item, kind: 'autoAccepted', actions: ACTIONS.autoAccepted };
        this.deps.log?.info(
          { id, offer: entry.item.offer },
          'accepted an alternative automatically',
        );
      }
    }
  }

  /** Classifies search results and remembers the verdict (null: nothing to show). */
  private store(id: string, base: StuckItem, target: Target, releases: Release[]): Entry | null {
    const verdict = classify(releases);
    if (!verdict) {
      this.entries.delete(id);
      return null;
    }
    const r = verdict.release;
    const entry: Entry = {
      item: {
        ...base,
        kind: verdict.kind,
        actions: ACTIONS[verdict.kind],
        ...(r
          ? {
              offer: {
                languages: (r.languages ?? []).map((l) => l.name ?? '').filter(Boolean),
                quality: r.quality?.quality?.name ?? '',
                sizeBytes: r.size ?? 0,
                seeders: r.protocol === 'torrent' ? (r.seeders ?? null) : null,
              },
            }
          : {}),
      },
      checkedAt: this.now(),
      target,
      ...(r?.guid && r.indexerId !== undefined
        ? { release: { guid: r.guid, indexerId: r.indexerId } }
        : {}),
    };
    if (!r) delete entry.item.offer;
    this.entries.set(id, entry);
    return entry;
  }

  private releases(t: Target, key: string): Promise<Release[]> {
    return this.call<Release[]>(
      t.app,
      key,
      'GET',
      `/release?${t.query}`,
      undefined,
      SEARCH_TIMEOUT_MS,
    );
  }

  /** Seerr requests that failed to reach Sonarr/Radarr (seerr v3.5.1 routes/request.ts). */
  private async failedRequests(key: string) {
    const res = await this.seerr<{ results?: Record<string, unknown>[] }>(
      key,
      'GET',
      '/request?filter=failed&take=20',
    );
    const live = new Set<string>();
    for (const r of res.results ?? []) {
      const id = `seerr:request:${String(r['id'])}`;
      live.add(id);
      if (this.entries.has(id)) continue;
      const media = (r['media'] as Record<string, unknown> | undefined) ?? {};
      const movie = (r['type'] ?? media['mediaType']) === 'movie';
      let title = movie ? 'A movie' : 'A show';
      try {
        const info = await this.seerr<Record<string, unknown>>(
          key,
          'GET',
          `/${movie ? 'movie' : 'tv'}/${String(media['tmdbId'])}`,
        );
        title = String(info[movie ? 'title' : 'name'] ?? title);
      } catch {
        // keep the generic title
      }
      this.entries.set(id, {
        item: {
          id,
          kind: 'requestFailed',
          type: movie ? 'movie' : 'series',
          title,
          since: String(r['createdAt'] ?? new Date(this.now()).toISOString()),
          actions: ACTIONS.requestFailed,
        },
        checkedAt: this.now(),
        ref: Number(r['id']),
      });
    }
    for (const id of [...this.entries.keys()])
      if (id.startsWith('seerr:') && !live.has(id)) this.entries.delete(id);
  }

  private seerr<T>(key: string, method: string, path: string): Promise<T> {
    return this.fetchJson<T>(`${this.deps.url('jellyseerr')}/api/v1${path}`, key, method);
  }

  private call<T>(
    app: App,
    key: string,
    method: string,
    path: string,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    return this.fetchJson<T>(
      `${this.deps.url(app)}${APPS[app]}${path}`,
      key,
      method,
      body,
      timeoutMs,
    );
  }

  private async fetchJson<T>(
    url: string,
    key: string,
    method: string,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    const f = this.deps.fetch ?? fetch;
    const res = await f(url, {
      method,
      headers: {
        'x-api-key': key,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs ?? this.deps.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new Error(`${method} ${url.split('?')[0]}: HTTP ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  start(intervalMs = 10 * 60_000, firstAfterMs = 5 * 60_000): void {
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

function isFallback(kind: StuckKind) {
  return kind === 'language' || kind === 'quality' || kind === 'languageQuality';
}

function queueTitle(app: App, q: Record<string, unknown>): string {
  if (app === 'radarr') {
    const m = (q['movie'] as Record<string, unknown> | undefined) ?? {};
    return m['title']
      ? `${String(m['title'])}${m['year'] ? ` (${String(m['year'])})` : ''}`
      : String(q['title'] ?? '?');
  }
  const s = (q['series'] as Record<string, unknown> | undefined) ?? {};
  const e = (q['episode'] as Record<string, unknown> | undefined) ?? {};
  return s['title']
    ? `${String(s['title'])} S${pad(e['seasonNumber'])}E${pad(e['episodeNumber'])}`
    : String(q['title'] ?? '?');
}
