import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { buildApp } from '../app.js';

/** Fake service: echoes what it received; /redirect answers with a Location header. */
let upstream: http.Server;
let upstreamUrl: string;
let wsHeaders: http.IncomingHttpHeaders | null = null;
let app: FastifyInstance;
let appUrl: string;
let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-proxy-'));
  upstream = http.createServer((req, res) => {
    if (req.url?.endsWith('/redirect')) {
      res.writeHead(302, { location: '/login' }).end();
      return;
    }
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json', 'x-frame-options': 'SAMEORIGIN' });
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }));
    });
  });
  const wss = new WebSocketServer({ server: upstream });
  wss.on('connection', (socket, req) => {
    wsHeaders = req.headers;
    socket.on('message', (m: Buffer) => socket.send(`echo ${req.url ?? ''} ${m.toString()}`));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  app = await buildApp({
    config: {
      version: '1.0.0',
      webDir: tmp,
      licensesDir: '/nonexistent',
      stateDir: path.join(tmp, 'state'),
      dataDir: tmp,
      serviceUrls: {
        sonarr: upstreamUrl,
        qbittorrent: upstreamUrl,
        radarr: 'http://127.0.0.1:1', // nothing listens here
      },
    },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  appUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
  await new Promise((r) => upstream.close(r));
  await fs.rm(tmp, { recursive: true, force: true });
});

interface Echo {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

describe('service proxy /apps/*', () => {
  it('keeps the prefix for services with a URL base', async () => {
    const res = await app.inject({ method: 'GET', url: '/apps/sonarr/api/v3/system/status?x=1' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Echo>().url).toBe('/apps/sonarr/api/v3/system/status?x=1');
  });

  it('strips the prefix for qBittorrent and rewrites its redirects back under the prefix', async () => {
    const res = await app.inject({ method: 'GET', url: '/apps/qbittorrent/api/v2/app/version' });
    expect(res.json<Echo>().url).toBe('/api/v2/app/version');
    const root = await app.inject({ method: 'GET', url: '/apps/qbittorrent/' });
    expect(root.json<Echo>().url).toBe('/');
    const redirect = await app.inject({ method: 'GET', url: '/apps/qbittorrent/redirect' });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe('/apps/qbittorrent/login');
  });

  it('redirects the bare prefix to the trailing-slash URL', async () => {
    const res = await app.inject({ method: 'GET', url: '/apps/sonarr' });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('/apps/sonarr/');
  });

  it("passes the service's own headers through without the dashboard's CSP", async () => {
    const res = await app.inject({ method: 'GET', url: '/apps/sonarr/' });
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('forwards same-origin POSTs with the body, without Origin/Referer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/apps/qbittorrent/api/v2/torrents/pause',
      headers: {
        host: 'umbrel.local:39000',
        origin: 'http://umbrel.local:39000',
        referer: 'http://umbrel.local:39000/apps/qbittorrent/',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'hashes=all',
    });
    expect(res.statusCode).toBe(200);
    const echo = res.json<Echo>();
    expect(echo.body).toBe('hashes=all');
    expect(echo.headers['origin']).toBeUndefined();
    expect(echo.headers['referer']).toBeUndefined();
  });

  it('refuses cross-site state-changing requests (Origin or Referer from another site)', async () => {
    const byOrigin = await app.inject({
      method: 'POST',
      url: '/apps/sonarr/api/v3/command',
      headers: { host: 'umbrel.local:39000', origin: 'https://evil.example' },
      payload: '{}',
    });
    expect(byOrigin.statusCode).toBe(403);
    const byReferer = await app.inject({
      method: 'DELETE',
      url: '/apps/sonarr/api/v3/series/1',
      headers: { host: 'umbrel.local:39000', referer: 'https://evil.example/page' },
    });
    expect(byReferer.statusCode).toBe(403);
    const nullOrigin = await app.inject({
      method: 'POST',
      url: '/apps/sonarr/x',
      headers: { host: 'umbrel.local:39000', origin: 'null' },
    });
    expect(nullOrigin.statusCode).toBe(403);
    // Cross-site GETs are fine (links, images): they can't change anything.
    const get = await app.inject({
      method: 'GET',
      url: '/apps/sonarr/',
      headers: { host: 'umbrel.local:39000', referer: 'https://search.example/' },
    });
    expect(get.statusCode).toBe(200);
  });

  it('refuses requests from other containers (only loopback + the Umbrel gateway)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/apps/sonarr/',
      remoteAddress: '10.21.0.42',
    });
    expect(res.statusCode).toBe(403);
  });

  it('a service that is down: friendly page for navigations, 502 for API calls', async () => {
    const page = await app.inject({
      method: 'GET',
      url: '/apps/radarr/',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe('/unavailable/radarr');
    const api = await app.inject({ method: 'GET', url: '/apps/radarr/api/v3/system/status' });
    expect(api.statusCode).toBe(502);
    expect(api.json()).toEqual({ error: 'service_unavailable', service: 'radarr' });
  });

  it('unknown /apps paths are 404, not the web app', async () => {
    const res = await app.inject({ method: 'GET', url: '/apps/nope/' });
    expect(res.statusCode).toBe(404);
  });

  it('proxies WebSockets (prefix kept), forwarding cookies but not Origin', async () => {
    const ws = new WebSocket(`${appUrl.replace('http', 'ws')}/apps/sonarr/signalr/messages?id=1`, {
      headers: { cookie: 'a=b' },
      origin: appUrl,
      // `ws` sends Host = 127.0.0.1:<port>, matching the Origin above.
    });
    const reply = await new Promise<string>((resolve, reject) => {
      ws.on('open', () => ws.send('hi'));
      ws.on('message', (m: Buffer) => resolve(m.toString()));
      ws.on('error', reject);
    });
    ws.close();
    expect(reply).toBe('echo /apps/sonarr/signalr/messages?id=1 hi');
    expect(wsHeaders?.cookie).toBe('a=b');
    expect(wsHeaders?.origin).toBeUndefined();
  });

  it('refuses cross-site WebSocket handshakes', async () => {
    const ws = new WebSocket(`${appUrl.replace('http', 'ws')}/apps/sonarr/signalr/messages`, {
      origin: 'https://evil.example',
    });
    const status = await new Promise<number>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
      ws.on('error', () => resolve(-1));
    });
    expect(status).toBe(403);
  });
});
