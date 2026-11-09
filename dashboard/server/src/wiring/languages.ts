import type { ServarrApp } from './services/servarr.js';

/**
 * Media languages in Sonarr 4 / Radarr 6 (D-066). Both rank releases by quality first, then by the
 * custom-format score (DownloadDecisionComparer), and v4+ has no language profiles any more, so the
 * user's order becomes custom formats that EasyArr owns:
 *
 * - "EasyArr – Language: <name>" for each chosen language. Each one matches the release language
 *   AND none of the languages ranked above it (Language conditions of one format: optional ones are
 *   OR'ed, required ones AND'ed — SpecificationMatchesGroup.DidMatch), so a release scores for its
 *   best-ranked language only, never the sum. "Original" uses value -2, which both apps compare
 *   with the series'/movie's original language (LanguageSpecification.cs).
 * - "EasyArr – Language: none you need" (only when some languages are must-haves) matches when
 *   none of the must-have languages is in the release and scores far below the profile's minimum,
 *   so such releases are refused (the dashboard offers them later instead of switching silently).
 *   Without must-haves every language is allowed; the order still decides.
 *
 * Releases without a language tag count as the original language (AggregateLanguages.cs), so an
 * untagged English release of an English film is "Original" and "English".
 * Sources: Sonarr v4.0.20.3012 / Radarr v6.4.4.10685, src/NzbDrone.Core/CustomFormats/.
 */

export const LANGUAGE_FORMAT_PREFIX = 'EasyArr – Language: ';
export const NONE_YOU_NEED = `${LANGUAGE_FORMAT_PREFIX}none you need`;
/** Points between two neighbouring ranks: more than the guide's release-group tiers differ (≤1800). */
export const LANGUAGE_SCORE_STEP = 2000;
export const NONE_YOU_NEED_SCORE = -10000;

/** Language ids, identical in Sonarr 4.0.20 and Radarr 6.4.4 (src/NzbDrone.Core/Languages/Language.cs). */
export const SERVARR_LANGUAGE: Record<string, { id: number; name: string }> = {
  original: { id: -2, name: 'Original' },
  en: { id: 1, name: 'English' },
  fr: { id: 2, name: 'French' },
  es: { id: 3, name: 'Spanish' },
  de: { id: 4, name: 'German' },
  it: { id: 5, name: 'Italian' },
  da: { id: 6, name: 'Danish' },
  nl: { id: 7, name: 'Dutch' },
  ja: { id: 8, name: 'Japanese' },
  pl: { id: 12, name: 'Polish' },
  sv: { id: 14, name: 'Swedish' },
  fi: { id: 16, name: 'Finnish' },
  tr: { id: 17, name: 'Turkish' },
  pt: { id: 18, name: 'Portuguese' },
  ko: { id: 21, name: 'Korean' },
  hu: { id: 22, name: 'Hungarian' },
  cs: { id: 25, name: 'Czech' },
};

/** Radarr's profile language "Any" (Language.cs): the guide's "Original" would refuse every dub. */
export const RADARR_ANY_LANGUAGE = { id: -1, name: 'Any' };

export interface LanguageSpec {
  name: string;
  implementation: 'LanguageSpecification';
  negate: boolean;
  required: boolean;
  fields: { name: string; value: unknown }[];
}

export interface DesiredFormat {
  name: string;
  score: number;
  specifications: LanguageSpec[];
}

const spec = (code: string, negate: boolean, required: boolean): LanguageSpec => {
  const l = SERVARR_LANGUAGE[code];
  if (!l) throw new Error(`unknown media language ${code}`);
  return {
    name: negate ? `Not ${l.name}` : l.name,
    implementation: 'LanguageSpecification',
    negate,
    required,
    fields: [
      { name: 'value', value: l.id },
      { name: 'exceptLanguage', value: false },
    ],
  };
};

export const languageFormatName = (code: string) =>
  `${LANGUAGE_FORMAT_PREFIX}${SERVARR_LANGUAGE[code]?.name ?? code}`;

/** The formats + scores for a ranked audio list (unknown codes are skipped). */
export function desiredLanguageFormats(
  audio: readonly { code: string; required: boolean }[],
): DesiredFormat[] {
  const known = audio.filter((a) => SERVARR_LANGUAGE[a.code]);
  const ranked = known.map((a) => a.code);
  const required = known.filter((a) => a.required).map((a) => a.code);
  const out: DesiredFormat[] = ranked.map((code, i) => ({
    name: languageFormatName(code),
    score: (ranked.length - i) * LANGUAGE_SCORE_STEP,
    specifications: [
      spec(code, false, false),
      ...ranked.slice(0, i).map((h) => spec(h, true, true)),
    ],
  }));
  if (required.length > 0) {
    out.push({
      name: NONE_YOU_NEED,
      score: NONE_YOU_NEED_SCORE,
      specifications: required.map((c) => spec(c, true, true)),
    });
  }
  return out;
}

/** Same conditions? (Servarr returns more keys per field/spec; compare only what EasyArr sets.) */
export function sameSpecifications(a: readonly unknown[], b: readonly LanguageSpec[]): boolean {
  const key = (s: unknown) => {
    const o = s as Partial<LanguageSpec>;
    const value = (o.fields ?? []).find((f) => f.name === 'value')?.value;
    return `${String(o.implementation)}|${String(value)}|${String(!!o.negate)}|${String(!!o.required)}`;
  };
  const x = a.map(key).sort();
  const y = b.map(key).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export const languageApps: readonly ServarrApp[] = ['sonarr', 'radarr'];

/** ISO 639-2 codes for Jellyfin (it also accepts the T variants; MediaSourceManager.NormalizeLanguage). */
const ISO_639_2: Record<string, string> = {
  en: 'eng',
  de: 'ger',
  fr: 'fre',
  es: 'spa',
  it: 'ita',
  nl: 'dut',
  pt: 'por',
  pl: 'pol',
  sv: 'swe',
  da: 'dan',
  fi: 'fin',
  cs: 'cze',
  hu: 'hun',
  tr: 'tur',
  ja: 'jpn',
  ko: 'kor',
};

/**
 * Jellyfin playback settings for the owner's account (UserConfiguration, Jellyfin 10.11):
 * - AudioLanguagePreference: the first audio choice; "OriginalLanguage" is Jellyfin's own value for
 *   "Original" (MediaSourceManager). PlayDefaultAudioTrack off, so the preference wins over the
 *   file's default track.
 * - SubtitleLanguagePreference: the first subtitle language; SubtitleMode "Smart" shows those
 *   subtitles only when the audio is in another language. Untouched without subtitle languages.
 * Returns true when something changed.
 */
export function applyPlaybackLanguages(
  config: Record<string, unknown>,
  audio: readonly { code: string }[],
  subtitles: readonly { code: string }[],
): boolean {
  const first = audio[0]?.code;
  const sub = subtitles[0]?.code;
  const want: Record<string, unknown> = {
    AudioLanguagePreference:
      first === 'original' ? 'OriginalLanguage' : (ISO_639_2[first ?? ''] ?? ''),
    PlayDefaultAudioTrack: false,
    ...(sub && ISO_639_2[sub]
      ? { SubtitleLanguagePreference: ISO_639_2[sub], SubtitleMode: 'Smart' }
      : {}),
  };
  let changed = false;
  for (const [k, v] of Object.entries(want)) {
    if (config[k] !== v) {
      config[k] = v;
      changed = true;
    }
  }
  return changed;
}
