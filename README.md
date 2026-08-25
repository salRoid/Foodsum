# Foodsum

**Dish name in, dish picture out — or nothing.**

A static corpus of food images, a shipped `index.json`, and a matcher that
recognises a **whole plate** when it has photographed one, otherwise segments a
typed meal into dishes and resolves each one by exact lookup, and **renders
nothing when it is not sure**.

Lorem Picsum is a folder of photos behind a random number generator. Foodsum is
the same shape with the randomness inverted, and that single inversion is where
all the difficulty lives: Picsum can never be wrong, because any photo satisfies
"give me a photo". Foodsum can be wrong on every request, and **a wrong picture
of your dinner is worse than no picture at all.**

Status: **stage 1 — the matcher, proven against real data. The corpus is
empty.** See "What is not built" at the bottom.

**Resolution is a hybrid:** a photograph of the whole plate when we have one,
otherwise a strip of dish photos, otherwise nothing. See §0 below for the
numbers that forced it.

---

## The number that matters

Run against the 37 real `Meal` rows in `health_db_local`:

| | |
|---|---|
| Fragments | **85** (from 37 rows — 81% of rows are compound) |
| Tier 1 · exact | 62 (72.9%) |
| Tier 2 · alias | 16 (18.8%) |
| Tier 3 · unresolved | 7 (8.2%) |
| **Resolve rate** | **91.8%** |
| **Wrong matches** | **0** |
| Rows fully resolved | 30 / 37 |

All 7 unresolved fragments are **deliberate refusals**, not gaps: 6 × bare
`"salad"` (a category, not a dish) and 1 × `"marie gold biscuits"` (a brand).

```
npm run report          # the full breakdown, every resolution grouped by dish
npm run report -- --db  # same, straight from health_db_local
npm test                # 38 tests, including the numbers above
```

**The 6 meal entries do not move any of those numbers, and that is deliberate:**
the report counts fragments through the dish matcher, exactly as it did before
meals existed, and counts whole-meal hits beside them. 13 of the 37 rows match
a meal — but a meal only *wins* once it has a photograph, and the corpus is
empty, so today every call still takes the fragment path.

`npm run report` prints **every** resolution grouped by dish. That is the point:
the list is short enough to read down and see a wrong match with your own eyes,
which is the only way "zero wrong matches" can actually be established.

---

## Using it

```ts
import { loadIndex, resolveMeal } from '@suite/foodsum';
import raw from '@suite/foodsum/index.json' with { type: 'json' };

const idx = loadIndex(raw);                 // once, cached
const r = resolveMeal(idx, 'Dal + 1 roti + mixed veg sabzi', { size: '400x300' });

// r.images        → ONE photo of the whole plate if we have one, otherwise up
//                   to 3 dish photos in the order the dishes were typed
// r.images.length === 0  → RENDER NOTHING. No element, no box, no spinner.
// r.meal          → the whole-meal hit, or null. `.rendered` says whether it
//                   supplied the image or is still waiting to be generated
// r.misses        → normalised keys that hit nothing: the corpus-growth queue
// r.withoutImages → DISHES that matched but have no picture yet
```

**The whole contract is that last rule.** An empty `images` is not an error
state to design around — it is the same output a miss, a stale index and a
total outage all produce, which is why there is no error path here at all.

There is no matching service. `index.json` is tens of KB; a consumer fetches it
once and resolves locally. That deletes a network hop per meal row, a cold
start, a rate limit and an availability dependency, and it makes matching work
offline.

---

## How matching works

### 0. The whole plate first — the hybrid

Before anything is segmented, the **entire typed string** is looked up in a
small catalogue of whole meals (`src/meals.ts`). A hit that has a photograph
wins outright and returns **one** image; everything else falls through to the
per-fragment path below, unchanged.

```
resolveMeal(idx, name)
 ├─ 1. the WHOLE string is a meal we have photographed   → that one image. done.
 ├─ 2. otherwise                                         → fragments (§1–§3)
 └─ 3. nothing resolves                                  → images: [] → render nothing
```

