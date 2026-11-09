import { z } from 'zod';

/**
 * state.json — everything EasyArr remembers except secrets (SPEC §7.2).
 * Bump STATE_SCHEMA_VERSION and add a migration in migrations.ts for every breaking change.
 */
export const STATE_SCHEMA_VERSION = 4;

export const vpnTestResultSchema = z.object({
  ok: z.boolean(),
  at: z.string(),
  /** Error code when not ok (see vpn/errors.ts). */
  code: z.string().nullable(),
  publicIp: z.string().nullable(),
  country: z.string().nullable(),
  /** true = VPN IP differs from the home IP, false = same (leak!), null = couldn't check. */
  homeIpHidden: z.boolean().nullable(),
});
export type VpnTestResult = z.infer<typeof vpnTestResultSchema>;

/** A resource the wiring engine created or adopted in a service (SPEC §10.2, D-047). */
export const ledgerEntrySchema = z.object({
  /** Stable logical key, e.g. "sonarr.downloadclient.qbittorrent". */
  key: z.string(),
  service: z.string(),
  kind: z.string(),
  /** The service's own id for it (stringified). */
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  /** true = it existed already (e.g. made by the user) and EasyArr only took note of it. */
  adopted: z.boolean(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const wiringRunSchema = z.object({
  at: z.string(),
  mode: z.enum(['run', 'repair', 'startup']),
  ok: z.boolean(),
  changes: z.number().int(),
});
export type WiringRunSummary = z.infer<typeof wiringRunSchema>;

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
   * Automatic re-search of missing movies/episodes (D-067). Optional, so older files load as they
   * are (default RECHECK_DEFAULT_HOURS) and older versions simply ignore it.
   */
  searches: z.object({ recheckHours: z.number().int().min(0).max(168) }).optional(),
  /**
   * The owner's account from wizard step 3 (v2). Only a password *hash* lives here; the plaintext
   * is in secrets.json because it must be applied to Jellyfin later (phase 05).
   */
  account: z
    .object({ username: z.string(), passwordHash: z.string(), updatedAt: z.string() })
    .nullable(),
  /** VPN settings without secrets (v3, phase 04). Secret field values live in secrets.json. */
  vpn: z
    .object({
      provider: z.string(),
      protocol: z.enum(['wireguard', 'openvpn']),
      locations: z.array(z.string()),
      portForwarding: z.boolean(),
      forwardedPort: z.number().int().nullable(),
      freePlan: z.boolean(),
      /** Non-secret field values (e.g. WireGuard addresses). */
      fields: z.record(z.string(), z.string()),
      configuredAt: z.string(),
      lastTest: vpnTestResultSchema.nullable(),
    })
    .nullable(),
  /** Wiring engine (v4, phase 05): what EasyArr created in each service, and settings it set once. */
  wiring: z.object({
    ledger: z.array(ledgerEntrySchema),
    /** Keys of one-time settings already applied (never re-applied: the user may have changed them). */
    applied: z.array(z.string()),
    lastRun: wiringRunSchema.nullable(),
  }),
});
export type State = z.infer<typeof stateSchema>;

export function defaultState(now = new Date()): State {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    wizard: { completedSteps: [], answers: {} },
    ui: { mode: 'simple' },
    account: null,
    vpn: null,
    wiring: { ledger: [], applied: [], lastRun: null },
  };
}

/** secrets.json — API keys and other credentials. chmod 600, never logged (SPEC §7.2). */
export const SECRETS_SCHEMA_VERSION = 4;

export const secretsSchema = z.object({
  schemaVersion: z.literal(SECRETS_SCHEMA_VERSION),
  apiKeys: z.record(z.string(), z.string()),
  /** Plaintext account password (v2), needed to set up Jellyfin. */
  account: z.object({ password: z.string() }).nullable(),
  /** Secret VPN field values (v3): keys, usernames, passwords, certificates, config files. */
  vpn: z.object({ fields: z.record(z.string(), z.string()) }).nullable(),
  /** Usenet passwords and indexer API keys (v4), keyed by the wizard entry's id. */
  usenet: z
    .object({
      servers: z.record(z.string(), z.string()),
      indexers: z.record(z.string(), z.string()),
    })
    .nullable(),
});
export type Secrets = z.infer<typeof secretsSchema>;

export function defaultSecrets(): Secrets {
  return {
    schemaVersion: SECRETS_SCHEMA_VERSION,
    apiKeys: {},
    account: null,
    vpn: null,
    usenet: null,
  };
}
