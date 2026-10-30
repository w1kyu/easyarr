import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadInitConfig, loadServeConfig } from './config.js';

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

  it('resolves relative paths (dev) to absolute ones', () => {
    const c = loadServeConfig({ EASYARR_WEB_DIR: 'web/dist', EASYARR_STATE_DIR: './state' });
    expect(path.isAbsolute(c.webDir)).toBe(true);
    expect(path.isAbsolute(c.stateDir)).toBe(true);
  });

  it('rejects invalid numbers', () => {
    expect(() => loadServeConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadInitConfig({ PUID: '-1' })).toThrow(/PUID/);
  });
});
