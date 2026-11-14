import { describe, expect, it } from 'vitest';
import {
  isSecretKey,
  leaksSecret,
  redacted,
  redactText,
  redactValue,
  typeForKey,
  type KnownValue,
} from './redact.js';

const R = redacted;

// Real-looking values (never real credentials).
const SONARR_KEY = '3f1c0b8a9d2e4f6071829a3b4c5d6e7f';
const WG_PRIVATE = 'eF3wq8m0Hk1ZgX5bQ2yP9tL7cV4nR6sD0aJ8uK2iMWg=';
const ACCOUNT_PASSWORD = 'correct-horse-battery';
const USENET_PASSWORD = 'n3wsP4ss!';
const known: KnownValue[] = [
  { value: SONARR_KEY, type: 'apikey' },
  { value: WG_PRIVATE, type: 'key' },
  { value: ACCOUNT_PASSWORD, type: 'password' },
  { value: USENET_PASSWORD, type: 'password' },
  { value: 'mira_k', type: 'username' },
  { value: 'usenetuser42', type: 'username' },
  { value: 'news.eweka.nl', type: 'host' },
  { value: 'api.nzbgeek.info', type: 'host' },
];

const red = (text: string, privateIps = false) => redactText(text, { known, privateIps });

describe('redactText: known values', () => {
  it('masks every stored secret wherever it appears, with its type', () => {
    expect(red(`GET /api/v3/system/status?apikey=${SONARR_KEY} 401`)).toBe(
      `GET /api/v3/system/status?apikey=${R('apikey')} 401`,
    );
    expect(red(`login with ${ACCOUNT_PASSWORD} failed`)).toBe(`login with ${R('password')} failed`);
    expect(red(`key ${WG_PRIVATE} rejected`)).toBe(`key ${R('key')} rejected`);
  });

  it('masks usernames as whole words only, case-insensitively', () => {
    expect(red('Authentication request for "MIRA_K" has succeeded')).toBe(
      `Authentication request for "${R('username')}" has succeeded`,
    );
    // Part of a longer word: left alone.
    expect(red('mira_k-old is up')).toBe('mira_k-old is up');
  });

  it('masks stored hosts (Usenet servers, indexers)', () => {
    expect(red('Failed to connect to news.eweka.nl (timeout)')).toBe(
      `Failed to connect to ${R('host')} (timeout)`,
    );
  });

  it('skips very short secrets inside text (false positives)', () => {
    expect(redactText('a b c', { known: [{ value: 'b', type: 'password' }] })).toBe('a b c');
  });
});

