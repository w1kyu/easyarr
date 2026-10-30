import { z } from 'zod';

/**
 * state.json — everything EasyArr remembers except secrets (SPEC §7.2).
 * Bump STATE_SCHEMA_VERSION and add a migration in migrations.ts for every breaking change.
 */
export const STATE_SCHEMA_VERSION = 1;

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
});
export type State = z.infer<typeof stateSchema>;

export function defaultState(now = new Date()): State {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    wizard: { completedSteps: [], answers: {} },
    ui: { mode: 'simple' },
  };
}

/** secrets.json — API keys and other credentials. chmod 600, never logged (SPEC §7.2). */
export const SECRETS_SCHEMA_VERSION = 1;

export const secretsSchema = z.object({
  schemaVersion: z.literal(SECRETS_SCHEMA_VERSION),
  apiKeys: z.record(z.string(), z.string()),
});
export type Secrets = z.infer<typeof secretsSchema>;

export function defaultSecrets(): Secrets {
  return { schemaVersion: SECRETS_SCHEMA_VERSION, apiKeys: {} };
}
