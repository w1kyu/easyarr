/**
 * Redaction for logs, diagnostics and the "Get help with AI" prompt (SPEC §13, D-016).
 *
 * Everything that could identify the user or unlock something is replaced by `[REDACTED:<type>]`
 * so a reader (a human on GitHub or an AI chat) still sees *what kind* of thing was there.
 * Two layers work together:
 * 1. Known values: every secret, username and host EasyArr itself stores (API keys, passwords,
 *    VPN keys, Usenet hosts, …) is masked wherever it appears.
 * 2. Patterns: things EasyArr doesn't know but that look sensitive in any log line — `password=…`,
 *    `Authorization: …`, credentials in URLs, WireGuard keys, PEM blocks, long hex keys, e-mail
 *    addresses, public IP addresses and the host names of external services.
 *
 * Pure string code: runs on the server (logs, diagnostics) and in the browser (the text the user
 * types into the AI help dialog).
 */

export const REDACTION_TYPES = [
  'password',
  'apikey',
  'token',
  'key',
  'username',
  'email',
  'ip',
  'private-ip',
  'host',
  'secret',
] as const;
export type RedactionType = (typeof REDACTION_TYPES)[number];

export const redacted = (type: RedactionType): string => `[REDACTED:${type}]`;

/** Matches any marker this module writes (to skip values that are already redacted). */
export const REDACTED_MARKER = /\[REDACTED:[a-z-]+\]/;

export interface KnownValue {
  value: string;
  type: RedactionType;
}

export interface RedactOptions {
  /** Values EasyArr stores itself; masked wherever they appear. */
  known?: readonly KnownValue[];
  /** Also hide private/LAN addresses (10.x, 192.168.x, fd00::, …). Public ones are always hidden. */
  privateIps?: boolean;
  /** Extra host names that may stay visible (besides the built-in list). */
  allowHosts?: readonly string[];
}

/** Secret values shorter than this are not masked inside free text (too many false positives). */
export const MIN_SECRET_LENGTH = 6;
/** Usernames are masked as whole words from this length on. */
const MIN_USERNAME_LENGTH = 3;

// --- keys of structured data ----------------------------------------------------------------------

const SECRET_KEY =
  /(pass(word|phrase)?|secret|token|api[-_]?key|apikey|nzb[-_]?key|private[-_]?key|preshared|credential|cookie|authorization|session|passkey)/i;
const USER_KEY = /^(user(name)?|login|email|e-mail|account)$/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** The marker type for the value of a field with this name, or null when it's not sensitive. */
export function typeForKey(key: string): RedactionType | null {
  if (USER_KEY.test(key)) return /mail/i.test(key) ? 'email' : 'username';
  if (!SECRET_KEY.test(key)) return null;
  if (/pass(word|phrase)?$|^pass|pwd/i.test(key) && !/passkey/i.test(key)) return 'password';
  if (/api[-_]?key|apikey|nzb[-_]?key/i.test(key)) return 'apikey';
  if (/private|preshared|passkey/i.test(key)) return 'key';
  if (/token|cookie|session|authorization/i.test(key)) return 'token';
  return 'secret';
}

// --- hosts that may stay visible ------------------------------------------------------------------

/**
 * Public services whose names help a reader and reveal nothing about the user: metadata sources,
 * update checks, GitHub. Everything else (indexers, trackers, Usenet and VPN servers) is hidden.
 */
const PUBLIC_HOSTS = [
  'github.com',
  'githubusercontent.com',
  'ghcr.io',
  'docker.io',
  'docker.com',
  'servarr.com',
  'sonarr.tv',
  'radarr.video',
  'lidarr.audio',
  'prowlarr.com',
  'themoviedb.org',
  'tmdb.org',
  'thetvdb.com',
  'tvmaze.com',
  'musicbrainz.org',
  'fanart.tv',
  'jellyfin.org',
  'trash-guides.info',
  'sabnzbd.org',
  'qbittorrent.org',
  'bazarr.media',
  'opensubtitles.com',
  'opensubtitles.org',
];

function hostAllowed(host: string, extra: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  // Single-label names are containers on the Docker network (sonarr, w1kyu-easyarr_vpn_1, …).
  if (!h.includes('.')) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  return [...PUBLIC_HOSTS, ...extra].some((d) => h === d || h.endsWith(`.${d}`));
}

// --- IP addresses ---------------------------------------------------------------------------------

type IpKind = 'public' | 'private' | 'special';

function ipv4Kind(ip: string): IpKind | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 127 || a === 255 || a >= 224) return 'special';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'private'; // CGNAT, Tailscale
  if (a === 169 && b === 254) return 'private';
  return 'public';
}

