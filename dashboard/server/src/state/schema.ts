import { z } from 'zod';

/**
 * state.json — everything EasyArr remembers except secrets (SPEC §7.2).
 * Bump STATE_SCHEMA_VERSION and add a migration in migrations.ts for every breaking change.
 */
export const STATE_SCHEMA_VERSION = 2;

export const stateSchema = z.object({
  schemaVersion: z.literal(STATE_SCHEMA_VERSION),
  createdAt: z.string(),
  wizard: z.object({
    completedSteps: z.array(z.string()),
    answers: z.record(z.string(), z.unknown()),
  }),
  ui: z.object({
    mode: z.enum(['simple', 'advanced']),
  }),
  /**
   * The owner's account from wizard step 3 (v2). Only a password *hash* lives here; the plaintext
   * is in secrets.json because it must be applied to Jellyfin later (phase 05).
   */
  account: z
    .object({ username: z.string(), passwordHash: z.string(), updatedAt: z.string() })
    .nullable(),
});
export type State = z.infer<typeof stateSchema>;

export function defaultState(now = new Date()): State {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    wizard: { completedSteps: [], answers: {} },
    ui: { mode: 'simple' },
    account: null,
  };
}

/** secrets.json — API keys and other credentials. chmod 600, never logged (SPEC §7.2). */
export const SECRETS_SCHEMA_VERSION = 2;

export const secretsSchema = z.object({
  schemaVersion: z.literal(SECRETS_SCHEMA_VERSION),
  apiKeys: z.record(z.string(), z.string()),
  /** Plaintext account password (v2), needed to set up Jellyfin. */
  account: z.object({ password: z.string() }).nullable(),
});
export type Secrets = z.infer<typeof secretsSchema>;

export function defaultSecrets(): Secrets {
  return { schemaVersion: SECRETS_SCHEMA_VERSION, apiKeys: {}, account: null };
}
