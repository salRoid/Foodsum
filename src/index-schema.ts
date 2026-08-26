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

/**
 * ── THE SHAPE A SLOT NEEDS ──
 *
 * One photograph, several crops. A consumer does not have one hole to fill:
 * Health alone renders a dish in a wide half-width band, in a card hero, and
 * in a round medallion, and a 4:3 picture is wrong in two of the three. So a
 * variant carries the SAME image cropped to each aspect, and a caller asks for
 * the shape it needs rather than for a pixel size it has to work out.
 *
 * THE URL SHAPE DOES NOT CHANGE, and that is what makes this additive: a rung
 * is still `<base>/<slug>/<variant>/<size>.<format>`, and every size string in
 * every ladder is globally unique, so the aspect is a lookup convenience over
 * a namespace that was already flat and explicit. An index written before
 * aspects existed still loads and still serves its 4:3 rungs.
 *
 * `4:3` is the default and is unchanged in every respect — it is what the
 * existing images were ingested as and what `imageUrlFor` still returns when
 * nobody asks for anything else.
 */
export const ASPECTS = ['4:3', '1:1', '16:9'] as const;
export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_SIZES = {
  '4:3': SIZES,
  '1:1': ['120x120', '300x300', '600x600', '900x900'],
  '16:9': ['160x90', '400x225', '800x450', '1200x675'],
} as const satisfies Record<Aspect, readonly string[]>;

/** Every rung in every ladder. Flat, and every string in it is unique. */
export const ALL_SIZES = [
  ...ASPECT_SIZES['4:3'],
  ...ASPECT_SIZES['1:1'],
  ...ASPECT_SIZES['16:9'],
] as const;
export type AnySize = (typeof ALL_SIZES)[number];

/**
 * The rung each aspect's cards actually render, and the one whose weight
 * budget is spec rather than a tooling default. Only `4:3`'s is MANDATORY at
 * ingest — see `scripts/ingest.mjs`. A narrow aspect contributes whatever
 * rungs the source can supply and nothing more, so adding aspects cannot make
 * a file that used to ingest start failing.
 */
export const ASPECT_CANONICAL = {
  '4:3': '400x300',
  '1:1': '300x300',
  '16:9': '400x225',
} as const satisfies Record<Aspect, AnySize>;

/** The largest rung of each ladder — what `imageUrlFor` uses for an aspect. */
export const ASPECT_LARGEST = {
  '4:3': '1200x900',
  '1:1': '900x900',
  '16:9': '1200x675',
} as const satisfies Record<Aspect, AnySize>;

/** Which aspect a rung belongs to. Unambiguous — the strings do not collide. */
export function aspectOf(size: string): Aspect | null {
  for (const a of ASPECTS) {
    if ((ASPECT_SIZES[a] as readonly string[]).includes(size)) return a;
  }
  return null;
}

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

/**
 * A whole MEAL — one photograph of a composed plate.
 *
 * Structurally almost a dish, and deliberately so: it lives in the same
 * `corpus/images/<slug>/` tree, carries the same `variants`/`variantMeta`, and
 * goes through the same ingest and check. The only shape differences are
 * `kind`, which makes the two distinguishable in one flat URL namespace, and
 * `dishes`, the components resolved at build time (diagnostic, and the guard
 * that a meal composes at least two dishes we know).
 */
export interface IndexMeal {
  kind: 'meal';
  slug: string;
  name: string;
  /** Whole-meal keys, ALREADY NORMALISED at build time. Includes the name. */
  keys: string[];
  variants: number;
  /** Dish slugs this meal composes, derived through the dish matcher at build. */
  dishes: string[];
  /** Fragments of the meal name that reached no dish. Usually a refusal like "salad". */
  unresolvedParts?: string[];
  /** How often this exact string appears in the 37 real Meal rows. */
  loggedTimes?: number;
  variantMeta?: VariantMeta[];
}

