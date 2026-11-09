import type { VpnStatusView } from '@easyarr/shared';
import { describe, expect, it } from 'vitest';
import { REDACTED } from '../redact.js';
import { defaultSecrets, defaultState, type State } from '../state/index.js';
import { World } from '../wiring/testing/fake-world.js';
import { parseGluetunLog } from './collect.js';
import { StatusService, usedServices, type StatusServiceOptions } from './service.js';

const connected: VpnStatusView = {
  connection: 'connected',
  provider: 'protonvpn',
  protocol: 'wireguard',
  wrapper: 'running',
  runningFor: 60,
  publicIp: { ip: '194.126.177.37', country: 'Netherlands', city: null },
  portForwarding: { mode: 'auto', port: 42903, state: 'active' },
  problem: null,
};

function stateWith(answers: Record<string, unknown> = {}): State {
  const s = defaultState();
  s.wizard.answers = { download: { method: 'both' }, ...answers };
  return s;
}

function setup(over: Partial<StatusServiceOptions> = {}, world = new World()) {
  world.keys['jellyfin'] = 'jf-key-1';
  world.jf.keys.push({ AccessToken: 'jf-key-1' });
  world.keys['cleanuparr'] = world.cu.apiKey;
  world.cu.setup = true;
  let now = 1_000_000;
  const svc = new StatusService({
    ...world.deps(),
    version: '0.0.0-sha.abc',
    appVersion: '0.0.11',
    state: async () => stateWith(),
    secrets: async () => ({ ...defaultSecrets(), apiKeys: { ...world.keys } }),
    vpn: async () => connected,
    disk: async () => ({ freeBytes: 500, totalBytes: 1000 }),
    vpnLog: async () => [],
    now: () => now,
    ...over,
  });
  return { svc, world, tick: (ms: number) => (now += ms) };
}

