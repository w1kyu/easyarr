import { describe, expect, it } from 'vitest';
import en from '~/locales/en.json';
import { SERVICES } from '@easyarr/shared';

describe('en.json', () => {
  it('has a description for every service', () => {
    for (const s of SERVICES) expect(en).toHaveProperty([`service.${s.id}`]);
  });

  it('contains the keys the vendored umbrelOS components use', () => {
    for (const k of ['close', 'loading', 'clipboard.copied']) expect(en).toHaveProperty([k]);
  });
});
