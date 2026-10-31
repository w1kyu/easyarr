import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientAllowlist, ownIpv4Addresses } from './allowlist.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyarr-allow-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const read = () => fs.readFile(path.join(dir, 'easyarr', 'allowed-clients'), 'utf8');
const ips = async () => (await read()).split('\n').filter((l) => l && !l.startsWith('#'));

describe('ownIpv4Addresses', () => {
  it('lists external IPv4 addresses only', () => {
    expect(
      ownIpv4Addresses({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as os.NetworkInterfaceInfo],
        eth0: [
          { address: '10.21.0.17', family: 'IPv4', internal: false } as os.NetworkInterfaceInfo,
          { address: 'fe80::1', family: 'IPv6', internal: false } as os.NetworkInterfaceInfo,
        ],
      }),
    ).toEqual(['10.21.0.17']);
  });
});

describe('ClientAllowlist', () => {
  it('writes the dashboard and request-page addresses, only when they change', async () => {
    let seerr = ['10.21.0.30'];
    const list = new ClientAllowlist({
      vpnDir: dir,
      ownAddresses: () => ['10.21.0.17'],
      resolve: async (host) => {
        expect(host).toBe('w1kyu-easyarr_jellyseerr_1');
        return seerr;
      },
    });
    expect(await list.runOnce()).toBe(true);
    expect(await ips()).toEqual(['10.21.0.17', '10.21.0.30']);
    expect(await list.runOnce()).toBe(false);
    seerr = ['10.21.0.31'];
    expect(await list.runOnce()).toBe(true);
    expect(await ips()).toEqual(['10.21.0.17', '10.21.0.31']);
  });

  it('keeps the last known request-page address while it is down', async () => {
    let up = true;
    const list = new ClientAllowlist({
      vpnDir: dir,
      ownAddresses: () => ['10.21.0.17'],
      resolve: async () => {
        if (!up) throw new Error('ENOTFOUND');
        return ['10.21.0.30'];
      },
    });
    await list.runOnce();
    up = false;
    expect(await list.runOnce()).toBe(false);
    expect(await ips()).toEqual(['10.21.0.17', '10.21.0.30']);
  });

  it('never writes an empty list (empty would let every container in)', async () => {
    const list = new ClientAllowlist({
      vpnDir: dir,
      ownAddresses: () => [],
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect(await list.runOnce()).toBe(false);
    await expect(read()).rejects.toThrow();
  });
});
