// The consumer surface. Name in → images out, or nothing.
//
// The contract a consumer must honour, in one sentence: `images` may be empty,
// and an empty `images` means RENDER NOTHING — not a placeholder, not a
// spinner, not a reserved box. That is the same rule `exerciseArtSlug()`
// already has in Health, and it is the reason there is no error path to design
// here: a miss and an outage produce the same, already-correct, output.
//
// Rendering only the FIRST hit as one hero image was the obvious shape and is
// wrong for this data: 81% of real rows are compound, so one image silently
// misrepresents the meal. `images` is a small ordered strip, capped, and it
// collapses to a single image on its own when the meal really is one dish.
//
// The one case where a single hero image IS right is a plate we have
// photographed whole — see the resolution order on `resolveMeal`. That is the
// hybrid: per-dish is the base because the combination space is unbounded
// (37 real rows, 28 distinct strings, 25 dishes covering all of them), and a
// real photograph wins for the handful of plates that actually repeat.

import { loadIndex, type FoodsumIndex, type LoadedIndex } from './index-schema.ts';
import {
  resolveMealEntry,
  resolveMealFragments,
  type FragmentResolution,
  type MealTier,
  type Tier,
} from './resolve.ts';
import { imageUrlFor, type ImageUrlOptions } from './variant.ts';

export interface MealImage {
  slug: string;
  name: string;
  tier: Tier | MealTier;
  /** The fragment this image stands for, as typed. For a meal hit: the whole string. */
  fragment: string;
  url: string;
}

/** The whole-meal hit, when the typed string named a plate in the catalogue. */
export interface MealEntryHit {
  slug: string;
  name: string;
  tier: MealTier;
  /** The dish slugs this meal composes. */
  dishes: string[];
  /**
   * False when the meal matched but has no photograph yet — in which case
   * `images` came from the fragments instead, exactly as before meals existed.
   */
  rendered: boolean;
}

export interface MealResolution {
  input: string;
  /**
   * The whole-meal hit, or null. Populated even when the meal has no image, so
   * a caller can tell "no such meal" from "that meal is in the generation
   * queue" — and so `npm run missing` has something to count.
   */
  meal: MealEntryHit | null;
  /**
   * Fragment resolutions. Always computed, including on a rendered meal hit,
   * because they are what a report and a caption are built from.
   */
  fragments: FragmentResolution[];
  /**
   * Renderable images. Either ONE meal photograph, or the per-dish strip in
   * the order the dishes were typed. May be empty.
   */
  images: MealImage[];
  /** Fragments that resolved to a dish but that dish has no image on disk. */
  withoutImages: string[];
  /** Normalised keys that resolved to nothing. This is the corpus-growth queue. */
  misses: string[];
  /**
   * True when every fragment reached a dish (with or without an image) — OR
   * when a whole-meal photograph rendered, which is a stronger statement about
   * the same question and deliberately reported the same way.
   *
   * This is load-bearing for a consumer with ONE image slot:
   * `Health/lib/foodImage.ts` shows a picture only when `fullyResolved` and
   * `withoutImages` is empty, precisely so that one fragment's photo never
   * stands in for a meal it does not know the whole of. A rendered meal photo
   * IS the whole of it, so `Paneer bhurji + 1 roti + salad` — whose "salad"
   * fragment is a deliberate refusal, and which therefore showed nothing
   * before — now shows the plate.
   */
  fullyResolved: boolean;
}

export interface ResolveOptions extends ImageUrlOptions {
  /** Cap on returned images. Default 3 — a strip, not a gallery. */
  maxImages?: number;
}

