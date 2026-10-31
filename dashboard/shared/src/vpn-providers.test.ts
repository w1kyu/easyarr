import { describe, expect, it } from 'vitest';
import { GLUETUN_SERVERS } from './vpn-servers.generated.js';
import {
  buildVpnEnv,
  getVpnProvider,
  ipv4Addresses,
  parseWireguardConf,
  pemBody,
  providerLocations,
  providerProtocols,
  serializeVpnEnv,
  validateVpnConfig,
  vpnConfigInputSchema,
  VPN_PROVIDERS,
  type VpnConfigInput,
} from './vpn-providers.js';

// Copied from Gluetun v3.41.3 so a Gluetun bump that changes them fails here:
// internal/configuration/settings/wireguard.go (validate) and portforward.go (Validate).
const GLUETUN_WIREGUARD = [
  'airvpn',
  'custom',
  'fastestvpn',
  'ivpn',
  'mullvad',
  'nordvpn',
  'protonvpn',
  'surfshark',
  'windscribe',
];
const GLUETUN_PORT_FORWARDING = [
  'perfect privacy',
  'private internet access',
  'privatevpn',
  'protonvpn',
];

const KEY = 'wOEI9rqqbDwnN8/Bpp22sVz48T71vJ4fYmFWujulwUU=';
const KEY2 = 'wAUaJMhAq3NFutLHIdF8AN0B5WG8RndfQKLPTEDHal0=';
const input = (over: Partial<VpnConfigInput>): VpnConfigInput =>
  vpnConfigInputSchema.parse({ provider: 'protonvpn', protocol: 'wireguard', ...over });
const provider = (id: string) => {
  const p = getVpnProvider(id);
  if (!p) throw new Error(`no provider ${id}`);
  return p;
};
const opts = { customOvpnPath: '/gluetun/easyarr/custom/client.ovpn' };

describe('VPN provider catalog', () => {
  it('contains every provider Gluetun supports (generated server list) plus custom', () => {
    const ours = VPN_PROVIDERS.map((p) => p.gluetun).sort();
    expect(ours).toEqual([...Object.keys(GLUETUN_SERVERS), 'custom'].sort());
    expect(new Set(VPN_PROVIDERS.map((p) => p.id)).size).toBe(VPN_PROVIDERS.length);
  });

  it('offers WireGuard exactly where Gluetun supports it', () => {
    const wg = VPN_PROVIDERS.filter((p) => p.protocols.wireguard).map((p) => p.gluetun);
    expect(wg.sort()).toEqual(GLUETUN_WIREGUARD);
  });

  it('"recommended" = port forwarding; auto only where Gluetun can do it', () => {
    for (const p of VPN_PROVIDERS) {
      if (p.portForwarding === 'auto') expect(GLUETUN_PORT_FORWARDING).toContain(p.gluetun);
      if (p.group === 'recommended') expect(p.portForwarding).not.toBe('none');
      if (p.group === 'works') expect(p.portForwarding).toBe('none');
    }
    expect(
      VPN_PROVIDERS.filter((p) => p.portForwarding === 'auto')
        .map((p) => p.gluetun)
        .sort(),
    ).toEqual(GLUETUN_PORT_FORWARDING);
  });

  it('Mullvad is WireGuard-only (OpenVPN removed in 2026); PIA is OpenVPN-only in Gluetun', () => {
    expect(providerProtocols(provider('mullvad'))).toEqual(['wireguard']);
    expect(providerProtocols(provider('pia'))).toEqual(['openvpn']);
  });

  it('has a protocol with fields for every provider and a tutorial page', () => {
    for (const p of VPN_PROVIDERS) {
      expect(providerProtocols(p).length, p.id).toBeGreaterThan(0);
      expect(p.tutorial).toMatch(/^vpn\/[a-z0-9-]+$/);
    }
  });

  it('lists locations from Gluetun data, narrowed for port forwarding / free plan', () => {
    const proton = provider('protonvpn');
    const all = providerLocations(proton, 'wireguard');
    expect(all.env).toBe('SERVER_COUNTRIES');
    expect(all.values).toContain('Netherlands');
    const pf = providerLocations(proton, 'wireguard', { portForwardOnly: true });
    expect(pf.values.length).toBeGreaterThan(0);
    expect(pf.values.length).toBeLessThanOrEqual(all.values.length);
    const free = providerLocations(proton, 'wireguard', { freeOnly: true });
    expect(free.values.length).toBeLessThan(all.values.length);
    expect(providerLocations(provider('pia'), 'openvpn').env).toBe('SERVER_REGIONS');
    expect(providerLocations(provider('custom'), 'wireguard').values).toEqual([]);
  });
});

