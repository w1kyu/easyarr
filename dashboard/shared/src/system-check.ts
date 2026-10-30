/**
 * System check (wizard step 2, SPEC §8): raw facts collected by the server, plus the plain
 * ✅ / ⚠️ / ❌ verdicts shown to the user. Verdicts live here so they are unit-tested in one place.
 */

export type Verdict = 'ok' | 'warning' | 'error';

export type GpuKind = 'dri' | 'nvidia' | 'none';

export interface SystemInfo {
  /** Node's `os.arch()` (x64, arm64, …). */
  arch: string;
  totalMemoryBytes: number;
  /** Free/total space of EasyArr's media folder, or null when it couldn't be read. */
  disk: { freeBytes: number; totalBytes: number } | null;
  /** GPU devices umbrelOS mapped into the app (`permissions: [GPU]`, D-027). */
  gpu: { kind: GpuKind; devices: string[] };
}

export type SystemCheckId = 'arch' | 'memory' | 'disk' | 'gpu';

export interface SystemCheckItem {
  id: SystemCheckId;
  verdict: Verdict;
  /** i18n key with the explanation for this verdict (`system.<id>.<reason>`). */
  reason: string;
  /** Values for the i18n text (e.g. `{ gb: '7.8' }`). */
  values: Record<string, string>;
}

export interface SystemCheckResult {
  info: SystemInfo;
  items: SystemCheckItem[];
  overall: Verdict;
}

const GIB = 1024 ** 3;
const GB = 1000 ** 3;

/**
 * RAM thresholds (SPEC §8: < 4 GB ❌, 4–8 GB ⚠️, ≥ 8 GB ✅). The OS reports a bit less than the
 * size printed on the box (an "8 GB" board shows ~7.6–7.8 GiB), so compare with some slack (D-037).
 */
export const MEMORY_ERROR_BELOW_BYTES = 3.5 * GIB;
export const MEMORY_WARNING_BELOW_BYTES = 7 * GIB;
/** Disk: less than 50 GB free → ⚠️ (SPEC §8). */
export const DISK_WARNING_BELOW_BYTES = 50 * GB;

export const SUPPORTED_ARCHES: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };

/** One decimal, in the units people see on the box (GB = 10^9 for disks, GiB-ish for RAM). */
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** Disk sizes like drive makers print them: "48.3 GB", "5.6 TB". */
export function formatDiskSize(bytes: number): string {
  return bytes >= 1000 * GB ? `${fmt(bytes / (1000 * GB))} TB` : `${fmt(bytes / GB)} GB`;
}

export function evaluateSystem(info: SystemInfo): SystemCheckResult {
  const items: SystemCheckItem[] = [];

  const arch = SUPPORTED_ARCHES[info.arch];
  items.push(
    arch
      ? { id: 'arch', verdict: 'ok', reason: 'system.arch.ok', values: { arch } }
      : {
          id: 'arch',
          verdict: 'error',
          reason: 'system.arch.unsupported',
          values: { arch: info.arch },
        },
  );

  const memValues = { gb: fmt(info.totalMemoryBytes / GIB) };
  items.push(
    info.totalMemoryBytes < MEMORY_ERROR_BELOW_BYTES
      ? { id: 'memory', verdict: 'error', reason: 'system.memory.tooLow', values: memValues }
      : info.totalMemoryBytes < MEMORY_WARNING_BELOW_BYTES
        ? { id: 'memory', verdict: 'warning', reason: 'system.memory.low', values: memValues }
        : { id: 'memory', verdict: 'ok', reason: 'system.memory.ok', values: memValues },
  );

  if (info.disk === null) {
    items.push({ id: 'disk', verdict: 'warning', reason: 'system.disk.unknown', values: {} });
  } else {
    const values = {
      free: formatDiskSize(info.disk.freeBytes),
      total: formatDiskSize(info.disk.totalBytes),
    };
    items.push(
      info.disk.freeBytes < DISK_WARNING_BELOW_BYTES
        ? { id: 'disk', verdict: 'warning', reason: 'system.disk.low', values }
        : { id: 'disk', verdict: 'ok', reason: 'system.disk.ok', values },
    );
  }

  items.push(
    info.gpu.kind === 'none'
      ? { id: 'gpu', verdict: 'warning', reason: 'system.gpu.none', values: {} }
      : { id: 'gpu', verdict: 'ok', reason: `system.gpu.${info.gpu.kind}`, values: {} },
  );

  const overall: Verdict = items.some((i) => i.verdict === 'error')
    ? 'error'
    : items.some((i) => i.verdict === 'warning')
      ? 'warning'
      : 'ok';
  return { info, items, overall };
}
