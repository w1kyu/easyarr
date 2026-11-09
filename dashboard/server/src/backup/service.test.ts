import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  NativeBackupService,
  RestoreEvent,
  SystemInfo,
  VpnConfigInput,
} from '@easyarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../http-errors.js';
import { Mutex } from '../state/mutex.js';
import {
  defaultSecrets,
  defaultState,
  secretsStore,
  stateStore,
  type State,
} from '../state/index.js';
import type { WiringPlan } from '../wiring/engine.js';
import { ServiceError } from '../wiring/http.js';
import { writeBackup } from './format.js';
import { BackupService, type NativeContext, type NativeOps } from './service.js';

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const system = { gpu: { kind: 'none', devices: [] } } as unknown as SystemInfo;

/** Records what the restore did to the "services". */
class FakeNative implements NativeOps {
  created: NativeBackupService[] = [];
  restored: { id: NativeBackupService; data: string; ctx: NativeContext }[] = [];
  fixed: { restored: NativeBackupService[]; keys: Record<string, string> }[] = [];
  failCreate = new Set<NativeBackupService>();
  failRestore = new Set<NativeBackupService>();

  async create(id: NativeBackupService): Promise<Buffer> {
    if (this.failCreate.has(id)) throw new ServiceError(id, 'unreachable', 'not running');
    this.created.push(id);
    return Buffer.from(`${id}-native-backup`);
  }
  async restore(id: NativeBackupService, data: Buffer, ctx: NativeContext): Promise<void> {
    if (this.failRestore.has(id)) {
      throw new ServiceError(id, 'rejected', 'restore refused', 400, ['Database is newer']);
    }
    this.restored.push({ id, data: data.toString(), ctx });
  }
  async fixConnections(restored: NativeBackupService[], keys: Record<string, string>) {
    this.fixed.push({ restored, keys });
    return restored.length;
  }
}

class FakeVpn {
  saved: VpnConfigInput[] = [];
  testOk = true;
  async save(input: VpnConfigInput) {
    this.saved.push(input);
    return {};
  }
  reconnects = 0;
  async reconnect() {
    this.reconnects += 1;
  }
  async test() {
    return { ok: this.testOk };
  }
}

class FakeWiring {
  isRunning = false;
  plans: WiringPlan[] = [];
  ok = true;
  async run(_mode: string, plan: WiringPlan) {
    this.plans.push(plan);
    return { ok: this.ok, changes: 3 };
  }
}

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-backup-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const keysA = { sonarr: 'a'.repeat(32), sabnzbd: 'b'.repeat(32), jellyfin: 'c'.repeat(32) };
const keysB = { sonarr: '1'.repeat(32), sabnzbd: '2'.repeat(32), gluetun: '3'.repeat(32) };

/** An install whose setup is finished: torrents + usenet, TV only, Mullvad, a ledger. */
async function finishedInstall(dir: string, now = new Date('2026-11-01T10:00:00Z')) {
  const state: State = {
    ...defaultState(now),
    wizard: {
      completedSteps: ['welcome', 'system', 'account', 'download', 'vpn', 'library', 'finish'],
      answers: {
        download: { method: 'torrents' },
        vpn: { mode: 'configured' },
        library: {
          libraries: { movies: false, tv: true, music: false },
          audio: [{ code: 'original', required: false }],
          subtitles: [{ code: 'en', required: false }],
          quality: 'balanced',
          language: 'en',
        },
        finish: { result: 'ok' },
      },
    },
    account: { username: 'owner', passwordHash: 'x', updatedAt: now.toISOString() },
    vpn: {
      provider: 'mullvad',
      protocol: 'wireguard',
      locations: ['Germany'],
      portForwarding: false,
      forwardedPort: null,
      freePlan: false,
      fields: { wgAddresses: '10.64.0.2/32' },
      configuredAt: now.toISOString(),
      lastTest: null,
    },
    wiring: {
      ledger: [
        {
          key: 'sonarr.rootfolder',
          service: 'sonarr',
          kind: 'rootfolder',
          id: '1',
          name: '/data/media/tv',
          createdAt: now.toISOString(),
          adopted: false,
        },
        {
          key: 'jellyfin.library.tv',
          service: 'jellyfin',
          kind: 'library',
          id: 'x',
          name: 'Shows',
          createdAt: now.toISOString(),
          adopted: false,
        },
        {
          key: 'bazarr.x',
          service: 'bazarr',
          kind: 'x',
          id: '2',
          name: 'x',
          createdAt: now.toISOString(),
          adopted: false,
        },
      ],
      applied: [
        'sonarr.hardlinks',
        'jellyfin.languages:en',
        'qbittorrent.preferences',
        'bazarr.connect',
      ],
      lastRun: { at: now.toISOString(), mode: 'run', ok: true, changes: 9 },
    },
  };
  await stateStore(dir).save(state);
  await secretsStore(dir).save({
    ...defaultSecrets(),
    apiKeys: keysA,
    account: { password: 'owner-password' },
    vpn: { fields: { wgPrivateKey: 'private-key-AAAA' } },
  });
}

