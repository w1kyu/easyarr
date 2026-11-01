import { z } from 'zod';
import { passwordStrength, PASSWORD_MIN_SCORE } from './password.js';
import { usenetAnswersSchema, type UsenetAnswers } from './usenet.js';

/**
 * Setup wizard steps (SPEC §8) shared by server and web, so both agree on order, visibility and
 * validation. Validation messages are i18n keys (`wizard.error.*`), shown as-is by the web app.
 *
 * Steps 6 (Usenet) and 7 (Indexers) only show for the download method that needs them.
 */

export const DOWNLOAD_METHODS = ['torrents', 'usenet', 'both'] as const;
export type DownloadMethod = (typeof DOWNLOAD_METHODS)[number];

/** A safe subset of what Jellyfin accepts (D-036): works in every service and in URLs. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const welcomeAnswersSchema = z.object({ started: z.literal(true) });
export type WelcomeAnswers = z.infer<typeof welcomeAnswersSchema>;

export const systemAnswersSchema = z.object({
  /** The user confirmed they want to continue although the check found a problem (❌). */
  acknowledgedProblems: z.boolean(),
});
export type SystemAnswers = z.infer<typeof systemAnswersSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .min(1, 'wizard.error.usernameRequired')
  .regex(USERNAME_PATTERN, 'wizard.error.usernameInvalid');

/** Password rules. The username is checked separately (needs both fields). */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'wizard.error.passwordTooShort')
  .max(PASSWORD_MAX_LENGTH, 'wizard.error.passwordTooLong');

/**
 * What the account step sends. `password` may be left out when one is already saved
 * (going back to the step, or changing only the username in Settings later).
 */
export const accountInputSchema = z
  .object({ username: usernameSchema, password: passwordSchema.optional() })
  .superRefine((value, ctx) => {
    const pw = value.password;
    // Zod 4 still runs refinements after field errors; length problems are already reported.
    if (pw === undefined || pw.length < PASSWORD_MIN_LENGTH || pw.length > PASSWORD_MAX_LENGTH) {
      return;
    }
    if (passwordStrength(pw, value.username).score < PASSWORD_MIN_SCORE) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'wizard.error.passwordWeak' });
    }
  });
export type AccountInput = z.infer<typeof accountInputSchema>;

/** What the account step stores as its answers (no password, not even hashed). */
export const accountAnswersSchema = z.object({ username: usernameSchema });
export type AccountAnswers = z.infer<typeof accountAnswersSchema>;

export const downloadAnswersSchema = z.object({
  method: z.enum(DOWNLOAD_METHODS, { message: 'wizard.error.downloadMethodRequired' }),
});
export type DownloadAnswers = z.infer<typeof downloadAnswersSchema>;

/** Step 5: the VPN is set up and tested, or the user skipped it for now (kill switch stays closed). */
export const vpnAnswersSchema = z.object({ mode: z.enum(['configured', 'skipped']) });
export type VpnAnswers = z.infer<typeof vpnAnswersSchema>;

/**
 * Step 7 (torrents): "added" = Prowlarr had at least one indexer when the step was saved (the
 * server checks); "later" = the user chose to add them later (nothing can be found until then).
 */
export const indexersAnswersSchema = z.object({ mode: z.enum(['added', 'later']) });
export type IndexersAnswers = z.infer<typeof indexersAnswersSchema>;

export const QUALITY_PRESETS = ['best', 'balanced', 'small'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];
export const LIBRARY_IDS = ['movies', 'tv', 'music'] as const;
export type LibraryId = (typeof LIBRARY_IDS)[number];

/**
 * Languages for subtitles (Bazarr) and titles/descriptions (Jellyfin). ISO 639-1 codes that Bazarr
 * (babelfish alpha2) and Jellyfin (PreferredMetadataLanguage) both accept as-is; `country` is
 * Jellyfin's MetadataCountryCode (age ratings, release dates). Names come from Intl.DisplayNames.
 */
