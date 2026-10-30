/**
 * In-app help: the Markdown files in the repo's docs/ folder, bundled at build time (SPEC §16).
 * Only top-level pages are user docs; docs/dev/ and the folder README are for developers.
 */
const loaders = import.meta.glob<string>(
  ['../../../../../docs/*.md', '!../../../../../docs/README.md'],
  {
    query: '?raw',
    import: 'default',
  },
);

const bySlug = new Map<string, () => Promise<string>>();
for (const [file, load] of Object.entries(loaders)) {
  const slug = file.split('/').pop()?.replace(/\.md$/, '');
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
 * Turns a link inside a doc into another doc's slug, or null for external links.
 * Handles `usenet-101.md`, `./usenet-101.md` and `usenet-101.md#pros`.
 */
export function docSlugFromHref(href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) {
    return null;
  }
  const m = /^(?:\.\/)?([a-z0-9-]+)\.md(?:#.*)?$/i.exec(href);
  return m?.[1] && hasDoc(m[1]) ? m[1] : null;
}
