#!/usr/bin/env node
// Run the matcher over Health's REAL meal rows and report the numbers that
// matter. This is the pass criterion from the plan, made runnable:
//
//   (a) fragments resolved
//   (b) fragments correctly unresolved
//   (c) fragments resolved to the WRONG dish  ← must be zero
//
// (c) cannot be computed automatically — a wrong match is a human judgement —
// so this prints every resolution grouped by dish so it can be read down in
// one pass. That is the whole point: the list is short enough to check.
//
//   npm run report                    (37-row snapshot fixture)
//   npm run report -- --db            (live health_db_local, needs psql)

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadIndex } from '../src/index-schema.ts';
import { resolveMealFragments } from '../src/resolve.ts';
import { REFUSED } from '../src/dishes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function meals() {
  if (process.argv.includes('--db')) {
    const out = execFileSync('psql', [
      'postgresql://salroid@localhost/health_db_local',
      '-At', '-c', 'SELECT name FROM "Meal" ORDER BY "date", "slot";',
    ]).toString();
    return out.split('\n').filter((l) => l.trim());
  }
  return JSON.parse(readFileSync(join(ROOT, 'test/fixtures/real-meal-names.json'), 'utf8'));
}

const idx = loadIndex(JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8')));
const rows = meals();

let fragCount = 0;
const byTier = { exact: 0, alias: 0, unresolved: 0 };
const perDish = new Map();
const missCounts = new Map();
let fullyResolvedRows = 0;
let rowsWithAtLeastOne = 0;

for (const name of rows) {
  const frags = resolveMealFragments(idx, name);
  fragCount += frags.length;
  let any = false;
  for (const f of frags) {
    byTier[f.tier]++;
    if (f.dish) {
      any = true;
      if (!perDish.has(f.dish.slug)) perDish.set(f.dish.slug, new Set());
      perDish.get(f.dish.slug).add(`${f.text}  [${f.tier}]`);
    } else if (f.key) {
      missCounts.set(f.key, (missCounts.get(f.key) ?? 0) + 1);
    }
  }
  if (any) rowsWithAtLeastOne++;
  if (frags.every((f) => f.dish)) fullyResolvedRows++;
}

const resolved = byTier.exact + byTier.alias;
const pct = (n) => ((n / fragCount) * 100).toFixed(1) + '%';

console.log(`\n── foodsum · matcher report over ${rows.length} real Meal rows ──\n`);
console.log(`Fragments               ${fragCount}`);
console.log(`  tier 1 exact          ${byTier.exact}  (${pct(byTier.exact)})`);
console.log(`  tier 2 alias          ${byTier.alias}  (${pct(byTier.alias)})`);
console.log(`  tier 3 unresolved     ${byTier.unresolved}  (${pct(byTier.unresolved)})`);
console.log(`  RESOLVE RATE          ${pct(resolved)}\n`);
console.log(`Rows fully resolved     ${fullyResolvedRows} / ${rows.length}`);
console.log(`Rows with >= 1 image    ${rowsWithAtLeastOne} / ${rows.length}`);
console.log(`Distinct dishes hit     ${perDish.size} / ${idx.raw.dishes.length}\n`);

console.log('── every resolution, grouped by dish — read this down for wrong matches ──');
for (const slug of [...perDish.keys()].sort()) {
  console.log(`\n  ${slug}`);
  for (const t of [...perDish.get(slug)].sort()) console.log(`    ← ${t}`);
}

console.log('\n── UNRESOLVED (the corpus-growth queue) ──');
if (missCounts.size === 0) console.log('  none');
for (const [key, n] of [...missCounts.entries()].sort((a, b) => b[1] - a[1])) {
  const why = REFUSED[key];
  console.log(`  ${String(n).padStart(2)}×  "${key}"${why ? `   — REFUSED ON PURPOSE: ${why}` : ''}`);
}

const unlisted = [...perDish.keys()].length;
console.log(`\nDishes in the catalogue with no real-data hit: ${idx.raw.dishes.length - unlisted}`);
console.log(
  `  ${idx.raw.dishes
    .filter((d) => !perDish.has(d.slug))
    .map((d) => d.slug)
    .join(', ') || '(none)'}\n`,
);
