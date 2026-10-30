import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

let webDir: string;
beforeAll(async () => {
  webDir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-web-'));
  await fs.writeFile(path.join(webDir, 'index.html'), '<!doctype html><title>t</title>');
});
afterAll(async () => {
  await fs.rm(webDir, { recursive: true, force: true });
});

const make = () =>
  buildApp({
    config: {
      version: '1.2.3',
      webDir,
      licensesDir: '/nonexistent',
      stateDir: path.join(webDir, 'state'),
      dataDir: webDir,
    },
  });

describe('http app', () => {
  it('GET /api/health', async () => {
    const app = await make();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', name: 'EasyArr', version: '1.2.3' });
  });

  it('serves the SPA for client routes but 404s unknown API routes', async () => {
    const app = await make();
    const page = await app.inject({ method: 'GET', url: '/settings/backup' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>t</title>');
    const api = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(api.statusCode).toBe(404);
    const asset = await app.inject({ method: 'GET', url: '/assets/missing-123.js' });
    expect(asset.statusCode).toBe(404);
  });

  it('serves files added after startup (new builds)', async () => {
    const app = await make();
    await fs.writeFile(path.join(webDir, 'late.js'), 'console.log(1)');
    const res = await app.inject({ method: 'GET', url: '/late.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
  });

  it('sends security headers without HSTS or upgrade-insecure-requests (Umbrel serves HTTP too)', async () => {
    const app = await make();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['strict-transport-security']).toBeUndefined();
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
