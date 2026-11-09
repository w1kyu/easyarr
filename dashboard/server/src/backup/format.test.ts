import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  BackupFormatError,
  readBackup,
  readManifest,
  writeBackup,
  type FormatMigration,
  type WriteBackupInput,
} from './format.js';
import { readTar, writeTar } from './tar.js';

const FAST = { N: 2 ** 10, r: 8, p: 1 };

const input = (over: Partial<WriteBackupInput> = {}): WriteBackupInput => ({
  createdAt: new Date('2026-11-09T04:00:00Z'),
  app: { name: 'EasyArr', version: '0.0.17' },
  kind: 'manual',
  parts: ['easyarr', 'sonarr'],
  skipped: [{ part: 'jellyfin', reason: 'not reachable' }],
  files: [
    { name: 'easyarr/state.json', data: Buffer.from('{"a":1}') },
    { name: 'native/sonarr.zip', data: Buffer.from([1, 2, 3, 4, 5, 0, 255]) },
  ],
  scryptParams: FAST,
  ...over,
});

async function code(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (err) {
    if (err instanceof BackupFormatError) return err.code;
    throw err;
  }
  return 'no error';
}

/** Rewrites the outer tar (to fake damaged or older/newer files). */
function rewriteOuter(file: Buffer, edit: (name: string, data: Buffer) => Buffer): Buffer {
  const entries = readTar(gunzipSync(file)).map((e) => ({ ...e, data: edit(e.name, e.data) }));
  return gzipSync(writeTar(entries));
}

const editManifest = (file: Buffer, fn: (m: Record<string, unknown>) => void) =>
  rewriteOuter(file, (name, data) => {
    if (name !== 'manifest.json') return data;
    const m = JSON.parse(data.toString()) as Record<string, unknown>;
    fn(m);
    return Buffer.from(JSON.stringify(m));
  });

describe('tar', () => {
  it('round-trips files of any size, including empty ones', () => {
    const files = [
      { name: 'a.txt', data: Buffer.from('hello') },
      { name: 'dir/empty', data: Buffer.alloc(0) },
      { name: 'dir/big.bin', data: Buffer.alloc(1300, 7) },
    ];
    expect(readTar(writeTar(files))).toEqual(files);
  });

  it('refuses unsafe names', () => {
    expect(() => writeTar([{ name: 'x'.repeat(101), data: Buffer.alloc(0) }])).toThrow();
    const evil = writeTar([{ name: 'ok', data: Buffer.from('x') }]);
    evil.write('../etc/passwd\0', 0, 'utf8');
    // checksum now fails first, which is just as good: nothing is extracted.
    expect(() => readTar(evil)).toThrow();
  });
});

describe('.easyarr format', () => {
  it('round-trips without a password', async () => {
    const file = await writeBackup(input());
    const opened = await readBackup(file);
    expect(opened.manifest).toMatchObject({
      formatVersion: 1,
      kind: 'manual',
      parts: ['easyarr', 'sonarr'],
      encrypted: false,
      app: { version: '0.0.17' },
    });
    expect(opened.files.get('native/sonarr.zip')).toEqual(Buffer.from([1, 2, 3, 4, 5, 0, 255]));
    expect([...opened.files.keys()]).toEqual(['easyarr/state.json', 'native/sonarr.zip']);
  });

  it('round-trips with a password, and the content is not readable without it', async () => {
    const file = await writeBackup(input({ password: 'correct horse' }));
    expect(gunzipSync(file).includes(Buffer.from('{"a":1}'))).toBe(false);
    const m = readManifest(file);
    expect(m.encrypted).toBe(true);
    expect(m.encryption).toMatchObject({ cipher: 'aes-256-gcm', kdf: 'scrypt', N: 1024 });
    const opened = await readBackup(file, { password: 'correct horse' });
    expect(opened.files.get('easyarr/state.json')?.toString()).toBe('{"a":1}');
  });

  it('asks for the password, and tells a wrong one apart from a damaged file', async () => {
    const file = await writeBackup(input({ password: 'correct horse' }));
    expect(await code(readBackup(file))).toBe('password_required');
    expect(await code(readBackup(file, { password: 'wrong' }))).toBe('wrong_password');

    const damaged = rewriteOuter(file, (name, data) => {
      if (name !== 'payload.enc') return data;
      const copy = Buffer.from(data);
      copy[copy.length - 20] = (copy[copy.length - 20] as number) ^ 0xff;
      return copy;
    });
    expect(await code(readBackup(damaged, { password: 'correct horse' }))).toBe('corrupted');
    expect(await code(() => readManifest(damaged))).toBe('corrupted');
  });

  it('detects damaged and foreign files', async () => {
    const file = await writeBackup(input());
    expect(await code(readBackup(file.subarray(0, file.length - 30)))).toBe('corrupted');
    expect(await code(readBackup(Buffer.from('PK\x03\x04 a zip file')))).toBe('not_a_backup');
    expect(
      await code(readBackup(gzipSync(writeTar([{ name: 'x', data: Buffer.from('y') }])))),
    ).toBe('not_a_backup');
    const flipped = rewriteOuter(file, (name, data) =>
      name === 'payload.tar'
        ? Buffer.from(data.toString('latin1').replace('{"a":1}', '{"a":2}'), 'latin1')
        : data,
    );
    expect(await code(readBackup(flipped))).toBe('corrupted');
  });

  it('refuses a backup made by a newer EasyArr with a clear code', async () => {
    const newer = editManifest(await writeBackup(input()), (m) => (m['formatVersion'] = 2));
    expect(await code(readBackup(newer))).toBe('newer_format');
    expect(await code(() => readManifest(newer))).toBe('newer_format');
  });

  it('upgrades an older format through its migration', async () => {
    // Pretend this build writes format 2, which renamed the part "easyarr" to "state".
    const v1 = await writeBackup(input());
    const migrations: FormatMigration[] = [
      {
        from: 1,
        migrate: (manifest, files) => ({
          manifest: {
            ...manifest,
            parts: (manifest['parts'] as string[]).map((p) => (p === 'easyarr' ? 'state' : p)),
          },
          files: new Map([...files].map(([k, v]) => [k.replace(/^easyarr\//, 'state/'), v])),
        }),
      },
    ];
    const opened = await readBackup(v1, { currentVersion: 2, migrations });
    expect(opened.manifest.formatVersion).toBe(2);
    expect(opened.manifest.parts).toEqual(['state', 'sonarr']);
    expect(opened.files.has('state/state.json')).toBe(true);
    expect(readManifest(v1, { currentVersion: 2, migrations }).parts).toEqual(['state', 'sonarr']);
    // Without a migration path, an older file can't be read either.
    expect(await code(readBackup(v1, { currentVersion: 2, migrations: [] }))).toBe('corrupted');
  });

  it('names files by date in the chosen time zone', () => {
    const d = new Date('2026-11-09T03:00:00Z');
    expect(backupFileName(d)).toBe('easyarr-backup-2026-11-09-0300.easyarr');
    expect(backupFileName(d, 'Europe/Berlin')).toBe('easyarr-backup-2026-11-09-0400.easyarr');
  });
});
