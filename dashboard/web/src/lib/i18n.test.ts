import {
  DOWNLOAD_METHODS,
  evaluateSystem,
  SERVICES,
  WIZARD_STEP_IDS,
  type SystemInfo,
} from '@easyarr/shared';
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
const PREFIXES = 'wizard|system|account|download|password|docs|home|field|footer|status|stepper';
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
    expect(missing(dynamic)).toEqual([]);
  });
});
