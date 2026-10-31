import { z } from 'zod';
import { GLUETUN_SERVERS } from './vpn-servers.generated.js';

/**
 * VPN provider catalog (SPEC §9.2). Every provider Gluetun supports, grouped for beginners, with the
 * fields each provider + protocol needs. The server builds Gluetun's settings from it
 * (`buildVpnEnv`), the wizard builds its form from it. Checked against Gluetun's own lists in
 * vpn-providers.test.ts (D-042).
 */

export const VPN_PROTOCOLS = ['wireguard', 'openvpn'] as const;
export type VpnProtocol = (typeof VPN_PROTOCOLS)[number];
export type VpnGroup = 'recommended' | 'works' | 'custom';
/** auto = Gluetun asks the provider for a port; static = the user reserves one in the provider's panel. */
export type PortForwardingSupport = 'auto' | 'static' | 'none';

export type VpnFieldId =
  | 'wgPrivateKey'
  | 'wgPresharedKey'
  | 'wgAddresses'
  | 'username'
  | 'password'
  | 'clientCert'
  | 'clientKey'
  | 'encryptedKey'
  | 'keyPassphrase'
  | 'wgConfig'
  | 'ovpnConfig';

export interface VpnFieldRef {
  id: VpnFieldId;
  required: boolean;
}

export interface VpnProvider {
  /** Our id (URL-safe). */
  id: string;
  /** Product name (not translated). */
  name: string;
  /** VPN_SERVICE_PROVIDER value. */
  gluetun: string;
  group: VpnGroup;
  protocols: Partial<Record<VpnProtocol, { fields: readonly VpnFieldRef[] }>>;
  portForwarding: PortForwardingSupport;
  /** Offers "I use the free plan" (Gluetun's FREE_ONLY filter). */
  freePlan?: boolean;
  signupUrl?: string;
  /** Docs page slug: a full guide (`vpn/<id>`) or the generic one. */
  tutorial: string;
}

const req = (id: VpnFieldId): VpnFieldRef => ({ id, required: true });
const opt = (id: VpnFieldId): VpnFieldRef => ({ id, required: false });
const USER_PASS = { fields: [req('username'), req('password')] };
const WG_KEY_ADDR = { fields: [req('wgPrivateKey'), req('wgAddresses')] };

/**
 * Notes on choices (verified against Gluetun v3.41.3 source + wiki, see PROGRESS.md):
 * - Port forwarding in Gluetun: Perfect Privacy, PIA, PrivateVPN, ProtonVPN (auto); AirVPN uses
 *   ports reserved in its client area (static).
 * - WireGuard in Gluetun: AirVPN, FastestVPN, IVPN, Mullvad, NordVPN, ProtonVPN, Surfshark, Windscribe.
 * - Mullvad removed OpenVPN on 2026-01-15 → WireGuard only, although Gluetun still lists servers.
 * - ProtonVPN and NordVPN WireGuard addresses have Gluetun defaults → only the key is needed.
 */
