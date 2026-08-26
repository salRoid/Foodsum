// Index construction. Kept out of the script so it can be run against an
// arbitrary images root in a test — the "drop a file in and it appears" claim
// is the corpus's entire growth story, and a claim that is never executed is
// a claim.

import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DISHES, type Dish } from './dishes.ts';
import { MEALS, type Meal } from './meals.ts';
import { normaliseAlias } from './normalise.ts';
import { resolveMealFragments } from './resolve.ts';
import {
  SIZES,
  ALL_SIZES,
  ASPECT_SIZES,
  FORMATS,
  loadIndex,
  type FoodsumIndex,
  type IndexDish,
  type IndexMeal,
  type VariantMeta,
} from './index-schema.ts';

/**
 * Count variant folders for a slug: `<imagesRoot>/<slug>/<n>/`.
 *
 * A missing folder counts 0. An EMPTY CORPUS IS A VALID CORPUS — the library
 * ships that way, every dish still resolves, and every consumer correctly
 * renders nothing. That is not a degraded mode to be fixed before use.
 */
export function countVariants(imagesRoot: string, slug: string): number {
  const dir = join(imagesRoot, slug);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(
    (e) => /^\d+$/.test(e) && statSync(join(dir, e)).isDirectory(),
  ).length;
}

/** 1-indexed variant folder names for a slug, sorted numerically. */
function variantDirs(imagesRoot: string, slug: string): number[] {
  const dir = join(imagesRoot, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => /^\d+$/.test(e) && statSync(join(dir, e)).isDirectory())
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Read each variant's `meta.json` sidecar, written by `npm run ingest`.
 *
 * The SIDECAR is the source of truth, not the index: it lives beside the image
 * it describes, so moving or deleting a variant folder cannot leave a stale
 * record behind, and `npm run build` stays a pure function of what is on disk.
 * A variant with no sidecar (a file dropped in by hand, pre-pipeline) is
 * reported as `styleVersion: 'unknown'` rather than silently claiming v1 —
 * `npm run check` then flags it.
 */
function readVariantMeta(imagesRoot: string, slug: string): VariantMeta[] {
  return variantDirs(imagesRoot, slug).map((v) => {
    const dir = join(imagesRoot, slug, String(v));
    const sizes = readdirSync(dir)
      .filter((f) => /^\d+x\d+\.(webp|jpg)$/.test(f))
      .map((f) => f.replace(/\.(webp|jpg)$/, ''))
      .sort();
    let styleVersion = 'unknown';
    try {
      const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
      if (typeof meta.styleVersion === 'string') styleVersion = meta.styleVersion;
    } catch {
      /* no sidecar — 'unknown', flagged by `npm run check` */
    }
    return { v, styleVersion, sizes: [...new Set(sizes)] };
  });
}

export function buildIndex(
  imagesRoot: string,
  dishes: Dish[] = DISHES,
  baseUrl = '/i',
  meals: Meal[] = MEALS,
): FoodsumIndex {
  const dishEntries: IndexDish[] = dishes.map((d) => {
    const keys = new Set([
      normaliseAlias(d.slug.replace(/-/g, ' ')),
      normaliseAlias(d.name),
      ...d.aliases.map(normaliseAlias),
    ]);
    keys.delete('');
    const variantMeta = readVariantMeta(imagesRoot, d.slug);
    return {
      slug: d.slug,
      name: d.name,
      category: d.category,
      keys: [...keys].sort(),
      variants: countVariants(imagesRoot, d.slug),
      ...(d.fromHealthFoodTable ? { fromHealthFoodTable: true } : {}),
      // Omitted when there are no images, so an empty corpus's index is
      // byte-identical to what it was before this field existed.
      ...(variantMeta.length ? { variantMeta } : {}),
    };
  });

  // A meal's COMPONENTS are derived, never hand-written: the meal name is run
  // back through the real dish matcher, against a dish-only index. Two things
  // fall out of that, and both are the reason it is done this way rather than
  // by listing the slugs in `meals.ts`:
  //   · a typo in a meal name is caught here, because the components stop
  //     resolving — a hand-written list would agree with itself forever;
  //   · the components cannot drift from what the matcher would actually say
  //     about the same string.
  const dishOnly = loadIndex({
    version: 1,
    generatedAt: '',
    baseUrl,
    sizes: [...SIZES],
    formats: [...FORMATS],
    dishes: dishEntries,
  });

  const mealEntries: IndexMeal[] = meals.map((m) => {
    const keys = new Set([normaliseAlias(m.name), ...m.aliases.map(normaliseAlias)]);
    keys.delete('');

    const frags = resolveMealFragments(dishOnly, m.name);
    const components = [...new Set(frags.filter((f) => f.dish).map((f) => f.dish!.slug))];
    const unresolvedParts = frags.filter((f) => !f.dish && f.key).map((f) => f.key);

    // A meal must COMPOSE. One dish typed alone is a dish, and giving it a
    // second slug would mean two URLs for one picture of one thing — with
    // nothing to say which of them a consumer should have asked for.
    if (components.length < 2) {
      throw new Error(
        `foodsum: meal "${m.slug}" composes only ${components.length} known dish(es) ` +
          `(${components.join(', ') || 'none'}). A meal is a plate of at least two — ` +
          'a single dish belongs in dishes.ts.',
      );
    }

    // The meal slug must not be derivable from the components alone by luck:
    // it is the URL, so it is hand-written, and this only checks it is sane.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.slug)) {
      throw new Error(`foodsum: meal slug "${m.slug}" is not URL-safe`);
    }

    const variantMeta = readVariantMeta(imagesRoot, m.slug);
    return {
      kind: 'meal' as const,
      slug: m.slug,
      name: m.name,
      keys: [...keys].sort(),
      variants: countVariants(imagesRoot, m.slug),
      dishes: components,
      ...(unresolvedParts.length ? { unresolvedParts } : {}),
      ...(m.loggedTimes ? { loggedTimes: m.loggedTimes } : {}),
      ...(variantMeta.length ? { variantMeta } : {}),
    };
  });

  const index: FoodsumIndex = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    baseUrl,
    // Every rung across every aspect, plus the per-aspect ladders. `sizes` has
    // always meant "what this corpus can hold", and it still does — it simply
    // holds more shapes now. A rung a variant does not have is still a 404,
    // which is what `variantMeta` is for.
    sizes: [...ALL_SIZES],
    aspects: {
      '4:3': [...ASPECT_SIZES['4:3']],
      '1:1': [...ASPECT_SIZES['1:1']],
      '16:9': [...ASPECT_SIZES['16:9']],
    },
    formats: [...FORMATS],
    dishes: dishEntries,
    ...(mealEntries.length ? { meals: mealEntries } : {}),
  };

  // Validate before returning: `loadIndex` throws on a duplicate slug, a
  // contested alias, and — now — a slug or key claimed by both a dish and a
  // meal. Emitting an index that cannot be loaded would push the failure into
  // every consumer instead of stopping it at the source.
  loadIndex(index);
  return index;
}
