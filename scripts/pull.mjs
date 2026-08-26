#!/usr/bin/env node
// Bring the food data in from Health, and say what the corpus is now missing.
//
// Foodsum's catalogue is a source file, but two of the facts it needs belong to
// Health: the PORTION for a dish (its curated `Food` table) and the DEMAND for
// one (the `Meal` table — what has actually been eaten). Those were reachable
// only as a side effect of `missing --db`, against a connection string
// hardcoded in two scripts. This is the one command that goes and gets them.
//
//   npm run pull                    read, report, write NOTHING
//   npm run pull -- --write         write corpus/portions.json
//   npm run pull -- --url <pg url>  a tunnel, or another deployment
//   npm run pull -- --dump [file]   read a DROPLET snapshot instead of a
//                                   database — every user's rows, not one
//                                   developer's mirror. Take one with
//                                   `cd ../Health && ./foodsum-dump.sh`
//                                   (default file: data/health-dump.json)
//   npm run pull -- --fixture       ALSO refresh the test snapshot (read below)
//
// WHERE "THE SERVER" IS. Hosted Health's Postgres is loopback-only on the
// droplet by design, so there is no line from a laptop to it. The sanctioned
// route to production data is `cd Lumen && ./sync-db.sh sync Health`, which
// mirrors it into `health_db_local` — which is then what this reads. See
// scripts/lib/db.mjs for the full resolution order.
//
// ── IT DOES NOT TOUCH THE TEST FIXTURE WITHOUT BEING ASKED ──
// `test/fixtures/real-meal-names.json` is not a cache of the Meal table. It is
// the SNAPSHOT the recorded pass criterion is attached to — 85 fragments,
// 91.8% resolved, zero wrong matches — and `test/matcher.test.ts` asserts its
// length is 37. Refreshing it silently would move the baseline that number was
// established against, and the only symptom would be a test failing for a
// reason that has nothing to do with the matcher. So `--fixture` is explicit,
// and it prints the assertion that has to move with it.
//
// ── IT NEVER EDITS THE CATALOGUE ──
// A dish is added by a human writing a line in `src/dishes.ts`, on purpose: an
// alias is an exact string somebody would really type, and a script that mints
// them from whatever was logged is a matcher that learns to guess. So the
// growth queue below is a REPORT — the exact lines to write, and nothing that
// writes them.

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readJson, PORTIONS_JSON, ROOT } from './lib/style.mjs';
import { dbUrl, query } from './lib/db.mjs';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMealFragments, resolveMealEntry } from '../src/resolve.ts';
import { REFUSED } from '../src/dishes.ts';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

const FIXTURE = join(ROOT, 'test/fixtures/real-meal-names.json');
const url = dbUrl(argv);
const idx = loadIndex(readJson(join(ROOT, 'corpus/index.json')));

console.log(`\n── foodsum · pull ── ${url} ──\n`);

// ── portions, from Health's curated Food table ───────────────────────────────
// The row name carries its portion in parentheses, and `normalise` strips it —
// so resolving the row through THIS MATCHER is what maps a Food row onto a
// slug. No second name-matching table, which is the only way the two can
// never disagree about what "Mixed Vegetable Sabzi (1 katori, low oil)" is.
const existing = readJson(PORTIONS_JSON, { portions: {} });
const portions = { ...(existing.portions ?? {}) };
const added = [];
const changed = [];
let unmatchedFoodRows = 0;

for (const name of query(url, 'SELECT name FROM "Food" ORDER BY name;')) {
  const m = name.match(/\(([^)]*)\)\s*$/);
  if (!m) continue;
  const frags = resolveMealFragments(idx, name).filter((f) => f.dish);
  if (!frags.length) { unmatchedFoodRows++; continue; }
  for (const f of frags) {
    const was = portions[f.dish.slug];
    const now = m[1].trim();
    if (was === undefined) added.push(`${f.dish.slug} = ${now}`);
    else if (was !== now) changed.push(`${f.dish.slug}: ${was} → ${now}`);
    portions[f.dish.slug] = now;
  }
}

console.log(`Portions   ${Object.keys(portions).length} known · ${added.length} new · ${changed.length} changed · ${unmatchedFoodRows} Food row(s) matched no dish`);
for (const a of added) console.log(`  + ${a}`);
for (const c of changed) console.log(`  ~ ${c}`);

// ── demand and the growth queue, from the Meal table ────────────────────────
const rows = query(url, 'SELECT name FROM "Meal" ORDER BY "date", "slot";');
const dishDemand = new Map();
const unresolved = new Map();
const wholeStrings = new Map();
let mealHits = 0;

