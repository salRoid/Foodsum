// Index construction. Kept out of the script so it can be run against an
// arbitrary images root in a test — the "drop a file in and it appears" claim
// is the corpus's entire growth story, and a claim that is never executed is
// a claim.

import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DISHES, type Dish } from './dishes.ts';
import { normaliseAlias } from './normalise.ts';
import {
  SIZES,
  FORMATS,
  loadIndex,
  type FoodsumIndex,
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
): FoodsumIndex {
  const index: FoodsumIndex = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    baseUrl,
    sizes: [...SIZES],
    formats: [...FORMATS],
    dishes: dishes.map((d) => {
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
    }),
  };

  // Validate before returning: `loadIndex` throws on a duplicate slug or a
  // contested alias. Emitting an index that cannot be loaded would push the
  // failure into every consumer instead of stopping it at the source.
  loadIndex(index);
  return index;
}
