import { describe, expect, it } from 'vitest';
import type { LedgerEntry, WiringRunSummary } from '../state/index.js';
import { WiringEngine, type LedgerStore, type WiringPlan } from './engine.js';
import { buildSteps } from './steps.js';
import {
  FAKE_INDEXER_KEY,
  FAKE_USENET_HOST,
  FAKE_USENET_PASSWORD,
  World,
  type Json,
} from './testing/fake-world.js';

class MemoryLedger implements LedgerStore {
  ledger: LedgerEntry[] = [];
  applied: string[] = [];
  runs: WiringRunSummary[] = [];
  async read() {
    return { ledger: [...this.ledger], applied: [...this.applied] };
  }
  async upsert(e: LedgerEntry) {
    this.ledger = [...this.ledger.filter((x) => x.key !== e.key), e];
  }
  async markApplied(key: string) {
    if (!this.applied.includes(key)) this.applied.push(key);
  }
  async finish(s: WiringRunSummary) {
    this.runs.push(s);
  }
}

const everything: WiringPlan = {
  torrents: true,
  usenet: true,
  libraries: { movies: true, tv: true, music: true },
  quality: 'balanced',
  audio: [
    { code: 'original', required: false },
    { code: 'en', required: false },
  ],
  subtitles: [{ code: 'en', required: false }],
  language: 'en',
  country: 'US',
  usenetServers: [],
  usenetIndexers: [],
  gpu: true,
};

function setup(world = new World()) {
  const store = new MemoryLedger();
  const { steps, health } = buildSteps(world.deps());
  const engine = new WiringEngine({
    steps,
    health,
    store,
    readyTimeoutMs: 1000,
    sleep: async () => undefined,
  });
  const run = async (mode: 'run' | 'repair' = 'run', plan = everything) => {
    const failed: unknown[] = [];
    const r = await engine.run(mode, plan, (e) => {
      if (e.type === 'step' && e.state === 'failed') failed.push(e);
    });
    return { ...r, failed };
  };
  return { world, store, run };
}

