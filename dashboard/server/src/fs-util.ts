import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Write a file atomically: temp file in the same directory → fsync → rename → fsync dir.
 * A crash leaves either the old or the new content, never a half-written file.
 */
export async function writeFileAtomic(file: string, data: string, mode = 0o600): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );
  const handle = await fs.open(tmp, 'w', mode);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.chmod(tmp, mode);
  await fs.rename(tmp, file);
  try {
    const dirHandle = await fs.open(dir, 'r');
    await dirHandle.sync();
    await dirHandle.close();
  } catch {
    // Directory fsync is best-effort (not supported on every filesystem).
  }
}

export async function readFileIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** chown only when running as root (inside the init container); no-op in tests/dev. */
export async function chownIfRoot(target: string, uid: number, gid: number): Promise<void> {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    await fs.chown(target, uid, gid);
  }
}
