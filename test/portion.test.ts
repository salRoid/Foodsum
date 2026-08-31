// The hero is the biggest portion that has a picture — on Sal's REAL meal
// strings from the week of 25 Aug 2026, against the real index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMeal, portionGrams } from '../src/api.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const idx = loadIndex(JSON.parse(readFileSync(join(ROOT, 'corpus/index.json'), 'utf8')));
const hero = (s: string) => {
  const r = resolveMeal(idx, s, { size: '400x300' });
  // A photographed PLATE is the hero outright and would mask the ranking — so
  // every string below must not be one. If this throws, pick another string.
  assert.equal(r.meal, null, `"${s}" is a meal entry now; the test needs a non-plate string`);
  return r.hero?.slug ?? null;
};
const dish = (slug: string) => idx.raw.dishes.find((d) => d.slug === slug)!;

test('explicit quantities beat every default', () => {
  assert.equal(portionGrams('200g', dish('greek-yogurt')), 200);
  assert.equal(portionGrams('1.5 l', dish('milk')), 1500);
  assert.equal(portionGrams('4 almonds', dish('almonds')), 4.8);
  assert.equal(portionGrams('2 roti', dish('roti')), 80);
  assert.equal(portionGrams('1 katori dal', dish('dal')), 150);
  assert.equal(portionGrams('1 tbsp peanut butter', dish('peanut-butter')), 15);
  assert.equal(portionGrams('cup of tea', dish('tea')), 200);
  assert.equal(portionGrams('small rice', dish('cooked-rice')), 60);
});

test('the sabzi beats the bread it was eaten with', () => {
  assert.equal(hero('2 roti + aloo palak + cucumber'), 'aloo-palak');
});

test('the drink beats a handful of nuts, and an unresolved brand cannot be the hero', () => {
  assert.equal(hero('Tea + 4 Marie Gold biscuits + 4 almonds + 2 walnuts'), 'tea');
});

test('an explicit 200g beats a default banana', () => {
  assert.equal(hero('Greek yogurt 200g + 2 walnuts'), 'greek-yogurt');
});

test('a tie keeps the written order', () => {
  // dal 150 vs cucumber 100 → dal, and dal is written first anyway
  assert.equal(hero('Dal + 1 roti + cucumber'), 'dal');
  // a TRUE tie: 1 katori rice (150) vs dal (150) → the one written first
  assert.equal(hero('1 katori curd + 1 katori dal'), 'curd');
  assert.equal(hero('1 katori dal + 1 katori curd'), 'dal');
});

test('"small" shrinks a portion below its rival', () => {
  assert.equal(portionGrams('small rice', dish('cooked-rice')), 60);
  assert.equal(portionGrams('rice', dish('cooked-rice')), 100);
  assert.equal(hero('small rice + 4 almonds'), 'cooked-rice');   // 60 still beats 4.8
  assert.equal(hero('small rice + 1 roti'), 'cooked-rice');      // 60 vs 40
});

test('FALLTHROUGH: when the biggest has no picture yet, the next one wins', () => {
  // sambar (150, no image yet) > 4 idli (160!) — idli wins on grams here, so
  // use a case where the imageless one is truly biggest:
  assert.equal(hero('1 katori sambar + 2 roti'), 'roti');       // sambar 150, no image yet → roti 80
  assert.equal(hero('sambar + 2 idli'), null);                   // neither has a picture yet → nothing
});

test('a whole-meal photograph is the hero outright', () => {
  const r = resolveMeal(idx, 'Dal + 1 roti + sprouts salad', { size: '400x300' });
  assert.ok(r.meal?.rendered);
  assert.equal(r.hero?.slug, r.images[0].slug);
});

test('the strip order is untouched — hero is a separate answer', () => {
  const r = resolveMeal(idx, '2 roti + aloo palak + cucumber', { size: '400x300' });
  assert.equal(r.meal, null);
  assert.equal(r.images[0].slug, 'roti');
  assert.equal(r.hero?.slug, 'aloo-palak');
});
