import { z } from 'zod';
import { HttpClient, ServiceError } from '../http.js';

/**
 * Cleanuparr 2.10 API (docs/dev/research/downloaders.md §4). Settings live in its database, so
 * everything goes through the API. Until first-run setup is complete every /api route answers
 * 403 "Setup required" and the setup routes are open — EasyArr completes it on the first run with
 * an account of its own (the user never needs it: the UI trusts the dashboard's private address).
 * BASE_PATH=/apps/cleanuparr: every path, even /health, carries it.
 */
// Ids are GUIDs in 2.10; accept numbers too so a format change doesn't break wiring.
const id = z.union([z.string(), z.number()]).transform(String);
const instanceSchema = z.looseObject({ id, name: z.string(), url: z.string() });
const arrConfigSchema = z.looseObject({ instances: z.array(instanceSchema) });
const clientSchema = z.looseObject({
  id,
  name: z.string(),
  typeName: z.string(),
  host: z.string().nullish(),
});

export type CleanuparrArr = 'sonarr' | 'radarr' | 'lidarr';

export class CleanuparrApi {
  private readonly http: HttpClient;
  private apiKey: string | null = null;

  constructor(baseUrl: string, fetchImpl?: typeof fetch) {
    this.http = new HttpClient({
      service: 'cleanuparr',
      baseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  useKey(key: string): void {
    this.apiKey = key;
  }

  private key(): Record<string, string> {
    if (!this.apiKey) throw new ServiceError('cleanuparr', 'auth', 'no API key yet');
    return { 'x-api-key': this.apiKey };
  }

  async ready(): Promise<void> {
    const res = await this.http.raw('/health');
    const body = (await res.text()).trim().toLowerCase();
    if (!res.ok || body !== 'healthy')
      throw new ServiceError('cleanuparr', 'starting', `/health → ${res.status} ${body}`);
  }

  async setupCompleted(): Promise<boolean> {
    return (
      await this.http.json('/api/auth/status', z.looseObject({ setupCompleted: z.boolean() }))
    ).setupCompleted;
  }

  /** First-run setup with EasyArr's own account → API key. */
  async completeSetup(username: string, password: string): Promise<string> {
    try {
      await this.http.json('/api/auth/setup/account', undefined, {
        method: 'POST',
        body: { username, password },
      });
    } catch (err) {
      // 409: an earlier, interrupted run created it already.
      if (!(err instanceof ServiceError && err.status === 409)) throw err;
    }
    await this.http.json('/api/auth/setup/complete', undefined, { method: 'POST' });
    return this.apiKeyByLogin(username, password);
  }

  async apiKeyByLogin(username: string, password: string): Promise<string> {
    const login = await this.http.json(
      '/api/auth/login',
      z.looseObject({ tokens: z.looseObject({ accessToken: z.string() }).nullish() }),
      { method: 'POST', body: { username, password } },
    );
    const token = login.tokens?.accessToken;
    if (!token) throw new ServiceError('cleanuparr', 'auth', 'login needs a second factor');
    const r = await this.http.json('/api/account/api-key', z.object({ apiKey: z.string() }), {
      headers: { authorization: `Bearer ${token}` },
    });
    return r.apiKey;
  }

  async keyWorks(key: string): Promise<boolean> {
    try {
      await this.http.json('/api/configuration/general', undefined, {
        headers: { 'x-api-key': key },
      });
      return true;
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'auth') return false;
      throw err;
    }
  }

  /** Lets the proxied UI in without a login: it only trusts private addresses (the dashboard, D-046). */
  async trustLocalAddresses(): Promise<boolean> {
    const general = await this.http.json(
      '/api/configuration/general',
      z.looseObject({ auth: z.looseObject({}).optional() }),
      {
        headers: this.key(),
      },
    );
    const auth = (general.auth ?? {}) as Record<string, unknown>;
    if (auth['disableAuthForLocalAddresses'] === true && auth['trustForwardedHeaders'] === false)
      return false;
    await this.http.json('/api/configuration/general', undefined, {
      method: 'PUT',
      headers: this.key(),
      body: {
        ...general,
        auth: { ...auth, disableAuthForLocalAddresses: true, trustForwardedHeaders: false },
      },
    });
    return true;
  }

  async instances(type: CleanuparrArr) {
    return (
      await this.http.json(`/api/configuration/${type}`, arrConfigSchema, { headers: this.key() })
    ).instances;
  }

  async addInstance(type: CleanuparrArr, body: Record<string, unknown>): Promise<string> {
    return (
      await this.http.json(`/api/configuration/${type}/instances`, instanceSchema, {
        method: 'POST',
        headers: this.key(),
        body,
      })
    ).id;
  }

  async downloadClients() {
    return (
      await this.http.json(
        '/api/configuration/download_client',
        z.looseObject({ clients: z.array(clientSchema) }),
        {
          headers: this.key(),
        },
      )
    ).clients;
  }

  /** Queue Cleaner settings (§4.7). PUT replaces the whole record: always round-trip the GET body. */
  queueCleaner() {
    return this.http.json(
      '/api/configuration/queue_cleaner',
      z.looseObject({ enabled: z.boolean() }),
      {
        headers: this.key(),
      },
    );
  }

  async setQueueCleaner(body: Record<string, unknown>): Promise<void> {
    await this.http.json('/api/configuration/queue_cleaner', undefined, {
      method: 'PUT',
      headers: this.key(),
      body,
    });
  }

  async stallRules() {
    return this.http.json(
      '/api/queue-rules/stall',
      z.array(z.looseObject({ id, name: z.string() })),
      { headers: this.key() },
    );
  }

  async addStallRule(body: Record<string, unknown>): Promise<string> {
    return (
      await this.http.json('/api/queue-rules/stall', z.looseObject({ id }), {
        method: 'POST',
        headers: this.key(),
        body,
      })
    ).id;
  }

  /** Seeker: replacement searches after a removal (on by default) and proactive searches. */
  seeker() {
    return this.http.json(
      '/api/configuration/seeker',
      z.looseObject({
        proactiveSearchEnabled: z.boolean(),
        instances: z.array(z.looseObject({ arrInstanceId: id })),
      }),
      { headers: this.key() },
    );
  }

  async setSeeker(body: Record<string, unknown>): Promise<void> {
    await this.http.json('/api/configuration/seeker', undefined, {
      method: 'PUT',
      headers: this.key(),
      body,
    });
  }

  async addDownloadClient(body: Record<string, unknown>): Promise<string> {
    return (
      await this.http.json('/api/configuration/download_client', clientSchema, {
        method: 'POST',
        headers: this.key(),
        body,
      })
    ).id;
  }
}
