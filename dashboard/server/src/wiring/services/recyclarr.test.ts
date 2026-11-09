import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_SCORE_STEP } from '../languages.js';
import {
  LQ_SCORE,
  MIN_FORMAT_SCORE,
  qualityProfileName,
  recyclarrConfig,
  SEASON_PACK_SCORE,
  SEASON_PACK_TRASH_ID,
  SONARR_MIN_UPGRADE_SCORE,
} from './recyclarr.js';

const targets = {
  sonarr: { baseUrl: 'http://localhost:8989/apps/sonarr', apiKey: 's'.repeat(32) },
  radarr: { baseUrl: 'http://localhost:7878/apps/radarr', apiKey: 'r'.repeat(32) },
};

interface Instance {
  quality_profiles: {
    trash_id: string;
    name: string;
    min_format_score: number;
    min_upgrade_format_score?: number;
    qualities?: { name: string; qualities?: string[] }[];
    upgrade?: { allowed: boolean; until_quality: string };
  }[];
  quality_definition: { type: string; qualities: { name: string; min: number }[] };
  custom_formats: { trash_ids: string[]; assign_scores_to: { name: string; score: number }[] }[];
}

const load = (preset: 'best' | 'balanced' | 'small') => {
  const doc = parse(recyclarrConfig(preset, targets)) as {
    sonarr: { 'easyarr-sonarr': Instance };
    radarr: { 'easyarr-radarr': Instance };
  };
  return { sonarr: doc.sonarr['easyarr-sonarr'], radarr: doc.radarr['easyarr-radarr'] };
};

describe('recyclarrConfig', () => {
  it.each(['best', 'balanced', 'small'] as const)(
    '%s: LQ releases are a last resort, not blocked',
    (preset) => {
      const name = qualityProfileName(preset);
      for (const inst of Object.values(load(preset))) {
        const [profile] = inst.quality_profiles;
        expect(profile?.name).toBe(name);
        expect(profile?.min_format_score).toBe(MIN_FORMAT_SCORE);
        const [lq] = inst.custom_formats;
        expect(lq?.trash_ids).toHaveLength(2);
        expect(lq?.assign_scores_to).toEqual([{ name, score: LQ_SCORE }]);
      }
      // A release matching both LQ formats still passes; normal releases (score >= 0) rank higher.
      expect(2 * LQ_SCORE).toBeGreaterThanOrEqual(MIN_FORMAT_SCORE);
      expect(LQ_SCORE).toBeLessThan(0);
      // Closest other negative guide score is -51: it must stay below the minimum.
      expect(-51).toBeLessThan(MIN_FORMAT_SCORE);
    },
  );

  it.each(['best', 'balanced', 'small'] as const)(
    '%s: small LQ encodes pass the minimum size (YTS 1080p ≈ 16 MB/min)',
    (preset) => {
      for (const inst of Object.values(load(preset))) {
        const min = Object.fromEntries(
          inst.quality_definition.qualities.map((q) => [q.name, q.min]),
        );
        expect(min['Bluray-1080p']).toBe(10);
        expect(min['WEBRip-720p']).toBe(5);
        expect(min['WEBDL-2160p']).toBe(20);
        expect(Object.keys(min)).toHaveLength(9);
        expect(min['HDTV-1080p']).toBeUndefined();
      }
    },
  );

  it.each(['best', 'balanced', 'small'] as const)(
    '%s: shows prefer whole-season packs, without re-downloading episodes for them (D-067)',
    (preset) => {
      const { sonarr, radarr } = load(preset);
      const name = qualityProfileName(preset);
      expect(sonarr.custom_formats[1]).toEqual({
        trash_ids: [SEASON_PACK_TRASH_ID],
        assign_scores_to: [{ name, score: SEASON_PACK_SCORE }],
      });
      expect(sonarr.quality_profiles[0]?.min_upgrade_format_score).toBe(SONARR_MIN_UPGRADE_SCORE);
      // The language still decides first; a pack alone isn't worth an upgrade.
      expect(SEASON_PACK_SCORE).toBeLessThan(LANGUAGE_SCORE_STEP);
      expect(SONARR_MIN_UPGRADE_SCORE).toBeGreaterThan(SEASON_PACK_SCORE);
      expect(SONARR_MIN_UPGRADE_SCORE).toBeLessThanOrEqual(LANGUAGE_SCORE_STEP);
      // Movies have no packs.
      expect(radarr.custom_formats).toHaveLength(1);
      expect(radarr.quality_profiles[0]?.min_upgrade_format_score).toBeUndefined();
    },
  );

  it('uses the right LQ formats per app', () => {
    const { sonarr, radarr } = load('balanced');
    expect(radarr.custom_formats[0]?.trash_ids).toEqual([
      '90a6f9a284dff5103f6346090e6280c8',
      'e204b80c87be9497a8a6eaff48f72905',
    ]);
    expect(sonarr.custom_formats[0]?.trash_ids).toEqual([
      '9c11cd3f07101cdba90a2d81cf0e56b4',
      'e2315f990da2e2cbfc9fa5b7a6fcfe48',
    ]);
  });

  it('balanced movies: Bluray and WEB 1080p rank equally, so the score decides', () => {
    const [profile] = load('balanced').radarr.quality_profiles;
    expect(profile?.qualities).toEqual([
      { name: 'Bluray/WEB 1080p', qualities: ['Bluray-1080p', 'WEBDL-1080p', 'WEBRip-1080p'] },
      { name: 'Bluray-720p' },
    ]);
    expect(profile?.upgrade).toEqual({ allowed: true, until_quality: 'Bluray/WEB 1080p' });
  });

  it('keeps the guide quality list where one group per resolution already exists', () => {
    for (const preset of ['best', 'small'] as const) {
      const { sonarr, radarr } = load(preset);
      expect(radarr.quality_profiles[0]?.qualities).toBeUndefined();
      expect(sonarr.quality_profiles[0]?.qualities).toBeUndefined();
    }
    expect(load('balanced').sonarr.quality_profiles[0]?.qualities).toBeUndefined();
  });
});
