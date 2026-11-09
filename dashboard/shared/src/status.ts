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
  'subtitlesMissing',
] as const;
export type StatusWarningCode = (typeof STATUS_WARNING_CODES)[number];

export interface StatusWarning {
  code: StatusWarningCode;
  /** serviceDown: which ones. */
  services?: ServiceId[];
  /** diskLow: free share in percent; updateAvailable: the new version. */
  freePercent?: number;
  version?: string;
  /** subtitlesMissing: how many items, a few of their names, which must-have languages (ISO 639-1). */
  count?: number;
  names?: string[];
  languages?: string[];
}

/**
 * Why a requested movie/episode hasn't arrived, and what the user can do (owner's item 11, D-068).
 * - language / quality / languageQuality: only releases EasyArr refused because of the audio
 *   language and/or a lower quality exist; `offer` is the best of them → "accept".
 * - blocklisted: every release found failed before → "accept" tries the best one again.
 * - nothingFound / noSeeders: nothing usable on the search sites → "retry" searches now.
 * - downloadProblem: a download is stuck or couldn't be added → "replace" removes it, blocks that
 *   release and searches for another one.
 * - requestFailed: the request page couldn't hand the request to Sonarr/Radarr → "retry".
 * - autoAccepted: "Accept alternatives automatically" took `offer` (information only).
 */
export const STUCK_KINDS = [
  'language',
  'quality',
  'languageQuality',
  'blocklisted',
  'nothingFound',
  'noSeeders',
  'downloadProblem',
  'requestFailed',
  'autoAccepted',
] as const;
export type StuckKind = (typeof STUCK_KINDS)[number];
export type StuckAction = 'accept' | 'retry' | 'replace' | 'dismiss';

export interface StuckItem {
  /** e.g. radarr:movie:12, sonarr:season:4:2, sonarr:episode:77, radarr:queue:9, seerr:request:3 */
  id: string;
  kind: StuckKind;
  type: 'movie' | 'series';
  /** "Dune (2021)", "Dark – season 2", "Dark S01E05" */
  title: string;
  /** downloadProblem: the app's own message (English). */
  detail?: string;
  offer?: { languages: string[]; quality: string; sizeBytes: number; seeders: number | null };
  /** When EasyArr noticed it (ISO). */
  since: string;
  actions: StuckAction[];
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
  /** Requests that need the user's OK or attention (item 11). */
  stuck: StuckItem[];
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

/**
 * How often EasyArr asks Sonarr/Radarr to search again for monitored items that never started
 * downloading (D-067). 0 = off.
 */
export const RECHECK_HOURS = [0, 3, 6, 12, 24] as const;
export type RecheckHours = (typeof RECHECK_HOURS)[number];
export const RECHECK_DEFAULT_HOURS: RecheckHours = 6;
