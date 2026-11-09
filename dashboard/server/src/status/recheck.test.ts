import type { ServiceId } from '@easyarr/shared';
import { describe, expect, it } from 'vitest';
import { MAX_SEARCHES_PER_CHECK, MissingRecheck, type RecheckDeps } from './recheck.js';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

/** Sonarr/Radarr's /queue, /wanted/missing and /command, shaped like v4/v6 answers. */
function fakeArr(data: {
  radarrMissing?: unknown[];
  sonarrMissing?: unknown[];
  radarrQueue?: unknown[];
  sonarrQueue?: unknown[];
}) {
  const commands: { app: string; body: Record<string, unknown> }[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    const app = url.includes('/apps/radarr/') ? 'radarr' : 'sonarr';
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
    if ((init?.headers as Record<string, string>)['x-api-key'] !== `${app}-key`)
      return new Response('', { status: 401 });
    if (url.includes('/queue')) return json({ records: data[`${app}Queue`] ?? [] });
    if (url.includes('/wanted/missing')) return json({ records: data[`${app}Missing`] ?? [] });
    if (url.endsWith('/command') && init?.method === 'POST') {
      commands.push({ app, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return json({ id: commands.length });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, commands, urls };
}

function make(
  arr: ReturnType<typeof fakeArr>,
  over: Partial<RecheckDeps> = {},
): { recheck: MissingRecheck; sleeps: number[] } {
  const sleeps: number[] = [];
  const recheck = new MissingRecheck({
    url: (id) => `http://${id}`,
    keys: async () => ({ radarr: 'radarr-key', sonarr: 'sonarr-key' }),
    fetch: arr.fetchImpl,
    hours: async () => 6,
    canReach: async () => true,
    sitesUsable: () => true,
    used: async () => new Set<ServiceId>(['radarr', 'sonarr']),
    now: () => NOW,
    sleep: async (ms) => void sleeps.push(ms),
    ...over,
  });
  return { recheck, sleeps };
}

describe('MissingRecheck (D-067)', () => {
  it('searches missing movies again, skipping ones downloading, unreleased or searched lately', async () => {
    const arr = fakeArr({
      radarrMissing: [
        { id: 1, lastSearchTime: null, isAvailable: true },
        { id: 2, lastSearchTime: hoursAgo(7), isAvailable: true },
        { id: 3, lastSearchTime: hoursAgo(1), isAvailable: true }, // searched within 6 h
        { id: 4, lastSearchTime: null, isAvailable: false }, // not released yet
        { id: 5, lastSearchTime: null, isAvailable: true }, // already downloading
      ],
      radarrQueue: [{ movieId: 5 }],
    });
    const { recheck, sleeps } = make(arr, { used: async () => new Set(['radarr']) });
    expect(await recheck.runOnce()).toEqual({ searched: 2 });
    expect(arr.commands.map((c) => c.body)).toEqual([
      { name: 'MoviesSearch', movieIds: [1] },
      { name: 'MoviesSearch', movieIds: [2] },
    ]);
    // Staggered, and the longest-unsearched come first.
    expect(sleeps).toEqual([20_000]);
    expect(arr.urls.find((u) => u.includes('/wanted/missing'))).toContain(
      'sortKey=movies.lastSearchTime&sortDirection=ascending',
    );
  });

  it('turns several missing episodes of a season into one season search (finds packs)', async () => {
    const arr = fakeArr({
      sonarrMissing: [
        { id: 10, seriesId: 1, seasonNumber: 2, lastSearchTime: null },
        { id: 11, seriesId: 1, seasonNumber: 2, lastSearchTime: null },
        { id: 12, seriesId: 3, seasonNumber: 1, lastSearchTime: hoursAgo(30) },
        { id: 13, seriesId: 4, seasonNumber: 1, lastSearchTime: null },
      ],
      sonarrQueue: [{ episodeId: 13 }],
    });
    const { recheck } = make(arr, { used: async () => new Set(['sonarr']) });
    await recheck.runOnce();
    expect(arr.commands.map((c) => c.body)).toEqual([
      { name: 'EpisodeSearch', episodeIds: [12] },
      { name: 'SeasonSearch', seriesId: 1, seasonNumber: 2 },
    ]);
  });

  it('no season pack found: searches the episodes one by one 20 min later, once per interval', async () => {
    let now = NOW;
    const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
    // A request just ran Sonarr's season search (lastSearchTime = then); nothing was grabbed.
    const missing = [
      { id: 20, seriesId: 7, seasonNumber: 1, lastSearchTime: minutesAgo(5) },
      { id: 21, seriesId: 7, seasonNumber: 1, lastSearchTime: minutesAgo(5) },
    ];
    const arr = fakeArr({ sonarrMissing: missing });
    const { recheck } = make(arr, {
      used: async () => new Set(['sonarr']),
      now: () => now,
    });
    await recheck.runOnce();
    expect(arr.commands).toEqual([]); // the season search gets its chance first

    now += 20 * 60_000;
    await recheck.runOnce();
    expect(arr.commands.map((c) => c.body)).toEqual([
      { name: 'EpisodeSearch', episodeIds: [20, 21] },
    ]);

    // Sonarr updates lastSearchTime; still nothing → no new search until the interval is over.
    for (const m of missing) m.lastSearchTime = new Date(now).toISOString();
    now += 60 * 60_000;
    await recheck.runOnce();
    expect(arr.commands).toHaveLength(1);

    // 6 h later: a season pack first again, then the episodes once more 20 min after.
    now += 6 * 3600_000;
    await recheck.runOnce();
    expect(arr.commands.at(-1)?.body).toEqual({
      name: 'SeasonSearch',
      seriesId: 7,
      seasonNumber: 1,
    });
    for (const m of missing) m.lastSearchTime = new Date(now).toISOString();
    now += 20 * 60_000;
    await recheck.runOnce();
    expect(arr.commands.at(-1)?.body).toEqual({ name: 'EpisodeSearch', episodeIds: [20, 21] });
  });

  it('does not search episodes one by one while something of them downloads', async () => {
    const arr = fakeArr({
      sonarrMissing: [
        { id: 30, seriesId: 8, seasonNumber: 1, lastSearchTime: hoursAgo(1) },
        { id: 31, seriesId: 8, seasonNumber: 1, lastSearchTime: hoursAgo(1) },
      ],
      sonarrQueue: [{ episodeId: 30 }, { episodeId: 31 }],
    });
    const { recheck } = make(arr, { used: async () => new Set(['sonarr']) });
    await recheck.runOnce();
    expect(arr.commands).toEqual([]);
  });

  it('is rate-limited per check', async () => {
    const arr = fakeArr({
      radarrMissing: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        lastSearchTime: null,
        isAvailable: true,
      })),
    });
    const { recheck } = make(arr);
    expect(await recheck.runOnce()).toEqual({ searched: MAX_SEARCHES_PER_CHECK });
  });

  it('does nothing when switched off, the VPN is down or every search site is paused', async () => {
    const arr = fakeArr({ radarrMissing: [{ id: 1, lastSearchTime: null, isAvailable: true }] });
    expect(await make(arr, { hours: async () => 0 }).recheck.runOnce()).toBe('off');
    expect(await make(arr, { canReach: async () => false }).recheck.runOnce()).toBe('skipped');
    expect(await make(arr, { sitesUsable: () => false }).recheck.runOnce()).toBe('skipped');
    expect(arr.commands).toEqual([]);
  });

  it('only touches the apps the setup uses; one failing app does not stop the other', async () => {
    const arr = fakeArr({ radarrMissing: [{ id: 1, lastSearchTime: null, isAvailable: true }] });
    const { recheck } = make(arr, {
      keys: async () => ({ radarr: 'radarr-key', sonarr: 'wrong' }),
    });
    expect(await recheck.runOnce()).toEqual({ searched: 1 });
    expect(arr.commands.map((c) => c.app)).toEqual(['radarr']);
  });
});
