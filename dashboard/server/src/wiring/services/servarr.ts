import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * Sonarr 4 / Radarr 6 / Lidarr 3 / Prowlarr 2 API (docs/dev/research/servarr.md). Every call carries
 * the URL base (/apps/<name>); provider bodies always include every field, because missing fields
 * fall back to the provider's defaults (e.g. qBittorrent port 8080).
 */
export type ServarrApp = 'sonarr' | 'radarr' | 'lidarr' | 'prowlarr';

export const API_VERSION: Record<ServarrApp, 'v1' | 'v3'> = {
  sonarr: 'v3',
  radarr: 'v3',
  lidarr: 'v1',
  prowlarr: 'v1',
};

export interface Field {
  name: string;
  value?: unknown;
}

export const providerSchema = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  implementation: z.string(),
  fields: z.array(z.looseObject({ name: z.string(), value: z.unknown().optional() })),
  tags: z.array(z.number()).optional(),
});
export type Provider = z.infer<typeof providerSchema>;

const idName = z.looseObject({ id: z.number(), name: z.string() });
const rootFolderSchema = z.looseObject({ id: z.number(), path: z.string() });
const tagSchema = z.object({ id: z.number(), label: z.string() });

export function fieldValue(p: Pick<Provider, 'fields'>, name: string): unknown {
  return p.fields.find((f) => f.name === name)?.value;
}

const norm = (u: unknown) =>
  String(u ?? '')
    .replace(/\/+$/, '')
    .toLowerCase();

export class ServarrClient {
  readonly http: HttpClient;
  private readonly api: string;