function service(dir: string, over: Partial<ConstructorParameters<typeof BackupService>[0]> = {}) {
  const native = new FakeNative();
  const vpn = new FakeVpn();
  const wiring = new FakeWiring();
  const svc = new BackupService({
    stateDir: dir,
    backupsDir: path.join(dir, 'backups'),
    version: '0.0.17',
    lock: new Mutex(),
    native,
    vpn,
    wiring,
    collectSystemInfo: async () => system,
    scryptParams: FAST,
    ...over,
  });
  return { svc, native, vpn, wiring };
}

async function apiCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
  return 'no error';
}

describe('creating backups', () => {
  it('includes state, secrets and the native backups of the services in use', async () => {
    const a = path.join(root, 'a');
    await finishedInstall(a);
    const { svc, native } = service(a);
    native.failCreate.add('jellyfin');
    const { name, manifest } = await svc.create('manual', 'a long password');
    expect(name).toMatch(/^easyarr-backup-\d{4}-\d{2}-\d{2}-\d{4}\.easyarr$/);
    // TV only: no Radarr/Lidarr; Prowlarr is always used.
    expect(native.created).toEqual(['sonarr', 'prowlarr']);
    expect(manifest.parts).toEqual(['easyarr', 'sonarr', 'prowlarr']);
    expect(manifest.skipped).toEqual([{ part: 'jellyfin', reason: 'jellyfin: not running' }]);
    expect(manifest.encrypted).toBe(true);
  });

  it('before the setup is finished, backs up EasyArr only', async () => {
    const a = path.join(root, 'a');
    await stateStore(a).load();
    await secretsStore(a).load();
    const { svc, native } = service(a);
    const { manifest } = await svc.create('manual');
    expect(manifest.parts).toEqual(['easyarr']);
    expect(native.created).toEqual([]);
  });

  it('runs the automatic backup once a day at the chosen local time and keeps the newest N', async () => {
    const a = path.join(root, 'a');
    await finishedInstall(a);
    let now = new Date('2026-11-09T02:30:00Z'); // 03:30 in Berlin
    const { svc } = service(a, { now: () => now });
    await svc.saveSettings({
      enabled: true,
      hour: 4,
      minute: 0,
      keep: 2,
      timeZone: 'Europe/Berlin',
    });
    expect(await svc.due()).toBe(false);
    now = new Date('2026-11-09T03:00:00Z'); // 04:00 Berlin
    expect(await svc.due()).toBe(true);
    await svc.runAutomatic();
    expect(await svc.due()).toBe(false); // once per day
    const view = await svc.view();
    expect(view.lastAuto).toMatchObject({ ok: true, error: null });
    expect(view.files.map((f) => f.name)).toEqual(['easyarr-backup-2026-11-09-0400.easyarr']);

    // A missed time (dashboard was down at 04:00) still runs later that day; old ones are pruned.
    for (const [i, iso] of ['2026-11-10T09:00:00Z', '2026-11-11T09:00:00Z'].entries()) {
      now = new Date(iso);
      expect(await svc.due()).toBe(true);
      await svc.runAutomatic();
      // mtime decides "newest"; make it explicit.
      const f = path.join(a, 'backups', `easyarr-backup-2026-11-${10 + i}-1000.easyarr`);
      await fs.utimes(f, now, now);
    }
    const old = path.join(a, 'backups', 'easyarr-backup-2026-11-09-0400.easyarr');
    await expect(fs.stat(old)).rejects.toThrow();
    // A file the user put there under another name is never pruned.
    await fs.writeFile(path.join(a, 'backups', 'my-copy.easyarr'), 'x');
    await svc.saveSettings({
      enabled: true,
      hour: 4,
      minute: 0,
      keep: 1,
      timeZone: 'Europe/Berlin',
    });
    expect((await svc.files()).map((f) => f.name).sort()).toEqual([
      'easyarr-backup-2026-11-11-1000.easyarr',
      'my-copy.easyarr',
    ]);

    await svc.saveSettings({
      enabled: false,
      hour: 4,
      minute: 0,
      keep: 1,
      timeZone: 'Europe/Berlin',
    });
    now = new Date('2026-11-12T09:00:00Z');
    expect(await svc.due()).toBe(false);
  });

  it('refuses file names that could leave the backups folder', async () => {
    const { svc } = service(root);
    expect(await apiCode(svc.readFile('../state.json'))).toBe('invalid_name');
    expect(await apiCode(svc.deleteFile('x/../../y.easyarr'))).toBe('invalid_name');
  });
});

