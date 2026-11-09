import { readFileSync, writeFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { StepDeps } from '../steps.js';

// Only erasable TypeScript in this file: the e2e server (e2e/serve.mjs) loads it with Node's
// built-in type stripping to fake every service for the browser tests.

/**
 * Every service EasyArr wires, faked in memory behind one fetch(): just enough of each API
 * (shapes from docs/dev/research/*) to prove the steps are idempotent and follow SPEC §10.2.
 */
export type Json = Record<string, unknown>;

/** The fake indexer / news server accept exactly these secrets. */
export const FAKE_INDEXER_KEY = 'indexer-key-0123456789';
export const FAKE_USENET_PASSWORD = 'usenet-password-1';
export const FAKE_USENET_HOST = 'news.example.com';
/** A tiny poster for the fake Jellyfin (served with an image content type). */
export const FAKE_POSTER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3" fill="#357"/></svg>';
type Handler = (
  m: string,
  path: string,
  q: URLSearchParams,
  body: unknown,
  h: Headers,
) => [number, unknown] | undefined;

export class Collection {
  items: Json[] = [];
  next = 1;
  add(x: Json): Json {
    const item = { ...x, id: this.next++ };
    this.items.push(item);
    return item;
  }
  remove(id: number) {
    this.items = this.items.filter((i) => i['id'] !== id);
  }
}

export class FakeServarr {
  c: Record<string, Collection> = {};
  config: Record<string, Json> = {
    mediamanagement: { id: 1, copyUsingHardlinks: false, otherSetting: 'kept' },
    downloadclient: { id: 1, enableCompletedDownloadHandling: false, autoRedownloadFailed: true },
  };
  posts: string[] = [];
  version = '1.0.0';
  /** Log table entries, oldest first ({time, level, logger, message}). */
  log: Json[] = [];
  /** Implementation whose download-client POST fails validation (like a missing category). */
  reject: string | null = null;
  /** Indexer back-offs: indexer id → disabledTill (ISO), as GET /indexerstatus lists them. */
  paused = new Map<number, string>();
  /** Indexers whose site doesn't answer: a test fails and keeps them paused. */
  unreachable = new Set<number>();
  tests: number[] = [];
  /** Changes on every (re)start; GET /system/status shows it. */
  startTime = '2026-11-01T00:00:00.000Z';
  /** Backups/manual (Servarr BackupService): zip with config.xml + the database. */
  backups: { id: number; name: string; data: Uint8Array; time: string }[] = [];
  /** An uploaded restore: Servarr applies it when it restarts. */
  pendingRestore: Uint8Array | null = null;
  commands = new Collection();
  restarts = 0;
  readonly app: string;
  key: string;
  constructor(app: string, key: string) {
    this.app = app;
    this.key = key;
    for (const n of [
      'qualityprofile',
      'metadataprofile',
      'rootfolder',
      'downloadclient',
      'applications',
      'indexerproxy',
      'indexer',
      'tag',
      'appprofile',
      'customformat',
    ]) {
      this.c[n] = new Collection();
    }
    const profiles = app === 'lidarr' ? ['Any', 'Lossless', 'Standard'] : ['Any', 'HD-1080p'];
    for (const name of profiles) this.addProfile(name);
    this.coll('metadataprofile').add({ name: 'Standard' });
    this.coll('appprofile').add({ name: 'Standard' });
  }
  coll(n: string): Collection {
    return this.c[n] as Collection;
  }
  /** Like a real profile: one score per custom format; Radarr's has a language ("Original" from the guide). */
  addProfile(name: string): Json {
    const formatItems = this.coll('customformat').items.map((f) => ({
      format: f['id'],
      name: f['name'],
      score: 0,
    }));
    return this.coll('qualityprofile').add({
      name,
      formatItems,
      ...(this.app === 'radarr' ? { language: { id: -2, name: 'Original' } } : {}),
    });
  }
  /** What a backup zip holds: config.xml (with the API key) + the "database" (all collections). */
  snapshot(): Uint8Array {
    const db = {
      c: Object.fromEntries(
        Object.entries(this.c).map(([k, v]) => [k, { items: v.items, next: v.next }]),
      ),
      config: this.config,
    };
    return zipSync({
      'config.xml': strToU8(
        `<Config>\n  <ApiKey>${this.key}</ApiKey>\n  <UrlBase>/apps/${this.app}</UrlBase>\n</Config>\n`,
      ),
      [`${this.app}.db`]: strToU8(JSON.stringify(db)),
    });
  }
  /** POST /system/restart: a new process, which applies a pending restore first. */
  restart(): void {
    this.restarts += 1;
    this.startTime = new Date(Date.parse(this.startTime) + 60_000 * this.restarts).toISOString();
    if (!this.pendingRestore) return;
    const files = unzipSync(this.pendingRestore);
    this.pendingRestore = null;
    const xmlName = Object.keys(files).find((n) => n.toLowerCase() === 'config.xml');
    const key = xmlName
      ? /<ApiKey>([^<]*)<\/ApiKey>/.exec(strFromU8(files[xmlName] as Uint8Array))?.[1]
      : undefined;
    if (key) this.key = key;
    const dbFile = files[`${this.app}.db`];
    if (dbFile) {
      const db = JSON.parse(strFromU8(dbFile)) as {
        c: Record<string, { items: Json[]; next: number }>;
        config: Record<string, Json>;
      };
      for (const [k, v] of Object.entries(db.c)) {
        const col = new Collection();
        col.items = v.items;
        col.next = v.next;
        this.c[k] = col;
      }
      this.config = db.config;
    }
  }
  handle: Handler = (m, path, q, body, h) => {
    const base = `/apps/${this.app}/api/${this.app === 'sonarr' || this.app === 'radarr' ? 'v3' : 'v1'}`;
    // Backup files are served outside the API (BackupFileMapper), name pattern checked.
    const files = `/apps/${this.app}/backup/manual/`;
    if (path.startsWith(files)) {
      if (h.get('x-api-key') !== this.key) return [401, ''];
      const b = this.backups.find((x) => x.name === path.slice(files.length));
      return b ? [200, b.data] : [404, ''];
    }
    if (!path.startsWith(base)) return [404, 'no url base'];
    if (h.get('x-api-key') !== this.key) return [401, { message: 'Unauthorized' }];
    const [, res, id, sub, sub2] = path.slice(base.length).split('/');
    if (res === 'system' && id === 'backup') {
      if (m === 'GET' && !sub)
        return [
          200,
          this.backups.map((b) => ({
            id: b.id,
            name: b.name,
            path: `/backup/manual/${b.name}`,
            type: 'manual',
            size: b.data.length,
            time: b.time,
          })),
        ];
      if (m === 'DELETE' && sub) {
        this.backups = this.backups.filter((b) => b.id !== Number(sub));
        return [200, {}];
      }
      if (m === 'POST' && sub === 'restore' && sub2 === 'upload') {
        const file = (body as { file?: Uint8Array } | undefined)?.file;
        if (!file) return [400, { message: 'file must be provided' }];
        try {
          unzipSync(file);
        } catch {
          return [500, { message: 'Unable to restore backup' }];
        }
        this.pendingRestore = file;
        return [200, { restartRequired: true }];
      }
    }
    if (res === 'system' && id === 'restart' && m === 'POST') {
      this.restart();
      return [200, {}];
    }
    if (res === 'system')
      return [
        200,
        {
          appName: this.app.charAt(0).toUpperCase() + this.app.slice(1),
          version: this.version,
          startTime: this.startTime,
        },
      ];
    if (res === 'command' && m === 'POST' && (body as Json)['name'] === 'Backup') {
      const n = this.backups.length + 1;
      const name = `${this.app}_backup_v${this.version}_2026.11.09_04.00.${String(n).padStart(2, '0')}.zip`;
      this.backups.push({
        id: 1000 + n,
        name,
        data: this.snapshot(),
        time: new Date().toISOString(),
      });
      return [201, this.commands.add({ name: 'Backup', status: 'completed' })];
    }
    if (res === 'command' && m === 'GET' && id) {
      const c = this.commands.items.find((x) => x['id'] === Number(id));
      return c ? [200, c] : [404, ''];
    }
    if (res === 'log')
      return [200, { page: 1, totalRecords: this.log.length, records: [...this.log].reverse() }];
    if (res === 'config' && id) {
      if (m === 'GET') return [200, this.config[id]];
      // PUT replaces the object: missing keys would be lost, so the client must send everything.
      this.config[id] = body as Json;
      return [202, body];
    }
    if (res === 'qualityprofile' && id === 'schema') {
      return [
        200,
        {
          items: [1000, 1001, 1002, 1003, 1004, 1005].map((g) => ({
            id: g,
            name: `g${g}`,
            items: [{ quality: { id: g - 999, name: 'q' }, items: [], allowed: false }],
            allowed: false,
          })),
        },
      ];
    }
    if (res === 'indexer' && id === 'schema') {
      const t = (name: string) => ({
        name,
        implementation: 'Newznab',
        configContract: 'NewznabSettings',
        protocol: 'usenet',
        fields: [
          { name: 'baseUrl', value: '' },
          { name: 'apiPath', value: '/api' },
          { name: 'apiKey', value: '' },
          { name: 'vipExpiration', value: '' },
        ],
      });
      return [200, [t('NZBgeek'), t('Generic Newznab')]];
    }
    if (res === 'indexerstatus') {
      return [
        200,
        [...this.paused].map(([indexerId, disabledTill], i) => ({
          id: i + 1,
          indexerId,
          disabledTill,
          initialFailure: disabledTill,
          mostRecentFailure: disabledTill,
        })),
      ];
    }
    const testedId = (body as Json | undefined)?.['id'];
    if (
      res === 'indexer' &&
      id === 'test' &&
      typeof testedId === 'number' &&
      (this.paused.has(testedId) || this.unreachable.has(testedId))
    ) {
      // IndexerFactory.Test: success → RecordSuccess (pause cleared), failure → RecordFailure.
      this.tests.push(testedId);
      if (this.unreachable.has(testedId)) {
        this.paused.set(testedId, new Date(Date.now() + 3600_000).toISOString());
        return [400, [{ propertyName: '', errorMessage: 'Unable to connect to indexer' }]];
      }
      this.paused.delete(testedId);
      return [200, {}];
    }
    if (res === 'indexer' && (id === 'test' || m === 'POST')) {
      const b = body as Json;
      const key = (b['fields'] as Json[] | undefined)?.find((f) => f['name'] === 'apiKey')?.[
        'value'
      ];
      if (b['redirect'] !== true)
        return [400, [{ propertyName: 'Redirect', errorMessage: 'Redirect must be enabled' }]];
      if (key !== FAKE_INDEXER_KEY)
        return [400, [{ propertyName: 'ApiKey', errorMessage: 'Invalid API Key' }]];
      if (id === 'test') return [200, {}];
    }
    const col = res ? this.c[res] : undefined;
    if (!col) return [404, `unknown ${path}`];
    if (m === 'GET') return [200, col.items];
    if (m === 'POST') {
      this.posts.push(res as string);
      const b = body as Json;
      if (res === 'tag')
        return [201, col.items.find((t) => t['label'] === b['label']) ?? col.add(b)];
      if (res === 'downloadclient' && b['implementation'] === this.reject) {
        return [400, [{ propertyName: 'TvCategory', errorMessage: 'Category does not exist' }]];
      }
      if (
        res === 'indexerproxy' &&
        Array.isArray(b['tags']) &&
        b['tags'].length > 0 &&
        q.get('forceSave') !== 'true'
      ) {
        return [400, [{ propertyName: 'Host', errorMessage: 'Unable to reach the internet' }]];
      }
      if (res === 'customformat') {
        if (col.items.some((f) => f['name'] === b['name']))
          return [400, [{ propertyName: 'Name', errorMessage: 'Must be unique' }]];
        const made = col.add(b);
        // A new format joins every profile with score 0 (CustomFormatService → profiles).
        for (const p of this.coll('qualityprofile').items)
          (p['formatItems'] as Json[] | undefined)?.push({
            format: made['id'],
            name: made['name'],
            score: 0,
          });
        return [201, made];
      }
      return [201, col.add(b)];
    }
    if (m === 'PUT' && id) {
      const i = col.items.findIndex((x) => x['id'] === Number(id));
      if (i < 0) return [404, 'gone'];
      // Providers test on PUT unless forced; formats and profiles have no test.
      const tested = res !== 'customformat' && res !== 'qualityprofile';
      if (tested && q.get('forceSave') !== 'true') return [400, [{ errorMessage: 'test failed' }]];
      this.posts.push(`PUT ${res as string}`);
      col.items[i] = { ...(body as Json), id: Number(id) };
      return [202, col.items[i]];
    }
    return [405, 'method'];
  };
}

export class World {
  keys: Record<string, string> = {
    sonarr: 's'.repeat(32),
    radarr: 'r'.repeat(32),
    lidarr: 'l'.repeat(32),
    prowlarr: 'p'.repeat(32),
    sabnzbd: 'z'.repeat(32),
    bazarr: 'b'.repeat(32),
  };
  arr = {
    sonarr: new FakeServarr('sonarr', this.keys['sonarr'] as string),
    radarr: new FakeServarr('radarr', this.keys['radarr'] as string),
    lidarr: new FakeServarr('lidarr', this.keys['lidarr'] as string),
    prowlarr: new FakeServarr('prowlarr', this.keys['prowlarr'] as string),
  };
  // torrents: qBittorrent 5.3 /api/v2/torrents/info entries (dashboard status, phase 07).
  qbt = {
    prefs: {} as Json,
    categories: {} as Record<string, Json>,
    torrents: [] as Json[],
    log: [] as Json[],
  };
  // A fresh SABnzbd (INI written by init) has no [categories] section: get_config → {config:{}}.
  sab = {
    categories: [] as Json[],
    servers: [] as Json[],
    passwords: {} as Record<string, string>,
    /** mode=queue: kbpersec + slots, as SABnzbd 5.1 answers. */
    queue: { kbpersec: '0', slots: [] as Json[] },
  };
  /** Wizard step 6 secrets, by entry id. */
  usenetSecrets = { servers: {} as Record<string, string>, indexers: {} as Record<string, string> };
  bz = {
    profiles: [] as Json[],
    settings: {} as Record<string, string>,
    enabled: [] as string[],
    wantedMovies: [] as Json[],
    wantedEpisodes: [] as Json[],
  };
  jf = {
    wizardDone: false,
    user: null as null | { name: string; pw: string },
    keys: [] as Json[],
    libs: [] as Json[],
    encoding: { HardwareAccelerationType: 'none', Other: 1 } as Json,
    /** The admin's playback settings (Jellyfin 10.11 UserConfiguration defaults). */
    userConfig: {
      AudioLanguagePreference: null,
      PlayDefaultAudioTrack: true,
      SubtitleLanguagePreference: null,
      SubtitleMode: 'Default',
      HidePlayedInLatest: true,
    } as Json,
    /** /Items answers (newest first), for "recently added". */
    items: [] as Json[],
    /** /health answers 503 this many more times (the restart after a restore). */
    downProbes: 0,
    restores: 0,
  };
  /**
   * Jellyfin's backups folder (/config/data/backups) on the "host": the dashboard reads and writes
   * the same folder (D-070). Unset = Backup/Create fails like a missing folder.
   */
  jfBackupsDir: string | null = null;
  seerr = {
    type: 4,
    initialized: false,
    apiKey: 'seerr-key',
    libs: [{ id: 'lib1', name: 'Movies', enabled: false, type: 'movie' }] as Json[],
    sonarr: new Collection(),
    radarr: new Collection(),
  };
  cu = {
    setup: false,
    account: null as null | Json,
    apiKey: 'cu-key',
    general: {
      auth: { disableAuthForLocalAddresses: false, trustForwardedHeaders: true },
      keep: 1,
    } as Json,
    sonarr: new Collection(),
    radarr: new Collection(),
    lidarr: new Collection(),
    clients: new Collection(),
    // Fresh-install answers of Cleanuparr 2.10.12: Queue Cleaner off, no rules, Seeker reactive only.
    queueCleaner: {
      enabled: false,
      cronExpression: '0 0/5 * * * ?',
      useAdvancedScheduling: false,
      failedImport: { maxStrikes: 0, patterns: [], patternMode: 'Include' },
      ignoredDownloads: [],
      processNoContentId: false,
      downloadingMetadataMaxStrikes: 0,
      errored: { maxStrikes: 0, ignorePrivate: false, deletePrivate: false, changeCategory: false },
    } as Json,
    stall: new Collection(),
    seeker: {
      searchEnabled: true,
      searchInterval: 3,
      proactiveSearchEnabled: false,
      selectionStrategy: 'BalancedWeighted',
      useRoundRobin: true,
      postReleaseGraceHours: 6,
    } as Json,
    seekerInstances: {} as Record<string, Json>,
  };
  recyclarrSyncs = 0;
  calls: string[] = [];

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const m = init?.method ?? 'GET';
    const h = new Headers(init?.headers);
    const type = h.get('content-type') ?? '';
    let body: unknown;
    if (init?.body instanceof FormData || type.startsWith('multipart/form-data')) {
      // Servarr's restore upload: the first file of the form.
      const form =
        init?.body instanceof FormData
          ? init.body
          : await new Response(init?.body as ConstructorParameters<typeof Response>[0], {
              headers: { 'content-type': type },
            }).formData();
      const file = form.get('file');
      body = {
        file: file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : undefined,
      };
    } else {
      const raw = init?.body === undefined ? undefined : String(init.body);
      body =
        raw === undefined
          ? undefined
          : type.includes('json')
            ? JSON.parse(raw)
            : new URLSearchParams(raw);
    }
    const host = url.hostname;
    this.calls.push(`${m} ${host}${url.pathname}`);
    const handler: Handler | undefined =
      host in this.arr
        ? this.arr[host as keyof World['arr']].handle
        : (this as unknown as Record<string, Handler>)[host];
    const r = handler?.(m, url.pathname, url.searchParams, body, h) ?? [
      404,
      `no fake for ${m} ${url}`,
    ];
    const [status, data] = r;
    const headers = new Headers();
    if (host === 'jellyseerr' && url.pathname === '/api/v1/auth/jellyfin' && status === 200)
      headers.append('set-cookie', 'connect.sid=abc; Path=/');
    if (data === FAKE_POSTER_SVG) headers.set('content-type', 'image/svg+xml');
    if (data instanceof Uint8Array) headers.set('content-type', 'application/zip');
    return new Response(
      data === undefined || status === 204
        ? null
        : data instanceof Uint8Array
          ? new Uint8Array(data)
          : typeof data === 'string'
            ? data
            : JSON.stringify(data),
      { status, headers },
    );
  };

  qbittorrent: Handler = (_m, path, _q, body) => {
    if (path === '/api/v2/app/version') return [200, 'v5.3.0'];
    if (path === '/api/v2/torrents/info') return [200, this.qbt.torrents];
    if (path === '/api/v2/log/main') return [200, this.qbt.log];
    if (path === '/api/v2/app/setPreferences') {
      Object.assign(this.qbt.prefs, JSON.parse((body as URLSearchParams).get('json') ?? '{}'));
      return [200, ''];
    }
    if (path === '/api/v2/torrents/categories') return [200, this.qbt.categories];
    if (path === '/api/v2/torrents/createCategory') {
      const b = body as URLSearchParams;
      const name = b.get('category') as string;
      if (name in this.qbt.categories) return [409, 'Unable to create category'];
      this.qbt.categories[name] = { name, savePath: b.get('savePath') };
      return [200, ''];
    }
    return undefined;
  };

  sabnzbd: Handler = (_m, path, query, body) => {
    if (path !== '/api') return undefined;
    // SABnzbd reads parameters from the query string and from a POSTed form alike.
    const q = new URLSearchParams(query);
    if (body instanceof URLSearchParams) for (const [k, v] of body) q.set(k, v);
    if (q.get('apikey') !== this.keys['sabnzbd'])
      return [200, { status: false, error: 'API Key Incorrect' }];
    const mode = q.get('mode');
    if (mode === 'version') return [200, { version: '5.1.3' }];
    if (mode === 'queue') return [200, { queue: this.sab.queue }];
    if (mode === 'get_config' && q.get('section') === 'servers')
      return [200, { config: this.sab.servers.length ? { servers: this.sab.servers } : {} }];
    if (mode === 'get_config') {
      return [
        200,
        { config: this.sab.categories.length ? { categories: this.sab.categories } : {} },
      ];
    }
    if (mode === 'config' && q.get('name') === 'test_server') {
      if (q.get('host') !== FAKE_USENET_HOST)
        return [
          200,
          {
            value: {
              result: false,
              message: `Server address "${q.get('host')}:${q.get('port')}" is not valid.`,
            },
          },
        ];
      return q.get('password') === FAKE_USENET_PASSWORD
        ? [200, { value: { result: true, message: 'Connection Successful!' } }]
        : [
            200,
            {
              value: { result: false, message: 'Authentication failed, check username/password.' },
            },
          ];
    }
    if (mode === 'set_config' && q.get('section') === 'servers') {
      this.sab.servers = [
        ...this.sab.servers.filter((c) => c['name'] !== q.get('name')),
        {
          name: q.get('name'),
          host: q.get('host'),
          port: Number(q.get('port')),
          username: q.get('username'),
          password: '**********',
          connections: Number(q.get('connections')),
        },
      ];
      this.sab.passwords[q.get('name') ?? ''] = q.get('password') ?? '';
      return [200, { config: {} }];
    }
    if (mode === 'set_config') {
      this.sab.categories = [
        ...this.sab.categories.filter((c) => c['name'] !== q.get('name')),
        { name: q.get('name'), dir: q.get('dir') },
      ];
      return [200, { config: {} }];
    }
    return undefined;
  };

  bazarr: Handler = (m, path, _q, body, h) => {
    if (!path.startsWith('/apps/bazarr/api/')) return [404, 'no base'];
    const p = path.slice('/apps/bazarr/api'.length);
    if (p === '/system/ping') return [200, { status: 'OK' }];
    if (h.get('x-api-key') !== this.keys['bazarr']) return [401, ''];
    if (p === '/system/status') return [200, { data: { bazarr_version: '1.5.3' } }];
    if (p === '/system/languages/profiles') return [200, this.bz.profiles];
    // "Wanted" = items still missing a subtitle of their profile (Bazarr 1.6 api/*/wanted.py).
    if (p === '/movies/wanted' || p === '/episodes/wanted') {
      const data = p === '/movies/wanted' ? this.bz.wantedMovies : this.bz.wantedEpisodes;
      return [200, { data, total: data.length }];
    }
    if (p === '/system/settings' && m === 'POST') {
      const enabled = (body as URLSearchParams).getAll('languages-enabled');
      // Any languages-enabled value disables every language first, then enables the listed ones.
      if (enabled.length > 0) this.bz.enabled = enabled;
      for (const [k, v] of body as URLSearchParams) {
        this.bz.settings[k] = v;
        if (k === 'languages-profiles') this.bz.profiles = JSON.parse(v) as Json[];
      }
      return [204, undefined];
    }
    return undefined;
  };

  jellyfin: Handler = (m, path, q, body, h) => {
    const auth = h.get('authorization') ?? '';
    const token = /Token="([^"]+)"/.exec(auth)?.[1];
    const authed =
      token !== undefined &&
      (token === 'session' || this.jf.keys.some((k) => k['AccessToken'] === token));
    const b = body as Json;
    if (path === '/health') {
      if (this.jf.downProbes > 0) {
        this.jf.downProbes -= 1;
        return [503, 'Unhealthy'];
      }
      return [200, 'Healthy'];
    }
    if (path === '/System/Info/Public')
      return [200, { Id: 'x', Version: '10.11.2', StartupWizardCompleted: this.jf.wizardDone }];
    if (path.startsWith('/Startup/')) {
      if (this.jf.wizardDone) return [401, ''];
      if (path === '/Startup/User' && m === 'GET') this.jf.user ??= { name: 'abc', pw: '' };
      if (path === '/Startup/User' && m === 'POST')
        this.jf.user = { name: b['Name'] as string, pw: b['Password'] as string };
      if (path === '/Startup/Complete') this.jf.wizardDone = true;
      return [204, undefined];
    }
    if (path === '/Users/AuthenticateByName') {
      return this.jf.user?.name === b['Username'] && this.jf.user?.pw === b['Pw']
        ? [200, { AccessToken: 'session', User: { Id: 'u1', Name: b['Username'] } }]
        : [401, ''];
    }
    if (!authed) return [401, ''];
    if (path === '/System/Info') return [200, {}];
    if (path === '/Backup/Create' && m === 'POST') {
      if (!this.jfBackupsDir) return [500, { message: 'Could not find a part of the path' }];
      const name = `jellyfin-backup-${Date.now()}-${this.jf.restores}.zip`;
      const data: Json = { ...this.jf };
      delete data['downProbes'];
      delete data['restores'];
      writeFileSync(
        `${this.jfBackupsDir}/${name}`,
        zipSync({ 'jellyfin.json': strToU8(JSON.stringify(data)) }),
      );
      return [200, { Path: `/config/data/backups/${name}`, ServerVersion: '10.11.2' }];
    }
    if (path === '/Backup/Restore' && m === 'POST') {
      const file = String(b['ArchiveFileName'] ?? '');
      if (!this.jfBackupsDir || !file.startsWith('/config/data/backups/')) return [404, ''];
      let restored: Json;
      try {
        const zip = unzipSync(
          readFileSync(`${this.jfBackupsDir}/${file.split('/').pop() as string}`),
        );
        restored = JSON.parse(strFromU8(zip['jellyfin.json'] as Uint8Array)) as Json;
      } catch {
        return [404, ''];
      }
      // ScheduleRestoreAndRestartServer: down while restoring, then the restored server.
      Object.assign(this.jf, restored, { downProbes: 2, restores: this.jf.restores + 1 });
      return [204, undefined];
    }
    if (path === '/Items' && m === 'GET') return [200, { Items: this.jf.items }];
    const img = /^\/Items\/([0-9a-f]{32})\/Images\/Primary$/.exec(path);
    if (img) return [200, FAKE_POSTER_SVG];
    if (path === '/Auth/Keys' && m === 'GET') return [200, { Items: this.jf.keys }];
    if (path === '/Auth/Keys') {
      this.jf.keys.push({
        AppName: q.get('app'),
        AccessToken: `jf-key-${this.jf.keys.length + 1}`,
        DateCreated: '2026-11-01',
      });
      return [204, undefined];
    }
    if (path === '/Users' && m === 'GET')
      return [200, this.jf.user ? [{ Id: 'u1', Name: this.jf.user.name }] : []];
    if (path === '/Users/u1' && m === 'GET')
      return [200, { Id: 'u1', Configuration: this.jf.userConfig }];
    if (path === '/Users/Configuration' && m === 'POST') {
      if (q.get('userId') !== 'u1') return [404, ''];
      this.jf.userConfig = b; // replaces the whole object, like Jellyfin
      return [204, undefined];
    }
    if (path === '/Library/VirtualFolders' && m === 'GET') return [200, this.jf.libs];
    if (path === '/Library/VirtualFolders') {
      let name = q.get('name') as string;
      while (this.jf.libs.some((l) => l['Name'] === name)) name += '2'; // Jellyfin renames duplicates
      this.jf.libs.push({
        Name: name,
        Locations: [q.get('paths')],
        CollectionType: q.get('collectionType'),
        ItemId: `lib-${name}`,
        options: b['LibraryOptions'],
      });
      return [204, undefined];
    }
    if (path === '/System/Configuration/encoding') {
      if (m === 'GET') return [200, this.jf.encoding];
      this.jf.encoding = b;
      return [204, undefined];
    }
    return undefined;
  };

  jellyseerr: Handler = (m, path, _q, body, h) => {
    const b = body as Json;
    if (path === '/api/v1/settings/public')
      return [200, { initialized: this.seerr.initialized, mediaServerType: this.seerr.type }];
    if (path === '/api/v1/auth/jellyfin') {
      if (this.seerr.type === 4 && !b['hostname']) return [500, { message: 'no hostname' }];
      if (this.seerr.type !== 4 && b['hostname'])
        return [500, { message: 'hostname already configured' }];
      if (this.jf.user?.name !== b['username'] || this.jf.user?.pw !== b['password'])
        return [401, { message: 'bad login' }];
      this.seerr.type = 2;
      return [200, { id: 1 }];
    }
    const ok = h.get('cookie') === 'connect.sid=abc' || h.get('x-api-key') === this.seerr.apiKey;
    if (!ok) return [403, ''];
    if (path === '/api/v1/settings/main') return [200, { apiKey: this.seerr.apiKey }];
    if (path === '/api/v1/settings/jellyfin/library/sync') return [200, this.seerr.libs];
    if (path.startsWith('/api/v1/settings/jellyfin/library/')) {
      const lib = this.seerr.libs.find((l) => l['id'] === path.split('/').pop());
      if (lib) lib['enabled'] = true;
      return [200, lib];
    }
    const one = /^\/api\/v1\/settings\/(sonarr|radarr)\/(\d+)$/.exec(path);
    if (one && m === 'PUT') {
      const col = this.seerr[one[1] as 'sonarr' | 'radarr'];
      const i = col.items.findIndex((x) => x['id'] === Number(one[2]));
      if (i < 0) return [404, ''];
      // Seerr's OpenAPI validator (v3.5.1 seerr-api.yml): `id` is readOnly in Sonarr/RadarrSettings.
      if ('id' in b) return [400, { message: 'request/body/id is read-only' }];
      col.items[i] = { ...b, id: Number(one[2]) };
      return [200, col.items[i]];
    }
    const kind = /^\/api\/v1\/settings\/(sonarr|radarr)(\/test)?$/.exec(path);
    if (kind) {
      const col = this.seerr[kind[1] as 'sonarr' | 'radarr'];
      if (kind[2]) {
        const arr = this.arr[kind[1] as 'sonarr' | 'radarr'];
        if (b['apiKey'] !== arr.key || b['baseUrl'] !== `/apps/${kind[1]}`)
          return [500, { message: 'Failed to connect' }];
        return [
          200,
          { profiles: arr.coll('qualityprofile').items, rootFolders: arr.coll('rootfolder').items },
        ];
      }
      return m === 'GET' ? [200, col.items] : [201, col.add(b)];
    }
    if (path === '/api/v1/settings/initialize') {
      this.seerr.initialized = true;
      return [200, {}];
    }
    return undefined;
  };

  cleanuparr: Handler = (m, path, _q, body, h) => {
    if (!path.startsWith('/apps/cleanuparr/')) return [404, ''];
    const p = path.slice('/apps/cleanuparr'.length);
    const b = body as Json;
    if (p === '/health') return [200, 'Healthy'];
    if (p === '/api/auth/status') return [200, { setupCompleted: this.cu.setup }];
    if (p === '/api/auth/setup/account') {
      if (this.cu.account) return [409, ''];
      this.cu.account = b;
      return [201, {}];
    }
    if (p === '/api/auth/setup/complete') {
      this.cu.setup = true;
      return [200, {}];
    }
    if (p === '/api/auth/login') {
      return b['password'] === this.cu.account?.['password']
        ? [200, { tokens: { accessToken: 'jwt' } }]
        : [401, ''];
    }
    if (!this.cu.setup) return [403, { error: 'Setup required' }];
    if (p === '/api/account/api-key')
      return h.get('authorization') === 'Bearer jwt'
        ? [200, { apiKey: this.cu.apiKey }]
        : [401, ''];
    if (h.get('x-api-key') !== this.cu.apiKey) return [401, ''];
    if (p === '/api/status') return [200, { application: { version: '2.10.12.0' } }];
    if (p === '/api/configuration/general') {
      if (m === 'GET') return [200, this.cu.general];
      this.cu.general = b;
      return [200, {}];
    }
    const arr = /^\/api\/configuration\/(sonarr|radarr|lidarr)(\/instances)?$/.exec(p);
    if (arr) {
      const type = arr[1] as 'sonarr';
      const col = this.cu[type];
      if (m === 'GET')
        return [
          200,
          { instances: col.items.map((i) => ({ ...i, id: `guid-${type}-${String(i['id'])}` })) },
        ];
      const made = col.add(b);
      return [201, { ...made, id: `guid-${type}-${String(made['id'])}` }];
    }
    if (p === '/api/configuration/queue_cleaner') {
      if (m === 'GET') return [200, this.cu.queueCleaner];
      this.cu.queueCleaner = b;
      return [200, {}];
    }
    if (p === '/api/queue-rules/stall') {
      const guid = (i: Json) => ({ ...i, id: `rule-${String(i['id'])}` });
      if (m === 'GET') return [200, this.cu.stall.items.map(guid)];
      if (this.cu.stall.items.some((r) => r['name'] === b['name'])) return [400, ''];
      return [201, guid(this.cu.stall.add(b))];
    }
    if (p === '/api/configuration/seeker') {
      // Only Sonarr/Radarr instances take part in the Seeker.
      const ids = (['sonarr', 'radarr'] as const).flatMap((t) =>
        this.cu[t].items.map((i) => `guid-${t}-${String(i['id'])}`),
      );
      if (m === 'GET')
        return [
          200,
          {
            ...this.cu.seeker,
            instances: ids.map((arrInstanceId) => ({
              arrInstanceId,
              enabled: false,
              minCycleTimeDays: 7,
              ...this.cu.seekerInstances[arrInstanceId],
            })),
          },
        ];
      const { instances, ...rest } = b as Json & { instances: Json[] };
      if (rest['proactiveSearchEnabled'] === true && !instances.some((i) => i['enabled']))
        return [400, ''];
      this.cu.seeker = rest;
      for (const i of instances) this.cu.seekerInstances[String(i['arrInstanceId'])] = i;
      return [200, {}];
    }
    if (p === '/api/configuration/download_client') {
      if (m === 'GET')
        return [
          200,
          { clients: this.cu.clients.items.map((i) => ({ ...i, id: `guid-${String(i['id'])}` })) },
        ];
      const made = this.cu.clients.add(b);
      return [201, { ...made, id: `guid-${String(made['id'])}` }];
    }
    return undefined;
  };

  flaresolverr: Handler = (_m, path) =>
    path === '/' ? [200, { msg: 'FlareSolverr is ready!', version: '3.5.2' }] : undefined;

  recyclarr: Handler = () => undefined;
  unpackerr: Handler = () => undefined;

  deps(): StepDeps {
    return {
      url: (id) => `http://${id}`,
      keys: async () => ({ ...this.keys }),
      saveKey: async (name, value) => {
        this.keys[name] = value;
      },
      account: async () => ({ username: 'owner', password: 'correct horse' }),
      gpu: async () => ({ vendor: 'intel', device: '/dev/dri/renderD128' }),
      usenetSecret: async (kind, id) => this.usenetSecrets[kind][id],
      fetch: this.fetch,
      recyclarr: {
        writeConfig: async (content) => {
          const changed = content !== this.recyclarrConfig;
          this.recyclarrConfig = content;
          return changed;
        },
        sync: async () => {
          this.recyclarrSyncs += 1;
          const name = /name: (EasyArr[^\n]*)/.exec(this.recyclarrConfig)?.[1]?.trim();
          for (const a of [this.arr.sonarr, this.arr.radarr]) {
            const existing = a.coll('qualityprofile').items.find((p) => p['name'] === name);
            if (name && !existing) a.addProfile(name);
            // A sync puts the guide's profile language back.
            if (existing && a.app === 'radarr') existing['language'] = { id: -2, name: 'Original' };
          }
        },
      },
    };
  }
  recyclarrConfig = '';
}
