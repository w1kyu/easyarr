import { describe, expect, it } from 'vitest';
import { containerName, SERVICES, serviceHost } from './services.js';

describe('services', () => {
  it('VPN-side services never share a port (one network namespace)', () => {
    const ports = SERVICES.filter((s) => s.network === 'vpn' && s.port !== null).map((s) => s.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('builds Umbrel container names', () => {
    expect(containerName('vpn')).toBe('w1kyu-easyarr_vpn_1');
  });

  it('routes VPN-side services through the vpn container', () => {
    expect(serviceHost('sonarr')).toBe('w1kyu-easyarr_vpn_1');
    expect(serviceHost('jellyfin')).toBe('w1kyu-easyarr_jellyfin_1');
  });

  it('proxied services have a unique /apps/<id> url base', () => {
    for (const s of SERVICES.filter((x) => x.urlBase !== null))
      expect(s.urlBase).toBe(`/apps/${s.id}`);
  });
});
