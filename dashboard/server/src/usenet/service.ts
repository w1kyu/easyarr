import {
  serviceUrl,
  usenetIndexerPreset,
  usenetIndexerTestSchema,
  usenetServerTestSchema,
  type ServiceId,
  type UsenetTestResult,
} from '@easyarr/shared';
import { z } from 'zod';
import { ApiError, type Issue } from '../http-errors.js';
import { registerSecrets } from '../logger.js';
import { secretsStore } from '../state/index.js';
import { ServiceError } from '../wiring/http.js';
import { SabnzbdApi } from '../wiring/services/sabnzbd.js';
import {
  indexerTemplateSchema,
  newznabIndexerBody,
  ServarrClient,
} from '../wiring/services/servarr.js';

export interface UsenetServiceOptions {
  stateDir: string;
  serviceUrls?: Partial<Record<ServiceId, string>>;
  /** Whether the VPN is connected right now: without it, nothing on the VPN side gets online. */
  vpnConnected: () => Promise<boolean>;
  fetch?: typeof fetch;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issues: Issue[] = r.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ApiError(400, 'invalid', issues);
  }
  return r.data;
}

/** SABnzbd's and Prowlarr's messages → a reason the wizard can explain in plain words. */
export function classifyTestMessage(message: string): UsenetTestResult['reason'] {
  const m = message.toLowerCase();
  if (/certificate|ssl|tls|handshake/.test(m)) return 'certificate';
  if (/timed? ?out|timeout/.test(m)) return 'timeout';
  if (
    /auth|password|credential|username|api ?key|apikey|unauthori[sz]ed|forbidden|\b40[13]\b|\b48[12]\b|\b502\b/.test(
      m,
    )
  )
    return 'auth';
  if (
    /not valid|could not connect|unable to connect|name or service|resolve|no such host|refused|unreachable|invalid server/.test(
      m,
    )
  )
    return 'unreachable';
  return 'failed';
}

/**
 * The "Test" buttons of wizard step 6 and the Prowlarr check of step 7. Tests run inside the VPN
 * namespace (SABnzbd/Prowlarr do the connecting), exactly like real downloads will.
 */
export class UsenetService {
  constructor(private readonly opts: UsenetServiceOptions) {}

  private url(id: ServiceId) {
    return this.opts.serviceUrls?.[id] ?? serviceUrl(id);
  }

  private async secrets() {
    return (await secretsStore(this.opts.stateDir).load()).value;
  }

  private async key(name: string): Promise<string> {
    const k = (await this.secrets()).apiKeys[name];
    if (!k) throw new ServiceError(name, 'auth', `EasyArr has no API key for ${name}`);
    return k;
  }

  private async prowlarr(): Promise<ServarrClient> {
    return new ServarrClient(
      'prowlarr',
      this.url('prowlarr'),
      '/apps/prowlarr',
      await this.key('prowlarr'),
      this.opts.fetch,
    );
  }

  /** A failure while the VPN is down is (almost always) the VPN's fault — say that instead. */
  private async explain(
    reason: UsenetTestResult['reason'],
    detail: string,
  ): Promise<UsenetTestResult> {
    if (reason !== 'auth' && !(await this.opts.vpnConnected().catch(() => false))) {
      return { ok: false, reason: 'noVpn', detail };
    }
    return { ok: false, reason, detail };
  }

  private async serviceDown(err: unknown): Promise<UsenetTestResult> {
    if (err instanceof ServiceError && (err.code === 'unreachable' || err.code === 'starting')) {
      return { ok: false, reason: 'serviceDown' };
    }
    throw err;
  }

  async testServer(body: unknown): Promise<UsenetTestResult> {
    const input = parse(usenetServerTestSchema, body);
    const password =
      input.password ?? (input.id ? (await this.secrets()).usenet?.servers[input.id] : undefined);
    if (!password) return { ok: false, reason: 'missingSecret' };
    registerSecrets([password]);
    let result: { ok: boolean; message: string };
    try {
      const sab = new SabnzbdApi(this.url('sabnzbd'), await this.key('sabnzbd'), this.opts.fetch);
      result = await sab.testServer({ ...input, password });
    } catch (err) {
      return this.serviceDown(err);
    }
    if (result.ok) return { ok: true, reason: 'ok' };
    return this.explain(classifyTestMessage(result.message), result.message);
  }

  async testIndexer(body: unknown): Promise<UsenetTestResult> {
    const input = parse(usenetIndexerTestSchema, body);
    const apiKey =
      input.apiKey ?? (input.id ? (await this.secrets()).usenet?.indexers[input.id] : undefined);
    if (!apiKey) return { ok: false, reason: 'missingSecret' };
    registerSecrets([apiKey]);
    try {
      const p = await this.prowlarr();
      const templates = await p.get('/indexer/schema', z.array(indexerTemplateSchema));
      const profiles = await p.get('/appprofile', z.array(z.looseObject({ id: z.number() })));
      const indexer = newznabIndexerBody(
        templates,
        usenetIndexerPreset(input.preset)?.name ?? null,
        { name: input.name, url: input.url, apiPath: input.apiPath, apiKey },
        profiles[0]?.id ?? 1,
      );
      // Prowlarr's own test: fetches the indexer's capabilities with the key (no search).
      await p.post('/indexer/test', indexer);
      return { ok: true, reason: 'ok' };
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'rejected') {
        const detail = (err.details ?? []).join(' — ');
        return this.explain(classifyTestMessage(detail), detail);
      }
      return this.serviceDown(err);
    }
  }

  /** Step 7: how many indexers Prowlarr has (any protocol). null = Prowlarr isn't answering. */
  async prowlarrIndexers(): Promise<{ reachable: boolean; count: number; torrent: number }> {
    try {
      const p = await this.prowlarr();
      const list = await p.get(
        '/indexer',
        z.array(z.looseObject({ id: z.number(), protocol: z.string().optional() })),
      );
      return {
        reachable: true,
        count: list.length,
        torrent: list.filter((i) => i.protocol === 'torrent').length,
      };
    } catch (err) {
      if (err instanceof ServiceError && err.code !== 'invalid_response') {
        return { reachable: false, count: 0, torrent: 0 };
      }
      throw err;
    }
  }
}
