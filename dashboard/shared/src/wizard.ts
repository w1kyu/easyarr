import { z } from 'zod';
import { passwordStrength, PASSWORD_MIN_SCORE } from './password.js';

/**
 * Setup wizard steps (SPEC §8) shared by server and web, so both agree on order, visibility and
 * validation. Validation messages are i18n keys (`wizard.error.*`), shown as-is by the web app.
 *
 * Only steps that exist are listed. Later phases append theirs (vpn, usenet, indexers, …).
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

export interface WizardAnswers {
  welcome?: WelcomeAnswers;
  system?: SystemAnswers;
  account?: AccountAnswers;
  download?: DownloadAnswers;
}

export const WIZARD_STEP_IDS = ['welcome', 'system', 'account', 'download'] as const;
export type WizardStepId = (typeof WIZARD_STEP_IDS)[number];

export interface WizardStepDef {
  id: WizardStepId;
  /** Stored answers of this step. */
  answers: z.ZodType;
  /** Steps can depend on earlier answers (e.g. the Usenet step only when Usenet was chosen). */
  isVisible: (answers: WizardAnswers) => boolean;
}

const always = () => true;

export const WIZARD_STEPS: readonly WizardStepDef[] = [
  { id: 'welcome', answers: welcomeAnswersSchema, isVisible: always },
  { id: 'system', answers: systemAnswersSchema, isVisible: always },
  { id: 'account', answers: accountAnswersSchema, isVisible: always },
  { id: 'download', answers: downloadAnswersSchema, isVisible: always },
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
}
