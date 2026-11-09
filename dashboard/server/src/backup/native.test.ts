import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServarrClient, fieldValue, type ServarrApp } from '../wiring/services/servarr.js';
import { URL_BASE } from '../wiring/steps.js';
import { World } from '../wiring/testing/fake-world.js';
import { fixConnectionKeys, rekeyServarrZip, ServarrNative, servarrZipApiKey } from './native.js';
import { realNativeOps } from './native-ops.js';

const instant = { sleep: async () => undefined, pollMs: 0, timeoutMs: 5_000 };

/** Two installs: A (the old one, set up) and B (fresh, with different keys). */
function worlds() {
  const a = new World();
  const b = new World();
  for (const app of ['sonarr', 'radarr', 'lidarr', 'prowlarr', 'sabnzbd'] as const) {
    b.keys[app] = app.charAt(0).repeat(16) + '0123456789abcdef';
    if (app !== 'sabnzbd') b.arr[app].key = b.keys[app] as string;
  }
  // A's Sonarr: root folder + SABnzbd client with A's SABnzbd key; A's Prowlarr knows A's Sonarr key.
  a.arr.sonarr.coll('rootfolder').add({ path: '/data/media/tv' });
  a.arr.sonarr.coll('downloadclient').add({
    name: 'EasyArr – SABnzbd',
    implementation: 'Sabnzbd',
    fields: [
      { name: 'host', value: 'localhost' },
      { name: 'port', value: 8080 },
      { name: 'apiKey', value: a.keys['sabnzbd'] },
    ],
  });
  a.arr.prowlarr.coll('applications').add({
    name: 'EasyArr – Sonarr',
    implementation: 'Sonarr',
    fields: [
      { name: 'baseUrl', value: 'http://localhost:8989/apps/sonarr' },
      { name: 'apiKey', value: a.keys['sonarr'] },
    ],
  });
  return { a, b };
}

const client = (w: World, app: ServarrApp) =>
  new ServarrClient(app, `http://${app}`, URL_BASE[app], w.keys[app] as string, w.fetch);

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-native-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('Servarr backups', () => {
  it('re-keys config.xml inside the zip and leaves the database alone', async () => {
    const { a } = worlds();
    const zip = await new ServarrNative(client(a, 'sonarr'), instant).create();
    expect(servarrZipApiKey(zip)).toBe(a.keys['sonarr']);
    const rekeyed = rekeyServarrZip(zip, 'f'.repeat(32));
    expect(servarrZipApiKey(rekeyed)).toBe('f'.repeat(32));
    const before = unzipSync(new Uint8Array(zip));
    const after = unzipSync(new Uint8Array(rekeyed));
    expect(strFromU8(after['sonarr.db'] as Uint8Array)).toBe(
      strFromU8(before['sonarr.db'] as Uint8Array),
    );
    expect(() => rekeyServarrZip(Buffer.from('not a zip'), 'f'.repeat(32))).toThrow(
      /not a valid zip/,
    );
  });

  it('creates through the API, downloads, and tidies the app’s own backup folder', async () => {
    const { a } = worlds();
    await new ServarrNative(client(a, 'sonarr'), instant).create();
    expect(a.arr.sonarr.backups).toEqual([]);
  });

  it('restores on a fresh install: data back, this install’s key kept, app restarted', async () => {
    const { a, b } = worlds();
    const zip = await new ServarrNative(client(a, 'sonarr'), instant).create();
    await new ServarrNative(client(b, 'sonarr'), instant).restore(zip, b.keys['sonarr'] as string);
    const s = b.arr.sonarr;
    expect(s.restarts).toBe(1);
    expect(s.key).toBe(b.keys['sonarr']);
    expect(s.coll('rootfolder').items).toMatchObject([{ path: '/data/media/tv' }]);
  });

  it('puts this install’s keys into restored connections', async () => {
    const { a, b } = worlds();
    for (const app of ['sonarr', 'prowlarr'] as const) {
      const zip = await new ServarrNative(client(a, app), instant).create();
      await new ServarrNative(client(b, app), instant).restore(zip, b.keys[app] as string);
    }
    // Restored: A's keys inside the connections.
    const sab = () => b.arr.sonarr.coll('downloadclient').items[0] as never;
    const app = () => b.arr.prowlarr.coll('applications').items[0] as never;
    expect(fieldValue(sab(), 'apiKey')).toBe(a.keys['sabnzbd']);
    expect(fieldValue(app(), 'apiKey')).toBe(a.keys['sonarr']);

    const n = await fixConnectionKeys(
      { sonarr: client(b, 'sonarr'), prowlarr: client(b, 'prowlarr') },
      b.keys,
    );
    expect(n).toBe(2);
    expect(fieldValue(sab(), 'apiKey')).toBe(b.keys['sabnzbd']);
    expect(fieldValue(app(), 'apiKey')).toBe(b.keys['sonarr']);
  });
});

describe('Jellyfin backups', () => {
  it('moves the archive through the shared folder and restores it on a fresh Jellyfin', async () => {
    const { a, b } = worlds();
    const dirA = path.join(dir, 'a');
    const dirB = path.join(dir, 'b');
    await fs.mkdir(dirA);
    await fs.mkdir(dirB);
    a.jfBackupsDir = dirA;
    b.jfBackupsDir = dirB;
    // A: set up, with libraries and EasyArr's API key.
    a.jf.wizardDone = true;
    a.jf.user = { name: 'owner', pw: 'owner-password' };
    a.jf.keys = [
      { AccessToken: 'old-jellyfin-key', AppName: 'EasyArr', DateCreated: '2026-01-01' },
    ];
    a.jf.libs = [
      { Name: 'Shows', Locations: ['/data/media/tv'], CollectionType: 'tvshows', ItemId: 'l1' },
    ];

    const opsFor = (w: World, jfDir: string) =>
      realNativeOps({
        url: (id) => `http://${id}`,
        jellyfinBackupsDir: jfDir,
        fetch: w.fetch,
        waits: instant,
      });
    const archive = await opsFor(a, dirA).create('jellyfin', {
      keys: { jellyfin: 'old-jellyfin-key' },
      accounts: [],
    });
    expect(await fs.readdir(dirA)).toEqual([]); // copied out, then removed

    // B is fresh: EasyArr finishes Jellyfin's first-run with the backup's account to get a token.
    await opsFor(b, dirB).restore('jellyfin', archive, {
      keys: {},
      accounts: [{ username: 'owner', password: 'owner-password' }],
    });
    expect(b.jf.restores).toBe(1);
    expect(b.jf.libs).toEqual(a.jf.libs);
    expect(b.jf.keys).toEqual(a.jf.keys);
    expect(await fs.readdir(dirB)).toEqual([]);
  });

  it('says so when the shared folder is missing', async () => {
    const { a } = worlds();
    a.jf.wizardDone = true;
    a.jf.keys = [{ AccessToken: 'k', AppName: 'EasyArr' }];
    const ops = realNativeOps({
      url: (id) => `http://${id}`,
      jellyfinBackupsDir: dir,
      fetch: a.fetch,
    });
    await expect(ops.create('jellyfin', { keys: { jellyfin: 'k' }, accounts: [] })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});
