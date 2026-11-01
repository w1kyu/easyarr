import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * qBittorrent 5.3 WebUI API (docs/dev/research/downloaders.md §1). The dashboard is in the subnet
 * whitelist, so no login. Mutations answer 200 with an empty body; 409 = category exists.
 */
const categorySchema = z.looseObject({ name: z.string(), savePath: z.string() });

export class QbittorrentApi {
  private readonly http: HttpClient;

  constructor(baseUrl: string, fetchImpl?: typeof fetch) {
    this.http = new HttpClient({
      service: 'qbittorrent',
      baseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  async ready(): Promise<void> {
    const res = await this.http.raw('/api/v2/app/version');
    if (res.status === 403)
      throw new ServiceError(
        'qbittorrent',
        'auth',
        "the dashboard is not in qBittorrent's whitelist",
      );
    if (!res.ok) throw new ServiceError('qbittorrent', 'starting', `version → HTTP ${res.status}`);
  }

  preferences() {
    return this.http.json('/api/v2/app/preferences', z.looseObject({}));
  }

  async setPreferences(prefs: Record<string, unknown>): Promise<void> {
    await this.http.json('/api/v2/app/setPreferences', undefined, {
      method: 'POST',
      body: new URLSearchParams({ json: JSON.stringify(prefs) }),
    });
  }

  async categories(): Promise<Record<string, z.infer<typeof categorySchema>>> {
    return this.http.json('/api/v2/torrents/categories', z.record(z.string(), categorySchema));
  }

  async createCategory(name: string, savePath: string): Promise<void> {
    await this.http.json('/api/v2/torrents/createCategory', undefined, {
      method: 'POST',
      body: new URLSearchParams({ category: name, savePath }),
    });
  }
}

/**
 * Seeding defaults for beginners: keep sharing up to ratio 2 or 14 days, then stop (Sonarr & co.
 * then remove the finished torrent). "Remove" is not allowed: the *arr apps refuse a qBittorrent
 * that deletes torrents itself (research: servarr.md §2.1).
 */
export const QBITTORRENT_DEFAULTS = {
  save_path: '/data/downloads/torrents',
  temp_path_enabled: false,
  // Torrents go to their category's folder.
  auto_tmm_enabled: true,
  torrent_changed_tmm_enabled: true,
  max_ratio_enabled: true,
  max_ratio: 2,
  max_seeding_time_enabled: true,
  max_seeding_time: 20160,
  max_ratio_act: 0,
  // UPnP can't work through the VPN; the forwarded port is set by EasyArr (SPEC §5.4).
  upnp: false,
};
