import { WIZARD_STEP_IDS, type WizardStepId } from './wizard.js';
import { redactText } from './redact.js';

/**
 * "Get help with AI" (SPEC §13, D-016): where the user was when they asked, so the prompt can
 * carry the right logs and docs. Sent as `?context=` to GET /api/diagnostics/ai-prompt, either an
 * area (`vpn`) or a wizard step (`wizard:usenet`).
 */
export const HELP_AREAS = [
  'general',
  'wizard',
  'finish',
  'dashboard',
  'vpn',
  'settings',
  'backup',
  'restore',
] as const;
export type HelpArea = (typeof HELP_AREAS)[number];

export interface HelpContext {
  area: HelpArea;
  step?: WizardStepId;
}

export function formatHelpContext(c: HelpContext): string {
  return c.step ? `${c.area}:${c.step}` : c.area;
}

/** Unknown values fall back to "general" (the prompt is still useful). */
export function parseHelpContext(raw: string | undefined | null): HelpContext {
  const [area, step] = String(raw ?? '').split(':');
  const a = (HELP_AREAS as readonly string[]).includes(area ?? '') ? (area as HelpArea) : 'general';
  if (step && (WIZARD_STEP_IDS as readonly string[]).includes(step)) {
    return { area: a, step: step as WizardStepId };
  }
  return { area: a };
}

/** Prompt size cap (SPEC §13: ~12k characters); log lines are trimmed first. */
export const AI_PROMPT_MAX_CHARS = 12_000;
/** How much the user may type into "What I was trying to do". */
export const AI_PROMPT_GOAL_MAX = 1_000;
/** Shorter than this, error text from the UI is passed as is (longer is cut). */
export const AI_PROMPT_ERROR_MAX = 600;
/** The server leaves this where the user's own words go; the dialog fills it in. */
export const AI_PROMPT_GOAL_PLACEHOLDER = '____';

export interface AiPromptView {
  prompt: string;
  /** Log lines were left out to stay under the size cap. */
  truncated: boolean;
}

/**
 * The final text the user copies: the server's prompt with the user's own words in place of the
 * placeholder. Whatever they type is redacted too (an e-mail or IP they paste by accident).
 */
export function fillAiPrompt(prompt: string, goal: string): string {
  const text = redactText(goal.trim().slice(0, AI_PROMPT_GOAL_MAX));
  return prompt.replace(AI_PROMPT_GOAL_PLACEHOLDER, text || AI_PROMPT_GOAL_PLACEHOLDER);
}

/** Popular AI chats the dialog offers to open in a new tab (the user pastes the prompt there). */
export const AI_CHATS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'lechat', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
] as const;
