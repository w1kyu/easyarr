import { describe, expect, it } from 'vitest';
import { evaluateSystem, type SystemInfo } from './system-check.js';

const GIB = 1024 ** 3;
const GB = 1000 ** 3;

const base: SystemInfo = {
  arch: 'x64',
  totalMemoryBytes: 16 * GIB,
  disk: { freeBytes: 2000 * GB, totalBytes: 4000 * GB },
  gpu: { kind: 'dri', devices: ['/dev/dri/renderD128'] },
};
const verdicts = (info: Partial<SystemInfo>) =>
  Object.fromEntries(evaluateSystem({ ...base, ...info }).items.map((i) => [i.id, i.verdict]));

describe('evaluateSystem', () => {
  it('is all green on a well-equipped amd64 box', () => {
    const r = evaluateSystem(base);
    expect(r.overall).toBe('ok');
    expect(r.items.map((i) => i.id)).toEqual(['arch', 'memory', 'disk', 'gpu']);
    expect(r.items[0]).toMatchObject({ reason: 'system.arch.ok', values: { arch: 'amd64' } });
    expect(r.items[1]?.values).toEqual({ gb: '16.0' });
  });

  it('supports amd64 and arm64 only', () => {
    expect(verdicts({ arch: 'arm64' }).arch).toBe('ok');
    expect(verdicts({ arch: 'arm' }).arch).toBe('error');
    expect(evaluateSystem({ ...base, arch: 'riscv64' }).overall).toBe('error');
  });

  it('RAM: < 4 GB error, 4–8 GB warning, ≥ 8 GB ok — measured with slack for what the OS reports', () => {
    expect(verdicts({ totalMemoryBytes: 2 * GIB }).memory).toBe('error');
    expect(verdicts({ totalMemoryBytes: 3.4 * GIB }).memory).toBe('error');
    // A "4 GB" Raspberry Pi reports ~3.7 GiB.
    expect(verdicts({ totalMemoryBytes: 3.7 * GIB }).memory).toBe('warning');
    expect(verdicts({ totalMemoryBytes: 6 * GIB }).memory).toBe('warning');
    // An "8 GB" board reports ~7.6–7.8 GiB and must count as 8 GB.
    expect(verdicts({ totalMemoryBytes: 7.6 * GIB }).memory).toBe('ok');
    expect(verdicts({ totalMemoryBytes: 32 * GIB }).memory).toBe('ok');
  });

  it('disk: < 50 GB free is a warning; unreadable is a warning too', () => {
    expect(verdicts({ disk: { freeBytes: 49 * GB, totalBytes: 500 * GB } }).disk).toBe('warning');
    expect(verdicts({ disk: { freeBytes: 50 * GB, totalBytes: 500 * GB } }).disk).toBe('ok');
    const unknown = evaluateSystem({ ...base, disk: null }).items.find((i) => i.id === 'disk');
    expect(unknown).toMatchObject({ verdict: 'warning', reason: 'system.disk.unknown' });
  });

  it('no GPU is a warning (Jellyfin works, transcoding is slow); never an error', () => {
    const r = evaluateSystem({ ...base, gpu: { kind: 'none', devices: [] } });
    expect(r.items.find((i) => i.id === 'gpu')).toMatchObject({
      verdict: 'warning',
      reason: 'system.gpu.none',
    });
    expect(r.overall).toBe('warning');
    expect(verdicts({ gpu: { kind: 'nvidia', devices: ['/dev/nvidia0'] } }).gpu).toBe('ok');
  });

  it('the overall verdict is the worst item', () => {
    expect(evaluateSystem({ ...base, totalMemoryBytes: 6 * GIB }).overall).toBe('warning');
    expect(
      evaluateSystem({ ...base, totalMemoryBytes: 2 * GIB, gpu: { kind: 'none', devices: [] } })
        .overall,
    ).toBe('error');
  });
});
