import type { VpnProblemCode } from '@easyarr/shared';

/**
 * Turns Gluetun's log into a plain-language reason (SPEC §9.1 step 4). Codes are i18n keys
 * (`vpn.problem.<code>`) on the web side. Patterns come from Gluetun v3.41.3 messages
 * (configuration/settings errors, OpenVPN AUTH_FAILED, health-check restarts).
 */

const RULES: readonly [RegExp, VpnProblemCode][] = [
  [/private key is not valid|incorrect key size|pre-shared key is not valid/i, 'wrongKey'],
  [/AUTH_FAILED|auth[_ -]?failed|authentication failed|invalid credentials/i, 'authFailed'],
  [/no server found|no servers? (is |are )?(available|left)|no server.*filter/i, 'noServer'],
  [/certificate|tls error|tls-crypt|verify error|cannot load.*key/i, 'certificate'],
  [
    /failed to pass the healthcheck|healthcheck.*fail|handshake|connection timed out|TLS key negotiation failed|network is unreachable|i\/o timeout/i,
    'unreachable',
  ],
  [/NET_ADMIN|operation not permitted|\/dev\/net\/tun|permission denied/i, 'system'],
  [
    /is not set|cannot be empty|is empty|not valid|is invalid|not supported|settings:|validating/i,
    'invalidSettings',
  ],
];

const IMPORTANT = /\b(ERROR|FATAL)\b|AUTH_FAILED|restarting VPN|failed to pass the healthcheck/i;

export interface VpnProblem {
  code: VpnProblemCode;
  /** The log line that led to it (shown under "Technical details"). */
  line: string | null;
}

/** Looks at the newest important lines first; the newest recognised problem wins. */
export function diagnoseGluetunLog(lines: readonly string[]): VpnProblem | null {
  const important = lines.filter((l) => IMPORTANT.test(l));
  for (let i = important.length - 1; i >= 0; i--) {
    const line = important[i] ?? '';
    const rule = RULES.find(([re]) => re.test(line));
    if (rule) return { code: rule[1], line: line.trim().slice(0, 500) };
  }
  const last = important.at(-1);
  return last ? { code: 'unknown', line: last.trim().slice(0, 500) } : null;
}

/** How many times Gluetun restarted the tunnel because the health check failed. */
export function countHealthRestarts(lines: readonly string[]): number {
  return lines.filter((l) => /restarting VPN because it failed to pass the healthcheck/i.test(l))
    .length;
}
