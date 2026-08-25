// Normalisation — turn a typed meal fragment into a lookup key.
//
// This is the ONLY place a string is transformed before it meets the alias
// table, and every step here is deterministic and reversible in the sense that
// it removes noise rather than guessing meaning. Nothing in this file may ever
// try to *decide* what a dish is; that is `resolve.ts`'s job, and it does it by
// exact map lookup only.
//
// The order matters and is not arbitrary:
//   1. em-dash tail FIRST — "Whey shake (1.5 scoop) — post workout" has an
//      aside that can contain anything, including separators.
//   2. parentheticals SECOND, and before segmentation — "Egg bhurji
//      (2 eggs + 2 whites) + 2 roti" carries a `+` INSIDE the parens that must
//      not become a fragment boundary. Segmenting first would produce the
//      fragments "egg bhurji (2 eggs", "2 whites)" and "2 roti".
//   3. quantities and units, then bare numbers, then punctuation.

/** Units that appear attached to a number in real Health meal rows. */
const UNITS = [
  'g', 'gm', 'gms', 'gram', 'grams', 'kg', 'mg',
  'ml', 'l', 'ltr', 'litre', 'litres', 'oz',
  'scoop', 'scoops',
  'katori', 'katoris', 'bowl', 'bowls', 'plate', 'plates',
  'cup', 'cups', 'glass', 'glasses',
  'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'piece', 'pieces', 'pc', 'pcs', 'nos', 'no',
  'slice', 'slices',
  'small', 'medium', 'large',
];

const UNIT_RE = new RegExp(
  String.raw`\b\d+(?:[.,]\d+)?\s*(?:${UNITS.join('|')})\b`,
  'gi',
);

/**
 * Free-text asides that carry no dish information. Deliberately a SHORT,
 * closed list of things actually seen in the data — not a stopword corpus.
 * A long list here would start deleting words that are part of dish names.
 */
const NOISE = [
  'post workout', 'pre workout', 'post-workout', 'pre-workout',
  'leftover', 'leftovers', 'homemade',
];

/** Strip the aside after an em/en dash: "whey shake — post workout". */
export function stripAside(s: string): string {
  const cut = s.search(/\s[—–]\s|\s-\s/u);
  return cut === -1 ? s : s.slice(0, cut);
}

/** Remove `(...)` groups. Unbalanced opens drop everything to the end. */
export function stripParentheticals(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ').replace(/\([^)]*$/g, ' ');
}

/**
 * Full normalisation of a single fragment into an alias-table key.
 * Lowercase, de-accented, quantity-free, punctuation-free, whitespace-collapsed.
 */
export function normalise(raw: string): string {
  let s = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = stripAside(s);
  s = stripParentheticals(s);
  s = s.toLowerCase();

  for (const n of NOISE) s = s.split(n).join(' ');

  s = s.replace(UNIT_RE, ' ');       // "200g", "1.5 scoop", "1 medium"
  s = s.replace(/\b\d+(?:[.,]\d+)?\b/g, ' '); // bare counts: "2 roti", "3 boiled eggs"
  s = s.replace(/[^a-z ]+/g, ' ');   // punctuation, stray symbols
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * Normalisation applied to a CANONICAL name or alias at index-build time.
 * Identical to `normalise` on purpose — if the two ever diverge, an alias
 * written by hand stops matching the string it was written for.
 */
export const normaliseAlias = normalise;
