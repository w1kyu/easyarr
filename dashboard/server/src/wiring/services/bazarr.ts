import { z } from 'zod';
import { HttpClient } from '../http.js';

/**
 * Bazarr 1.6.2 API (base_url /apps/bazarr is seeded by init, so even direct calls carry it).
 * Settings are posted form-encoded, like Bazarr's own web UI does.
 */
const profileSchema = z.looseObject({ profileId: z.number(), name: z.string() });

export class BazarrClient {
  private readonly http: HttpClient;

  constructor(baseUrl: string, apiKey: string, fetchImpl?: typeof fetch) {
    this.http = new HttpClient({
      service: 'bazarr',
      baseUrl,
      headers: { 'x-api-key': apiKey },
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  /** No auth needed: the readiness probe. */
  async ready(): Promise<void> {
    await this.http.json('/api/system/ping', z.object({ status: z.literal('OK') }));
  }

  languageProfiles() {
    return this.http.json('/api/system/languages/profiles', z.array(profileSchema));
  }

  /**
   * POST /api/system/settings. `languages-profiles` replaces the WHOLE list (missing ones are
   * deleted), so callers only send it when no profile exists yet.
   */
  async saveSettings(fields: [string, string][]): Promise<void> {
    await this.http.json('/api/system/settings', undefined, {
      method: 'POST',
      body: new URLSearchParams(fields),
    });
  }
}

/** Bazarr language profile with one language (booleans are strings in Bazarr's API). */
export function singleLanguageProfile(profileId: number, name: string, language: string) {
  return {
    profileId,
    name,
    cutoff: null,
    items: [
      {
        id: 1,
        language,
        audio_exclude: 'False',
        audio_only_include: 'False',
        hi: 'False',
        forced: 'False',
      },
    ],
    mustContain: [],
    mustNotContain: [],
    originalFormat: false,
    tag: null,
  };
}

/**
 * Subtitle sources that need no account (Bazarr enables none by default). A free OpenSubtitles.com
 * account gives better results; the docs explain how to add one.
 */
export const DEFAULT_SUBTITLE_PROVIDERS = [
  'subtitlecat',
  'yifysubtitles',
  'gestdown',
  'tvsubtitles',
];
