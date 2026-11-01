import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { secretsStore } from '../state/index.js';
import {
  FAKE_INDEXER_KEY,
  FAKE_USENET_HOST,
  FAKE_USENET_PASSWORD,
  World,
} from '../wiring/testing/fake-world.js';
import { classifyTestMessage, UsenetService } from './service.js';

let dir: string;
let world: World;
let vpnUp = true;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-usenet-'));
  world = new World();
  vpnUp = true;
  const s = secretsStore(dir);
  await s.save({
    ...(await s.load()).value,
    apiKeys: { ...world.keys },
    usenet: { servers: { news: FAKE_USENET_PASSWORD }, indexers: { geek: FAKE_INDEXER_KEY } },
  });
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const service = () =>
  new UsenetService({
    stateDir: dir,
    serviceUrls: { sabnzbd: 'http://sabnzbd', prowlarr: 'http://prowlarr' },
    vpnConnected: async () => vpnUp,
    fetch: world.fetch,
  });

const server = {
  preset: null,
  host: FAKE_USENET_HOST,
  port: 563,
  ssl: true,
  username: 'me',
  connections: 10,
};
const indexer = { preset: 'nzbgeek', name: 'NZBgeek', url: 'https://api.nzbgeek.info' };

describe('Usenet "Test" buttons', () => {
  it('tests a news server through SABnzbd, with a typed or the saved password', async () => {
    const u = service();
    expect(await u.testServer({ ...server, password: FAKE_USENET_PASSWORD })).toEqual({
      ok: true,
      reason: 'ok',
    });
    expect(await u.testServer({ ...server, id: 'news' })).toMatchObject({ ok: true });
    expect(await u.testServer({ ...server, password: 'nope' })).toMatchObject({
      ok: false,
      reason: 'auth',
    });
    expect(await u.testServer({ ...server })).toEqual({ ok: false, reason: 'missingSecret' });
    // Never sent in a URL: SABnzbd gets secrets as a POSTed form.
    expect(world.calls).toContain('POST sabnzbd/api');
    expect(world.calls).not.toContain('GET sabnzbd/api');
  });

  it('an unknown host is "unreachable" — or "no VPN" when the VPN is down', async () => {
    const u = service();
    const wrong = { ...server, host: 'news.wrong.example', password: 'x' };
    expect(await u.testServer(wrong)).toMatchObject({ ok: false, reason: 'unreachable' });
    vpnUp = false;
    expect(await u.testServer(wrong)).toMatchObject({ ok: false, reason: 'noVpn' });
  });

  it('tests an indexer through Prowlarr and explains a wrong key', async () => {
    const u = service();
    expect(await u.testIndexer({ ...indexer, apiKey: FAKE_INDEXER_KEY })).toEqual({
      ok: true,
      reason: 'ok',
    });
    expect(await u.testIndexer({ ...indexer, id: 'geek' })).toMatchObject({ ok: true });
    expect(await u.testIndexer({ ...indexer, apiKey: 'wrong' })).toEqual({
      ok: false,
      reason: 'auth',
      detail: 'ApiKey: Invalid API Key',
    });
  });

  it('a stopped SABnzbd/Prowlarr is "serviceDown", bad input is a 400', async () => {
    const u = new UsenetService({
      stateDir: dir,
      serviceUrls: { sabnzbd: 'http://127.0.0.1:9', prowlarr: 'http://127.0.0.1:9' },
      vpnConnected: async () => true,
    });
    expect(await u.testServer({ ...server, password: 'x' })).toEqual({
      ok: false,
      reason: 'serviceDown',
    });
    expect(await u.prowlarrIndexers()).toEqual({ reachable: false, count: 0, torrent: 0 });
    await expect(u.testServer({ ...server, port: 'abc' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    ['Timed out', 'timeout'],
    ['Server address "x:563" is not valid.', 'unreachable'],
    ['Authentication failed, check username/password.', 'auth'],
    ['Server requires username and password.', 'auth'],
    ['481 Authentication rejected', 'auth'],
    ['Unknown SSL protocol: Try disabling SSL or connecting on a different port.', 'certificate'],
    ['ApiKey: Invalid API Key', 'auth'],
    ['Unable to connect to indexer, check the log above the ValidationFailure', 'unreachable'],
    ['Something odd', 'failed'],
  ])('classifies %j as %s', (message, reason) => {
    expect(classifyTestMessage(message)).toBe(reason);
  });
});
