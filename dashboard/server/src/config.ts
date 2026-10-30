import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface ServeConfig {
  host: string;
  port: number;
  version: string;
  logLevel: string;
  /** EasyArr's own state (state.json, secrets.json). Mounted from ${APP_DATA_DIR}/data/easyarr. */
  stateDir: string;
  /** Built web app (index.html + assets). */
  webDir: string;
  /** License notices shipped in the image (SPEC §14.1). */
  licensesDir: string;
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

export function loadServeConfig(env: Env = process.env): ServeConfig {
  return {
    host: env['HOST'] ?? '0.0.0.0',
    port: int(env['PORT'], 3000, 'PORT'),
    version: env['EASYARR_VERSION'] ?? '0.0.0-dev',
    logLevel: env['LOG_LEVEL'] ?? 'info',
    stateDir: env['EASYARR_STATE_DIR'] ?? '/easyarr',
    webDir: env['EASYARR_WEB_DIR'] ?? path.resolve(here, '../../web/dist'),
    licensesDir: env['EASYARR_LICENSES_DIR'] ?? '/licenses',
  };
}

export function loadInitConfig(env: Env = process.env): InitConfig {
  return {
    logLevel: env['LOG_LEVEL'] ?? 'info',
    dataRoot: env['EASYARR_DATA_ROOT'] ?? '/data',
    appDataDir: env['EASYARR_APPDATA_DIR'] ?? '/appdata',
    networkIp: env['NETWORK_IP'] ?? '10.21.0.0',
    uid: int(env['PUID'], 1000, 'PUID'),
    gid: int(env['PGID'], 1000, 'PGID'),
  };
}
