import { promises as dns } from 'node:dns';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from 'pino';
import { containerName } from '@easyarr/shared';
import { readFileIfExists, writeFileAtomic } from '../fs-util.js';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Non-loopback IPv4 addresses of this container (the dashboard). */
export function ownIpv4Addresses(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string[] {
  const out = new Set<string>();
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && IPV4.test(i.address)) out.add(i.address);
    }
  }
  return [...out].sort();
}

export interface AllowlistDeps {
  /** ${APP_DATA_DIR}/data/vpn mounted in the dashboard (the wrapper sees it as /gluetun). */
  vpnDir: string;
  ownAddresses?: () => string[];
  /** Resolves a container name to its IPv4 addresses (Docker's DNS). */
  resolve?: (host: string) => Promise<string[]>;
  log?: Logger;
}

const defaultResolve = async (host: string) =>
  (await dns.lookup(host, { all: true, family: 4 })).map((r) => r.address);

/**
 * Tells the VPN wrapper which Docker-network addresses may open connections to the services in
 * the VPN namespace (D-046): this dashboard (proxy, wiring) and the request page (Jellyseerr talks
 * to Sonarr/Radarr). Every other Umbrel app is kept out. Addresses change when containers are
 * re-created, so this runs on a timer; the last known request-page address is kept while it is
 * down, so a restart doesn't flap the list.
 */
export class ClientAllowlist {
  private lastPeers: string[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly deps: AllowlistDeps) {}

  get file(): string {
    return path.join(this.deps.vpnDir, 'easyarr', 'allowed-clients');
  }

  async addresses(): Promise<string[]> {
    const own = (this.deps.ownAddresses ?? ownIpv4Addresses)();
    try {
      const peers = await (this.deps.resolve ?? defaultResolve)(containerName('jellyseerr'));
      if (peers.length > 0) this.lastPeers = peers.filter((p) => IPV4.test(p)).sort();
    } catch {
      // Not running right now: keep the last known address.
    }
    return [...new Set([...own, ...this.lastPeers])];
  }

  /** Writes the list if it changed. Never writes an empty list (that would mean "anyone"). */
  async runOnce(): Promise<boolean> {
    const ips = await this.addresses();
    if (ips.length === 0) return false;
    const content = `# Written by the EasyArr dashboard: who may connect to the services (D-046).\n${ips.join('\n')}\n`;
    if ((await readFileIfExists(this.file)) === content) return false;
    await writeFileAtomic(this.file, content, 0o644);
    this.deps.log?.info(
      { addresses: ips },
      'updated the list of containers allowed to reach the services',
    );
    return true;
  }

  start(intervalMs = 30_000): void {
    const tick = () =>
      void this.runOnce().catch((err: unknown) =>
        this.deps.log?.warn({ err }, 'could not update the allowed-clients list'),
      );
    tick();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
