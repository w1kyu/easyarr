import type { z } from 'zod';

/**
 * Why a service call failed, in terms the wiring checklist can explain to a beginner
 * (web: `wiring.error.<code>`).
 */
export type ServiceErrorCode =
  | 'unreachable' // connection refused / timeout / DNS: the service isn't running (yet)
  | 'starting' // it answers, but isn't ready (503, migrations)
  | 'auth' // 401/403: API key or password not accepted
  | 'rejected' // 400/409/422: the service refused what we sent (validation)
  | 'http' // any other HTTP error
  | 'invalid_response'; // answered, but not with what this version of EasyArr expects

export class ServiceError extends Error {
  constructor(
    readonly service: string,
    readonly code: ServiceErrorCode,
    message: string,
    readonly status?: number,
    /** Service-provided details (validation messages); never contains secrets we sent. */
    readonly details?: string[],
  ) {
    super(`${service}: ${message}`);
    this.name = 'ServiceError';
  }
}

export interface HttpClientOptions {
  /** Service id for error messages. */
  service: string;
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body (objects/arrays) or a pre-encoded form body (URLSearchParams). */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Extracts readable messages from typical error bodies (Servarr validation arrays, {message}). */
export function errorDetails(body: unknown): string[] {
  if (Array.isArray(body)) {
    return body
      .map((e: unknown) => {
        if (e && typeof e === 'object') {
          const o = e as Record<string, unknown>;
          const msg = o['errorMessage'] ?? o['message'];
          const prop = o['propertyName'];
          if (typeof msg === 'string')
            return typeof prop === 'string' && prop ? `${prop}: ${msg}` : msg;
        }
        return null;
      })
      .filter((x): x is string => x !== null)
      .slice(0, 5);
  }
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const k of ['message', 'error', 'Message', 'title']) {
      if (typeof o[k] === 'string') return [o[k]];
    }
  }
  if (typeof body === 'string' && body.trim()) return [body.trim().slice(0, 200)];
  return [];
}

/** Small typed JSON client: timeouts, zod-validated responses, plain error codes. */
export class HttpClient {
  readonly service: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HttpClientOptions) {
    this.service = opts.service;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  url(path: string, query?: RequestOptions['query']): URL {
    const url = new URL(path.replace(/^\//, ''), this.opts.baseUrl.replace(/\/?$/, '/'));
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url;
  }

  /** Raw response; network failures become ServiceError('unreachable'). */
  async raw(path: string, options: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...this.opts.headers,
      ...options.headers,
    };
    let body: string | undefined;
    if (options.body instanceof URLSearchParams) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = options.body.toString();
    } else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    try {
      return await this.fetchImpl(this.url(path, options.query), {
        method: options.method ?? 'GET',
        headers,
        ...(body !== undefined ? { body } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs ?? this.opts.timeoutMs ?? 15_000),
      });
    } catch (err) {
      throw new ServiceError(
        this.service,
        'unreachable',
        `${options.method ?? 'GET'} ${path}: ${(err as Error).message}`,
      );
    }
  }

  /** Request + status check + optional zod validation of the JSON answer. */
  async json<T = unknown>(
    path: string,
    schema?: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    const res = await this.raw(path, options);
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    const what = `${options.method ?? 'GET'} ${path}`;
    if (!res.ok) {
      const details = errorDetails(data);
      const code: ServiceErrorCode =
        res.status === 401 || res.status === 403
          ? 'auth'
          : res.status === 503 || res.status === 502
            ? 'starting'
            : res.status === 400 || res.status === 409 || res.status === 422
              ? 'rejected'
              : 'http';
      throw new ServiceError(
        this.service,
        code,
        `${what} → HTTP ${res.status}`,
        res.status,
        details,
      );
    }
    if (!schema) return data as T;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ServiceError(
        this.service,
        'invalid_response',
        `${what}: unexpected answer (${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')})`,
      );
    }
    return parsed.data;
  }
}

export interface WaitOptions {
  timeoutMs: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retries `probe` until it resolves, with exponential backoff (1 s → 10 s), or throws its last
 * error after `timeoutMs`. Services take a while after a (re)start — Jellyfin and the *arrs run
 * database migrations first.
 */
export async function waitUntilReady<T>(probe: () => Promise<T>, opts: WaitOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.timeoutMs;
  let delay = opts.initialDelayMs ?? 1000;
  for (;;) {
    try {
      return await probe();
    } catch (err) {
      if (err instanceof ServiceError && (err.code === 'auth' || err.code === 'invalid_response')) {
        throw err; // won't fix itself by waiting
      }
      if (opts.signal?.aborted || now() + delay > deadline) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, opts.maxDelayMs ?? 10_000);
    }
  }
}
