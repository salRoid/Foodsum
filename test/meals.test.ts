// The hybrid: per-dish is the base, a whole-meal photograph wins when we have
// one. These tests are written around the ORDERING the design commits to —
//
//     right meal  >  right fragments  >  nothing  >  wrong meal
//
// — so every one of them is really asking the same question: can a meal-level
// hit ever take something away from the fragment path, or answer with a plate
// that is not the plate that was typed?

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build.ts';
import { loadIndex, type FoodsumIndex } from '../src/index-schema.ts';
import { resolveMeal } from '../src/api.ts';
import { resolveFragment, resolveMealEntry } from '../src/resolve.ts';
import { MEALS } from '../src/meals.ts';
import { readStyle, promptFor, mealPromptFor } from '../scripts/lib/style.mjs';
import { DISHES } from '../src/dishes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shipped = loadIndex(JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8')));

/** A temp images root with a `400x300.webp` placeholder for each named slug. */
function corpusWith(slugs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'foodsum-meals-'));
  for (const slug of slugs) {
    mkdirSync(join(dir, slug, '1'), { recursive: true });
    writeFileSync(join(dir, slug, '1', '400x300.webp'), 'not-a-real-image');
  }
  return dir;
}

// ── the catalogue ────────────────────────────────────────────────────────

