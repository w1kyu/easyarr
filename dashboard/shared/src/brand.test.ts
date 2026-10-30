import { describe, expect, it } from 'vitest';
import { APP_ID, APP_NAME, STORE_ID, brand } from './brand.js';

describe('brand', () => {
  it('defines the app name once', () => {
    expect(APP_NAME).toBe('EasyArr');
    expect(brand.appName).toBe(APP_NAME);
  });

  it('prefixes the app id with the store id (Umbrel community store rule)', () => {
    expect(APP_ID.startsWith(`${STORE_ID}-`)).toBe(true);
  });

  it('uses https URLs', () => {
    for (const url of [brand.repoUrl, brand.docsUrl, brand.issuesUrl]) {
      expect(new URL(url).protocol).toBe('https:');
    }
  });
});
