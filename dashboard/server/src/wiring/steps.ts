import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { containerName, type ServiceId } from '@easyarr/shared';
import type { StepContext, WiringPlan, WiringStep } from './engine.js';
import { ServiceError } from './http.js';
import {
  applyPlaybackLanguages,
  desiredLanguageFormats,
  LANGUAGE_FORMAT_PREFIX,
  RADARR_ANY_LANGUAGE,
  sameSpecifications,
} from './languages.js';
import { BazarrClient, languageProfile } from './services/bazarr.js';
import { CleanuparrApi, type CleanuparrArr } from './services/cleanuparr.js';
import {
  hardwareAcceleration,
  JellyfinClient,
  type GpuVendor,
  type JellyfinCollection,
} from './services/jellyfin.js';
import { QBITTORRENT_DEFAULTS, QbittorrentApi } from './services/qbittorrent.js';
import { qualityProfileName, recyclarrConfig, type RecyclarrFiles } from './services/recyclarr.js';
import { SabnzbdApi } from './services/sabnzbd.js';
import { MEDIA_SERVER_NOT_CONFIGURED, SeerrClient } from './services/seerr.js';
import { usenetIndexerPreset, usenetProviderPreset } from '@easyarr/shared';
import {
  fieldValue,
  indexerTemplateSchema,
  lidarrQualityProfile,
  newznabIndexerBody,
  prowlarrApplicationBody,
  qbittorrentClientBody,
  sabnzbdClientBody,
  ServarrClient,
  type ServarrApp,
} from './services/servarr.js';

/** What the steps need from the outside world (injected so tests can fake every service). */
export interface StepDeps {
  /** Base URL of a service's HTTP port as seen from the dashboard (no URL base). */
  url(id: ServiceId): string;
  /** API keys and other credentials from secrets.json. */
  keys(): Promise<Record<string, string>>;
  /** Stores a credential EasyArr obtained (Jellyfin/Seerr/Cleanuparr API keys). */
  saveKey(name: string, value: string): Promise<void>;
  /** The wizard account (step 3). */
  account(): Promise<{ username: string; password: string }>;
  recyclarr: Pick<RecyclarrFiles, 'writeConfig' | 'sync'>;
  /** GPU for Jellyfin: vendor + render device, or null. */
  gpu(): Promise<{ vendor: GpuVendor; device: string } | null>;
  /** Wizard step 6 secrets: a Usenet server's password / an indexer's API key, by entry id. */
  usenetSecret(kind: 'servers' | 'indexers', id: string): Promise<string | undefined>;
  fetch?: typeof fetch;
  /**
   * The dashboard as the user's browser reaches it (e.g. http://umbrel.local:39000). Seerr's
   * "Open in Sonarr/Radarr" links point at its /apps/<name> proxy.
   */
  publicUrl?: string;
  /** Waiting for Recyclarr's sync (tests make it instant). */
  recyclarrTimeoutMs?: number;
}

type Arr = Exclude<ServarrApp, 'prowlarr'>;

/** Library → app, folders and category names (SPEC §6, §10.1). */
export const LIBRARIES: {
  lib: keyof WiringPlan['libraries'];
  app: Arr;
  category: string;
  jellyfin: JellyfinCollection;
  name: string;
}[] = [
  { lib: 'tv', app: 'sonarr', category: 'tv', jellyfin: 'tvshows', name: 'Shows' },
  { lib: 'movies', app: 'radarr', category: 'movies', jellyfin: 'movies', name: 'Movies' },
  { lib: 'music', app: 'lidarr', category: 'music', jellyfin: 'music', name: 'Music' },
];

const URL_BASE: Record<ServarrApp, string> = {
  sonarr: '/apps/sonarr',
  radarr: '/apps/radarr',
  lidarr: '/apps/lidarr',
  prowlarr: '/apps/prowlarr',
};
const PORT: Record<ServarrApp, number> = {
  sonarr: 8989,
  radarr: 7878,
  lidarr: 8686,
  prowlarr: 9696,
};
/** How apps in the VPN namespace reach each other. */
const STALL_RULE = 'EasyArr – stalled downloads';
const local = (app: ServarrApp) => `http://localhost:${PORT[app]}${URL_BASE[app]}`;

/** Same naming as the Recyclarr-managed Sonarr/Radarr profiles: "EasyArr (Balanced)". */
const lidarrProfileName = (plan: WiringPlan) => qualityProfileName(plan.quality);

const libsFor = (plan: WiringPlan) => LIBRARIES.filter((l) => plan.libraries[l.lib]);
const anyTorrentOrUsenet = (plan: WiringPlan) => plan.torrents || plan.usenet;