export const VPN_PROVIDERS: readonly VpnProvider[] = [
  // --- Best for torrents (port forwarding) ---------------------------------------------------------
  {
    id: 'protonvpn',
    name: 'Proton VPN',
    gluetun: 'protonvpn',
    group: 'recommended',
    protocols: { wireguard: { fields: [req('wgPrivateKey')] }, openvpn: USER_PASS },
    portForwarding: 'auto',
    freePlan: true,
    signupUrl: 'https://protonvpn.com/pricing',
    tutorial: 'vpn/protonvpn',
  },
  {
    id: 'pia',
    name: 'Private Internet Access (PIA)',
    gluetun: 'private internet access',
    group: 'recommended',
    protocols: { openvpn: USER_PASS },
    portForwarding: 'auto',
    signupUrl: 'https://www.privateinternetaccess.com/buy-vpn-online',
    tutorial: 'vpn/pia',
  },
  {
    id: 'airvpn',
    name: 'AirVPN',
    gluetun: 'airvpn',
    group: 'recommended',
    protocols: {
      wireguard: { fields: [req('wgPrivateKey'), req('wgPresharedKey'), req('wgAddresses')] },
      openvpn: { fields: [req('clientCert'), req('clientKey')] },
    },
    portForwarding: 'static',
    signupUrl: 'https://airvpn.org/buy/',
    tutorial: 'vpn/airvpn',
  },
  {
    id: 'privatevpn',
    name: 'PrivateVPN',
    gluetun: 'privatevpn',
    group: 'recommended',
    protocols: { openvpn: USER_PASS },
    portForwarding: 'auto',
    signupUrl: 'https://privatevpn.com/',
    tutorial: 'vpn/generic',
  },
  {
    id: 'perfectprivacy',
    name: 'Perfect Privacy',
    gluetun: 'perfect privacy',
    group: 'recommended',
    protocols: { openvpn: USER_PASS },
    portForwarding: 'auto',
    signupUrl: 'https://www.perfect-privacy.com/',
    tutorial: 'vpn/generic',
  },
  // --- Works (no port forwarding → torrents can be slower) -----------------------------------------
  {
    id: 'mullvad',
    name: 'Mullvad',
    gluetun: 'mullvad',
    group: 'works',
    protocols: { wireguard: WG_KEY_ADDR },
    portForwarding: 'none',
    signupUrl: 'https://mullvad.net/',
    tutorial: 'vpn/mullvad',
  },
  {
    id: 'nordvpn',
    name: 'NordVPN',
    gluetun: 'nordvpn',
    group: 'works',
    protocols: { wireguard: { fields: [req('wgPrivateKey')] }, openvpn: USER_PASS },
    portForwarding: 'none',
    signupUrl: 'https://nordvpn.com/pricing/',
    tutorial: 'vpn/nordvpn',
  },
  {
    id: 'surfshark',
    name: 'Surfshark',
    gluetun: 'surfshark',
    group: 'works',
    protocols: { wireguard: WG_KEY_ADDR, openvpn: USER_PASS },
    portForwarding: 'none',
    signupUrl: 'https://surfshark.com/pricing',
    tutorial: 'vpn/surfshark',
  },
  {
    id: 'windscribe',
    name: 'Windscribe',
    gluetun: 'windscribe',
    group: 'works',
    protocols: {
      wireguard: { fields: [req('wgPrivateKey'), req('wgPresharedKey'), req('wgAddresses')] },
      openvpn: USER_PASS,
    },
    portForwarding: 'none',
    signupUrl: 'https://windscribe.com/upgrade',
    tutorial: 'vpn/generic',
  },
  {
    id: 'ivpn',
    name: 'IVPN',
    gluetun: 'ivpn',
    group: 'works',
    protocols: {
      wireguard: WG_KEY_ADDR,
      // IVPN account IDs (i-XXXX-XXXX-XXXX) need no password.
      openvpn: { fields: [req('username'), opt('password')] },
    },
    portForwarding: 'none',
    signupUrl: 'https://www.ivpn.net/',
    tutorial: 'vpn/generic',
  },
  {
    id: 'fastestvpn',
    name: 'FastestVPN',
    gluetun: 'fastestvpn',
    group: 'works',
    protocols: { wireguard: WG_KEY_ADDR, openvpn: USER_PASS },
    portForwarding: 'none',
    tutorial: 'vpn/generic',
  },
  ...(
    [
      ['expressvpn', 'ExpressVPN', 'expressvpn'],
      ['ipvanish', 'IPVanish', 'ipvanish'],
      ['hidemyass', 'HideMyAss', 'hidemyass'],
      ['privado', 'Privado', 'privado'],
      ['purevpn', 'PureVPN', 'purevpn'],
      ['torguard', 'TorGuard', 'torguard'],
      ['vyprvpn', 'VyprVPN', 'vyprvpn'],
      ['slickvpn', 'SlickVPN', 'slickvpn'],
      ['giganews', 'Giganews', 'giganews'],
    ] as const
  ).map(([id, name, gluetun]): VpnProvider => ({
    id,
    name,
    gluetun,
    group: 'works',
    protocols: { openvpn: USER_PASS },
    portForwarding: 'none',
    tutorial: 'vpn/generic',
  })),
  {
    id: 'cyberghost',
    name: 'CyberGhost',
    gluetun: 'cyberghost',
    group: 'works',
    protocols: {
      openvpn: {
        fields: [req('username'), req('password'), req('clientCert'), req('clientKey')],
      },
    },
    portForwarding: 'none',
    tutorial: 'vpn/generic',
  },
  {
    id: 'vpnunlimited',
    name: 'VPN Unlimited',
    gluetun: 'vpn unlimited',
    group: 'works',
    protocols: {
      openvpn: {
        fields: [req('username'), req('password'), req('clientCert'), req('clientKey')],
      },
    },
    portForwarding: 'none',
    tutorial: 'vpn/generic',
  },
  {
    id: 'vpnsecure',
    name: 'VPNSecure',
    gluetun: 'vpnsecure',
    group: 'works',
    protocols: {
      openvpn: { fields: [req('clientCert'), req('encryptedKey'), req('keyPassphrase')] },
    },
    portForwarding: 'none',
    tutorial: 'vpn/generic',
  },
  // --- Anything else: the provider's own config file ------------------------------------------------
  {
    id: 'custom',
    name: 'Other / config file',
    gluetun: 'custom',
    group: 'custom',
    protocols: {
      wireguard: { fields: [req('wgConfig')] },
      openvpn: { fields: [req('ovpnConfig'), opt('username'), opt('password')] },
    },
    portForwarding: 'static',
    tutorial: 'vpn/custom',
  },
];

