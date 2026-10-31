/**
 * Client for Gluetun's HTTP control server (port 8000 inside the VPN namespace). Every route the
 * dashboard uses is protected by an API key that init writes into Gluetun's auth config (D-041).
 * Verified against Gluetun v3.41.3: internal/server/{vpn,publicip,portforward,wrappers}.go.
 */
export interface GluetunPublicIp {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

export class GluetunError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface GluetunClientOptions {
  baseUrl: string;
  apiKey: () => Promise<string | undefined>;
  timeoutMs?: number;
}

export class GluetunClient {
  constructor(private readonly opts: GluetunClientOptions) {}

  private async get<T>(route: string): Promise<T> {
    const key = await this.opts.apiKey();
    let res: Response;
    try {
      res = await fetch(new URL(route, this.opts.baseUrl), {
        headers: { accept: 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 4000),
      });
    } catch (err) {
      throw new GluetunError(`control server unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new GluetunError(`control server ${route} → HTTP ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  /** "starting" | "running" | "stopping" | "stopped" | "crashed" | "completed" */
  async vpnStatus(): Promise<string> {
    const body = await this.get<{ status?: string }>('/v1/vpn/status');
    return body.status ?? 'unknown';
  }

  async publicIp(): Promise<GluetunPublicIp> {
    const b = await this.get<Record<string, string | undefined>>('/v1/publicip/ip');
    const s = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
    return {
      ip: s(b['public_ip']),
      country: s(b['country']),
      region: s(b['region']),
      city: s(b['city']),
    };
  }

  /** Forwarded ports (empty while none is assigned). */
  async forwardedPorts(): Promise<number[]> {
    const b = await this.get<{ port?: number; ports?: number[] }>('/v1/portforward');
    const ports = b.ports ?? (b.port ? [b.port] : []);
    return ports.filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  }
}
