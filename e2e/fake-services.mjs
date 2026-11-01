// Every service EasyArr wires (Sonarr, Prowlarr, qBittorrent, SABnzbd, Jellyfin, …), faked for the
// browser tests: the same in-memory fakes the wiring unit tests use (fake-world.ts, loaded with
// Node's built-in TypeScript type stripping), each behind its own local HTTP port.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { World } from '../dashboard/server/src/wiring/testing/fake-world.ts';

const SERVICES = [
  'sonarr',
  'radarr',
  'lidarr',
  'prowlarr',
  'qbittorrent',
  'sabnzbd',
  'bazarr',
  'jellyfin',
  'jellyseerr',
  'cleanuparr',
];

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

/**
 * Starts the fakes. Returns the env for the dashboard (service URLs, Recyclarr folder) and writes
 * the API keys init would have written into the fresh state dir's secrets.json.
 */
export async function startFakeServices({ stateDir, recyclarrDir }) {
  const world = new World();
  const servers = [];
  const urls = [];
  for (const id of SERVICES) {
    const server = http.createServer(async (req, res) => {
      const body = await readBody(req);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
      }
      const r = await world.fetch(`http://${id}${req.url}`, {
        method: req.method,
        headers,
        ...(body.length ? { body: body.toString('utf8') } : {}),
      });
      const out = {};
      r.headers.forEach((v, k) => (out[k] = v));
      res.writeHead(r.status, { 'content-type': 'application/json', ...out });
      res.end(Buffer.from(await r.arrayBuffer()));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    urls.push(`${id}=http://127.0.0.1:${server.address().port}`);
  }

  // What init writes on a real install: every service's API key.
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    path.join(stateDir, 'secrets.json'),
    JSON.stringify({
      schemaVersion: 4,
      apiKeys: { ...world.keys },
      account: null,
      vpn: null,
      usenet: null,
    }),
    { mode: 0o600 },
  );

  // The Recyclarr runner loop (D-048): answer sync requests and create the profile it would.
  mkdirSync(path.join(recyclarrDir, '.easyarr'), { recursive: true });
  const request = path.join(recyclarrDir, '.easyarr', 'sync-request');
  const timer = setInterval(() => {
    let config;
    try {
      readFileSync(request);
      config = readFileSync(path.join(recyclarrDir, 'recyclarr.yml'), 'utf8');
    } catch {
      return;
    }
    rmSync(request, { force: true });
    const name = /name: (EasyArr[^\n]*)/.exec(config)?.[1]?.trim();
    for (const a of [world.arr.sonarr, world.arr.radarr]) {
      if (name && !a.coll('qualityprofile').items.some((p) => p['name'] === name))
        a.coll('qualityprofile').add({ name });
    }
    writeFileSync(
      path.join(recyclarrDir, '.easyarr', 'last-sync.json'),
      JSON.stringify({ exit: 0, at: new Date().toISOString() }),
    );
  }, 200);

  return {
    world,
    env: {
      EASYARR_SERVICE_URLS: urls.join(','),
      EASYARR_RECYCLARR_DIR: recyclarrDir,
    },
    stop() {
      clearInterval(timer);
      for (const s of servers) s.close();
    },
  };
}
