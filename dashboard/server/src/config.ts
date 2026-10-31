import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID } from '@easyarr/shared';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface ServeConfig {
  host: string;
  port: number;
  version: string;
  logLevel: string;
  /** EasyArr's own state (state.json, secrets.json). Mounted from ${APP_DATA_DIR}/data/easyarr. */
  stateDir: string;
  /** EasyArr's media folder (read-only in the dashboard): free space for the system check. */
  dataDir: string;
  /** Built web app (index.html + assets). */
  webDir: string;
  /** License notices shipped in the image (SPEC §14.1). */
  licensesDir: string;
  /** The vpn container's /gluetun volume (${APP_DATA_DIR}/data/vpn), shared with the VPN wrapper. */
  vpnDir: string;
  /** Gluetun's control server and qBittorrent's API, both inside the VPN namespace (D-026). */
  gluetunUrl: string;
  qbittorrentUrl: string;
  /** Services that tell us our own public IP (outside the VPN) for the "home IP hidden" check. */
  homeIpUrls: string[];
  /**
   * Addresses allowed to call the API: loopback plus Umbrel's app gateway (the Docker network's
   * gateway, NETWORK_IP + 1). Other apps on Umbrel's shared network are refused (D-041).
   */
  trustedClients: string[];
}

export interface InitConfig {
  logLevel: string;
  /** Shared media folder, the single /data mount (SPEC §6). */
  dataRoot: string;
  /** ${APP_DATA_DIR}/data — every service's /config lives below it. */
  appDataDir: string;
  /** Umbrel Docker network base IP, e.g. 10.21.0.0 (NETWORK_IP). */
  networkIp: string;
  uid: number;
  gid: number;
}

type Env = Record<string, string | undefined>;

function int(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`${name} must be a non-negative integer, got "${value}"`);
  return n;
}

/** 10.21.0.0 → 10.21.0.1 (Docker puts the bridge gateway on the first address). */
export function networkGateway(networkIp: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(networkIp.trim());
  if (!m) return null;
  const last = Number(m[4]);
  if (last >= 255) return null;
  return `${m[1]}.${m[2]}.${m[3]}.${last + 1}`;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function loadServeConfig(env: Env = process.env): ServeConfig {
  const vpnHost = `${APP_ID}_vpn_1`;
  const gateway = env['NETWORK_IP'] ? networkGateway(env['NETWORK_IP']) : null;
  return {
    host: env['HOST'] ?? '0.0.0.0',
    port: int(env['PORT'], 3000, 'PORT'),
    version: env['EASYARR_VERSION'] ?? '0.0.0-dev',
    logLevel: env['LOG_LEVEL'] ?? 'info',
    stateDir: path.resolve(env['EASYARR_STATE_DIR'] ?? '/easyarr'),
    dataDir: path.resolve(env['EASYARR_DATA_ROOT'] ?? '/data'),
    webDir: path.resolve(env['EASYARR_WEB_DIR'] ?? path.join(here, '../../web/dist')),
    licensesDir: path.resolve(env['EASYARR_LICENSES_DIR'] ?? '/licenses'),
    vpnDir: path.resolve(env['EASYARR_VPN_DIR'] ?? '/vpn'),
    gluetunUrl: env['EASYARR_GLUETUN_URL'] ?? `http://${vpnHost}:8000`,
    qbittorrentUrl: env['EASYARR_QBITTORRENT_URL'] ?? `http://${vpnHost}:8090`,
    homeIpUrls: env['EASYARR_HOME_IP_URLS']
      ? list(env['EASYARR_HOME_IP_URLS'])
      : ['https://api.ipify.org?format=json', 'https://ipv4.icanhazip.com'],
    trustedClients: [
      '127.0.0.1',
      '::1',
      ...(gateway ? [gateway] : []),
      ...list(env['EASYARR_TRUSTED_CLIENTS']),
    ],
  };
}

export function loadInitConfig(env: Env = process.env): InitConfig {
  return {
    logLevel: env['LOG_LEVEL'] ?? 'info',
    dataRoot: path.resolve(env['EASYARR_DATA_ROOT'] ?? '/data'),
    appDataDir: path.resolve(env['EASYARR_APPDATA_DIR'] ?? '/appdata'),
    networkIp: env['NETWORK_IP'] ?? '10.21.0.0',
    uid: int(env['PUID'], 1000, 'PUID'),
    gid: int(env['PGID'], 1000, 'PGID'),
  };
}
