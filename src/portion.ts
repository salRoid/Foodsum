// Which fragment of a compound meal is the BIGGEST — and therefore the picture.
//
// Sal, 2026-08-31: "if there are multiple food elements as part of a meal then
// we should show image of the item which has the bigger portion … if the
// bigger portion item is not present then move to lower item." Until then the
// picture was the FIRST fragment, so "2 roti + aloo palak" showed bread and
// "Tea + 4 biscuits + 4 almonds" showed tea by accident rather than by rule.
//
// This is an ESTIMATE FOR RANKING, not nutrition. It only has to get the ORDER
// right, so every number is a round, defensible guess and the tie-break is the
// order the person wrote the meal in. Explicit quantities in the text win over
// every default: "200g" beats a category guess, "4 almonds" is 4 × one almond.

import type { IndexDish } from './index-schema.ts';

/** Grams for a container/measure word, when one is written. */
const UNIT_GRAMS: Record<string, number> = {
  katori: 150, bowl: 200, cup: 200, glass: 250, mug: 250, plate: 250,
  scoop: 30, tbsp: 15, tablespoon: 15, tsp: 5, teaspoon: 5,
  slice: 30, piece: 30, pieces: 30, pc: 30, pcs: 30, handful: 30,
};

/** Grams per PIECE for dishes people count ("2 roti", "4 almonds"). */
const PIECE_GRAMS: Record<string, number> = {
  roti: 40, naan: 90, bhature: 60, idli: 40, 'masala-dosa': 120, 'besan-chilla': 60,
  'boiled-eggs': 50, banana: 100, apple: 150, cucumber: 100,
  almonds: 1.2, walnuts: 4, 'gulab-jamun': 40, 'kaju-barfi': 15,
  'aloo-sandwich': 120, 'litti-chokha': 60, 'aloo-tikki-chaat': 150,
};

/** Grams when NOTHING is written — the portion a person means by the bare name. */
const DEFAULT_GRAMS: Record<string, number> = {
  // sides that would otherwise inherit a "main" sized category default
  'boondi-raita': 100, curd: 100, 'coconut-chutney': 40, 'greek-yogurt': 150,
  'peanut-butter': 15, 'aloo-bhujiya': 30, milk: 250, tea: 150,
};

/** Fallback by category when the dish has no entry above. */
const CATEGORY_GRAMS: Record<string, number> = {
  grain: 100, legume: 150, vegetable: 120, dairy: 150, egg: 100,
  fruit: 100, nut: 20, drink: 200, supplement: 30, snack: 40,
};

// Word-numbers must be WHOLE words: without the boundary, "aloo palak" read as
// `a` + unit "loo" and scored 30 g — the opposite of what it is.
const NUM = String.raw`(\d+(?:\.\d+)?|(?:a|an|one|two|three|four|five|half)\b)`;
const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5 };
const num = (s: string) => WORD_NUM[s] ?? parseFloat(s);

/**
 * Estimated grams for one fragment of a meal, as the person wrote it.
 * `dish` is the resolved catalogue entry, or null when nothing matched —
 * an unresolved fragment still gets a number so it can be RANKED, but it can
 * never be the hero because it has no picture.
 */
export function portionGrams(rawText: string, dish: IndexDish | null): number {
  const t = rawText.toLowerCase().trim();
  const mod = /\b(small|little|mini)\b/.test(t) ? 0.6 : /\b(large|big|double)\b/.test(t) ? 1.4 : 1;

  // 1 · an explicit mass/volume anywhere: "200g", "1.5 l", "250 ml"
  // Digits only, and word-bounded on both sides: with word-numbers allowed
  // here, the "a" in "d-a-l" followed by "l" read as ONE LITRE of dal.
  const mass = /\b(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?|ml|l|litre|liter)\b/.exec(t);
  if (mass) {
    const n = parseFloat(mass[1]);
    return mod * (/^(kg|l|litre|liter)$/.test(mass[2]) ? n * 1000 : n);
  }

  // 2 · a count and maybe a measure word at the start: "2 roti", "1 katori dal",
  //     "4 almonds", "a cup of tea", "1 tbsp peanut butter"
  const lead = new RegExp(String.raw`^${NUM}\s*(?:x\s*)?([a-z]+)?`).exec(t);
  if (lead) {
    const n = num(lead[1]);
    const unit = lead[2] ?? '';
    if (UNIT_GRAMS[unit]) return mod * n * UNIT_GRAMS[unit];
    const piece = dish ? PIECE_GRAMS[dish.slug] : undefined;
    return mod * n * (piece ?? 30);
  }
  // "cup of tea", "glass of milk" — measure word without a number
  const bare = /^(katori|bowl|cup|glass|mug|plate|scoop|handful)\b/.exec(t);
  if (bare) return mod * UNIT_GRAMS[bare[1]];

  // 3 · nothing written: the portion the bare name usually means
  if (!dish) return mod * 60; // neutral — cannot win anyway, has no picture
  return mod * (DEFAULT_GRAMS[dish.slug] ?? PIECE_GRAMS[dish.slug] ?? CATEGORY_GRAMS[dish.category] ?? 100);
}
