#!/usr/bin/env node
// Grow the catalogue — the one step a generating agent could not do for itself.
//
//   npm run add -- dish <slug> "Name" --category vegetable --alias "aloo gobi"
//   npm run add -- meal <slug> "Name" --alias "dal + roti + salad"
//   npm run add -- --from batch.json        many at once (see the shape below)
//   npm run add -- --dry                    validate and print, write nothing
//
// ── WHY THIS EXISTS ──
// `ingest` refuses to let a FILENAME mint a slug, and that rule is right: a
// slug is permanent because it is the URL, and a corpus that grows by typo
// ends up with `greek-yoghurt` and `greek-yogurt` both forever. But the rule
// was enforced by making the catalogue hand-edited TypeScript, which is a
// different and much stronger claim — that a human must type it. This script
// keeps the guarantee and drops the typing: every entry is still a committed
// source change in `src/dishes.ts` / `src/meals.ts`, reviewable in one diff,
// and every one is validated BEFORE it is written.
//
// ── WHAT IT REFUSES ──
//   · a slug that is not url-safe kebab-case
//   · a slug already claimed by a dish OR a meal — they share one namespace,
//     because they share one `corpus/images/<slug>/` tree
//   · an alias whose normalised key is already claimed anywhere, which is the
//     duplicate `loadIndex` throws on — caught here, where the fix is obvious,
//     rather than at load time in a consumer
//   · a meal composing fewer than two KNOWN dishes (`buildIndex` enforces it;
//     this reports it with the missing components named)
//
// ── WHAT IT DOES NOT DECIDE ──
// Whether the entry is worth having. `npm run pull` reports demand from real
// logs and that remains the honest signal; this script will add whatever it is
// told to. An entry with no demand behind it is a corpus obligation and a
// permanent URL — see the header of `src/meals.ts`.
//
// ── BATCH SHAPE ──
//   [{ "kind": "dish", "slug": "aloo-gobi", "name": "Aloo Gobi",
//      "category": "vegetable", "aliases": ["aloo gobi", "gobi aloo"] },
//    { "kind": "meal", "slug": "dal-roti-salad", "name": "Dal + 1 roti + salad",
//      "aliases": ["dal + 1 roti + salad"], "loggedTimes": 0 }]

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, INDEX_JSON, readJson } from './lib/style.mjs';
import { DISHES } from '../src/dishes.ts';
import { MEALS } from '../src/meals.ts';
import { normalise } from '../src/normalise.ts';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMealFragments } from '../src/resolve.ts';
import { buildIndex } from '../src/build.ts';

const DISHES_TS = join(ROOT, 'src/dishes.ts');
const MEALS_TS = join(ROOT, 'src/meals.ts');
const IMAGES = join(ROOT, 'corpus/images');

