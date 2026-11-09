import type { ServiceId } from '@easyarr/shared';
import { describe, expect, it } from 'vitest';
import { NONE_YOU_NEED } from '../wiring/languages.js';
import { classify, STUCK_AFTER_MS, StuckFinder, type StuckDeps } from './stuck.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 3600_000;

/** Release resources shaped like Radarr 6.4 / Sonarr 4.0 GET /api/v3/release. */
const release = (over: Record<string, unknown> = {}) => ({
  guid: 'g1',
  indexerId: 3,
  title: 'Sintel.2010.1080p.WEB-DL',
  rejected: false,
  temporarilyRejected: false,
  rejections: [] as string[],
  customFormats: [] as { name: string }[],
  languages: [{ name: 'English' }],
  quality: { quality: { name: 'WEBDL-1080p' } },
  size: 4e9,
  seeders: 12,
  protocol: 'torrent',
  ...over,
});
const languageRejected = (over: Record<string, unknown> = {}) =>
  release({
    rejected: true,
    customFormats: [{ name: NONE_YOU_NEED }],
    rejections: [
      "Custom Formats EasyArr – Language: none you need have score -10000 below Movie's profile minimum -20",
    ],
    ...over,
  });
const qualityRejected = (q = 'WEBDL-720p', over: Record<string, unknown> = {}) =>
  release({
    rejected: true,
    quality: { quality: { name: q } },
    rejections: [`${q} is not wanted in profile`],
    ...over,
  });

describe('classify', () => {
  it('nothing found, or something Radarr/Sonarr will take themselves', () => {
    expect(classify([])).toEqual({ kind: 'nothingFound' });
    expect(classify([release(), languageRejected()])).toBeNull();
    expect(classify([release({ rejected: true, temporarilyRejected: true })])).toBeNull();
  });

  it('offers another language or a lower quality, fewest compromises first', () => {
    const lang = languageRejected({ guid: 'lang' });
    const both = languageRejected({
      guid: 'both',
      quality: { quality: { name: 'WEBDL-720p' } },
      rejections: [
        'WEBDL-720p is not wanted in profile',
        "Custom Formats … below Movie's profile minimum -20",
      ],
    });
    expect(classify([both, lang])).toMatchObject({ kind: 'language', release: { guid: 'lang' } });
    expect(classify([both])).toMatchObject({ kind: 'languageQuality' });
    expect(classify([qualityRejected()])).toMatchObject({ kind: 'quality' });
  });

  it('never offers cinema recordings, dead torrents or other low scores', () => {
    expect(classify([qualityRejected('CAM')])).toEqual({ kind: 'nothingFound' });
    expect(classify([languageRejected({ seeders: 0 })])).toEqual({ kind: 'nothingFound' });
    // A low score that isn't about the language (e.g. a blocked release group) isn't offered.
    expect(
      classify([
        release({ rejected: true, rejections: ['Custom Formats x below profile minimum'] }),
      ]),
    ).toEqual({ kind: 'nothingFound' });
  });

  it('no seeders anywhere; everything blocklisted', () => {
    const dead = release({
      rejected: true,
      rejections: ['Not enough seeders: 0. Minimum seeders: 1'],
    });
    expect(classify([dead, dead])).toEqual({ kind: 'noSeeders' });
    const blocked = release({ rejected: true, rejections: ['Release is blocklisted'] });
    expect(classify([dead, blocked])).toMatchObject({ kind: 'blocklisted' });
  });
});

function fakeArr() {
  const calls: string[] = [];
  const posts: { url: string; body: unknown }[] = [];
  const data = {
    radarrMissing: [] as Record<string, unknown>[],
    sonarrMissing: [] as Record<string, unknown>[],
    radarrQueue: [] as Record<string, unknown>[],
    releases: [] as unknown[],
    seerrFailed: [] as Record<string, unknown>[],
  };
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.replace(/^http:\/\/[a-z]+/, '')}`);
    const json = (b: unknown) => new Response(JSON.stringify(b));
    if (method !== 'GET')
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes('/request?filter=failed')) return json({ results: data.seerrFailed });
    if (url.includes('/api/v1/movie/')) return json({ title: 'Elephants Dream' });
    if (url.includes('/request/') && url.endsWith('/retry')) return json({});
    if (url.includes('/queue?'))
      return json({ records: url.includes('radarr') ? data.radarrQueue : [] });
    if (url.includes('/wanted/missing'))
      return json({ records: url.includes('radarr') ? data.radarrMissing : data.sonarrMissing });
    if (url.includes('/release?')) return json(data.releases);
    return json({});
  }) as typeof fetch;
  return { fetchImpl, calls, posts, data };
}

function make(over: Partial<StuckDeps> = {}) {
  const arr = fakeArr();
  const finder = new StuckFinder({
    url: (id) => `http://${id}`,
    keys: async () => ({ radarr: 'r', sonarr: 's', jellyseerr: 'j' }),
    fetch: arr.fetchImpl,
    canReach: async () => true,
    sitesUsable: () => true,
    used: async () => new Set<ServiceId>(['radarr', 'sonarr', 'jellyseerr']),
    autoAccept: async () => false,
    now: () => NOW,
    ...over,
  });
  return { finder, ...arr };
}

const sintel = {
  id: 7,
  title: 'Sintel',
  year: 2010,
  isAvailable: true,
  added: ago(2 * DAY),
  lastSearchTime: ago(DAY),
};