describe('validateVpnConfig', () => {
  it('accepts a complete Proton WireGuard config', () => {
    const r = validateVpnConfig(input({ fields: { wgPrivateKey: ` ${KEY} ` } }));
    expect(r).toEqual({ ok: true, fields: { wgPrivateKey: KEY } });
  });

  it('reports missing and malformed fields with i18n keys', () => {
    expect(
      validateVpnConfig(input({ provider: 'mullvad', fields: { wgPrivateKey: 'nope' } })),
    ).toEqual({
      ok: false,
      issues: [
        { path: 'fields.wgPrivateKey', message: 'vpn.error.wgKey' },
        { path: 'fields.wgAddresses', message: 'vpn.error.required' },
      ],
    });
    expect(validateVpnConfig(input({ provider: 'nope' }))).toMatchObject({ ok: false });
    expect(validateVpnConfig(input({ provider: 'pia', protocol: 'wireguard' }))).toEqual({
      ok: false,
      issues: [{ path: 'protocol', message: 'vpn.error.protocol' }],
    });
  });

  it('keeps saved secrets when the field is left empty', () => {
    const r = validateVpnConfig(input({ fields: { wgPrivateKey: '' } }), { wgPrivateKey: KEY });
    expect(r).toEqual({ ok: true, fields: { wgPrivateKey: KEY } });
  });

  it('checks locations, free plan and port forwarding against the provider', () => {
    const ok = { wgPrivateKey: KEY };
    expect(validateVpnConfig(input({ fields: ok, locations: ['Atlantis'] }))).toMatchObject({
      ok: false,
      issues: [{ path: 'locations' }],
    });
    expect(
      validateVpnConfig(input({ fields: ok, freePlan: true, portForwarding: true })),
    ).toMatchObject({ ok: false, issues: [{ path: 'portForwarding' }] });
    expect(
      validateVpnConfig(input({ provider: 'nordvpn', fields: ok, portForwarding: true })),
    ).toMatchObject({ ok: false, issues: [{ path: 'portForwarding' }] });
    expect(
      validateVpnConfig(
        input({
          provider: 'airvpn',
          fields: { wgPrivateKey: KEY, wgPresharedKey: KEY2, wgAddresses: '10.1.2.3' },
          portForwarding: true,
        }),
      ),
    ).toMatchObject({ ok: false, issues: [{ path: 'forwardedPort' }] });
  });

  it('rejects control characters (they would break vpn.env)', () => {
    const r = validateVpnConfig(
      input({
        provider: 'nordvpn',
        protocol: 'openvpn',
        fields: { username: 'a\nb', password: 'x' },
      }),
    );
    expect(r).toMatchObject({ ok: false, issues: [{ message: 'vpn.error.invalidCharacters' }] });
  });
});

