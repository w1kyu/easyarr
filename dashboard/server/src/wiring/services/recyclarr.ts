import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { z } from 'zod';
import { readFileIfExists, writeFileAtomic } from '../../fs-util.js';
import type { WiringPlan } from '../engine.js';
import { ServiceError } from '../http.js';

export type QualityPreset = WiringPlan['quality'];

/** Formats named "EasyArr – Language: …" (languages.ts); Recyclarr matches case-insensitively. */
export const LANGUAGE_FORMAT_PATTERN = '^EasyArr – Language: ';

/**
 * TRaSH guide profiles per preset (research 2026-10-31, TRaSH-Guides@d24f13c). WEB-centric, no
 * Remux, always with a 1080p fallback so nothing stays "missing" just because no 4K release exists.
 */
interface ProfileQuality {
  name: string;
  /** A group: these qualities rank equally, so the custom-format score decides between them. */
  qualities?: string[];
}

interface PresetProfile {
  trashId: string;
  /** Replaces the guide's quality list (highest first); the rest end up disabled. */
  qualities?: ProfileQuality[];
  /** Cutoff when `qualities` renames the guide's cutoff quality. */
  untilQuality?: string;
}

/**
 * LQ = release groups the guide calls low quality (YTS & co.) — on public torrent sites often the
 * only releases there are. The guide blocks them (-10000 against a minimum of 0); EasyArr keeps them
 * as a last resort instead (D-055): -10 each (a release can match both) and a minimum of -20, so an
 * LQ release is only taken when nothing else at that quality exists and later upgrades to a normal
 * one. No other guide score lies between -20 and 0 (the closest are -51 and -10000), so nothing else
 * gets through. Trash IDs at TRaSH-Guides@d24f13c `docs/json/{radarr,sonarr}/cf/lq*.json`.
 */
export const LQ_SCORE = -10;
export const MIN_FORMAT_SCORE = -20;
const LQ_TRASH_IDS = {
  radarr: ['90a6f9a284dff5103f6346090e6280c8', 'e204b80c87be9497a8a6eaff48f72905'],
  sonarr: ['9c11cd3f07101cdba90a2d81cf0e56b4', 'e2315f990da2e2cbfc9fa5b7a6fcfe48'],
} as const;

/**
 * Whole-season packs (owner's item 9, D-067). Sonarr already searches season by season when a show
 * is added or requested (Seerr starts a SeriesSearch → SeasonSearch per season) and prefers a pack
 * over single episodes, but only when quality and score are equal (DownloadDecisionComparer:
 * quality → score → protocol → episode count). The guide's "Season Pack" format (+10) is only a
 * tiebreak; +1000 lets a pack beat single episodes from a better release group, while staying under
 * one language step (2000, D-066) so the language still wins. Ongoing seasons have no packs, so
 * single episodes stay the fallback. An upgrade needs at least +1001, so a pack alone never
 * re-downloads episodes you already have (quality and language upgrades still happen).
 * TRaSH-Guides@d24f13c docs/json/sonarr/cf/season-pack.json (ReleaseTypeSpecification = 3).
 */
export const SEASON_PACK_TRASH_ID = '3bc5f395426614e155e585a2f056cdf1';
export const SEASON_PACK_SCORE = 1000;
export const SONARR_MIN_UPGRADE_SCORE = SEASON_PACK_SCORE + 1;

/**
 * Smallest size (MB per minute) Radarr/Sonarr accept per resolution, for WEB and Bluray releases
 * (D-063). The guide's minimums (e.g. Bluray-1080p 50.8, about 6 GB for a 2-hour movie) reject the
 * small LQ encodes that D-055 keeps as a last resort — a YTS 1080p is ~2 GB (≈16 MB/min), a 720p
 * ~1 GB (≈8 MB/min) — so those requests stayed "Missing" anyway. Lower floors let them through;
 * the LQ score still ranks them last and upgrades replace them. Anything under the floor (samples,
 * fakes) stays rejected. Recyclarr 8.8.1 `quality_definition.qualities` overrides (min only).
 */
export const MIN_SIZE_MB_PER_MIN = { '720p': 5, '1080p': 10, '2160p': 20 } as const;

function sizeOverrides(): { name: string; min: number }[] {
  return Object.entries(MIN_SIZE_MB_PER_MIN).flatMap(([res, min]) =>
    ['WEBDL', 'WEBRip', 'Bluray'].map((source) => ({ name: `${source}-${res}`, min })),
  );
}

const PRESETS: Record<
  QualityPreset,
  { label: string; sonarr: PresetProfile; radarr: PresetProfile; preferredRatio?: number }
> = {
  best: {
    label: 'Best quality',
    sonarr: { trashId: 'c4cadd6b35b95f62c3d47a408e53e2f7' }, // WEB-2160p (Combined)
    radarr: { trashId: '05fbf054ac8ad0303335026cc2632f1a' }, // WEBDL 2160p (Combined)
  },
  balanced: {
    label: 'Balanced',
    sonarr: { trashId: '72dae194fc92bf828f32cde7744e51a1' }, // WEB-1080p
    // HD Bluray + WEB. The guide ranks Bluray-1080p above the WEB 1080p group, and Radarr compares
    // quality before score — so an LQ "Bluray" (typical for YTS) would beat a good WEB-DL and never
    // be replaced by it. One 1080p group lets the score decide (the guide's tier scores already
    // put good Bluray groups above WEB ones). Bluray-720p stays the lower fallback.
    radarr: {
      trashId: 'd1d67249d3890e49bc12e275d989a7e9',
      qualities: [
        { name: 'Bluray/WEB 1080p', qualities: ['Bluray-1080p', 'WEBDL-1080p', 'WEBRip-1080p'] },
        { name: 'Bluray-720p' },
      ],
      untilQuality: 'Bluray/WEB 1080p',
    },
  },
  small: {
    label: 'Save space',
    sonarr: { trashId: '72dae194fc92bf828f32cde7744e51a1' }, // WEB-1080p
    radarr: { trashId: 'e8c5acb741363a0dbda67d3978f4912f' }, // WEB 1080p
    preferredRatio: 0.25,
  },
};

