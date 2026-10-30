#!/usr/bin/env node
// Licensing guard for vendored umbrelOS code (SPEC §14.1):
//  1. every file in a vendor/umbrel/ folder is listed in its PROVENANCE.md,
//  2. every listed file exists,
//  3. the folder has the upstream LICENSE,
//  4. no file outside vendor/ claims to be copied from umbrelOS.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'data']);
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(path.join(root, 'dashboard'));
const vendorRoots = [
  ...new Set(
    files
      .filter((f) => f.includes('/vendor/umbrel/'))
      .map((f) => f.slice(0, f.indexOf('/vendor/umbrel/') + '/vendor/umbrel'.length)),
  ),
];

for (const vroot of vendorRoots) {
  const rel = path.relative(root, vroot);
  const provFile = path.join(vroot, 'PROVENANCE.md');
  if (!existsSync(path.join(vroot, 'LICENSE.md')))
    problems.push(`${rel}: missing LICENSE.md (upstream license, verbatim)`);
  if (!existsSync(provFile)) {
    problems.push(`${rel}: missing PROVENANCE.md`);
    continue;
  }
  const listed = new Set(
    [...readFileSync(provFile, 'utf8').matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]),
  );
  const actual = files
    .filter((f) => f.startsWith(vroot + '/'))
    .map((f) => path.relative(vroot, f))
    .filter((f) => f !== 'PROVENANCE.md' && f !== 'LICENSE.md');
  for (const f of actual)
    if (!listed.has(f)) problems.push(`${rel}/${f}: not listed in PROVENANCE.md`);
  for (const f of listed)
    if (!actual.includes(f)) problems.push(`${rel}/PROVENANCE.md lists ${f}, which does not exist`);
}

for (const f of files) {
  if (f.includes('/vendor/')) continue;
  if (!/\.(ts|tsx|css|js|mjs)$/.test(f)) continue;
  if (readFileSync(f, 'utf8').includes('originally from getumbrel/umbrel')) {
    problems.push(
      `${path.relative(root, f)}: umbrelOS-derived code must live in a vendor/umbrel/ folder`,
    );
  }
}

if (problems.length) {
  console.error('Vendored code check failed:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Vendored code check passed (${vendorRoots.length} vendor folder(s)).`);
