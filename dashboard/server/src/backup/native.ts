import { promises as fs } from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import { ServiceError } from '../wiring/http.js';
import type { JellyfinClient } from '../wiring/services/jellyfin.js';
import {
  API_VERSION,
  fieldValue,
  type Provider,
  type ServarrApp,
  type ServarrClient,
} from '../wiring/services/servarr.js';

/**
 * Native service backups (SPEC §11 layer 2, D-070). Everything goes through the services' own APIs
 * (no Docker socket); only Jellyfin's archive is handed over through a shared folder because its
 * API creates/restores files on its own disk.
 */

export interface Waits {
  sleep?: (ms: number) => Promise<void>;
  /** Overall limit per wait (default 5 min: big databases, slow disks, first-start migrations). */
  timeoutMs?: number;
  pollMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function until<T>(
  what: string,
  service: string,
  probe: () => Promise<T | undefined>,
  w: Waits,
): Promise<T> {
  const sleep = w.sleep ?? realSleep;
  const deadline = Date.now() + (w.timeoutMs ?? 5 * 60_000);
  let last: unknown;
  for (;;) {
    try {
      const v = await probe();
      if (v !== undefined) return v;
    } catch (err) {
      // A refusal is final (e.g. the backup command failed); anything else may be a restart.
      if (err instanceof ServiceError && err.code === 'rejected') throw err;
      last = err;
    }
    if (Date.now() > deadline) {
      throw new ServiceError(
        service,
        'unreachable',
        `timed out waiting for ${what}${last ? ` (${(last as Error).message})` : ''}`,
      );
    }
    await sleep(w.pollMs ?? 2000);
  }
}

const commandSchema = z.looseObject({ id: z.number(), status: z.string() });
const backupListSchema = z.array(
  z.looseObject({
    id: z.number(),
    name: z.string(),
    path: z.string(),
    type: z.string(),
    time: z.string(),
  }),
);
const statusSchema = z.looseObject({ startTime: z.string(), version: z.string() });

/** Sonarr/Radarr/Lidarr/Prowlarr: built-in backup command, download, upload-restore, restart. */
export class ServarrNative {
  constructor(
    private readonly client: ServarrClient,
    private readonly waits: Waits = {},
  ) {}

  get app(): ServarrApp {
    return this.client.app;
  }

  /** Runs the app's "Backup" command and downloads the zip (config.xml + database). */
  async create(): Promise<Buffer> {
    const c = this.client;
    const known = new Set((await c.get('/system/backup', backupListSchema)).map((b) => b.name));
    const cmd = await c.post('/command', { name: 'Backup' }, commandSchema);
    await until(
      'the backup to finish',
      c.app,
      async () => {
        const s = await c.get(`/command/${cmd.id}`, commandSchema);
        if (s.status === 'completed') return true;
        if (['failed', 'aborted', 'cancelled', 'orphaned'].includes(s.status)) {
          throw new ServiceError(c.app, 'rejected', `backup command ${s.status}`);
        }
        return undefined;
      },
      { ...this.waits, timeoutMs: this.waits.timeoutMs ?? 10 * 60_000 },
    );
    const list = await c.get('/system/backup', backupListSchema);
    const fresh = list.find((b) => b.type === 'manual' && !known.has(b.name));
    if (!fresh) throw new ServiceError(c.app, 'invalid_response', 'backup finished but not listed');
    const res = await c.http.raw(fresh.path, {
      headers: { accept: 'application/zip, application/octet-stream' },
      timeoutMs: 10 * 60_000,
    });
    if (!res.ok) {
      throw new ServiceError(c.app, 'http', `GET ${fresh.path} → HTTP ${res.status}`, res.status);
    }
    const zip = Buffer.from(await res.arrayBuffer());
    // Keep the app's own Backups folder tidy: the copy now lives in the EasyArr backup.
    await c.http
      .json(`/api/${API_VERSION[c.app]}/system/backup/${fresh.id}`, undefined, {
        method: 'DELETE',
      })
      .catch(() => undefined);
    return zip;
  }

  /**
   * Uploads the zip (its config.xml re-keyed to this install's API key first, D-071), restarts the
   * app and waits until the new process answers. Servarr's restart starts a new process inside the
   * container, so the compose restart policy plays no part.
   */
  async restore(zip: Buffer, apiKey: string): Promise<void> {
    const c = this.client;
    const before = (await c.get('/system/status', statusSchema)).startTime;
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(rekeyServarrZip(zip, apiKey))], { type: 'application/zip' }),
      'easyarr-restore.zip',
    );
    await c.http.json(`/api/${API_VERSION[c.app]}/system/backup/restore/upload`, undefined, {
      method: 'POST',
      body: form,
      timeoutMs: 10 * 60_000,
    });
    await c.post('/system/restart', {}).catch((err: unknown) => {
      // The app may drop the connection while shutting down.
      if (!(err instanceof ServiceError && err.code === 'unreachable')) throw err;
    });
    await until(
      'the restart',
      c.app,
      async () => {
        const s = await c.get('/system/status', statusSchema);
        return s.startTime !== before ? true : undefined;
      },
      this.waits,
    );
    await until('the app to be ready', c.app, async () => (await c.ready(), true), this.waits);
  }
}

/**
 * Replaces <ApiKey> in the zip's config.xml, so the restored app keeps answering to the key this
 * install's other services (Bazarr, Unpackerr, Recyclarr, Cleanuparr, the dashboard) already use.
 */