/**
 * Resolve a meal name to one meal photograph, or a small ordered strip of dish
 * images, or nothing.
 *
 * ── THE RESOLUTION ORDER, WHICH IS THE WHOLE HYBRID ──
 *   1. The WHOLE string names a meal in the catalogue AND that meal has a
 *      photograph  →  that one image. Done. Fragments are not consulted.
 *   2. Otherwise  →  per-fragment resolution, byte-for-byte the behaviour that
 *      existed before meals did. A meal entry that matched but has no picture
 *      yet lands here too: an empty meal slot must never suppress the dish
 *      images that would otherwise have rendered.
 *   3. Nothing resolves  →  `images: []` → render nothing.
 *
 * Step 1 is deliberately conditional on the image EXISTING rather than on the
 * meal matching. That is what makes the whole feature additive: with an empty
 * corpus — the state this ships in — every call takes step 2 and behaves
 * exactly as it always did.
 *
 * `resolve('Dal + 1 roti + mixed veg sabzi')` → one plate photo, or three dishes.
 * `resolve('Tea + 4 Marie Gold biscuits')`    → one (the brand is refused).
 * `resolve('something nobody logged')`        → `images: []` → render nothing.
 */
export function resolveMeal(
  idx: LoadedIndex,
  mealName: string,
  opts: ResolveOptions = {},
): MealResolution {
  const fragments = resolveMealFragments(idx, mealName);
  const maxImages = opts.maxImages ?? 3;

  // ── step 1: the whole plate ──────────────────────────────────────────────
  const hit = resolveMealEntry(idx, mealName);
  if (hit) {
    // `imageUrlFor` takes anything carrying `slug` + `variants`, and a meal
    // carries both — meals and dishes share one images tree and one URL shape,
    // so there is deliberately no second URL builder to keep in step.
    const url = imageUrlFor(hit.meal, idx.raw.baseUrl, opts);
    if (url) {
      return {
        input: mealName,
        meal: {
          slug: hit.meal.slug,
          name: hit.meal.name,
          tier: hit.tier,
          dishes: hit.meal.dishes,
          rendered: true,
        },
        fragments,
        images: [
          { slug: hit.meal.slug, name: hit.meal.name, tier: hit.tier, fragment: hit.text, url },
        ],
        // The meal answered the question, so neither list has anything to add:
        // a fragment miss inside a plate we have photographed is not a gap in
        // the corpus, and putting it in the growth queue would ask for an image
        // nothing would ever render.
        withoutImages: [],
        misses: [],
        fullyResolved: true,
      };
    }
  }

  // ── step 2: fragments, unchanged ─────────────────────────────────────────
  const images: MealImage[] = [];
  const withoutImages: string[] = [];
  const misses: string[] = [];

  // NOTE: an imageless meal hit is reported through `meal.rendered === false`,
  // NOT by pushing the meal slug into `withoutImages`. That list means "a DISH
  // that matched and has no picture", it is what a caller counts to decide
  // whether the strip is complete, and mixing a meal slug into it would make
  // the two kinds indistinguishable to every existing consumer.
  for (const f of fragments) {
    if (!f.dish) {
      if (f.key) misses.push(f.key);
      continue;
    }
    const url = imageUrlFor(f.dish, idx.raw.baseUrl, opts);
    if (!url) {
      withoutImages.push(f.dish.slug);
      continue;
    }
    if (images.length < maxImages) {
      images.push({
        slug: f.dish.slug,
        name: f.dish.name,
        tier: f.tier,
        fragment: f.text,
        url,
      });
    }
  }

  return {
    input: mealName,
    meal: hit
      ? {
          slug: hit.meal.slug,
          name: hit.meal.name,
          tier: hit.tier,
          dishes: hit.meal.dishes,
          rendered: false,
        }
      : null,
    fragments,
    images,
    withoutImages,
    misses,
    fullyResolved: fragments.length > 0 && fragments.every((f) => f.dish !== null),
  };
}

export { loadIndex };
export type { FoodsumIndex, LoadedIndex, FragmentResolution, Tier, MealTier };
export {
  resolveFragment,
  resolveMealFragments,
  resolveMealEntry,
  RENDERABLE_TIERS,
} from './resolve.ts';
export { imageUrlFor, pickVariant, hash32 } from './variant.ts';
export { normalise } from './normalise.ts';
export { segment, softSplit } from './segment.ts';
export { SIZES, FORMATS, LARGEST } from './index-schema.ts';
export type { Size, Format, IndexDish, IndexMeal } from './index-schema.ts';
