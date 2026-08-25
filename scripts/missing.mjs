#!/usr/bin/env node
// The work queue: which dishes have no picture, and the exact prompt for each.
//
// Sibling of `report-real-meals.mjs` — that one reports which NAMES resolve,
// this one reports which SLUGS have no image. Both read the same committed
// `corpus/index.json` rather than re-deriving the catalogue, so neither can
// disagree with what a consumer actually loads.
//
//   npm run missing                 every dish AND meal with no image, + prompt
//   npm run missing -- --db         refresh portions from health_db_local first
//   npm run missing -- --demand     order by how often the dish appears in the
//                                   37 real Meal rows — generate what is eaten
//   npm run missing -- --prompts    prompts only, one per line, nothing else
//   npm run missing -- --limit 5    first N of each queue
//   npm run missing -- --dishes     dishes only
//   npm run missing -- --meals      meals only
//
// TWO QUEUES, ONE COMMAND. Dishes are the base of the corpus and meals are the
// handful of whole plates that repeat often enough to deserve one photograph
// (see src/meals.ts). They are listed separately because they are generated
// from DIFFERENT prompts — STYLE.md carries a dish prefix and a meal prefix,
// and a meal shot with the dish prompt is one bowl of something.
//
// The prompt is assembled from STYLE.md's fixed prefix plus the dish name and
// its portion (or, for a meal, its name verbatim). NEVER hand-edit a prompt:
// STYLE.md is explicit that rewriting the prefix per subject is precisely how a
// set drifts.

import { execFileSync } from 'node:child_process';

import {
  readStyle, promptFor, mealPromptFor, dishText, readJson, INDEX_JSON, PORTIONS_JSON,
} from './lib/style.mjs';
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

// ── the two queues ──────────────────────────────────────────────────────────
const allDishes = idx.raw.dishes;
const allMeals = idx.raw.meals ?? [];
const WANT_DISHES = !has('--meals');
const WANT_MEALS = !has('--dishes');

let missingDishes = WANT_DISHES ? allDishes.filter((d) => d.variants === 0) : [];
let missingMeals = WANT_MEALS ? allMeals.filter((m) => m.variants === 0) : [];

if (has('--demand')) {
  missingDishes.sort((a, b) => (demand.get(b.slug) ?? 0) - (demand.get(a.slug) ?? 0) || a.slug.localeCompare(b.slug));
  // A meal carries its own demand — `loggedTimes`, the number of times that
  // exact string appears in the real rows. It is not derived from fragments,
  // because a meal is only worth photographing when the WHOLE string repeats.
  missingMeals.sort((a, b) => (b.loggedTimes ?? 0) - (a.loggedTimes ?? 0) || a.slug.localeCompare(b.slug));
}
const limit = Number(val('--limit', 0));
if (limit > 0) {
  missingDishes = missingDishes.slice(0, limit);
  missingMeals = missingMeals.slice(0, limit);
}

if (has('--prompts')) {
  for (const d of missingDishes) console.log(promptFor(style, dishText(d, portions)));
  for (const m of missingMeals) console.log(mealPromptFor(style, m.name));
  process.exit(0);
}

const haveDishes = allDishes.filter((d) => d.variants > 0).length;
const haveMeals = allMeals.filter((m) => m.variants > 0).length;

console.log(`\n── foodsum · images still to generate ── style ${style.styleVersion} ──\n`);
console.log(`Dishes  ${allDishes.length} in the catalogue · ${haveDishes} with an image · MISSING ${allDishes.length - haveDishes}`);
console.log(`Meals   ${allMeals.length} in the catalogue · ${haveMeals} with an image · MISSING ${allMeals.length - haveMeals}\n`);

if (missingDishes.length === 0 && missingMeals.length === 0) {
  console.log('  Nothing to generate in the selected queue(s).\n');
  process.exit(0);
}

console.log('For each: generate ONE image, look at it, and drop it in `inbox/<slug>.png`.');
console.log('Then run `npm run ingest`. Read AGENTS.md and STYLE.md first.');
console.log('Dish and meal prompts are DIFFERENT prefixes. Copy the one printed under the entry.');

if (missingDishes.length) {
  console.log(`\n\n══ DISHES ══ (${missingDishes.length}) — one dish, one vessel\n`);
  for (const d of missingDishes) {
    const n = demand.get(d.slug);
    const tags = [
      d.fromHealthFoodTable ? 'Health Food row' : null,
      portions[d.slug] ? null : 'NO PORTION KNOWN',
      n ? `${n}× in real logs` : null,
    ].filter(Boolean);
    console.log(`\n  ${d.slug}${tags.length ? `   [${tags.join(' · ')}]` : ''}`);
    console.log(`  inbox/${d.slug}.png`);
    console.log(`  ${promptFor(style, dishText(d, portions))}`);
  }

  console.log('\n── hard exclusions · DISHES (STYLE.md, verbatim — reject if any apply) ──');
  for (const e of style.exclusions) console.log(`  · ${e}`);
}

if (missingMeals.length) {
  console.log(`\n\n══ MEALS ══ (${missingMeals.length}) — a composed plate, several components\n`);
  for (const m of missingMeals) {
    const tags = [
      m.loggedTimes ? `logged ${m.loggedTimes}×` : null,
      `${m.dishes.length} known dish${m.dishes.length === 1 ? '' : 'es'}`,
    ].filter(Boolean);
    console.log(`\n  ${m.slug}   [${tags.join(' · ')}]`);
    console.log(`  inbox/${m.slug}.png`);
    // Every component must be IN THE FRAME. A missing one makes the picture an
    // image of a different meal, and it claims to show the whole row.
    console.log(`  must show: ${[...m.dishes, ...(m.unresolvedParts ?? [])].join(' · ')}`);
    console.log(`  ${mealPromptFor(style, m.name)}`);
  }

  console.log('\n── hard exclusions · MEALS (STYLE.md, verbatim — reject if any apply) ──');
  for (const e of style.mealExclusions) console.log(`  · ${e}`);
  console.log('  · a missing component — a plate short one item is a picture of a DIFFERENT meal');
}

console.log('\nA wrong dish is worse than no image. A wrong MEAL is worse still — it');
console.log('misrepresents the whole row rather than a third of it. When in doubt, reject.\n');
