import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashes for state.json (SPEC §7.2): scrypt from Node's standard library, so no native
 * dependency is needed on arm64/amd64 (D-036). Format: `scrypt$N$r$p$<salt b64>$<hash b64>`.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password.normalize('NFC'), salt, keylen, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (!n || !r || !p) return false;
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (expected.length === 0) return false;
  const actual = await scrypt(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 256 * n * r + 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}
