// Resolution — meal in, one meal picture or a strip of dish pictures or
// nothing out.
//
// ── STEP 0, BEFORE ANY OF THE TIERS BELOW: THE WHOLE MEAL ──
// `resolveMealEntry` asks whether the ENTIRE typed string names a plate we have
// photographed whole. A hit that has an image wins outright and the fragment
// machinery below never runs. Everything else — including a meal entry that
// matched but has no picture yet — falls through to it unchanged. See
// `resolveMealEntry` for why that lookup is exact and not scored.
//
// ── THE TIERS (fragments) ──
//
//   TIER 1  `exact`       normalised fragment === a dish slug, or === the
//                         normalised canonical name. Cannot be wrong.
//   TIER 2  `alias`       normalised fragment is a key in the hand-curated
//                         alias table. Exact map hit. Cannot be wrong either —
//                         a human wrote that exact string against that exact
//                         dish and can be shown to have been wrong, which is
//                         the difference between a curated table and a score.
//   TIER 3  `unresolved`  everything else. RENDER NOTHING. No element, no
//                         reserved box, no broken image, no category fallback.
//
// Tiers 1 and 2 both render. They are kept apart anyway because the *report*
// matters: a tier-2 rate climbing over time is the alias table earning its
// keep, and a tier-1-only corpus would mean nobody has typed a real sentence
// at it yet.
//
// ── WHY THERE IS NO TIER BETWEEN 2 AND 3 ──
// Token overlap, trigram similarity and embeddings were all considered and
// rejected — on BEHAVIOUR, not on cost. Nearest-neighbour has no "I don't
// know": it always returns its closest match. "paneer bhurji" and "egg bhurji"
// share a token and are different dishes; the closest thing to "aloo palak" in
// a food corpus is a different green curry. Every one of those matchers
// converts a safe miss into a confident wrong dish, which is the single
// outcome this whole design exists to prevent. `Health/ATTRIBUTION.md` records
// 15 exercise illustrations rejected after being rendered and looked at
// (sit-up → crunch, suitcase-carry → farmer-carry); every one would have
// passed a similarity threshold.
//
// If a spelling misses, the fix is a line in `dishes.ts`, and the miss report
// tells you which line to write.

import { normalise } from './normalise.ts';
import { segment, softSplit } from './segment.ts';
import type { IndexDish, IndexMeal, LoadedIndex } from './index-schema.ts';

export type Tier = 'exact' | 'alias' | 'unresolved';

/** Tiers whose result may be shown to a user. */
export const RENDERABLE_TIERS: readonly Tier[] = ['exact', 'alias'];

/**
 * How a whole-meal hit was reached. Reported separately from the fragment
 * tiers for the same diagnostic reason those two are kept apart: a rising
 * `meal-alias` share is the meal alias table earning its keep.
 */
export type MealTier = 'meal-exact' | 'meal-alias';

export interface MealEntryResolution {
  /** The whole typed string, trimmed. */
  text: string;
  /** The key it normalised to. */
  key: string;
  tier: MealTier;
  meal: IndexMeal;
}

/**
 * THE FIRST STEP OF RESOLUTION: does the WHOLE typed string name a meal we have
 * photographed as one plate?
 *
 * Exactly the same machinery as `resolveFragment`, on purpose — one
 * normaliser, one alias-table discipline, no second matcher. The only
 * difference is which map it consults and that it never segments: a meal is
 * matched whole or not at all.
 *
 * ── WHY THIS IS NOT LOOSER THAN THE DISH MATCHER, DESPITE BEING HARDER ──
 * Meal strings are long, free-text and vary in ways dish names do not
 * ("+ sabzi" vs "+ mixed veg sabzi"), so the pull toward scoring is stronger
 * here than anywhere else in this repo. It is refused for a stronger reason: a
 * wrong DISH photo misrepresents one third of a row, and a wrong MEAL photo
 * misrepresents the whole of it. The ordering the design commits to is
 *
 *     right meal  >  right fragments  >  nothing  >  wrong meal
 *
 * and a near-miss must therefore land on "right fragments", which is exactly
 * what an exact map lookup does when it misses. Word ORDER is significant for
 * the same reason: sorting the tokens before lookup would make "roti + dal"
 * and "dal + roti" the same key, which is one plausible-sounding step from
 * making any bag of the same words the same key.
 */
export function resolveMealEntry(idx: LoadedIndex, mealName: string): MealEntryResolution | null {
  const key = normalise(mealName);
  if (!key) return null;

  const meal = idx.byMealKey.get(key);
  if (!meal) return null;

  const isCanonical = normalise(meal.name) === key;
  return {
    text: mealName.trim(),
    key,
    tier: isCanonical ? 'meal-exact' : 'meal-alias',
    meal,
  };
}

export interface FragmentResolution {
  /** The fragment as it was typed, trimmed. */
  text: string;
  /** The lookup key it normalised to. Useful in a miss report. */
  key: string;
  tier: Tier;
  dish: IndexDish | null;
}

/**
 * Resolve one already-segmented fragment. Never splits further — `resolveMeal`
 * owns the soft-split fallback so that the decision is visible in one place.
 */
export function resolveFragment(idx: LoadedIndex, text: string): FragmentResolution {
  const key = normalise(text);
  const trimmed = text.trim();

  if (!key) return { text: trimmed, key, tier: 'unresolved', dish: null };

  const bySlug = idx.bySlug.get(key.replace(/ /g, '-'));
  if (bySlug) return { text: trimmed, key, tier: 'exact', dish: bySlug };

  const byKey = idx.byKey.get(key);
  if (byKey) {
    const isCanonical = normalise(byKey.name) === key;
    return { text: trimmed, key, tier: isCanonical ? 'exact' : 'alias', dish: byKey };
  }

  return { text: trimmed, key, tier: 'unresolved', dish: null };
}

/**
 * Segment a whole meal name and resolve every fragment.
 *
 * The soft " with " split is applied ONLY to a fragment that failed whole, and
 * only when at least one of its parts resolves — otherwise "oats with milk"
 * would be reported as two misses instead of one, which would put two wrong
 * lines into the corpus-growth queue.
 */
export function resolveMealFragments(idx: LoadedIndex, mealName: string): FragmentResolution[] {
  const out: FragmentResolution[] = [];

  for (const raw of segment(mealName)) {
    const whole = resolveFragment(idx, raw);
    if (whole.tier !== 'unresolved') {
      out.push(whole);
      continue;
    }

    const parts = softSplit(raw);
    if (!parts) {
      out.push(whole);
      continue;
    }

    const resolvedParts = parts.map((p) => resolveFragment(idx, p));
    if (resolvedParts.some((p) => p.tier !== 'unresolved')) {
      out.push(...resolvedParts);
    } else {
      // Nothing was gained by splitting. Report the fragment as the user typed
      // it, so the miss report names a real thing rather than its halves.
      out.push(whole);
    }
  }

  return out;
}
