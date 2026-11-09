import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { readTar, TarError, writeTar, type TarEntry } from './tar.js';

/**
 * The `.easyarr` backup file (SPEC §11, D-069):
 *
 *   gzip(tar[ manifest.json, payload.tar | payload.enc ])
 *
 * - manifest.json: format version, EasyArr version, date, which parts are inside, whether the
 *   payload is encrypted (+ the scrypt/AES-GCM parameters) and the payload's SHA-256.
 * - payload.tar: tar[ contents.json (name, size, SHA-256 per file), the files ].
 * - payload.enc: AES-256-GCM(gzip(payload.tar)), key = scrypt(password, salt).
 *
 * The manifest stays readable without the password (so the restore screen can say what a file is
 * and ask for the password). It holds no secrets. The payload checksum is checked before
 * decrypting, which tells "file damaged" apart from "wrong password" (the GCM tag fails only then).
 */

export const BACKUP_FORMAT = 'easyarr-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = '.easyarr';

const AAD = Buffer.from(`${BACKUP_FORMAT}/encrypted-payload`);
/** 128 MiB of memory per derivation: slow for guessing, fine on a Raspberry Pi. */
export const DEFAULT_SCRYPT = { N: 2 ** 17, r: 8, p: 1 } as const;
/** Upper bounds when reading, so a crafted file can't make us allocate gigabytes. */
const MAX_SCRYPT_N = 2 ** 20;

export type BackupErrorCode =
  | 'not_a_backup' // not a .easyarr file at all
  | 'corrupted' // checksums don't match / truncated
  | 'password_required'
  | 'wrong_password'
  | 'newer_format'; // made by a newer EasyArr than this one understands

export class BackupFormatError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

const encryptionSchema = z.object({
  cipher: z.literal('aes-256-gcm'),
  kdf: z.literal('scrypt'),
  N: z
    .number()
    .int()
    .min(2 ** 10)
    .max(MAX_SCRYPT_N),
  r: z.number().int().min(1).max(32),
  p: z.number().int().min(1).max(16),
  salt: z.string().min(16),
  iv: z.string().min(16),
});

export const backupPartSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