export const LANGUAGES = [
  { code: 'en', country: 'US' },
  { code: 'de', country: 'DE' },
  { code: 'fr', country: 'FR' },
  { code: 'es', country: 'ES' },
  { code: 'it', country: 'IT' },
  { code: 'nl', country: 'NL' },
  { code: 'pt', country: 'PT' },
  { code: 'pl', country: 'PL' },
  { code: 'sv', country: 'SE' },
  { code: 'da', country: 'DK' },
  { code: 'fi', country: 'FI' },
  { code: 'cs', country: 'CZ' },
  { code: 'hu', country: 'HU' },
  { code: 'tr', country: 'TR' },
  { code: 'ja', country: 'JP' },
  { code: 'ko', country: 'KR' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];
const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function languageCountry(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.country ?? 'US';
}

/** Step 8 "What do you want?": libraries, language, quality preset. */
export const libraryAnswersSchema = z
  .object({
    libraries: z.object({ movies: z.boolean(), tv: z.boolean(), music: z.boolean() }),
    language: z.enum(LANGUAGE_CODES, { message: 'wizard.error.languageRequired' }),
    quality: z.enum(QUALITY_PRESETS, { message: 'wizard.error.qualityRequired' }),
  })
  .refine((v) => v.libraries.movies || v.libraries.tv || v.libraries.music, {
    path: ['libraries'],
    message: 'wizard.error.libraryRequired',
  });
export type LibraryAnswers = z.infer<typeof libraryAnswersSchema>;

export const DEFAULT_LIBRARY_ANSWERS: LibraryAnswers = {
  libraries: { movies: true, tv: true, music: true },
  language: 'en',
  quality: 'balanced',
};

/**
 * Step 9: the wiring ran. "problems" = the user finished although some connections failed (they can
 * retry from the dashboard).
 */
export const finishAnswersSchema = z.object({ result: z.enum(['ok', 'problems']) });
export type FinishAnswers = z.infer<typeof finishAnswersSchema>;

export interface WizardAnswers {
  welcome?: WelcomeAnswers;
  system?: SystemAnswers;
  account?: AccountAnswers;
  download?: DownloadAnswers;
  vpn?: VpnAnswers;
  usenet?: UsenetAnswers;
  indexers?: IndexersAnswers;
  library?: LibraryAnswers;
  finish?: FinishAnswers;
}

export const WIZARD_STEP_IDS = [
  'welcome',
  'system',
  'account',
  'download',
  'vpn',
  'usenet',
  'indexers',
  'library',
  'finish',
] as const;
export type WizardStepId = (typeof WIZARD_STEP_IDS)[number];

export interface WizardStepDef {
  id: WizardStepId;
  /** Stored answers of this step. */
  answers: z.ZodType;
  /** Steps can depend on earlier answers (e.g. the Usenet step only when Usenet was chosen). */
  isVisible: (answers: WizardAnswers) => boolean;
}

const always = () => true;

export function usesTorrents(a: WizardAnswers): boolean {
  return a.download?.method === 'torrents' || a.download?.method === 'both';
}
export function usesUsenet(a: WizardAnswers): boolean {
  return a.download?.method === 'usenet' || a.download?.method === 'both';
}

export const WIZARD_STEPS: readonly WizardStepDef[] = [
  { id: 'welcome', answers: welcomeAnswersSchema, isVisible: always },
  { id: 'system', answers: systemAnswersSchema, isVisible: always },
  { id: 'account', answers: accountAnswersSchema, isVisible: always },
  { id: 'download', answers: downloadAnswersSchema, isVisible: always },
  { id: 'vpn', answers: vpnAnswersSchema, isVisible: always },
  { id: 'usenet', answers: usenetAnswersSchema, isVisible: (a) => usesUsenet(a) },
  { id: 'indexers', answers: indexersAnswersSchema, isVisible: (a) => usesTorrents(a) },
  { id: 'library', answers: libraryAnswersSchema, isVisible: always },
  { id: 'finish', answers: finishAnswersSchema, isVisible: always },
];

export function isWizardStepId(id: string): id is WizardStepId {
  return (WIZARD_STEP_IDS as readonly string[]).includes(id);
}

export function getWizardStep(id: WizardStepId): WizardStepDef {
  const step = WIZARD_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown wizard step ${id}`);
  return step;
}

/** Keep only answers that still match their step's schema (older or hand-edited state). */
export function parseWizardAnswers(raw: Record<string, unknown>): WizardAnswers {
  const out: Record<string, unknown> = {};
  for (const step of WIZARD_STEPS) {
    const parsed = step.answers.safeParse(raw[step.id]);
    if (parsed.success) out[step.id] = parsed.data;
  }
  return out as WizardAnswers;
}

export function visibleWizardSteps(answers: WizardAnswers): WizardStepId[] {
  return WIZARD_STEPS.filter((s) => s.isVisible(answers)).map((s) => s.id);
}

/** First visible step that isn't done yet, or null when every step is done. */
export function nextWizardStep(
  answers: WizardAnswers,
  completed: readonly string[],
): WizardStepId | null {
  return visibleWizardSteps(answers).find((id) => !completed.includes(id)) ?? null;
}

/** A step may be opened once every visible step before it is done (no skipping ahead). */
export function canOpenWizardStep(
  id: WizardStepId,
  answers: WizardAnswers,
  completed: readonly string[],
): boolean {
  const steps = visibleWizardSteps(answers);
  const index = steps.indexOf(id);
  if (index === -1) return false;
  return steps.slice(0, index).every((s) => completed.includes(s));
}

/** What GET /api/wizard returns. The account never includes a password, only whether one is set. */
export interface WizardView {
  steps: { id: WizardStepId; completed: boolean }[];
  next: WizardStepId | null;
  answers: WizardAnswers;
  account: { username: string; hasPassword: boolean } | null;
  /** Ids of Usenet servers/indexers with a saved password/API key (the secrets never leave). */
  usenetSecrets: { servers: string[]; indexers: string[] };
}