Step 1 is conditional on the **image existing**, not on the meal matching. A
meal entry with no picture yet falls to step 2, so adding a meal can never take
away dish images that were already rendering. It is reported as
`meal.rendered === false` — never by being mixed into `withoutImages`, which
means "a *dish* that matched and has no picture".

#### Why both, measured

| | |
|---|---|
| Real `Meal` rows | 37 |
| Distinct meal strings | **28** — they barely repeat |
| Dishes covering all 28, and every future combination | **25** |

Per-meal alone does not scale: the combination space is unbounded and most
images would be used once — `Dal + 1 roti + mixed veg sabzi`,
`Dal + 1 roti + sabzi` and `Dal + 1 roti + sprouts salad` are three
near-identical plates typed three ways. Per-dish alone does not look like a
meal. So per-dish is the base, and the handful of plates that actually repeat
get a real photograph. **6 meals** ship: four that repeat in the logs, two that
are standing plan entries.

#### It is the same exact lookup, and it must be

Meal strings are long and free-text, so the pull toward scoring is stronger
here than anywhere else in this repo. It is refused for a stronger reason. The
ordering the design commits to is

> **right meal · > · right fragments · > · nothing · > · wrong meal**

A wrong *dish* photo misrepresents a third of a row. A wrong *meal* photo
misrepresents all of it, while claiming to show the whole thing. So a near miss
— a component added, removed, swapped, or the same words reordered — falls back
to fragments, which is exactly what an exact map lookup does when it misses.
Word order is significant for the same reason: sorting tokens before lookup is
one plausible-sounding step from making any bag of the same words the same
plate.

The one alias resting on judgement rather than on a string having been typed
twice is `Dal + 1 roti + sabzi` → `dal-roti-mixed-veg-sabzi`, and it rests on
the dish-level `sabzi` alias that Health's own `Food` table already justifies.
It is flagged as such in `src/meals.ts`.

#### One slug namespace, two lookup namespaces

Meals and dishes **share one slug namespace**, because the slug is the URL and
both are served from the same `corpus/images/<slug>/` tree — two entries
claiming `greek-yogurt` would silently fight over one directory. `loadIndex`
throws on that, `buildIndex` therefore cannot write it, and `npm run check`
reports it rather than crashing.

Their **lookup tables are separate**, because they answer different questions:
`byMealKey` is consulted once against the whole string, `byKey` once per
fragment. Merged, a fragment could tier-1 hit a meal — a third of a plate
returning a picture of the whole plate. A key claimed by *both* is fatal too:
one string cannot mean a dish at fragment level and a meal at row level.

A meal must compose **at least two known dishes** (`buildIndex` enforces it).
A single dish typed alone is a dish, however often it repeats —
`Whey shake (1.5 scoop)` is the third most-logged string and deliberately has
no meal entry.

### 1. Segment — a meal is not a dish

30 of the 37 real rows contain a `+`. `"Dal + 1 roti + mixed veg sabzi"` is one
row and three dishes. Returning a photo of dal for it is not a match; it is a
picture of one third of the meal, presented as the meal. **The unit of
resolution is the fragment, never the row.**

- **Hard separators** `+` `,` `&` — always split.
- **Soft separator** ` with ` — split *only* if the whole fragment failed.
  `"Oats with milk"` is one row in Health's own `Food` table; eager splitting
  would report two dishes where one was logged.
- **`/` is not a separator.** Here it means "or" (`Rajma / Chana`,
  `Greek Yogurt / Hung Curd`), and it appears in zero real meal rows.

Asides (`— post workout`) and parentheticals are removed **before** splitting,
because `"Egg bhurji (2 eggs + 2 whites) + 2 roti"` carries a `+` inside the
parentheses that is not a dish boundary.

### 2. Normalise

