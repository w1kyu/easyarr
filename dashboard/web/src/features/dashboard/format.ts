const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → "1.5 KB" (decimal-free above 100). */
export function formatBytes(bytes: number): string {
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000;
    i += 1;
  }
  const digits = v >= 100 || i === 0 ? 0 : 1;
  return `${v.toFixed(digits)} ${UNITS[i] ?? 'B'}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** 3725 → "1 h 2 min"; under a minute → "< 1 min". */
export function formatEta(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return '< 1 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return `${String(Math.floor(h / 24))} d`;
  return h > 0 ? `${String(h)} h ${String(m)} min` : `${String(m)} min`;
}

export function portUrl(port: number): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}
