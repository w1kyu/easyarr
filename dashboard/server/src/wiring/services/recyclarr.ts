import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { z } from 'zod';
import { readFileIfExists, writeFileAtomic } from '../../fs-util.js';
import type { WiringPlan } from '../engine.js';
import { ServiceError } from '../http.js';

export type QualityPreset = WiringPlan['quality'];

/**
 * TRaSH guide profiles per preset (research 2026-10-31, TRaSH-Guides@d24f13c). WEB-centric, no
 * Remux, always with a 1080p fallback so nothing stays "missing" just because no 4K release exists.
 */
const PRESETS: Record<
  QualityPreset,
  { label: string; sonarr: string; radarr: string; preferredRatio?: number }
> = {
  best: {
    label: 'Best quality',
    sonarr: 'c4cadd6b35b95f62c3d47a408e53e2f7', // WEB-2160p (Combined)
    radarr: '05fbf054ac8ad0303335026cc2632f1a', // WEBDL 2160p (Combined)
  },
  balanced: {
    label: 'Balanced',
    sonarr: '72dae194fc92bf828f32cde7744e51a1', // WEB-1080p
    radarr: 'd1d67249d3890e49bc12e275d989a7e9', // HD Bluray + WEB
  },
  small: {
    label: 'Save space',
    sonarr: '72dae194fc92bf828f32cde7744e51a1', // WEB-1080p
    radarr: 'e8c5acb741363a0dbda67d3978f4912f', // WEB 1080p
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
  const instance = (t: RecyclarrTarget, type: 'series' | 'movie', trashId: string) => ({
    base_url: t.baseUrl,
    api_key: t.apiKey,
    delete_old_custom_formats: false,
    quality_definition: {
      type,
      ...(p.preferredRatio !== undefined ? { preferred_ratio: p.preferredRatio } : {}),
    },
    quality_profiles: [
      {
        trash_id: trashId,
        name: qualityProfileName(preset),
        reset_unmatched_scores: { enabled: true },
      },
    ],
  });
  const doc: Record<string, unknown> = {};
  if (targets.sonarr)
    doc['sonarr'] = { 'easyarr-sonarr': instance(targets.sonarr, 'series', p.sonarr) };
  if (targets.radarr)
    doc['radarr'] = { 'easyarr-radarr': instance(targets.radarr, 'movie', p.radarr) };
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