Lowercase → strip diacritics → drop the em-dash aside → drop parentheticals →
drop quantities with units (`200g`, `1.5 scoop`, `1 katori`, `1 medium`) → drop
bare counts (`2 roti`, `8 almonds`) → drop punctuation → collapse whitespace.

Nothing here guesses meaning. It only removes noise.

### 3. Resolve — three tiers, and the third renders nothing

| Tier | | Renders? |
|---|---|---|
| **1 · exact** | normalised text is a slug, or the canonical name | yes |
| **2 · alias** | normalised text is a key in the hand-curated alias table | yes |
| **3 · unresolved** | everything else | **no** |

Tiers 1 and 2 are both exact map hits and both safe. They are reported
separately because the split is diagnostic: a rising tier-2 share is the alias
table earning its keep.

**There is nothing between tier 2 and tier 3, and that is the design.** Token
overlap, trigram similarity and embeddings were all considered and rejected on
*behaviour*, not cost. Nearest-neighbour has no "I don't know" — it always
returns its closest match. `"paneer bhurji"` and `"egg bhurji"` share a token
and are different dishes; the nearest thing to `"aloo palak"` in a food corpus
is a different green curry. Every one of those matchers converts a **safe miss**
into a **confident wrong dish**, which is the single outcome this exists to
prevent.

This is settled repo precedent, not a fresh opinion. `Health/ATTRIBUTION.md`
records 15 exercise illustrations rejected after being rendered and looked at —
sit-up → crunch, suitcase-carry → farmer-carry. Every one would have passed a
similarity threshold. And `exerciseCues.ts` states the rule outright: *"an entry
with no cue is left out entirely rather than filled with a plausible guess."*

When a spelling misses, the fix is one line in `src/dishes.ts`, and
`npm run report` tells you which line to write.

### 4. Determinism

Variant choice is `hash(slug + seed) % variants`, seed defaulting to `''`. The
same dish always returns the same picture — a meal list that picks a different
dinner on every render reads as a bug in the log itself. Picsum's `?random=` has
no equivalent here and must not be added; the value proposition is that the
answer is *not* random.

---

## Adding a dish, adding an image

**A dish** — add an entry to `src/dishes.ts`, `npm run build`. Aliases are
written as a human would type them and normalised at build time.

**A meal** — add an entry to `src/meals.ts`, `npm run build`. Same rules, two
extra ones: the slug must not collide with a dish slug (fatal), and the meal
must compose at least two known dishes (also fatal). Add a meal only when the
**whole string** repeats — a plate eaten once is answered perfectly well by its
dishes.

**An image** — **drop it in `inbox/` and run `npm run ingest`.** See below.

**Never rename a slug.** It is the URL. Add an alias instead.

`npm test` fails if `corpus/index.json` is stale, which is the one way this repo
could silently lie to a consumer.

---

## Generating the corpus

```bash
npm run missing      # the queue: every dish with no image, + its exact prompt
#   …generate, LOOK AT IT, save as inbox/<slug>.png…
npm run ingest       # crop · resize · convert · strip · file · index
npm run check        # every index entry true on disk, nothing unaccounted for
```

**The generating agent's only job is to produce a picture and put it in
`inbox/`.** Everything mechanical is code, so a wrong-named, wrong-sized or
wrong-format file cannot reach the corpus. `AGENTS.md` is what Codex reads;
`STYLE.md` is the image contract and is authoritative on anything visual.

| | |
|---|---|
| `npm run missing` | **Two queues** — dishes with no image and meals with no image — each entry with its prompt already assembled from the right `STYLE.md` prefix (a meal has its own; a meal shot with the dish prompt is one bowl of something). A meal entry also prints `must show:` its components. `--demand` orders dishes by real-log frequency and meals by `loggedTimes`; `--db` refreshes portions from Health's `Food` table; `--dishes`/`--meals` select one queue; `--prompts` prints prompts alone; `--limit N`. |
| `npm run ingest` | Per file: validates the filename against the catalogue, centre-crops to 4:3, writes every ladder rung the source supports **without upscaling** (400×300 mandatory), encodes WebP, steps quality down until each rung is under budget, strips all metadata, writes a `meta.json` sidecar carrying `styleVersion`, and rebuilds `index.json`. `--dry` writes nothing; `--keep` leaves the source in `inbox/`; `--budget-scale`. |
| `npm run check` | The drift detector. Every index entry: file exists · exact dimensions · WebP · under budget · no EXIF/ICC/IPTC/XMP · has a sidecar. Every file on disk: accounted for, contiguous variant numbering, no orphans. `--style v1` also lists images not on that style version. |