describe('StuckFinder (D-068)', () => {
  it('asks Radarr why a missing movie has no download and offers English after confirmation', async () => {
    const { finder, data, posts, calls } = make();
    data.radarrMissing = [sintel];
    data.releases = [languageRejected()];
    await finder.runOnce();
    expect(finder.list()).toMatchObject([
      {
        id: 'radarr:movie:7',
        kind: 'language',
        title: 'Sintel (2010)',
        offer: { languages: ['English'], quality: 'WEBDL-1080p', seeders: 12 },
        actions: ['accept', 'dismiss'],
      },
    ]);
    expect(posts).toEqual([]); // nothing grabbed without the user
    expect(await finder.act('radarr:movie:7', 'accept')).toBe('ok');
    // Searched again (the app forgets results after 30 min), then grabbed exactly that release.
    expect(calls.filter((c) => c.includes('/release?movieId=7'))).toHaveLength(2);
    expect(posts).toEqual([
      { url: 'http://radarr/apps/radarr/api/v3/release', body: { guid: 'g1', indexerId: 3 } },
    ]);
    expect(finder.list()).toEqual([]);
  });

  it('"accept" when the offer is gone reports a change instead of grabbing something else', async () => {
    const { finder, data, posts } = make();
    data.radarrMissing = [sintel];
    data.releases = [languageRejected()];
    await finder.runOnce();
    data.releases = [qualityRejected('WEBDL-720p', { guid: 'other' })];
    expect(await finder.act('radarr:movie:7', 'accept')).toBe('changed');
    expect(posts).toEqual([]);
    expect(finder.list()[0]).toMatchObject({ kind: 'quality' });
  });

  it('only looks at items searched at least once and missing for a while', async () => {
    const { finder, data, calls } = make();
    data.radarrMissing = [
      { ...sintel, id: 1, lastSearchTime: null },
      { ...sintel, id: 2, added: ago(STUCK_AFTER_MS / 2) },
      { ...sintel, id: 3, isAvailable: false },
    ];
    await finder.runOnce();
    expect(calls.some((c) => c.includes('/release?'))).toBe(false);
  });

  it('a stuck download can be replaced by another release', async () => {
    const { finder, data, posts } = make();
    data.radarrQueue = [
      {
        id: 91,
        movieId: 7,
        movie: { title: 'Sintel', year: 2010 },
        trackedDownloadState: 'importBlocked',
        trackedDownloadStatus: 'warning',
        statusMessages: [{ title: 'x', messages: ['No files found are eligible for import'] }],
      },
    ];
    await finder.runOnce();
    expect(finder.list()).toMatchObject([
      {
        id: 'radarr:queue:91',
        kind: 'downloadProblem',
        detail: 'No files found are eligible for import',
        actions: ['replace', 'dismiss'],
      },
    ]);
    await finder.act('radarr:queue:91', 'replace');
    expect(posts[0]?.url).toBe(
      'http://radarr/apps/radarr/api/v3/queue/91?removeFromClient=true&blocklist=true&skipRedownload=false',
    );
  });

  it('season searches for several missing episodes, episode searches for one; "retry" searches now', async () => {
    const { finder, data, calls, posts } = make();
    const ep = (id: number, season: number, episode: number) => ({
      id,
      seriesId: 4,
      seasonNumber: season,
      episodeNumber: episode,
      series: { title: 'Pioneer One' },
      airDateUtc: ago(30 * DAY),
      lastSearchTime: ago(DAY),
    });
    data.sonarrMissing = [ep(10, 2, 1), ep(11, 2, 2), ep(12, 3, 5)];
    data.releases = [];
    await finder.runOnce(); // one search per check
    await finder.runOnce();
    expect(calls.filter((c) => c.includes('/release?'))).toEqual([
      'GET /apps/sonarr/api/v3/release?seriesId=4&seasonNumber=2',
      'GET /apps/sonarr/api/v3/release?episodeId=12',
    ]);
    expect(finder.list().map((i) => [i.title, i.kind])).toEqual([
      ['Pioneer One – season 2', 'nothingFound'],
      ['Pioneer One S03E05', 'nothingFound'],
    ]);
    await finder.act('sonarr:season:4:2', 'retry');
    expect(posts.at(-1)?.body).toEqual({ name: 'SeasonSearch', seriesId: 4, seasonNumber: 2 });
  });

  it('with "accept alternatives automatically" it grabs the offer and just tells the user', async () => {
    const { finder, data, posts } = make({ autoAccept: async () => true });
    data.radarrMissing = [sintel];
    data.releases = [languageRejected()];
    await finder.runOnce();
    expect(posts).toHaveLength(1);
    expect(finder.list()).toMatchObject([{ kind: 'autoAccepted', actions: ['dismiss'] }]);
  });

  it('failed requests on the request page can be sent again; "not now" hides an item', async () => {
    const { finder, data, posts } = make({ canReach: async () => false });
    data.seerrFailed = [{ id: 5, type: 'movie', media: { tmdbId: 9761 }, createdAt: ago(DAY) }];
    await finder.runOnce();
    expect(finder.list()).toMatchObject([
      { id: 'seerr:request:5', kind: 'requestFailed', title: 'Elephants Dream' },
    ]);
    expect(await finder.act('seerr:request:5', 'dismiss')).toBe('ok');
    expect(finder.list()).toEqual([]);
    await finder.runOnce();
    expect(finder.list()).toEqual([]); // still hidden
    expect(posts).toEqual([]);
  });

  it('stays quiet while the VPN is down or every search site is paused', async () => {
    for (const over of [{ canReach: async () => false }, { sitesUsable: () => false }]) {
      const { finder, data, calls } = make(over);
      data.radarrMissing = [sintel];
      expect(await finder.runOnce()).toBe('skipped');
      expect(calls.some((c) => c.includes('radarr'))).toBe(false);
    }
  });
});
