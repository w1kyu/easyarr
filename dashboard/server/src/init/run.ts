import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getService, containerName, type ServiceId } from '@easyarr/shared';
import type { Logger } from 'pino';
import type { InitConfig } from '../config.js';
import { chownIfRoot, readFileIfExists, writeFileAtomic } from '../fs-util.js';
import { registerSecrets } from '../logger.js';
import { secretsStore, stateStore } from '../state/index.js';
import { IniFile } from './ini.js';
import { parseServarrConfig, serializeServarrConfig } from './servarr-config.js';

/** The shared media tree (SPEC §6). Parents are listed before children. */
export const DATA_TREE = [
  'downloads',
  'downloads/torrents',
  'downloads/torrents/movies',
  'downloads/torrents/tv',
  'downloads/torrents/music',
  'downloads/usenet',
  'downloads/usenet/incomplete',
  'downloads/usenet/complete',
  'downloads/usenet/complete/movies',
  'downloads/usenet/complete/tv',
  'downloads/usenet/complete/music',
  'media',
  'media/movies',
  'media/tv',
  'media/music',
  'backups',
] as const;

const SERVARR: readonly ServiceId[] = ['sonarr', 'radarr', 'lidarr', 'prowlarr'];

export interface InitReport {
  /** Human-readable list of what changed. Empty on a second run (idempotency). */
  changes: string[];
}

export function generateApiKey(): string {
  return randomBytes(16).toString('hex');
}

/**
 * One-shot init (SPEC §7.4): folders, API keys, minimal service configs.
 * Idempotent. Never overwrites a value the user may have changed, except the keys EasyArr
 * owns and documents (ports, url bases, Docker-network access) — those are needed for the
 * stack to work and are re-applied if they drift.
 */
