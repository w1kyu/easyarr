import {
  parseWireguardConf,
  parseWizardAnswers,
  pemBody,
  type KnownValue,
  type RedactionType,
} from '@easyarr/shared';
import type { Secrets, State } from '../state/schema.js';

/**
 * Every value EasyArr stores that must never leave it in clear text: API keys, passwords, VPN
 * keys, usernames, and the hosts of the user's Usenet servers, indexers and VPN servers. The
 * redactor masks these wherever they appear (SPEC §13).
 */
export function knownValues(state: State | null, secrets: Secrets | null): KnownValue[] {
  const out: KnownValue[] = [];
  const add = (value: string | undefined | null, type: RedactionType) => {
    const v = value?.trim();
    if (v) out.push({ value: v, type });
  };
  if (secrets) {
    for (const v of Object.values(secrets.apiKeys)) add(v, 'apikey');
    add(secrets.account?.password, 'password');
    for (const [id, v] of Object.entries(secrets.vpn?.fields ?? {})) vpnField(id, v, add);
    for (const v of Object.values(secrets.usenet?.servers ?? {})) add(v, 'password');
    for (const v of Object.values(secrets.usenet?.indexers ?? {})) add(v, 'apikey');
  }
  if (state) {
    add(state.account?.username, 'username');
    const answers = parseWizardAnswers(state.wizard.answers);
    add(answers.account?.username, 'username');
    for (const s of answers.usenet?.servers ?? []) {
      add(s.host, 'host');
      add(s.username, 'username');
    }
    for (const i of answers.usenet?.indexers ?? []) add(hostOf(i.url), 'host');
  }
  return out;
}

function vpnField(id: string, value: string, add: (v: string, t: RedactionType) => void) {
  switch (id) {
    case 'username':
      add(value, 'username');
      return;
    case 'password':
    case 'keyPassphrase':
      add(value, 'password');
      return;
    case 'wgConfig': {
      const parsed = parseWireguardConf(value);
      if (parsed.ok) {
        add(parsed.conf.privateKey, 'key');
        if (parsed.conf.presharedKey) add(parsed.conf.presharedKey, 'key');
        add(parsed.conf.endpointHost, 'host');
      }
      return;
    }
    case 'ovpnConfig':
      // Inline <key>/<cert> blocks are caught by the redactor's patterns; the servers are not.
      for (const m of value.matchAll(/^\s*remote\s+(\S+)/gm)) add(m[1] ?? '', 'host');
      for (const m of value.matchAll(/^\s*auth-user-pass\s*\n([^\n<]+)\n([^\n<]+)/gm)) {
        add(m[1] ?? '', 'username');
        add(m[2] ?? '', 'password');
      }
      return;
    case 'clientCert':
    case 'clientKey':
    case 'encryptedKey':
      add(pemBody(value), 'key');
      // A key pasted with line breaks shows up line by line in logs.
      for (const line of value.split(/\r?\n/)) if (line.trim().length >= 16) add(line, 'key');
      return;
    default:
      add(value, 'key');
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// --- the process-wide list, kept current by the state/secrets stores -------------------------------

let lastState: State | null = null;
let lastSecrets: Secrets | null = null;
let cached: KnownValue[] = [];
const extra = new Set<string>();

function rebuild() {
  cached = [
    ...knownValues(lastState, lastSecrets),
    ...[...extra].map((value) => ({ value, type: 'secret' as const })),
  ];
}

/** Called by the state store on every load/save. */
export function noteState(state: State): void {
  lastState = state;
  rebuild();
}

/** Called by the secrets store on every load/save. */
export function noteSecrets(secrets: Secrets): void {
  lastSecrets = secrets;
  rebuild();
}

/** Secrets that aren't in the stores yet (e.g. typed into a form and being tested). */
export function registerSecrets(values: Iterable<string>): void {
  let changed = false;
  for (const v of values) {
    if (v && !extra.has(v)) {
      extra.add(v);
      changed = true;
    }
  }
  if (changed) rebuild();
}

/** The current list for the logger and diagnostics. */
export function currentKnown(): readonly KnownValue[] {
  return cached;
}
