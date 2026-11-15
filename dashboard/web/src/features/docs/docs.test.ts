import { VPN_PROVIDERS } from '@easyarr/shared';
import { describe, expect, it } from 'vitest';
import en from '~/locales/en.json';
import {
  DOC_SECTIONS,
  DOC_SLUGS,
  docAnchorFromHref,
  docAnchors,
  docImageUrl,
  docNeighbours,
  docSlugFromHref,
  docTitle,
  hasDoc,
  loadDoc,
  searchDocs,
  splitDocRef,
} from './docs';

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
        // External links (e.g. SECURITY.md on GitHub) open in a new tab and aren't checked here.
        if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && /\.md(#|$)/.test(href))
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

  it('orders the guides by docs/nav.json, with a title for every section', () => {
    const listed = DOC_SECTIONS.flatMap((sec) => sec.pages);
    expect(DOC_SLUGS.slice(0, listed.length)).toEqual(listed);
    expect(DOC_SLUGS.length).toBe(listed.length);
    expect(DOC_SLUGS[0]).toBe('getting-started');
    for (const sec of DOC_SECTIONS) expect(en, sec.id).toHaveProperty([`docs.section.${sec.id}`]);
    expect(docNeighbours(DOC_SLUGS[0] ?? '')).toEqual({ prev: null, next: DOC_SLUGS[1] });
    expect(docNeighbours('nope')).toEqual({ prev: null, next: null });
  });

  it('splits section links', () => {
    expect(splitDocRef('vpn/README#port-forwarding')).toEqual({
      slug: 'vpn/README',
      anchor: 'port-forwarding',
    });
    expect(splitDocRef('faq')).toEqual({ slug: 'faq', anchor: null });
    expect(docAnchorFromHref('getting-help.md#open-an-issue-on-github')).toBe(
      'open-an-issue-on-github',
    );
    expect(docAnchorFromHref('getting-help.md')).toBeNull();
  });

  it('only shows bundled images from docs/images/', () => {
    expect(docImageUrl('https://example.com/a.png')).toBeNull();
    expect(docImageUrl('/etc/a.png')).toBeNull();
    expect(docImageUrl('images/missing.png')).toBeNull();
    expect(docImageUrl('../../images/x.png', 'vpn/README')).toBeNull();
  });

  it('every image in the docs is bundled', async () => {
    for (const slug of DOC_SLUGS) {
      const md = (await loadDoc(slug)) ?? '';
      for (const [, src] of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g))
        expect(docImageUrl(src ?? '', slug), `${slug} → ${src}`).not.toBeNull();
    }
  });

  it('searches titles, headings and text, with GitHub anchors', () => {
    const docs = [
      {
        slug: 'vpn/README',
        markdown:
          '# VPN basics\n\nIntro text.\n\n## Port forwarding — what is it?\n\nIt helps torrents connect faster.\n\n```\nPort = 1\n```\n',
      },
      { slug: 'faq', markdown: '# FAQ\n\n## Is a VPN required?\n\nYes, for torrents.\n' },
      { slug: 'other', markdown: '# Other\n\nNothing about it.\n' },
    ];
    const hits = searchDocs(docs, 'port forwarding');
    expect(hits[0]).toMatchObject({
      slug: 'vpn/README',
      title: 'VPN basics',
      heading: 'Port forwarding — what is it?',
      anchor: 'port-forwarding--what-is-it',
    });
    // Every word must appear in the same section.
    expect(searchDocs(docs, 'torrents faster').map((h) => h.slug)).toEqual(['vpn/README']);
    // The page title counts for each of its sections.
    expect(searchDocs(docs, 'vpn torrents').map((h) => h.slug)).toEqual(['vpn/README', 'faq']);
    expect(searchDocs(docs, 'x')).toEqual([]);
    expect(searchDocs(docs, 'unicorn')).toEqual([]);
  });

  it('finds real guides', async () => {
    const docs = await Promise.all(
      DOC_SLUGS.map(async (slug) => ({ slug, markdown: (await loadDoc(slug)) ?? '' })),
    );
    expect(searchDocs(docs, 'kill switch').length).toBeGreaterThan(0);
    expect(searchDocs(docs, 'tailscale')[0]?.slug).toBe('remote-access-tailscale');
  });

  it('every "What\'s this?" link points at a guide and section that exist', async () => {
    const sources = import.meta.glob<string>(['../../**/*.tsx', '!../../**/*.test.*'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const refs = new Set<string>();
    for (const code of Object.values(sources))
      for (const [, ref] of code.matchAll(/slug="([^"]+)"/g)) if (ref) refs.add(ref);
    expect(refs.size).toBeGreaterThan(5);
    for (const ref of refs) {
      const { slug, anchor } = splitDocRef(ref);
      expect(hasDoc(slug), ref).toBe(true);
      if (anchor) expect(docAnchors((await loadDoc(slug)) ?? ''), ref).toContain(anchor);
    }
  });
});
