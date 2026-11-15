import GithubSlugger from 'github-slugger';
import nav from '../../../../../docs/nav.json';

/**
 * In-app help: the Markdown files in the repo's docs/ folder, bundled at build time (SPEC §16).
 * User docs are the top-level pages and docs/vpn/ (slug `vpn/<name>`); docs/dev/ and the top-level
 * README are for developers. Their order and sections come from docs/nav.json (D-077).
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

export function hasDoc(slug: string): boolean {
  return bySlug.has(slug);
}

export interface DocSection {
  /** i18n key `docs.section.<id>` */
  id: string;
  pages: string[];
}

export const DOC_SECTIONS: readonly DocSection[] = nav.sections.map((s) => ({
  id: s.id,
  pages: s.pages.filter(hasDoc),
}));

/** Every guide in reading order: listed ones first, then any a nav.json edit forgot (alphabetical). */
export const DOC_SLUGS: readonly string[] = (() => {
  const listed = DOC_SECTIONS.flatMap((s) => s.pages);
  return [...listed, ...[...bySlug.keys()].filter((s) => !listed.includes(s)).sort()];
})();

/** The guides before and after this one in reading order. */
export function docNeighbours(slug: string): { prev: string | null; next: string | null } {
  const i = DOC_SLUGS.indexOf(slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: DOC_SLUGS[i - 1] ?? null, next: DOC_SLUGS[i + 1] ?? null };
}

export async function loadDoc(slug: string): Promise<string | null> {
  const load = bySlug.get(slug);
  return load ? load() : null;
}

/** First "# " heading, used as the page title. */
export function docTitle(markdown: string): string | null {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
}

/** "vpn/README#port-forwarding" → slug + anchor (for "What's this?" deep links). */
export function splitDocRef(ref: string): { slug: string; anchor: string | null } {
  const i = ref.indexOf('#');
  return i < 0
    ? { slug: ref, anchor: null }
    : { slug: ref.slice(0, i), anchor: ref.slice(i + 1) || null };
}

/** The folder parts of a slug ("vpn/pia" → ["vpn"]). */
function folderOf(fromSlug: string): string[] {
  return fromSlug.includes('/') ? fromSlug.split('/').slice(0, -1) : [];
}

/** Resolves `a/../b` against a folder; null if it climbs out of docs/ or has odd characters. */
function resolveIn(folder: string[], target: string, segment: RegExp): string | null {
  const parts = [...folder];
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (segment.test(seg)) parts.push(seg);
    else return null;
  }
  return parts.join('/');
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/**
 * Turns a link inside a doc into another doc's slug, or null for external links. Relative to the
 * linking page's folder: `usenet-101.md`, `./vpn/protonvpn.md`, `../torrents-101.md#pros`.
 */
export function docSlugFromHref(href: string, fromSlug = ''): string | null {
  if (isExternal(href) || href.startsWith('#')) return null;
  const target = href.replace(/#.*$/, '');
  if (!/\.md$/i.test(target)) return null;
  const slug = resolveIn(folderOf(fromSlug), target.replace(/\.md$/i, ''), /^[A-Za-z0-9-]+$/);
  return slug !== null && hasDoc(slug) ? slug : null;
}

/** The `#anchor` of a link, if any. */
export function docAnchorFromHref(href: string): string | null {
  const i = href.indexOf('#');
  return i < 0 ? null : decodeURIComponent(href.slice(i + 1)) || null;
}

// Screenshots and diagrams in docs/images/, bundled as files (the CSP only allows our own images).
const images = import.meta.glob<string>('../../../../../docs/images/**/*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const imageByPath = new Map<string, string>();
for (const [file, url] of Object.entries(images))
  imageByPath.set(file.replace(/^.*\/docs\//, ''), url);

/** URL of a doc's local image (`images/x.png`, `../images/x.png`), or null for anything else. */
export function docImageUrl(src: string, fromSlug = ''): string | null {
  if (isExternal(src) || src.startsWith('/')) return null;
  const path = resolveIn(folderOf(fromSlug), src.replace(/[?#].*$/, ''), /^[A-Za-z0-9._-]+$/);
  return path === null ? null : (imageByPath.get(path) ?? null);
}

// --- search -----------------------------------------------------------------------------------

export interface DocHit {
  slug: string;
  title: string;
  /** Heading of the section the words were found in (null = the page's intro). */
  heading: string | null;
  anchor: string | null;
  snippet: string;
}

interface DocPart {
  heading: string | null;
  anchor: string | null;
  text: string;
}

/** Markdown → plain text that reads like the rendered page. */
function plain(md: string): string {
  return md
    .replace(/^(```|~~~).*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/^\s*[-*+>|]+\s?/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/[*_`|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The page split at its headings, with the anchors rehype-slug gives them. */
function partsOf(markdown: string): DocPart[] {
  const slugger = new GithubSlugger();
  const parts: DocPart[] = [{ heading: null, anchor: null, text: '' }];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    const m = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const heading = plain(m[2] ?? '');
      const anchor = slugger.slug(heading);
      // The page title (# …) stays part of the intro.
      if (m[1] === '#') continue;
      parts.push({ heading, anchor, text: '' });
    } else {
      const last = parts.at(-1);
      if (last) last.text += `${line}\n`;
    }
  }
  return parts.map((p) => ({ ...p, text: plain(p.text) }));
}

/** The anchors of a page's sections (GitHub's ids, the same rehype-slug gives the headings). */
export function docAnchors(markdown: string): string[] {
  return partsOf(markdown).flatMap((p) => (p.anchor ? [p.anchor] : []));
}

function snippetAround(text: string, word: string, width = 160): string {
  const i = text.toLowerCase().indexOf(word);
  if (i < 0) return text.length > width ? `${text.slice(0, width).trimEnd()}…` : text;
  const start = Math.max(0, i - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function count(haystack: string, word: string): number {
  let n = 0;
  for (let i = haystack.indexOf(word); i >= 0; i = haystack.indexOf(word, i + word.length)) n++;
  return n;
}

/**
 * Full-text search over the guides: every word of the query must appear in a section (its page
 * title, heading or text). Title and heading matches rank higher. At most 3 hits per page.
 */
export function searchDocs(
  docs: readonly { slug: string; markdown: string }[],
  query: string,
  limit = 20,
): DocHit[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const scored: (DocHit & { score: number })[] = [];
  for (const { slug, markdown } of docs) {
    const title = docTitle(markdown) ?? slug;
    const t = title.toLowerCase();
    const hits: (DocHit & { score: number })[] = [];
    for (const part of partsOf(markdown)) {
      const h = (part.heading ?? '').toLowerCase();
      const body = part.text.toLowerCase();
      if (!words.every((w) => t.includes(w) || h.includes(w) || body.includes(w))) continue;
      const score = words.reduce(
        (sum, w) =>
          sum + (t.includes(w) ? 6 : 0) + (h.includes(w) ? 4 : 0) + Math.min(count(body, w), 5),
        0,
      );
      const first = words.find((w) => body.includes(w)) ?? words[0] ?? '';
      hits.push({
        slug,
        title,
        heading: part.heading,
        anchor: part.anchor,
        snippet: snippetAround(part.text, first),
        score,
      });
    }
    scored.push(...hits.sort((a, b) => b.score - a.score).slice(0, 3));
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ slug, title, heading, anchor, snippet }) => ({
      slug,
      title,
      heading,
      anchor,
      snippet,
    }));
}
