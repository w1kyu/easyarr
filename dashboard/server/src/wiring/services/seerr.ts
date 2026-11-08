import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * Seerr (Jellyseerr) v3.5.1 API, the parts the wiring engine needs. The first admin can only be
 * created by logging in with a Jellyfin admin (POST /auth/jellyfin, cookie session); after that
 * EasyArr uses Seerr's API key (X-Api-Key acts as user 1).
 */
export const MEDIA_SERVER_NOT_CONFIGURED = 4;
const JELLYFIN = 2;

const publicSettingsSchema = z.object({
  initialized: z.boolean(),
  mediaServerType: z.number(),
});

const librarySchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  type: z.string(),
});

// Loose: GET returns the whole entry (API key included, unmasked) and PUT replaces it.
export const servarrInstanceSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  hostname: z.string(),
  port: z.number(),
  baseUrl: z.string().nullish(),
  externalUrl: z.string().nullish(),
});
export type SeerrServarr = z.infer<typeof servarrInstanceSchema>;

const testResultSchema = z.object({
  profiles: z.array(z.object({ id: z.number(), name: z.string() })),
  rootFolders: z.array(z.object({ id: z.number(), path: z.string() })),
});

export interface ServarrTarget {
  hostname: string;
  port: number;
  apiKey: string;
  baseUrl: string;
}

export class SeerrClient {
  private readonly http: HttpClient;

  constructor(baseUrl: string, fetchImpl?: typeof fetch) {
    this.http = new HttpClient({
      service: 'jellyseerr',
      baseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  /** Anonymous; also the readiness probe (/status would call GitHub). */
  publicSettings() {
    return this.http.json('/api/v1/settings/public', publicSettingsSchema);
  }

  /**
   * Logs in with the Jellyfin account and returns the session cookie. On first run (`firstRun`)
   * this creates Seerr's admin and connects Jellyfin; sending the host again later is an error.
   */
  async loginWithJellyfin(
    username: string,
    password: string,
    jellyfin: { hostname: string; port: number } | null,
  ): Promise<string> {
    const body: Record<string, unknown> = { username, password };
    if (jellyfin) {
      Object.assign(body, {
        hostname: jellyfin.hostname,
        port: jellyfin.port,
        useSsl: false,
        urlBase: '',
        serverType: JELLYFIN,
      });
    }
    const res = await this.http.raw('/api/v1/auth/jellyfin', { method: 'POST', body });
    if (!res.ok) {
      const text = await res.text();
      let message = text.slice(0, 200);
      try {
        message = String(
          (JSON.parse(text) as { message?: string; error?: string }).message ?? message,
        );
      } catch {
        // keep the raw text
      }
      const code =
        res.status === 401 || res.status === 403 ? 'auth' : res.status >= 500 ? 'http' : 'rejected';
      throw new ServiceError(
        'jellyseerr',
        code,
        `POST /api/v1/auth/jellyfin → HTTP ${res.status}`,
        res.status,
        [message],
      );
    }
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
    if (!cookie)
      throw new ServiceError('jellyseerr', 'invalid_response', 'login gave no session cookie');
    return cookie.split(';')[0] as string;
  }

  /** Seerr's API key, read with an admin session. */
  async apiKey(cookie: string): Promise<string> {
    const main = await this.http.json(
      '/api/v1/settings/main',
      z.object({ apiKey: z.string().min(1) }),
      {
        headers: { cookie },
      },
    );
    return main.apiKey;
  }

  async keyWorks(apiKey: string): Promise<boolean> {
    try {
      await this.http.json('/api/v1/settings/main', undefined, {
        headers: { 'x-api-key': apiKey },
      });
      return true;
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'auth') return false;
      throw err;
    }
  }

  /** Re-reads Jellyfin's libraries (movies + shows only; new ones start disabled). */
  syncLibraries(apiKey: string) {
    return this.http.json('/api/v1/settings/jellyfin/library/sync', z.array(librarySchema), {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
    });
  }

  async enableLibrary(apiKey: string, id: string): Promise<void> {
    await this.http.json(`/api/v1/settings/jellyfin/library/${encodeURIComponent(id)}`, undefined, {
      method: 'PUT',
      headers: { 'x-api-key': apiKey },
      body: { enabled: true },
    });
  }

  list(apiKey: string, kind: 'sonarr' | 'radarr'): Promise<SeerrServarr[]> {
    return this.http.json(`/api/v1/settings/${kind}`, z.array(servarrInstanceSchema), {
      headers: { 'x-api-key': apiKey },
    });
  }

  /** Seerr connects to Sonarr/Radarr and returns its quality profiles and root folders. */
  test(apiKey: string, kind: 'sonarr' | 'radarr', target: ServarrTarget) {
    return this.http.json(`/api/v1/settings/${kind}/test`, testResultSchema, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: { ...target, useSsl: false },
      timeoutMs: 30_000,
    });
  }

  async add(
    apiKey: string,
    kind: 'sonarr' | 'radarr',
    body: Record<string, unknown>,
  ): Promise<number> {
    const created = await this.http.json(`/api/v1/settings/${kind}`, servarrInstanceSchema, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body,
    });
    return created.id;
  }

  /**
   * PUT /settings/{kind}/{id} replaces the entry: send the full object from list(). `id` is
   * readOnly in Seerr's OpenAPI schema; sending it back fails with "request/body/id is read-only".
   */
  async update(
    apiKey: string,
    kind: 'sonarr' | 'radarr',
    id: number,
    body: Record<string, unknown>,
  ): Promise<void> {
    const rest = { ...body };
    delete rest['id'];
    await this.http.json(`/api/v1/settings/${kind}/${String(id)}`, undefined, {
      method: 'PUT',
      headers: { 'x-api-key': apiKey },
      body: rest,
    });
  }

  async initialize(apiKey: string): Promise<void> {
    await this.http.json('/api/v1/settings/initialize', undefined, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
    });
  }
}
