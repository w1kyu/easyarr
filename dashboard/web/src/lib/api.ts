import type {
  UsenetIndexerTestInput,
  UsenetServerTestInput,
  UsenetTestResult,
  SystemCheckResult,
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
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
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
      if (data) onEvent(JSON.parse(data) as WiringEvent);
    }
  }
}

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
};
