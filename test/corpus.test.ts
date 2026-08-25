// The corpus growth path, executed rather than asserted in prose.
//
// The claim under test: adding an image is a FILE DROP plus a rebuild — no
// code change, no schema, no migration — and the library is fully functional
// and fully testable with zero images present. Both halves are load-bearing
// (Sal generates the images himself, so the empty state is the state this
// ships in), so both are run here against a real temp directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build.ts';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMeal } from '../src/api.ts';
import { DISHES } from '../src/dishes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('an EMPTY corpus builds, loads, resolves — and renders nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foodsum-empty-'));
  try {
    const idx = loadIndex(buildIndex(dir));
    assert.equal(idx.raw.dishes.length, DISHES.length);
    assert.ok(idx.raw.dishes.every((d) => d.variants === 0));

    const r = resolveMeal(idx, 'Dal + 1 roti');
    assert.equal(r.fullyResolved, true);   // the MATCH works
    assert.deepEqual(r.images, []);        // the IMAGE does not exist yet
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adding an image is a file drop plus a rebuild — no code change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foodsum-drop-'));
  try {
    // Two variants of dal, one variant of roti, at one rung of the ladder.
    for (const [slug, variants] of [['dal', 2], ['roti', 1]] as const) {
      for (let v = 1; v <= variants; v++) {
        mkdirSync(join(dir, slug, String(v)), { recursive: true });
        writeFileSync(join(dir, slug, String(v), '400x300.webp'), 'not-a-real-image');
      }
    }

    const idx = loadIndex(buildIndex(dir));
    assert.equal(idx.bySlug.get('dal')!.variants, 2);
    assert.equal(idx.bySlug.get('roti')!.variants, 1);
    assert.equal(idx.bySlug.get('poha')!.variants, 0);

    const r = resolveMeal(idx, 'Dal + 1 roti + mixed veg sabzi', { size: '400x300' });
    assert.equal(r.images.length, 2);                  // sabzi has no image yet
    assert.deepEqual(r.withoutImages, ['mixed-vegetable-sabzi']);
    assert.match(r.images[0].url, /^\/i\/dal\/[12]\/400x300\.webp$/);
    assert.equal(r.images[1].url, '/i/roti/1/400x300.webp');

    // ...and it is still deterministic across a fresh build.
    const again = loadIndex(buildIndex(dir));
    assert.equal(
      resolveMeal(again, 'Dal', { size: '400x300' }).images[0].url,
      r.images[0].url,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed index.json is in step with dishes.ts AND meals.ts', () => {
  // Guards the one way this repo can silently lie: editing dishes.ts or
  // meals.ts and forgetting `npm run build`, so consumers load a stale
  // catalogue. Meals are covered here for the same reason dishes are — a meal
  // entry that exists in source and not in the index is a plate whose
  // photograph would never be reached.
  const committed = JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8'));
  const fresh = buildIndex(join(ROOT, 'corpus', 'images'));
  assert.deepEqual(
    committed.dishes,
    fresh.dishes,
    'corpus/index.json is stale — run `npm run build`',
  );
  assert.deepEqual(
    committed.meals,
    fresh.meals,
    'corpus/index.json meals are stale — run `npm run build`',
  );
});
