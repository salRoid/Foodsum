#!/usr/bin/env node
// The generation brief, as DATA. `npm run missing` for a human; this for a tool.
//
// `missing` prints a console report and is the right thing when a person is
// about to generate a handful of images by hand. It is the wrong thing when
// the generating side is a script, a spreadsheet, or a model being handed a
// batch: it interleaves prose with prompts, it lists only what has NO image
// (so a second variant of an existing dish is unreachable), and its shape is
// free to change whenever the report reads better a different way.
//
// So this emits one machine-readable record per subject, from the SAME index
// and the SAME STYLE.md prefixes `missing` and `ingest` use. It is a
// projection, never a second source of truth — nothing here can disagree with
// what a consumer loads, because nothing here is restated.
//
//   npm run export                       JSON to stdout, everything missing
//   npm run export -- --all              include subjects that already have images
//   npm run export -- --csv              CSV instead (slug,kind,file,prompt,…)
//   npm run export -- --out brief.json   write to a file
//   npm run export -- --dishes|--meals   one queue only
//   npm run export -- --demand           order by how often it is really eaten
//   npm run export -- --limit 10         first N of each queue
//   npm run export -- --db               refresh portions from Health first
//   npm run export -- --dump             …from a droplet snapshot instead —
//                                        EVERY user's rows, which is what
//                                        should decide what gets generated.
//                                        Take one with
//                                        `cd ../Health && ./foodsum-dump.sh`
//
// EVERY RECORD CARRIES ITS OWN `prompt` AND ITS OWN `file`. That is the whole
// point: the consumer of this file never has to assemble either, so it cannot
// assemble them differently. `file` is the inbox filename `npm run ingest`
// will accept — an image saved under any other name is rejected by design,
// because a filename that can mint a slug is a catalogue that grows by typo.

import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  readStyle, promptFor, mealPromptFor, dishText, readJson,
  INDEX_JSON, PORTIONS_JSON, ROOT,
} from './lib/style.mjs';
import { dbUrl, query, isLive, FOOD_SQL, MEALS_SQL } from './lib/db.mjs';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMealFragments, resolveMealEntry } from '../src/resolve.ts';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const style = readStyle();
const idx = loadIndex(readJson(INDEX_JSON));
const portions = { ...(readJson(PORTIONS_JSON, { portions: {} }).portions ?? {}) };

// Portions are Health's fact, not ours — same read as `missing --db`, through
// the same matcher, so a Food row maps onto a slug by resolution and never by
// a second name-matching table.
if (isLive(argv)) {
  const url = dbUrl(argv);
  for (const name of query(url, FOOD_SQL)) {
    const m = name.match(/\(([^)]*)\)\s*$/);
    if (!m) continue;
    for (const f of resolveMealFragments(idx, name)) {
      if (f.dish) portions[f.dish.slug] = m[1].trim();
    }
  }
}

// Demand: how often a dish appears across the real meal rows. A MEAL carries
// its own `loggedTimes` instead, because a meal only earns a photograph when
// the whole string repeats — see src/meals.ts.
// With `--db`/`--dump` the rows are every row every user has logged; without
// one they are the 37-row test fixture, which is a snapshot taken to pin a
// test's pass criterion and is nobody's live data. `demandSource` ships in the
// export so a batch generated from it can always be traced to what it counted.
const demand = new Map();
const mealDemand = new Map();
let demandSource = 'test fixture (37 rows)';
{
  let rows;
  if (isLive(argv)) {
    const u = dbUrl(argv);
    rows = query(u, MEALS_SQL);
    demandSource = `${u} — ${rows.length} rows, every user`;
  } else {
    rows = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/real-meal-names.json'), 'utf8'));
  }
  for (const name of rows) {
    for (const f of resolveMealFragments(idx, name)) {
      if (f.dish) demand.set(f.dish.slug, (demand.get(f.dish.slug) ?? 0) + 1);
    }
    const hit = resolveMealEntry(idx, name);
    if (hit) mealDemand.set(hit.meal.slug, (mealDemand.get(hit.meal.slug) ?? 0) + 1);
  }
}