const CATEGORIES = new Set([
  'grain', 'legume', 'dairy', 'egg', 'vegetable', 'fruit', 'nut', 'drink', 'supplement', 'snack',
]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const all = (f) => argv.reduce((acc, a, i) => (a === f && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const DRY = has('--dry');

// ── the entries to add ──────────────────────────────────────────────────────
let entries;
const from = val('--from');
if (from) {
  entries = JSON.parse(readFileSync(from, 'utf8'));
  if (!Array.isArray(entries)) throw new Error(`${from}: expected a JSON array of entries`);
} else {
  const kind = argv[0];
  if (kind !== 'dish' && kind !== 'meal') {
    console.error('Usage: npm run add -- dish|meal <slug> "Name" [--category c] [--alias a]…\n' +
                  '       npm run add -- --from batch.json   [--dry]');
    process.exit(1);
  }
  entries = [{
    kind,
    slug: argv[1],
    name: argv[2],
    category: val('--category'),
    aliases: all('--alias'),
    loggedTimes: Number(val('--logged', 0)),
  }];
}

// ── validate EVERYTHING before writing ANYTHING ─────────────────────────────
// Same all-or-nothing rule ingest follows, for the same reason: a batch that
// half-applies leaves the catalogue in a state nobody chose, and here the
// residue is a permanent URL rather than a file that can be deleted.
const idx = loadIndex(readJson(INDEX_JSON));
const takenSlugs = new Set([...DISHES.map((d) => d.slug), ...MEALS.map((m) => m.slug)]);
const takenKeys = new Map(); // normalised key → what claims it
for (const d of DISHES) for (const a of [d.name, d.slug, ...d.aliases]) takenKeys.set(normalise(a), `dish ${d.slug}`);
for (const m of MEALS) for (const a of [m.name, m.slug, ...m.aliases]) takenKeys.set(normalise(a), `meal ${m.slug}`);

const problems = [];
const planned = [];

// TWO PASSES, dishes first. A meal is validated against an index that already
// contains the dishes added in the SAME batch — otherwise "add aloo-gobi, naan
// and the plate they make" could never be one call, and the workflow this
// script exists for (grow the catalogue, then generate) would need two.
const ordered = [
  ...entries.map((e, i) => [i, e]).filter(([, e]) => e?.kind !== 'meal'),
  ...entries.map((e, i) => [i, e]).filter(([, e]) => e?.kind === 'meal'),
];

let mealIdx = idx; // rebuilt lazily once the batch's dishes are known

for (const [i, e] of ordered) {
  const where = from ? `${from}[${i}]` : 'argument';
  const kind = e.kind;
  if (kind !== 'dish' && kind !== 'meal') { problems.push(`${where}: kind must be "dish" or "meal"`); continue; }
  if (!e.slug || !SLUG_RE.test(e.slug)) { problems.push(`${where}: "${e.slug}" is not url-safe kebab-case`); continue; }
  if (!e.name || !e.name.trim()) { problems.push(`${where} (${e.slug}): name is required`); continue; }
  if (takenSlugs.has(e.slug)) { problems.push(`${where}: slug "${e.slug}" is already taken — dishes and meals share ONE namespace`); continue; }

  const aliases = [...new Set((e.aliases ?? []).map((a) => a.trim()).filter(Boolean))];
  const keys = [...new Set([e.name, ...aliases].map(normalise).filter(Boolean))];
  if (!keys.length) { problems.push(`${where} (${e.slug}): name and aliases all normalise to nothing`); continue; }
  for (const k of keys) {
    if (takenKeys.has(k)) problems.push(`${where} (${e.slug}): key "${k}" is already claimed by ${takenKeys.get(k)}`);
  }

  if (kind === 'dish') {
    if (e.category && !CATEGORIES.has(e.category)) {
      problems.push(`${where} (${e.slug}): category "${e.category}" is not one of ${[...CATEGORIES].join(', ')}`);
      continue;
    }
  } else {
    // A meal must compose at least two KNOWN dishes — `buildIndex` enforces it,
    // and a meal that is really one dish is a second slug for one picture of
    // one thing. Reported here with the unknown components named, because
    // "add those dishes first" is the actual fix.
    if (mealIdx === idx && planned.some((p) => p.kind === 'dish')) {
      // Cheap: buildIndex is a pure function of catalogue + disk, and the disk
      // scan is a handful of readdirs.
      mealIdx = loadIndex(buildIndex(IMAGES, [...DISHES, ...pendingDishes()], MEALS));
    }
    const frags = resolveMealFragments(mealIdx, e.name);
    const known = [...new Set(frags.filter((f) => f.dish).map((f) => f.dish.slug))];
    const unknown = frags.filter((f) => !f.dish).map((f) => f.key || f.text);
    if (known.length < 2) {
      problems.push(
        `${where} (${e.slug}): composes ${known.length} known dish(es) [${known.join(', ') || '—'}], needs 2. ` +
          (unknown.length ? `Unresolved: ${unknown.join(' · ')} — add those as dishes first.` : ''),
      );
      continue;
    }
  }

  // Claim it now so a batch cannot collide with ITSELF.
  takenSlugs.add(e.slug);
  for (const k of keys) takenKeys.set(k, `${kind} ${e.slug} (this batch)`);
  planned.push({ ...e, kind, aliases, keys });
}

const toDish = (p) => ({
  slug: p.slug, name: p.name, category: p.category ?? 'vegetable',
  aliases: p.aliases, ...(p.note ? { note: p.note } : {}),
});
const toMeal = (p) => ({
  slug: p.slug, name: p.name, loggedTimes: Number(p.loggedTimes ?? 0),
  aliases: p.aliases, ...(p.note ? { note: p.note } : {}),
});

/** The batch's dishes, shaped as catalogue entries for a trial index build. */
function pendingDishes() {
  return planned
    .filter((p) => p.kind === 'dish')
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category ?? 'vegetable', aliases: p.aliases }));
}