**A file that cannot meet spec writes nothing at all** — no half-populated
variant folder, no index entry, exit 1 with the reason. STYLE.md's rule is that
an empty slot renders cleanly by design and a wrong one misinforms; a
three-quarters-populated one is worse than either, because the URL exists.

**`sharp` is a devDependency of the scripts only.** `src/` imports nothing but
`node:*` and that is not negotiable — a consumer of `@suite/foodsum` installs no
image library. Only `npm run ingest` and `npm run check` touch sharp, lazily,
with a legible error if it is not resolvable.

**A slug cannot be created by a filename.** Ingest rejects an unknown one.
Adding a dish is a code change with an alias table behind it, and the slug is
permanent because it is the URL.

### Provenance

Each variant folder carries `meta.json` — style version, ingest date, source
file and size, crop, per-rung bytes and quality. That sidecar is the source of
truth; `npm run build` mirrors `styleVersion` and the available rungs into
`index.json` as `variantMeta`. It lives beside the image so deleting a variant
cannot leave a stale record behind, and it is what makes a future restyle able
to find its own work (`npm run check -- --style v2`).

---

## Layout

```
src/normalise.ts      noise removal. Never decides meaning.
src/segment.ts        hard/soft separators
src/dishes.ts         THE CATALOGUE — 25 dishes, 99 keys, hand-maintained
src/meals.ts          THE MEAL CATALOGUE — 6 whole plates, 9 keys
src/resolve.ts        the whole-meal step, then the three fragment tiers
src/variant.ts        deterministic pick + URL construction
src/index-schema.ts   index.json shape, loadIndex, size ladder
src/build.ts          catalogue + disk → index
src/api.ts            resolveMeal — the consumer surface
corpus/index.json     the shipped artefact (generated; committed)
corpus/images/        empty by design
corpus/portions.json  portion strings for the prompt, from Health's Food table
inbox/                where a generated image lands before ingest
AGENTS.md             what Codex reads. Generate + drop in inbox/, nothing else.
STYLE.md              the image contract. Authoritative on anything visual.
scripts/lib/style.mjs STYLE.md parsed as data — the prefix is never restated
scripts/build-index.mjs
scripts/report-real-meals.mjs
scripts/missing.mjs   the generation queue
scripts/ingest.mjs    inbox → corpus, the enforcement step
scripts/check.mjs     the drift detector
test/                 38 tests; fixture = the 37 real Meal names
```

Meals go through the pipeline **identically** to dishes — same images tree, same
crop, same ladder, same budgets, same sidecar, same orphan detection. The only
thing that differs is which STYLE.md prefix `npm run missing` prints for them.
A second code path for meals would be a second set of rules free to fall out of
step with the first.

### The meal catalogue's scope

Six entries, from demand rather than imagination — the same rule the dish
catalogue follows:

| slug | logged |
|---|---|
| `oats-with-milk-boiled-eggs` | 3× |
| `greek-yogurt-almonds` | 3× |
| `greek-yogurt-banana` | 2× |
| `dal-roti-sprouts-salad` | 2× |
| `dal-roti-mixed-veg-sabzi` | 1× — standing plan entry |
| `paneer-bhurji-roti-salad` | 1× — standing plan entry |

Strings deliberately **not** taken are listed with their reason in
`MEALS_NOT_TAKEN` (`src/meals.ts`): the single dishes (`Whey shake`,
`Greek yogurt 200g`, `Apple`) and the one row carrying a brand.