export async function runInit(cfg: InitConfig, log: Logger): Promise<InitReport> {
  const changes: string[] = [];
  const own = (p: string) => chownIfRoot(p, cfg.uid, cfg.gid);

  // 1. Shared media tree.
  await ensureDir(cfg.dataRoot, 0o2775, own, changes, cfg.dataRoot);
  for (const rel of DATA_TREE) {
    await ensureDir(path.join(cfg.dataRoot, rel), 0o2775, own, changes, cfg.dataRoot);
  }

  // 2. EasyArr state + secrets.
  const stateDir = path.join(cfg.appDataDir, 'easyarr');
  await ensureDir(stateDir, 0o700, own, changes, cfg.appDataDir);
  const state = await stateStore(stateDir).load();
  if (state.created) changes.push('created easyarr/state.json');
  if (state.migrated) changes.push('migrated easyarr/state.json');
  const secrets = secretsStore(stateDir);
  const loaded = await secrets.load();
  if (loaded.created) changes.push('created easyarr/secrets.json');
  const apiKeys = { ...loaded.value.apiKeys };

  // 3. Servarr apps: config.xml with our owned keys + an API key we know.
  for (const id of SERVARR) {
    const svc = getService(id);
    const file = path.join(cfg.appDataDir, id, 'config.xml');
    const raw = await readFileIfExists(file);
    const xml = raw === undefined ? new Map<string, string>() : parseServarrConfig(raw);
    const before = raw === undefined ? undefined : serializeServarrConfig(xml);

    // API key: the config file wins (the user may have regenerated it), else ours, else new.
    const existing = xml.get('ApiKey');
    const apiKey =
      existing && /^[a-f0-9]{32}$/i.test(existing) ? existing : (apiKeys[id] ?? generateApiKey());
    xml.set('ApiKey', apiKey);
    apiKeys[id] = apiKey;
    // Owned keys (D-031).
    xml.set('Port', String(svc.port));
    xml.set('UrlBase', svc.urlBase ?? '');
    xml.set('BindAddress', '*');
    // Defaults only on first creation.
    if (raw === undefined) {
      xml.set('AuthenticationMethod', 'External');
      xml.set('AuthenticationRequired', 'DisabledForLocalAddresses');
      xml.set('UpdateMechanism', 'Docker');
      xml.set('LogLevel', 'info');
    }
    const after = serializeServarrConfig(xml);
    if (after !== before) {
      await writeService(file, after, own);
      changes.push(`${raw === undefined ? 'created' : 'updated'} ${id}/config.xml`);
    }
  }

  // 4. qBittorrent (linuxserver layout: /config/qBittorrent/qBittorrent.conf).
  {
    const file = path.join(cfg.appDataDir, 'qbittorrent', 'qBittorrent', 'qBittorrent.conf');
    const raw = await readFileIfExists(file);
    const ini = new IniFile(raw ?? '');
    let changed = false;
    // Owned: port + access from the Umbrel Docker network (dashboard proxy, *arr apps).
    changed = ini.set('Preferences', 'WebUI\\Port', '8090') || changed;
    changed = ini.set('Preferences', 'WebUI\\AuthSubnetWhitelistEnabled', 'true') || changed;
    changed =
      ini.set('Preferences', 'WebUI\\AuthSubnetWhitelist', `${cfg.networkIp}/16`) || changed;
    changed = ini.set('Preferences', 'WebUI\\HostHeaderValidation', 'false') || changed;
    // Defaults.
    changed = ini.setDefault('LegalNotice', 'Accepted', 'true') || changed;
    changed =
      ini.setDefault('BitTorrent', 'Session\\DefaultSavePath', '/data/downloads/torrents') ||
      changed;
    changed = ini.setDefault('BitTorrent', 'Session\\TempPathEnabled', 'false') || changed;
    changed =
      ini.setDefault('Preferences', 'Downloads\\SavePath', '/data/downloads/torrents/') || changed;
    if (changed) {
      await ensureDir(path.dirname(file), 0o755, own, [], cfg.appDataDir);
      await writeService(file, ini.toString(), own);
      changes.push(
        `${raw === undefined ? 'created' : 'updated'} qbittorrent/qBittorrent/qBittorrent.conf`,
      );
    }
  }

  // 5. SABnzbd (/config/sabnzbd.ini, configobj format `key = value`).
  {
    const file = path.join(cfg.appDataDir, 'sabnzbd', 'sabnzbd.ini');
    const raw = await readFileIfExists(file);
    const ini = new IniFile(raw ?? '');
    let changed = false;
    const sep = ' = ';
    const apiKey = ini.get('misc', 'api_key') || apiKeys['sabnzbd'] || generateApiKey();
    const nzbKey = ini.get('misc', 'nzb_key') || apiKeys['sabnzbd-nzb'] || generateApiKey();
    apiKeys['sabnzbd'] = apiKey;
    apiKeys['sabnzbd-nzb'] = nzbKey;
    changed = ini.set('misc', 'api_key', apiKey, sep) || changed;
    changed = ini.set('misc', 'nzb_key', nzbKey, sep) || changed;
    // Owned: port + accept requests addressed to the vpn container name (D-031).
    changed = ini.set('misc', 'port', '8080', sep) || changed;
    const whitelist = (ini.get('misc', 'host_whitelist') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    for (const host of [containerName('vpn')]) if (!whitelist.includes(host)) whitelist.push(host);
    changed = ini.set('misc', 'host_whitelist', whitelist.join(', '), sep) || changed;
    // Defaults.
    changed =
      ini.setDefault('misc', 'download_dir', '/data/downloads/usenet/incomplete', sep) || changed;
    changed =
      ini.setDefault('misc', 'complete_dir', '/data/downloads/usenet/complete', sep) || changed;
    if (changed) {
      await writeService(file, ini.toString(), own);
      changes.push(`${raw === undefined ? 'created' : 'updated'} sabnzbd/sabnzbd.ini`);
    }
  }

  // 6. Persist keys (only if something changed).
  const keysChanged = JSON.stringify(apiKeys) !== JSON.stringify(loaded.value.apiKeys);
  if (keysChanged) {
    await secrets.save({ ...loaded.value, apiKeys });
    changes.push('updated easyarr/secrets.json');
  }
  await own(path.join(stateDir, 'state.json'));
  await own(path.join(stateDir, 'secrets.json'));
  registerSecrets(Object.values(apiKeys));

  if (changes.length) log.info({ changes }, 'init made changes');
  else log.info('init: everything already in place');
  return { changes };
}

async function ensureDir(
  dir: string,
  mode: number,
  own: (p: string) => Promise<void>,
  changes: string[],
  relativeTo: string,
): Promise<void> {
  let created = false;
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw new Error(`${dir} exists but is not a directory`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    await fs.mkdir(dir, { recursive: true });
    created = true;
  }
  // Only fix mode/owner of folders EasyArr manages — never recurse into user files.
  const st = await fs.stat(dir);
  if ((st.mode & 0o7777) !== mode) await fs.chmod(dir, mode);
  await own(dir);
  if (created) changes.push(`created ${path.relative(relativeTo, dir) || '.'}/`);
}

async function writeService(
  file: string,
  content: string,
  own: (p: string) => Promise<void>,
): Promise<void> {
  await writeFileAtomic(file, content, 0o644);
  await own(file);
}
