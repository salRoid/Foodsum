// The MEAL catalogue — whole plates that are photographed as one picture.
//
// ── WHY THIS EXISTS AT ALL ──
// Measured against Sal's real data: 37 logged `Meal` rows are 28 DISTINCT
// strings, and they barely repeat — `Dal + 1 roti + mixed veg sabzi`,
// `Dal + 1 roti + sabzi` and `Dal + 1 roti + sprouts salad` are three
// near-identical plates typed three ways. 25 DISHES cover all 28 of those
// strings and every future combination of them, which is why per-dish is the
// base and stays the base: the combination space is unbounded, and a per-meal
// corpus would spend most of its images on a plate eaten once.
//
// But a strip of three dish photos is not a picture of a meal. So the handful
// of plates that DO repeat get a real photograph of the whole plate, and that
// picture wins when the whole string matches. Everything else falls back to
// fragments, unchanged.
//
// ── THE PRECEDENCE RULE, AND ITS ORDERING ──
//   1. a meal photo that exists          best
//   2. per-fragment dish photos          good
//   3. nothing                           safe
//   4. the WRONG meal photo              unacceptable
//
// That ordering is why meal matching is the same exact-map lookup the dish
// matcher uses, and nothing looser. A meal string is long and free-text, so the
// temptation to score it is stronger here than anywhere else in this repo — and
// the cost of being wrong is higher, because a wrong meal photo misrepresents
// the ENTIRE row rather than one third of it. A near-miss meal must fall to
// fragments. See `resolveMealEntry` in `resolve.ts`.
//
// ── SLUGS ARE HAND-WRITTEN, AND SHARE THE DISH URL SPACE ──
// A meal's images live in the same `corpus/images/<slug>/` tree as a dish's,
// because they are served from the same URL space and go through the same
// ingest. So a meal slug and a dish slug may never collide — `loadIndex`
// throws if they do, and `npm run check` reports it. They are hand-written
// rather than derived from the name, because the slug is the URL and deriving
// it would tie every URL to the current behaviour of `normalise`.
//
// ── WHAT IS NOT A MEAL ──
// A single dish typed alone is not a meal, however often it repeats.
// `Whey shake (1.5 scoop)` is the 3rd most-logged string in the real data and
// is deliberately absent: `whey-protein-shake` already answers it exactly, and
// a meal entry would be a second slug for one picture of one thing.
// `buildIndex` enforces this — a meal must compose at least two known dishes.

export interface Meal {
  /** Permanent, URL-safe id. Shares one namespace with dish slugs. */
  slug: string;
  /**
   * Display name, written the way the meal is actually logged — INCLUDING its
   * portions. Unlike a dish, a meal takes no portion from Health's `Food`
   * table: the portions live inside the typed string ("200g", "2 boiled
   * eggs"), and the generation prompt uses this name verbatim.
   */
  name: string;
  /** Exact whole-meal strings a person might type. Normalised at build time. */
  aliases: string[];
  /** How often this exact string appears in the 37 real Meal rows. Demand, not code. */
  loggedTimes: number;
  note?: string;
}

/**
 * Stage-1 meal catalogue: the four strings that actually repeat in the real
 * logs, plus two that are Sal's standing plan entries. Six entries, chosen from
 * demand rather than imagination — the same rule `dishes.ts` follows.
 */
export const MEALS: Meal[] = [
  {
    slug: 'oats-with-milk-boiled-eggs',
    name: 'Oats with milk + 2 boiled eggs',
    loggedTimes: 3,
    aliases: ['oats with milk + 2 boiled eggs', 'oats with milk + boiled eggs'],
    note: 'Joint most-logged string. Note "oats with milk" survives normalisation whole, so this key is "oats with milk boiled eggs" — the soft " with " split never runs at meal level.',
  },
  {
    slug: 'greek-yogurt-almonds',
    name: 'Greek yogurt 200g + 8 almonds',
    loggedTimes: 3,
    aliases: ['greek yogurt 200g + 8 almonds', 'greek yogurt + almonds', 'hung curd + almonds'],
  },
  {
    slug: 'greek-yogurt-banana',
    name: 'Greek yogurt 200g + banana',
    loggedTimes: 2,
    aliases: ['greek yogurt 200g + banana', 'greek yogurt + banana'],
  },
  {
    slug: 'dal-roti-sprouts-salad',
    name: 'Dal + 1 roti + sprouts salad',
    loggedTimes: 2,
    aliases: ['dal + 1 roti + sprouts salad', 'dal + roti + sprouts salad'],
  },
  {
    slug: 'dal-roti-mixed-veg-sabzi',
    name: 'Dal + 1 roti + mixed veg sabzi',
    loggedTimes: 1,
    aliases: [
      'dal + 1 roti + mixed veg sabzi',
      'dal + roti + mixed vegetable sabzi',
      // The ONE meal alias that rests on judgement rather than on the string
      // being written twice. It is justified by exactly the precedent
      // `dishes.ts` already records for the bare word: Health's curated `Food`
      // table contains "Mixed Vegetable Sabzi", and Sal's logs use the bare and
      // full forms interchangeably in the same week. If that dish-level alias
      // is ever withdrawn, withdraw this one with it.
      'dal + 1 roti + sabzi',
    ],
    note: 'A standing plan entry, logged once. Its near neighbours differ only in the third dish, which is why meal matching must stay an exact map hit — a scored matcher would answer any of the three with whichever picture it had.',
  },
  {
    slug: 'roti-aloo-palak-boondi-raita-cucumber',
    name: '2 roti + aloo palak + boondi raita + cucumber',
    loggedTimes: 1,
    aliases: [
      '2 roti + aloo palak + boondi raita + cucumber',
      'roti + aloo palak + boondi raita + cucumber',
      '2 roti + aloo palak + boondi raita',
    ],
  },
  {
    slug: 'egg-bhurji-roti-salad',
    name: 'Egg bhurji + 2 roti + salad',
    loggedTimes: 1,
    aliases: [
      'egg bhurji + 2 roti + salad',
      'egg bhurji + roti + salad',
      'egg bhurji (2 eggs + 2 whites) + 2 roti',
      'egg bhurji (3 eggs) + 1 roti',
    ],
  },
  {
    slug: 'paneer-bhurji-roti-salad',
    name: 'Paneer bhurji + 1 roti + salad',
    loggedTimes: 1,
    aliases: ['paneer bhurji + 1 roti + salad', 'paneer bhurji + roti + salad'],
    note: 'Composes to two known dishes; "salad" is a deliberate refusal at dish level (a category, not a dish) and stays unresolved as a component. That is fine here — the MEAL picture shows the salad that was actually on the plate, which is precisely the thing a generic salad photo could not.',
  },
];

/**
 * Whole-meal strings from the real data that deliberately have NO meal entry,
 * with the reason. Documentation, not code — the same job `REFUSED` does in
 * `dishes.ts`: so the next reader can tell "not built yet" from "refused".
 */
export const MEALS_NOT_TAKEN: Record<string, string> = {
  'Whey shake (1.5 scoop)':
    'A single dish, not a composed plate. Logged 5× across two spellings and already answered exactly by `whey-protein-shake`. A meal entry here would be a second slug for one picture of one thing.',
  'Greek yogurt 200g':
    'Single dish. Same reason.',
  Apple: 'Single dish. Same reason.',
  'Tea + 4 Marie Gold biscuits + 4 almonds + 2 walnuts':
    'Contains a brand. The brand rule applies to a plate as much as to a dish — a generated Marie Gold biscuit reproduces trade dress whatever else is in frame.',
};
