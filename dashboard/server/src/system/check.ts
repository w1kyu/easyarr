import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GpuKind, SystemInfo } from '@easyarr/shared';

export interface CollectOptions {
  /** EasyArr's media folder (the /data mount); free space is measured here. */
  dataDir: string;
  /** Where device nodes live (`/dev`); overridable for tests. */
  devDir?: string;
  env?: Record<string, string | undefined>;
  arch?: string;
  totalMemoryBytes?: number;
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/**
 * GPU devices umbrelOS mapped into this container. With `permissions: [GPU]` umbreld adds the
 * host's /dev/dri (Intel/AMD, plus /dev/kfd for ROCm) and NVIDIA devices + NVIDIA_VISIBLE_DEVICES
 * to every service of the app when a GPU exists, and nothing otherwise (D-027, Verified facts).
 */
export async function detectGpu(
  devDir = '/dev',
  env: Record<string, string | undefined> = process.env,
): Promise<{ kind: GpuKind; devices: string[] }> {
  const devNames = await listDir(devDir);
  const nvidia = devNames.filter((n) => /^nvidia\d+$/.test(n)).map((n) => path.join(devDir, n));
  const visible = env['NVIDIA_VISIBLE_DEVICES'];
  if (nvidia.length > 0 || (visible && !['void', 'none', ''].includes(visible))) {
    return { kind: 'nvidia', devices: nvidia };
  }
  const dri = (await listDir(path.join(devDir, 'dri')))
    .filter((n) => n.startsWith('renderD'))
    .map((n) => path.join(devDir, 'dri', n));
  if (dri.length > 0) return { kind: 'dri', devices: dri.sort() };
  return { kind: 'none', devices: [] };
}

export async function diskSpace(
  dir: string,
): Promise<{ freeBytes: number; totalBytes: number } | null> {
  try {
    const s = await fs.statfs(dir);
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

/** Raw facts for wizard step 2. Verdicts are computed by `evaluateSystem` in @easyarr/shared. */
export async function collectSystemInfo(opts: CollectOptions): Promise<SystemInfo> {
  return {
    arch: opts.arch ?? os.arch(),
    // Containers see the host's RAM (umbrelOS sets no memory limits on apps).
    totalMemoryBytes: opts.totalMemoryBytes ?? os.totalmem(),
    disk: await diskSpace(opts.dataDir),
    gpu: await detectGpu(opts.devDir, opts.env),
  };
}
