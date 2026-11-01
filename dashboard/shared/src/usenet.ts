import { z } from 'zod';
import { USENET_PROVIDER_PRESETS } from './usenet-presets.js';

/**
 * Wizard step 6 (SPEC §8): Usenet providers (the servers that store the files) and indexers (the
 * search sites that tell EasyArr what to fetch). Shared by server and web so both validate alike.
 * Validation messages are i18n keys (`wizard.error.*`).
 */

export { USENET_PROVIDER_PRESETS, type UsenetProviderPreset } from './usenet-presets.js';

/**
 * Indexers Prowlarr knows by name — its built-in Newznab presets (Prowlarr 2.7.0, D-050). Picking one
 * fills in the address; "Other" takes any Newznab address. EasyArr doesn't rank or recommend them.
 * https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Indexers/Definitions/Newznab/Newznab.cs#L88-L108
 */
export interface UsenetIndexerPreset {
  id: string;
  /** Prowlarr's preset name (also the default display name). */
  name: string;
  url: string;
  apiPath?: string;
}

export const USENET_INDEXER_PRESETS: readonly UsenetIndexerPreset[] = [
  { id: 'abnzb', name: 'abNZB', url: 'https://abnzb.com' },
  { id: 'althub', name: 'altHUB', url: 'https://api.althub.co.za' },
  { id: 'dognzb', name: 'DOGnzb', url: 'https://api.dognzb.cr' },
  { id: 'drunkenslug', name: 'DrunkenSlug', url: 'https://drunkenslug.com' },
  { id: 'gingadaddy', name: 'GingaDADDY', url: 'https://www.gingadaddy.com' },
  { id: 'miatrix', name: 'Miatrix', url: 'https://www.miatrix.com' },
  { id: 'ninjacentral', name: 'NinjaCentral', url: 'https://ninjacentral.co.za' },
  { id: 'nzblife', name: 'Nzb.life', url: 'https://api.nzb.life' },
  { id: 'nzbcat', name: 'NZBCat', url: 'https://nzb.cat' },
  { id: 'nzbfinder', name: 'NZBFinder', url: 'https://nzbfinder.ws' },
  { id: 'nzbgeek', name: 'NZBgeek', url: 'https://api.nzbgeek.info' },
  { id: 'nzbnoob', name: 'NzbNoob', url: 'https://www.nzbnoob.com' },
  { id: 'nzbndx', name: 'NZBNDX', url: 'https://www.nzbndx.com' },
  { id: 'nzbplanet', name: 'NzbPlanet', url: 'https://api.nzbplanet.net' },
  { id: 'nzbstars', name: 'NZBStars', url: 'https://nzbstars.com' },
  {
    id: 'tabularasa',
    name: 'Tabula Rasa',
    url: 'https://www.tabula-rasa.pw',
    apiPath: '/api/v1/api',
  },
];

export const MAX_USENET_SERVERS = 5;
export const MAX_USENET_INDEXERS = 10;

/** Stable, URL-safe ids so a saved password/API key stays attached to its entry. */
const entryId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'wizard.error.generic');

/** A host name or IPv4 address, no scheme or path ("news.example.com"). */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const hostSchema = z
  .string()
  .trim()
  .min(1, 'wizard.error.usenetHostRequired')
  .regex(HOSTNAME_PATTERN, 'wizard.error.usenetHostInvalid');

const portSchema = z
  .number({ message: 'wizard.error.usenetPortInvalid' })
  .int('wizard.error.usenetPortInvalid')
  .min(1, 'wizard.error.usenetPortInvalid')
  .max(65535, 'wizard.error.usenetPortInvalid');

const connectionsSchema = z
  .number({ message: 'wizard.error.usenetConnectionsInvalid' })
  .int('wizard.error.usenetConnectionsInvalid')
  .min(1, 'wizard.error.usenetConnectionsInvalid')
  .max(100, 'wizard.error.usenetConnectionsInvalid');

const secretSchema = z.string().max(500, 'wizard.error.tooLong');

