import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-backup-routes-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const make = () =>
  buildApp({
    config: {
      version: '1.2.3',
      webDir: dir,
      licensesDir: '/nonexistent',
      stateDir: path.join(dir, 'state'),
      dataDir: dir,
      backupsDir: path.join(dir, 'backups'),
      jellyfinBackupsDir: path.join(dir, 'jf'),
    },
  });

describe('/api/backup', () => {
  it('downloads a backup as a file and takes it back as an upload', async () => {
    const app = await make();
    const res = await app.inject({
      method: 'POST',
      url: '/api/backup',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(String(res.headers['content-disposition'])).toMatch(
      /^attachment; filename="easyarr-backup-\d{4}-\d{2}-\d{2}-\d{4}\.easyarr"$/,
    );
    const file = res.rawPayload;

    // Raw uploads need EasyArr's header: a cross-site form/fetch can't add it without a preflight.
    const plain = await app.inject({
      method: 'POST',
      url: '/api/backup/upload',
      headers: { 'content-type': 'application/octet-stream' },
      payload: file,
    });
    expect(plain.statusCode).toBe(415);
    const up = await app.inject({
      method: 'POST',
      url: '/api/backup/upload',
      headers: { 'content-type': 'application/octet-stream', 'x-easyarr-upload': '1' },
      payload: file,
    });
    expect(up.statusCode).toBe(200);
    expect(up.json()).toMatchObject({ encrypted: false, unlocked: false, native: [] });

    const inspect = await app.inject({
      method: 'POST',
      url: '/api/backup/inspect',
      headers: { 'content-type': 'application/json' },
      payload: { source: { kind: 'upload' } },
    });
    expect(inspect.json()).toMatchObject({ unlocked: true, setup: { finished: false } });

    const junk = await app.inject({
      method: 'POST',
      url: '/api/backup/upload',
      headers: { 'content-type': 'application/octet-stream', 'x-easyarr-upload': '1' },
      payload: Buffer.from('hello'),
    });
    expect(junk.statusCode).toBe(400);
    expect(junk.json()).toMatchObject({ error: 'not_a_backup' });
  });

  it('refuses short passwords and bad settings', async () => {
    const app = await make();
    const res = await app.inject({
      method: 'POST',
      url: '/api/backup',
      headers: { 'content-type': 'application/json' },
      payload: { password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    const settings = await app.inject({
      method: 'PUT',
      url: '/api/backup/settings',
      headers: { 'content-type': 'application/json' },
      payload: { enabled: true, hour: 25, minute: 0, keep: 7, timeZone: 'UTC' },
    });
    expect(settings.statusCode).toBe(400);
    const view = await app.inject({ method: 'GET', url: '/api/backup' });
    expect(view.json()).toMatchObject({ enabled: true, hour: 4, minute: 0, keep: 7, files: [] });
  });
});
