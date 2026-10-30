import { APP_ID } from './brand.js';

/**
 * The services EasyArr runs (SPEC §3). Ports are internal container ports; VPN-side services
 * share one network namespace, so their ports must never collide.
 */
export type ServiceId =
  | 'qbittorrent'
  | 'sabnzbd'
  | 'prowlarr'
  | 'flaresolverr'
  | 'sonarr'
  | 'radarr'
  | 'lidarr'
  | 'bazarr'
  | 'recyclarr'
  | 'unpackerr'
  | 'cleanuparr'
  | 'jellyfin'
  | 'jellyseerr';

export interface ServiceInfo {
  id: ServiceId;
  /** Upstream product name (not translated). */
  name: string;
  network: 'vpn' | 'normal';
  /** Internal port, or null for headless services. */
  port: number | null;
  /** Path prefix the dashboard proxies the UI under (phase 05), null if not proxied. */
  urlBase: string | null;
  /** Host port when the UI is published directly (SPEC §5.6). */
  publishedPort?: number;
}

export const SERVICES: readonly ServiceInfo[] = [
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    network: 'normal',
    port: 8096,
    urlBase: null,
    publishedPort: 39096,
  },
  {
    id: 'jellyseerr',
    name: 'Jellyseerr',
    network: 'normal',
    port: 5055,
    urlBase: null,
    publishedPort: 39055,
  },
  { id: 'sonarr', name: 'Sonarr', network: 'vpn', port: 8989, urlBase: '/apps/sonarr' },
  { id: 'radarr', name: 'Radarr', network: 'vpn', port: 7878, urlBase: '/apps/radarr' },
  { id: 'lidarr', name: 'Lidarr', network: 'vpn', port: 8686, urlBase: '/apps/lidarr' },
  { id: 'prowlarr', name: 'Prowlarr', network: 'vpn', port: 9696, urlBase: '/apps/prowlarr' },
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    network: 'vpn',
    port: 8090,
    urlBase: '/apps/qbittorrent',
  },
  { id: 'sabnzbd', name: 'SABnzbd', network: 'vpn', port: 8080, urlBase: '/apps/sabnzbd' },
  { id: 'bazarr', name: 'Bazarr', network: 'vpn', port: 6767, urlBase: '/apps/bazarr' },
  {
    id: 'cleanuparr',
    name: 'Cleanuparr',
    network: 'vpn',
    port: 11011,
    urlBase: '/apps/cleanuparr',
  },
  { id: 'flaresolverr', name: 'FlareSolverr', network: 'vpn', port: 8191, urlBase: null },
  { id: 'recyclarr', name: 'Recyclarr', network: 'vpn', port: null, urlBase: null },
  { id: 'unpackerr', name: 'Unpackerr', network: 'vpn', port: null, urlBase: null },
];

export function getService(id: ServiceId): ServiceInfo {
  const s = SERVICES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown service ${id}`);
  return s;
}

/** Umbrel injects `<app-id>_<service>_1` as container name (D-026). */
export function containerName(service: string): string {
  return `${APP_ID}_${service}_1`;
}

/** Host that reaches a service from outside the VPN namespace (D-026). */
export function serviceHost(id: ServiceId): string {
  return getService(id).network === 'vpn' ? containerName('vpn') : containerName(id);
}
