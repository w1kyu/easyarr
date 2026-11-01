import {
  DOWNLOAD_METHODS,
  VPN_FIELDS,
  VPN_PROBLEM_CODES,
  VPN_PROVIDERS,
  providerProtocols,
  evaluateSystem,
  SERVICES,
  WIZARD_STEP_IDS,
  LIBRARY_IDS,
  QUALITY_PRESETS,
  type SystemInfo,
  type UsenetTestResult,
} from '@easyarr/shared';

const USENET_TEST_REASONS: UsenetTestResult['reason'][] = [
  'ok',
  'auth',
  'unreachable',
  'timeout',
  'certificate',
  'noVpn',
  'serviceDown',
  'missingSecret',
  'failed',
];
/** Every wiring step id (dashboard/server/src/wiring/steps.ts) — the checklist shows each one. */
const WIRING_STEP_IDS = [
  'qbittorrent.setup',
  'sabnzbd.setup',
  'lidarr.profile',
  'sonarr.connect',
  'radarr.connect',
  'lidarr.connect',
  'prowlarr.apps',
  'prowlarr.indexers',
  'prowlarr.flaresolverr',
  'recyclarr.sync',
  'bazarr.setup',
  'jellyfin.setup',
  'jellyseerr.setup',
  'cleanuparr.setup',
];
import { describe, expect, it } from 'vitest';
import { STEP_UI } from '~/features/wizard/steps';
import en from '~/locales/en.json';

const keys = new Set(Object.keys(en));
const missing = (list: Iterable<string>) => [...list].filter((k) => !keys.has(k));

// Our own source (shared + web, not vendored code), to find every literal i18n key we use.
const sources = {
  ...import.meta.glob<string>(['../**/*.{ts,tsx}', '!../vendor/**', '!../**/*.test.*'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>(
    ['../../../shared/src/**/*.ts', '!../../../shared/src/**/*.test.ts'],
    {
      query: '?raw',
      import: 'default',
      eager: true,
    },
  ),
};
const PREFIXES =
  'wizard|system|account|download|password|docs|home|field|footer|status|stepper|vpn|usenet|indexers|library|finish|wiring';
const literal = new RegExp(`['"\`]((?:${PREFIXES})\\.[A-Za-z0-9_.]+)['"\`]`, 'g');

describe('en.json', () => {
  it('has a description for every service', () => {
    for (const s of SERVICES) expect(en).toHaveProperty([`service.${s.id}`]);
  });

  it('contains the keys the vendored umbrelOS components use', () => {
    for (const k of ['close', 'loading', 'clipboard.copied']) expect(en).toHaveProperty([k]);
  });

  it('has every literal key used in shared + web code (incl. validation messages)', () => {
    const used = new Set<string>();
    for (const code of Object.values(sources)) {
      for (const [, key] of code.matchAll(literal)) {
        // Template prefixes like `download.${id}` end in a dot — covered by the dynamic test below.
        if (key && !key.endsWith('.')) used.add(key);
      }
    }
    expect(used.size).toBeGreaterThan(40);
    expect(missing(used)).toEqual([]);
  });

  it('has every dynamic key (step UI, system check, password meter, download cards)', () => {
    const dynamic: string[] = [];
    for (const id of WIZARD_STEP_IDS) {
      const ui = STEP_UI[id];
      dynamic.push(ui.title, ui.intro, ...(ui.nextLabel ? [ui.nextLabel] : []));
    }
    const base: SystemInfo = {
      arch: 'x64',
      totalMemoryBytes: 16 * 1024 ** 3,
      disk: { freeBytes: 1e12, totalBytes: 2e12 },
      gpu: { kind: 'dri', devices: [] },
    };
    const variants: Partial<SystemInfo>[] = [
      {},
      { arch: 'riscv64', totalMemoryBytes: 2 * 1024 ** 3, disk: null },
      { totalMemoryBytes: 6 * 1024 ** 3, disk: { freeBytes: 1e9, totalBytes: 1e12 } },
      { gpu: { kind: 'none', devices: [] } },
      { gpu: { kind: 'nvidia', devices: [] } },
    ];
    for (const v of variants) {
      const r = evaluateSystem({ ...base, ...v });
      dynamic.push(`system.summary.${r.overall}`);
      for (const item of r.items) {
        dynamic.push(item.reason, `system.${item.id}.title`, `system.verdict.${item.verdict}`);
      }
    }
    for (let s = 0; s <= 4; s++) dynamic.push(`password.score.${s}`);
    for (const h of ['length', 'common', 'username', 'variety', 'pattern']) {
      dynamic.push(`password.hint.${h}`);
    }
    for (const m of DOWNLOAD_METHODS) dynamic.push(`download.${m}.title`, `download.${m}.summary`);
    for (const g of ['recommended', 'works', 'custom']) {
      dynamic.push(`vpn.group.${g}.title`, `vpn.group.${g}.body`);
    }
    for (const p of VPN_PROVIDERS)
      for (const proto of providerProtocols(p)) dynamic.push(`vpn.protocol.${proto}`);
    for (const id of Object.keys(VPN_FIELDS))
      dynamic.push(`vpn.field.${id}.label`, `vpn.field.${id}.hint`);
    for (const c of VPN_PROBLEM_CODES)
      dynamic.push(`vpn.problem.${c}.title`, `vpn.problem.${c}.fix`);
    for (const k of ['country', 'region', 'city']) dynamic.push(`vpn.location.${k}`);
    for (const r of USENET_TEST_REASONS) dynamic.push(`usenet.test.result.${r}`);
    for (const l of LIBRARY_IDS)
      dynamic.push(`library.libraries.${l}.title`, `library.libraries.${l}.body`);
    for (const q of QUALITY_PRESETS)
      for (const k of ['title', 'body', 'size']) dynamic.push(`library.quality.${q}.${k}`);
    for (const m of DOWNLOAD_METHODS) dynamic.push(`finish.summary.downloaders.${m}`);
    for (const k of ['request', 'download', 'watch'])
      dynamic.push(`finish.tour.${k}.title`, `finish.tour.${k}.body`);
    for (const k of ['request', 'watch']) dynamic.push(`finish.tour.${k}.open`);
    for (const s of ['pending', 'waiting', 'running', 'done', 'failed', 'skipped'])
      dynamic.push(`wiring.state.${s}`);
    for (const id of WIRING_STEP_IDS) dynamic.push(`wiring.step.${id}`);
    for (const c of ['deleted_by_user', 'recreated', 'adopted']) dynamic.push(`wiring.note.${c}`);
    for (const c of ['generic', 'network', 'wizard_incomplete', 'wiring_running', 'internal'])
      dynamic.push(`wiring.error.${c}`);
    expect(missing(dynamic)).toEqual([]);
  });
});
