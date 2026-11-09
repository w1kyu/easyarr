import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * Jellyfin 12.4 API, the parts the wiring engine needs (research: PROGRESS → Verified facts).
 * Bodies are PascalCase: the named-configuration endpoint ignores camelCase keys.
 */
/** Jellyfin's client identification; `MediaBrowser <CLIENT>, Token="…"` authenticates. */
export const CLIENT =
  'Client="EasyArr", Device="EasyArr", DeviceId="easyarr-dashboard", Version="1"';

export const publicInfoSchema = z.object({
  Id: z.string(),
  Version: z.string().optional(),
  StartupWizardCompleted: z.boolean(),
});

const authResultSchema = z.object({
  AccessToken: z.string(),
  User: z.object({ Id: z.string(), Name: z.string() }),
});

const keysSchema = z.object({
  Items: z.array(
    z.object({
      AccessToken: z.string(),
      AppName: z.string().nullish(),
      DateCreated: z.string().nullish(),
    }),
  ),
});

export const virtualFolderSchema = z.object({
  Name: z.string(),
  Locations: z.array(z.string()),
  CollectionType: z.string().nullish(),
  ItemId: z.string(),
});
export type VirtualFolder = z.infer<typeof virtualFolderSchema>;

/** The encoding options are posted back whole: keep every field we don't touch. */
const encodingSchema = z.looseObject({ HardwareAccelerationType: z.string() });
export type EncodingOptions = z.infer<typeof encodingSchema>;

export type JellyfinCollection = 'movies' | 'tvshows' | 'music';

const trimSlash = (p: string) => p.replace(/\/+$/, '');

export class JellyfinClient {
  private readonly http: HttpClient;

