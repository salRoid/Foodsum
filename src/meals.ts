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
  // ── Combos, 2026-08-31 ─────────────────────────────────────────────────
  // Sal: "idli sambhar is a dish, it's a combo; chole bhature is a dish which
  // comes in combo". A composed plate is what THIS catalogue is for — one
  // photograph of the plate beats a strip of its parts. The parts still exist
  // as dishes (idli alone is real), but the plate leads whenever the logged
  // string names it. Components are DERIVED from `name` by the real matcher.
  {
    slug: 'idli-sambar',
    name: 'Idli + sambar + coconut chutney',
    loggedTimes: 1,
    aliases: ['idli sambar', 'idli sambhar', 'idli sambar chutney',
      '4 idli + 1 katori sambar + 1 katori coconut chutney'],
  },
  {
    slug: 'chole-bhature',
    name: 'Bhature + chole',
    loggedTimes: 1,
    aliases: ['chole bhature', 'chhole bhature', 'chole bhatura', 'chana bhatura',
      '3 bhature + 2 katori chole + 1 gulab jamun + small rice'],
    note: 'The logged plate carried a gulab jamun and rice too; the photograph is the chole bhature, which is what the plate IS.',
  },
  {
    slug: 'masala-dosa-plate',
    name: 'Masala dosa + sambar + coconut chutney',
    loggedTimes: 1,
    aliases: ['masala dosa with sambar and coconut chutney',
      '2 masala dosa with sambar and coconut chutney', 'dosa sambar chutney'],
  },
  {
    slug: 'paneer-lababdar-naan',
    name: 'Paneer lababdar + naan',
    loggedTimes: 1,
    aliases: ['paneer lababdar with naan', 'paneer lababdar naan', 'paneer lababdar and naan',
      'paneer lababdar + 1 naan', 'paneer lababdar + 2 naan',
      '1 naan, paneer lababdar, salt and pepper american corn'],  // the exact logged plate
    note: 'Sal, 2026-08-31: "Paneer Lababdar with Naan was added yesterday". The dish half resolves to paneer-curry; the plate is its own photograph.',
  },
  {
    slug: 'dal-roti-rice',
    name: 'Dal + roti + rice',
    loggedTimes: 1,
    aliases: ['dal roti rice', 'dal rice roti', 'dal roti and rice', 'dal chawal roti',
      'dal + roti + rice', 'dal + 1 roti + rice', 'dal + 2 roti + rice', 'dal + 1 roti + small rice'],
    note: 'Sal, 2026-08-31: "Dal Roti and Rice is a combo too". Sits beside dal-roti-sprouts-salad and dal-roti-mixed-veg-sabzi — same plate family, different third item.',
  },
  // ── THE FULL SWEEP, 2026-08-31 ──────────────────────────────────────────
  // Sal: "Don't miss out on combos — it will bite us in the back." Every one
  // of the 71 production rows was classified; these are the plates that were
  // still resolving as loose fragments. Rule kept from chole-bhature: the exact
  // logged string is an alias even when it carries an extra side, because the
  // photograph is what the plate IS. A string carrying a BRAND is never
  // aliased (MEALS_NOT_TAKEN) — the hero rule handles it instead.
  {
    slug: 'whey-banana-shake',
    name: 'Milk + whey + banana',
    loggedTimes: 7,
    aliases: ['milk + 1 scoop whey + banana', 'milk + whey + banana', 'whey banana shake',
      'banana whey shake', 'milk whey banana'],
    note: 'The SECOND most-logged string in the ledger (7×). One glass, one photograph.',
  },
  {
    slug: 'greek-yogurt-apple',
    name: 'Greek yogurt + apple',
    loggedTimes: 7,
    aliases: ['greek yogurt 200g + apple', 'greek yogurt + apple', 'greek yogurt apple'],
    note: 'Joint second most-logged (7×). Sibling of greek-yogurt-banana and -almonds.',
  },
  {
    slug: 'rajma-roti',
    name: 'Rajma + roti',
    loggedTimes: 3,
    aliases: ['rajma roti', 'rajma + roti', 'rajma + 3 roti + boondi raita',
      '2 roti + rajma + curd', '2 roti + rajma + salad', 'rajma + 2 roti', 'rajma + 3 roti'],
  },
  {
    slug: 'rajma-chawal',
    name: 'Rajma + rice',
    loggedTimes: 1,
    aliases: ['rajma chawal', 'rajma rice', 'rajma + rice', 'rajma + 1 katori rice',
      'rajma + 1 katori rice + salad', 'rajma + rice + salad'],
  },
  {
    slug: 'dal-chawal',
    name: 'Dal + rice',
    loggedTimes: 1,
    aliases: ['dal chawal', 'dal rice', 'dal and rice', 'dal + rice', '1 katori dal + 1 katori rice',
      '2 katori rice, 1 katori dal, aloo sabji, sem sabji'],
    note: 'Distinct from dal-roti-rice: no roti on this plate.',
  },
  {
    slug: 'chole-roti',
    name: 'Chole + roti',
    loggedTimes: 3,
    aliases: ['chole roti', 'chana roti', 'chana masala roti', 'chole + roti', 'chana + roti',
      '2 roti + chole + curd + cucumber', '2 roti + chana masala + cucumber salad',
      '1 katori chana sabji, 3 roti', 'chana sabji + 3 roti'],
  },
  {
    slug: 'aloo-sabzi-roti',
    name: 'Aloo sabzi + roti',
    loggedTimes: 3,
    aliases: ['aloo sabzi roti', 'aloo sabji roti', 'aloo sabzi + roti', 'aloo sabji + 3 rotis',
      '3 roti + 1 katori aloo sabzi + boondi raita', '2 roti + aloo sabji + boondi raita + cucumber',
      'aloo sabji + 2 roti', 'aloo sabzi + 2 roti', 'aloo sabzi + 3 roti'],
  },
  {
    slug: 'paneer-sabzi-roti',
    name: 'Paneer + sabzi + roti',
    loggedTimes: 2,
    aliases: ['paneer + sabzi + 2 roti', 'paneer + sabzi + 1 roti', 'paneer sabzi roti',
      'paneer (75g) + sabzi + 2 roti', 'paneer (75g) + sabzi + 1 roti'],
  },
  {
    slug: 'boiled-eggs-sabzi-roti',
    name: 'Boiled eggs + sabzi + roti',
    loggedTimes: 1,
    aliases: ['3 boiled eggs + sabzi + 1 roti', 'boiled eggs + sabzi + roti', 'boiled eggs sabzi roti',
      '2 boiled eggs + sabzi + 1 roti'],
  },
  {
    slug: 'egg-curry-roti',
    name: 'Egg curry + roti',
    loggedTimes: 1,
    aliases: ['egg curry roti', 'egg curry + roti', 'egg curry (3 eggs) + 2 roti', 'egg curry + 2 roti',
      'anda curry roti'],
  },
  {
    slug: 'paneer-tikka-roti',
    name: 'Paneer tikka + roti + sabzi',
    loggedTimes: 1,
    aliases: ['paneer tikka roti', 'paneer tikka + roti', 'paneer tikka (100g) + 1 roti + sabzi + salad',
      'paneer tikka + 1 roti + sabzi + salad', 'paneer tikka + 1 roti + sabzi'],
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