describe('wiring steps', () => {
  it('connects everything on a fresh install', async () => {
    const { world: w, run } = setup();
    const r = await run();
    expect(r.failed).toEqual([]);
    expect(r.ok).toBe(true);

    expect(Object.keys(w.qbt.categories).sort()).toEqual(['movies', 'music', 'tv']);
    expect(w.qbt.categories['tv']?.['savePath']).toBe('/data/downloads/torrents/tv');
    expect(w.qbt.prefs).toMatchObject({ max_ratio_act: 0, auto_tmm_enabled: true });
    expect(w.sab.categories.map((c) => c['name']).sort()).toEqual(['movies', 'music', 'tv']);

    for (const [app, folder] of [
      ['sonarr', 'tv'],
      ['radarr', 'movies'],
      ['lidarr', 'music'],
    ] as const) {
      const a = w.arr[app];
      expect(a.coll('rootfolder').items.map((f) => f['path'])).toEqual([`/data/media/${folder}`]);
      const clients = a.coll('downloadclient').items;
      expect(clients.map((c) => c['implementation']).sort()).toEqual(['QBittorrent', 'Sabnzbd']);
      const qbt = clients.find((c) => c['implementation'] === 'QBittorrent') as {
        fields: { name: string; value: unknown }[];
      };
      expect(qbt.fields.find((f) => f.name === 'port')?.value).toBe(8090);
      // GET → change → PUT keeps the settings EasyArr doesn't own.
      expect(a.config['mediamanagement']).toMatchObject({
        copyUsingHardlinks: true,
        otherSetting: 'kept',
      });
      expect(a.config['downloadclient']).toMatchObject({
        enableCompletedDownloadHandling: true,
        autoRedownloadFailed: true,
      });
    }
    const lidarrRoot = w.arr.lidarr.coll('rootfolder').items[0] as Json;
    const easyProfile = w.arr.lidarr
      .coll('qualityprofile')
      .items.find((p) => p['name'] === 'EasyArr (Balanced)');
    expect(lidarrRoot['defaultQualityProfileId']).toBe(easyProfile?.['id']);

    const apps = w.arr.prowlarr.coll('applications').items as {
      implementation: string;
      fields: { name: string; value: unknown }[];
    }[];
    expect(apps.map((a) => a.implementation).sort()).toEqual(['Lidarr', 'Radarr', 'Sonarr']);
    expect(apps[0]?.fields.find((f) => f.name === 'prowlarrUrl')?.value).toBe(
      'http://localhost:9696/apps/prowlarr',
    );
    const proxy = w.arr.prowlarr.coll('indexerproxy').items[0] as Json;
    expect(proxy['tags']).toEqual([1]);

    expect(w.recyclarrSyncs).toBe(1);
    expect(
      w.arr.sonarr
        .coll('qualityprofile')
        .items.some((p) => String(p['name']).startsWith('EasyArr')),
    ).toBe(true);

    expect(w.bz.profiles).toHaveLength(1);
    expect(w.bz.settings).toMatchObject({
      'settings-general-use_sonarr': 'true',
      'settings-general-serie_default_profile': '1',
    });

    expect(w.jf.wizardDone).toBe(true);
    expect(w.jf.user).toEqual({ name: 'owner', pw: 'correct horse' });
    expect(w.jf.libs.map((l) => l['Name']).sort()).toEqual(['Movies', 'Music', 'Shows']);
    expect(w.jf.encoding).toMatchObject({ Other: 1 });
    expect(w.jf.encoding['HardwareAccelerationType']).not.toBe('none');
    expect(w.keys['jellyfin']).toBe('jf-key-1');

    expect(w.seerr.type).toBe(2);
    expect(w.seerr.initialized).toBe(true);
    expect(w.seerr.libs[0]?.['enabled']).toBe(true);
    expect(w.seerr.sonarr.items[0]).toMatchObject({
      baseUrl: '/apps/sonarr',
      activeDirectory: '/data/media/tv',
      activeProfileName: 'EasyArr (Balanced)',
      externalUrl: 'http://umbrel.local:39000/apps/sonarr',
    });
    expect(w.seerr.radarr.items).toHaveLength(1);
    expect(w.seerr.radarr.items[0]?.['externalUrl']).toBe('http://umbrel.local:39000/apps/radarr');

    expect(w.cu.setup).toBe(true);
    expect(w.keys['cleanuparr']).toBe('cu-key');
    expect(w.cu.general).toMatchObject({
      keep: 1,
      auth: { disableAuthForLocalAddresses: true, trustForwardedHeaders: false },
    });
    expect(w.cu.lidarr.items[0]).toMatchObject({ url: 'http://localhost:8686/apps/lidarr' });
    expect(w.cu.clients.items).toHaveLength(1);
    expect(w.cu.queueCleaner).toMatchObject({
      enabled: true,
      downloadingMetadataMaxStrikes: 3,
      errored: { maxStrikes: 3 },
      failedImport: { patternMode: 'Include' },
    });
    expect(w.cu.stall.items).toEqual([
      expect.objectContaining({
        maxStrikes: 6,
        privacyType: 'Public',
        resetStrikesOnProgress: true,
      }),
    ]);
    expect(w.cu.seeker).toMatchObject({ searchEnabled: true, proactiveSearchEnabled: true });
    expect(Object.values(w.cu.seekerInstances)).toHaveLength(2);
    expect(Object.values(w.cu.seekerInstances).every((i) => i['enabled'] === true)).toBe(true);
  });

  it('signs in to Seerr again when it refuses the very first session', async () => {
    const world = new World();
    world.seerr.refuseNextSession = true;
    const { run } = setup(world);
    const r = await run();
    expect(r.failed).toEqual([]);
    expect(world.keys['jellyseerr']).toBe('seerr-key');
  });

  it('fills in a missing Seerr link URL once (older installs) and keeps one the user set', async () => {
    const { world: w, store, run } = setup();
    await run();
    // An install from before the fix: Seerr entry without externalUrl, ledger without the key.
    const radarr = w.seerr.radarr.items[0] as Record<string, unknown>;
    delete radarr['externalUrl'];
    const sonarr = w.seerr.sonarr.items[0] as Record<string, unknown>;
    sonarr['externalUrl'] = 'https://my.domain/sonarr';
    store.applied = store.applied.filter((k) => !k.endsWith('.externalUrl'));
    await run();
    expect(w.seerr.radarr.items[0]).toMatchObject({
      externalUrl: 'http://umbrel.local:39000/apps/radarr',
      apiKey: w.arr.radarr.key,
    });
    expect(w.seerr.sonarr.items[0]?.['externalUrl']).toBe('https://my.domain/sonarr');
  });

  it('keeps the Queue Cleaner and Seeker as the user left them', async () => {
    const { world: w, run } = setup();
    await run();
    w.cu.queueCleaner = { ...w.cu.queueCleaner, enabled: false };
    w.cu.seeker = { ...w.cu.seeker, proactiveSearchEnabled: false };
    const r = await run();
    expect(r).toMatchObject({ ok: true, failed: [] });
    expect(w.cu.queueCleaner['enabled']).toBe(false);
    expect(w.cu.seeker['proactiveSearchEnabled']).toBe(false);
  });

  it('a second run changes nothing and creates nothing', async () => {
    const { world: w, run } = setup();
    await run();
    const posts = Object.values(w.arr).reduce((n, a) => n + a.posts.length, 0);
    w.calls = [];
    const r = await run();
    expect(r).toMatchObject({ ok: true, changes: 0, failed: [] });
    expect(Object.values(w.arr).reduce((n, a) => n + a.posts.length, 0)).toBe(posts);
    // Only reads — Seerr's library "sync" just re-reads Jellyfin's library list.
    expect(
      w.calls.filter(
        (c) =>
          c.startsWith('POST') && !c.endsWith('/library/sync') && !c.includes('AuthenticateByName'),
      ),
    ).toEqual([]);
    expect(w.calls.filter((c) => /^(PUT|DELETE)/.test(c))).toEqual([]);
    expect(w.recyclarrSyncs).toBe(1);
  });

  it('respects what the user deleted; "repair" puts it back', async () => {
    const { world: w, store, run } = setup();
    await run();
    const id = w.arr.sonarr
      .coll('downloadclient')
      .items.find((c) => c['implementation'] === 'QBittorrent')?.['id'] as number;
    w.arr.sonarr.coll('downloadclient').remove(id);
    // The user also turned hardlinks off again: a one-time setting stays the user's.
    w.arr.sonarr.config['mediamanagement'] = {
      id: 1,
      copyUsingHardlinks: false,
      otherSetting: 'kept',
    };

    expect((await run()).ok).toBe(true);
    expect(
      w.arr.sonarr.coll('downloadclient').items.some((c) => c['implementation'] === 'QBittorrent'),
    ).toBe(false);
    expect(w.arr.sonarr.config['mediamanagement']?.['copyUsingHardlinks']).toBe(false);

    expect((await run('repair')).ok).toBe(true);
    expect(
      w.arr.sonarr.coll('downloadclient').items.some((c) => c['implementation'] === 'QBittorrent'),
    ).toBe(true);
    expect(store.ledger.find((e) => e.key === 'sonarr.downloadclient.qbittorrent')?.id).not.toBe(
      String(id),
    );
  });

  it('adopts what the user already set up instead of adding duplicates', async () => {
    const w = new World();
    w.arr.radarr.coll('rootfolder').add({ path: '/data/media/movies/' });
    w.qbt.categories['movies'] = { name: 'movies', savePath: '/somewhere' };
    w.jf.wizardDone = true;
    w.jf.user = { name: 'owner', pw: 'correct horse' };
    w.jf.libs.push({
      Name: 'Films',
      Locations: ['/data/media/movies'],
      CollectionType: 'movies',
      ItemId: 'mine',
    });
    const { store, run } = setup(w);
    expect((await run()).ok).toBe(true);
    expect(w.arr.radarr.coll('rootfolder').items).toHaveLength(1);
    expect(w.qbt.categories['movies']?.['savePath']).toBe('/somewhere');
    expect(
      w.jf.libs.filter((l) => (l['Locations'] as string[]).includes('/data/media/movies')),
    ).toHaveLength(1);
    expect(store.ledger.find((e) => e.key === 'jellyfin.library.movies')).toMatchObject({
      id: 'mine',
      adopted: true,
    });
  });

  it('only wires what the plan asks for (torrents, movies)', async () => {
    const { world: w, run } = setup();
    const r = await run('run', {
      torrents: true,
      usenet: false,
      libraries: { movies: true, tv: false, music: false },
      quality: 'small',
      audio: [
        { code: 'de', required: false },
        { code: 'original', required: false },
      ],
      subtitles: [{ code: 'de', required: false }],
      language: 'de',
      country: 'DE',
      usenetServers: [],
      usenetIndexers: [],
      gpu: false,
    });
    expect(r.failed).toEqual([]);
    expect(w.sab.categories).toHaveLength(0);
    expect(w.arr.sonarr.coll('downloadclient').items).toHaveLength(0);
    expect(w.arr.radarr.coll('downloadclient').items.map((c) => c['implementation'])).toEqual([
      'QBittorrent',
    ]);
    expect(w.arr.prowlarr.coll('applications').items).toHaveLength(1);
    expect(w.jf.libs.map((l) => l['Name'])).toEqual(['Movies']);
    expect(w.jf.encoding['HardwareAccelerationType']).toBe('none');
    expect(w.bz.settings['settings-general-use_sonarr']).toBe('false');
    // Step 8's languages: subtitles in Bazarr (not "Original"), titles in Jellyfin.
    expect(w.bz.enabled).toEqual(['de']);
    expect(w.bz.profiles[0]).toMatchObject({ name: 'German', items: [{ language: 'de' }] });
    expect(w.jf.libs[0]?.['options']).toMatchObject({
      PreferredMetadataLanguage: 'de',
      MetadataCountryCode: 'DE',
    });
  });

  describe('media languages (D-066)', () => {
    const scores = (w: World, app: 'sonarr' | 'radarr') => {
      const formats = w.arr[app].coll('customformat').items;
      const profile = w.arr[app]
        .coll('qualityprofile')
        .items.find((p) => String(p['name']).startsWith('EasyArr'));
      return Object.fromEntries(
        ((profile?.['formatItems'] as Record<string, unknown>[]) ?? []).map((i) => [
          formats.find((f) => f['id'] === i['format'])?.['name'],
          i['score'],
        ]),
      );
    };

    const a = (code: string, required = false) => ({ code, required });

    it('ranks the audio languages in Sonarr + Radarr, refuses files without a must-have, Radarr takes any language', async () => {
      const { world: w, run } = setup();
      const plan = {
        ...everything,
        audio: [a('de', true), a('en', true), a('original')],
        subtitles: [a('de', true), a('en')],
      };
      expect((await run('run', plan)).failed).toEqual([]);
      for (const app of ['sonarr', 'radarr'] as const) {
        expect(scores(w, app)).toEqual({
          'EasyArr – Language: German': 6000,
          'EasyArr – Language: English': 4000,
          'EasyArr – Language: Original': 2000,
          'EasyArr – Language: none you need': -10000,
        });
        // "None you need" = neither German nor English (Original isn't a must-have).
        const none = w.arr[app]
          .coll('customformat')
          .items.find((f) => f['name'] === 'EasyArr – Language: none you need');
        expect(none?.['specifications']).toMatchObject([
          { negate: true, required: true, fields: [{ name: 'value', value: 4 }, {}] },
          { negate: true, required: true, fields: [{ name: 'value', value: 1 }, {}] },
        ]);
        // English only counts when German isn't there (the best language wins, no sums).
        const english = w.arr[app]
          .coll('customformat')
          .items.find((f) => f['name'] === 'EasyArr – Language: English');
        expect(english?.['specifications']).toMatchObject([
          { negate: false, required: false, fields: [{ name: 'value', value: 1 }, {}] },
          { negate: true, required: true, fields: [{ name: 'value', value: 4 }, {}] },
        ]);
      }
      const radarrProfile = w.arr.radarr
        .coll('qualityprofile')
        .items.find((p) => String(p['name']).startsWith('EasyArr'));
      expect(radarrProfile?.['language']).toEqual({ id: -1, name: 'Any' });
      // Recyclarr leaves these scores alone.
      expect(w.recyclarrConfig).toMatch(/except_patterns:\n\s+- "\^EasyArr – Language: "/);
      // Subtitles: the subtitle list, in order; Jellyfin plays German audio first.
      expect(w.bz.enabled).toEqual(['de', 'en']);
      expect(w.bz.profiles[0]).toMatchObject({
        name: 'German, English',
        items: [
          { id: 1, language: 'de' },
          { id: 2, language: 'en' },
        ],
      });
      expect(w.jf.userConfig).toMatchObject({
        AudioLanguagePreference: 'ger',
        PlayDefaultAudioTrack: false,
        SubtitleLanguagePreference: 'ger',
        SubtitleMode: 'Smart',
        HidePlayedInLatest: true,
      });
      // Idempotent.
      expect((await run('run', plan)).changes).toBe(0);
    });

    it('follows a changed list: new order, dropped languages score 0, Original → Jellyfin "OriginalLanguage"', async () => {
      const { world: w, run } = setup();
      await run('run', { ...everything, audio: [a('de', true), a('en'), a('original')] });
      // No must-haves any more: nothing is refused for its language, the order still counts.
      const r = await run('run', { ...everything, audio: [a('original'), a('de')], subtitles: [] });
      expect(r.failed).toEqual([]);
      expect(scores(w, 'sonarr')).toEqual({
        'EasyArr – Language: German': 2000,
        'EasyArr – Language: English': 0,
        'EasyArr – Language: Original': 4000,
        'EasyArr – Language: none you need': 0,
      });
      expect(w.jf.userConfig['AudioLanguagePreference']).toBe('OriginalLanguage');
    });

    it('no subtitle languages: Bazarr gets no profile, Jellyfin subtitle settings stay as they are', async () => {
      const { world: w, run } = setup();
      const r = await run('run', { ...everything, audio: [a('original')], subtitles: [] });
      expect(r.failed).toEqual([]);
      expect(w.bz.profiles).toEqual([]);
      expect(w.jf.userConfig).toMatchObject({
        AudioLanguagePreference: 'OriginalLanguage',
        SubtitleMode: 'Default',
        SubtitleLanguagePreference: null,
      });
      // No must-have audio: nothing is refused for its language.
      expect(
        w.arr.radarr
          .coll('customformat')
          .items.some((f) => f['name'] === 'EasyArr – Language: none you need'),
      ).toBe(false);
    });

    it('a Recyclarr sync putting "Original" back is undone in the same run', async () => {
      const { world: w, run } = setup();
      await run();
      await run('run', { ...everything, quality: 'best' }); // new preset → sync
      const profile = w.arr.radarr
        .coll('qualityprofile')
        .items.find((p) => p['name'] === 'EasyArr (Best quality)');
      expect(profile?.['language']).toEqual({ id: -1, name: 'Any' });
    });
  });

  const usenetPlan: WiringPlan = {
    ...everything,
    torrents: false,
    usenetServers: [
      {
        id: 'news',
        preset: null,
        host: FAKE_USENET_HOST,
        port: 563,
        ssl: true,
        username: 'me',
        connections: 20,
      },
    ],
    usenetIndexers: [
      {
        id: 'geek',
        preset: 'nzbgeek',
        name: 'NZBgeek',
        url: 'https://api.nzbgeek.info',
        apiPath: '/api',
      },
    ],
  };

  it('adds the news servers to SABnzbd and the indexers to Prowlarr (step 6), once', async () => {
    const w = new World();
    w.usenetSecrets = {
      servers: { news: FAKE_USENET_PASSWORD },
      indexers: { geek: FAKE_INDEXER_KEY },
    };
    const { store, run } = setup(w);
    const r = await run('run', usenetPlan);
    expect(r.failed).toEqual([]);
    expect(w.sab.servers).toEqual([
      expect.objectContaining({ name: FAKE_USENET_HOST, port: 563, connections: 20 }),
    ]);
    expect(w.sab.passwords[FAKE_USENET_HOST]).toBe(FAKE_USENET_PASSWORD);
    const indexers = w.arr.prowlarr.coll('indexer').items;
    expect(indexers).toHaveLength(1);
    expect(indexers[0]).toMatchObject({
      name: 'EasyArr – NZBgeek',
      implementation: 'Newznab',
      redirect: true,
      enable: true,
    });
    const fields = indexers[0]?.['fields'] as Json[];
    expect(fields.find((f) => f['name'] === 'baseUrl')?.['value']).toBe('https://api.nzbgeek.info');
    expect(store.ledger.map((e) => e.key)).toEqual(
      expect.arrayContaining(['sabnzbd.server.news', 'prowlarr.indexer.geek']),
    );

    const again = await run('run', usenetPlan);
    expect(again.changes).toBe(0);
    expect(w.sab.servers).toHaveLength(1);
    expect(w.arr.prowlarr.coll('indexer').items).toHaveLength(1);
  });

  it('a wrong indexer API key fails that step with the reason Prowlarr gives; the rest works', async () => {
    const w = new World();
    w.usenetSecrets = { servers: { news: FAKE_USENET_PASSWORD }, indexers: { geek: 'wrong' } };
    const { run } = setup(w);
    const r = await run('run', usenetPlan);
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([
      expect.objectContaining({
        step: 'prowlarr.indexers',
        error: expect.objectContaining({ details: ['ApiKey: Invalid API Key'] }),
      }),
    ]);
    expect(w.sab.servers).toHaveLength(1);
    expect(w.arr.sonarr.coll('downloadclient').items).toHaveLength(1);
  });

  it('a Usenet server the user already added for the same host is adopted', async () => {
    const w = new World();
    w.usenetSecrets = {
      servers: { news: FAKE_USENET_PASSWORD },
      indexers: { geek: FAKE_INDEXER_KEY },
    };
    w.sab.servers = [{ name: 'my-server', host: FAKE_USENET_HOST.toUpperCase(), port: 563 }];
    const { store, run } = setup(w);
    expect((await run('run', usenetPlan)).ok).toBe(true);
    expect(w.sab.servers).toHaveLength(1);
    expect(store.ledger.find((e) => e.key === 'sabnzbd.server.news')).toMatchObject({
      id: 'my-server',
      adopted: true,
    });
  });

  it('a Jellyfin set up with another account is a clear error, and other steps still run', async () => {
    const w = new World();
    w.jf.wizardDone = true;
    w.jf.user = { name: 'someone', pw: 'else' };
    const { run } = setup(w);
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([
      expect.objectContaining({
        step: 'jellyfin.setup',
        error: expect.objectContaining({ details: ['jellyfin_other_account'] }),
      }),
      expect.objectContaining({ step: 'jellyseerr.setup' }),
    ]);
    expect(w.arr.sonarr.coll('rootfolder').items).toHaveLength(1);
    expect(w.cu.setup).toBe(true);
  });

  it('a step that fails half-way still reports its notes and changes', async () => {
    const { world: w, run } = setup();
    w.arr.sonarr.reject = 'Sabnzbd'; // Sonarr refuses its SABnzbd connection (like a missing category)
    await run();
    const qbt = w.arr.sonarr
      .coll('downloadclient')
      .items.find((c) => c['implementation'] === 'QBittorrent');
    w.arr.sonarr.coll('downloadclient').remove(qbt?.['id'] as number);
    const r = await run();
    const failed = r.failed as { step: string; notes?: { code: string }[]; error?: unknown }[];
    expect(failed.map((f) => f.step)).toEqual(['sonarr.connect']);
    expect(failed[0]).toMatchObject({
      error: { details: ['TvCategory: Category does not exist'] },
    });
    expect(failed[0]?.notes).toEqual([expect.objectContaining({ code: 'deleted_by_user' })]);
  });
});
