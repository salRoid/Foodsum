#!/usr/bin/env node
// The work queue: which dishes have no picture, and the exact prompt for each.
//
// Sibling of `report-real-meals.mjs` — that one reports which NAMES resolve,
// this one reports which SLUGS have no image. Both read the same committed
// `corpus/index.json` rather than re-deriving the catalogue, so neither can
// disagree with what a consumer actually loads.
//
//   npm run missing                 every dish with no image, with its prompt
//   npm run missing -- --db         refresh portions from health_db_local first
//   npm run missing -- --demand     order by how often the dish appears in the
//                                   37 real Meal rows — generate what is eaten
//   npm run missing -- --prompts    prompts only, one per line, nothing else
//   npm run missing -- --limit 5    first N
//
// The prompt is assembled from STYLE.md's fixed prefix plus the dish name and
// its portion. NEVER hand-edit a prompt: STYLE.md is explicit that rewriting
// the prefix per dish is precisely how a set drifts.

import { execFileSync } from 'node:child_process';

import { readStyle, promptFor, dishText, readJson, INDEX_JSON, PORTIONS_JSON } from './lib/style.mjs';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMealFragments } from '../src/resolve.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/style.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const style = readStyle();
const idx = loadIndex(readJson(INDEX_JSON));

// ── portions ────────────────────────────────────────────────────────────────
const portions = { ...(readJson(PORTIONS_JSON, { portions: {} }).portions ?? {}) };

if (has('--db')) {
  // Health's `Food` table is a curated controlled vocabulary — its names carry
  // the portion in parentheses, which `normalise` strips, so resolving the row
  // name through THIS MATCHER is what maps a Food row onto a slug. No second
  // mapping table, no name-matching of our own.
  const out = execFileSync('psql', [
    'postgresql://salroid@localhost/health_db_local',
    '-At', '-c', 'SELECT name FROM "Food" ORDER BY name;',
  ]).toString();
  let hits = 0;
  for (const name of out.split('\n').filter((l) => l.trim())) {
    const m = name.match(/\(([^)]*)\)\s*$/);
    if (!m) continue;
    const frags = resolveMealFragments(idx, name);
    for (const f of frags) {
      if (f.dish) { portions[f.dish.slug] = m[1].trim(); hits++; }
    }
  }
  console.error(`(--db: read Health's Food table, matched ${hits} portion(s))\n`);
}

// ── demand, from the real meal rows ─────────────────────────────────────────
const demand = new Map();
if (has('--demand')) {
  const rows = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/real-meal-names.json'), 'utf8'));
  for (const name of rows) {
    for (const f of resolveMealFragments(idx, name)) {
      if (f.dish) demand.set(f.dish.slug, (demand.get(f.dish.slug) ?? 0) + 1);
    }
  }
}

// ── the queue ───────────────────────────────────────────────────────────────
let missing = idx.raw.dishes.filter((d) => d.variants === 0);
if (has('--demand')) {
  missing.sort((a, b) => (demand.get(b.slug) ?? 0) - (demand.get(a.slug) ?? 0) || a.slug.localeCompare(b.slug));
}
const limit = Number(val('--limit', 0));
if (limit > 0) missing = missing.slice(0, limit);

if (has('--prompts')) {
  for (const d of missing) console.log(promptFor(style, dishText(d, portions)));
  process.exit(0);
}

const total = idx.raw.dishes.length;
const have = total - idx.raw.dishes.filter((d) => d.variants === 0).length;

console.log(`\n── foodsum · images still to generate ── style ${style.styleVersion} ──\n`);
console.log(`Catalogue      ${total} dishes`);
console.log(`With an image  ${have}`);
console.log(`MISSING        ${total - have}${limit > 0 ? `  (showing ${missing.length})` : ''}\n`);

if (missing.length === 0) {
  console.log('  Nothing to generate. Every dish in the catalogue has at least one image.\n');
  process.exit(0);
}

console.log('For each: generate ONE image, look at it, and drop it in `inbox/<slug>.png`.');
console.log('Then run `npm run ingest`. Read AGENTS.md and STYLE.md first.\n');

for (const d of missing) {
  const n = demand.get(d.slug);
  const tags = [
    d.fromHealthFoodTable ? "Health Food row" : null,
    portions[d.slug] ? null : 'NO PORTION KNOWN',
    n ? `${n}× in real logs` : null,
  ].filter(Boolean);
  console.log(`\n  ${d.slug}${tags.length ? `   [${tags.join(' · ')}]` : ''}`);
  console.log(`  inbox/${d.slug}.png`);
  console.log(`  ${promptFor(style, dishText(d, portions))}`);
}

console.log('\n── hard exclusions (STYLE.md, verbatim — reject the image if any apply) ──');
for (const e of style.exclusions) console.log(`  · ${e}`);
console.log('\nA wrong dish is worse than no image. When in doubt, reject.\n');
