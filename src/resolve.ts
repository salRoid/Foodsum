// Resolution — fragment in, dish or nothing out.
//
// ── THE TIERS ──
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
import type { IndexDish, LoadedIndex } from './index-schema.ts';

export type Tier = 'exact' | 'alias' | 'unresolved';

/** Tiers whose result may be shown to a user. */
export const RENDERABLE_TIERS: readonly Tier[] = ['exact', 'alias'];

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