describe('buildVpnEnv', () => {
  const build = (i: VpnConfigInput) => {
    const v = validateVpnConfig(i);
    if (!v.ok) throw new Error(JSON.stringify(v.issues));
    return buildVpnEnv(i, v.fields, opts);
  };

  it('Proton WireGuard with port forwarding and a country', () => {
    expect(
      build(
        input({ fields: { wgPrivateKey: KEY }, portForwarding: true, locations: ['Netherlands'] }),
      ),
    ).toEqual({
      VPN_SERVICE_PROVIDER: 'protonvpn',
      VPN_TYPE: 'wireguard',
      WIREGUARD_PRIVATE_KEY: KEY,
      SERVER_COUNTRIES: 'Netherlands',
      VPN_PORT_FORWARDING: 'on',
    });
  });

  it('Proton OpenVPN port forwarding appends +pmp once; free plan sets FREE_ONLY', () => {
    const pf = build(
      input({
        protocol: 'openvpn',
        portForwarding: true,
        fields: { username: 'abc', password: 'p' },
      }),
    );
    expect(pf['OPENVPN_USER']).toBe('abc+pmp');
    const again = build(
      input({
        protocol: 'openvpn',
        portForwarding: true,
        fields: { username: 'abc+pmp', password: 'p' },
      }),
    );
    expect(again['OPENVPN_USER']).toBe('abc+pmp');
    const free = build(input({ freePlan: true, fields: { wgPrivateKey: KEY } }));
    expect(free['FREE_ONLY']).toBe('on');
    expect(free['VPN_PORT_FORWARDING']).toBeUndefined();
  });

  it('keeps only IPv4 WireGuard addresses (no IPv6 in Umbrel Docker)', () => {
    const env = build(
      input({
        provider: 'mullvad',
        fields: { wgPrivateKey: KEY, wgAddresses: '10.64.222.21/32,fc00:bbbb:bbbb:bb01::1/128' },
      }),
    );
    expect(env['WIREGUARD_ADDRESSES']).toBe('10.64.222.21/32');
    expect(ipv4Addresses('10.0.0.2, 10.0.0.3/24 ::1')).toEqual(['10.0.0.2/32', '10.0.0.3/24']);
  });

  it('PIA uses regions; AirVPN static port opens the tunnel input port', () => {
    expect(
      build(
        input({
          provider: 'pia',
          protocol: 'openvpn',
          locations: ['Netherlands'],
          portForwarding: true,
          fields: { username: 'p1234567', password: 'x' },
        }),
      ),
    ).toEqual({
      VPN_SERVICE_PROVIDER: 'private internet access',
      VPN_TYPE: 'openvpn',
      OPENVPN_USER: 'p1234567',
      OPENVPN_PASSWORD: 'x',
      SERVER_REGIONS: 'Netherlands',
      VPN_PORT_FORWARDING: 'on',
    });
    const air = build(
      input({
        provider: 'airvpn',
        fields: { wgPrivateKey: KEY, wgPresharedKey: KEY2, wgAddresses: '10.128.0.5/32' },
        portForwarding: true,
        forwardedPort: 41234,
      }),
    );
    expect(air['FIREWALL_VPN_INPUT_PORTS']).toBe('41234');
    expect(air['VPN_PORT_FORWARDING']).toBeUndefined();
  });

  it('OpenVPN certificates: PEM → single-line base64', () => {
    const cert =
      '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUQ0FBQUFBQUFBQUFBQUFBQUFBQUFB\nQUFBQUE=\n-----END CERTIFICATE-----\n';
    expect(pemBody(cert)).toBe('MIIBszCCAVmgAwIBAgIUQ0FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=');
    const env = build(
      input({
        provider: 'airvpn',
        protocol: 'openvpn',
        fields: { clientCert: cert, clientKey: `<key>\n${cert}</key>` },
      }),
    );
    expect(env['OPENVPN_CERT']).not.toMatch(/\s|-/);
    expect(env['OPENVPN_KEY']).toBe(env['OPENVPN_CERT']);
  });

  it('custom WireGuard .conf → endpoint, keys, IPv4 addresses', () => {
    const conf = `[Interface]
PrivateKey = ${KEY}
Address = 10.66.66.2/32, fd42::2/128
DNS = 10.64.0.1

[Peer]
PublicKey = ${KEY2}
PresharedKey = ${KEY}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = vpn.example.com:51820
`;
    const i = input({ provider: 'custom', fields: { wgConfig: conf } });
    const v = validateVpnConfig(i);
    expect(v.ok).toBe(true);
    const env = buildVpnEnv(i, v.ok ? v.fields : {}, {
      ...opts,
      resolvedEndpointIp: '203.0.113.7',
    });
    expect(env).toEqual({
      VPN_SERVICE_PROVIDER: 'custom',
      VPN_TYPE: 'wireguard',
      WIREGUARD_PRIVATE_KEY: KEY,
      WIREGUARD_PUBLIC_KEY: KEY2,
      WIREGUARD_PRESHARED_KEY: KEY,
      WIREGUARD_ADDRESSES: '10.66.66.2/32',
      VPN_ENDPOINT_IP: '203.0.113.7',
      VPN_ENDPOINT_PORT: '51820',
    });
  });

  it('custom OpenVPN points Gluetun at the saved file', () => {
    const i = input({
      provider: 'custom',
      protocol: 'openvpn',
      fields: { ovpnConfig: 'client\nremote 203.0.113.9 1194\n', username: 'u', password: 'p' },
    });
    const v = validateVpnConfig(i);
    expect(v.ok && buildVpnEnv(i, v.fields, opts)).toEqual({
      VPN_SERVICE_PROVIDER: 'custom',
      VPN_TYPE: 'openvpn',
      OPENVPN_CUSTOM_CONFIG: opts.customOvpnPath,
      OPENVPN_USER: 'u',
      OPENVPN_PASSWORD: 'p',
    });
  });

  it('serializes one KEY=VALUE per line', () => {
    expect(serializeVpnEnv({ A: '1', B: 'x=y' })).toBe('A=1\nB=x=y\n');
  });
});

describe('parseWireguardConf', () => {
  it('explains what is wrong', () => {
    expect(parseWireguardConf('nothing')).toEqual({ ok: false, error: 'privateKey' });
    expect(
      parseWireguardConf(
        `[Interface]\nPrivateKey=${KEY}\nAddress=10.0.0.2/32\n[Peer]\nPublicKey=${KEY2}`,
      ),
    ).toEqual({ ok: false, error: 'endpoint' });
    expect(
      parseWireguardConf(
        `[Interface]\nPrivateKey=${KEY}\nAddress=fd00::2/128\n[Peer]\nPublicKey=${KEY2}\nEndpoint=1.2.3.4:51820`,
      ),
    ).toEqual({ ok: false, error: 'address' });
  });

  it('accepts IPv6 endpoints in brackets and ignores comments', () => {
    const r = parseWireguardConf(
      `# comment\n[Interface]\nPrivateKey = ${KEY} # mine\nAddress = 10.0.0.2\n[Peer]\nPublicKey = ${KEY2}\nEndpoint = [2001:db8::1]:51820`,
    );
    expect(r).toMatchObject({
      ok: true,
      conf: { endpointHost: '2001:db8::1', endpointPort: 51820 },
    });
  });
});