export function getVpnProvider(id: string): VpnProvider | undefined {
  return VPN_PROVIDERS.find((p) => p.id === id);
}

export function providerProtocols(p: VpnProvider): VpnProtocol[] {
  return VPN_PROTOCOLS.filter((proto) => p.protocols[proto]);
}

/** WireGuard first ("Recommended"): faster and simpler to set up. */
export function defaultProtocol(p: VpnProvider): VpnProtocol {
  return p.protocols.wireguard ? 'wireguard' : 'openvpn';
}

/** Locations the user can pick, per Gluetun's server list (empty = no choice offered). */
export function providerLocations(
  p: VpnProvider,
  protocol: VpnProtocol,
  opts: { portForwardOnly?: boolean; freeOnly?: boolean } = {},
): { env: string | null; values: readonly string[] } {
  const servers = GLUETUN_SERVERS[p.gluetun];
  const proto = servers?.protocols[protocol];
  if (!servers || !proto || !servers.locationEnv) return { env: null, values: [] };
  const values = opts.freeOnly
    ? proto.freeLocations
    : opts.portForwardOnly && proto.portForwardLocations.length > 0
      ? proto.portForwardLocations
      : proto.locations;
  return { env: servers.locationEnv, values };
}

// --- Field validation ---------------------------------------------------------------------------

export type VpnFieldKind = 'text' | 'secret' | 'multiline' | 'file';

export interface VpnFieldDef {
  kind: VpnFieldKind;
  /** Stored in secrets.json and never sent back to the browser. */
  secret: boolean;
  schema: z.ZodType<string>;
}

/** A WireGuard key: 32 bytes, base64. */
export const WG_KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/;
const NO_CONTROL = /^[^\p{Cc}]*$/u;
const IPV4_CIDR =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/;

const trimmed = z.string().trim();
const line = (max: number) =>
  trimmed
    .min(1, 'vpn.error.required')
    .max(max, 'vpn.error.tooLong')
    .regex(NO_CONTROL, 'vpn.error.invalidCharacters');
const block = (max: number) =>
  z.string().trim().min(1, 'vpn.error.required').max(max, 'vpn.error.tooLong');

