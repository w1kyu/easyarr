import type { Logger } from 'pino';

/**
 * qBittorrent Web API (v2) — only what the port-forward sync needs. The dashboard is on the Docker
 * network, which qBittorrent trusts without a login (init's AuthSubnetWhitelist, D-031).
 */
export class QbittorrentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async listenPort(): Promise<number> {
    const res = await fetch(new URL('/api/v2/app/preferences', this.baseUrl), {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`qBittorrent preferences → HTTP ${res.status}`);
    const prefs = (await res.json()) as { listen_port?: number };
    return prefs.listen_port ?? 0;
  }

  async setListenPort(port: number): Promise<void> {
    // Fixed port: no random port, no UPnP (it can't work through the VPN anyway).
    const json = JSON.stringify({ listen_port: port, random_port: false, upnp: false });
    const res = await fetch(new URL('/api/v2/app/setPreferences', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `json=${encodeURIComponent(json)}`,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`qBittorrent setPreferences → HTTP ${res.status}`);
  }
}

export type PortSyncResult = 'skipped' | 'unchanged' | 'updated' | 'failed';

/**
 * Keeps qBittorrent's listening port equal to the VPN's forwarded port (SPEC §5.4). The dashboard
 * is the single owner of this setting; it runs on a timer and right after a successful VPN test.
 */
export class PortSync {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly desiredPort: () => Promise<number | null>,
    private readonly qbittorrent: Pick<QbittorrentClient, 'listenPort' | 'setListenPort'>,
    private readonly log?: Logger,
  ) {}

  async runOnce(): Promise<PortSyncResult> {
    if (this.running) return 'skipped';
    this.running = true;
    try {
      const port = await this.desiredPort();
      if (!port) return 'skipped';
      const current = await this.qbittorrent.listenPort();
      if (current === port) return 'unchanged';
      await this.qbittorrent.setListenPort(port);
      this.log?.info(
        { from: current, to: port },
        'qBittorrent listening port set to the forwarded port',
      );
      return 'updated';
    } catch (err) {
      this.log?.warn({ err: (err as Error).message }, 'port forwarding sync failed');
      return 'failed';
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 30_000): void {
    this.stop();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
