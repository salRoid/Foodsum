import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalise } from '../src/normalise.ts';
import { segment, softSplit } from '../src/segment.ts';
import { loadIndex } from '../src/index-schema.ts';
import { resolveFragment, resolveMealFragments } from '../src/resolve.ts';
import { resolveMeal } from '../src/api.ts';
import { pickVariant, imageUrlFor } from '../src/variant.ts';
import { REFUSED } from '../src/dishes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const idx = loadIndex(JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8')));
const REAL: string[] = JSON.parse(
  readFileSync(join(ROOT, 'test/fixtures/real-meal-names.json'), 'utf8'),
);

// ── normalisation ────────────────────────────────────────────────────────

test('normalise strips quantities, units, parentheticals and em-dash asides', () => {
  assert.equal(normalise('Greek yogurt 200g'), 'greek yogurt');
  assert.equal(normalise('8 almonds'), 'almonds');
  assert.equal(normalise('1 katori rice'), 'rice'); // "1 katori" is quantity+unit
  assert.equal(normalise('Paneer (75g)'), 'paneer');
  assert.equal(normalise('Whey shake (1.5 scoop) — post workout'), 'whey shake');
  assert.equal(normalise('Egg bhurji (2 eggs + 2 whites)'), 'egg bhurji');
  assert.equal(normalise('Besan chilla (2)'), 'besan chilla');
});

test('normalise is idempotent — a normalised string normalises to itself', () => {
  for (const s of REAL) {
    const once = normalise(s);
    assert.equal(normalise(once), once, `not idempotent: ${s}`);
  }
});

// ── segmentation ─────────────────────────────────────────────────────────

test('segments on hard separators', () => {
  assert.deepEqual(segment('Dal + 1 roti + mixed veg sabzi'), [
    'Dal', '1 roti', 'mixed veg sabzi',
  ]);
});

test('a `+` INSIDE parentheses is not a fragment boundary', () => {
  // The failure this guards: three fragments, two of them garbage.
  assert.deepEqual(segment('Egg bhurji (2 eggs + 2 whites) + 2 roti'), [
    'Egg bhurji', '2 roti',
  ]);
});

test('an em-dash aside is dropped before splitting', () => {
  assert.deepEqual(segment('Whey shake (1.5 scoop) — post workout'), ['Whey shake']);
});

test('softSplit reports nothing to split when there is no " with "', () => {
  assert.equal(softSplit('Dal'), null);
  assert.deepEqual(softSplit('Oats with milk'), ['Oats', 'milk']);
});

test('" with " does NOT split a dish that resolves whole', () => {
  // "Oats with milk" is one row in Health's own Food table. Eager splitting
  // would report two dishes where the user logged one.
  const frags = resolveMealFragments(idx, 'Oats with milk + 2 boiled eggs');
  assert.deepEqual(frags.map((f) => f.dish?.slug), ['oats', 'boiled-eggs']);
});

// ── the tiers ────────────────────────────────────────────────────────────

test('tier 1 — a slug and a canonical name are exact', () => {
  assert.equal(resolveFragment(idx, 'paneer-bhurji').tier, 'exact');
  assert.equal(resolveFragment(idx, 'Paneer Bhurji').tier, 'exact');
});

test('tier 2 — a curated alias resolves, and says it was an alias', () => {
  const r = resolveFragment(idx, 'Whey shake');
  assert.equal(r.tier, 'alias');
  assert.equal(r.dish?.slug, 'whey-protein-shake');
});

test('tier 3 — an unknown dish resolves to NOTHING, not to something close', () => {
  for (const unknown of ['pav bhaji', 'shakshuka', 'zzz', 'green curry', 'bhurji']) {
    const r = resolveFragment(idx, unknown);
    assert.equal(r.tier, 'unresolved', `${unknown} should not resolve`);
    assert.equal(r.dish, null);
  }
});

test('THE COLLISION: shared tokens never bleed between dishes', () => {
  // Every one of these pairs would be confused by token overlap, trigram
  // similarity or nearest-neighbour embeddings. Exact lookup cannot.
  assert.equal(resolveFragment(idx, 'egg bhurji').dish?.slug, 'egg-bhurji');
  assert.equal(resolveFragment(idx, 'paneer bhurji').dish?.slug, 'paneer-bhurji');
  assert.equal(resolveFragment(idx, 'paneer').dish?.slug, 'paneer');
  assert.equal(resolveFragment(idx, 'curd').dish?.slug, 'curd');
  assert.equal(resolveFragment(idx, 'greek yogurt').dish?.slug, 'greek-yogurt');
  assert.equal(resolveFragment(idx, 'sprouts salad').dish?.slug, 'sprouts-salad');
  // ...and the bare category does not fall back to the specific dish.
  assert.equal(resolveFragment(idx, 'salad').dish, null);
});