/** Splits "10.2.0.2/32, fd7d:76ee::2/128" and keeps IPv4 (Docker on Umbrel has no IPv6, D-042). */
export function ipv4Addresses(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => IPV4_CIDR.test(s))
    .map((s) => (s.includes('/') ? s : `${s}/32`));
}

/** PEM or bare base64 → the single-line base64 body Gluetun expects (OPENVPN_CERT/KEY). */
export function pemBody(value: string): string {
  return value
    .replace(/-----(BEGIN|END)[^-]*-----/g, '')
    .replace(/<\/?(cert|key|ca)>/gi, '')
    .replace(/\s+/g, '');
}
const pem = block(20_000).refine((v) => /^[A-Za-z0-9+/=]{40,}$/.test(pemBody(v)), {
  message: 'vpn.error.invalidCertificate',
});

export const VPN_FIELDS: Record<VpnFieldId, VpnFieldDef> = {
  wgPrivateKey: {
    kind: 'secret',
    secret: true,
    schema: line(64).regex(WG_KEY_PATTERN, 'vpn.error.wgKey'),
  },
  wgPresharedKey: {
    kind: 'secret',
    secret: true,
    schema: line(64).regex(WG_KEY_PATTERN, 'vpn.error.wgKey'),
  },
  wgAddresses: {
    kind: 'text',
    secret: false,
    schema: line(400).refine((v) => ipv4Addresses(v).length > 0, {
      message: 'vpn.error.wgAddresses',
    }),
  },
  username: { kind: 'text', secret: true, schema: line(256) },
  password: { kind: 'secret', secret: true, schema: line(256) },
  clientCert: { kind: 'multiline', secret: true, schema: pem },
  clientKey: { kind: 'multiline', secret: true, schema: pem },
  encryptedKey: { kind: 'multiline', secret: true, schema: pem },
  keyPassphrase: { kind: 'secret', secret: true, schema: line(256) },
  wgConfig: {
    kind: 'file',
    secret: true,
    schema: block(20_000).refine((v) => parseWireguardConf(v).ok, {
      message: 'vpn.error.wgConfig',
    }),
  },
  ovpnConfig: {
    kind: 'file',
    secret: true,
    schema: block(200_000).refine((v) => /^\s*remote\s+\S+/m.test(v), {
      message: 'vpn.error.ovpnConfig',
    }),
  },
};

// --- WireGuard .conf parsing (custom provider) ------------------------------------------------------

export interface WireguardConf {
  privateKey: string;
  addresses: string[];
  publicKey: string;
  presharedKey?: string;
  endpointHost: string;
  endpointPort: number;
}

export function parseWireguardConf(
  text: string,
): { ok: true; conf: WireguardConf } | { ok: false; error: string } {
  const values: Record<string, string> = {};
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/[#;].*$/, '').trim();
    if (!l) continue;
    const head = /^\[(\w+)\]$/.exec(l);
    if (head?.[1]) {
      section = head[1].toLowerCase();
      continue;
    }
    const kv = /^(\w+)\s*=\s*(.+)$/.exec(l);
    if (kv?.[1] && kv[2] !== undefined) {
      const key = `${section}.${kv[1].toLowerCase()}`;
      // Keep the first peer only.
      values[key] ??= kv[2].trim();
    }
  }
  const privateKey = values['interface.privatekey'] ?? '';
  const publicKey = values['peer.publickey'] ?? '';
  const endpoint = values['peer.endpoint'] ?? '';
  const addresses = ipv4Addresses(values['interface.address'] ?? '');
  const ep = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(endpoint);
  if (!WG_KEY_PATTERN.test(privateKey)) return { ok: false, error: 'privateKey' };
  if (!WG_KEY_PATTERN.test(publicKey)) return { ok: false, error: 'publicKey' };
  if (addresses.length === 0) return { ok: false, error: 'address' };
  if (!ep?.[1] || !ep[2] || Number(ep[2]) < 1 || Number(ep[2]) > 65535) {
    return { ok: false, error: 'endpoint' };
  }
  const psk = values['peer.presharedkey'];
  if (psk !== undefined && !WG_KEY_PATTERN.test(psk)) return { ok: false, error: 'presharedKey' };
  return {
    ok: true,
    conf: {
      privateKey,
      publicKey,
      addresses,
      ...(psk ? { presharedKey: psk } : {}),
      endpointHost: ep[1],
      endpointPort: Number(ep[2]),
    },
  };
}

