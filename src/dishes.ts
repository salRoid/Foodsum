// The corpus catalogue — the hand-maintained source of truth.
//
// This is a SOURCE FILE, not a table. The same argument Health's
// `globalExercises.ts` records applies verbatim: it is shared knowledge that
// changes only when someone edits code, so a database would add an operational
// surface to serve data that is already static. `scripts/build-index.mjs`
// reads this file plus the contents of `corpus/images/` and emits
// `corpus/index.json`, which is the only artefact a consumer ever loads.
//
// ── HOW TO ADD A DISH ──
//   1. Add an entry here. `slug` is permanent — it is the URL, and renaming
//      one breaks every link anybody has.
//   2. Write aliases as a HUMAN would type them. They are normalised at build
//      time by the same function that normalises user input, so write
//      "greek yogurt 200g" if you like; it becomes "greek yogurt".
//   3. Drop images into `corpus/images/<slug>/<variant>/<size>.<format>`.
//      Zero images is a valid state: the dish still resolves, and the consumer
//      renders nothing. Images are additive and need no code change.
//
// ── THE ALIAS RULE ──
// An alias is an EXACT string a person might type for THIS dish. It is never
// a category, never a near-miss, never a "close enough". The whole safety
// property of this matcher is that the lookup is an exact map hit: a spelling
// nobody wrote down fails to NOTHING, which is recoverable, instead of failing
// to a confidently wrong dish, which is not.
//
// ── THE BRAND RULE ──
// Generic dish names only. No brands, no restaurant names, no packaged
// products — a generated "Marie Gold biscuit" or "Oreo" reproduces trade
// dress, and the trademark exposure is the real risk in an AI-generated image
// corpus, not copyright. "Marie Gold biscuits" appears in the real meal data
// and is deliberately left UNRESOLVED for this reason. See README.
//
// ── THE CATEGORY RULE, AND ITS ONE EXCEPTION ──
// A category is not a dish. Bare "salad" resolves to nothing, on purpose: a
// generic salad photo standing in for whatever was actually eaten is a wrong
// answer wearing a right answer's clothes, which is the same call
// `Health/ATTRIBUTION.md` records for 15 rejected exercise illustrations.
// The single exception is "sabzi" → `mixed-vegetable-sabzi`, and it is an
// exception only in appearance: Health's own curated `Food` table contains
// "Mixed Vegetable Sabzi (1 katori, low oil)" as a canonical food, and Sal's
// logs use the bare and full forms interchangeably in the same week. It is a
// controlled-vocabulary entry, not a guess.

export type DishCategory =
  | 'grain'
  | 'legume'
  | 'dairy'
  | 'egg'
  | 'vegetable'
  | 'fruit'
  | 'nut'
  | 'drink'
  | 'supplement'
  | 'snack';

export interface Dish {
  /** Permanent, URL-safe id. Never rename one. */
  slug: string;
  /** Display name, in the form a UI would caption it. */
  name: string;
  category: DishCategory;
  /** Exact strings a person might type. Normalised at build time. */
  aliases: string[];
  /**
   * True when this dish corresponds to a row in Health's curated `Food` table.
   * Those 13 are a controlled vocabulary that already exists and is the
   * guaranteed-correct core of the corpus.
   */
  fromHealthFoodTable?: boolean;
  /** Why this dish exists, when that is not obvious. */
  note?: string;
}

/**
 * Stage-1 pilot catalogue.
 *
 * Scope is deliberate and bounded: the 13 rows of Health's `Food` table, plus
 * every distinct dish fragment appearing in the 37 real `Meal` rows. It is not
 * padded with plausible Indian dishes nobody has logged — an unused slug is a
 * corpus obligation with no demand behind it, and stage 3 grows this list from
 * the recorded miss list rather than from imagination.
 */
