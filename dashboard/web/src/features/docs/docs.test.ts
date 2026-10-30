import { describe, expect, it } from 'vitest';
import { DOC_SLUGS, docSlugFromHref, docTitle, hasDoc, loadDoc } from './docs';

describe('in-app docs', () => {
  it('bundles the user docs, not the folder README or developer docs', () => {
    for (const slug of ['torrents-101', 'usenet-101', 'family-accounts', 'system-requirements']) {
      expect(DOC_SLUGS).toContain(slug);
    }
    expect(DOC_SLUGS).not.toContain('README');
    expect(DOC_SLUGS).not.toContain('development');
  });

  it('every doc has a title and only links to docs that exist', async () => {
    for (const slug of DOC_SLUGS) {
      const md = (await loadDoc(slug)) ?? '';
      expect(docTitle(md), slug).toBeTruthy();
      for (const [, href] of md.matchAll(/\]\(([^)]+)\)/g)) {
        if (href && /\.md(#|$)/.test(href))
          expect(docSlugFromHref(href), `${slug} → ${href}`).not.toBeNull();
      }
    }
  });

  it('maps relative .md links to slugs and leaves external links alone', () => {
    expect(docSlugFromHref('usenet-101.md')).toBe('usenet-101');
    expect(docSlugFromHref('./torrents-101.md#pros')).toBe('torrents-101');
    expect(docSlugFromHref('missing.md')).toBeNull();
    expect(docSlugFromHref('https://example.com/a.md')).toBeNull();
    expect(docSlugFromHref('//evil.example/x.md')).toBeNull();
    expect(docSlugFromHref('#section')).toBeNull();
    expect(hasDoc('../../etc/passwd')).toBe(false);
  });
});
