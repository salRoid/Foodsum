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

import { loadIndex, type FoodsumIndex, type LoadedIndex } from './index-schema.ts';
import { resolveMealFragments, type FragmentResolution, type Tier } from './resolve.ts';
import { imageUrlFor, type ImageUrlOptions } from './variant.ts';

export interface MealImage {
  slug: string;
  name: string;
  tier: Tier;
  /** The fragment this image stands for, as typed. */
  fragment: string;
  url: string;
}

export interface MealResolution {
  input: string;
  fragments: FragmentResolution[];
  /** Renderable images, in the order the dishes were typed. May be empty. */
  images: MealImage[];
  /** Fragments that resolved to a dish but that dish has no image on disk. */
  withoutImages: string[];
  /** Normalised keys that resolved to nothing. This is the corpus-growth queue. */
  misses: string[];
  /** True when every fragment reached a dish (with or without an image). */
  fullyResolved: boolean;
}

export interface ResolveOptions extends ImageUrlOptions {
  /** Cap on returned images. Default 3 — a strip, not a gallery. */
  maxImages?: number;
}

/**
 * Resolve a meal name to a small ordered strip of images.
 *
 * `resolve('Dal + 1 roti + mixed veg sabzi')` → three images.
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

  const images: MealImage[] = [];
  const withoutImages: string[] = [];
  const misses: string[] = [];

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
    fragments,
    images,
    withoutImages,
    misses,
    fullyResolved: fragments.length > 0 && fragments.every((f) => f.dish !== null),
  };
}

export { loadIndex };
export type { FoodsumIndex, LoadedIndex, FragmentResolution, Tier };
export { resolveFragment, resolveMealFragments, RENDERABLE_TIERS } from './resolve.ts';
export { imageUrlFor, pickVariant, hash32 } from './variant.ts';
export { normalise } from './normalise.ts';
export { segment, softSplit } from './segment.ts';
export { SIZES, FORMATS, LARGEST } from './index-schema.ts';
export type { Size, Format, IndexDish } from './index-schema.ts';