/** Name of the quality profile Recyclarr creates — never a name a user might already have. */
export function qualityProfileName(preset: QualityPreset): string {
  return `EasyArr (${PRESETS[preset].label})`;
}

export interface RecyclarrTarget {
  apiKey: string;
  /** e.g. http://localhost:8989/apps/sonarr — Recyclarr runs in the VPN namespace. */
  baseUrl: string;
}

/** recyclarr.yml for a preset (self-contained: Recyclarr 8 has no include templates any more). */
export function recyclarrConfig(
  preset: QualityPreset,
  targets: { sonarr?: RecyclarrTarget; radarr?: RecyclarrTarget },
): string {
  const p = PRESETS[preset];
  const name = qualityProfileName(preset);
  const instance = (t: RecyclarrTarget, app: 'sonarr' | 'radarr', profile: PresetProfile) => ({
    base_url: t.baseUrl,
    api_key: t.apiKey,
    delete_old_custom_formats: false,
    quality_definition: {
      type: app === 'sonarr' ? 'series' : 'movie',
      ...(p.preferredRatio !== undefined ? { preferred_ratio: p.preferredRatio } : {}),
      qualities: sizeOverrides(),
    },
    quality_profiles: [
      {
        trash_id: profile.trashId,
        name,
        // EasyArr's language formats are scored by the wiring (D-066), not by the guide.
        reset_unmatched_scores: { enabled: true, except_patterns: [LANGUAGE_FORMAT_PATTERN] },
        min_format_score: MIN_FORMAT_SCORE,
        ...(app === 'sonarr' ? { min_upgrade_format_score: SONARR_MIN_UPGRADE_SCORE } : {}),
        ...(profile.qualities
          ? {
              qualities: profile.qualities.map((q) =>
                q.qualities ? { name: q.name, qualities: q.qualities } : { name: q.name },
              ),
            }
          : {}),
        ...(profile.untilQuality
          ? { upgrade: { allowed: true, until_quality: profile.untilQuality } }
          : {}),
      },
    ],
    // An explicit score beats the guide's (Recyclarr sync-plan-phase.md "Score Resolution").
    custom_formats: [
      { trash_ids: [...LQ_TRASH_IDS[app]], assign_scores_to: [{ name, score: LQ_SCORE }] },
      ...(app === 'sonarr'
        ? [
            {
              trash_ids: [SEASON_PACK_TRASH_ID],
              assign_scores_to: [{ name, score: SEASON_PACK_SCORE }],
            },
          ]
        : []),
    ],
  });
  const doc: Record<string, unknown> = {};
  if (targets.sonarr)
    doc['sonarr'] = { 'easyarr-sonarr': instance(targets.sonarr, 'sonarr', p.sonarr) };
  if (targets.radarr)
    doc['radarr'] = { 'easyarr-radarr': instance(targets.radarr, 'radarr', p.radarr) };
  return [
    '# Written by EasyArr from your quality choice — changes here are replaced.',
    '# To customise a profile, clone "EasyArr (…)" in Sonarr/Radarr and edit the copy.',
    stringify(doc),
  ].join('\n');
}

const resultSchema = z.object({ exit: z.number(), at: z.string() });

/**
 * Talks to the Recyclarr container through its config folder (mounted in the dashboard): the
 * container's runner loop syncs when `.easyarr/sync-request` appears and writes
 * `.easyarr/last-sync.json` (D-048).
 */
export class RecyclarrFiles {
  constructor(private readonly dir: string) {}

  get configFile(): string {
    return path.join(this.dir, 'recyclarr.yml');
  }

  /** Writes the config if it changed → true. */
  async writeConfig(content: string): Promise<boolean> {
    if ((await readFileIfExists(this.configFile)) === content) return false;
    await writeFileAtomic(this.configFile, content, 0o600);
    return true;
  }

  async lastResult(): Promise<z.infer<typeof resultSchema> | null> {
    const raw = await readFileIfExists(path.join(this.dir, '.easyarr', 'last-sync.json'));
    if (raw === undefined) return null;
    try {
      const r = resultSchema.safeParse(JSON.parse(raw));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  }

  async logTail(lines = 20): Promise<string[]> {
    const raw = (await readFileIfExists(path.join(this.dir, '.easyarr', 'last-sync.log'))) ?? '';
    return raw.trimEnd().split('\n').slice(-lines);
  }

  /** Asks for a sync and waits for its result (TRaSH data is cloned first: can take minutes). */
  async sync(
    opts: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    const before = (await this.lastResult())?.at ?? null;
    await fs.mkdir(path.join(this.dir, '.easyarr'), { recursive: true });
    await writeFileAtomic(
      path.join(this.dir, '.easyarr', 'sync-request'),
      `${new Date().toISOString()}\n`,
      0o644,
    );
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
    while (Date.now() < deadline) {
      await sleep(opts.pollMs ?? 3000);
      const r = await this.lastResult();
      if (r && r.at !== before) {
        if (r.exit === 0) return;
        throw new ServiceError(
          'recyclarr',
          'rejected',
          `sync failed (exit ${r.exit})`,
          undefined,
          await this.logTail(5),
        );
      }
    }
    throw new ServiceError(
      'recyclarr',
      'unreachable',
      'no sync result (is the Recyclarr container running?)',
    );
  }
}