// --- What the wizard sends and what EasyArr stores ----------------------------------------------------

export const vpnConfigInputSchema = z.object({
  provider: z.string().min(1),
  protocol: z.enum(VPN_PROTOCOLS),
  /** Location filter values (countries/regions/cities); empty = any server. */
  locations: z.array(z.string().max(100)).max(20).default([]),
  portForwarding: z.boolean().default(false),
  /** Statically reserved port (AirVPN / custom). */
  forwardedPort: z.number().int().min(1024).max(65535).nullable().default(null),
  freePlan: z.boolean().default(false),
  /** Field values; secret fields may be left out to keep the saved value. */
  fields: z.record(z.string(), z.string().max(200_000)).default({}),
});
export type VpnConfigInput = z.infer<typeof vpnConfigInputSchema>;

export interface VpnFieldIssue {
  path: string;
  message: string;
}

/**
 * Checks an input against the catalog. `saved` = secret fields already stored for the same
 * provider + protocol (may be left empty to keep them). Returns the merged field values.
 */
export function validateVpnConfig(
  input: VpnConfigInput,
  saved: Partial<Record<VpnFieldId, string>> = {},
):
  | { ok: true; fields: Partial<Record<VpnFieldId, string>> }
  | { ok: false; issues: VpnFieldIssue[] } {
  const provider = getVpnProvider(input.provider);
  if (!provider)
    return { ok: false, issues: [{ path: 'provider', message: 'vpn.error.provider' }] };
  const proto = provider.protocols[input.protocol];
  if (!proto) return { ok: false, issues: [{ path: 'protocol', message: 'vpn.error.protocol' }] };
  const issues: VpnFieldIssue[] = [];
  const fields: Partial<Record<VpnFieldId, string>> = {};
  for (const ref of proto.fields) {
    const def = VPN_FIELDS[ref.id];
    const given = input.fields[ref.id];
    const value = given !== undefined && given.trim() !== '' ? given : saved[ref.id];
    if (value === undefined || value.trim() === '') {
      if (ref.required) issues.push({ path: `fields.${ref.id}`, message: 'vpn.error.required' });
      continue;
    }
    const r = def.schema.safeParse(value);
    if (!r.success) {
      issues.push({ path: `fields.${ref.id}`, message: r.error.issues[0]?.message ?? 'invalid' });
      continue;
    }
    fields[ref.id] = r.data;
  }
  const { values } = providerLocations(provider, input.protocol, {
    portForwardOnly: input.portForwarding,
    freeOnly: input.freePlan,
  });
  const unknown = input.locations.filter((l) => !values.includes(l));
  if (unknown.length > 0) issues.push({ path: 'locations', message: 'vpn.error.location' });
  if (input.freePlan && !provider.freePlan) {
    issues.push({ path: 'freePlan', message: 'vpn.error.freePlan' });
  }
  if (input.portForwarding && provider.portForwarding === 'none') {
    issues.push({ path: 'portForwarding', message: 'vpn.error.portForwarding' });
  }
  if (input.portForwarding && input.freePlan) {
    issues.push({ path: 'portForwarding', message: 'vpn.error.portForwardingFree' });
  }
  if (input.portForwarding && provider.portForwarding === 'static' && !input.forwardedPort) {
    issues.push({ path: 'forwardedPort', message: 'vpn.error.forwardedPort' });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, fields };
}

// --- Gluetun settings -----------------------------------------------------------------------------

