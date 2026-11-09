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
import { seedBazarrConfig } from './bazarr-config.js';
import { parseServarrConfig, serializeServarrConfig } from './servarr-config.js';
import { unpackerrConfig } from './unpackerr-config.js';

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

/** Routes of Gluetun's control server the dashboard uses (everything else stays locked). */
export const GLUETUN_ROUTES = [
  'GET /v1/version',
  'GET /v1/vpn/status',
  'GET /v1/publicip/ip',
  'GET /v1/portforward',
] as const;

export function gluetunAuthConfig(apiKey: string): string {
  return [
    '# Written by EasyArr init — changes are overwritten.',
    '[[roles]]',
    'name = "easyarr-dashboard"',
    'auth = "apikey"',
    `apikey = "${apiKey}"`,
    `routes = [${GLUETUN_ROUTES.map((r) => `"${r}"`).join(', ')}]`,
    '',
  ].join('\n');
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

  // Jellyfin's backups folder is shared with the dashboard (D-070). Docker creates a missing
  // bind-mount source as root, which would lock Jellyfin out of its own data folder: make both
  // folders exist and belong to the app user before Jellyfin starts.
  await ensureDir(
    path.join(cfg.appDataDir, 'jellyfin', 'data'),
    0o755,
    own,
    changes,
    cfg.appDataDir,
  );
  // Jellyfin's data path is <--datadir>/data, so its backups live in jellyfin/data/data/backups.
  await ensureDir(
    path.join(cfg.appDataDir, 'jellyfin', 'data', 'data'),
    0o755,
    own,
    changes,
    cfg.appDataDir,
  );
  await ensureDir(
    path.join(cfg.appDataDir, 'jellyfin', 'data', 'data', 'backups'),
    0o750,
    own,
    changes,
    cfg.appDataDir,
  );

  // 2. EasyArr state + secrets.
  const stateDir = path.join(cfg.appDataDir, 'easyarr');
  await ensureDir(stateDir, 0o700, own, changes, cfg.appDataDir);
  const state = await stateStore(stateDir).load();
  if (state.created) changes.push('created easyarr/state.json');
  if (state.migrated) changes.push('migrated easyarr/state.json');
  const secrets = secretsStore(stateDir);
  const loaded = await secrets.load();
  if (loaded.created) changes.push('created easyarr/secrets.json');
  if (loaded.migrated) changes.push('migrated easyarr/secrets.json');
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
    const changedKeys: string[] = [];
    // qBittorrent ≥ 5 keeps web-UI settings in [WebUI] (it migrated them out of
    // [Preferences] WebUI\\* once, gated by [Meta] MigrationVersion). Old-style keys are ignored
    // after that migration — or, before it, would overwrite ours — so drop legacy duplicates.
    const own_ = (key: string, value: string) => {
      const legacy = ini.remove('Preferences', `WebUI\\${key}`);
      if (ini.set('WebUI', key, value) || legacy) {
        changed = true;
        changedKeys.push(`WebUI/${key}`);
      }
    };
    // Owned: port + access from the Umbrel Docker network (dashboard proxy, *arr apps).
    own_('Port', '8090');
    own_('AuthSubnetWhitelistEnabled', 'true');
    own_('AuthSubnetWhitelist', `${cfg.networkIp}/16`);
    own_('HostHeaderValidation', 'false');
    // Sonarr/Radarr/Lidarr/Cleanuparr reach qBittorrent on localhost (shared VPN namespace) without
    // a password; the inbound allowlist (D-046) keeps everyone else out.
    own_('LocalHostAuth', 'false');
    // With reverse-proxy support on, X-Forwarded-For would replace the dashboard's address in the
    // subnet-whitelist check (research: downloaders.md §1.4).
    own_('ReverseProxySupportEnabled', 'false');
    // Defaults, only on first creation: qBittorrent rewrites and migrates its file on start, so
    // re-adding defaults it dropped would flip-flop on every start (idempotency).
    if (raw === undefined) {
      ini.set('BitTorrent', 'Session\\DefaultSavePath', '/data/downloads/torrents');
      ini.set('BitTorrent', 'Session\\TempPathEnabled', 'false');
      changed = true;
    }
    if (changed) {
      await ensureDir(path.dirname(file), 0o755, own, [], cfg.appDataDir);
      await writeService(file, ini.toString(), own);
      changes.push(
        raw === undefined
          ? 'created qbittorrent/qBittorrent/qBittorrent.conf'
          : `updated qbittorrent/qBittorrent/qBittorrent.conf (${changedKeys.join(', ')})`,
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
    // Owned: the dashboard proxies the UI under /apps/sabnzbd without stripping it (D-045). Seeded
    // here: changing url_base through SABnzbd's API makes it restart itself.
    changed = ini.set('misc', 'url_base', '/apps/sabnzbd', sep) || changed;
    // SABnzbd writes lists configobj-style ("a, b" or "a," for one item): only touch it when a
    // host is actually missing, never just to reformat (idempotency).
    const whitelist = (ini.get('misc', 'host_whitelist') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const missing = [containerName('vpn')].filter((h) => !whitelist.includes(h));
    if (missing.length) {
      changed =
        ini.set('misc', 'host_whitelist', [...whitelist, ...missing].join(', '), sep) || changed;
    }
    // Defaults, only on first creation.
    if (raw === undefined) {
      ini.set('misc', 'download_dir', '/data/downloads/usenet/incomplete', sep);
      ini.set('misc', 'complete_dir', '/data/downloads/usenet/complete', sep);
      changed = true;
    }
    if (changed) {
      await writeService(file, ini.toString(), own);
      changes.push(`${raw === undefined ? 'created' : 'updated'} sabnzbd/sabnzbd.ini`);
    }
  }

  // 5b. Bazarr (/config/config/config.yaml). Bazarr rewrites the whole file with every default on
  //     start, so only parsed values of owned keys are compared (never the text).
  {
    const file = path.join(cfg.appDataDir, 'bazarr', 'config', 'config.yaml');
    const raw = await readFileIfExists(file);
    const result = seedBazarrConfig(raw, {
      apiKey: apiKeys['bazarr'],
      sonarrKey: apiKeys['sonarr'] as string,
      radarrKey: apiKeys['radarr'] as string,
    });
    apiKeys['bazarr'] = result.apiKey;
    if (result.content !== null) {
      await ensureDir(path.join(cfg.appDataDir, 'bazarr'), 0o755, own, [], cfg.appDataDir);
      await ensureDir(path.dirname(file), 0o755, own, [], cfg.appDataDir);
      await writeService(file, result.content, own);
      changes.push(`${raw === undefined ? 'created' : 'updated'} bazarr/config/config.yaml`);
    }
  }

  // 5c. Unpackerr (/config/unpackerr.conf): EasyArr's file entirely. Read once at start; its web UI
  //     is off, because with it on Unpackerr rewrites the file to store a generated password.
  {
    const file = path.join(cfg.appDataDir, 'unpackerr', 'unpackerr.conf');
    const desired = unpackerrConfig({
      sonarr: apiKeys['sonarr'] as string,
      radarr: apiKeys['radarr'] as string,
      lidarr: apiKeys['lidarr'] as string,
    });
    const raw = await readFileIfExists(file);
    if (raw !== desired) {
      await ensureDir(path.join(cfg.appDataDir, 'unpackerr'), 0o755, own, [], cfg.appDataDir);
      await writeService(file, desired, own);
      changes.push(`${raw === undefined ? 'created' : 'updated'} unpackerr/unpackerr.conf`);
    }
  }

  // 5d. Recyclarr: the dashboard writes recyclarr.yml and asks for syncs through .easyarr/ (D-048).
  await ensureDir(path.join(cfg.appDataDir, 'recyclarr'), 0o755, own, changes, cfg.appDataDir);
  await ensureDir(
    path.join(cfg.appDataDir, 'recyclarr', '.easyarr'),
    0o755,
    own,
    changes,
    cfg.appDataDir,
  );

  // 6. VPN folder (D-041): EasyArr's files for the wrapper (vpn.env, status, custom configs) and the
  //    API key the dashboard uses for Gluetun's control server. Gluetun reads the auth file when it
  //    starts; without it every control-server route stays locked.
  {
    const vpnDir = path.join(cfg.appDataDir, 'vpn');
    await ensureDir(path.join(vpnDir, 'easyarr'), 0o700, own, changes, cfg.appDataDir);
    await ensureDir(path.join(vpnDir, 'easyarr', 'custom'), 0o700, own, changes, cfg.appDataDir);
    await ensureDir(path.join(vpnDir, 'auth'), 0o700, own, changes, cfg.appDataDir);
    const key =
      apiKeys['gluetun'] && /^[a-f0-9]{32}$/.test(apiKeys['gluetun'])
        ? apiKeys['gluetun']
        : generateApiKey();
    apiKeys['gluetun'] = key;
    const authFile = path.join(vpnDir, 'auth', 'config.toml');
    const desired = gluetunAuthConfig(key);
    if ((await readFileIfExists(authFile)) !== desired) {
      await writeFileAtomic(authFile, desired, 0o600);
      await own(authFile);
      changes.push('wrote vpn/auth/config.toml');
    }
  }

  // 7. Persist keys (only if something changed).
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
