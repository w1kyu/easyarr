import type { VpnFieldId, VpnProtocol } from './vpn-providers.js';

/** API shapes for /api/vpn/* (server ↔ web). */

export type VpnConnection = 'not_configured' | 'connecting' | 'connected' | 'error' | 'unknown';

/** Plain-language problems; the web shows `vpn.problem.<code>.title` / `.fix`. */
export const VPN_PROBLEM_CODES = [
  'wrongKey',
  'authFailed',
  'noServer',
  'invalidSettings',
  'certificate',
  'unreachable',
  'system',
  'controlServer',
  'vpnContainer',
  'homeIpVisible',
  'unknown',
] as const;
export type VpnProblemCode = (typeof VPN_PROBLEM_CODES)[number];

export interface PortForwardingView {
  /** off = not wanted / not supported; auto/static as in the catalog. */
  mode: 'off' | 'auto' | 'static';
  /** The port currently forwarded (auto: from the provider; static: the reserved one). */
  port: number | null;
  /** active = port known; waiting = asked the provider, no port yet. */
  state: 'off' | 'active' | 'waiting';
}

export interface VpnStatusView {
  connection: VpnConnection;
  provider: string | null;
  protocol: VpnProtocol | null;
  /** What the VPN wrapper reports (null = the vpn container isn't answering). */
  wrapper: 'unconfigured' | 'running' | 'stopping' | 'crashed' | 'stopped' | null;
  /** Seconds since Gluetun was (re)started, when running. */
  runningFor: number | null;
  publicIp: { ip: string; country: string | null; city: string | null } | null;
  portForwarding: PortForwardingView;
  problem: { code: VpnProblemCode; line: string | null } | null;
}

export interface VpnTestView {
  ok: boolean;
  at: string;
  code: VpnProblemCode | null;
  publicIp: string | null;
  country: string | null;
  /** true = hidden, false = the VPN shows your home IP (problem), null = couldn't check. */
  homeIpHidden: boolean | null;
  portForwarding: PortForwardingView;
  problemLine: string | null;
}

/** GET /api/vpn/config: the saved settings for editing; secret values are never sent back. */
export interface VpnConfigView {
  provider: string;
  protocol: VpnProtocol;
  locations: string[];
  portForwarding: boolean;
  forwardedPort: number | null;
  freePlan: boolean;
  /** Non-secret field values (e.g. WireGuard addresses). */
  fields: Partial<Record<VpnFieldId, string>>;
  /** Secret fields that have a saved value (shown as "saved — leave empty to keep"). */
  savedSecrets: VpnFieldId[];
  lastTest: VpnTestView | null;
}
