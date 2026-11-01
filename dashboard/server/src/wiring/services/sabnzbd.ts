import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * SABnzbd 5.1 API (docs/dev/research/downloaders.md §2): GET /api?mode=…&apikey=…&output=json.
 * Errors come back as HTTP 200 {status:false,error}; access problems as 403 plain text.
 */
const categorySchema = z.looseObject({ name: z.string(), dir: z.string().optional() });

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

  private async call<T>(params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    const data = await this.http.json('/api', z.unknown(), {
      query: { ...params, apikey: this.apiKey, output: 'json' },
    });
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