export function rekeyServarrZip(zip: Buffer, apiKey: string): Buffer {
  // Servarr keys are 32 hex chars; anything XML-special must never get in.
  if (!/^[A-Za-z0-9]{16,64}$/.test(apiKey)) throw new Error('invalid API key');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zip));
  } catch {
    throw new ServiceError('easyarr', 'rejected', 'the service backup inside is not a valid zip');
  }
  const configName = Object.keys(files).find((n) => n.toLowerCase() === 'config.xml');
  if (!configName) throw new ServiceError('easyarr', 'rejected', 'config.xml missing in the zip');
  const xml = strFromU8(files[configName] as Uint8Array);
  const next = /<ApiKey>[^<]*<\/ApiKey>/.test(xml)
    ? xml.replace(/<ApiKey>[^<]*<\/ApiKey>/, `<ApiKey>${apiKey}</ApiKey>`)
    : xml.replace(/<\/Config>/, `  <ApiKey>${apiKey}</ApiKey>\n</Config>`);
  const out: Zippable = {};
  for (const [name, data] of Object.entries(files)) {
    out[name] = name === configName ? strToU8(next) : data;
  }
  return Buffer.from(zipSync(out, { level: 6 }));
}

/** The API key inside a Servarr backup zip (to tell which key restored connections hold). */
export function servarrZipApiKey(zip: Buffer): string | null {
  try {
    const files = unzipSync(new Uint8Array(zip), {
      filter: (f) => f.name.toLowerCase() === 'config.xml',
    });
    const xml = Object.values(files)[0];
    if (!xml) return null;
    return /<ApiKey>([^<]*)<\/ApiKey>/.exec(strFromU8(xml))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * After a restore, connections inside the restored apps still carry the old install's keys: the
 * SABnzbd download client (SABnzbd itself is set up fresh) and Prowlarr's applications (the *arr apps
 * keep this install's keys). Puts this install's keys back; `forceSave` skips the connection test
 * for download clients. Returns how many connections were updated.
 */
export async function fixConnectionKeys(
  apps: Partial<Record<ServarrApp, ServarrClient>>,
  keys: Record<string, string>,
): Promise<number> {
  let changed = 0;
  const setField = (p: Provider, name: string, value: string): Provider => ({
    ...p,
    fields: p.fields.map((f) => (f.name === name ? { ...f, value } : f)),
  });
  for (const app of ['sonarr', 'radarr', 'lidarr'] as const) {
    const c = apps[app];
    const sab = keys['sabnzbd'];
    if (!c || !sab) continue;
    for (const p of await c.providers('downloadclient')) {
      if (p.implementation !== 'Sabnzbd') continue;
      if (!['localhost', '127.0.0.1'].includes(String(fieldValue(p, 'host')))) continue;
      await c.put(`/downloadclient/${p.id}`, setField(p, 'apiKey', sab), undefined, {
        forceSave: true,
      });
      changed += 1;
    }
  }
  const prowlarr = apps.prowlarr;
  if (prowlarr) {
    for (const p of await prowlarr.providers('applications')) {
      const app = p.implementation.toLowerCase();
      const key = keys[app];
      if (!key || !['sonarr', 'radarr', 'lidarr'].includes(app)) continue;
      if (!/localhost|127\.0\.0\.1/.test(String(fieldValue(p, 'baseUrl')))) continue;
      // Prowlarr re-tests the app and syncs its indexers (with Prowlarr's own key) on save.
      await prowlarr.put(`/applications/${p.id}`, setField(p, 'apiKey', key), undefined, {
        forceSave: true,
      });
      changed += 1;
    }
  }
  return changed;
}

/** Jellyfin's built-in backup, handed over through its backups folder (mounted into the dashboard). */
export class JellyfinNative {
  constructor(
    private readonly client: JellyfinClient,
    /** Jellyfin's backups folder as the dashboard sees it. */
    private readonly hostDir: string,
    /** The same folder inside the Jellyfin container. */
    private readonly containerDir = '/config/data/backups',
    private readonly waits: Waits = {},
  ) {}

  async create(token: string): Promise<Buffer> {
    const { path: p } = await this.client.createBackup(token);
    const file = path.join(this.hostDir, path.posix.basename(p));
    let data: Buffer;
    try {
      data = await fs.readFile(file);
    } catch (err) {
      throw new ServiceError(
        'jellyfin',
        'invalid_response',
        `backup made but not found in the shared folder (${(err as Error).message})`,
      );
    }
    await fs.unlink(file).catch(() => undefined);
    return data;
  }

  async restore(archive: Buffer, token: string): Promise<void> {
    const name = `easyarr-restore-${Date.now()}.zip`;
    const file = path.join(this.hostDir, name);
    await fs.mkdir(this.hostDir, { recursive: true });
    await fs.writeFile(file, archive, { mode: 0o640 });
    try {
      await this.client.restoreBackup(token, path.posix.join(this.containerDir, name));
      // Jellyfin stops ~0.5 s later, restores while its web server is down, then starts again.
      // Seeing it go down once tells the old process from the restored one.
      let wentDown = false;
      const sleep = this.waits.sleep ?? realSleep;
      const downDeadline = Date.now() + 60_000;
      while (!wentDown && Date.now() < downDeadline) {
        try {
          await this.client.ready();
        } catch {
          wentDown = true;
          break;
        }
        await sleep(500);
      }
      await until(
        'Jellyfin to start again',
        'jellyfin',
        async () => (await this.client.ready(), true),
        this.waits,
      );
    } finally {
      await fs.unlink(file).catch(() => undefined);
    }
  }
}