function ipv6Kind(ip: string): IpKind | null {
  if ((ip.match(/::/g) ?? []).length > 1) return null;
  const groups = ip.split(':');
  if (groups.length < 3 || groups.length > 8) return null;
  if (!ip.includes('::') && groups.length !== 8) return null;
  if (groups.some((g) => !/^[0-9a-f]{0,4}$/i.test(g))) return null;
  const first = parseInt(groups[0] || '0', 16);
  if (first >= 0x2000 && first <= 0x3fff) return 'public';
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return 'private';
  return null;
}

// --- the rules ------------------------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** PEM blocks and OpenVPN inline key material. */
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g;
const OVPN_BLOCK =
  /<(key|cert|ca|tls-auth|tls-crypt|tls-crypt-v2|secret|pkcs12|auth-user-pass)>[\s\S]*?<\/\1>/gi;

/** `scheme://user:password@` and `scheme://user@`. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@?#'"<>]+)(?::([^\s/@?#'"<>]*))?@/gi;

/** `Authorization: Bearer xyz`, `Authorization: Basic xyz`, `X-Api-Key: xyz` headers. */
const AUTH_HEADER =
  /\b((?:proxy-)?authorization)(["']?\s*[:=]\s*["']?)(?:(bearer|basic|digest|token|mediabrowser)\s+)?([^\s"',;]+)/gi;

/**
 * `name=value`, `name: value`, `"name":"value"` for sensitive names, optionally prefixed
 * (`WIREGUARD_PRIVATE_KEY=`, `x-api-key:`, `email_pwd =`).
 */
const KEY_VALUE = new RegExp(
  String.raw`(["']?\b(?:[A-Za-z0-9]+[_-])*` +
    String.raw`(password|passwd|passphrase|pwd|pass|passkey|api[_-]?key|apikey|nzb[_-]?key|` +
    String.raw`access[_-]?token|refresh[_-]?token|auth[_-]?token|token|secret|private[_-]?key|` +
    String.raw`preshared[_-]?key|session[_-]?id|cookie|username|user|email)\b["']?)` +
    String.raw`(\s*[=:]\s*)(["']?)(?!\[REDACTED)([^\s"'&,;<>{}\[\]]+)`,
  'gi',
);

