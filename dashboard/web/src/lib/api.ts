import type {
  BackupSettings,
  BackupSettingsView,
  RestoreEvent,
  RestoreSource,
  RestoreSummary,
  LogSource,
  StuckAction,
  LogView,
  StatusView,
  SystemCheckResult,
  UsenetIndexerTestInput,
  UsenetServerTestInput,
  UsenetTestResult,
  VpnConfigInput,
  VpnConfigView,
  VpnStatusView,
  VpnTestView,
  WizardStepId,
  WizardView,
} from '@easyarr/shared';

export interface Health {
  status: 'ok';
  name: string;
  version: string;
}

export interface ApiIssue {
  path: string;
  /** An i18n key (`wizard.error.*`) or a plain English fallback message. */
  message: string;
}

/** A failed API call. `issues` lists field problems for 400 responses. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(`HTTP ${status}: ${code}`);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    let body: { error?: string; issues?: ApiIssue[] } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Not JSON (e.g. a proxy error page).
    }
    throw new ApiError(res.status, body.error ?? 'http', body.issues ?? []);
  }
  return (await res.json()) as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Wiring run events (mirrors dashboard/server/src/wiring/engine.ts → WiringEvent). */
export type WiringStepState = 'pending' | 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
export interface WiringNote {
  code: 'deleted_by_user' | 'recreated' | 'adopted';
  name: string;
}
export type WiringEvent =
  | { type: 'start'; mode: string; steps: { id: string; service: string }[] }
  | {
      type: 'step';
      step: string;
      service: string;
      state: WiringStepState;
      changes?: number;
      notes?: WiringNote[];
      error?: { code: string; service: string; message: string; details: string[] };
    }
  | { type: 'end'; ok: boolean; changes: number }
  | { type: 'error'; error: string };

export interface WiringStatus {
  running: boolean;
  lastRun: { at: string; mode: string; ok: boolean; changes: number } | null;
  ledger: { key: string; service: string; kind: string; name: string; adopted: boolean }[];
}

/**
 * Starts a wiring run and calls `onEvent` for every server-sent event until the run ends.
 * POST + a streamed body (EventSource can only GET).
 */
export async function runWiring(
  mode: 'run' | 'repair',
  onEvent: (e: WiringEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/wiring/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: '{}',
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok || !res.body) {
    let code = 'http';
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, code);
  }
  await readEvents(res.body, onEvent);
}

/** Server-sent events from a fetch body (`data:` lines, blank-line separated). */
async function readEvents<E>(body: NonNullable<Response['body']>, onEvent: (e: E) => void) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (data) onEvent(JSON.parse(data) as E);
    }
  }
}

async function errorCode(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? 'http';
  } catch {
    return 'http';
  }
}

/** Restore events + a final `error` if the server gave up (mirrors routes.ts). */
export type RestoreStreamEvent = RestoreEvent | { type: 'error'; error: string };

/** Starts a restore and streams its progress (SPEC §11). Bad file/password → ApiError before any event. */
export async function runRestore(
  body: { source: RestoreSource; password?: string },
  onEvent: (e: RestoreStreamEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok || !res.body) throw new ApiError(res.status, await errorCode(res));
  await readEvents(res.body, (e: { type?: string; error?: string }) =>
    onEvent((e.error && !e.type ? { type: 'error', error: e.error } : e) as RestoreStreamEvent),
  );
}

/** Saves a response body as a file in the browser. */
async function saveDownload(res: Response, fallbackName: string): Promise<void> {
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const backupApi = {
  view: () => request<BackupSettingsView>('/api/backup'),
  saveSettings: (body: BackupSettings) =>
    request<BackupSettingsView>('/api/backup/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  /** Builds a backup on the server and saves it in the browser. */
  async download(password?: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(password ? { password } : {}),
      });
    } catch {
      throw new ApiError(0, 'network');
    }
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    await saveDownload(res, 'easyarr-backup.easyarr');
  },
  fileUrl: (name: string) => `/api/backup/files/${encodeURIComponent(name)}`,
  deleteFile: (name: string) =>
    request<{ ok: true }>(`/api/backup/files/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  upload: (file: Blob) =>
    request<RestoreSummary>('/api/backup/upload', {
      method: 'POST',
      // EasyArr's header lets this raw upload past the JSON-only rule (D-072).
      headers: { 'content-type': 'application/octet-stream', 'x-easyarr-upload': '1' },
      body: file,
    }),
  inspect: (source: RestoreSource, password?: string) =>
    post<RestoreSummary>('/api/backup/inspect', { source, ...(password ? { password } : {}) }),
};

export const api = {
  health: () => request<Health>('/api/health'),
  systemCheck: () => request<SystemCheckResult>('/api/system-check'),
  wizard: () => request<WizardView>('/api/wizard'),
  saveWizardStep: (step: WizardStepId, body: unknown) =>
    post<WizardView>(`/api/wizard/${step}`, body),
  vpnConfig: () => request<{ config: VpnConfigView | null }>('/api/vpn/config'),
  saveVpnConfig: (body: Partial<VpnConfigInput>) =>
    post<{ config: VpnConfigView }>('/api/vpn/config', body),
  vpnStatus: () => request<VpnStatusView>('/api/vpn/status'),
  vpnTest: () => post<VpnTestView>('/api/vpn/test', {}),
  vpnReconnect: () => post<{ ok: true }>('/api/vpn/reconnect', {}),
  wiring: () => request<WiringStatus>('/api/wiring'),
  testUsenetServer: (body: Partial<UsenetServerTestInput>) =>
    post<UsenetTestResult>('/api/usenet/test-server', body),
  testUsenetIndexer: (body: Partial<UsenetIndexerTestInput>) =>
    post<UsenetTestResult>('/api/usenet/test-indexer', body),
  prowlarrIndexers: () =>
    request<{ reachable: boolean; count: number; torrent: number }>('/api/prowlarr/indexers'),
  status: () => request<StatusView>('/api/status'),
  recheck: () => request<{ hours: number }>('/api/settings/recheck'),
  stuckAction: (id: string, action: StuckAction) =>
    post<{ result: 'ok' | 'changed' }>(`/api/stuck/${encodeURIComponent(id)}`, { action }),
  autoAccept: () => request<{ enabled: boolean }>('/api/settings/auto-accept'),
  setAutoAccept: (enabled: boolean) =>
    request<{ enabled: boolean }>('/api/settings/auto-accept', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
  setRecheck: (hours: number) =>
    request<{ hours: number }>('/api/settings/recheck', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hours }),
    }),
  setMode: (mode: StatusView['mode']) =>
    request<{ mode: StatusView['mode'] }>('/api/ui', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    }),
  log: (source: LogSource) => request<LogView>(`/api/logs/${source}`),
};
