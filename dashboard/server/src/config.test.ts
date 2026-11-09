import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadInitConfig, loadServeConfig, networkGateway } from './config.js';

describe('config', () => {
  it('uses container defaults', () => {
    const c = loadServeConfig({});
    expect(c).toMatchObject({
      port: 3000,
      stateDir: '/easyarr',
      licensesDir: '/licenses',
      dataDir: '/data',
      host: '0.0.0.0',
    });
    expect(loadInitConfig({})).toMatchObject({
      dataRoot: '/data',
      appDataDir: '/appdata',
      uid: 1000,
      gid: 1000,
    });
  });

  it("shows Umbrel's app version (umbrel-app.yml), not the image's commit version", () => {
    expect(loadServeConfig({ EASYARR_VERSION: '0.0.0-sha.60864e3' }).version).toBe(
      '0.0.0-sha.60864e3',
    );
    expect(
      loadServeConfig({ EASYARR_VERSION: '0.0.0-sha.60864e3', APP_VERSION: '0.0.15' }).version,
    ).toBe('0.0.15');
    expect(loadServeConfig({}).version).toBe('0.0.0-dev');
  });

  it('resolves relative paths (dev) to absolute ones', () => {
    const c = loadServeConfig({ EASYARR_WEB_DIR: 'web/dist', EASYARR_STATE_DIR: './state' });
    expect(path.isAbsolute(c.webDir)).toBe(true);
    expect(path.isAbsolute(c.stateDir)).toBe(true);
  });

  it('trusts loopback and the Docker gateway of NETWORK_IP; finds Gluetun by container name', () => {
    const c = loadServeConfig({ NETWORK_IP: '10.21.0.0', EASYARR_TRUSTED_CLIENTS: '192.168.1.5' });
    expect(c.trustedClients).toEqual(['127.0.0.1', '::1', '10.21.0.1', '192.168.1.5']);
    expect(loadServeConfig({}).trustedClients).toEqual(['127.0.0.1', '::1']);
    expect(c.gluetunUrl).toBe('http://w1kyu-easyarr_vpn_1:8000');
    expect(c.qbittorrentUrl).toBe('http://w1kyu-easyarr_vpn_1:8090');
    expect(c.vpnDir).toBe('/vpn');
    expect(networkGateway('10.21.0.0')).toBe('10.21.0.1');
    expect(networkGateway('nope')).toBeNull();
  });

  it("builds the public dashboard URL from Umbrel's device domain", () => {
    expect(loadServeConfig({}).publicUrl).toBe('http://umbrel.local:39000');
    expect(loadServeConfig({ DEVICE_DOMAIN_NAME: 'nas.local' }).publicUrl).toBe(
      'http://nas.local:39000',
    );
    expect(loadServeConfig({ EASYARR_PUBLIC_URL: 'http://x:1' }).publicUrl).toBe('http://x:1');
  });

  it('rejects invalid numbers', () => {
    expect(() => loadServeConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadInitConfig({ PUID: '-1' })).toThrow(/PUID/);
  });
});