  constructor(
    readonly app: ServarrApp,
    /** e.g. http://w1kyu-easyarr_vpn_1:8989 */
    baseUrl: string,
    /** e.g. /apps/sonarr */
    urlBase: string,
    apiKey: string,
    fetchImpl?: typeof fetch,
  ) {
    this.http = new HttpClient({
      service: app,
      baseUrl: `${baseUrl.replace(/\/$/, '')}${urlBase}`,
      headers: { 'x-api-key': apiKey },
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
    this.api = `/api/${API_VERSION[app]}`;
  }

  get<T>(path: string, schema: z.ZodType<T>) {
    return this.http.json(`${this.api}${path}`, schema);
  }

  post<T>(
    path: string,
    body: unknown,
    schema?: z.ZodType<T>,
    query?: Record<string, string | boolean>,
  ) {
    return this.http.json(`${this.api}${path}`, schema, {
      method: 'POST',
      body,
      ...(query ? { query } : {}),
    });
  }

  put<T>(
    path: string,
    body: unknown,
    schema?: z.ZodType<T>,
    query?: Record<string, string | boolean>,
  ) {
    return this.http.json(`${this.api}${path}`, schema, {
      method: 'PUT',
      body,
      ...(query ? { query } : {}),
    });
  }

  /**
   * Ready = API answers and the default profiles exist (they are created right after start-up,
   * so a 200 from system/status alone is a little too early).
   */
  async ready(): Promise<void> {
    const status = await this.get(
      '/system/status',
      z.looseObject({ appName: z.string(), version: z.string() }),
    );
    if (status.appName.toLowerCase() !== this.app) {
      throw new ServiceError(
        this.app,
        'invalid_response',
        `expected ${this.app}, found ${status.appName}`,
      );
    }
    const lists =
      this.app === 'prowlarr'
        ? ['/appprofile']
        : this.app === 'lidarr'
          ? ['/qualityprofile', '/metadataprofile']
          : ['/qualityprofile'];
    for (const l of lists) {
      if ((await this.get(l, z.array(z.unknown()))).length === 0) {
        throw new ServiceError(this.app, 'starting', `${l} is still empty`);
      }
    }
  }

  // --- providers (download clients, Prowlarr applications, indexer proxies) ---------------------

  providers(kind: string): Promise<Provider[]> {
    return this.get(`/${kind}`, z.array(providerSchema));
  }

  async providerExists(kind: string, id: string): Promise<boolean> {
    return (await this.providers(kind)).some((p) => String(p.id) === id);
  }

  async createProvider(kind: string, body: Record<string, unknown>): Promise<string> {
    const created = await this.post(`/${kind}`, body, providerSchema);
    return String(created.id);
  }

  // --- simple resources ------------------------------------------------------------------------

  rootFolders() {
    return this.get('/rootfolder', z.array(rootFolderSchema));
  }

  async rootFolderByPath(path: string): Promise<string | null> {
    const f = (await this.rootFolders()).find((r) => norm(r.path) === norm(path));
    return f ? String(f.id) : null;
  }

  qualityProfiles() {
    return this.get('/qualityprofile', z.array(idName));
  }

  metadataProfiles() {
    return this.get('/metadataprofile', z.array(idName));
  }

  /** Tags: POST returns the existing tag when the label exists. */
  async tag(label: string): Promise<number> {
    return (await this.post('/tag', { label }, tagSchema)).id;
  }

  /** GET → change → PUT a config resource (missing booleans would be saved as false). */
  async updateConfig(
    name: string,
    change: (c: Record<string, unknown>) => boolean,
  ): Promise<boolean> {
    const current = await this.get(`/config/${name}`, z.looseObject({ id: z.number() }));
    const next = { ...current };
    if (!change(next)) return false;
    await this.put(`/config/${name}/${current.id}`, next);
    return true;
  }
}

/** Matches a provider by implementation + host + port fields (how EasyArr recognises its own). */
export function sameTarget(
  p: Provider,
  implementation: string,
  fields: Record<string, unknown>,
): boolean {
  if (p.implementation !== implementation) return false;
  return Object.entries(fields).every(([k, v]) => norm(fieldValue(p, k)) === norm(v));
}

export const CATEGORY_FIELD: Record<Exclude<ServarrApp, 'prowlarr'>, string> = {
  sonarr: 'tv',
  radarr: 'movie',
  lidarr: 'music',
};

/** Full download-client body for qBittorrent (every field: missing ones fall back to defaults). */
export function qbittorrentClientBody(
  app: Exclude<ServarrApp, 'prowlarr'>,
  name: string,
  category: string,
) {
  const c = CATEGORY_FIELD[app];
  const cap = c.charAt(0).toUpperCase() + c.slice(1);
  return {
    enable: true,
    protocol: app === 'lidarr' ? 'TorrentDownloadProtocol' : 'torrent',
    priority: 1,
    removeCompletedDownloads: true,
    removeFailedDownloads: true,
    name,
    implementation: 'QBittorrent',
    configContract: 'QBittorrentSettings',
    tags: [],
    fields: [
      { name: 'host', value: 'localhost' },
      { name: 'port', value: 8090 },
      { name: 'useSsl', value: false },
      { name: 'urlBase', value: '' },
      { name: 'apiKey', value: '' },
      // Empty: qBittorrent trusts localhost (init's LocalHostAuth=false).
      { name: 'username', value: '' },
      { name: 'password', value: '' },
      { name: `${c}Category`, value: category },
      { name: `${c}ImportedCategory`, value: '' },
      { name: `recent${cap}Priority`, value: 0 },
      { name: `older${cap}Priority`, value: 0 },
      { name: 'initialState', value: 0 },
      { name: 'sequentialOrder', value: false },
      { name: 'firstAndLast', value: false },
      { name: 'contentLayout', value: 0 },
    ],
  };
}

export function sabnzbdClientBody(
  app: Exclude<ServarrApp, 'prowlarr'>,
  name: string,
  category: string,
  apiKey: string,
) {
  const c = CATEGORY_FIELD[app];
  const cap = c.charAt(0).toUpperCase() + c.slice(1);
  return {
    enable: true,
    protocol: app === 'lidarr' ? 'UsenetDownloadProtocol' : 'usenet',
    priority: 1,
    removeCompletedDownloads: true,
    removeFailedDownloads: true,
    name,
    implementation: 'Sabnzbd',
    configContract: 'SabnzbdSettings',
    tags: [],
    fields: [
      { name: 'host', value: 'localhost' },
      { name: 'port', value: 8080 },
      { name: 'useSsl', value: false },
      { name: 'urlBase', value: '' },
      { name: 'apiKey', value: apiKey },
      { name: 'username', value: '' },
      { name: 'password', value: '' },
      { name: `${c}Category`, value: category },
      { name: `recent${cap}Priority`, value: -100 },
      { name: `older${cap}Priority`, value: -100 },
    ],
  };
}

const PROWLARR_CATEGORIES: Record<Exclude<ServarrApp, 'prowlarr'>, Field[]> = {
  sonarr: [
    { name: 'syncCategories', value: [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5090] },
    { name: 'animeSyncCategories', value: [5070] },
    { name: 'syncAnimeStandardFormatSearch', value: true },
  ],
  radarr: [
    {
      name: 'syncCategories',
      value: [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080, 2090],
    },
  ],
  lidarr: [{ name: 'syncCategories', value: [3000, 3010, 3030, 3040, 3050, 3060] }],
};

/** Prowlarr application: both URLs carry the URL bases, or syncing breaks (307 redirects). */
export function prowlarrApplicationBody(
  app: Exclude<ServarrApp, 'prowlarr'>,
  name: string,
  appUrl: string,
  apiKey: string,
  prowlarrUrl: string,
) {
  const impl = app.charAt(0).toUpperCase() + app.slice(1);
  return {
    name,
    implementation: impl,
    configContract: `${impl}Settings`,
    syncLevel: 'fullSync',
    tags: [],
    fields: [
      { name: 'prowlarrUrl', value: prowlarrUrl },
      { name: 'baseUrl', value: appUrl },
      { name: 'apiKey', value: apiKey },
      ...PROWLARR_CATEGORIES[app],
      { name: 'syncRejectBlocklistedTorrentHashesWhileGrabbing', value: false },
    ],
  };
}

type QualityItem = {
  id?: number;
  name?: string;
  quality?: { id: number; name: string };
  items: QualityItem[];
  allowed: boolean;
};

/**
 * EasyArr's Lidarr quality profile from Lidarr's own schema (all 38 qualities, groups 1000–1005):
 * best = lossless only; balanced = high-quality MP3/AAC + lossless, upgrading to lossless;
 * small = high-quality MP3/AAC only.
 */
export function lidarrQualityProfile(
  schema: { items: QualityItem[] } & Record<string, unknown>,
  name: string,
  preset: 'best' | 'balanced' | 'small',
) {
  const HIGH_LOSSY = 1004;
  const LOSSLESS = 1005;
  const allow =
    preset === 'best' ? [LOSSLESS] : preset === 'small' ? [HIGH_LOSSY] : [HIGH_LOSSY, LOSSLESS];
  const mark = (item: QualityItem): QualityItem => {
    const on = item.id !== undefined && allow.includes(item.id);
    return { ...item, allowed: on, items: item.items.map((i) => ({ ...i, allowed: on })) };
  };
  return {
    ...schema,
    name,
    upgradeAllowed: allow.length > 1,
    cutoff: Math.max(...allow),
    minFormatScore: 0,
    cutoffFormatScore: 0,
    formatItems: [],
    items: schema.items.map(mark),
  };
}
