import { describe, expect, it } from 'vitest';
import { defaultSecrets, defaultState } from '../state/index.js';
import { knownValues } from './known.js';

const WG_PRIVATE = 'eF3wq8m0Hk1ZgX5bQ2yP9tL7cV4nR6sD0aJ8uK2iMWg=';
const WG_PUBLIC = 'yJ8sN2rQ4tV6wX8zA0bC2dE4fG6hI8jK0lM2nO4pQ0Y=';

describe('knownValues', () => {
  it('lists secrets, usernames and hosts with their types', () => {
    const state = defaultState();
    state.account = { username: 'mira_k', passwordHash: 'h', updatedAt: 'x' };
    state.wizard.answers = {
      usenet: {
        servers: [
          {
            id: 'a',
            preset: null,
            host: 'news.example.net',
            port: 563,
            ssl: true,
            username: 'nu',
            connections: 10,
          },
        ],
        indexers: [
          { id: 'b', preset: null, name: 'X', url: 'https://idx.example.org', apiPath: '/api' },
        ],
      },
    };
    const secrets = {
      ...defaultSecrets(),
      apiKeys: { sonarr: 'k'.repeat(32) },
      account: { password: 'pw-123456' },
      vpn: {
        fields: {
          username: 'vpnuser',
          password: 'vpnpass',
          wgConfig: `[Interface]\nPrivateKey = ${WG_PRIVATE}\nAddress = 10.2.0.2/32\n[Peer]\nPublicKey = ${WG_PUBLIC}\nEndpoint = wg.example.com:51820\n`,
          ovpnConfig: 'client\nremote vpn1.example.com 1194\nremote 1.2.3.4 443\n',
        },
      },
      usenet: { servers: { a: 'usenet-pw' }, indexers: { b: 'indexer-key' } },
    };
    const known = knownValues(state, secrets);
    const has = (value: string, type: string) =>
      expect(known, `${value} as ${type}`).toContainEqual({ value, type });
    has('k'.repeat(32), 'apikey');
    has('pw-123456', 'password');
    has('mira_k', 'username');
    has('vpnuser', 'username');
    has('vpnpass', 'password');
    has(WG_PRIVATE, 'key');
    has('wg.example.com', 'host');
    has('vpn1.example.com', 'host');
    has('1.2.3.4', 'host');
    has('news.example.net', 'host');
    has('nu', 'username');
    has('idx.example.org', 'host');
    has('usenet-pw', 'password');
    has('indexer-key', 'apikey');
    // The public key identifies the server, not the user, and is not a secret.
    expect(known.some((k) => k.value === WG_PUBLIC)).toBe(false);
  });

  it('copes with nothing stored yet', () => {
    expect(knownValues(null, null)).toEqual([]);
    expect(knownValues(defaultState(), defaultSecrets())).toEqual([]);
  });
});