/** One provider as stored in state.json (no password). */
export const usenetServerSchema = z.object({
  id: entryId,
  /** USENET_PROVIDER_PRESETS id, or null for "other provider". */
  preset: z.string().nullable(),
  host: hostSchema,
  port: portSchema,
  ssl: z.boolean(),
  username: z.string().trim().min(1, 'wizard.error.usenetUsernameRequired').max(200),
  connections: connectionsSchema,
});
export type UsenetServer = z.infer<typeof usenetServerSchema>;

/** What the form sends: a server plus its password (left out = keep the saved one). */
export const usenetServerInputSchema = usenetServerSchema.extend({
  password: secretSchema.optional(),
});
export type UsenetServerInput = z.infer<typeof usenetServerInputSchema>;

/** http(s)://host[:port][/path] — what Prowlarr's Newznab "URL" field accepts (ValidRootUrl). */
export const INDEXER_URL_PATTERN =
  /^https?:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:\d{1,5})?(\/[^\s?#]*)?$/;
const indexerUrlSchema = z
  .string()
  .trim()
  .min(1, 'wizard.error.indexerUrlRequired')
  .regex(INDEXER_URL_PATTERN, 'wizard.error.indexerUrlInvalid');

export const usenetIndexerSchema = z.object({
  id: entryId,
  /** USENET_INDEXER_PRESETS id, or null for "other indexer". */
  preset: z.string().nullable(),
  name: z
    .string()
    .trim()
    .min(1, 'wizard.error.indexerNameRequired')
    .max(60, 'wizard.error.tooLong'),
  url: indexerUrlSchema,
  /** Newznab API path, normally /api. */
  apiPath: z
    .string()
    .regex(/^\/[A-Za-z0-9/._-]*$/, 'wizard.error.generic')
    .default('/api'),
});
export type UsenetIndexer = z.infer<typeof usenetIndexerSchema>;

export const usenetIndexerInputSchema = usenetIndexerSchema.extend({
  apiKey: secretSchema.optional(),
});
export type UsenetIndexerInput = z.input<typeof usenetIndexerInputSchema>;

const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((i) => i.id)).size === items.length;

export const usenetInputSchema = z.object({
  servers: z
    .array(usenetServerInputSchema)
    .min(1, 'wizard.error.usenetServerRequired')
    .max(MAX_USENET_SERVERS)
    .refine(uniqueIds, 'wizard.error.generic'),
  indexers: z
    .array(usenetIndexerInputSchema)
    .min(1, 'wizard.error.usenetIndexerRequired')
    .max(MAX_USENET_INDEXERS)
    .refine(uniqueIds, 'wizard.error.generic'),
});
export type UsenetInput = z.input<typeof usenetInputSchema>;

/** Step 6 answers as stored (no secrets; they live in secrets.json under the same ids). */
export const usenetAnswersSchema = z.object({
  servers: z.array(usenetServerSchema).min(1).max(MAX_USENET_SERVERS),
  indexers: z.array(usenetIndexerSchema).min(1).max(MAX_USENET_INDEXERS),
});
export type UsenetAnswers = z.infer<typeof usenetAnswersSchema>;

/** "Test" button bodies. `id` lets the server use a saved secret when none is typed. */
export const usenetServerTestSchema = usenetServerInputSchema.extend({ id: entryId.optional() });
export type UsenetServerTestInput = z.infer<typeof usenetServerTestSchema>;
export const usenetIndexerTestSchema = usenetIndexerInputSchema.extend({ id: entryId.optional() });
export type UsenetIndexerTestInput = z.input<typeof usenetIndexerTestSchema>;

/**
 * Result of a "Test" button. `reason` is an i18n key suffix (`usenet.test.<reason>`); `detail` is
 * the service's own message (shown smaller, never contains what we sent).
 */
export interface UsenetTestResult {
  ok: boolean;
  reason:
    | 'ok'
    | 'auth'
    | 'unreachable'
    | 'timeout'
    | 'certificate'
    | 'noVpn'
    | 'serviceDown'
    | 'missingSecret'
    | 'failed';
  detail?: string;
}

/** A preset by id. */
export function usenetProviderPreset(id: string | null) {
  return USENET_PROVIDER_PRESETS.find((p) => p.id === id) ?? null;
}
export function usenetIndexerPreset(id: string | null) {
  return USENET_INDEXER_PRESETS.find((p) => p.id === id) ?? null;
}
