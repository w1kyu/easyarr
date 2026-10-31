import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readFileIfExists, writeFileAtomic } from '../fs-util.js';

/**
 * Files shared with the VPN wrapper (vpn/rootfs/easyarr/wrapper.sh) in ${APP_DATA_DIR}/data/vpn,
 * mounted at /vpn here and at /gluetun in the vpn container.
 */
export const CONTAINER_EASYARR_DIR = '/gluetun/easyarr';
export const CUSTOM_OVPN_NAME = 'custom/client.ovpn';

export const wrapperStatusSchema = z.object({
  state: z.enum(['unconfigured', 'running', 'stopping', 'crashed', 'stopped']),
  since: z.number(),
  pid: z.number().nullable(),
  exitCode: z.number().nullable(),
  restarts: z.number(),
  retryAt: z.number().nullable(),
});
export type WrapperStatus = z.infer<typeof wrapperStatusSchema>;

export class VpnFiles {
  constructor(private readonly vpnDir: string) {}

  get dir(): string {
    return path.join(this.vpnDir, 'easyarr');
  }

  private file(name: string): string {
    return path.join(this.dir, name);
  }

  /** Atomic write, chmod 600: a half-written vpn.env would make the wrapper restart Gluetun twice. */
  async writeEnv(content: string): Promise<void> {
    await writeFileAtomic(this.file('vpn.env'), content, 0o600);
  }

  async removeEnv(): Promise<void> {
    await fs.rm(this.file('vpn.env'), { force: true });
  }

  async hasEnv(): Promise<boolean> {
    return (await readFileIfExists(this.file('vpn.env'))) !== undefined;
  }

  async writeCustomOvpn(content: string): Promise<void> {
    await writeFileAtomic(this.file(CUSTOM_OVPN_NAME), content, 0o600);
  }

  async removeCustomOvpn(): Promise<void> {
    await fs.rm(this.file(CUSTOM_OVPN_NAME), { force: true });
  }

  /** Ask the wrapper to restart Gluetun with the current settings. */
  async requestReload(): Promise<void> {
    await writeFileAtomic(this.file('reload'), `${Date.now()}\n`, 0o600);
  }

  async readStatus(): Promise<WrapperStatus | null> {
    const raw = await readFileIfExists(this.file('status.json'));
    if (raw === undefined) return null;
    try {
      const parsed = wrapperStatusSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** Last lines of Gluetun's output since its last start. */
  async readLogTail(maxBytes = 64 * 1024): Promise<string[]> {
    let handle: fs.FileHandle | undefined;
    try {
      handle = await fs.open(this.file('gluetun.log'), 'r');
      const { size } = await handle.stat();
      const start = Math.max(0, size - maxBytes);
      const buf = Buffer.alloc(size - start);
      await handle.read(buf, 0, buf.length, start);
      const lines = buf.toString('utf8').split('\n');
      if (start > 0) lines.shift(); // probably cut in the middle
      return lines.filter((l) => l.trim() !== '');
    } catch {
      return [];
    } finally {
      await handle?.close();
    }
  }
}