describe('restoring', () => {
  async function backupFromA(password?: string) {
    const a = path.join(root, 'a');
    await finishedInstall(a);
    return (await service(a).svc.create('manual', password)).data;
  }

  /** A fresh install: defaults + its own init-made keys. */
  async function freshB() {
    const b = path.join(root, 'b');
    await stateStore(b).load();
    await secretsStore(b).save({ ...defaultSecrets(), apiKeys: keysB });
    return b;
  }

  it('shows what is inside, asks for the password and says when it is wrong', async () => {
    const file = await backupFromA('a long password');
    const { svc } = service(await freshB());
    const locked = await svc.saveUpload(file);
    expect(locked).toMatchObject({
      encrypted: true,
      unlocked: false,
      setup: null,
      appVersion: '0.0.17',
    });
    expect(await apiCode(svc.inspect({ kind: 'upload' }, 'nope'))).toBe('wrong_password');
    const summary = await svc.inspect({ kind: 'upload' }, 'a long password');
    expect(summary).toMatchObject({
      unlocked: true,
      native: ['sonarr', 'prowlarr', 'jellyfin'],
      setup: {
        account: 'owner',
        downloadMethod: 'torrents',
        vpnProvider: 'mullvad',
        libraries: ['tv'],
        finished: true,
      },
    });
    expect(await apiCode(svc.saveUpload(Buffer.from('not a backup')))).toBe('not_a_backup');
  });

  it('brings the setup back on a fresh install, keeping its own API keys', async () => {
    const file = await backupFromA('a long password');
    const b = await freshB();
    const { svc, native, vpn, wiring } = service(b);
    await svc.saveUpload(file);
    const events: RestoreEvent[] = [];
    const run = await svc.prepareRestore({ kind: 'upload' }, 'a long password');
    expect(await run((e) => events.push(e))).toEqual({ ok: true });

    expect(events[0]).toEqual({
      type: 'start',
      steps: ['easyarr', 'sonarr', 'prowlarr', 'jellyfin', 'connections', 'vpn', 'wiring'],
    });
    expect(
      events
        .filter((e) => e.type === 'step' && e.state === 'done')
        .map((e) => e.type === 'step' && e.step),
    ).toEqual(['easyarr', 'sonarr', 'prowlarr', 'jellyfin', 'connections', 'vpn', 'wiring']);
    expect(events.at(-1)).toEqual({ type: 'end', ok: true });

    // Native restores ran with this install's keys and could log in with either account.
    expect(native.restored.map((r) => [r.id, r.data])).toEqual([
      ['sonarr', 'sonarr-native-backup'],
      ['prowlarr', 'prowlarr-native-backup'],
      ['jellyfin', 'jellyfin-native-backup'],
    ]);
    expect(native.restored[0]?.ctx.keys).toEqual(keysB);
    expect(native.restored[0]?.ctx.accounts).toEqual([
      { username: 'owner', password: 'owner-password' },
    ]);
    expect(native.fixed).toEqual([{ restored: ['sonarr', 'prowlarr', 'jellyfin'], keys: keysB }]);

    const state = (await stateStore(b).load()).value;
    const secrets = (await secretsStore(b).load()).value;
    expect(state.wizard.completedSteps).toContain('finish');
    expect(state.account?.username).toBe('owner');
    // Restored services keep their ledger; services set up fresh (Bazarr, qBittorrent) are wired anew.
    expect(state.wiring.ledger.map((e) => e.key)).toEqual([
      'sonarr.rootfolder',
      'jellyfin.library.tv',
    ]);
    expect(state.wiring.applied).toEqual(['sonarr.hardlinks', 'jellyfin.languages:en']);
    expect(secrets.apiKeys).toEqual(keysB);
    expect(secrets.account?.password).toBe('owner-password');
    expect(secrets.vpn?.fields).toEqual({ wgPrivateKey: 'private-key-AAAA' });

    // VPN written again with plain + secret fields, then the wiring check with the backup's plan.
    expect(vpn.saved).toEqual([
      {
        provider: 'mullvad',
        protocol: 'wireguard',
        locations: ['Germany'],
        portForwarding: false,
        forwardedPort: null,
        freePlan: false,
        fields: { wgAddresses: '10.64.0.2/32', wgPrivateKey: 'private-key-AAAA' },
      },
    ]);
    expect(vpn.reconnects).toBe(1);
    expect(wiring.plans[0]).toMatchObject({
      torrents: true,
      usenet: false,
      libraries: { tv: true, movies: false },
    });
    // The upload is gone afterwards.
    expect(await apiCode(svc.inspect({ kind: 'upload' }))).toBe('no_upload');
  });

  it('falls back to setting a service up again when its own backup cannot be restored', async () => {
    const file = await backupFromA();
    const b = await freshB();
    const { svc, native, vpn, wiring } = service(b);
    native.failRestore.add('jellyfin');
    vpn.testOk = false;
    wiring.ok = false;
    await svc.saveUpload(file);
    const events: RestoreEvent[] = [];
    const run = await svc.prepareRestore({ kind: 'upload' }, undefined);
    const result = await run((e) => events.push(e));
    expect(result.ok).toBe(false);
    expect(events).toContainEqual({
      type: 'step',
      step: 'jellyfin',
      state: 'failed',
      note: 'fallback',
      error: { message: 'jellyfin: restore refused', details: ['Database is newer'] },
    });
    expect(events).toContainEqual({
      type: 'step',
      step: 'vpn',
      state: 'failed',
      note: 'vpn_failed',
    });
    expect(events).toContainEqual({
      type: 'step',
      step: 'wiring',
      state: 'failed',
      note: 'wiring_problems',
    });
    const state = (await stateStore(b).load()).value;
    expect(state.wiring.ledger.map((e) => e.key)).toEqual(['sonarr.rootfolder']);
    expect(state.wiring.applied).toEqual(['sonarr.hardlinks']);
    expect(native.fixed[0]?.restored).toEqual(['sonarr', 'prowlarr']);
  });

  it('refuses a backup from a newer EasyArr, and a restore while the wiring runs', async () => {
    const a = path.join(root, 'a');
    await finishedInstall(a);
    const raw = JSON.parse(await fs.readFile(stateStore(a).file, 'utf8')) as Record<
      string,
      unknown
    >;
    const newer = await writeBackup({
      createdAt: new Date(),
      app: { name: 'EasyArr', version: '9.0.0' },
      kind: 'manual',
      parts: ['easyarr'],
      skipped: [],
      files: [
        {
          name: 'easyarr/state.json',
          data: Buffer.from(JSON.stringify({ ...raw, schemaVersion: 99 })),
        },
        { name: 'easyarr/secrets.json', data: await fs.readFile(secretsStore(a).file) },
      ],
    });
    const b = await freshB();
    const { svc } = service(b);
    await svc.saveUpload(newer);
    expect(await apiCode(svc.inspect({ kind: 'upload' }))).toBe('newer_format');
    expect(await apiCode(svc.prepareRestore({ kind: 'upload' }, undefined))).toBe('newer_format');

    const ok = (await service(a).svc.create('manual')).data;
    const busy = service(b, { wiring: Object.assign(new FakeWiring(), { isRunning: true }) }).svc;
    await busy.saveUpload(ok);
    expect(await apiCode(busy.prepareRestore({ kind: 'upload' }, undefined))).toBe(
      'wiring_running',
    );
  });
});