export interface BuildVpnEnvOptions {
  /** Where the custom .ovpn lives inside the vpn container. */
  customOvpnPath: string;
  /** Resolved IP of a custom WireGuard endpoint given as a hostname. */
  resolvedEndpointIp?: string;
}

/**
 * Gluetun environment for a validated config (one KEY=VALUE per line in vpn.env). Throws if a value
 * would break the file format — validation should have caught it before.
 */
export function buildVpnEnv(
  input: VpnConfigInput,
  fields: Partial<Record<VpnFieldId, string>>,
  opts: BuildVpnEnvOptions,
): Record<string, string> {
  const provider = getVpnProvider(input.provider);
  if (!provider?.protocols[input.protocol]) throw new Error('unknown provider/protocol');
  const env: Record<string, string> = {
    VPN_SERVICE_PROVIDER: provider.gluetun,
    VPN_TYPE: input.protocol,
  };
  const set = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== '') env[key] = value;
  };

  if (provider.id === 'custom' && input.protocol === 'wireguard') {
    const parsed = parseWireguardConf(fields.wgConfig ?? '');
    if (!parsed.ok) throw new Error(`invalid WireGuard config (${parsed.error})`);
    const c = parsed.conf;
    set('WIREGUARD_PRIVATE_KEY', c.privateKey);
    set('WIREGUARD_PUBLIC_KEY', c.publicKey);
    set('WIREGUARD_PRESHARED_KEY', c.presharedKey);
    set('WIREGUARD_ADDRESSES', c.addresses.join(','));
    set('VPN_ENDPOINT_IP', opts.resolvedEndpointIp ?? c.endpointHost);
    set('VPN_ENDPOINT_PORT', String(c.endpointPort));
  } else if (provider.id === 'custom') {
    set('OPENVPN_CUSTOM_CONFIG', opts.customOvpnPath);
    set('OPENVPN_USER', fields.username);
    set('OPENVPN_PASSWORD', fields.password);
  } else if (input.protocol === 'wireguard') {
    set('WIREGUARD_PRIVATE_KEY', fields.wgPrivateKey);
    set('WIREGUARD_PRESHARED_KEY', fields.wgPresharedKey);
    if (fields.wgAddresses) set('WIREGUARD_ADDRESSES', ipv4Addresses(fields.wgAddresses).join(','));
  } else {
    let user = fields.username;
    // Proton: port forwarding over OpenVPN needs "+pmp" on the username (Gluetun wiki).
    if (provider.id === 'protonvpn' && input.portForwarding && user && !/\+pmp\b/.test(user)) {
      user = `${user}+pmp`;
    }
    set('OPENVPN_USER', user);
    set('OPENVPN_PASSWORD', fields.password);
    if (fields.clientCert) set('OPENVPN_CERT', pemBody(fields.clientCert));
    if (fields.clientKey) set('OPENVPN_KEY', pemBody(fields.clientKey));
    if (fields.encryptedKey) set('OPENVPN_ENCRYPTED_KEY', pemBody(fields.encryptedKey));
    set('OPENVPN_KEY_PASSPHRASE', fields.keyPassphrase);
  }

  const { env: locationEnv } = providerLocations(provider, input.protocol);
  if (locationEnv && input.locations.length > 0) set(locationEnv, input.locations.join(','));
  if (input.freePlan && provider.freePlan) set('FREE_ONLY', 'on');
  if (input.portForwarding && provider.portForwarding === 'auto') {
    set('VPN_PORT_FORWARDING', 'on');
  }
  if (input.portForwarding && provider.portForwarding === 'static' && input.forwardedPort) {
    set('FIREWALL_VPN_INPUT_PORTS', String(input.forwardedPort));
  }

  for (const [k, v] of Object.entries(env)) {
    if (/[\p{Cc}]/u.test(v)) throw new Error(`${k} contains control characters`);
  }
  return env;
}

export function serializeVpnEnv(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')}\n`;
}
