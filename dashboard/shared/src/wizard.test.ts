import { describe, expect, it } from 'vitest';
import {
  accountInputSchema,
  canOpenWizardStep,
  nextWizardStep,
  parseWizardAnswers,
  visibleWizardSteps,
  WIZARD_STEP_IDS,
  WIZARD_STEPS,
  libraryAnswersSchema,
} from './wizard.js';
import { usenetInputSchema, USENET_INDEXER_PRESETS, USENET_PROVIDER_PRESETS } from './usenet.js';

const issues = (input: unknown) => {
  const r = accountInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('wizard registry', () => {
  it('lists steps 1–9 in order, each with a schema', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([...WIZARD_STEP_IDS]);
    expect(WIZARD_STEP_IDS).toEqual([
      'welcome',
      'system',
      'account',
      'download',
      'vpn',
      'usenet',
      'indexers',
      'library',
      'finish',
    ]);
  });

  it('resumes at the first unfinished visible step', () => {
    const first5 = ['welcome', 'system', 'account', 'download', 'vpn'];
    expect(nextWizardStep({}, [])).toBe('welcome');
    expect(nextWizardStep({}, ['welcome', 'system'])).toBe('account');
    expect(nextWizardStep({}, ['welcome', 'system', 'account', 'download'])).toBe('vpn');
    expect(nextWizardStep({}, first5)).toBe('library');
    expect(nextWizardStep({ download: { method: 'both' } }, first5)).toBe('usenet');
    expect(nextWizardStep({}, [...first5, 'library', 'finish'])).toBeNull();
    // Order of completion doesn't matter, gaps are found.
    expect(nextWizardStep({}, ['account', 'welcome'])).toBe('system');
  });

  it('never lets the user skip ahead', () => {
    expect(canOpenWizardStep('welcome', {}, [])).toBe(true);
    expect(canOpenWizardStep('account', {}, ['welcome'])).toBe(false);
    expect(canOpenWizardStep('account', {}, ['welcome', 'system'])).toBe(true);
    // Going back to a finished step is fine.
    expect(canOpenWizardStep('system', {}, ['welcome', 'system', 'account'])).toBe(true);
  });

  it('drops stored answers that no longer match their schema', () => {
    expect(
      parseWizardAnswers({
        welcome: { started: true },
        download: { method: 'carrier-pigeon' },
        account: { username: 'kevin', password: 'never-stored' },
        unknownStep: { x: 1 },
      }),
    ).toEqual({ welcome: { started: true }, account: { username: 'kevin' } });
  });

  it('step 6 only for Usenet, step 7 only for torrents', () => {
    const ids = (method?: 'torrents' | 'usenet' | 'both') =>
      visibleWizardSteps(method ? { download: { method } } : {}).slice(5);
    expect(ids()).toEqual(['library', 'finish']);
    expect(ids('torrents')).toEqual(['indexers', 'library', 'finish']);
    expect(ids('usenet')).toEqual(['usenet', 'library', 'finish']);
    expect(ids('both')).toEqual(['usenet', 'indexers', 'library', 'finish']);
  });

  it('step 8 needs a library; unknown languages are refused', () => {
    const lib = {
      libraries: { movies: true, tv: false, music: false },
      language: 'de',
      quality: 'small',
    };
    expect(libraryAnswersSchema.safeParse(lib).success).toBe(true);
    expect(libraryAnswersSchema.safeParse({ ...lib, language: 'xx' }).success).toBe(false);
    expect(
      libraryAnswersSchema.safeParse({
        ...lib,
        libraries: { movies: false, tv: false, music: false },
      }).error?.issues[0]?.message,
    ).toBe('wizard.error.libraryRequired');
  });

  it('step 8: audio + subtitle languages, ranked, 1–4 audio, 0–4 subtitles, no repeats (D-066)', () => {
    const lib = { libraries: { movies: true, tv: true, music: false }, quality: 'balanced' };
    const audio = [
      { code: 'de', required: true },
      { code: 'original', required: false },
    ];
    const subtitles = [{ code: 'de', required: true }];
    expect(libraryAnswersSchema.parse({ ...lib, audio, subtitles })).toEqual({
      ...lib,
      audio,
      subtitles,
      language: 'de',
    });
    // No subtitles: titles in the first real audio language, else English.
    expect(libraryAnswersSchema.parse({ ...lib, audio, subtitles: [] }).language).toBe('de');
    expect(
      libraryAnswersSchema.parse({
        ...lib,
        audio: [{ code: 'original', required: false }],
        subtitles: [],
      }).language,
    ).toBe('en');
    const msg = (a: unknown, s: unknown = []) =>
      libraryAnswersSchema.safeParse({ ...lib, audio: a, subtitles: s }).error?.issues[0]?.message;
    const l = (code: string) => ({ code, required: false });
    expect(msg([])).toBe('wizard.error.languageRequired');
    expect(msg(['de', 'en', 'fr', 'es', 'it'].map(l))).toBe('wizard.error.languageTooMany');
    expect(msg([l('de'), l('de')])).toBe('wizard.error.languageTwice');
    expect(msg([l('xx')])).toBe('wizard.error.languageRequired');
    // "Original" is an audio choice only.
    expect(msg([l('de')], [l('original')])).toBe('wizard.error.languageRequired');
  });

  it('answers saved before multi-language read as audio "Original, then X", subtitles "X"', () => {
    const old = {
      libraries: { movies: true, tv: true, music: true },
      language: 'de',
      quality: 'best',
    };
    expect(libraryAnswersSchema.parse(old)).toEqual({
      ...old,
      audio: [
        { code: 'original', required: false },
        { code: 'de', required: false },
      ],
      subtitles: [{ code: 'de', required: false }],
      language: 'de',
    });
    expect(parseWizardAnswers({ library: old }).library?.subtitles).toEqual([
      { code: 'de', required: false },
    ]);
  });
});

