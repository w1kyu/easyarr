import type { ServiceId } from './services.js';
import type { VpnStatusView } from './vpn-status.js';

/** API shapes for GET /api/status (dashboard home, SPEC §12) and the log viewer. */

/**
 * ok = answers; starting = reachable but not ready yet; down = no answer; headless = no web
 * port to ask (Recyclarr, Unpackerr).
 */
export type ServiceState = 'ok' | 'starting' | 'down' | 'headless';

export interface ServiceStatus {
  id: ServiceId;
  state: ServiceState;
  version: string | null;
  /** Part of the user's setup (download method, libraries). Unused services never warn. */
  used: boolean;
}

export type DownloadState =
  'downloading' | 'queued' | 'paused' | 'stalled' | 'metadata' | 'checking' | 'error';

export interface DownloadItem {
  /** Stable per client: torrent hash / SABnzbd nzo_id. */
  id: string;
  client: 'qbittorrent' | 'sabnzbd';
  name: string;
  /** 0–1. */
  progress: number;
  speedBps: number;
  /** null = unknown / infinite. */
  etaSeconds: number | null;
  state: DownloadState;
  category: string | null;
  sizeBytes: number;
}

export interface RecentItem {
  /** Jellyfin item id (32 hex digits); the poster is GET /api/media/<id>/image. */
  id: string;
  name: string;
  type: 'movie' | 'series' | 'album';
  year: number | null;
  addedAt: string | null;
  hasImage: boolean;
}

export const STATUS_WARNING_CODES = [
  'vpnNotConfigured',
  'vpnDown',
  'diskLow',
  'serviceDown',
  'officialJellyfin',
  'updateAvailable',
  'wiringProblems',
  'indexersDown',
] as const;
export type StatusWarningCode = (typeof STATUS_WARNING_CODES)[number];

export interface StatusWarning {
  code: StatusWarningCode;
  /** serviceDown: which ones. */
  services?: ServiceId[];
  /** diskLow: free share in percent; updateAvailable: the new version. */
  freePercent?: number;
  version?: string;
}

export interface StatusView {
  at: string;
  version: string;
  mode: 'simple' | 'advanced';
  services: ServiceStatus[];
  vpn: VpnStatusView;
  downloads: {
    items: DownloadItem[];
    /** Combined download speed in bytes/s. */
    speedBps: number;
    /** Which download clients answered (a client that didn't is not "empty"). */
    reachable: { qbittorrent: boolean; sabnzbd: boolean };
  };
  disk: { freeBytes: number; totalBytes: number } | null;
  /** null = Jellyfin not reachable or not set up yet. */
  recent: RecentItem[] | null;
  warnings: StatusWarning[];
}

/** Disk warning threshold (SPEC §12: less than 10 % free). */
export const DISK_WARNING_FREE_SHARE = 0.1;

/** Sources the advanced mode's log viewer can show (GET /api/logs/:source). */
export const LOG_SOURCES = [
  'vpn',
  'qbittorrent',
  'sonarr',
  'radarr',
  'lidarr',
  'prowlarr',
] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export interface LogLine {
  time: string | null;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface LogView {
  source: LogSource;
  lines: LogLine[];
  /** false = the service didn't answer; lines is empty. */
  available: boolean;
}

/** Plain "1.2.3" comparison; non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/);
  const pb = b.replace(/^v/, '').split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = Number.parseInt(pa[i] ?? '0', 10) || 0;
    const y = Number.parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
