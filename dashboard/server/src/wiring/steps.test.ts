import { describe, expect, it } from 'vitest';
import type { LedgerEntry, WiringRunSummary } from '../state/index.js';
import { WiringEngine, type LedgerStore, type WiringPlan } from './engine.js';
import { buildSteps, type StepDeps } from './steps.js';

/**
 * Every service EasyArr wires, faked in memory behind one fetch(): just enough of each API
 * (shapes from docs/dev/research/*) to prove the steps are idempotent and follow SPEC §10.2.
 */
type Json = Record<string, unknown>;
type Handler = (
  m: string,
  path: string,
  q: URLSearchParams,
  body: unknown,
  h: Headers,
) => [number, unknown] | undefined;

class Collection {
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

class FakeServarr {
  c: Record<string, Collection> = {};
  config: Record<string, Json> = {
    mediamanagement: { id: 1, copyUsingHardlinks: false, otherSetting: 'kept' },
    downloadclient: { id: 1, enableCompletedDownloadHandling: false, autoRedownloadFailed: true },
  };
  posts: string[] = [];
  constructor(
    readonly app: string,
    readonly key: string,
  ) {
    for (const n of [
      'qualityprofile',
      'metadataprofile',
      'rootfolder',
      'downloadclient',
      'applications',
      'indexerproxy',
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
    const col = res ? this.c[res] : undefined;
    if (!col) return [404, `unknown ${path}`];
    if (m === 'GET') return [200, col.items];
    if (m === 'POST') {
      this.posts.push(res as string);
      const b = body as Json;
      if (res === 'tag')
        return [201, col.items.find((t) => t['label'] === b['label']) ?? col.add(b)];
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

class World {
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
  sab = { categories: [] as Json[] };
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

  sabnzbd: Handler = (_m, path, q) => {
    if (path !== '/api') return undefined;
    if (q.get('apikey') !== this.keys['sabnzbd'])
      return [200, { status: false, error: 'API Key Incorrect' }];
    const mode = q.get('mode');
    if (mode === 'version') return [200, { version: '5.1.3' }];
    if (mode === 'get_config') {
      return [
        200,
        { config: this.sab.categories.length ? { categories: this.sab.categories } : {} },
      ];
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
      const col = this.cu[arr[1] as 'sonarr'];
      if (m === 'GET')
        return [
          200,
          { instances: col.items.map((i) => ({ ...i, id: `guid-${String(i['id'])}` })) },
        ];
      const made = col.add(b);
      return [201, { ...made, id: `guid-${String(made['id'])}` }];
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
    });
    expect(w.seerr.radarr.items).toHaveLength(1);

    expect(w.cu.setup).toBe(true);
    expect(w.keys['cleanuparr']).toBe('cu-key');
    expect(w.cu.general).toMatchObject({
      keep: 1,
      auth: { disableAuthForLocalAddresses: true, trustForwardedHeaders: false },
    });
    expect(w.cu.lidarr.items[0]).toMatchObject({ url: 'http://localhost:8686/apps/lidarr' });
    expect(w.cu.clients.items).toHaveLength(1);
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
});