describe('account input', () => {
  it('accepts a normal username + good password, password optional when already set', () => {
    expect(issues({ username: 'kevin', password: 'summer-rain7' })).toEqual([]);
    expect(issues({ username: 'kevin.m_2' })).toEqual([]);
    expect(accountInputSchema.parse({ username: '  kevin ' }).username).toBe('kevin');
  });

  it('rejects usernames Jellyfin or URLs could choke on, with i18n keys as messages', () => {
    expect(issues({ username: '' })).toEqual([
      'username:wizard.error.usernameRequired',
      'username:wizard.error.usernameInvalid',
    ]);
    for (const bad of ['k', 'with space', '.dot', 'ümlaut', 'a'.repeat(33), 'semi;colon']) {
      expect(issues({ username: bad }), bad).toEqual(['username:wizard.error.usernameInvalid']);
    }
  });

  it('rejects short, long, weak and username-based passwords', () => {
    expect(issues({ username: 'kevin', password: 'short' })).toEqual([
      'password:wizard.error.passwordTooShort',
    ]);
    expect(issues({ username: 'kevin', password: 'x'.repeat(129) })).toContain(
      'password:wizard.error.passwordTooLong',
    );
    expect(issues({ username: 'kevin', password: 'Password123!' })).toEqual([
      'password:wizard.error.passwordWeak',
    ]);
    expect(issues({ username: 'kevin', password: 'kevin-rocks-99' })).toEqual([
      'password:wizard.error.passwordWeak',
    ]);
  });
});

describe('usenet input', () => {
  const server = {
    id: 's-1',
    preset: null,
    host: 'news.example.com',
    port: 563,
    ssl: true,
    username: 'me',
    connections: 20,
  };
  const indexer = { id: 'i-1', preset: null, name: 'Mine', url: 'https://nzb.example' };
  const msgs = (input: unknown) => {
    const r = usenetInputSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
  };

  it('accepts a provider + indexer; the API path defaults to /api', () => {
    const r = usenetInputSchema.parse({ servers: [server], indexers: [indexer] });
    expect(r.indexers[0]?.apiPath).toBe('/api');
  });

  it('explains wrong hosts, ports, connections and addresses', () => {
    expect(
      msgs({
        servers: [{ ...server, host: 'https://news.example.com/', port: 70000, connections: 0 }],
        indexers: [{ ...indexer, url: 'ftp://x' }],
      }),
    ).toEqual([
      'servers.0.host:wizard.error.usenetHostInvalid',
      'servers.0.port:wizard.error.usenetPortInvalid',
      'servers.0.connections:wizard.error.usenetConnectionsInvalid',
      'indexers.0.url:wizard.error.indexerUrlInvalid',
    ]);
    expect(msgs({ servers: [], indexers: [] })).toEqual([
      'servers:wizard.error.usenetServerRequired',
      'indexers:wizard.error.usenetIndexerRequired',
    ]);
  });

  it('presets have unique ids, valid hosts and https indexer addresses', () => {
    for (const list of [USENET_PROVIDER_PRESETS, USENET_INDEXER_PRESETS]) {
      expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    }
    for (const p of USENET_PROVIDER_PRESETS) {
      expect(
        msgs({
          servers: [{ ...server, host: p.host, port: p.port, connections: p.connections }],
          indexers: [indexer],
        }),
        p.id,
      ).toEqual([]);
      expect(p.source).toMatch(/^https:\/\//);
    }
    for (const p of USENET_INDEXER_PRESETS) expect(p.url).toMatch(/^https:\/\/[^/]+$/);
  });
});