export const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1),
  createdAt: z.string(),
  app: z.object({ name: z.string(), version: z.string() }),
  kind: z.enum(['manual', 'automatic']),
  /** "easyarr" (state replay, always) + services whose own backup is inside. */
  parts: z.array(backupPartSchema),
  /** Services whose own backup couldn't be made (restore falls back to state replay for them). */
  skipped: z.array(z.object({ part: backupPartSchema, reason: z.string().max(300) })),
  encrypted: z.boolean(),
  encryption: encryptionSchema.optional(),
  payload: z.object({
    name: z.enum(['payload.tar', 'payload.enc']),
    size: z.number().int().min(0),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
export type BackupManifest = z.infer<typeof manifestSchema>;

const contentsSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      size: z.number().int().min(0),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

/** An older format → the current one. `from` is the version it upgrades. */
export interface FormatMigration {
  from: number;
  migrate(
    manifest: Record<string, unknown>,
    files: Map<string, Buffer>,
  ): { manifest: Record<string, unknown>; files: Map<string, Buffer> };
}

/** Format 1 is the first; later formats add their upgrade here. */
export const FORMAT_MIGRATIONS: readonly FormatMigration[] = [];

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function deriveKey(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFC'),
      salt,
      32,
      { ...params, maxmem: 256 * params.N * params.r + 32 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export interface WriteBackupInput {
  createdAt: Date;
  app: { name: string; version: string };
  kind: BackupManifest['kind'];
  parts: string[];
  skipped: BackupManifest['skipped'];
  /** Files inside the payload, e.g. "easyarr/state.json", "native/sonarr.zip". */
  files: TarEntry[];
  password?: string | undefined;
  /** Tests use cheaper parameters. */
  scryptParams?: { N: number; r: number; p: number };
}

export async function writeBackup(input: WriteBackupInput): Promise<Buffer> {
  const contents = {
    files: input.files.map((f) => ({ name: f.name, size: f.data.length, sha256: sha256(f.data) })),
  };
  const inner = writeTar([
    { name: 'contents.json', data: Buffer.from(JSON.stringify(contents, null, 2)) },
    ...input.files,
  ]);

  let payload: Buffer;
  let encryption: BackupManifest['encryption'];
  if (input.password) {
    const params = input.scryptParams ?? DEFAULT_SCRYPT;
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(input.password, salt, params);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(AAD);
    payload = Buffer.concat([cipher.update(gzipSync(inner)), cipher.final(), cipher.getAuthTag()]);
    encryption = {
      cipher: 'aes-256-gcm',
      kdf: 'scrypt',
      ...params,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
    };
  } else {
    payload = inner;
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: input.createdAt.toISOString(),
    app: input.app,
    kind: input.kind,
    parts: input.parts,
    skipped: input.skipped,
    encrypted: Boolean(input.password),
    ...(encryption ? { encryption } : {}),
    payload: {
      name: input.password ? 'payload.enc' : 'payload.tar',
      size: payload.length,
      sha256: sha256(payload),
    },
  };
  const outer = writeTar(
    [
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
      { name: manifest.payload.name, data: payload },
    ],
    input.createdAt.getTime(),
  );
  return gzipSync(outer);
}

interface Outer {
  rawManifest: Record<string, unknown>;
  entries: TarEntry[];
}

function readOuter(file: Buffer): Outer {
  let tar: Buffer;
  try {
    tar = gunzipSync(file);
  } catch {
    // gzip magic present but inflating fails = damaged; anything else isn't ours.
    throw file[0] === 0x1f && file[1] === 0x8b
      ? new BackupFormatError('corrupted', 'the backup file is damaged (gzip)')
      : new BackupFormatError('not_a_backup', 'not an EasyArr backup');
  }
  let entries: TarEntry[];
  try {
    entries = readTar(tar);
  } catch (err) {
    if (err instanceof TarError) throw new BackupFormatError('corrupted', err.message);
    throw err;
  }
  const m = entries.find((e) => e.name === 'manifest.json');
  if (!m) throw new BackupFormatError('not_a_backup', 'manifest.json missing');
  let raw: unknown;
  try {
    raw = JSON.parse(m.data.toString('utf8'));
  } catch {
    throw new BackupFormatError('corrupted', 'manifest.json is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    throw new BackupFormatError('not_a_backup', 'not an EasyArr backup');
  }
  return { rawManifest: raw as Record<string, unknown>, entries };
}

function checkVersion(raw: Record<string, unknown>, current: number): number {
  const v = raw['formatVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new BackupFormatError('corrupted', 'manifest.json has no valid formatVersion');
  }
  if (v > current) {
    throw new BackupFormatError(
      'newer_format',
      `backup format ${v} is newer than this EasyArr understands (${current})`,
    );
  }
  return v;
}

function parseManifest(raw: Record<string, unknown>): BackupManifest {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BackupFormatError('corrupted', `manifest.json: ${parsed.error.issues[0]?.message}`);
  }
  if (parsed.data.encrypted !== Boolean(parsed.data.encryption)) {
    throw new BackupFormatError('corrupted', 'manifest.json: encryption settings inconsistent');
  }
  return parsed.data;
}

export interface ReadOptions {
  password?: string | undefined;
  /** Defaults to the real ones; tests inject their own. */
  currentVersion?: number;
  migrations?: readonly FormatMigration[];
}

/**
 * Manifest only (no password needed): what the restore screen shows before asking for one.
 * Validates the format version and the payload checksum.
 */
export function readManifest(file: Buffer, opts: ReadOptions = {}): BackupManifest {
  const current = opts.currentVersion ?? BACKUP_FORMAT_VERSION;
  const { rawManifest, entries } = readOuter(file);
  const version = checkVersion(rawManifest, current);
  // An older manifest is only shown after its migration (fields may have moved).
  const manifest =
    version === current
      ? parseManifest(rawManifest)
      : parseManifest(migrateAll(rawManifest, new Map(), version, opts).manifest);
  verifyPayload(manifest, entries);
  return manifest;
}

function verifyPayload(manifest: BackupManifest, entries: TarEntry[]): Buffer {
  const payload = entries.find((e) => e.name === manifest.payload.name);
  if (!payload) throw new BackupFormatError('corrupted', `${manifest.payload.name} missing`);
  if (
    payload.data.length !== manifest.payload.size ||
    sha256(payload.data) !== manifest.payload.sha256
  ) {
    throw new BackupFormatError('corrupted', 'the backup file is damaged (checksum)');
  }
  return payload.data;
}

function migrateAll(
  manifest: Record<string, unknown>,
  files: Map<string, Buffer>,
  from: number,
  opts: ReadOptions,
): { manifest: Record<string, unknown>; files: Map<string, Buffer> } {
  const current = opts.currentVersion ?? BACKUP_FORMAT_VERSION;
  const migrations = opts.migrations ?? FORMAT_MIGRATIONS;
  let out = { manifest, files };
  for (let v = from; v < current; v++) {
    const m = migrations.find((x) => x.from === v);
    if (!m) throw new BackupFormatError('corrupted', `no upgrade from backup format ${v}`);
    out = m.migrate(out.manifest, out.files);
    out.manifest = { ...out.manifest, formatVersion: v + 1 };
  }
  return out;
}

export interface OpenedBackup {
  manifest: BackupManifest;
  /** Payload files by name (contents.json excluded), checksums verified. */
  files: Map<string, Buffer>;
}

export async function readBackup(file: Buffer, opts: ReadOptions = {}): Promise<OpenedBackup> {
  const current = opts.currentVersion ?? BACKUP_FORMAT_VERSION;
  const { rawManifest, entries } = readOuter(file);
  const version = checkVersion(rawManifest, current);
  // The payload layout is described by the manifest of *its* version; check it before migrating.
  const stored = parseManifest({ ...rawManifest, formatVersion: version });
  const payload = verifyPayload(stored, entries);

  let innerTar: Buffer;
  if (stored.encrypted) {
    const enc = stored.encryption;
    if (!enc) throw new BackupFormatError('corrupted', 'encryption settings missing');
    if (!opts.password) throw new BackupFormatError('password_required', 'password required');
    if (payload.length < 16) throw new BackupFormatError('corrupted', 'payload too short');
    const key = await deriveKey(opts.password, Buffer.from(enc.salt, 'base64'), enc);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(payload.subarray(payload.length - 16));
    let compressed: Buffer;
    try {
      compressed = Buffer.concat([
        decipher.update(payload.subarray(0, payload.length - 16)),
        decipher.final(),
      ]);
    } catch {
      // The checksum matched, so the bytes are intact: the key is wrong.
      throw new BackupFormatError('wrong_password', 'wrong password');
    }
    try {
      innerTar = gunzipSync(compressed);
    } catch {
      throw new BackupFormatError('corrupted', 'the backup content is damaged (gzip)');
    }
  } else {
    innerTar = payload;
  }

  let inner: TarEntry[];
  try {
    inner = readTar(innerTar);
  } catch (err) {
    if (err instanceof TarError) throw new BackupFormatError('corrupted', err.message);
    throw err;
  }
  const contentsEntry = inner.find((e) => e.name === 'contents.json');
  if (!contentsEntry) throw new BackupFormatError('corrupted', 'contents.json missing');
  let contents: z.infer<typeof contentsSchema>;
  try {
    contents = contentsSchema.parse(JSON.parse(contentsEntry.data.toString('utf8')));
  } catch {
    throw new BackupFormatError('corrupted', 'contents.json is invalid');
  }
  const files = new Map<string, Buffer>();
  for (const f of contents.files) {
    const e = inner.find((x) => x.name === f.name);
    if (!e || e.data.length !== f.size || sha256(e.data) !== f.sha256) {
      throw new BackupFormatError('corrupted', `checksum mismatch: ${f.name}`);
    }
    files.set(f.name, e.data);
  }

  if (version === current) return { manifest: stored, files };
  const migrated = migrateAll(rawManifest, files, version, opts);
  return { manifest: parseManifest(migrated.manifest), files: migrated.files };
}

/** "easyarr-backup-2026-11-09-0400.easyarr" in the given time zone. */
export function backupFileName(date: Date, timeZone = 'UTC'): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `easyarr-backup-${parts['year']}-${parts['month']}-${parts['day']}-${parts['hour']}${parts['minute']}${BACKUP_EXTENSION}`;
}
