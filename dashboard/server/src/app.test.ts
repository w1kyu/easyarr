import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SERVICES } from '@easyarr/shared';
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

  it('/api/status answers even when no service does; the Simple/Advanced choice is remembered', async () => {
    // Port 9 (discard) refuses connections at once: every probe fails fast.
    const dead = Object.fromEntries(SERVICES.map((s) => [s.id, 'http://127.0.0.1:9']));
    const app = await buildApp({
      config: {
        version: '1.2.3',
        webDir,
        licensesDir: '/nonexistent',
        stateDir: path.join(webDir, 'state-status'),
        dataDir: webDir,
        vpnDir: path.join(webDir, 'vpn'),
        serviceUrls: dead,
      },
    });
    const first = await app.inject({ method: 'GET', url: '/api/status' });
    expect(first.statusCode).toBe(200);
    const body = first.json<{ mode: string; services: { state: string }[]; recent: unknown }>();
    expect(body.mode).toBe('simple');
    expect(body.services.every((s) => ['down', 'headless'].includes(s.state))).toBe(true);
    expect(body.recent).toBeNull();

    const put = await app.inject({ method: 'PUT', url: '/api/ui', payload: { mode: 'advanced' } });
    expect(put.statusCode).toBe(200);
    const again = await app.inject({ method: 'GET', url: '/api/status' });
    expect(again.json<{ mode: string }>().mode).toBe('advanced');

    const bad = await app.inject({ method: 'PUT', url: '/api/ui', payload: { mode: 'expert' } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/logs/secrets' })).statusCode).toBe(404);
    const img = await app.inject({ method: 'GET', url: '/api/media/..%2F..%2Fetc/image' });
    expect(img.statusCode).toBe(404);
    const log = await app.inject({ method: 'GET', url: '/api/logs/sonarr' });
    expect(log.json()).toEqual({ source: 'sonarr', available: false, lines: [] });

    // Settings → Advanced: the missing re-search schedule (D-067), 6 h by default.
    const recheck = () => app.inject({ method: 'GET', url: '/api/settings/recheck' });
    expect((await recheck()).json()).toEqual({ hours: 6 });
    const set = (hours: unknown) =>
      app.inject({ method: 'PUT', url: '/api/settings/recheck', payload: { hours } });
    expect((await set(12)).statusCode).toBe(200);
    expect((await recheck()).json()).toEqual({ hours: 12 });
    expect((await set(5)).statusCode).toBe(400);
    expect((await set(0)).statusCode).toBe(200);
    expect((await recheck()).json()).toEqual({ hours: 0 });
  });
});
