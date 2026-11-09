import type { NativeBackupService, ServiceId } from '@easyarr/shared';
import { URL_BASE } from '../wiring/steps.js';
import { ServiceError } from '../wiring/http.js';
import { JellyfinClient } from '../wiring/services/jellyfin.js';
import { ServarrClient, type ServarrApp } from '../wiring/services/servarr.js';
import { fixConnectionKeys, JellyfinNative, ServarrNative, type Waits } from './native.js';
import type { NativeContext, NativeOps } from './service.js';

export interface RealNativeOpsOptions {
  url: (id: ServiceId) => string;
  /** Jellyfin's backups folder, mounted into the dashboard (D-070). */
  jellyfinBackupsDir: string;
  fetch?: typeof fetch;
  waits?: Waits;
}

const isServarr = (id: NativeBackupService): id is ServarrApp => id !== 'jellyfin';

/** NativeOps against the real services. */
export function realNativeOps(opts: RealNativeOpsOptions): NativeOps {
  const servarr = (app: ServarrApp, keys: Record<string, string>) => {
    const key = keys[app];
    if (!key) throw new ServiceError(app, 'auth', `EasyArr has no API key for ${app}`);
    return new ServarrClient(app, opts.url(app), URL_BASE[app], key, opts.fetch);
  };
  const jellyfin = () => new JellyfinClient(opts.url('jellyfin'), opts.fetch);
  const jellyfinNative = () =>
    new JellyfinNative(jellyfin(), opts.jellyfinBackupsDir, undefined, opts.waits);

  /**
   * An admin token for Jellyfin: EasyArr's API key, else a login. A fresh Jellyfin (restore on a
   * new install) gets its first-run setup done with the backup's account; the restore then brings
   * back the real users anyway.
   */
  const jellyfinToken = async (ctx: NativeContext): Promise<string> => {
    const j = jellyfin();
    await j.ready();
    const key = ctx.keys['jellyfin'];
    if (key && (await j.keyWorks(key))) return key;
    const fresh = !(await j.publicInfo()).StartupWizardCompleted;
    const accounts = fresh ? ctx.accounts.slice(-1) : ctx.accounts;
    if (fresh && accounts[0]) await j.completeStartup(accounts[0].username, accounts[0].password);
    let last: unknown;
    for (const a of accounts) {
      try {
        return (await j.login(a.username, a.password)).token;
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error
      ? last
      : new ServiceError('jellyfin', 'auth', 'no account EasyArr knows can sign in to Jellyfin');
  };

  return {
    async create(id, ctx) {
      if (isServarr(id)) return new ServarrNative(servarr(id, ctx.keys), opts.waits).create();
      return jellyfinNative().create(await jellyfinToken(ctx));
    },
    async restore(id, data, ctx) {
      if (isServarr(id)) {
        const client = servarr(id, ctx.keys);
        return new ServarrNative(client, opts.waits).restore(data, ctx.keys[id] as string);
      }
      return jellyfinNative().restore(data, await jellyfinToken(ctx));
    },
    async fixConnections(restored, keys) {
      const apps: Partial<Record<ServarrApp, ServarrClient>> = {};
      for (const id of restored) if (isServarr(id)) apps[id] = servarr(id, keys);
      return fixConnectionKeys(apps, keys);
    },
  };
}
