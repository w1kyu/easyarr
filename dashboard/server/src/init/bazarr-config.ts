import { randomBytes } from 'node:crypto';
import { parse, stringify } from 'yaml';

/** Bazarr's subtitle sources that need no account (research: bazarr-recyclarr.md §5). */
export const BAZARR_DEFAULT_PROVIDERS = ['subtitlecat', 'yifysubtitles', 'gestdown', 'tvsubtitles'];

type Doc = Record<string, Record<string, unknown>>;

/** Values EasyArr owns: re-applied when they drift, because the stack needs them (D-031). */
function owned(keys: { apiKey: string; sonarrKey: string; radarrKey: string }): Doc {
  return {
    general: { ip: '*', port: 6767, base_url: '/apps/bazarr' },
    auth: { apikey: keys.apiKey },
    sonarr: {
      ip: '127.0.0.1',
      port: 8989,
      base_url: '/apps/sonarr',
      ssl: false,
      apikey: keys.sonarrKey,
    },
    radarr: {
      ip: '127.0.0.1',
      port: 7878,
      base_url: '/apps/radarr',
      ssl: false,
      apikey: keys.radarrKey,
    },
  };
}

/** Written only when the file doesn't exist yet. Connections are switched on by the wiring engine
 * after the language profile exists (the default profile must exist before the first sync). */
const FIRST_RUN: Doc = {
  general: { use_sonarr: false, use_radarr: false, enabled_providers: BAZARR_DEFAULT_PROVIDERS },
  auth: { type: null },
  analytics: { enabled: false },
};

/**
 * Seeds or fixes Bazarr's config.yaml. Returns the API key (adopted from the file when valid) and
 * the new file content, or null when nothing needs to change. Types matter: Bazarr silently resets
 * values of the wrong type, which would make init and Bazarr overwrite each other forever.
 */
export function seedBazarrConfig(
  raw: string | undefined,
  keys: { apiKey: string | undefined; sonarrKey: string; radarrKey: string },
): { apiKey: string; content: string | null } {
  let doc: Doc = {};
  if (raw !== undefined) {
    const parsed: unknown = parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) doc = parsed as Doc;
  }
  const fileKey = doc['auth']?.['apikey'];
  const apiKey =
    typeof fileKey === 'string' && /^[a-f0-9]{32}$/i.test(fileKey)
      ? fileKey
      : (keys.apiKey ?? randomBytes(16).toString('hex'));
  let changed = raw === undefined;
  const apply = (src: Doc, onlyMissing: boolean) => {
    for (const [section, values] of Object.entries(src)) {
      const target = (doc[section] ??= {});
      for (const [k, v] of Object.entries(values)) {
        if (onlyMissing && k in target) continue;
        if (JSON.stringify(target[k]) !== JSON.stringify(v)) {
          target[k] = v;
          changed = true;
        }
      }
    }
  };
  if (raw === undefined) apply(FIRST_RUN, true);
  apply(owned({ apiKey, sonarrKey: keys.sonarrKey, radarrKey: keys.radarrKey }), false);
  return { apiKey, content: changed ? stringify(doc) : null };
}
