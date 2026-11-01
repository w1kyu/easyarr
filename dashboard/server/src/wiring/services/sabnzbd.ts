import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * SABnzbd 5.1 API (docs/dev/research/downloaders.md §2): GET /api?mode=…&apikey=…&output=json.
 * Errors come back as HTTP 200 {status:false,error}; access problems as 403 plain text.
 */
const categorySchema = z.looseObject({ name: z.string(), dir: z.string().optional() });
const serverSchema = z.looseObject({
  name: z.string(),
  host: z.string().optional(),
  port: z.union([z.number(), z.string()]).optional(),
});

/** A news server as SABnzbd's set_config/test_server expect it (docs/dev/research/downloaders.md §2.2). */
export interface SabServer {
  host: string;
  port: number;
  ssl: boolean;
  username: string;
  password: string;
  connections: number;
  displayname?: string;
}

const serverParams = (s: SabServer): Record<string, string> => ({
  host: s.host,
  port: String(s.port),
  ssl: s.ssl ? '1' : '0',
  // 3 = strict certificate check (SABnzbd's default); users of odd providers can lower it in SABnzbd.
  ssl_verify: '3',
  username: s.username,
  password: s.password,
  connections: String(s.connections),
});

export class SabnzbdApi {
  private readonly http: HttpClient;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    fetchImpl?: typeof fetch,
  ) {
    this.http = new HttpClient({
      service: 'sabnzbd',
      baseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  /**
   * `secret`: the parameters carry a password → POST them as a form (SABnzbd's API reads both), so
   * they never end up in a URL or an access log.
   */
  private async call<T>(
    params: Record<string, string>,
    schema: z.ZodType<T>,
    opts: { secret?: boolean; timeoutMs?: number } = {},
  ): Promise<T> {
    const all = { ...params, apikey: this.apiKey, output: 'json' };
    const data = await this.http.json(
      '/api',
      z.unknown(),
      opts.secret
        ? {
            method: 'POST',
            body: new URLSearchParams(all),
            ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
          }
        : { query: all, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) },
    );
    if (data && typeof data === 'object' && (data as { status?: unknown }).status === false) {
      const error = String((data as { error?: unknown }).error ?? 'unknown error');
      throw new ServiceError('sabnzbd', /api key/i.test(error) ? 'auth' : 'rejected', error, 200, [
        error,
      ]);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new ServiceError(
        'sabnzbd',
        'invalid_response',
        `mode=${params['mode']}: unexpected answer`,
      );
    return parsed.data;
  }

  async ready(): Promise<void> {
    await this.call({ mode: 'version' }, z.object({ version: z.string() }));
  }

  async categories(): Promise<z.infer<typeof categorySchema>[]> {
    const r = await this.call(
      { mode: 'get_config', section: 'categories' },
      // No [categories] section in the INI yet (fresh install) → {"config":{}}.
      z.object({ config: z.object({ categories: z.array(categorySchema).optional() }) }),
    );
    return r.config.categories ?? [];
  }

  async servers(): Promise<z.infer<typeof serverSchema>[]> {
    const r = await this.call(
      { mode: 'get_config', section: 'servers' },
      z.object({ config: z.object({ servers: z.array(serverSchema).optional() }) }),
    );
    return r.config.servers ?? [];
  }

  /** Creates (or updates) server `name`; applied live by SABnzbd, no restart. */
  async setServer(name: string, server: SabServer): Promise<void> {
    await this.call(
      {
        mode: 'set_config',
        section: 'servers',
        name,
        ...serverParams(server),
        displayname: server.displayname ?? server.host,
        enable: '1',
      },
      z.unknown(),
      { secret: true },
    );
  }

  /**
   * SABnzbd's own "Test server" (mode=config&name=test_server, api.py test_nntp_server_dict).
   * Answers {value:{result,message}}; the message is SABnzbd's plain-English reason.
   */
  async testServer(server: SabServer): Promise<{ ok: boolean; message: string }> {
    const r = await this.call(
      { mode: 'config', name: 'test_server', ...serverParams(server) },
      z.object({ value: z.object({ result: z.boolean(), message: z.string() }) }),
      // SABnzbd tries a few well-known ports when the first attempt fails (5 s each).
      { secret: true, timeoutMs: 45_000 },
    );
    return { ok: r.value.result, message: r.value.message };
  }

  /** Creates or updates a category; `dir` is relative to complete_dir. */
  async setCategory(name: string, dir: string): Promise<void> {
    await this.call(
      {
        mode: 'set_config',
        section: 'categories',
        name,
        dir,
        pp: '',
        script: 'Default',
        priority: '-100',
      },
      z.unknown(),
    );
  }
}
