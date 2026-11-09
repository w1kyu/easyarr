import type {
  DownloadItem,
  DownloadState,
  LogLine,
  LogSource,
  RecentItem,
  ServiceId,
  ServiceState,
} from '@easyarr/shared';
import { CLIENT } from '../wiring/services/jellyfin.js';

/**
 * Read-only probes for the dashboard home (SPEC §12): health + version of every service, the
 * download queues, Jellyfin's recently added items and the services' own logs. Each call has a
 * short timeout; a service that doesn't answer is "down", never an error for the whole page.
 * Endpoints: docs/dev/research/{servarr,downloaders,jellyfin-seerr,bazarr-recyclarr}.md.
 */
export interface ProbeDeps {
  /** Base URL of a service's HTTP port as seen from the dashboard (no URL base). */
  url(id: ServiceId): string;
  keys(): Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Fetched = { status: number; body: unknown; text: string } | null;

async function get(deps: ProbeDeps, url: string, headers: Record<string, string> = {}) {
  const f = deps.fetch ?? fetch;
  try {
    const res = await f(url, {
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 4000),
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: res.status, body, text } satisfies Fetched;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function stateOf(r: Fetched): ServiceState {
  if (!r) return 'down';
  if (r.status >= 200 && r.status < 300) return 'ok';
  // 503 while starting (Jellyfin, Servarr migrations); 401/403 still means it's up.
  if (r.status === 503) return 'starting';
  if (r.status === 401 || r.status === 403) return 'ok';
  return 'down';
}

const SERVARR_API: Partial<Record<ServiceId, string>> = {
  sonarr: '/apps/sonarr/api/v3',
  radarr: '/apps/radarr/api/v3',
  lidarr: '/apps/lidarr/api/v1',
  prowlarr: '/apps/prowlarr/api/v1',
};

export interface Probe {
  state: ServiceState;
  version: string | null;
}

/** Health + version of one service. */
export async function probeService(id: ServiceId, deps: ProbeDeps): Promise<Probe> {
  if (id === 'recyclarr' || id === 'unpackerr') return { state: 'headless', version: null };
  const base = deps.url(id);
  const keys = await deps.keys();
  const servarr = SERVARR_API[id];
  if (servarr) {
    const r = await get(deps, `${base}${servarr}/system/status`, { 'x-api-key': keys[id] ?? '' });
    return { state: stateOf(r), version: str(obj(r?.body)['version']) };
  }
  switch (id) {
    case 'qbittorrent': {
      const r = await get(deps, `${base}/api/v2/app/version`);
      const v = r && r.status === 200 ? r.text.trim() : null;
      return { state: stateOf(r), version: v ? v.replace(/^v/, '') : null };
    }
    case 'sabnzbd': {
      const r = await get(
        deps,
        `${base}/api?mode=version&output=json&apikey=${encodeURIComponent(keys['sabnzbd'] ?? '')}`,
      );
      return { state: stateOf(r), version: str(obj(r?.body)['version']) };
    }
    case 'bazarr': {
      const r = await get(deps, `${base}/apps/bazarr/api/system/status`, {
        'x-api-key': keys['bazarr'] ?? '',
      });
      return { state: stateOf(r), version: str(obj(obj(r?.body)['data'])['bazarr_version']) };
    }
    case 'jellyfin': {
      const r = await get(deps, `${base}/System/Info/Public`);
      return { state: stateOf(r), version: str(obj(r?.body)['Version']) };
    }
    case 'jellyseerr': {
      // /api/v1/status would ask GitHub on every call (research: jellyfin-seerr.md §7).
      const r = await get(deps, `${base}/api/v1/settings/public`);
      return { state: stateOf(r), version: null };
    }
    case 'cleanuparr': {
      const key = keys['cleanuparr'];
      if (!key) {
        const r = await get(deps, `${base}/apps/cleanuparr/health`);
        return { state: stateOf(r), version: null };
      }
      const r = await get(deps, `${base}/apps/cleanuparr/api/status`, { 'x-api-key': key });
      const v = str(obj(obj(r?.body)['application'])['version']);
      // .NET assembly versions have four parts ("2.10.12.0").
      return { state: stateOf(r), version: v ? v.replace(/\.0$/, '') : null };
    }
    case 'flaresolverr': {
      const r = await get(deps, `${base}/`);
      return { state: stateOf(r), version: str(obj(r?.body)['version']) };
    }
    default:
      return { state: 'headless', version: null };
  }
}

// --- downloads --------------------------------------------------------------------------------

const QBIT_STATE: Record<string, DownloadState> = {
  downloading: 'downloading',
  forcedDL: 'downloading',
  metaDL: 'metadata',
  forcedMetaDL: 'metadata',
  stalledDL: 'stalled',
  queuedDL: 'queued',
  pausedDL: 'paused',
  stoppedDL: 'paused',
  checkingDL: 'checking',
  checkingResumeData: 'checking',
  allocating: 'checking',
  moving: 'checking',
  error: 'error',
  missingFiles: 'error',
};

/** Unfinished torrents (seeding ones are done for the user). null = qBittorrent didn't answer. */
export async function qbittorrentQueue(deps: ProbeDeps): Promise<DownloadItem[] | null> {
  const r = await get(deps, `${deps.url('qbittorrent')}/api/v2/torrents/info`);
  if (!r || r.status !== 200 || !Array.isArray(r.body)) return null;
  const out: DownloadItem[] = [];
  for (const raw of r.body) {
    const t = obj(raw);
    const state = QBIT_STATE[String(t['state'])];
    if (!state) continue;
    const eta = num(t['eta']);
    out.push({
      id: String(t['hash'] ?? ''),
      client: 'qbittorrent',
      name: String(t['name'] ?? ''),
      progress: Math.min(1, Math.max(0, num(t['progress']))),
      speedBps: num(t['dlspeed']),
      // qBittorrent reports 8640000 (100 days) for "infinite".
      etaSeconds: eta > 0 && eta < 8640000 ? eta : null,
      state,
      category: str(t['category']),
      sizeBytes: num(t['size']),
    });
  }
  return out;
}

const SAB_STATE: Record<string, DownloadState> = {
  Downloading: 'downloading',
  Fetching: 'metadata',
  Grabbing: 'metadata',
  Queued: 'queued',
  Paused: 'paused',
  Checking: 'checking',
  QuickCheck: 'checking',
  Verifying: 'checking',
  Repairing: 'checking',
  Extracting: 'checking',
  Moving: 'checking',
  Failed: 'error',
};

/** "1:02:03" → 3723 */
function hms(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const parts = v.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  const seconds = parts.reduce((acc, p) => acc * 60 + p, 0);
  return seconds > 0 ? seconds : null;
}

export async function sabnzbdQueue(deps: ProbeDeps): Promise<DownloadItem[] | null> {
  const key = (await deps.keys())['sabnzbd'] ?? '';
  const r = await get(
    deps,
    `${deps.url('sabnzbd')}/api?mode=queue&output=json&apikey=${encodeURIComponent(key)}`,
  );
  const queue = obj(obj(r?.body)['queue']);
  if (!r || r.status !== 200 || !Array.isArray(queue['slots'])) return null;
  const total = Number.parseFloat(String(queue['kbpersec'] ?? '0')) * 1024 || 0;
  let speedGiven = false;
  return arr(queue['slots']).map((raw) => {
    const s = obj(raw);
    const state = SAB_STATE[String(s['status'])] ?? 'queued';
    const mb = Number.parseFloat(String(s['mb'] ?? '0')) || 0;
    // SABnzbd downloads one job at a time: the whole speed belongs to the first active one.
    const speed = state === 'downloading' && !speedGiven ? total : 0;
    if (speed > 0) speedGiven = true;
    return {
      id: String(s['nzo_id'] ?? ''),
      client: 'sabnzbd' as const,
      name: String(s['filename'] ?? ''),
      progress: Math.min(1, Math.max(0, (Number.parseFloat(String(s['percentage'])) || 0) / 100)),
      speedBps: speed,
      etaSeconds: state === 'downloading' ? hms(s['timeleft']) : null,
      state,
      category: str(s['cat']),
      sizeBytes: Math.round(mb * 1024 * 1024),
    };
  });
}

// --- Jellyfin ---------------------------------------------------------------------------------

export const JELLYFIN_ITEM_ID = /^[0-9a-f]{32}$/;

/**
 * Movies/episodes still missing a must-have subtitle language (D-066), from Bazarr's "wanted" lists
 * (Bazarr v1.6.2 `api/movies/wanted.py`, `api/episodes/wanted.py`: `missing_subtitles[].code2`).
 * null = Bazarr didn't answer.
 */
export async function bazarrMissingSubtitles(
  deps: ProbeDeps,
  codes: readonly string[],
): Promise<{ count: number; names: string[]; languages: string[] } | null> {
  if (codes.length === 0) return { count: 0, names: [], languages: [] };
  const key = (await deps.keys())['bazarr'] ?? '';
  const base = `${deps.url('bazarr')}/apps/bazarr/api`;
  const lists = await Promise.all(
    ['movies', 'episodes'].map((kind) =>
      get(deps, `${base}/${kind}/wanted?start=0&length=-1`, { 'x-api-key': key }),
    ),
  );
  if (lists.some((r) => !r || r.status !== 200)) return null;
  const names: string[] = [];
  const languages = new Set<string>();
  for (const r of lists) {
    for (const item of arr(obj(r?.body)['data'])) {
      const o = obj(item);
      const missing = arr(o['missing_subtitles'])
        .map((m) => str(obj(m)['code2']))
        .filter((c): c is string => c !== null && codes.includes(c));
      if (missing.length === 0) continue;
      for (const c of missing) languages.add(c);
      const series = str(o['seriesTitle']);
      const ep = str(o['episode_number']);
      names.push(series ? `${series}${ep ? ` ${ep}` : ''}` : (str(o['title']) ?? '?'));
    }
  }
  return { count: names.length, names, languages: codes.filter((c) => languages.has(c)) };
}

function jellyfinAuth(key: string): Record<string, string> {
  return { authorization: `MediaBrowser ${CLIENT}, Token="${key}"` };
}

const RECENT_TYPE: Record<string, RecentItem['type']> = {
  Movie: 'movie',
  Series: 'series',
  MusicAlbum: 'album',
};

/** The newest movies, shows and albums. null = Jellyfin not set up or not answering. */
export async function jellyfinRecent(deps: ProbeDeps, limit = 12): Promise<RecentItem[] | null> {
  const key = (await deps.keys())['jellyfin'];
  if (!key) return null;
  const q = new URLSearchParams({
    SortBy: 'DateCreated',
    SortOrder: 'Descending',
    IncludeItemTypes: 'Movie,Series,MusicAlbum',
    Recursive: 'true',
    Limit: String(limit),
    Fields: 'DateCreated',
    EnableImageTypes: 'Primary',
    ImageTypeLimit: '1',
  });
  const r = await get(deps, `${deps.url('jellyfin')}/Items?${q.toString()}`, jellyfinAuth(key));
  if (!r || r.status !== 200) return null;
  const out: RecentItem[] = [];
  for (const raw of arr(obj(r.body)['Items'])) {
    const i = obj(raw);
    const id = String(i['Id'] ?? '');
    const type = RECENT_TYPE[String(i['Type'])];
    if (!JELLYFIN_ITEM_ID.test(id) || !type) continue;
    const year = num(i['ProductionYear']);
    out.push({
      id,
      name: String(i['Name'] ?? ''),
      type,
      year: year > 0 ? year : null,
      addedAt: str(i['DateCreated']),
      hasImage: str(obj(i['ImageTags'])['Primary']) !== null,
    });
  }
  return out;
}

/** A poster through the dashboard (keeps the CSP at 'self'; Jellyfin's port may differ). */
export async function jellyfinImage(
  deps: ProbeDeps,
  id: string,
): Promise<{ type: string; body: ArrayBuffer } | null> {
  if (!JELLYFIN_ITEM_ID.test(id)) return null;
  const key = (await deps.keys())['jellyfin'];
  if (!key) return null;
  const f = deps.fetch ?? fetch;
  try {
    const res = await f(
      `${deps.url('jellyfin')}/Items/${id}/Images/Primary?fillHeight=360&quality=85`,
      { headers: jellyfinAuth(key), signal: AbortSignal.timeout(deps.timeoutMs ?? 8000) },
    );
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    return { type, body: await res.arrayBuffer() };
  } catch {
    return null;
  }
}

// --- logs -------------------------------------------------------------------------------------

function level(v: unknown): LogLine['level'] {
  const s = String(v).toLowerCase();
  if (s.startsWith('err') || s === 'fatal' || s === '8') return 'error';
  if (s.startsWith('warn') || s === '4') return 'warn';
  if (s === 'debug' || s === 'trace') return 'debug';
  return 'info';
}

/** The newest log lines a service shows in its own UI (Servarr log table, qBittorrent log). */
export async function serviceLog(
  source: Exclude<LogSource, 'vpn'>,
  deps: ProbeDeps,
  limit = 200,
): Promise<LogLine[] | null> {
  if (source === 'qbittorrent') {
    const r = await get(deps, `${deps.url('qbittorrent')}/api/v2/log/main?last_known_id=-1`);
    if (!r || r.status !== 200 || !Array.isArray(r.body)) return null;
    // type bit flags: 1 normal, 2 info, 4 warning, 8 critical.
    return r.body.slice(-limit).map((raw) => {
      const l = obj(raw);
      const ts = num(l['timestamp']);
      return {
        time: ts ? new Date(ts * 1000).toISOString() : null,
        level: level(num(l['type']) & 8 ? '8' : num(l['type']) & 4 ? '4' : 'info'),
        message: String(l['message'] ?? ''),
      };
    });
  }
  const api = SERVARR_API[source];
  if (!api) return null;
  const key = (await deps.keys())[source] ?? '';
  const q = `page=1&pageSize=${String(limit)}&sortKey=time&sortDirection=descending`;
  const r = await get(deps, `${deps.url(source)}${api}/log?${q}`, { 'x-api-key': key });
  const records = arr(obj(r?.body)['records']);
  if (!r || r.status !== 200) return null;
  return records.reverse().map((raw) => {
    const l = obj(raw);
    const exception = str(l['exception']);
    return {
      time: str(l['time']),
      level: level(l['level']),
      message: `${String(l['message'] ?? '')}${exception ? `\n${exception}` : ''}`,
    };
  });
}

/** Gluetun's log as the VPN wrapper writes it: "2026-11-07T19:47:26Z INFO [vpn] …". */
export function parseGluetunLog(text: string, limit = 200): LogLine[] {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  return lines.slice(-limit).map((line) => {
    const m = /^(\d{4}-\d{2}-\d{2}T\S+)\s+(INFO|WARN|ERROR|DEBUG)\s+(.*)$/.exec(line);
    if (!m) return { time: null, level: 'info' as const, message: line };
    return { time: m[1] ?? null, level: level(m[2]), message: m[3] ?? '' };
  });
}