describe('redactText: patterns from real service logs', () => {
  it('Sonarr/Radarr/Prowlarr', () => {
    expect(
      red(
        'Unable to connect to indexer, check the log above for more details: HttpRequestException: Connection refused (api.drunkenslug.com:443)',
      ),
    ).toBe(
      `Unable to connect to indexer, check the log above for more details: HttpRequestException: Connection refused (${R('host')}:443)`,
    );
    expect(
      red(
        'HTTP request failed: [401:Unauthorized] [GET] at [https://indexer.example.org/api?t=caps&apikey=deadbeefcafe]',
      ),
    ).toBe(
      `HTTP request failed: [401:Unauthorized] [GET] at [https://${R('host')}/api?t=caps&apikey=${R('apikey')}]`,
    );
    expect(
      red(
        'Torrent https://bob:hunter2@private.tracker.cc/announce/9f8e7d6c5b4a39281706f5e4d3c2b1a0 failed',
      ),
    ).toBe(
      `Torrent https://${R('username')}:${R('password')}@${R('host')}/announce/${R('token')} failed`,
    );
    // Versions with four parts are not IP addresses; metadata hosts stay readable.
    expect(red('Sonarr 4.0.20.2900 asked https://skyhook.sonarr.tv/v1/tvdb/shows/en/81189')).toBe(
      'Sonarr 4.0.20.2900 asked https://skyhook.sonarr.tv/v1/tvdb/shows/en/81189',
    );
    expect(red('Jellyfin version 1.0.1.0')).toBe('Jellyfin version 1.0.1.0');
  });

  it('qBittorrent', () => {
    expect(
      red(
        'WebAPI login failure. Reason: invalid credentials, attempt count: 1, IP: ::ffff:85.12.34.56, username: admin',
      ),
    ).toBe(
      `WebAPI login failure. Reason: invalid credentials, attempt count: 1, IP: ::ffff:${R('ip')}, username: ${R('username')}`,
    );
    expect(red('Detected external IP. IP: "185.65.134.77"')).toBe(
      `Detected external IP. IP: "${R('ip')}"`,
    );
    expect(red('Successfully listening on IP. IP: "10.2.0.2". Port: "TCP/51413"')).toBe(
      'Successfully listening on IP. IP: "10.2.0.2". Port: "TCP/51413"',
    );
    expect(red('API key qbt_23456789ABCDEFGHJKLMNPQRSTUV rotated')).toBe(
      `API key ${R('apikey')} rotated`,
    );
  });

  it('SABnzbd', () => {
    expect(red(`Failed to connect: Server news.eweka.nl:563 requires username and password.`)).toBe(
      `Failed to connect: Server ${R('host')}:563 requires username and password.`,
    );
    expect(
      red('Server news.newshosting.com:563: authinfo user usenetuser42 / pass n3wsP4ss!'),
    ).toBe(`Server ${R('host')}:563: authinfo user ${R('username')} / pass ${R('password')}`);
    expect(red('API Key Incorrect (X-Forwarded-For: 85.1.2.3) >Mozilla/5.0')).toBe(
      `API Key Incorrect (X-Forwarded-For: ${R('ip')}) >Mozilla/5.0`,
    );
  });

  it('Gluetun / WireGuard / OpenVPN', () => {
    expect(red('2026-11-07T19:47:26Z INFO [wireguard] Connecting to 185.213.154.68:51820')).toBe(
      `2026-11-07T19:47:26Z INFO [wireguard] Connecting to ${R('ip')}:51820`,
    );
    expect(red('INFO [ip getter] Public IP address is 185.213.154.69 (Sweden, Stockholm)')).toBe(
      `INFO [ip getter] Public IP address is ${R('ip')} (Sweden, Stockholm)`,
    );
    expect(
      red(
        'ERROR [vpn] WIREGUARD_PRIVATE_KEY=Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5PT0= invalid',
      ),
    ).toContain(`WIREGUARD_PRIVATE_KEY=${R('key')} invalid`);
    // An unknown WireGuard key in free text.
    expect(red('PrivateKey yJ8sN2rQ4tV6wX8zA0bC2dE4fG6hI8jK0lM2nO4pQ0Y= bad')).toBe(
      `PrivateKey ${R('key')} bad`,
    );
    expect(red('OPENVPN_PASSWORD="s3cr3t pass" OPENVPN_USER=p1234567')).toBe(
      `OPENVPN_PASSWORD="${R('password')} pass" OPENVPN_USER=${R('username')}`,
    );
    expect(red('Peer Connection Initiated with [AF_INET]89.38.97.130:1194')).toBe(
      `Peer Connection Initiated with [AF_INET]${R('ip')}:1194`,
    );
    const ovpn =
      'remote 1.2.3.4 1194\n<key>\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n</key>\n<ca>\nMIIB\n</ca>';
    const out = red(ovpn);
    expect(out).not.toContain('MIIEvQ');
    expect(out).toContain(`<key>${R('key')}</key>`);
    expect(red('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----')).toBe(
      R('key'),
    );
  });

  it('Jellyfin', () => {
    expect(
      red(`X-Emby-Authorization: MediaBrowser Client="EasyArr", Token="${'a1'.repeat(16)}"`),
    ).not.toContain('a1a1a1a1');
    expect(red('Authorization: MediaBrowser Token=abc123secret')).toBe(
      `Authorization: MediaBrowser ${R('token')}`,
    );
    expect(red('User mira_k authenticated from 192.168.2.50')).toBe(
      `User ${R('username')} authenticated from 192.168.2.50`,
    );
  });

  it('Seerr / Cleanuparr', () => {
    expect(red('[Auth]: Failed sign-in attempt {"ip":"85.1.2.3","email":"me@example.com"}')).toBe(
      `[Auth]: Failed sign-in attempt {"ip":"${R('ip')}","email":"${R('email')}"}`,
    );
    expect(
      red(
        'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      ),
    ).toBe(`token ${R('token')}`);
  });

  it('e-mail addresses and IPv6', () => {
    expect(red('mail from Jane.Doe+arr@proton.me')).toBe(`mail from ${R('email')}`);
    expect(red('connect to 2a02:810d:4b3f:1200::1 failed')).toBe(`connect to ${R('ip')} failed`);
    expect(red('link-local fe80::1c2b:3a4d:5e6f:7a8b')).toBe(
      'link-local fe80::1c2b:3a4d:5e6f:7a8b',
    );
    // Times are not addresses.
    expect(red('at 12:34:56 something')).toBe('at 12:34:56 something');
  });

  it('hides private addresses only when asked', () => {
    expect(red('from 192.168.2.208 and 10.21.0.5', true)).toBe(
      `from ${R('private-ip')} and ${R('private-ip')}`,
    );
    expect(red('fd12:3456:789a::1', true)).toBe(R('private-ip'));
    // Loopback and 0.0.0.0 never identify anyone.
    expect(red('listening on 0.0.0.0 and 127.0.0.1', true)).toBe(
      'listening on 0.0.0.0 and 127.0.0.1',
    );
  });

  it('keeps things that help and identify nobody', () => {
    for (const ok of [
      'GET http://localhost:8989/apps/sonarr/api/v3/health 200',
      'http://w1kyu-easyarr_vpn_1:8080/api',
      'pulled ghcr.io/w1kyu/easyarr@sha256:1b1a69dc015ecf74c2e46bda83039efa9ee8e1fd42facfd9d34aaf2ccfb777a3',
      'Open http://umbrel.local:39000',
      'The.Show.S01E02.1080p.WEB-DL.mkv imported',
      'see https://github.com/w1kyu/easyarr/issues',
      'Recyclarr fetched https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/x.json',
    ]) {
      expect(red(ok)).toBe(ok);
    }
  });

  it('never redacts an existing marker twice', () => {
    const once = red(`password=${ACCOUNT_PASSWORD}`);
    expect(red(once)).toBe(once);
    expect(once).toBe(`password=${R('password')}`);
  });
});

describe('redactValue', () => {
  it('replaces values of sensitive keys deeply, with typed markers', () => {
    const input = {
      apiKey: 'abc123456',
      nested: { password: 'hunter22', user: 'bob', port: 8989, list: [{ token: 'tok-123456' }] },
      WIREGUARD_PRIVATE_KEY: 'wOEI9rqq',
      nzb_key: 'nzbnzbnzb',
      email: 'me@example.com',
      note: `uses ${SONARR_KEY}`,
    };
    expect(redactValue(input, { known })).toEqual({
      apiKey: R('apikey'),
      nested: {
        password: R('password'),
        user: R('username'),
        port: 8989,
        list: [{ token: R('token') }],
      },
      WIREGUARD_PRIVATE_KEY: R('key'),
      nzb_key: R('apikey'),
      email: R('email'),
      note: `uses ${R('apikey')}`,
    });
  });

  it('never mutates its input and survives cycles and errors', () => {
    const input: Record<string, unknown> = { password: 'secret!!', ok: 1 };
    input['self'] = input;
    const out = redactValue(input) as Record<string, unknown>;
    expect(input['password']).toBe('secret!!');
    expect(out['password']).toBe(R('password'));
    expect(out['self']).toBe(out);
    const err = redactValue({ err: new Error(`bad ${SONARR_KEY}`) }, { known }) as {
      err: { message: string };
    };
    expect(err.err.message).toBe(`bad ${R('apikey')}`);
  });

  it('leaves empty values and flags alone', () => {
    expect(redactValue({ password: '', hasPassword: true })).toEqual({
      password: '',
      hasPassword: true,
    });
  });
});

describe('key classification', () => {
  it('recognises sensitive keys', () => {
    for (const k of [
      'password',
      'API_KEY',
      'apikey',
      'x-api-key',
      'secret',
      'Authorization',
      'cookie',
    ]) {
      expect(isSecretKey(k)).toBe(true);
    }
    for (const k of ['port', 'host', 'name', 'urlBase']) expect(isSecretKey(k)).toBe(false);
  });

  it('types them', () => {
    expect(typeForKey('OPENVPN_PASSWORD')).toBe('password');
    expect(typeForKey('wgPrivateKey')).toBe('key');
    expect(typeForKey('wgPresharedKey')).toBe('key');
    expect(typeForKey('apiKey')).toBe('apikey');
    expect(typeForKey('accessToken')).toBe('token');
    expect(typeForKey('username')).toBe('username');
    expect(typeForKey('email')).toBe('email');
    expect(typeForKey('port')).toBeNull();
  });
});

describe('leaksSecret', () => {
  it('finds stored secrets but not usernames/hosts', () => {
    expect(leaksSecret(`x ${SONARR_KEY} y`, known)).toBe(true);
    expect(leaksSecret('mira_k news.eweka.nl', known)).toBe(false);
    expect(leaksSecret(red(`x ${SONARR_KEY} ${USENET_PASSWORD}`), known)).toBe(false);
  });
});
