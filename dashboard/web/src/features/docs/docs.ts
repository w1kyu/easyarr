/**
 * In-app help: the Markdown files in the repo's docs/ folder, bundled at build time (SPEC §16).
 * User docs are the top-level pages and docs/vpn/ (slug `vpn/<name>`); docs/dev/ and the top-level
 * README are for developers.
 */
const loaders = import.meta.glob<string>(
  ['../../../../../docs/*.md', '../../../../../docs/vpn/*.md', '!../../../../../docs/README.md'],
  { query: '?raw', import: 'default' },
);

const bySlug = new Map<string, () => Promise<string>>();
for (const [file, load] of Object.entries(loaders)) {
  const slug = file.replace(/^.*\/docs\//, '').replace(/\.md$/, '');
  if (slug) bySlug.set(slug, load);
}

export const DOC_SLUGS = [...bySlug.keys()].sort();

export function hasDoc(slug: string): boolean {
  return bySlug.has(slug);
}

export async function loadDoc(slug: string): Promise<string | null> {
  const load = bySlug.get(slug);
  return load ? load() : null;
}

/** First "# " heading, used as the page title. */
export function docTitle(markdown: string): string | null {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
}

/**
 * Turns a link inside a doc into another doc's slug, or null for external links. Relative to the
 * linking page's folder: `usenet-101.md`, `./vpn/protonvpn.md`, `../torrents-101.md#pros`.
 */
export function docSlugFromHref(href: string, fromSlug = ''): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) {
    return null;
  }
  const target = href.replace(/#.*$/, '');
  if (!/\.md$/i.test(target)) return null;
  const parts = fromSlug.includes('/') ? fromSlug.split('/').slice(0, -1) : [];
  for (const seg of target.replace(/\.md$/i, '').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (/^[A-Za-z0-9-]+$/.test(seg)) parts.push(seg);
    else return null;
  }
  const slug = parts.join('/');
  return hasDoc(slug) ? slug : null;
}
