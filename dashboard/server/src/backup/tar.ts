/**
 * Minimal POSIX ustar reader/writer for EasyArr backups: regular files only, names ≤ 100 bytes,
 * everything in memory. Enough for our own archives (a few files, each well below 8 GiB) without a
 * dependency. Readers must treat names as untrusted: `readTar` refuses absolute paths and `..`.
 */

const BLOCK = 512;

export interface TarEntry {
  name: string;
  data: Buffer;
}

export class TarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TarError';
  }
}

function octal(value: number, width: number): string {
  // width includes the trailing NUL
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function header(name: string, size: number, mtime: number): Buffer {
  const nameBytes = Buffer.from(name, 'utf8');
  if (nameBytes.length === 0 || nameBytes.length > 100) {
    throw new TarError(`tar: name must be 1–100 bytes: ${name}`);
  }
  const h = Buffer.alloc(BLOCK, 0);
  nameBytes.copy(h, 0);
  h.write(octal(0o600, 8), 100, 'ascii');
  h.write(octal(0, 8), 108, 'ascii');
  h.write(octal(0, 8), 116, 'ascii');
  h.write(octal(size, 12), 124, 'ascii');
  h.write(octal(Math.floor(mtime / 1000), 12), 136, 'ascii');
  h.write('        ', 148, 'ascii'); // checksum placeholder (8 spaces)
  h.write('0', 156, 'ascii'); // regular file
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + ' ', 148, 'ascii');
  return h;
}

export function writeTar(entries: readonly TarEntry[], mtime = Date.now()): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    parts.push(header(e.name, e.data.length, mtime), e.data);
    const pad = (BLOCK - (e.data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  return Buffer.concat(parts);
}

function readOctal(buf: Buffer, start: number, len: number): number {
  const s = buf
    .subarray(start, start + len)
    .toString('ascii')
    .replace(/[\0 ]+$/g, '')
    .trim();
  if (s === '') return 0;
  if (!/^[0-7]+$/.test(s)) throw new TarError('tar: invalid number field');
  return parseInt(s, 8);
}

/** A name we'd write ourselves: relative, no "..", no backslashes, no empty segments. */
export function safeEntryName(name: string): boolean {
  if (!name || name.startsWith('/') || name.includes('\\')) return false;
  return name.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export function readTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  while (off + BLOCK <= buf.length) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) return entries; // end-of-archive marker
    const stored = readOctal(h, 148, 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
    if (sum !== stored) throw new TarError('tar: header checksum mismatch');
    const nameEnd = h.indexOf(0, 0);
    const name = h.subarray(0, nameEnd === -1 || nameEnd > 100 ? 100 : nameEnd).toString('utf8');
    const size = readOctal(h, 124, 12);
    const type = String.fromCharCode(h[156] as number);
    off += BLOCK;
    if (off + size > buf.length) throw new TarError('tar: truncated archive');
    if (type === '0' || type === '\0') {
      if (!safeEntryName(name)) throw new TarError(`tar: unsafe entry name: ${name}`);
      entries.push({ name, data: Buffer.from(buf.subarray(off, off + size)) });
    }
    // Other types (directories, links, pax headers) are skipped; we never write them.
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new TarError('tar: missing end-of-archive marker');
}
