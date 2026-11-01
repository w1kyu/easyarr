/**
 * Usenet provider presets for wizard step 6 (SPEC §8 [VERIFY presets]). Every value was checked on
 * the provider's own help pages (see `source`, PROGRESS.md → Verified facts). Providers change
 * their servers rarely, but the form always lets users edit what a preset filled in.
 */
export interface UsenetProviderPreset {
  id: string;
  /** Product name (not translated). */
  name: string;
  host: string;
  /** SSL port. */
  port: number;
  /** Connections allowed on the provider's usual plans (the user can lower it). */
  connections: number;
  signupUrl: string;
  /** Where the values come from. */
  source: string;
}

export const USENET_PROVIDER_PRESETS: readonly UsenetProviderPreset[] = [];
