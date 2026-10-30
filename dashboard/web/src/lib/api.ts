import type { SystemCheckResult, WizardStepId, WizardView } from '@easyarr/shared';

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

export const api = {
  health: () => request<Health>('/api/health'),
  systemCheck: () => request<SystemCheckResult>('/api/system-check'),
  wizard: () => request<WizardView>('/api/wizard'),
  saveWizardStep: (step: WizardStepId, body: unknown) =>
    post<WizardView>(`/api/wizard/${step}`, body),
};