test('meal slugs are unique, well-formed, and each composes >= 2 dishes', () => {
  // Deliberately NOT a hardcoded list. The catalogue grows whenever Sal
  // photographs another plate he actually repeats, and a fixed array turns
  // every addition into a failing test that says nothing about correctness.
  // What must hold is the shape, not the census.
  const slugs = MEALS.map((m) => m.slug);
  assert.ok(slugs.length >= 6, 'the seeded meals should still be there');
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate meal slug');
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${slug} is not URL-safe`);
  }
  for (const m of shipped.raw.meals ?? []) {
    assert.ok(m.dishes.length >= 2, `${m.slug} composes only ${m.dishes.length}`);
  }
});

test('meal slugs and dish slugs share one namespace and do not collide', () => {
  const dishSlugs = new Set(DISHES.map((d) => d.slug));
  for (const m of MEALS) assert.ok(!dishSlugs.has(m.slug), `${m.slug} is also a dish slug`);
});

// ── precedence ───────────────────────────────────────────────────────────

test('A MEAL PHOTO WINS over the fragment strip', () => {
  // Both are available: the meal has a picture AND every one of its dishes
  // does. The whole plate must win, and it must win as ONE image.
  const dir = corpusWith(['dal-roti-sprouts-salad', 'dal', 'roti', 'sprouts-salad']);
  try {
    const idx = loadIndex(buildIndex(dir));
    const r = resolveMeal(idx, 'Dal + 1 roti + sprouts salad', { size: '400x300' });

    assert.equal(r.images.length, 1);
    assert.equal(r.images[0].url, '/i/dal-roti-sprouts-salad/1/400x300.webp');
    assert.equal(r.images[0].tier, 'meal-exact');
    assert.equal(r.meal?.slug, 'dal-roti-sprouts-salad');
    assert.equal(r.meal?.rendered, true);
    assert.deepEqual(r.meal?.dishes, ['dal', 'roti', 'sprouts-salad']);
    // The fragments are still reported — they are what a caption is built from.
    assert.deepEqual(r.fragments.map((f) => f.dish?.slug), ['dal', 'roti', 'sprouts-salad']);
    // ...but nothing is asked of the corpus, because nothing is missing.
    assert.deepEqual(r.misses, []);
    assert.deepEqual(r.withoutImages, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a meal ALIAS wins too, and says it was an alias', () => {
  const dir = corpusWith(['dal-roti-mixed-veg-sabzi']);
  try {
    const idx = loadIndex(buildIndex(dir));
    const r = resolveMeal(idx, 'Dal + 1 roti + sabzi', { size: '400x300' });
    assert.equal(r.images.length, 1);
    assert.equal(r.images[0].tier, 'meal-alias');
    assert.equal(r.meal?.slug, 'dal-roti-mixed-veg-sabzi');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a meal with NO image does not suppress the fragment strip', () => {
  // The failure this guards is the one that would make the feature a
  // regression: adding a meal entry before its photograph exists must not blank
  // out the dish images that were rendering perfectly well yesterday.
  const dir = corpusWith(['dal', 'roti', 'sprouts-salad']); // no meal image
  try {
    const idx = loadIndex(buildIndex(dir));
    const r = resolveMeal(idx, 'Dal + 1 roti + sprouts salad', { size: '400x300' });

    assert.equal(r.images.length, 3);
    assert.deepEqual(r.images.map((i) => i.slug), ['dal', 'roti', 'sprouts-salad']);
    assert.equal(r.meal?.slug, 'dal-roti-sprouts-salad');
    assert.equal(r.meal?.rendered, false);
    // `withoutImages` means DISHES that matched and have no picture. The
    // imageless meal is reported through `meal.rendered`, not by being mixed
    // into a list every existing consumer already reads as dishes.
    assert.deepEqual(r.withoutImages, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a NEAR-MISS meal falls back to fragments — it never matches the wrong plate', () => {
  // Every one of these is one word or one component away from a meal we HAVE
  // photographed, and would be its nearest neighbour under any scored matcher.
  // The right answer for all of them is the dish strip.
  const dir = corpusWith([
    'dal-roti-sprouts-salad', 'dal-roti-mixed-veg-sabzi', 'greek-yogurt-almonds',
    'dal', 'roti', 'sprouts-salad', 'mixed-vegetable-sabzi', 'greek-yogurt',
    'almonds', 'walnuts', 'curd', 'cooked-rice',
  ]);
  try {
    const idx = loadIndex(buildIndex(dir));
    const nearMisses = [
      'Dal + 1 roti + mixed veg sabzi + sprouts salad', // a component added
      'Dal + 1 roti',                                    // a component removed
      'Dal + 1 katori rice + sprouts salad',             // a component swapped
      'Greek yogurt 200g + 8 walnuts',                   // one word different
      'Curd 200g + 8 almonds',                           // the other word
      '1 roti + dal + sprouts salad',                    // same words, reordered
    ];

    for (const name of nearMisses) {
      const r = resolveMeal(idx, name, { size: '400x300' });
      assert.equal(r.meal, null, `${name} must NOT match a meal`);
      assert.ok(r.images.length >= 2, `${name} should still get its dish strip`);
      for (const img of r.images) {
        assert.ok(
          !idx.byMealSlug.has(img.slug),
          `${name} returned a MEAL image (${img.slug}) — this is the wrong-plate failure`,
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a meal key is invisible to FRAGMENT resolution, and vice versa', () => {
  // The two lookup namespaces must not leak into each other. A third of a plate
  // must not return the whole plate, and a whole string must not resolve as if
  // it were one dish.
  assert.equal(resolveFragment(shipped, 'dal roti sprouts salad').dish, null);
  assert.equal(resolveFragment(shipped, 'dal-roti-sprouts-salad').dish, null);
  assert.equal(resolveMealEntry(shipped, 'Dal'), null);
  assert.equal(resolveMealEntry(shipped, 'greek yogurt'), null);
});

test('an imageless corpus behaves exactly as it did before meals', () => {
  // The corpus SHIPPED empty; it no longer is. This test is about the CONTRACT
  // (an imageless meal entry must not suppress the — also imageless — strip),
  // so it runs against the real index with its images erased. Asserting on the
  // live corpus would break the suite every time a generation run lands.
  const emptied = loadIndex(JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8')));
  for (const e of [...emptied.raw.dishes, ...(emptied.raw.meals ?? [])]) {
    e.variants = 0;
    delete e.variantMeta;
  }
  const r = resolveMeal(emptied, 'Dal + 1 roti + mixed veg sabzi');
  assert.deepEqual(r.images, []);
  assert.equal(r.fullyResolved, true);
  assert.deepEqual(r.withoutImages, ['dal', 'roti', 'mixed-vegetable-sabzi']);
  assert.equal(r.meal?.rendered, false); // matched, queued for generation
});

test("HEALTH'S GATE passes a meal hit unchanged — no edit needed on that side", () => {
  // `Health/lib/foodImage.ts` shows a picture only when
  //     r.fullyResolved && r.withoutImages.length === 0
  // and then takes `r.images[0].url`. Those three lines are replayed verbatim
  // here, because the claim "Health needs no change" is otherwise just an
  // assertion about code in another package.
  //
  // The interesting row is `Paneer bhurji + 1 roti + salad`: its FRAGMENTS do
  // not all resolve ("salad" is a deliberate refusal), so before meals existed
  // Health correctly showed nothing. With a photograph of the whole plate the
  // row IS fully known — and the picture shows the salad that was actually on
  // it, which is the thing a generic salad photo never could.
  const gate = (r: ReturnType<typeof resolveMeal>) =>
    !r.fullyResolved || r.withoutImages.length > 0 ? null : (r.images[0]?.url ?? null);

  const dir = corpusWith(['paneer-bhurji-roti-salad', 'dal-roti-sprouts-salad']);
  try {
    const idx = loadIndex(buildIndex(dir));
    const opts = { size: '400x300', baseUrl: '/foodsum', maxImages: 8 } as const;

    assert.equal(
      gate(resolveMeal(idx, 'Paneer bhurji + 1 roti + salad', opts)),
      '/foodsum/paneer-bhurji-roti-salad/1/400x300.webp',
    );
    assert.equal(
      gate(resolveMeal(idx, 'Dal + 1 roti + sprouts salad', opts)),
      '/foodsum/dal-roti-sprouts-salad/1/400x300.webp',
    );
    // And a row with no meal photo and no dish photos still shows nothing.
    assert.equal(gate(resolveMeal(idx, 'Poha + 3 boiled eggs', opts)), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── collisions ───────────────────────────────────────────────────────────

function indexWith(dishes: unknown[], meals: unknown[]): FoodsumIndex {
  return {
    version: 1, generatedAt: 'x', baseUrl: '/i', sizes: [], formats: [],
    dishes, meals,
  } as unknown as FoodsumIndex;
}

test('a slug claimed by both a dish and a meal is FATAL at load', () => {
  assert.throws(
    () =>
      loadIndex(
        indexWith(
          [{ slug: 'greek-yogurt', name: 'Greek Yogurt', category: 'dairy', keys: ['greek yogurt'], variants: 0 }],
          [{ kind: 'meal', slug: 'greek-yogurt', name: 'Greek yogurt + banana', keys: ['greek yogurt banana'], variants: 0, dishes: ['greek-yogurt', 'banana'] }],
        ),
      ),
    /claimed by both a dish and a meal/,
  );
});

test('a KEY claimed by both a dish and a meal is FATAL at load', () => {
  assert.throws(
    () =>
      loadIndex(
        indexWith(
          [{ slug: 'oats', name: 'Oats', category: 'grain', keys: ['oats with milk'], variants: 0 }],
          [{ kind: 'meal', slug: 'oats-plate', name: 'Oats with milk', keys: ['oats with milk'], variants: 0, dishes: ['oats', 'banana'] }],
        ),
      ),
    /cannot mean a dish at fragment level and a meal at row level/,
  );
});

test('buildIndex refuses a colliding meal, and refuses a one-dish meal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foodsum-collide-'));
  try {
    assert.throws(
      () =>
        buildIndex(dir, DISHES, '/i', [
          { slug: 'dal', name: 'Dal + 1 roti', aliases: [], loggedTimes: 0 },
        ]),
      /claimed by both a dish and a meal/,
    );
    assert.throws(
      () =>
        buildIndex(dir, DISHES, '/i', [
          { slug: 'just-dal', name: 'Dal', aliases: [], loggedTimes: 0 },
        ]),
      /composes only 1 known dish/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('`npm run check` REPORTS a dish/meal slug collision instead of crashing', () => {
  // Executed for real, because the claim being tested is about the SCRIPT's
  // behaviour — that a structurally impossible index is reported as a check
  // failure rather than an uncaught throw. `npm run build` can never produce
  // one (it validates before writing), so the only way it can exist is a
  // hand-edited index, which is exactly what `check` is for.
  //
  // This swaps corpus/index.json for a broken copy and puts the original back
  // in a `finally`. If it is ever interrupted mid-run, `npm run build`
  // regenerates the file from source.
  const path = join(ROOT, 'corpus/index.json');
  const original = readFileSync(path, 'utf8');
  try {
    const broken = JSON.parse(original);
    broken.meals.push({
      kind: 'meal', slug: 'dal', name: 'Collision', keys: ['collision plate'],
      variants: 0, dishes: ['dal', 'roti'],
    });
    writeFileSync(path, JSON.stringify(broken, null, 2) + '\n');

    let code = 0;
    let out = '';
    try {
      out = execFileSync('npm', ['run', '--silent', 'check'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      code = (err as { status: number }).status;
      out = ((err as { stdout?: string }).stdout ?? '') + ((err as { stderr?: string }).stderr ?? '');
    }

    assert.equal(code, 1, 'check must exit 1 on a collision');
    assert.match(out, /claimed by both a dish and a meal/);
  } finally {
    writeFileSync(path, original);
  }
});

// ── the pipeline ─────────────────────────────────────────────────────────

test('ingest accepts a meal slug as a filename, and still refuses an unknown one', () => {
  // `slugFromFilename` is not exported (ingest.mjs is a script), so this
  // asserts the SET it is built from — the thing that would actually be wrong
  // if meals had been left out of it.
  const slugs = new Set([...DISHES.map((d) => d.slug), ...MEALS.map((m) => m.slug)]);
  assert.ok(slugs.has('dal-roti-sprouts-salad'));
  assert.ok(slugs.has('dal'));
  assert.ok(!slugs.has('dal-roti-and-something-invented'));
});

test('`npm run missing` reports both queues, tracking the LIVE corpus', () => {
  // The queue contents change every time a generation run lands, so the CLI
  // half of this test derives its expectations from the committed index
  // instead of hard-coding a corpus state that was true on one day.
  const raw = JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8'));
  const missDishes = raw.dishes.filter((d: { variants: number }) => d.variants === 0).length;
  const missMeals = (raw.meals ?? []).filter((m: { variants: number }) => m.variants === 0).length;

  const out = execFileSync('npm', ['run', '--silent', 'missing'], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.match(out, new RegExp(
    `Dishes\\s+${raw.dishes.length} in the catalogue · \\d+ with an image · MISSING ${missDishes}`,
  ));
  assert.match(out, new RegExp(
    `Meals\\s+${(raw.meals ?? []).length} in the catalogue · \\d+ with an image · MISSING ${missMeals}`,
  ));
  if (missDishes + missMeals === 0) {
    assert.match(out, /Nothing to generate/);
  }
  if (missMeals > 0) {
    // Any missing meal must get the MEAL prompt, never the dish prompt.
    assert.match(out, /one complete meal of /);
    assert.match(out, /must show: /);
  }

  // The meal-vs-dish prompt distinction itself — the point the CLI assertion
  // used to carry — is proven directly against the style contract, so it stays
  // covered even when the queue is empty.
  const style = readStyle();
  const mealPrompt = mealPromptFor(style, 'Dal + 1 roti + sprouts salad');
  const dishPrompt = promptFor(style, 'Dal');
  assert.match(mealPrompt, /one complete meal of Dal \+ 1 roti \+ sprouts salad/);
  assert.doesNotMatch(dishPrompt, /one complete meal/);
});
