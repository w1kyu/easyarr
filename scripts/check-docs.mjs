#!/usr/bin/env node
// Checks the published Markdown (README, CONTRIBUTING, SECURITY, docs/) without the network (D-079):
// - every relative link points at a file that exists, and its #anchor at a heading in that file;
// - every image is a local file under docs/images/ (the in-app viewer shows nothing else);
// - docs/nav.json lists every user guide exactly once, and nothing that doesn't exist.
// External links are checked by the "Links" workflow (lychee), which may fail without blocking a release.
//   node scripts/check-docs.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, p);
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = [
  ...['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].map((f) => path.join(root, f)),
  ...walk(path.join(root, 'docs')),
];

/** Markdown without fenced code blocks and inline code (links in code aren't links). */
function prose(md) {
  return md.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
}

const anchorCache = new Map();
/** The ids GitHub (and the in-app viewer, via rehype-slug) gives the headings of a file. */
function anchorsOf(file) {
  if (!anchorCache.has(file)) {
    const slugger = new GithubSlugger();
    const ids = new Set();
    for (const [, text] of prose(readFileSync(file, 'utf8')).matchAll(
      /^#{1,6}\s+(.+?)\s*#*\s*$/gm,
    )) {
      // Headings render without Markdown syntax: drop links' targets, emphasis and code ticks.
      const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
      ids.add(slugger.slug(plain));
    }
    anchorCache.set(file, ids);
  }
  return anchorCache.get(file);
}

for (const file of files) {
  const md = prose(readFileSync(file, 'utf8'));
  for (const m of md.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const [, bang, href] = m;
    const line = md.slice(0, m.index).split('\n').length;
    const where = `${rel(file)}:${line}`;
    const external = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
    if (bang) {
      const target = path.resolve(path.dirname(file), href);
      if (external)
        problems.push(
          `${where}: image ${href} is external (the in-app viewer only shows docs/images/)`,
        );
      else if (!rel(target).startsWith(`docs${path.sep}images${path.sep}`))
        problems.push(`${where}: image ${href} must live in docs/images/`);
      else if (!existsSync(target)) problems.push(`${where}: image ${href} doesn't exist`);
      continue;
    }
    if (external) continue;
    const [pathPart, hash] = href.split('#');
    const target = pathPart ? path.resolve(path.dirname(file), decodeURIComponent(pathPart)) : file;
    if (!existsSync(target)) {
      problems.push(`${where}: link ${href} → ${rel(target)} doesn't exist`);
      continue;
    }
    if (hash && target.endsWith('.md') && !anchorsOf(target).has(hash.toLowerCase()))
      problems.push(`${where}: link ${href} → no heading "#${hash}" in ${rel(target)}`);
  }
}

// docs/nav.json ↔ the user guides on disk.
const nav = JSON.parse(readFileSync(path.join(root, 'docs/nav.json'), 'utf8'));
const listed = nav.sections.flatMap((s) => s.pages);
const userDocs = [
  ...readdirSync(path.join(root, 'docs'))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.slice(0, -3)),
  ...readdirSync(path.join(root, 'docs/vpn'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `vpn/${f.slice(0, -3)}`),
];
for (const slug of userDocs)
  if (!listed.includes(slug)) problems.push(`docs/nav.json: ${slug} is missing`);
for (const slug of listed) {
  if (!userDocs.includes(slug)) problems.push(`docs/nav.json: ${slug} doesn't exist`);
  if (listed.indexOf(slug) !== listed.lastIndexOf(slug))
    problems.push(`docs/nav.json: ${slug} is listed twice`);
}

if (problems.length > 0) {
  console.error([...new Set(problems)].join('\n'));
  console.error(`\n${new Set(problems).size} problem(s) in the docs.`);
  process.exit(1);
}
console.log(`Docs OK: ${files.length} files, links, anchors, images and nav.json checked.`);