export function buildSteps(deps: StepDeps): {
  steps: WiringStep[];
  health: Partial<Record<ServiceId, () => Promise<unknown>>>;
} {
  const f = deps.fetch;
  const key = async (name: string) => {
    const k = (await deps.keys())[name];
    if (!k)
      throw new ServiceError(name, 'auth', `EasyArr has no API key for ${name} (did init run?)`);
    return k;
  };
  const servarr = async (app: ServarrApp) =>
    new ServarrClient(app, deps.url(app), URL_BASE[app], await key(app), f);
  const qbit = () => new QbittorrentApi(deps.url('qbittorrent'), f);
  const sab = async () => new SabnzbdApi(deps.url('sabnzbd'), await key('sabnzbd'), f);
  const bazarr = async () =>
    new BazarrClient(`${deps.url('bazarr')}/apps/bazarr`, await key('bazarr'), f);
  const jellyfin = () => new JellyfinClient(deps.url('jellyfin'), f);
  const seerr = () => new SeerrClient(deps.url('jellyseerr'), f);
  const publicUrl = (deps.publicUrl ?? 'http://umbrel.local:39000').replace(/\/+$/, '');
  const cleanuparr = () => new CleanuparrApi(`${deps.url('cleanuparr')}/apps/cleanuparr`, f);

  const health: Partial<Record<ServiceId, () => Promise<unknown>>> = {
    sonarr: async () => (await servarr('sonarr')).ready(),
    radarr: async () => (await servarr('radarr')).ready(),
    lidarr: async () => (await servarr('lidarr')).ready(),
    prowlarr: async () => (await servarr('prowlarr')).ready(),
    qbittorrent: () => qbit().ready(),
    sabnzbd: async () => (await sab()).ready(),
    bazarr: async () => (await bazarr()).ready(),
    jellyfin: () => jellyfin().ready(),
    jellyseerr: () => seerr().publicSettings(),
    cleanuparr: () => cleanuparr().ready(),
  };

  // --- download clients -------------------------------------------------------------------------

  const qbittorrentSetup: WiringStep = {
    id: 'qbittorrent.setup',
    service: 'qbittorrent',
    needs: ['qbittorrent'],
    enabled: (p) => p.torrents,
    async run(ctx) {
      const q = qbit();
      await ctx.once('qbittorrent.preferences', async () => {
        await q.setPreferences(QBITTORRENT_DEFAULTS);
        return true;
      });
      // Categories first: the *arr apps would otherwise create them without a folder.
      for (const l of libsFor(ctx.plan)) {
        await ctx.resource({
          key: `qbittorrent.category.${l.category}`,
          kind: 'category',
          name: l.category,
          exists: async (id) => id in (await q.categories()),
          find: async () => (l.category in (await q.categories()) ? l.category : null),
          create: async () => {
            await q.createCategory(l.category, `/data/downloads/torrents/${l.category}`);
            return l.category;
          },
        });
      }
    },
  };

  const sabnzbdSetup: WiringStep = {
    id: 'sabnzbd.setup',
    service: 'sabnzbd',
    needs: ['sabnzbd'],
    enabled: (p) => p.usenet,
    async run(ctx) {
      const s = await sab();
      for (const l of libsFor(ctx.plan)) {
        const has = async () => (await s.categories()).some((c) => c.name === l.category);
        await ctx.resource({
          key: `sabnzbd.category.${l.category}`,
          kind: 'category',
          name: l.category,
          exists: async () => has(),
          find: async () => ((await has()) ? l.category : null),
          create: async () => {
            await s.setCategory(l.category, l.category);
            return l.category;
          },
        });
      }
      // News servers from wizard step 6. SABnzbd names a server after its host by default; a
      // server the user added by hand for the same host is adopted, not duplicated.
      for (const server of ctx.plan.usenetServers) {
        const label = usenetProviderPreset(server.preset)?.name ?? server.host;
        await ctx.resource({
          key: `sabnzbd.server.${server.id}`,
          kind: 'server',
          name: label,
          exists: async (id) => (await s.servers()).some((x) => x.name === id),
          find: async () =>
            (await s.servers()).find(
              (x) => (x.host ?? '').toLowerCase() === server.host.toLowerCase(),
            )?.name ?? null,
          create: async () => {
            const password = await deps.usenetSecret('servers', server.id);
            if (!password)
              throw new ServiceError('sabnzbd', 'rejected', `no password saved for ${label}`, 400, [
                'usenet_secret_missing',
              ]);
            await s.setServer(server.host, { ...server, password, displayname: label });
            return server.host;
          },
        });
      }
    },
  };

  // --- Lidarr profile (before its root folder, which needs a default profile) --------------------

  const lidarrProfile: WiringStep = {
    id: 'lidarr.profile',
    service: 'lidarr',
    needs: ['lidarr'],
    enabled: (p) => p.libraries.music,
    async run(ctx) {
      const l = await servarr('lidarr');
      const name = lidarrProfileName(ctx.plan);
      const byName = async () => (await l.qualityProfiles()).find((p) => p.name === name);
      await ctx.resource({
        key: `lidarr.qualityprofile.${ctx.plan.quality}`,
        kind: 'qualityprofile',
        name,
        exists: async (id) => (await l.qualityProfiles()).some((p) => String(p.id) === id),
        find: async () => {
          const p = await byName();
          return p ? String(p.id) : null;
        },
        create: async () => {
          const schema = await l.get(
            '/qualityprofile/schema',
            z.looseObject({ items: z.array(z.any()) }),
          );
          const created = await l.post(
            '/qualityprofile',
            lidarrQualityProfile(schema, name, ctx.plan.quality),
            z.looseObject({ id: z.number() }),
          );
          return String(created.id);
        },
      });
    },
  };

  // --- each *arr app: root folder, download clients, settings -----------------------------------

  const arrMedia = (
    app: Arr,
    lib: keyof WiringPlan['libraries'],
    category: string,
  ): WiringStep => ({
    id: `${app}.connect`,
    service: app,
    // Adding a download client makes the app test it, so the client must be up too.
    needs: (p) => [
      app,
      ...(p.torrents ? (['qbittorrent'] as const) : []),
      ...(p.usenet ? (['sabnzbd'] as const) : []),
    ],
    enabled: (p) => p.libraries[lib],
    async run(ctx) {
      const a = await servarr(app);
      const path = `/data/media/${category}`;
      await ctx.resource({
        key: `${app}.rootfolder`,
        kind: 'rootfolder',
        name: path,
        exists: async (id) => (await a.rootFolders()).some((r) => String(r.id) === id),
        find: () => a.rootFolderByPath(path),
        create: async () => {
          let body: Record<string, unknown> = { path };
          if (app === 'lidarr') {
            const profiles = await a.qualityProfiles();
            const quality =
              profiles.find((p) => p.name === lidarrProfileName(ctx.plan)) ??
              profiles.find((p) => p.name === 'Standard') ??
              profiles[0];
            const metadata = (await a.metadataProfiles()).find((p) => p.name === 'Standard');
            if (!quality || !metadata)
              throw new ServiceError('lidarr', 'starting', 'default profiles missing');
            body = {
              ...body,
              name: 'Music',
              defaultQualityProfileId: quality.id,
              defaultMetadataProfileId: metadata.id,
              defaultMonitorOption: 'all',
              defaultNewItemMonitorOption: 'all',
              defaultTags: [],
            };
          }
          const created = await a.post('/rootfolder', body, z.looseObject({ id: z.number() }));
          return String(created.id);
        },
      });

      const client = async (
        impl: 'QBittorrent' | 'Sabnzbd',
        name: string,
        body: () => Promise<Record<string, unknown>>,
      ) =>
        ctx.resource({
          key: `${app}.downloadclient.${impl.toLowerCase()}`,
          kind: 'downloadclient',
          name,
          exists: (id) => a.providerExists('downloadclient', id),
          find: async () => {
            const port = impl === 'QBittorrent' ? 8090 : 8080;
            const found = (await a.providers('downloadclient')).find(
              (p) =>
                p.implementation === impl &&
                Number(fieldValue(p, 'port')) === port &&
                ['localhost', '127.0.0.1'].includes(String(fieldValue(p, 'host'))),
            );
            return found ? String(found.id) : null;
          },
          create: async () => a.createProvider('downloadclient', await body()),
        });
      if (ctx.plan.torrents) {
        await client('QBittorrent', 'EasyArr – qBittorrent', async () =>
          qbittorrentClientBody(app, 'EasyArr – qBittorrent', category),
        );
      }
      if (ctx.plan.usenet) {
        await client('Sabnzbd', 'EasyArr – SABnzbd', async () =>
          sabnzbdClientBody(app, 'EasyArr – SABnzbd', category, await key('sabnzbd')),
        );
      }

      // Hardlinks (instant moves, no double disk space) and completed download handling: on by
      // default, made sure of once; afterwards they're the user's.
      await ctx.once(`${app}.hardlinks`, () =>
        a.updateConfig('mediamanagement', (c) => {
          if (c['copyUsingHardlinks'] === true) return false;
          c['copyUsingHardlinks'] = true;
          return true;
        }),
      );
      await ctx.once(`${app}.completedDownloadHandling`, () =>
        a.updateConfig('downloadclient', (c) => {
          if (c['enableCompletedDownloadHandling'] === true) return false;
          c['enableCompletedDownloadHandling'] = true;
          return true;
        }),
      );
    },
  });

  // --- Prowlarr ---------------------------------------------------------------------------------

  const prowlarrApps: WiringStep = {
    id: 'prowlarr.apps',
    service: 'prowlarr',
    needs: (p) => ['prowlarr', ...libsFor(p).map((l) => l.app)],
    enabled: anyTorrentOrUsenet,
    async run(ctx) {
      const p = await servarr('prowlarr');
      for (const l of libsFor(ctx.plan)) {
        const impl = l.app.charAt(0).toUpperCase() + l.app.slice(1);
        const name = `EasyArr – ${impl}`;
        await ctx.resource({
          key: `prowlarr.application.${l.app}`,
          kind: 'application',
          name,
          exists: (id) => p.providerExists('applications', id),
          find: async () => {
            const found = (await p.providers('applications')).find(
              (a) =>
                a.implementation === impl &&
                String(fieldValue(a, 'baseUrl')).replace(/\/$/, '') === local(l.app),
            );
            return found ? String(found.id) : null;
          },
          create: async () =>
            p.createProvider(
              'applications',
              prowlarrApplicationBody(
                l.app,
                name,
                local(l.app),
                await key(l.app),
                local('prowlarr'),
              ),
            ),
        });
      }
    },
  };

  /** Usenet indexers from wizard step 6 (Prowlarr then hands them to Sonarr/Radarr/Lidarr). */
  const prowlarrUsenetIndexers: WiringStep = {
    id: 'prowlarr.indexers',
    service: 'prowlarr',
    needs: (p) => ['prowlarr', ...libsFor(p).map((l) => l.app)],
    enabled: (p) => p.usenet && p.usenetIndexers.length > 0,
    async run(ctx) {
      const p = await servarr('prowlarr');
      const sameUrl = (a: unknown, b: string) =>
        String(a ?? '')
          .replace(/\/+$/, '')
          .toLowerCase() === b.replace(/\/+$/, '').toLowerCase();
      for (const x of ctx.plan.usenetIndexers) {
        const name = `EasyArr – ${x.name}`;
        await ctx.resource({
          key: `prowlarr.indexer.${x.id}`,
          kind: 'indexer',
          name,
          exists: (id) => p.providerExists('indexer', id),
          find: async () => {
            const found = (await p.providers('indexer')).find(
              (i) => i.implementation === 'Newznab' && sameUrl(fieldValue(i, 'baseUrl'), x.url),
            );
            return found ? String(found.id) : null;
          },
          create: async () => {
            const apiKey = await deps.usenetSecret('indexers', x.id);
            if (!apiKey)
              throw new ServiceError(
                'prowlarr',
                'rejected',
                `no API key saved for ${x.name}`,
                400,
                ['usenet_secret_missing'],
              );
            const templates = await p.get('/indexer/schema', z.array(indexerTemplateSchema));
            const profiles = await p.get('/appprofile', z.array(z.looseObject({ id: z.number() })));
            // Saving makes Prowlarr test the indexer through the VPN; a wrong key or no VPN fails
            // here with Prowlarr's own message (shown in the checklist).
            return p.createProvider(
              'indexer',
              newznabIndexerBody(
                templates,
                usenetIndexerPreset(x.preset)?.name ?? null,
                { name, url: x.url, apiPath: x.apiPath, apiKey },
                profiles[0]?.id ?? 1,
              ),
            );
          },
        });
      }
    },
  };

  const prowlarrFlaresolverr: WiringStep = {
    id: 'prowlarr.flaresolverr',
    service: 'prowlarr',
    needs: ['prowlarr'],
    enabled: anyTorrentOrUsenet,
    async run(ctx) {
      const p = await servarr('prowlarr');
      const fields = [
        { name: 'host', value: 'http://localhost:8191/' },
        { name: 'requestTimeout', value: 60 },
      ];
      const base = {
        name: 'EasyArr – FlareSolverr',
        implementation: 'FlareSolverr',
        configContract: 'FlareSolverrSettings',
        fields,
      };
      await ctx.resource({
        key: 'prowlarr.indexerproxy.flaresolverr',
        kind: 'indexerproxy',
        name: base.name,
        exists: (id) => p.providerExists('indexerproxy', id),
        find: async () => {
          const found = (await p.providers('indexerproxy')).find(
            (x) => x.implementation === 'FlareSolverr',
          );
          return found ? String(found.id) : null;
        },
        create: async () => {
          // A proxy only works for indexers with its tag. Saving it with a tag makes Prowlarr test
          // it through the internet, which fails while the VPN is down — so save it untagged
          // (no test), then add the tag without the test (research: servarr.md §6.3).
          const tag = await p.tag('flaresolverr');
          const id = await p.createProvider('indexerproxy', { ...base, tags: [] });
          await p.put(`/indexerproxy/${id}`, { ...base, id: Number(id), tags: [tag] }, undefined, {
            forceSave: true,
          });
          return id;
        },
      });
    },
  };

  // --- Recyclarr (Sonarr/Radarr quality profiles) -------------------------------------------------

  const recyclarrSync: WiringStep = {
    id: 'recyclarr.sync',
    service: 'recyclarr',
    needs: (p) => [
      ...(p.libraries.tv ? (['sonarr'] as const) : []),
      ...(p.libraries.movies ? (['radarr'] as const) : []),
    ],
    enabled: (p) => p.libraries.tv || p.libraries.movies,
    async run(ctx) {
      const keys = await deps.keys();
      const content = recyclarrConfig(ctx.plan.quality, {
        ...(ctx.plan.libraries.tv && keys['sonarr']
          ? { sonarr: { baseUrl: local('sonarr'), apiKey: keys['sonarr'] } }
          : {}),
        ...(ctx.plan.libraries.movies && keys['radarr']
          ? { radarr: { baseUrl: local('radarr'), apiKey: keys['radarr'] } }
          : {}),
      });
      const changed = await deps.recyclarr.writeConfig(content);
      const name = qualityProfileName(ctx.plan.quality);
      const missing = async () => {
        for (const l of libsFor(ctx.plan).filter((x) => x.app !== 'lidarr')) {
          const a = await servarr(l.app);
          if (!(await a.qualityProfiles()).some((p) => p.name === name)) return true;
        }
        return false;
      };
      // Sync only when the preset changed or its profiles aren't there yet: every sync resets
      // EasyArr's profiles to the guide (D-048).
      if (changed || (await missing())) {
        await deps.recyclarr.sync(
          deps.recyclarrTimeoutMs !== undefined
            ? { timeoutMs: deps.recyclarrTimeoutMs, pollMs: 10 }
            : {},
        );
        ctx.changed();
      }
    },
  };

  // --- Media languages (Sonarr/Radarr custom formats, D-066) --------------------------------------

  const formatSchema = z.looseObject({
    id: z.number(),
    name: z.string(),
    specifications: z.array(z.unknown()),
  });
  const profileSchema = z.looseObject({
    id: z.number(),
    name: z.string(),
    formatItems: z.array(z.looseObject({ format: z.number(), score: z.number() })),
    language: z.looseObject({ id: z.number() }).optional(),
  });

  /**
   * Keeps EasyArr's language formats in line with the wizard's list and scores them in EasyArr's
   * quality profile; Radarr's profile language becomes "Any". Runs after recyclarr.sync (the profile
   * must exist; a sync puts the guide's "Original" back). The formats are EasyArr's own, like the
   * Recyclarr profile: they're kept matching the wizard (formats of languages no longer chosen
   * score 0) and come back if deleted, since downloads depend on them.
   */
  const arrLanguages = (app: 'sonarr' | 'radarr', lib: 'tv' | 'movies'): WiringStep => ({
    id: `${app}.languages`,
    service: app,
    needs: [app],
    enabled: (p) => p.libraries[lib],
    async run(ctx) {
      const a = await servarr(app);
      const desired = desiredLanguageFormats(ctx.plan.languages);
      let formats = await a.get('/customformat', z.array(formatSchema));
      for (const d of desired) {
        const body = {
          name: d.name,
          includeCustomFormatWhenRenaming: false,
          specifications: d.specifications,
        };
        const have = formats.find((f) => f.name === d.name);
        if (!have) {
          await a.post('/customformat', body);
          ctx.changed();
        } else if (!sameSpecifications(have.specifications, d.specifications)) {
          await a.put(`/customformat/${have.id}`, { ...body, id: have.id });
          ctx.changed();
        }
      }
      formats = await a.get('/customformat', z.array(formatSchema));
      const wanted = new Map(desired.map((d) => [d.name, d.score]));
      const scoreFor = new Map<number, number>();
      for (const f of formats) {
        if (f.name.startsWith(LANGUAGE_FORMAT_PREFIX)) scoreFor.set(f.id, wanted.get(f.name) ?? 0);
      }
      const name = qualityProfileName(ctx.plan.quality);
      const profile = (await a.get('/qualityprofile', z.array(profileSchema))).find(
        (p) => p.name === name,
      );
      if (!profile) {
        // Made by recyclarr.sync; if that failed, its error says why.
        throw new ServiceError(
          app,
          'invalid_response',
          `quality profile "${name}" not found (made by the Recyclarr step)`,
          undefined,
          ['The quality profile is made by the "Quality profiles" step; fix that one first.'],
        );
      }
      let dirty = false;
      const items = profile.formatItems.map((i) => {
        const score = scoreFor.get(i.format);
        if (score === undefined || score === i.score) return i;
        dirty = true;
        return { ...i, score };
      });
      for (const [format, score] of scoreFor) {
        if (!items.some((i) => i.format === format)) {
          items.push({ format, score, name: formats.find((f) => f.id === format)?.name ?? '' });
          dirty = true;
        }
      }
      const next: Record<string, unknown> = { ...profile, formatItems: items };
      if (app === 'radarr' && profile.language?.id !== RADARR_ANY_LANGUAGE.id) {
        next['language'] = RADARR_ANY_LANGUAGE;
        dirty = true;
      }
      if (dirty) {
        await a.put(`/qualityprofile/${profile.id}`, next);
        ctx.changed();
      }
    },
  });

  // --- Bazarr -----------------------------------------------------------------------------------

  const bazarrSetup: WiringStep = {
    id: 'bazarr.setup',
    service: 'bazarr',
    needs: (p) => [
      'bazarr',
      ...(p.libraries.tv ? (['sonarr'] as const) : []),
      ...(p.libraries.movies ? (['radarr'] as const) : []),
    ],
    enabled: (p) => p.libraries.tv || p.libraries.movies,
    async run(ctx) {
      const b = await bazarr();
      // The default profile must exist before Sonarr/Radarr are switched on (first sync assigns it).
      await ctx.once('bazarr.languageProfile', async () => {
        if ((await b.languageProfiles()).length > 0) return false; // never replace the user's
        // Subtitles in every real language the user chose, best first (not "Original").
        const subs = ctx.plan.languages.filter((l) => l !== 'original');
        const codes = subs.length > 0 ? subs : [ctx.plan.language];
        const names = new Intl.DisplayNames(['en'], { type: 'language' });
        const name = codes.map((c) => names.of(c) ?? c).join(', ');
        await b.saveSettings([
          ...codes.map((c): [string, string] => ['languages-enabled', c]),
          ['languages-profiles', JSON.stringify([languageProfile(1, name, codes)])],
        ]);
        return true;
      });
      await ctx.once('bazarr.connect', async () => {
        const profiles = await b.languageProfiles();
        const profileId = profiles[0]?.profileId;
        const fields: [string, string][] = [];
        if (profileId !== undefined) {
          fields.push(
            ['settings-general-serie_default_enabled', 'true'],
            ['settings-general-serie_default_profile', String(profileId)],
            ['settings-general-movie_default_enabled', 'true'],
            ['settings-general-movie_default_profile', String(profileId)],
          );
        }
        fields.push(
          ['settings-general-use_sonarr', String(ctx.plan.libraries.tv)],
          ['settings-general-use_radarr', String(ctx.plan.libraries.movies)],
        );
        await b.saveSettings(fields);
        return true;
      });
    },
  };

  // --- Jellyfin ---------------------------------------------------------------------------------

  /** EasyArr's Jellyfin API key; completes the first-run wizard with the user's account if needed. */
  const jellyfinKey = async (ctx: StepContext): Promise<string> => {
    const j = jellyfin();
    const stored = (await deps.keys())['jellyfin'];
    if (stored && (await j.keyWorks(stored))) return stored;
    const { username, password } = await deps.account();
    if (!(await j.publicInfo()).StartupWizardCompleted) {
      await j.completeStartup(username, password);
      ctx.changed();
    }
    let session: { token: string };
    try {
      session = await j.login(username, password);
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'auth') {
        throw new ServiceError(
          'jellyfin',
          'auth',
          'Jellyfin was already set up with a different account',
          401,
          ['jellyfin_other_account'],
        );
      }
      throw err;
    }
    const { key: apiKey, created } = await j.ensureApiKey(session.token);
    if (created) ctx.changed();
    await deps.saveKey('jellyfin', apiKey);
    return apiKey;
  };

  const jellyfinSetup: WiringStep = {
    id: 'jellyfin.setup',
    service: 'jellyfin',
    needs: ['jellyfin'],
    enabled: () => true,
    async run(ctx) {
      const apiKey = await jellyfinKey(ctx);
      const j = jellyfin();
      for (const l of libsFor(ctx.plan)) {
        const path = `/data/media/${l.category}`;
        await ctx.resource({
          key: `jellyfin.library.${l.category}`,
          kind: 'library',
          name: l.name,
          exists: async (id) => (await j.libraries(apiKey)).some((f) => f.ItemId === id),
          find: async () => (await j.libraryByPath(apiKey, path))?.ItemId ?? null,
          create: async () => {
            await j.addLibrary(apiKey, l.name, l.jellyfin, path, {
              language: ctx.plan.language,
              country: ctx.plan.country,
            });
            const made = await j.libraryByPath(apiKey, path);
            if (!made)
              throw new ServiceError(
                'jellyfin',
                'invalid_response',
                `library for ${path} not found after adding it`,
              );
            return made.ItemId;
          },
        });
      }
      // Preferred audio + subtitle language on the owner's account. Re-applied only when the
      // wizard's list changes, so a choice made in Jellyfin later stays.
      await ctx.once(`jellyfin.languages:${ctx.plan.languages.join(',')}`, async () => {
        const { username } = await deps.account();
        const user = await j.userByName(apiKey, username);
        if (!user) return false;
        const changed = await j.updateUserConfiguration(apiKey, user.Id, (c) =>
          applyPlaybackLanguages(c, ctx.plan.languages),
        );
        return changed;
      });
      if (ctx.plan.gpu) {
        await ctx.once('jellyfin.hardwareAcceleration', async () => {
          const gpu = await deps.gpu();
          if (!gpu) return false;
          const current = await j.encoding(apiKey);
          if (current.HardwareAccelerationType !== 'none') return false; // the user chose already
          await j.setEncoding(apiKey, {
            ...current,
            ...hardwareAcceleration(gpu.vendor, gpu.device),
          });
          return true;
        });
      }
    },
  };

  // --- Jellyseerr (request page) ------------------------------------------------------------------

  const seerrKey = async (ctx: StepContext): Promise<string> => {
    const s = seerr();
    const stored = (await deps.keys())['jellyseerr'];
    const pub = await s.publicSettings();
    if (stored && pub.mediaServerType !== MEDIA_SERVER_NOT_CONFIGURED && (await s.keyWorks(stored)))
      return stored;
    const { username, password } = await deps.account();
    const firstRun = pub.mediaServerType === MEDIA_SERVER_NOT_CONFIGURED;
    const cookie = await s.loginWithJellyfin(
      username,
      password,
      firstRun ? { hostname: containerName('jellyfin'), port: 8096 } : null,
    );
    if (firstRun) ctx.changed();
    const apiKey = await s.apiKey(cookie);
    await deps.saveKey('jellyseerr', apiKey);
    return apiKey;
  };

  const jellyseerrSetup: WiringStep = {
    id: 'jellyseerr.setup',
    service: 'jellyseerr',
    needs: (p) => [
      'jellyseerr',
      'jellyfin',
      ...(p.libraries.tv ? (['sonarr'] as const) : []),
      ...(p.libraries.movies ? (['radarr'] as const) : []),
    ],
    enabled: (p) => p.libraries.tv || p.libraries.movies,
    async run(ctx) {
      const apiKey = await seerrKey(ctx);
      const s = seerr();
      // Movies + shows libraries: enabled once each; a library the user switches off stays off.
      for (const lib of await s.syncLibraries(apiKey)) {
        await ctx.once(`jellyseerr.library.${lib.id}`, async () => {
          if (lib.enabled) return false;
          await s.enableLibrary(apiKey, lib.id);
          return true;
        });
      }
      const keys = await deps.keys();
      for (const l of libsFor(ctx.plan).filter((x) => x.app !== 'lidarr')) {
        const kind = l.app as 'sonarr' | 'radarr';
        const target = {
          hostname: containerName('vpn'),
          port: PORT[kind],
          apiKey: keys[kind] ?? '',
          baseUrl: URL_BASE[kind],
        };
        const externalUrl = `${publicUrl}${URL_BASE[kind]}`;
        await ctx.resource({
          key: `jellyseerr.${kind}`,
          kind: 'server',
          name: l.app === 'sonarr' ? 'Sonarr' : 'Radarr',
          exists: async (id) => (await s.list(apiKey, kind)).some((x) => String(x.id) === id),
          find: async () => {
            const found = (await s.list(apiKey, kind)).find(
              (x) => x.hostname === target.hostname && x.port === target.port,
            );
            return found ? String(found.id) : null;
          },
          create: async () => {
            const test = await s.test(apiKey, kind, target);
            const wanted = qualityProfileName(ctx.plan.quality);
            const profile =
              test.profiles.find((p) => p.name === wanted) ??
              test.profiles.find((p) => p.name === 'HD-1080p') ??
              test.profiles[0];
            const folder =
              test.rootFolders.find(
                (r) => r.path.replace(/\/$/, '') === `/data/media/${l.category}`,
              ) ?? test.rootFolders[0];
            if (!profile || !folder) {
              throw new ServiceError(
                'jellyseerr',
                'rejected',
                `${l.app} has no quality profile or root folder yet`,
              );
            }
            const common = {
              name: l.app === 'sonarr' ? 'Sonarr' : 'Radarr',
              ...target,
              useSsl: false,
              activeProfileId: profile.id,
              activeProfileName: profile.name,
              activeDirectory: folder.path,
              tags: [],
              is4k: false,
              isDefault: true,
              syncEnabled: true,
              preventSearch: false,
              tagRequests: false,
              externalUrl,
            };
            const body =
              kind === 'sonarr'
                ? {
                    ...common,
                    seriesType: 'standard',
                    animeSeriesType: 'anime',
                    animeTags: [],
                    enableSeasonFolders: true,
                    monitorNewItems: 'all',
                  }
                : { ...common, minimumAvailability: 'released' };
            return String(await s.add(apiKey, kind, body));
          },
        });
        // Without an external URL Seerr links to hostname:port — the container name, which no
        // browser can open (installs before v0.0.11). Filled in once; a URL the user set is kept.
        await ctx.once(`jellyseerr.${kind}.externalUrl`, async () => {
          const found = (await s.list(apiKey, kind)).find(
            (x) => x.hostname === target.hostname && x.port === target.port,
          );
          if (!found || found.externalUrl) return false;
          await s.update(apiKey, kind, found.id, { ...found, externalUrl });
          return true;
        });
      }
      await ctx.once('jellyseerr.initialize', async () => {
        if ((await s.publicSettings()).initialized) return false;
        await s.initialize(apiKey);
        return true;
      });
    },
  };

  // --- Cleanuparr -------------------------------------------------------------------------------

  const cleanuparrSetup: WiringStep = {
    id: 'cleanuparr.setup',
    service: 'cleanuparr',
    needs: (p) => ['cleanuparr', ...libsFor(p).map((l) => l.app)],
    enabled: anyTorrentOrUsenet,
    async run(ctx) {
      const c = cleanuparr();
      const keys = await deps.keys();
      let apiKey = keys['cleanuparr'];
      if (!apiKey || !(await c.keyWorks(apiKey))) {
        let password = keys['cleanuparr-password'];
        if (!password) {
          password = randomBytes(18).toString('base64url');
          await deps.saveKey('cleanuparr-password', password);
        }
        apiKey = (await c.setupCompleted())
          ? await c.apiKeyByLogin('easyarr', password)
          : await c.completeSetup('easyarr', password);
        await deps.saveKey('cleanuparr', apiKey);
        ctx.changed();
      }
      c.useKey(apiKey);
      await ctx.once('cleanuparr.trustLocal', () => c.trustLocalAddresses());
      const version: Record<Arr, number> = { sonarr: 4, radarr: 6, lidarr: 3 };
      for (const l of libsFor(ctx.plan)) {
        const type = l.app as CleanuparrArr;
        await ctx.resource({
          key: `cleanuparr.${type}`,
          kind: 'instance',
          name: `EasyArr – ${l.app}`,
          exists: async (id) => (await c.instances(type)).some((i) => i.id === id),
          find: async () =>
            (await c.instances(type)).find((i) => i.url.replace(/\/$/, '') === local(l.app))?.id ??
            null,
          create: async () =>
            c.addInstance(type, {
              enabled: true,
              name: `EasyArr – ${l.app}`,
              url: local(l.app),
              apiKey: await key(l.app),
              version: version[l.app],
              externalUrl: null,
            }),
        });
      }
      if (ctx.plan.torrents) {
        await ctx.resource({
          key: 'cleanuparr.downloadclient.qbittorrent',
          kind: 'downloadclient',
          name: 'EasyArr – qBittorrent',
          exists: async (id) => (await c.downloadClients()).some((d) => d.id === id),
          find: async () =>
            (await c.downloadClients()).find((d) => d.typeName === 'qBittorrent')?.id ?? null,
          create: () =>
            c.addDownloadClient({
              enabled: true,
              name: 'EasyArr – qBittorrent',
              typeName: 'qBittorrent',
              host: 'http://localhost:8090',
              urlBase: '',
              username: '',
              password: '',
              apiKey: null,
              externalUrl: null,
              downloadDirectorySource: null,
              downloadDirectoryTarget: null,
            }),
        });
        // Queue Cleaner (off in a fresh Cleanuparr, D-057): every 5 min a torrent stuck on
        // "downloading metadata", stalled without peers or errored earns a strike; at the limit
        // Cleanuparr removes it through Sonarr/Radarr with a blocklist entry and its Seeker
        // searches for another release. Only public torrents — private trackers have own rules.
        await ctx.once('cleanuparr.queueCleaner', async () => {
          const qc = await c.queueCleaner();
          if (qc.enabled) return false;
          const errored = (qc['errored'] ?? {}) as Record<string, unknown>;
          await c.setQueueCleaner({
            ...qc,
            enabled: true,
            cronExpression: '0 0/5 * * * ?',
            useAdvancedScheduling: false,
            // 3 strikes × 5 min ≈ 15 min without metadata.
            downloadingMetadataMaxStrikes: 3,
            errored: { ...errored, maxStrikes: 3, ignorePrivate: true },
          });
          return true;
        });
        await ctx.resource({
          key: 'cleanuparr.stallrule',
          kind: 'rule',
          name: STALL_RULE,
          exists: async (rid) => (await c.stallRules()).some((r) => r.id === rid),
          find: async () => (await c.stallRules()).find((r) => r.name === STALL_RULE)?.id ?? null,
          create: () =>
            c.addStallRule({
              name: STALL_RULE,
              enabled: true,
              // 6 strikes × 5 min ≈ 30 min with no progress; any progress resets the count.
              maxStrikes: 6,
              privacyType: 'Public',
              minCompletionPercentage: 0,
              maxCompletionPercentage: 100,
              resetStrikesOnProgress: true,
              deletePrivateTorrentsFromClient: false,
              changeCategory: false,
            }),
        });
      }
      // Proactive search: a request no indexer had a release for yet is searched again later
      // instead of staying "missing" forever (Sonarr/Radarr only search once, when it's added).
      await ctx.once('cleanuparr.seeker', async () => {
        const sk = await c.seeker();
        if (sk.proactiveSearchEnabled || sk.instances.length === 0) return false;
        await c.setSeeker({
          ...sk,
          searchEnabled: true,
          searchInterval: 5,
          proactiveSearchEnabled: true,
          instances: sk.instances.map((i) => ({
            ...i,
            enabled: true,
            monitoredOnly: true,
            minCycleTimeDays: 1,
          })),
        });
        return true;
      });
    },
  };

  const steps: WiringStep[] = [
    qbittorrentSetup,
    sabnzbdSetup,
    lidarrProfile,
    arrMedia('sonarr', 'tv', 'tv'),
    arrMedia('radarr', 'movies', 'movies'),
    arrMedia('lidarr', 'music', 'music'),
    prowlarrApps,
    prowlarrUsenetIndexers,
    prowlarrFlaresolverr,
    recyclarrSync,
    arrLanguages('sonarr', 'tv'),
    arrLanguages('radarr', 'movies'),
    bazarrSetup,
    jellyfinSetup,
    jellyseerrSetup,
    cleanuparrSetup,
  ];
  return { steps, health };
}