export interface FoodsumIndex {
  version: 1;
  generatedAt: string;
  /** Where images are served from. A consumer may override per call. */
  baseUrl: string;
  /** Every rung the corpus can hold, across every aspect. */
  sizes: readonly AnySize[];
  /**
   * The rungs of each aspect. OPTIONAL, so an index written before aspects
   * existed still loads — a consumer on one simply never asks for a crop.
   */
  aspects?: Record<Aspect, readonly string[]>;
  formats: readonly Format[];
  dishes: IndexDish[];
  /**
   * Whole-meal entries. OPTIONAL, so an index written before meals existed
   * still loads and behaves exactly as it did — the hybrid is additive, and a
   * consumer on an older index simply never gets a meal hit.
   */
  meals?: IndexMeal[];
}

/** An index plus its O(1) lookup tables, built once per index load. */
export interface LoadedIndex {
  raw: FoodsumIndex;
  /** Dish slugs only. NOT meals — a fragment must never tier-1 hit a meal. */
  bySlug: Map<string, IndexDish>;
  /** Dish alias keys only. */
  byKey: Map<string, IndexDish>;
  /** Meal slugs only. */
  byMealSlug: Map<string, IndexMeal>;
  /** Whole-meal alias keys only. Consulted BEFORE fragmentation, never during. */
  byMealKey: Map<string, IndexMeal>;
}

/**
 * Validate and load. Throws on a structurally broken index rather than
 * degrading, because a malformed index in a consumer is a silent wrong-answer
 * risk, and this is the one moment it can still be caught loudly.
 *
 * A DUPLICATE KEY IS FATAL. Two dishes claiming the same alias means the
 * resolution of that string depends on array order, which is exactly the class
 * of quiet ambiguity this matcher exists to refuse.
 *
 * ── ONE SLUG NAMESPACE, TWO LOOKUP NAMESPACES ──
 * Meals and dishes share ONE slug namespace and a duplicate across the two is
 * fatal, because the slug is the URL and both kinds are served out of the same
 * `corpus/images/<slug>/` tree — two entries claiming `greek-yogurt` would
 * silently fight over one directory, and nothing downstream could tell.
 *
 * Their LOOKUP tables are separate, because they answer different questions:
 * `byMealKey` is consulted once against the whole typed string, `byKey` is
 * consulted per fragment. Merging them would let a fragment tier-1 hit a meal
 * (a third of a plate returning a picture of the whole plate) and let a whole
 * string hit a dish. A key claimed by both a meal and a dish is therefore also
 * fatal: the same string would mean two different things depending only on
 * which stage of resolution looked at it.
 */
export function loadIndex(raw: unknown): LoadedIndex {
  const idx = raw as FoodsumIndex;
  if (!idx || idx.version !== 1 || !Array.isArray(idx.dishes)) {
    throw new Error('foodsum: not a version-1 index');
  }

  const bySlug = new Map<string, IndexDish>();
  const byKey = new Map<string, IndexDish>();
  const byMealSlug = new Map<string, IndexMeal>();
  const byMealKey = new Map<string, IndexMeal>();

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

  for (const m of idx.meals ?? []) {
    if (!m.slug || !Array.isArray(m.keys)) {
      throw new Error(`foodsum: malformed meal entry ${JSON.stringify(m)}`);
    }
    if (byMealSlug.has(m.slug)) throw new Error(`foodsum: duplicate meal slug "${m.slug}"`);
    if (bySlug.has(m.slug)) {
      throw new Error(
        `foodsum: slug "${m.slug}" is claimed by both a dish and a meal — ` +
          'they share one URL namespace and one images directory',
      );
    }
    byMealSlug.set(m.slug, m);
    for (const k of m.keys) {
      const clash = byMealKey.get(k);
      if (clash && clash.slug !== m.slug) {
        throw new Error(
          `foodsum: meal key "${k}" claimed by both "${clash.slug}" and "${m.slug}"`,
        );
      }
      const dishClash = byKey.get(k);
      if (dishClash) {
        throw new Error(
          `foodsum: key "${k}" is claimed by dish "${dishClash.slug}" and meal "${m.slug}" — ` +
            'one string cannot mean a dish at fragment level and a meal at row level',
        );
      }
      byMealKey.set(k, m);
    }
  }

  return { raw: idx, bySlug, byKey, byMealSlug, byMealKey };
}