test('the refusals stay refused', () => {
  for (const key of Object.keys(REFUSED)) {
    assert.equal(resolveFragment(idx, key).dish, null, `${key} must stay unresolved`);
  }
});

// ── an empty corpus is a valid corpus ────────────────────────────────────
// The corpus SHIPPED empty; it no longer is. These tests are about the
// CONTRACT (no image → render nothing), so they run against the real index
// with its images erased — asserting on the live corpus would mean the suite
// breaks every time a generation run lands, which it now regularly does.

const bare = loadIndex(JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8')));
for (const e of [...bare.raw.dishes, ...(bare.raw.meals ?? [])]) {
  e.variants = 0;
  delete e.variantMeta;
}
const emptied = bare;

test('a dish with no images resolves but yields NO image', () => {
  const r = resolveMeal(emptied, 'Dal + 1 roti + mixed veg sabzi');
  assert.equal(r.fragments.length, 3);
  assert.equal(r.fullyResolved, true);
  assert.deepEqual(r.images, []);           // → the consumer renders nothing
  assert.deepEqual(r.withoutImages, ['dal', 'roti', 'mixed-vegetable-sabzi']);
});

test('a miss and an empty corpus produce the same output: nothing', () => {
  assert.deepEqual(resolveMeal(emptied, 'pav bhaji').images, []);
  assert.deepEqual(resolveMeal(emptied, 'Dal').images, []);
});

// ── determinism ──────────────────────────────────────────────────────────

test('variant choice is stable, seedable, and 0 when there are no images', () => {
  assert.equal(pickVariant('dal', 0), 0);
  const a = pickVariant('dal', 3);
  assert.equal(a, pickVariant('dal', 3));
  assert.ok(a >= 1 && a <= 3);
  // A seed changes the answer but stays stable for that seed.
  const b = pickVariant('dal', 3, '2026-08-25');
  assert.equal(b, pickVariant('dal', 3, '2026-08-25'));
});

test('variant choice is spread, not pinned to one index', () => {
  const seen = new Set(idx.raw.dishes.map((d) => pickVariant(d.slug, 3)));
  assert.equal(seen.size, 3, 'all three variants should be reachable across 25 slugs');
});

test('URLs are explicit, static and deterministic', () => {
  const dish = { ...idx.bySlug.get('dal')!, variants: 2 };
  const url = imageUrlFor(dish, '/i', { size: '400x300', format: 'webp' });
  assert.match(url!, /^\/i\/dal\/[12]\/400x300\.webp$/);
  assert.equal(url, imageUrlFor(dish, '/i', { size: '400x300', format: 'webp' }));
  assert.equal(imageUrlFor(dish, '/i', { variant: 9 }), null);
  assert.equal(imageUrlFor({ ...dish, variants: 0 }, '/i'), null);
});

// ── the index itself ─────────────────────────────────────────────────────

test('a contested alias is fatal at load, not resolved by array order', () => {
  assert.throws(
    () =>
      loadIndex({
        version: 1, generatedAt: 'x', baseUrl: '/i', sizes: [], formats: [],
        dishes: [
          { slug: 'a', name: 'A', category: 'grain', keys: ['shared'], variants: 0 },
          { slug: 'b', name: 'B', category: 'grain', keys: ['shared'], variants: 0 },
        ],
      }),
    /claimed by both/,
  );
});

// ── the real data ────────────────────────────────────────────────────────

test('REAL DATA: the 37 Meal rows resolve at or above the recorded rate', () => {
  let frags = 0;
  let resolved = 0;
  const misses = new Set<string>();

  for (const name of REAL) {
    for (const f of resolveMealFragments(idx, name)) {
      frags++;
      if (f.dish) resolved++;
      else if (f.key) misses.add(f.key);
    }
  }

  assert.equal(REAL.length, 37);
  assert.equal(frags, 85);
  assert.equal(resolved, 78);            // 91.8%
  // Every remaining miss is a DOCUMENTED refusal, not a gap. If this fails,
  // either the corpus grew (update the number) or a refusal leaked.
  assert.deepEqual([...misses].sort(), ['marie gold biscuits', 'salad']);
});

test('REAL DATA: 81% of rows are compound, and the matcher treats them so', () => {
  const compound = REAL.filter((n) => n.includes('+')).length;
  assert.equal(compound, 30);
  const multi = REAL.filter((n) => resolveMealFragments(idx, n).length > 1).length;
  assert.ok(multi >= compound - 2, 'compound rows should segment into >1 fragment');
});
