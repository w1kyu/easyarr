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
  /** Implementation whose download-client POST fails validation (like a missing category). */
  reject: string | null = null;
  readonly app: string;
  readonly key: string;
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
    ]) {
      this.c[n] = new Collection();
    }
    const profiles = app === 'lidarr' ? ['Any', 'Lossless', 'Standard'] : ['Any', 'HD-1080p'];
    for (const name of profiles) this.coll('qualityprofile').add({ name });
    this.coll('metadataprofile').add({ name: 'Standard' });
    this.coll('appprofile').add({ name: 'Standard' });
  }
  coll(n: string): Collection {
    return this.c[n] as Collection;
  }
  handle: Handler = (m, path, q, body, h) => {
    const base = `/apps/${this.app}/api/${this.app === 'sonarr' || this.app === 'radarr' ? 'v3' : 'v1'}`;
    if (!path.startsWith(base)) return [404, 'no url base'];
    if (h.get('x-api-key') !== this.key) return [401, { message: 'Unauthorized' }];
    const [, res, id] = path.slice(base.length).split('/');
    if (res === 'system')
      return [200, { appName: this.app.charAt(0).toUpperCase() + this.app.slice(1), version: '1' }];
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
      return [201, col.add(b)];
    }
    if (m === 'PUT' && id) {
      const i = col.items.findIndex((x) => x['id'] === Number(id));
      if (i < 0) return [404, 'gone'];
      if (q.get('forceSave') !== 'true') return [400, [{ errorMessage: 'test failed' }]];
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
  qbt = { prefs: {} as Json, categories: {} as Record<string, Json> };
  // A fresh SABnzbd (INI written by init) has no [categories] section: get_config → {config:{}}.
  sab = {
    categories: [] as Json[],
    servers: [] as Json[],
    passwords: {} as Record<string, string>,
  };
  /** Wizard step 6 secrets, by entry id. */
  usenetSecrets = { servers: {} as Record<string, string>, indexers: {} as Record<string, string> };
  bz = { profiles: [] as Json[], settings: {} as Record<string, string> };
  jf = {
    wizardDone: false,
    user: null as null | { name: string; pw: string },
    keys: [] as Json[],
    libs: [] as Json[],
    encoding: { HardwareAccelerationType: 'none', Other: 1 } as Json,
  };
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
    const raw = init?.body === undefined ? undefined : String(init.body);
    const body: unknown =
      raw === undefined
        ? undefined
        : (h.get('content-type') ?? '').includes('json')
          ? JSON.parse(raw)
          : new URLSearchParams(raw);
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
    return new Response(
      data === undefined || status === 204
        ? null
        : typeof data === 'string'
          ? data
          : JSON.stringify(data),
      { status, headers },
    );
  };

  qbittorrent: Handler = (_m, path, _q, body) => {
    if (path === '/api/v2/app/version') return [200, 'v5.3.0'];
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
    if (p === '/system/languages/profiles') return [200, this.bz.profiles];
    if (p === '/system/settings' && m === 'POST') {
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
    if (path === '/health') return [200, 'Healthy'];
    if (path === '/System/Info/Public')
      return [200, { Id: 'x', StartupWizardCompleted: this.jf.wizardDone }];
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
    if (path === '/Auth/Keys' && m === 'GET') return [200, { Items: this.jf.keys }];
    if (path === '/Auth/Keys') {
      this.jf.keys.push({
        AppName: q.get('app'),
        AccessToken: `jf-key-${this.jf.keys.length + 1}`,
        DateCreated: '2026-11-01',
      });
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
            if (name && !a.coll('qualityprofile').items.some((p) => p['name'] === name))
              a.coll('qualityprofile').add({ name });
          }
        },
      },
    };
  }
  recyclarrConfig = '';
}