for (const name of rows) {
  wholeStrings.set(name, (wholeStrings.get(name) ?? 0) + 1);
  if (resolveMealEntry(idx, name)) mealHits++;
  for (const f of resolveMealFragments(idx, name)) {
    if (f.dish) dishDemand.set(f.dish.slug, (dishDemand.get(f.dish.slug) ?? 0) + 1);
    // Keyed on the NORMALISED key, not the raw text: "4 Marie Gold biscuits"
    // and "Marie Gold biscuits" are one fragment, and REFUSED is keyed the
    // same way — grouping on raw text would report a recorded refusal as a
    // brand-new candidate, which is the one mistake that gets a brand aliased.
    else unresolved.set(f.key, (unresolved.get(f.key) ?? 0) + 1);
  }
}

const totalFrags = [...dishDemand.values()].reduce((a, b) => a + b, 0)
  + [...unresolved.values()].reduce((a, b) => a + b, 0);
const resolvedFrags = [...dishDemand.values()].reduce((a, b) => a + b, 0);

console.log(`\nMeal rows  ${rows.length} · ${totalFrags} fragments · ${((resolvedFrags / totalFrags) * 100).toFixed(1)}% resolved · ${mealHits} row(s) hit a whole-meal entry`);

// A fragment that resolves to nothing is either a dish worth adding or a
// refusal worth keeping. The two are reported apart, because the second is a
// FEATURE and helpfully aliasing it is how the brand and category rules break.
const byCount = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
const refusedKeys = new Set(Object.keys(REFUSED));
const candidates = [...unresolved].filter(([t]) => !refusedKeys.has(t)).sort(byCount);
const refusals = [...unresolved].filter(([t]) => refusedKeys.has(t)).sort(byCount);

if (candidates.length) {
  console.log(`\n── dish candidates ── fragments nothing in src/dishes.ts claims\n`);
  for (const [text, n] of candidates) console.log(`  ${String(n).padStart(3)}×  ${text}`);
  console.log('\n  Add each as an entry in src/dishes.ts (slug is PERMANENT — it is the URL),');
  console.log('  or leave it unresolved on purpose and record it in REFUSED with the reason.');
} else {
  console.log('\n  No dish candidates — every fragment either resolves or is a recorded refusal.');
}

if (refusals.length) {
  console.log(`\n── recorded refusals, still occurring (leave them alone) ──`);
  for (const [text, n] of refusals) console.log(`  ${String(n).padStart(3)}×  ${text}  — ${REFUSED[text]}`);
}

// A whole string that repeats is a candidate for src/meals.ts — but only one
// that repeats, and only one composing at least two dishes we already know.
// A single dish typed often is a dish, not a meal (a second slug for one
// picture of one thing leaves nothing to say which URL to ask for).
const knownMealKeys = new Set((idx.raw.meals ?? []).map((m) => m.name));
const mealCandidates = [...wholeStrings]
  .filter(([name, n]) => n >= 2 && !knownMealKeys.has(name) && !resolveMealEntry(idx, name))
  .filter(([name]) => resolveMealFragments(idx, name).filter((f) => f.dish).length >= 2)
  .sort(byCount);

if (mealCandidates.length) {
  console.log(`\n── meal candidates ── whole strings logged 2+ times, composing 2+ known dishes\n`);
  for (const [name, n] of mealCandidates) console.log(`  ${String(n).padStart(3)}×  ${name}`);
  console.log('\n  Add to src/meals.ts only if a single photograph of that plate is worth having.');
} else {
  console.log('\n  No new meal candidates.');
}

// ── writes ──────────────────────────────────────────────────────────────────
if (has('--write')) {
  // `_comment` is preserved rather than regenerated: it carries the reasoning
  // for the file (why a dish may legitimately have no portion), which a
  // machine-written header would quietly drop on the first refresh.
  writeFileSync(PORTIONS_JSON, JSON.stringify({ ...existing, portions }, null, 2) + '\n');
  console.log(`\n✓ wrote ${PORTIONS_JSON}`);
} else {
  console.log('\n(dry run — nothing written. `--write` to update corpus/portions.json.)');
}

if (has('--fixture')) {
  const before = JSON.parse(readFileSync(FIXTURE, 'utf8')).length;
  writeFileSync(FIXTURE, JSON.stringify(rows, null, 2) + '\n');
  console.log(`✓ wrote ${FIXTURE} — ${before} → ${rows.length} rows`);
  if (before !== rows.length) {
    console.log(`\n  !! test/matcher.test.ts asserts REAL.length === ${before}. Update it to ${rows.length}`);
    console.log('     AND re-read `npm run report` by hand: the recorded "zero wrong matches"');
    console.log('     is a human judgement over a specific set of rows, and this is a new set.');
  }
}
console.log('');