describe('StatusService', () => {
  it('reports health and versions of every service', async () => {
    const { svc } = setup();
    const v = await svc.view();
    const by = Object.fromEntries(v.services.map((s) => [s.id, s]));
    expect(by['sonarr']).toMatchObject({ state: 'ok', version: '1.0.0', used: true });
    expect(by['qbittorrent']).toMatchObject({ state: 'ok', version: '5.3.0' });
    expect(by['sabnzbd']).toMatchObject({ state: 'ok', version: '5.1.3' });
    expect(by['jellyfin']).toMatchObject({ state: 'ok', version: '10.11.2' });
    expect(by['bazarr']).toMatchObject({ state: 'ok', version: '1.5.3' });
    expect(by['cleanuparr']).toMatchObject({ state: 'ok', version: '2.10.12' });
    expect(by['flaresolverr']).toMatchObject({ state: 'ok', version: '3.5.2' });
    expect(by['recyclarr']).toMatchObject({ state: 'headless' });
    expect(v.version).toBe('0.0.11');
    expect(v.warnings).toEqual([]);
  });

  it('lists unfinished torrents and Usenet jobs, not seeding ones', async () => {
    const { svc, world } = setup();
    world.qbt.torrents = [
      {
        hash: 'a1',
        name: 'Movie.2026.1080p',
        state: 'downloading',
        progress: 0.42,
        dlspeed: 1_000_000,
        eta: 600,
        category: 'movies',
        size: 2e9,
      },
      { hash: 'a2', name: 'Stuck', state: 'metaDL', progress: 0, dlspeed: 0, eta: 8640000 },
      { hash: 'a3', name: 'Done', state: 'stalledUP', progress: 1, dlspeed: 0, eta: 8640000 },
    ];
    world.sab.queue = {
      kbpersec: '2048',
      slots: [
        {
          nzo_id: 'SABnzbd_nzo_1',
          filename: 'Show.S01E01',
          status: 'Downloading',
          percentage: '10',
          mb: '1000',
          timeleft: '0:05:00',
          cat: 'tv',
        },
        { nzo_id: 'SABnzbd_nzo_2', filename: 'Next', status: 'Queued', percentage: '0', mb: '5' },
      ],
    };
    const v = await svc.view();
    expect(v.downloads.items.map((i) => [i.id, i.state])).toEqual([
      ['a1', 'downloading'],
      ['a2', 'metadata'],
      ['SABnzbd_nzo_1', 'downloading'],
      ['SABnzbd_nzo_2', 'queued'],
    ]);
    expect(v.downloads.items[1]?.etaSeconds).toBeNull();
    expect(v.downloads.items[2]).toMatchObject({ speedBps: 2048 * 1024, etaSeconds: 300 });
    expect(v.downloads.speedBps).toBe(1_000_000 + 2048 * 1024);
    expect(v.downloads.reachable).toEqual({ qbittorrent: true, sabnzbd: true });
  });

  it('shows recently added items from Jellyfin, and proxies their posters', async () => {
    const { svc, world } = setup();
    const id = 'f'.repeat(32);
    world.jf.items = [
      {
        Id: id,
        Name: 'Grave of the Fireflies',
        Type: 'Movie',
        ProductionYear: 1988,
        DateCreated: '2026-11-07T20:00:00Z',
        ImageTags: { Primary: 't' },
      },
      { Id: 'not-an-id', Name: 'x', Type: 'Movie' },
      { Id: 'e'.repeat(32), Name: 'Episode', Type: 'Episode' },
    ];
    const v = await svc.view();
    expect(v.recent).toEqual([
      {
        id,
        name: 'Grave of the Fireflies',
        type: 'movie',
        year: 1988,
        addedAt: '2026-11-07T20:00:00Z',
        hasImage: true,
      },
    ]);
    expect((await svc.image(id))?.type).toBe('image/svg+xml');
    expect(await svc.image('../../etc/passwd')).toBeNull();
  });

  it('warns: VPN down (without blaming every VPN-side app), low disk, update, two Jellyfins', async () => {
    const world = new World();
    // Everything behind the VPN stops answering while the VPN is down.
    for (const h of ['sonarr', 'radarr', 'lidarr', 'prowlarr', 'qbittorrent'] as const) {
      if (h === 'qbittorrent') world.qbittorrent = () => [503, ''];
      else world.arr[h].handle = () => [503, ''];
    }
    world.jellyseerr = () => undefined; // a normal-network app that is really down (404)
    const { svc } = setup(
      {
        vpn: async () => ({ ...connected, connection: 'error' }),
        disk: async () => ({ freeBytes: 50, totalBytes: 1000 }),
        latestVersion: async () => '0.0.12',
        officialJellyfin: async () => true,
      },
      world,
    );
    const v = await svc.view();
    expect(v.warnings).toEqual([
      { code: 'vpnDown' },
      { code: 'diskLow', freePercent: 5 },
      { code: 'serviceDown', services: ['jellyseerr'] },
      { code: 'officialJellyfin' },
      { code: 'updateAvailable', version: '0.0.12' },
    ]);
  });

  it('warns when every search site is paused, but not while the VPN is down', async () => {
    let sites = { at: '', total: 3, blocked: 3 };
    const { svc } = setup({ indexerHealth: () => sites });
    expect((await svc.view()).warnings).toEqual([{ code: 'indexersDown' }]);
    const down = setup({
      indexerHealth: () => sites,
      vpn: async () => ({ ...connected, connection: 'error' }),
    });
    expect((await down.svc.view()).warnings.map((w) => w.code)).toEqual(['vpnDown']);
    sites = { at: '', total: 3, blocked: 2 };
    const some = setup({ indexerHealth: () => sites });
    expect((await some.svc.view()).warnings).toEqual([]);
  });

  it('warns about must-have subtitles Bazarr has not found yet (D-066)', async () => {
    const world = new World();
    world.keys['bazarr'] = 'bz-key';
    const sub = (code2: string) => ({ name: code2, code2, code3: '', forced: false, hi: false });
    world.bz.wantedMovies = [
      { title: 'Dune', missing_subtitles: [sub('de')] },
      { title: 'Heat', missing_subtitles: [sub('fr')] }, // not a must-have
    ];
    world.bz.wantedEpisodes = [
      { seriesTitle: 'Dark', episode_number: '1x01', missing_subtitles: [sub('de'), sub('en')] },
    ];
    const library = {
      libraries: { movies: true, tv: true, music: false },
      audio: [{ code: 'original', required: false }],
      subtitles: [
        { code: 'de', required: true },
        { code: 'en', required: false },
        { code: 'fr', required: false },
      ],
      quality: 'balanced',
    };
    const { svc } = setup({ state: async () => stateWith({ library }) }, world);
    expect((await svc.view()).warnings).toEqual([
      { code: 'subtitlesMissing', count: 2, names: ['Dune', 'Dark 1x01'], languages: ['de'] },
    ]);
    // Nothing must-have → no warning.
    const relaxed = setup(
      {
        state: async () =>
          stateWith({
            library: { ...library, subtitles: [{ code: 'de', required: false }] },
          }),
      },
      world,
    );
    expect((await relaxed.svc.view()).warnings).toEqual([]);
  });

  it('a skipped VPN is not a warning; an unconfigured one is', async () => {
    const notConfigured = async () => ({ ...connected, connection: 'not_configured' as const });
    const skipped = setup({
      vpn: notConfigured,
      state: async () => stateWith({ vpn: { mode: 'skipped' } }),
    });
    expect((await skipped.svc.view()).warnings).toEqual([]);
    const missing = setup({ vpn: notConfigured });
    expect((await missing.svc.view()).warnings).toEqual([{ code: 'vpnNotConfigured' }]);
  });

  it('does not warn about services the setup does not use', async () => {
    const world = new World();
    world.sabnzbd = () => undefined;
    const { svc } = setup(
      { state: async () => stateWith({ download: { method: 'torrents' } }) },
      world,
    );
    const v = await svc.view();
    expect(v.services.find((s) => s.id === 'sabnzbd')).toMatchObject({
      state: 'down',
      used: false,
    });
    expect(v.warnings).toEqual([]);
    expect(v.downloads.reachable.sabnzbd).toBe(false);
  });

  it('caches service probes for a few seconds', async () => {
    const { svc, world, tick } = setup();
    await svc.view();
    const probes = () => world.calls.filter((c) => c.endsWith('/system/status')).length;
    const first = probes();
    await svc.view();
    expect(probes()).toBe(first);
    tick(5_000);
    await svc.view();
    expect(probes()).toBe(first * 2);
  });

  it("log viewer: masks secrets and hides the dashboard's own VPN status checks", async () => {
    const { svc, world } = setup({
      vpnLog: async () => [
        '2026-11-07T19:47:26Z INFO [http server] 200 GET /v1/vpn/status wrote 21B',
        `2026-11-07T19:47:27Z ERROR [wireguard] bad key ${'k'.repeat(20)}`,
      ],
      secrets: async () => ({
        ...defaultSecrets(),
        apiKeys: { sonarr: 's'.repeat(32) },
        vpn: { fields: { wireguardPrivateKey: 'k'.repeat(20) } },
      }),
    });
    world.arr.sonarr.log = [
      {
        time: '2026-11-07T18:00:00Z',
        level: 'warn',
        message: `call with apikey=${'s'.repeat(32)}`,
      },
    ];
    const sonarr = await svc.log('sonarr');
    expect(sonarr).toMatchObject({ available: true, source: 'sonarr' });
    expect(sonarr.lines).toEqual([
      { time: '2026-11-07T18:00:00Z', level: 'warn', message: `call with apikey=${REDACTED}` },
    ]);
    const vpn = await svc.log('vpn');
    expect(vpn.lines).toEqual([
      { time: '2026-11-07T19:47:27Z', level: 'error', message: `[wireguard] bad key ${REDACTED}` },
    ]);
  });

  it('log viewer: a service that does not answer is "unavailable", not an error', async () => {
    const world = new World();
    world.qbittorrent = () => undefined;
    const { svc } = setup({}, world);
    expect(await svc.log('qbittorrent')).toEqual({
      source: 'qbittorrent',
      available: false,
      lines: [],
    });
  });
});

describe('usedServices', () => {
  it('follows the download method and the libraries', () => {
    const used = usedServices(
      stateWith({
        download: { method: 'usenet' },
        library: {
          libraries: { movies: true, tv: false, music: false },
          audio: [{ code: 'en', required: false }],
          subtitles: [],
          quality: 'balanced',
        },
      }),
    );
    expect(used.has('sabnzbd')).toBe(true);
    expect(used.has('qbittorrent')).toBe(false);
    expect(used.has('radarr')).toBe(true);
    expect(used.has('sonarr')).toBe(false);
  });
});

describe('parseGluetunLog', () => {
  it('splits time, level and message; keeps odd lines as they are', () => {
    expect(parseGluetunLog('2026-11-07T19:47:26Z WARN [dns] slow\nplain line\n')).toEqual([
      { time: '2026-11-07T19:47:26Z', level: 'warn', message: '[dns] slow' },
      { time: null, level: 'info', message: 'plain line' },
    ]);
  });
});
