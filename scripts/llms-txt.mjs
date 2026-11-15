#!/usr/bin/env node
// Builds llms.txt: every user doc in one file, for AI assistants (SPEC §13, §16).
// The "Get help with AI" prompt links to it (LLMS_TXT_URL in dashboard/shared/src/brand.ts).
//   node scripts/llms-txt.mjs          write llms.txt
//   node scripts/llms-txt.mjs --check  fail when llms.txt is out of date (pnpm lint, CI)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(root, 'docs');
const out = path.join(root, 'llms.txt');
const BLOB = 'https://github.com/w1kyu/easyarr/blob/main';

// Reading order: the big picture first, then setup topics, then VPN guides, then help.
const FIRST = ['how-it-works', 'system-requirements', 'torrents-101', 'usenet-101', 'indexers'];
const LAST = ['troubleshooting', 'getting-help'];

function userDocs() {
  const top = readdirSync(docsDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.slice(0, -3));
  const vpn = readdirSync(path.join(docsDir, 'vpn'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `vpn/${f.slice(0, -3)}`)
    .sort((a, b) => (a === 'vpn/README' ? -1 : b === 'vpn/README' ? 1 : a.localeCompare(b)));
  const rank = (s) =>
    FIRST.includes(s) ? FIRST.indexOf(s) : LAST.includes(s) ? 1000 + LAST.indexOf(s) : 100;
  const middle = top.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const before = middle.filter((s) => rank(s) < 1000);
  const after = middle.filter((s) => rank(s) >= 1000);
  return [...before, ...vpn, ...after];
}

/** Relative links → absolute GitHub links (the file is read outside the repo). */
function absolutize(md, slug) {
  const dir = path.posix.dirname(`docs/${slug}.md`);
  return md.replace(/\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/gi, (_m, href) => {
    const [file, hash] = href.split('#');
    const target = path.posix.normalize(path.posix.join(dir, file));
    return `](${BLOB}/${target}${hash ? `#${hash}` : ''})`;
  });
}

function build() {
  const parts = [
    '# EasyArr',
    '',
    '> EasyArr is a free, open-source app for umbrelOS (a home server operating system). It bundles',
    '> a media automation stack — Jellyfin (watch), Jellyseerr (request), Sonarr/Radarr/Lidarr',
    '> (TV, movies, music), Prowlarr (search sites), qBittorrent and/or SABnzbd (downloads), Bazarr',
    '> (subtitles), Recyclarr, Unpackerr, Cleanuparr and FlareSolverr — behind a VPN with a kill',
    '> switch (Gluetun), and connects everything automatically through a setup wizard and a dashboard.',
    '',
    'Notes for AI assistants helping an EasyArr user:',
    '- Users are usually beginners. Answer step by step in plain words.',
    '- EasyArr is meant to be used from its dashboard only. Avoid terminal commands unless there is',
    '  no other way; prefer EasyArr settings ("Settings → …", "Repair connections").',
    '- The apps run as containers of one Umbrel app (w1kyu-easyarr). Their web UIs open from the',
    '  EasyArr dashboard (http://umbrel.local:39000, apps under /apps/<name>/); Jellyfin is on port',
    '  39096, Jellyseerr on 39055.',
    "- Text like [REDACTED:password] in a user's message was hidden on purpose by EasyArr.",
    `- Source code and issues: https://github.com/w1kyu/easyarr`,
    '',
    'This file contains every user guide, generated from docs/ by scripts/llms-txt.mjs.',
    '',
  ];
  for (const slug of userDocs()) {
    const md = readFileSync(path.join(docsDir, `${slug}.md`), 'utf8').trim();
    parts.push('---', '', `<!-- source: ${BLOB}/docs/${slug}.md -->`, '', absolutize(md, slug), '');
  }
  return `${parts.join('\n').trimEnd()}\n`;
}

const text = build();
if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current !== text) {
    console.error('llms.txt is out of date. Run: node scripts/llms-txt.mjs');
    process.exit(1);
  }
  console.log('llms.txt is up to date.');
} else {
  writeFileSync(out, text);
  console.log(`wrote llms.txt (${text.length} characters)`);
}