export const DISHES: Dish[] = [
  // ── Health `Food` table (13) ────────────────────────────────────────────
  {
    slug: 'whey-protein-shake',
    name: 'Whey Protein Shake',
    category: 'supplement',
    fromHealthFoodTable: true,
    aliases: ['whey shake', 'whey protein shake', 'whey', 'protein shake', 'whey protein'],
  },
  {
    slug: 'boiled-eggs',
    name: 'Boiled Eggs',
    category: 'egg',
    fromHealthFoodTable: true,
    aliases: ['boiled eggs', 'boiled egg', 'eggs boiled', 'uble ande'],
  },
  {
    slug: 'egg-bhurji',
    name: 'Egg Bhurji',
    category: 'egg',
    fromHealthFoodTable: true,
    aliases: ['egg bhurji', 'anda bhurji', 'egg burji'],
    note: 'Shares the token "bhurji" with paneer-bhurji and is a different dish. Exact-alias lookup is what keeps the two apart; any token-overlap matcher confuses them.',
  },
  {
    slug: 'paneer-bhurji',
    name: 'Paneer Bhurji',
    category: 'dairy',
    fromHealthFoodTable: true,
    aliases: ['paneer bhurji', 'paneer burji'],
  },
  {
    slug: 'greek-yogurt',
    name: 'Greek Yogurt',
    category: 'dairy',
    fromHealthFoodTable: true,
    aliases: ['greek yogurt', 'greek yoghurt', 'hung curd', 'greek yogurt hung curd'],
    note: 'Distinct from plain curd: hung/strained, visibly thicker. The Food row names both because it is one portion target, not because they photograph the same. The fourth alias is Health\'s Food row verbatim ("Greek Yogurt / Hung Curd (200g)") — normalise() drops the parenthetical and the slash, leaving one key that previously matched nothing, so that library card rendered a permanent blank. It is NOT a guess: BOTH sides of the slash are already aliases of THIS slug, so whichever the row means, the picture is right. Compare rajma, where the same shape IS ambiguous and was deliberately left unaliased.',
  },
  {
    slug: 'dal',
    name: 'Dal',
    category: 'legume',
    fromHealthFoodTable: true,
    aliases: ['dal', 'daal', 'dahl', 'dal tadka', 'tadka dal', 'toor dal', 'arhar dal', 'moong dal'],
  },
  {
    slug: 'rajma',
    name: 'Rajma',
    category: 'legume',
    fromHealthFoodTable: true,
    aliases: ['rajma', 'rajma curry', 'kidney beans'],
    note: 'Health\'s Food row is "Rajma / Chana" — one portion target covering two dishes that do NOT look alike. Split into two slugs here; the corpus is about pictures, not portions.',
  },
  {
    slug: 'chana',
    name: 'Chana',
    category: 'legume',
    fromHealthFoodTable: true,
    aliases: ['chana', 'chole', 'chickpeas', 'kabuli chana', 'chana masala', 'chana sabji', 'chana sabzi', 'chana ki sabzi'],
  },
  {
    slug: 'roti',
    name: 'Roti',
    category: 'grain',
    fromHealthFoodTable: true,
    aliases: ['roti', 'rotis', 'chapati', 'chapatti', 'phulka'],
  },
  {
    slug: 'cooked-rice',
    name: 'Cooked Rice',
    category: 'grain',
    fromHealthFoodTable: true,
    aliases: ['rice', 'cooked rice', 'katori rice', 'steamed rice', 'chawal', 'plain rice', 'small rice'],
  },
  {
    slug: 'sprouts-salad',
    name: 'Sprouts Salad',
    category: 'legume',
    fromHealthFoodTable: true,
    aliases: ['sprouts salad', 'sprout salad', 'sprouts', 'moong sprouts'],
  },
  {
    slug: 'mixed-vegetable-sabzi',
    name: 'Mixed Vegetable Sabzi',
    category: 'vegetable',
    fromHealthFoodTable: true,
    aliases: ['mixed veg sabzi', 'mixed vegetable sabzi', 'mix veg sabzi', 'veg sabzi', 'sabzi', 'mix veg', 'mixed veg'],
    note: 'The one place a bare category-ish word ("sabzi") is an alias. Justified by the curated Food row of the same name, not by similarity.',
  },
  {
    slug: 'almonds',
    name: 'Almonds',
    category: 'nut',
    fromHealthFoodTable: true,
    aliases: ['almonds', 'almond', 'badam'],
  },
  {
    slug: 'oats',
    name: 'Oats with Milk',
    category: 'grain',
    fromHealthFoodTable: true,
    aliases: ['oats', 'oats with milk', 'oatmeal', 'porridge', 'oats milk'],
    note: 'The "oats with milk" alias is what stops the soft " with " split firing on a single dish. Health\'s Food row is "Oats (40g dry, with milk)".',
  },

  // ── Additional fragments seen in the 37 real Meal rows ──────────────────
  {
    slug: 'paneer',
    name: 'Paneer',
    category: 'dairy',
    aliases: ['paneer', 'paneer cubes', 'cottage cheese', 'plain paneer', 'dry paneer'],
    note: 'DRY paneer — plain cubes, no gravy. Logged bare ("Paneer (75g) + sabzi + 1 roti"). Bare "paneer" stays HERE and not on paneer-curry, because that is what the real rows mean: a fixed weight of paneer eaten beside a sabzi and a roti, not a bowl of gravy. Three paneer dishes now sit side by side (this, paneer-curry, paneer-bhurji) and they look nothing alike on a plate — which is the whole reason they are separate slugs. Exact-alias lookup is what keeps them apart; any token-overlap matcher collapses all three.',
  },
  {
    slug: 'paneer-curry',
    name: 'Paneer Curry',
    category: 'dairy',
    aliases: [
      'paneer curry',
      'paneer gravy',
      'paneer masala',
      'paneer butter masala',
      'paneer sabzi',
      'shahi paneer',
      'matar paneer',
      'mutter paneer',
      'kadai paneer',
      'karahi paneer',
      'palak paneer', 'paneer lababdar'],
    note: 'Paneer in a gravy — a bowl of curry, not cubes. Added 2026-08-26 on Sal\'s call that dry paneer and paneer curry are different dishes. The named variants (shahi / matar / kadai / palak) are aliased onto ONE slug deliberately: they differ in the gravy\'s colour and little else at a 90 degree flat-lay, and a slug per variant is a slug per picture we would then have to generate and keep distinguishable. Split one out only when its own photograph exists.',
  },
  { slug: 'banana', name: 'Banana', category: 'fruit', aliases: ['banana', 'bananas', 'kela'] },
  {
    slug: 'besan-chilla',
    name: 'Besan Chilla',
    category: 'legume',
    aliases: ['besan chilla', 'besan cheela', 'chilla', 'cheela', 'besan chila'],
  },
  { slug: 'poha', name: 'Poha', category: 'grain', aliases: ['poha', 'pohe'] },
  { slug: 'apple', name: 'Apple', category: 'fruit', aliases: ['apple', 'apples', 'seb'] },
  {
    slug: 'curd',
    name: 'Curd',
    category: 'dairy',
    aliases: ['curd', 'dahi', 'plain curd', 'yogurt', 'yoghurt'],
    note: 'Deliberately NOT an alias of greek-yogurt. Set curd and strained yogurt look different on a plate, and this corpus exists to be looked at.',
  },
  { slug: 'tea', name: 'Tea', category: 'drink', aliases: ['tea', 'chai', 'masala chai', 'milk tea', 'cup of tea'] },
  { slug: 'walnuts', name: 'Walnuts', category: 'nut', aliases: ['walnuts', 'walnut', 'akhrot'] },
  {
    slug: 'aloo-palak',
    name: 'Aloo Palak',
    category: 'vegetable',
    aliases: ['aloo palak', 'alu palak', 'potato spinach'],
  },
  {
    slug: 'boondi-raita',
    name: 'Boondi Raita',
    category: 'dairy',
    aliases: ['boondi raita', 'bundi raita'],
    note: 'Bare "raita" is NOT an alias — cucumber, boondi and pineapple raita are different pictures. A bare "raita" fragment fails to nothing, correctly.',
  },
  { slug: 'cucumber', name: 'Cucumber', category: 'vegetable', aliases: ['cucumber', 'kheera', 'cucumber slices'] },
  // ── Grown from the 2026-08-31 miss list ─────────────────────────────────
  // Every entry below was a fragment Sal actually LOGGED (not planned) in the
  // last week that resolved to nothing. Generic dish names only; brands and
  // categories from the same list went to REFUSED, not here.
  { slug: 'aloo-sabzi', name: 'Aloo Sabzi', category: 'vegetable',
    aliases: ['aloo sabzi', 'aloo sabji', 'aloo ki sabzi', 'potato sabzi', 'dry aloo'] },
  { slug: 'sem-sabzi', name: 'Sem Sabzi', category: 'vegetable',
    aliases: ['sem sabzi', 'sem sabji', 'sem ki sabzi', 'flat beans sabzi'] },
  { slug: 'bhindi-masala', name: 'Bhindi Masala', category: 'vegetable',
    aliases: ['bhindi', 'bhindi masala', 'bhindi sabzi', 'bhindi ki sabzi', 'okra'] },
  { slug: 'american-corn', name: 'American Corn', category: 'vegetable',
    aliases: ['american corn', 'salt and pepper american corn', 'sweet corn', 'corn cup'],
    note: 'The street/mall cup of buttered sweetcorn kernels, not corn on the cob.' },
  { slug: 'coconut-chutney', name: 'Coconut Chutney', category: 'vegetable',
    aliases: ['coconut chutney', 'nariyal chutney'] },
  { slug: 'sambar', name: 'Sambar', category: 'legume',
    aliases: ['sambar', 'sambhar'] },
  { slug: 'idli', name: 'Idli', category: 'grain', aliases: ['idli', 'idlis'] },
  { slug: 'masala-dosa', name: 'Masala Dosa', category: 'grain',
    aliases: ['masala dosa', 'dosa', 'masala dosa with sambar and coconut chutney'] },
  { slug: 'naan', name: 'Naan', category: 'grain', aliases: ['naan', 'butter naan'] },
  { slug: 'bhature', name: 'Bhature', category: 'grain',
    aliases: ['bhature', 'bhatura', 'chole bhature'] },
  { slug: 'litti-chokha', name: 'Litti Chokha', category: 'grain',
    aliases: ['litti chokha', 'litti with chokha', 'litti'] },
  { slug: 'aloo-sandwich', name: 'Aloo Sandwich', category: 'grain',
    aliases: ['aloo sandwich', 'aloo sandwiches', 'potato sandwich'] },
  { slug: 'aloo-tikki-chaat', name: 'Aloo Tikki Chaat', category: 'snack',
    aliases: ['aloo tikki chaat', 'tikki chaat', 'aloo tikki'] },
  { slug: 'aloo-bhujiya', name: 'Aloo Bhujiya', category: 'snack',
    aliases: ['aloo bhujiya', 'bhujiya', 'bhujia'] },
  { slug: 'gulab-jamun', name: 'Gulab Jamun', category: 'snack',
    aliases: ['gulab jamun', 'gulab jamuns'] },
  { slug: 'kaju-barfi', name: 'Kaju Barfi', category: 'snack',
    aliases: ['kaju barfi', 'kaju katli'] },
  { slug: 'milk', name: 'Milk', category: 'dairy', aliases: ['milk', 'glass of milk'] },
  { slug: 'peanut-butter', name: 'Peanut Butter', category: 'nut',
    aliases: ['peanut butter', 'pb'] },
];