  constructor(baseUrl: string, fetchImpl?: typeof fetch) {
    this.http = new HttpClient({
      service: 'jellyfin',
      baseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  private auth(token?: string): Record<string, string> {
    return { authorization: `MediaBrowser ${CLIENT}${token ? `, Token="${token}"` : ''}` };
  }

  /**
   * Ready = the real server answers /health with "Healthy". While migrating, a temporary setup
   * server answers "Degraded" (and claims the wizard isn't complete), so it must not count.
   */
  async ready(): Promise<void> {
    const res = await this.http.raw('/health');
    const body = (await res.text()).trim();
    if (res.status === 200 && body === 'Healthy') return;
    throw new ServiceError('jellyfin', 'starting', `/health → ${res.status} ${body.slice(0, 40)}`);
  }

  publicInfo() {
    return this.http.json('/System/Info/Public', publicInfoSchema);
  }

  /**
   * First-run wizard without a browser. GET /Startup/User creates the initial user (Jellyfin has no
   * other caller), POST names it and sets the password (403 = it already has one).
   */
  async completeStartup(username: string, password: string): Promise<void> {
    await this.http.json('/Startup/Configuration', undefined, {
      method: 'POST',
      body: {
        ServerName: 'EasyArr',
        UICulture: 'en-US',
        MetadataCountryCode: 'US',
        PreferredMetadataLanguage: 'en',
      },
    });
    await this.http.json('/Startup/User');
    try {
      await this.http.json('/Startup/User', undefined, {
        method: 'POST',
        body: { Name: username, Password: password },
      });
    } catch (err) {
      // A password was set already (an interrupted earlier run); the login below tells if it's ours.
      if (!(err instanceof ServiceError && err.status === 403)) throw err;
    }
    await this.http.json('/Startup/Complete', undefined, { method: 'POST' });
  }

  async login(username: string, password: string): Promise<{ token: string; userId: string }> {
    const r = await this.http.json('/Users/AuthenticateByName', authResultSchema, {
      method: 'POST',
      headers: this.auth(),
      body: { Username: username, Pw: password },
    });
    return { token: r.AccessToken, userId: r.User.Id };
  }

  /** Is this API key accepted? */
  async keyWorks(apiKey: string): Promise<boolean> {
    try {
      await this.http.json('/System/Info', undefined, { headers: this.auth(apiKey) });
      return true;
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'auth') return false;
      throw err;
    }
  }

  /** EasyArr's own API key: reuse the newest one named "EasyArr", else create one. */
  async ensureApiKey(token: string): Promise<{ key: string; created: boolean }> {
    const find = async () => {
      const keys = await this.http.json('/Auth/Keys', keysSchema, { headers: this.auth(token) });
      return keys.Items.filter((k) => k.AppName === 'EasyArr').sort((a, b) =>
        String(b.DateCreated ?? '').localeCompare(String(a.DateCreated ?? '')),
      )[0]?.AccessToken;
    };
    const existing = await find();
    if (existing) return { key: existing, created: false };
    await this.http.json('/Auth/Keys', undefined, {
      method: 'POST',
      query: { app: 'EasyArr' },
      headers: this.auth(token),
    });
    const key = await find();
    if (!key)
      throw new ServiceError(
        'jellyfin',
        'invalid_response',
        'created an API key but cannot find it',
      );
    return { key, created: true };
  }

  /**
   * Built-in backup (Jellyfin 10.11+, D-070): database only (users, watch history, libraries,
   * settings); metadata/images are fetched again by a library scan. The archive lands in Jellyfin's
   * own backups folder (DataPath/backups = /config/data/data/backups in the linuxserver image); Jellyfin's answer names its path inside the Jellyfin container.
   */
  async createBackup(token: string): Promise<{ path: string }> {
    const m = await this.http.json('/Backup/Create', z.looseObject({ Path: z.string() }), {
      method: 'POST',
      headers: this.auth(token),
      body: { Database: true, Metadata: false, Trickplay: false, Subtitles: false },
      timeoutMs: 10 * 60_000,
    });
    return { path: m.Path };
  }

  /** Schedules the restore of an archive in Jellyfin's backups folder and restarts the server (in-process). */
  async restoreBackup(token: string, containerPath: string): Promise<void> {
    await this.http.json('/Backup/Restore', undefined, {
      method: 'POST',
      headers: this.auth(token),
      body: { ArchiveFileName: containerPath },
    });
  }

  libraries(apiKey: string): Promise<VirtualFolder[]> {
    return this.http.json('/Library/VirtualFolders', z.array(virtualFolderSchema), {
      headers: this.auth(apiKey),
    });
  }

  /** The library that contains `path` (Jellyfin renames duplicates "Movies2", so never match by name). */
  async libraryByPath(apiKey: string, path: string): Promise<VirtualFolder | undefined> {
    const want = trimSlash(path);
    return (await this.libraries(apiKey)).find((f) =>
      f.Locations.some((l) => trimSlash(l) === want),
    );
  }

  async addLibrary(
    apiKey: string,
    name: string,
    type: JellyfinCollection,
    path: string,
    /** Titles, descriptions, artwork language and the country for age ratings. */
    metadata: { language: string; country: string } = { language: 'en', country: 'US' },
  ): Promise<void> {
    await this.http.json('/Library/VirtualFolders', undefined, {
      method: 'POST',
      headers: this.auth(apiKey),
      query: { name, collectionType: type, paths: path, refreshLibrary: true },
      body: {
        LibraryOptions: {
          Enabled: true,
          // New imports from Sonarr/Radarr/Lidarr show up without waiting for the nightly scan.
          EnableRealtimeMonitor: true,
          PreferredMetadataLanguage: metadata.language,
          MetadataCountryCode: metadata.country,
        },
      },
    });
  }

  async userByName(apiKey: string, name: string): Promise<{ Id: string } | undefined> {
    const users = await this.http.json(
      '/Users',
      z.array(z.looseObject({ Id: z.string(), Name: z.string() })),
      { headers: this.auth(apiKey) },
    );
    return users.find((u) => u.Name.toLowerCase() === name.toLowerCase());
  }

  /**
   * GET → change → POST a user's playback settings (POST /Users/Configuration replaces the whole
   * object, so unchanged keys must be sent back). Returns false when `change` changed nothing.
   */
  async updateUserConfiguration(
    apiKey: string,
    userId: string,
    change: (c: Record<string, unknown>) => boolean,
  ): Promise<boolean> {
    const user = await this.http.json(
      `/Users/${encodeURIComponent(userId)}`,
      z.looseObject({ Configuration: z.record(z.string(), z.unknown()) }),
      { headers: this.auth(apiKey) },
    );
    const next = { ...user.Configuration };
    if (!change(next)) return false;
    await this.http.json('/Users/Configuration', undefined, {
      method: 'POST',
      headers: this.auth(apiKey),
      query: { userId },
      body: next,
    });
    return true;
  }

  encoding(apiKey: string): Promise<EncodingOptions> {
    return this.http.json('/System/Configuration/encoding', encodingSchema, {
      headers: this.auth(apiKey),
    });
  }

  async setEncoding(apiKey: string, options: EncodingOptions): Promise<void> {
    await this.http.json('/System/Configuration/encoding', undefined, {
      method: 'POST',
      headers: this.auth(apiKey),
      body: options,
    });
  }
}

export type GpuVendor = 'intel' | 'amd' | 'nvidia' | 'other';

/**
 * Hardware transcoding settings per GPU vendor (Jellyfin docs: QSV preferred for Intel on Linux;
 * VA-API for AMD; NVENC for NVIDIA). Conservative codec lists: enabling a decoder the GPU lacks
 * breaks playback, a missing one only costs CPU. Merged into the current options, never replacing them.
 */
export function hardwareAcceleration(vendor: GpuVendor, device: string): Partial<EncodingOptions> {
  switch (vendor) {
    case 'intel':
      return {
        HardwareAccelerationType: 'qsv',
        QsvDevice: device,
        VaapiDevice: device,
        EnableHardwareEncoding: true,
        HardwareDecodingCodecs: ['h264', 'hevc', 'mpeg2video', 'vc1', 'vp8', 'vp9'],
        EnableDecodingColorDepth10Hevc: true,
        EnableDecodingColorDepth10Vp9: true,
        // The image has no Intel OpenCL runtime; VPP tone mapping works without it.
        EnableTonemapping: false,
        EnableVppTonemapping: true,
        EnableIntelLowPowerH264HwEncoder: false,
        EnableIntelLowPowerHevcHwEncoder: false,
      };
    case 'nvidia':
      return {
        HardwareAccelerationType: 'nvenc',
        EnableHardwareEncoding: true,
        HardwareDecodingCodecs: ['h264', 'hevc', 'mpeg2video', 'vc1', 'vp9'],
      };
    case 'amd':
    case 'other':
      return {
        HardwareAccelerationType: 'vaapi',
        VaapiDevice: device,
        EnableHardwareEncoding: true,
        HardwareDecodingCodecs: ['h264'],
        EnableVppTonemapping: false,
      };
  }
}
