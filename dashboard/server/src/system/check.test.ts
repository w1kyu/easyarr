import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectSystemInfo, detectGpu, diskSpace } from './check.js';

let dev: string;
beforeEach(async () => {
  dev = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-dev-'));
});
afterEach(async () => {
  await fs.rm(dev, { recursive: true, force: true });
});

describe('detectGpu', () => {
  it('finds no GPU when umbrelOS mapped nothing', async () => {
    expect(await detectGpu(dev, {})).toEqual({ kind: 'none', devices: [] });
  });

  it('finds Intel/AMD render nodes under /dev/dri', async () => {
    await fs.mkdir(path.join(dev, 'dri'));
    for (const f of ['card0', 'renderD129', 'renderD128']) {
      await fs.writeFile(path.join(dev, 'dri', f), '');
    }
    expect(await detectGpu(dev, {})).toEqual({
      kind: 'dri',
      devices: [path.join(dev, 'dri/renderD128'), path.join(dev, 'dri/renderD129')],
    });
  });

  it('a card node without a render node is not usable for transcoding', async () => {
    await fs.mkdir(path.join(dev, 'dri'));
    await fs.writeFile(path.join(dev, 'dri', 'card0'), '');
    expect((await detectGpu(dev, {})).kind).toBe('none');
  });

  it('finds NVIDIA via device nodes or the env umbreld sets', async () => {
    await fs.writeFile(path.join(dev, 'nvidia0'), '');
    await fs.writeFile(path.join(dev, 'nvidiactl'), '');
    expect(await detectGpu(dev, {})).toEqual({
      kind: 'nvidia',
      devices: [path.join(dev, 'nvidia0')],
    });
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-dev2-'));
    expect((await detectGpu(empty, { NVIDIA_VISIBLE_DEVICES: 'all' })).kind).toBe('nvidia');
    expect((await detectGpu(empty, { NVIDIA_VISIBLE_DEVICES: 'void' })).kind).toBe('none');
    await fs.rm(empty, { recursive: true });
  });
});

describe('diskSpace / collectSystemInfo', () => {
  it('reads free and total space, or null for a missing folder', async () => {
    const d = await diskSpace(dev);
    expect(d?.totalBytes).toBeGreaterThan(0);
    expect(d?.freeBytes).toBeLessThanOrEqual(d?.totalBytes ?? 0);
    expect(await diskSpace(path.join(dev, 'missing'))).toBeNull();
  });

  it('collects every fact', async () => {
    const info = await collectSystemInfo({ dataDir: dev, devDir: dev, env: {} });
    expect(info.arch).toBe(os.arch());
    expect(info.totalMemoryBytes).toBe(os.totalmem());
    expect(info.disk).not.toBeNull();
    expect(info.gpu.kind).toBe('none');
  });
});
