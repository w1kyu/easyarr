import { VPN_PROVIDERS } from '@easyarr/shared';
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
          expect(docSlugFromHref(href, slug), `${slug} → ${href}`).not.toBeNull();
      }
    }
  });

  it('has the VPN guide of every provider, with a "Last checked" date', async () => {
    for (const p of VPN_PROVIDERS) expect(DOC_SLUGS, p.id).toContain(p.tutorial);
    expect(DOC_SLUGS).toContain('vpn/README');
    for (const slug of DOC_SLUGS.filter((s) => s.startsWith('vpn/'))) {
      expect(await loadDoc(slug), slug).toMatch(/_Last checked: \d{1,2} \w+ \d{4}_/);
    }
  });

  it('resolves links relative to the linking page', () => {
    expect(docSlugFromHref('README.md', 'vpn/pia')).toBe('vpn/README');
    expect(docSlugFromHref('../torrents-101.md', 'vpn/README')).toBe('torrents-101');
    expect(docSlugFromHref('vpn/protonvpn.md', 'how-it-works')).toBe('vpn/protonvpn');
    expect(docSlugFromHref('../../etc/passwd.md', 'vpn/README')).toBeNull();
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
