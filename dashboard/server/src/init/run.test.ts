import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InitConfig } from '../config.js';
import { DATA_TREE, runInit } from './run.js';

const log = pino({ level: 'silent' });
let root: string;
let cfg: InitConfig;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-init-'));
  cfg = {
    logLevel: 'silent',
    dataRoot: path.join(root, 'data'),
    appDataDir: path.join(root, 'appdata'),
    networkIp: '10.21.0.0',
    uid: 1000,
    gid: 1000,
  };
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFile(path.join(cfg.appDataDir, rel), 'utf8');
const secrets = async () =>
  JSON.parse(await read('easyarr/secrets.json')) as { apiKeys: Record<string, string> };

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        out[path.relative(root, p) + '/'] = '';
        await walk(p);
      } else out[path.relative(root, p)] = await fs.readFile(p, 'utf8');
    }
  };
  await walk(dir);
  return out;
}

describe('init', () => {
  it('creates the media tree and service configs on a fresh install', async () => {
    const report = await runInit(cfg, log);
    expect(report.changes.length).toBeGreaterThan(0);
    for (const rel of DATA_TREE) {
      const st = await fs.stat(path.join(cfg.dataRoot, rel));
      expect(st.isDirectory()).toBe(true);
      expect(st.mode & 0o7777).toBe(0o2775);
    }
    const sonarr = await read('sonarr/config.xml');
    const keys = (await secrets()).apiKeys;
    expect(sonarr).toContain('<UrlBase>/apps/sonarr</UrlBase>');
    expect(sonarr).toContain('<Port>8989</Port>');
    expect(sonarr).toContain(`<ApiKey>${keys['sonarr']}</ApiKey>`);
    expect(keys['sonarr']).toMatch(/^[a-f0-9]{32}$/);
    expect(new Set(Object.values(keys)).size).toBe(Object.values(keys).length);
    const qbt = await read('qbittorrent/qBittorrent/qBittorrent.conf');
    expect(qbt).toContain('WebUI\\AuthSubnetWhitelist=10.21.0.0/16');
    expect(qbt).toContain('WebUI\\Port=8090');
    const sab = await read('sabnzbd/sabnzbd.ini');
    expect(sab).toContain(`api_key = ${keys['sabnzbd']}`);
    expect(sab).toContain('host_whitelist = w1kyu-easyarr_vpn_1');
    const st = await fs.stat(path.join(cfg.appDataDir, 'easyarr/secrets.json'));
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await runInit(cfg, log);
    const before = await snapshot(root);
    const report = await runInit(cfg, log);
    expect(report.changes).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });

  it('adopts existing API keys and keeps user settings, but re-applies owned keys', async () => {
    const userKey = 'abcdefabcdefabcdefabcdefabcdef12';
    await fs.mkdir(path.join(cfg.appDataDir, 'radarr'), { recursive: true });
    await fs.writeFile(
      path.join(cfg.appDataDir, 'radarr/config.xml'),
      `<Config>\n  <Port>1234</Port>\n  <ApiKey>${userKey}</ApiKey>\n  <AuthenticationMethod>Forms</AuthenticationMethod>\n  <InstanceName>Movies</InstanceName>\n</Config>\n`,
    );
    await fs.mkdir(path.join(cfg.appDataDir, 'sabnzbd'), { recursive: true });
    await fs.writeFile(
      path.join(cfg.appDataDir, 'sabnzbd/sabnzbd.ini'),
      '[misc]\nhost_whitelist = mybox.local\ncomplete_dir = /data/elsewhere\n',
    );
    await runInit(cfg, log);
    const radarr = await read('radarr/config.xml');
    expect(radarr).toContain(`<ApiKey>${userKey}</ApiKey>`);
    expect(radarr).toContain('<Port>7878</Port>'); // owned
    expect(radarr).toContain('<AuthenticationMethod>Forms</AuthenticationMethod>'); // user's choice kept
    expect(radarr).toContain('<InstanceName>Movies</InstanceName>');
    expect((await secrets()).apiKeys['radarr']).toBe(userKey);
    const sab = await read('sabnzbd/sabnzbd.ini');
    expect(sab).toContain('host_whitelist = mybox.local, w1kyu-easyarr_vpn_1');
    expect(sab).toContain('complete_dir = /data/elsewhere');
  });

  it('stays idempotent after services rewrite their own config files', async () => {
    await runInit(cfg, log);
    // SABnzbd (configobj) writes one-element lists with a trailing comma and may drop keys;
    // qBittorrent drops/migrates keys it no longer uses.
    const sabFile = path.join(cfg.appDataDir, 'sabnzbd/sabnzbd.ini');
    const sab = (await fs.readFile(sabFile, 'utf8'))
      .replace('host_whitelist = w1kyu-easyarr_vpn_1', 'host_whitelist = w1kyu-easyarr_vpn_1,')
      .replace(/^download_dir = .*\n/m, '');
    await fs.writeFile(sabFile, sab);
    const qbtFile = path.join(cfg.appDataDir, 'qbittorrent/qBittorrent/qBittorrent.conf');
    const qbt = (await fs.readFile(qbtFile, 'utf8')).replace(/^Session\\TempPathEnabled=.*\n/m, '');
    expect(qbt).not.toContain('TempPathEnabled');
    await fs.writeFile(qbtFile, qbt);
    const before = await snapshot(root);
    const report = await runInit(cfg, log);
    expect(report.changes).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });

  it('never touches files inside the media folders', async () => {
    await runInit(cfg, log);
    const movie = path.join(cfg.dataRoot, 'media/movies/film.mkv');
    await fs.writeFile(movie, 'x');
    await fs.chmod(movie, 0o600);
    await runInit(cfg, log);
    expect((await fs.stat(movie)).mode & 0o777).toBe(0o600);
  });
});
