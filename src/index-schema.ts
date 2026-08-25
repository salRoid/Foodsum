// `index.json` — the only artefact a consumer loads.
//
// THE STRUCTURAL DECISION, restated because everything else depends on it:
// the index ships to the client and matching happens there. There is no
// matching service. That deletes a network hop per meal row, a cold start, a
// rate limit and an availability dependency, and it makes resolution work
// offline. A consumer fetches this once, caches it, and never calls us again.
//
// It is a few tens of KB gzipped at a few hundred dishes, which is why that is
// affordable.

/** Fixed size ladder. Not arbitrary — `400x397` is a 404, on purpose. */
export const SIZES = ['160x120', '400x300', '800x600', '1200x900'] as const;
export type Size = (typeof SIZES)[number];

export const FORMATS = ['webp', 'jpg'] as const;
export type Format = (typeof FORMATS)[number];

/** The largest rung. `imageUrlFor` uses it when no size is asked for. */
export const LARGEST: Size = '1200x900';

/**
 * What `npm run ingest` recorded about one variant folder, mirrored into the
 * index from that folder's `meta.json`.
 *
 * `styleVersion` is the load-bearing field: STYLE.md is versioned, so a
 * restyle bumps it and `npm run check -- --style` can then list every image
 * still on the old one. Without it a restyle has no way to find its own work.
 *
 * Omitted entirely when a dish has no images, so an empty corpus's index is
 * byte-identical to what it was before this field existed.
 */
export interface VariantMeta {
  /** 1-indexed variant number — the folder name. */
  v: number;
  /** The `STYLE.md` version this image was generated and ingested under. */
  styleVersion: string;
  /** Rungs of the size ladder that actually exist on disk, sorted. */
  sizes: string[];
}

export interface IndexDish {
  slug: string;
  name: string;
  category: string;
  /** Alias keys, ALREADY NORMALISED at build time. Includes the slug and name. */
  keys: string[];
  /** How many variant folders exist on disk. 0 is valid and common. */
  variants: number;
  fromHealthFoodTable?: boolean;
  /** Per-variant provenance. Absent when `variants` is 0. */
  variantMeta?: VariantMeta[];
}

export interface FoodsumIndex {
  version: 1;
  generatedAt: string;
  /** Where images are served from. A consumer may override per call. */
  baseUrl: string;
  sizes: readonly Size[];
  formats: readonly Format[];
  dishes: IndexDish[];
}

/** A dish plus its O(1) lookup table, built once per index load. */
export interface LoadedIndex {
  raw: FoodsumIndex;
  bySlug: Map<string, IndexDish>;
  byKey: Map<string, IndexDish>;
}

/**
 * Validate and load. Throws on a structurally broken index rather than
 * degrading, because a malformed index in a consumer is a silent wrong-answer
 * risk, and this is the one moment it can still be caught loudly.
 *
 * A DUPLICATE KEY IS FATAL. Two dishes claiming the same alias means the
 * resolution of that string depends on array order, which is exactly the class
 * of quiet ambiguity this matcher exists to refuse.
 */
export function loadIndex(raw: unknown): LoadedIndex {
  const idx = raw as FoodsumIndex;
  if (!idx || idx.version !== 1 || !Array.isArray(idx.dishes)) {
    throw new Error('foodsum: not a version-1 index');
  }

  const bySlug = new Map<string, IndexDish>();
  const byKey = new Map<string, IndexDish>();

  for (const d of idx.dishes) {
    if (!d.slug || !Array.isArray(d.keys)) {
      throw new Error(`foodsum: malformed dish entry ${JSON.stringify(d)}`);
    }
    if (bySlug.has(d.slug)) throw new Error(`foodsum: duplicate slug "${d.slug}"`);
    bySlug.set(d.slug, d);
    for (const k of d.keys) {
      const clash = byKey.get(k);
      if (clash && clash.slug !== d.slug) {
        throw new Error(
          `foodsum: alias "${k}" claimed by both "${clash.slug}" and "${d.slug}"`,
        );
      }
      byKey.set(k, d);
    }
  }

  return { raw: idx, bySlug, byKey };
}