if (problems.length) {
  console.error(`\n── foodsum · add ── REFUSED, nothing written ──\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`\n── foodsum · add ──${DRY ? ' DRY RUN' : ''}\n`);
for (const p of planned) {
  console.log(`  + ${p.kind.padEnd(5)} ${p.slug}`);
  console.log(`      "${p.name}"  ·  keys: ${p.keys.join(' | ')}`);
}

if (DRY) {
  console.log('\n  (dry run — nothing written)\n');
  process.exit(0);
}

// ── append to the source files ──────────────────────────────────────────────
const dishesToAdd = planned.filter((p) => p.kind === 'dish');
const mealsToAdd = planned.filter((p) => p.kind === 'meal');
if (dishesToAdd.length) appendToArray(DISHES_TS, 'export const DISHES: Dish[] = [', dishesToAdd.map(dishLiteral));
if (mealsToAdd.length) appendToArray(MEALS_TS, 'export const MEALS: Meal[] = [', mealsToAdd.map(mealLiteral));

// The index is a pure function of catalogue + disk, so it is rebuilt rather
// than patched — same rule `ingest` follows.
//
// The catalogue is passed EXPLICITLY. `buildIndex()` defaults to the imported
// DISHES/MEALS, which this process read at import time — i.e. before it
// appended to those files — so the default would rebuild the index from the
// catalogue as it was BEFORE the add, writing a file that silently omits
// everything just added.
const index = buildIndex(
  IMAGES,
  [...DISHES, ...dishesToAdd.map(toDish)],
  [...MEALS, ...mealsToAdd.map(toMeal)],
);
writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + '\n');

console.log(`\n  ${dishesToAdd.length} dish(es), ${mealsToAdd.length} meal(s) added · index rebuilt`);
console.log(`  Next: npm run missing -- --dishes   # the prompts for what you just added\n`);

// ────────────────────────────────────────────────────────────────────────────

// A function declaration, not a const arrow: the literal builders run above
// this line, and a const would still be in its temporal dead zone.
function q(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function dishLiteral(d) {
  const lines = [
    '  {',
    `    slug: ${q(d.slug)},`,
    `    name: ${q(d.name)},`,
    ...(d.category ? [`    category: ${q(d.category)},`] : []),
    `    aliases: [${d.aliases.map(q).join(', ')}],`,
    ...(d.note ? [`    note: ${q(d.note)},`] : []),
    '  },',
  ];
  return lines.join('\n');
}

function mealLiteral(m) {
  return [
    '  {',
    `    slug: ${q(m.slug)},`,
    `    name: ${q(m.name)},`,
    `    loggedTimes: ${Number(m.loggedTimes ?? 0)},`,
    `    aliases: [${m.aliases.map(q).join(', ')}],`,
    ...(m.note ? [`    note: ${q(m.note)},`] : []),
    '  },',
  ].join('\n');
}

/**
 * Insert before the array's OWN closing bracket, found by walking bracket
 * depth from the declaration. Not by matching the last `];` in the file:
 * both source files export further consts after the catalogue (`REFUSED`,
 * `MEALS_NOT_TAKEN`), and appending into one of those would typecheck for a
 * while and mean something entirely different.
 */
function appendToArray(file, decl, literals) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`${file}: could not find "${decl}"`);
  let depth = 0;
  let i = start + decl.length - 1; // on the opening [
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`${file}: unbalanced brackets after "${decl}"`);
  const out = src.slice(0, i) + literals.join('\n') + '\n' + src.slice(i);
  writeFileSync(file, out);
}