/** qBittorrent API keys and JWTs (Cleanuparr, Seerr sessions). */
const QBT_KEY = /\bqbt_[A-Za-z0-9]{28}\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
/** WireGuard keys: 32 bytes base64 = 43 characters + "=". */
const WG_KEY = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=(?![A-Za-z0-9+/=])/g;
/** Servarr/SABnzbd/Jellyfin API keys and tokens: 32+ hex digits (not image digests). */
const HEX_KEY = /(?<![0-9a-f:])(?<!sha256:)(?<!sha1:)[0-9a-f]{32,}(?![0-9a-f])/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Host part of a URL. */
const URL_HOST =
  /\b((?:https?|wss?|ftps?|nntps?|udp|tcp):\/\/(?:[^\s/@?#'"<>]*@)?)([A-Za-z0-9.-]+)(?=[:/?#\s"'<>)\]]|$)/gi;
/** `news.example.com:563` outside a URL. */
const HOST_PORT = /(?<![\w./@-])((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})(?=:\d{2,5}\b)/g;
const IPV4 = /(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w]|\.\d)/g;
const IPV6 = /(?<![\w:.])([0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7})(?![\w:])/gi;
/** "version 1.0.1.0", "v10.11.0.0" — not addresses. */
const VERSION_BEFORE = /\b(?:version|ver|v)["':=\s]*$/i;

function maskKnown(text: string, known: readonly KnownValue[]): string {
  // Longest first, so a password that contains a username is masked as a whole.
  const sorted = [...known]
    .filter((k) => k.value.trim() !== '' && !REDACTED_MARKER.test(k.value))
    .sort((a, b) => b.value.length - a.value.length);
  let out = text;
  for (const { value, type } of sorted) {
    const v = value.trim();
    if (type === 'username') {
      if (v.length < MIN_USERNAME_LENGTH) continue;
      out = out.replace(
        new RegExp(`(?<![A-Za-z0-9._-])${escapeRe(v)}(?![A-Za-z0-9_-])`, 'gi'),
        redacted(type),
      );
    } else if (type === 'host') {
      if (v.length < 4) continue;
      out = out.replace(
        new RegExp(`(?<![A-Za-z0-9-])${escapeRe(v)}(?![A-Za-z0-9-])`, 'gi'),
        redacted(type),
      );
    } else {
      if (v.length < MIN_SECRET_LENGTH) continue;
      out = out.split(v).join(redacted(type));
    }
  }
  return out;
}

/** Redacts one piece of free text (a log line, an error message, a whole file). */
export function redactText(text: string, opts: RedactOptions = {}): string {
  if (!text) return text;
  const allow = opts.allowHosts ?? [];
  let out = text;
  out = out.replace(PEM_BLOCK, redacted('key'));
  out = out.replace(OVPN_BLOCK, (_m, tag: string) => `<${tag}>${redacted('key')}</${tag}>`);
  if (opts.known?.length) out = maskKnown(out, opts.known);
  out = out.replace(URL_CREDENTIALS, (_m, scheme: string, _user: string, pass?: string) =>
    pass === undefined
      ? `${scheme}${redacted('username')}@`
      : `${scheme}${redacted('username')}:${redacted('password')}@`,
  );
  out = out.replace(
    AUTH_HEADER,
    (m, name: string, sep: string, scheme: string | undefined, value: string) =>
      REDACTED_MARKER.test(value)
        ? m
        : `${name}${sep}${scheme ? `${scheme} ` : ''}${redacted('token')}`,
  );
  out = out.replace(
    KEY_VALUE,
    (_m, name: string, core: string, sep: string, quote: string) =>
      `${name}${sep}${quote}${redacted(typeForKey(core) ?? 'secret')}`,
  );
  out = out.replace(QBT_KEY, redacted('apikey'));
  out = out.replace(JWT, redacted('token'));
  out = out.replace(WG_KEY, redacted('key'));
  out = out.replace(HEX_KEY, redacted('token'));
  out = out.replace(EMAIL, redacted('email'));
  out = out.replace(URL_HOST, (m, scheme: string, host: string) => {
    if (ipv4Kind(host) !== null || hostAllowed(host, allow)) return m;
    return `${scheme}${redacted('host')}`;
  });
  out = out.replace(HOST_PORT, (m, host: string) =>
    ipv4Kind(host) !== null || hostAllowed(host, allow) ? m : redacted('host'),
  );
  out = out.replace(IPV4, (m, ip: string, offset: number, whole: string) => {
    const kind = ipv4Kind(ip);
    if (kind === null || kind === 'special') return m;
    if (VERSION_BEFORE.test(whole.slice(Math.max(0, offset - 12), offset))) return m;
    if (kind === 'private') return opts.privateIps ? redacted('private-ip') : m;
    return redacted('ip');
  });
  out = out.replace(IPV6, (m, ip: string) => {
    const kind = ipv6Kind(ip);
    if (kind === 'public') return redacted('ip');
    if (kind === 'private' && opts.privateIps) return redacted('private-ip');
    return m;
  });
  return out;
}

/**
 * Redacted deep copy of structured data: values of sensitive keys are replaced whole, every other
 * string goes through redactText. Never mutates the input; handles cycles and Error objects.
 */
export function redactValue<T>(value: T, opts: RedactOptions = {}): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (v: unknown, key?: string): unknown => {
    const type = key === undefined ? null : typeForKey(key);
    if (type && v !== null && v !== undefined && v !== '' && typeof v !== 'boolean') {
      if (typeof v === 'object') return walkObject(v);
      // A username/email field holding an already-safe or non-string value (counts, flags) stays.
      if (typeof v !== 'string')
        return type === 'username' || type === 'email' ? v : redacted(type);
      return REDACTED_MARKER.test(v) && v.replace(/\[REDACTED:[a-z-]+\]/g, '').trim() === ''
        ? v
        : redacted(type);
    }
    if (typeof v === 'string') return redactText(v, opts);
    if (v === null || typeof v !== 'object') return v;
    return walkObject(v);
  };
  const walkObject = (obj: object): unknown => {
    if (seen.has(obj)) return seen.get(obj);
    if (obj instanceof Error) {
      const copy: Record<string, unknown> = { name: obj.name, message: walk(obj.message) };
      if (obj.stack) copy['stack'] = walk(obj.stack);
      seen.set(obj, copy);
      return copy;
    }
    if (Array.isArray(obj)) {
      const arr: unknown[] = [];
      seen.set(obj, arr);
      for (const item of obj) arr.push(walk(item));
      return arr;
    }
    const out: Record<string, unknown> = {};
    seen.set(obj, out);
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v, k);
    return out;
  };
  return walk(value) as T;
}

/**
 * Last line of defence before text leaves EasyArr: true when any known secret value (password,
 * key, token) still appears. Usernames and hosts are not checked (they may be ordinary words).
 */
export function leaksSecret(text: string, known: readonly KnownValue[]): boolean {
  return known.some(
    (k) =>
      !['username', 'host', 'email'].includes(k.type) &&
      k.value.trim().length >= MIN_SECRET_LENGTH &&
      text.includes(k.value.trim()),
  );
}