`paneer-bhurji-roti-salad` is worth noting: its "salad" component is a
deliberate dish-level refusal, so it composes only two *known* dishes and the
third is recorded in `unresolvedParts`. That is the case where a meal
photograph is strictly better than a strip — it shows the salad that was
actually on the plate, which is precisely what a generic salad photo could not.

### The catalogue's scope

25 dishes: the 13 rows of Health's curated `Food` table (which expand to 14
slugs — see below), plus every distinct dish fragment appearing in the 37 real
`Meal` rows. It is deliberately **not** padded with plausible Indian dishes
nobody has logged; an unused slug is a corpus obligation with no demand behind
it. Stage 3 grows the list from the recorded miss list, not from imagination.

Health's `Food` table is a controlled vocabulary that already exists, curated by
hand, with clean canonical names. It is the guaranteed-correct core, and 13
alias entries cover it permanently. Note `Meal` has **no foreign key** to
`Food` — meals are free text and the two are unrelated in the schema — so this
does not solve the general case. It does suggest the eventual right fix is in
Health rather than in the matcher.

---

## What it deliberately does not do

| Not built | Why |
|---|---|
| Embeddings / vector search | Behaviour, not cost. No "I don't know" — it converts a safe miss into a confident wrong dish. |
| Fuzzy / token-overlap matching | Same failure, cheaper. `paneer bhurji` vs `egg bhurji`. |
| A server-side matching API | Ship `index.json`, match in the client. Deletes a hop, a cold start, a rate limit and an availability dependency. |
| A database | A few hundred rows that change only on a code change. `globalExercises.ts` already made and documented this exact call. |
| On-demand resizing | A fixed four-rung ladder covers every slot Health has. Arbitrary sizing is what forces compute into a static project. |
| A category fallback image | A generic curry standing in for aloo palak is a wrong answer wearing a right answer's clothes. |
| A meal image for a plate typed once | The combination space is unbounded — 28 distinct strings from 37 rows. A meal earns a photograph by repeating; everything else is answered by its dishes. |
| Fuzzy meal matching | The same refusal as fuzzy dish matching, for higher stakes: a wrong meal photo misrepresents the whole row, not a third of it. |
| A random endpoint | Picsum's headline feature and our anti-feature. |
| Nutrition data | A different project. Wrong numbers in a health app are a safety issue, not a cosmetic one. Foodsum returns pictures. |
| Third-party food photos | A corpus we generate has no attribution obligation and no per-file licence audit. Health's exercise art needed a 4,000-word attribution document to stay compliant. |
| Brands / packaged products | Trade dress. The real exposure in a generated corpus is trademark, not copyright. |

**It is also not wired into Health.** That is a separate decision — see
`DECISIONS.md` (2026-08-25) and `NEXT.md`.

---

## What is not built

- **The corpus.** Zero images — dishes and meals alike, so the hybrid's step 1
  has never once fired against a real file. This is the long pole. The *pipeline* that
  turns a generated picture into a corpus entry is built and verified
  (`missing` → `ingest` → `check`, above); what has not happened is a single
  real generated food image going through it, so nothing here establishes that
  a model actually follows `STYLE.md`.
- **Hosting, the demo page, `/q?name=`.** Stage 3. The `/i/<slug>.jpg` and
  `/i/<slug>/400x300.jpg` shorthand URLs in the plan need a rewrite layer and
  belong to the published service; the library emits the explicit static path
  that any host can serve as-is.
- **Publication.** No licence file yet. When it happens: **CC0 with a plain
  AI-provenance notice** for the images (purely AI-generated output likely has
  no copyright; a CC0 dedication plus an honest notice does not overclaim),
  **MIT** for the code and the index, and an `ATTRIBUTION.md` recording the
  model, the date and the prompt template.
- **Any Health integration.** No schema change, no migration, no upload route —
  which is precisely why this is unblocked by the pending Postgres cutover.