/**
 * Fragments seen in the real data that are deliberately NOT in the catalogue,
 * with the reason. This list is documentation, not code: it exists so that the
 * next person to read a miss report can tell "not built yet" from "refused on
 * purpose", and does not helpfully add the alias that breaks the rule.
 */
export const REFUSED: Record<string, string> = {
  'marie gold biscuits':
    'Brand. The corpus admits generic dish names only — trade dress is the real exposure in a generated image corpus.',
  salad:
    'Category, not a dish. "sprouts salad" is specific and resolves; bare "salad" could be anything on the plate.',
  // ── 2026-08-31 miss list ──
  'marigold biscuits': 'Brand — a spelling variant of Marie Gold. Same refusal.',
  'winkies swiss roll': 'Brand (packaged product).',
  // Keyed on the NORMALISED form — normalise() strips the apostrophe, and a
  // key that keeps it is never matched.
  'domino s veggie paradise pizza': 'Brand (restaurant + trade-dress menu item).',
  'whole truth whey':
    'Brand qualifier. The generic whey-protein-shake exists; aliasing a brand string onto it is the exact thing refused for Marie Gold → biscuits.',
  curry: 'Category, not a dish — same rule as salad.',
  'chutney and salad': 'Contains a refused category ("salad") and a bare category ("chutney").',
};
