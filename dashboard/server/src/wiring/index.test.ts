import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SystemInfo } from '@easyarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { gpuVendor } from './index.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-wiring-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const system: SystemInfo = {
  arch: 'x64',
  memoryBytes: 16e9,
  disk: { path: '/data', freeBytes: 1e12, totalBytes: 2e12 },
  gpu: { kind: 'none', devices: [] },
} as unknown as SystemInfo;

const make = () =>
  buildApp({
    config: {
      version: '1',
      webDir: dir,
      licensesDir: '/nonexistent',
      stateDir: path.join(dir, 'state'),
      dataDir: dir,
      recyclarrDir: path.join(dir, 'recyclarr'),
    },
    collectSystemInfo: async () => system,
  });

describe('/api/wiring', () => {
  it('reports an empty ledger before the first run', async () => {
    const app = await make();
    const res = await app.inject({ method: 'GET', url: '/api/wiring' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ running: false, lastRun: null, ledger: [] });
  });

  it('refuses to run before the wizard has an account and a download method', async () => {
    const app = await make();
    const res = await app.inject({
      method: 'POST',
      url: '/api/wiring/run',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'wizard_incomplete' });
  });
});

describe('gpuVendor', () => {
  it('reads the PCI vendor of a render device from sysfs', async () => {
    const dev = path.join(dir, 'class/drm/renderD128/device');
    await fs.mkdir(dev, { recursive: true });
    await fs.writeFile(path.join(dev, 'vendor'), '0x8086\n');
    expect(await gpuVendor('/dev/dri/renderD128', dir)).toBe('intel');
    await fs.writeFile(path.join(dev, 'vendor'), '0x1002\n');
    expect(await gpuVendor('/dev/dri/renderD128', dir)).toBe('amd');
    expect(await gpuVendor('/dev/dri/renderD129', dir)).toBe('other');
  });
});