const wantAll = has('--all');
const keep = (e) => wantAll || e.variants === 0;

let dishes = has('--meals') ? [] : idx.raw.dishes.filter(keep).map((d) => ({
  kind: 'dish',
  slug: d.slug,
  name: d.name,
  category: d.category,
  portion: portions[d.slug] ?? null,
  fromHealthFoodTable: !!d.fromHealthFoodTable,
  loggedFragments: demand.get(d.slug) ?? 0,
  existingVariants: d.variants,
  file: `inbox/${d.slug}.png`,
  prompt: promptFor(style, dishText(d, portions)),
}));

let meals = has('--dishes') ? [] : (idx.raw.meals ?? []).filter(keep).map((m) => ({
  kind: 'meal',
  slug: m.slug,
  name: m.name,
  // Every component must be in the frame. A plate short one item is a picture
  // of a DIFFERENT meal, and unlike a dish miss it claims to show the whole row.
  mustShow: [...m.dishes, ...(m.unresolvedParts ?? [])],
  loggedTimes: isLive(argv) ? mealDemand.get(m.slug) ?? 0 : m.loggedTimes ?? 0,
  existingVariants: m.variants,
  file: `inbox/${m.slug}.png`,
  prompt: mealPromptFor(style, m.name),
}));

if (has('--demand')) {
  dishes.sort((a, b) => b.loggedFragments - a.loggedFragments || a.slug.localeCompare(b.slug));
  meals.sort((a, b) => b.loggedTimes - a.loggedTimes || a.slug.localeCompare(b.slug));
}
const limit = Number(val('--limit', 0));
if (limit > 0) { dishes = dishes.slice(0, limit); meals = meals.slice(0, limit); }

let out;
if (has('--csv')) {
  // CSV is for a spreadsheet or a shell loop, so it carries the flat fields
  // only — `mustShow` is joined with " · " rather than dropped, because a meal
  // record without its components is a prompt nobody can check the result of.
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [...dishes, ...meals].map((e) => [
    e.kind, e.slug, e.name, e.portion ?? (e.mustShow ? e.mustShow.join(' · ') : ''),
    e.existingVariants, e.loggedFragments ?? e.loggedTimes, e.file, e.prompt,
  ].map(q).join(','));
  out = ['kind,slug,name,portion_or_components,existing_variants,logged,file,prompt', ...rows].join('\n') + '\n';
} else {
  out = JSON.stringify({
    generatedAt: new Date().toISOString(),
    // WHERE THE ORDERING CAME FROM. A batch generated off this file is only as
    // representative as the rows it counted, and that fact must travel with it.
    demandSource,
    styleVersion: style.styleVersion,
    // Quoted verbatim from STYLE.md, never paraphrased — a paraphrased rule is
    // a changed rule, and these are the ones that reject an image.
    exclusions: { dish: style.exclusions, meal: style.mealExclusions },
    // What ingest will do to the file, so the generating side knows what
    // survives: it centre-crops to 4:3 and never upscales.
    ingest: {
      aspect: '4:3, centre crop',
      sizes: idx.raw.sizes,
      canonical: '400x300',
      minSourcePixels: '1200x900 to fill every rung; 400x300 is mandatory',
      note: 'Save into inbox/ under the exact `file` name, then run `npm run ingest`.',
    },
    counts: { dishes: dishes.length, meals: meals.length },
    dishes,
    meals,
  }, null, 2) + '\n';
}

const dest = val('--out', null);
if (dest) {
  writeFileSync(dest, out);
  console.error(`foodsum: wrote ${dishes.length} dish + ${meals.length} meal record(s) → ${dest}`);
} else {
  process.stdout.write(out);
}
