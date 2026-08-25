// Segmentation — one typed meal is usually several dishes.
//
// 30 of Health's 37 real `Meal` rows (81%) contain a `+`. "Dal + 1 roti +
// mixed veg sabzi" is one row and three dishes; treating it as one name and
// resolving it to a picture of dal shows one third of the meal AS the meal.
// So the unit of resolution is the fragment, never the row.
//
// SEPARATORS ARE TWO-TIER, and the tiers are not interchangeable:
//
//   HARD  `+`  `,`  `&`  — unambiguously "and another dish". Split always.
//   SOFT  ` with `       — split ONLY if the whole fragment failed to resolve.
//
// The soft tier exists because of "Oats with milk", which is a single dish in
// Health's own curated Food table ("Oats (40g dry, with milk)"). Splitting it
// eagerly yields "oats" + "milk" and reports two dishes where the user logged
// one. So `resolve.ts` tries the whole fragment first and only asks for the
// soft split when that misses — the split is a fallback, not a parse step.
//
// `/` is DELIBERATELY NOT a separator. In this vocabulary it means "or", not
// "and": Health's Food table has "Greek Yogurt / Hung Curd" and "Rajma /
// Chana", which are alternative names and alternative dishes, not a compound
// meal. It appears in zero of the 37 real Meal rows.

import { stripAside, stripParentheticals } from './normalise.ts';

const HARD_SEPARATOR = /[+,&]/;
const SOFT_SEPARATOR = /\swith\s/i;

/**
 * Split a raw meal name into raw dish fragments.
 *
 * Asides and parentheticals are removed BEFORE splitting, because both can
 * contain a hard separator that is not a dish boundary — "Egg bhurji (2 eggs +
 * 2 whites) + 2 roti" is two dishes, not three.
 */
export function segment(mealName: string): string[] {
  const cleaned = stripParentheticals(stripAside(mealName));
  return cleaned
    .split(HARD_SEPARATOR)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * The soft split, applied to ONE already-hard-split fragment that failed to
 * resolve whole. Returns `null` when there is nothing soft to split on, so a
 * caller can tell "no further attempt is possible" from "here are the parts".
 */
export function softSplit(fragment: string): string[] | null {
  if (!SOFT_SEPARATOR.test(fragment)) return null;
  const parts = fragment
    .split(SOFT_SEPARATOR)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  return parts.length > 1 ? parts : null;
}
