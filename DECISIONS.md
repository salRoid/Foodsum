# Foodsum — decision log

**Why Foodsum is the way it is.** Append-only, newest first: when a decision is
made, record it here *at the time*, with the reasoning and what was rejected.
A decision whose reason isn't written down gets re-litigated, or quietly undone
by whoever touches it next.

**Scope: Foodsum only.** Decisions that bind every app — the Core design system,
the page shape, the integration contract, analytics, deploy and security — live
in **`../DECISIONS.md`** and are referenced from here, never restated. If a
decision here disagrees with that file about something suite-wide, that file
wins.

> **⚠️ HISTORICAL RECORD — append-only. Entries are true AS OF THEIR DATE.**
>
> Entries written before **2026-08-27** describe the retired DigitalOcean
> droplet (`165.22.216.48`, PM2). The suite runs in Docker on the VPS
> `200.234.42.67` and deploys are `cd Lumen && ./deploy-vps.sh <App>`.
> **Never take infrastructure facts from this file** — take the reasoning; take
> the host, the deploy command and the runtime from `Lumen/DEPLOY.md`.

Format: what was decided · why · what was rejected · consequences.

---

## 2026-08-26 — Dry paneer and paneer curry are two dishes; the generation brief stops saying "4:3"

**Decided (Sal: "also have dry panner and paneer curry different").** Foodsum
gains `paneer-curry`; the existing `paneer` slug narrows to mean DRY paneer —
plain cubes, no gravy. 25 dishes → 26. Health's `Food` row stays untouched;
this is a picture distinction, the same reason `Rajma / Chana` was split in two.

**Bare "paneer" stays on the DRY slug, and that is the only judgement here.**
It is what the real rows mean — `Paneer (75g) + sabzi + 1 roti` is a weighed
portion eaten beside a sabzi, not a bowl of gravy — and moving it would have
silently repointed an existing, already-photographed slug at a picture that does
not exist yet. There are now three paneer dishes side by side (`paneer`,
`paneer-curry`, `paneer-bhurji`) and they look nothing alike on a plate, which
is the whole reason they are separate slugs. Exact-alias lookup is what keeps
them apart; any token-overlap matcher collapses all three — the same argument
`egg-bhurji` vs `paneer-bhurji` already carries.

**The named curries are ONE slug, not one each.** `shahi paneer`, `matar
paneer`, `kadai paneer`, `palak paneer`, `paneer butter masala`, `paneer sabzi`
all alias onto `paneer-curry`. At a 90° flat-lay they differ in the gravy's
colour and little else, and a slug per variant is a photograph per variant we
would have to generate AND keep distinguishable. Split one out when its own
photograph exists, not before. All eleven aliases were checked against every
existing dish and meal key before being added — zero collisions, which is
required because a contested alias is fatal at `loadIndex`.

**Verified by execution:** `Paneer (75g) + sabzi + 1 roti` still resolves
`paneer + mixed-vegetable-sabzi + roti` unchanged; `dry paneer` → `paneer`;
`shahi paneer` / `palak paneer` / `matar paneer` → `paneer-curry`;
`Paneer bhurji + sabzi` → `paneer-bhurji` — no cross-talk between the three.
`npm test` 38/38, `npm run check` clean.

### The generation brief was still telling the generator "4:3, centre crop"

`scripts/export.mjs` — the machine-readable brief a generating agent reads —
declared `aspect: '4:3, centre crop'` and `minSourcePixels: '1200x900'`, both
left over from before multi-aspect ingest existed. It now emits the real
`aspects` map, and a source rule that is **derived from the three ladders' top
rungs rather than restated**: at least 1200×1200, with the binding constraints
(1200×900, 900×900, 1200×675) spelled out. The `note` tells the generator to
check ingest printed **twelve** rungs, because four is the exact silent failure
that made 24 of 38 variants invisible in Health earlier the same day.

**One wrong claim was caught and corrected before it shipped**: a first draft
said a 4:3 source "is short of the 900×900 rung". It is not — 1448×1086
centre-crops to 1086×1086 and fills the 1:1 ladder fine, which the real `paneer`
variant on disk proves. The rule is a minimum, not an aspect requirement.

**Consequence — `paneer-curry` is the ONLY slug with no image**, so it is the
whole generation queue: `npm run missing` prints its assembled prompt,
`npm run export` emits it as one record with its `file` and `prompt` fields.
It has no portion in `corpus/portions.json` (no Health `Food` row), and none was
invented — the prefix's "realistic home-cooked portion" covers it.

---

---

## 2026-08-26 — Half the corpus was invisible in Health: it had only the 4:3 ladder, and Health asks for 16:9

**The bug, reported by Sal: "half of them didn't even get a hit on Health".**
Not the matcher, not the meal names — **the aspect ratio.** Every Health call
site asks for a 16:9 rung (`UpNext.tsx:65` `800x450`; `DietView.tsx:674`
`1200x675`/`800x450`; `DietView.tsx:1172` `800x450`), and `imageUrlFor` returns
`null` rather than a URL to a rung a variant does not carry. **24 of 38 variants
on disk had only the four 4:3 rungs**, so they resolved perfectly and then
rendered nothing.

Measured against the real 37 `Meal` rows, before the fix:

| asked for | rows that got a picture |
|---|---|
| `800x450` — what Health actually asks | **7 / 37** |
| `400x300` — the 4:3 ladder | **31 / 37** |

19 of 33 slugs had no 16:9 variant at all, `roti` among them — which is what
took most compound rows down with it.

**The cause is an ordering accident inside one commit.** Multi-aspect cropping
(`crops`, the 1:1 and 16:9 ladders) landed in `scripts/ingest.mjs` in the SAME
commit as the bulk image drop (`7f31667`). Whatever was ingested before that
code was written got 4 rungs; whatever came after got 12. The sidecars say so
outright — the good ones carry a `crops` key and the stale ones do not. Nothing
was wrong with the photographs, the sources or the byte budgets: verified by
re-ingesting `almonds.png` (1254×1254, previously 4:3-only) with today's script
and getting all 12 rungs including `800x450` at 41 KB.

**Fixed by re-ingesting the 24 stale variants**, not by loosening the resolver.
`imageUrlFor` returning `null` for an absent rung is correct and is what keeps
an under-supplied source degrading to no picture instead of a broken one; the
data was wrong, not the contract.

### Five second variants had lost their source, and were recovered from their own 1200×900

`ingest` moves `inbox/<slug>.png` to `inbox/done/`, so a second variant ingested
under the same filename **overwrites the first one's source**. Five slugs were
in that state — `whey-protein-shake`, `egg-bhurji`, `roti`,
`dal-roti-mixed-veg-sabzi`, `egg-bhurji-roti-salad` — 2 variants each, 1 PNG
each. Which variant the surviving PNG belonged to was **established by
execution, not assumed**: re-encoding each source at 400×300 q90 reproduced
variant 2's file size to the byte in all five cases, and matched variant 1 in
none.

Variant 1 was therefore rebuilt from its own surviving `1200x900.webp`, staged
as `<slug>--recovered.webp` (the filename form `slugFromFilename` already
accepts). **The framing is identical and nothing is upscaled** — the stored
4:3 crop is the full width of the original, so a 16:9 crop of it is the same
box the original would have given, and 1200×900 → 1200×675 is exactly the top
16:9 rung. The cost is one extra webp generation on that one variant, which is
strictly better than losing a photograph. **Rejected: dropping those five slugs
to a single variant** — it throws away a real generation to avoid a re-encode
nobody can see. Sorting put `--recovered` before `.png`, so the recovered image
kept variant 1 and the PNG kept variant 2, preserving the numbering already
committed.

### Result

**31 of 37 real rows now resolve at every size**, and the three ladders agree —
`800x450`, `1200x675` and `400x300` all return 31/37, so aspect no longer
decides anything. The 6 remaining misses are the **documented deliberate
refusals**: bare `salad` (a category) and `marie gold biscuits` (a brand). Every
one of the 19 distinct URLs the real `Meal` rows produce was fetched from the
running app and returned **200 `image/webp`**.

`npm run check` OK (38 variants, **456** image files, up from 264), `npm test` **38/38** — which
also retires the three "stale empty-corpus assumption" failures `NEXT.md`
recorded, since the corpus is no longer empty. A stray `corpus/images/rajma/.DS_Store`
was found by `check` and deleted.

**Local Health now serves the corpus from disk, not the CDN.** `Health/.env` had
`NEXT_PUBLIC_FOODSUM_BASE` pinned to `jsDelivr@v2` — which is the tag carrying
the *stale* 4:3-only images — so local dev would have shown the same holes after
the fix. It is commented out, which is the state `lib/foodImage.ts` documents as
LOCAL: `public/foodsum` symlinks to `Foodsum/corpus/images`, so an ingest is
visible with no copy step. **The droplet keeps its own `.env`** (every deploy
excludes it), so nothing hosted changed.

**NOT verified: the Diet screen itself.** Health's Firebase sign-in still blocks
agents, so what is proven is that every URL the real rows resolve to exists and
serves — not that a card renders it. **Publishing still needs the four-step
ritual**: commit, `git tag v3 && git push origin v3`, bump the tag in both
`.env` files, and **rebuild** — `NEXT_PUBLIC_*` is inlined at build time.

**Worth closing at source, not done here:** `npm run check` passes a variant
that is missing an entire advertised ladder, and Health's failure mode for that
is silence. A check that flags "this variant carries 4:3 but not 16:9" would
have caught this the moment it happened rather than a day later.

---

---

## 2026-08-26 — Extracting Foodsum's generation brief is a PROJECTION; pulling food data from Health is one command

**Decided.** Foodsum gains two scripts and one shared module: **`npm run
export`** (the generation brief as machine-readable data), **`npm run pull`**
(Health's `Food` and `Meal` tables in, portions + the growth queue out), and
`scripts/lib/db.mjs`, which resolves the connection string in one place. Sal's
ask: *"how do we easily extract the food data so I can provide for
generation … we might need an API or script which could simply bring the food
related data from the server."*

**What was actually missing, measured.** `npm run missing` already assembles
every prompt correctly — it is the right tool when a person is generating a
handful by hand. It is the wrong one when the generating side is a script or a
batch handed to a model: it interleaves prose with prompts, its shape is free
to change whenever the report reads better a different way, and **it lists only
what has NO image**, so queueing a *second* variant of a dish that already has
one was unreachable. `export` is that queue as records — `slug`, `name`,
`portion`, `mustShow`, `existingVariants`, the exact `file`, and the assembled
`prompt` — with `--all` for the second-variant case and `--csv` for a
spreadsheet or a shell loop.

**Both are projections, never a second source of truth.** They read the
committed `corpus/index.json` and `STYLE.md` through the same helpers `missing`
and `ingest` use, so a prompt in the export and a prompt in the console cannot
differ, and neither can disagree with what a consumer loads. **Rejected:** an
export that re-derives the catalogue from `src/dishes.ts` — one step faster and
one step further from what the consumer actually gets.

**Every record carries its own `file` and its own `prompt`.** That is the whole
point: the consumer of the export never has to assemble either, so it cannot
assemble them differently. `file` is the inbox name `ingest` will accept —
anything else is rejected, because a filename that can mint a slug is a
catalogue that grows by typo (2026-08-25, unchanged).

### `pull` NEVER edits the catalogue — it reports the lines to write

`pull` writes exactly one file, `corpus/portions.json`, and only under
`--write`. Everything else it produces is a **report**: fragments no dish
claims (candidates for `src/dishes.ts`), recorded refusals still occurring, and
whole strings logged 2+ times composing 2+ known dishes (candidates for
`src/meals.ts`).

**Rejected: auto-adding a dish for every unresolved fragment.** It is the
obvious automation and it is the one that breaks the matcher's whole safety
property. An alias is an exact string somebody would really type; a script that
mints aliases from whatever was logged is a matcher that has learned to guess,
and it would have aliased **`marie gold biscuits`** — a brand, refused on
purpose — on its first run. The refusals are therefore reported *apart* from
the candidates, with their recorded reason beside them, so nobody helpfully
fixes a feature.

**The unresolved report groups on the NORMALISED key, not the raw fragment.**
Caught by running it: keyed on raw text, `4 Marie Gold biscuits` did not match
`REFUSED`'s `marie gold biscuits` and was reported as a brand-new candidate —
i.e. the report itself was recommending the exact thing the brand rule forbids.

### It does not touch the test fixture without being asked

`test/fixtures/real-meal-names.json` looks like a cache of the `Meal` table and
is not one: it is the **snapshot the recorded pass criterion is attached to**
(85 fragments, 91.8% resolved, zero wrong matches), and `test/matcher.test.ts`
asserts its length is 37. A `pull` that refreshed it by default would move the
baseline that figure was established against, and the only symptom would be a
test failing for a reason unrelated to the matcher. So `--fixture` is explicit,
and when the row count changes it prints the assertion that must move with it
**and** says the "zero wrong matches" judgement has to be re-read by hand over
the new set — that number is a human reading, not something a script can carry
forward.

### One definition of where the server is

The connection string was hardcoded — `postgresql://salroid@localhost/health_db_local`
— in **two** scripts (`missing --db`, `report --db`), which is two definitions
of "the server" waiting to disagree. `scripts/lib/db.mjs` resolves it once:
`--url`, then `$FOODSUM_DB_URL`, then **Health's own `.env` `DATABASE_URL`**
(the app's answer rather than a guess; a `file:` value is ignored as the retired
SQLite fallback), then the local mirror. Both existing scripts were repointed at
it in the same change.

**There is deliberately no direct line to the droplet.** Hosted Health's
Postgres is loopback-only on that machine by design (§5), so the sanctioned
route to production food data is `./sync-db.sh sync Health` into
`health_db_local` — after which the default IS the server's data. `--url` covers
a tunnel. **Rejected:** adding a food-data endpoint to Health for this. It would
be a public read surface over the user's meal log serving a build-time tool that
runs on the same laptop as the mirror, and the mirror already exists.

**Verified by execution** against the real `health_db_local` (37 `Meal` rows, 13
`Food` rows): `pull` reproduces the recorded figures exactly — **85 fragments,
91.8% resolved, 7 unresolved and all 7 recorded refusals, 0 dish candidates, 0
meal candidates** — and its dry run writes nothing. `export` emits valid JSON
and CSV for both queues, with `--db`, `--demand`, `--limit`, `--all` (25 dishes
+ 8 meals). `missing --db` and `report --db` both still run correctly through
the new module.

**NOT verified: no image has been generated from an exported brief**, so what is
proven is that the data comes out complete and correct, not that a generation
run driven from it produces anything. **Also found, not fixed: 3 of the 38 tests
fail, and they failed before this change** — `a dish with no images resolves but
yields NO image`, `the shipped (imageless) corpus behaves exactly as it did
before meals`, and the `npm run missing` queue test. All three assume an EMPTY
corpus, and the corpus now holds **1 dish + 5 meal** images. They are stale
assumptions rather than regressions; fixing them means deciding what those tests
should assert now, which is not a drive-by.

---

---

## 2026-08-25 — Foodsum deploys as a shared library; its IMAGES do not

**Decided.** `Foodsum/deploy.sh` exists and `Foodsum` joins `SHARED_LIBS` in
`Lumen/deploy.sh`, so it syncs to `/opt/Foodsum` beside Core and Anatomy;
`Health/deploy.sh` materialises it into `node_modules/@suite/foodsum` alongside
the other two. **`corpus/images/` and `inbox/` are excluded**, and hosted Health
reads `NEXT_PUBLIC_FOODSUM_BASE=https://cdn.jsdelivr.net/gh/salRoid/Foodsum@v1/corpus/images`.

**Why it was needed at all.** Health took `"@suite/foodsum": "file:../Foodsum"`
when the Diet screen was wired, but no deploy step ever created `/opt/Foodsum` —
verified missing on the droplet. The remote build would have failed with
`Can't resolve '@suite/foodsum'`, the same way Creator's first deploy failed
when its script was missing the Core materialisation step. **A `file:` sibling
dependency is not deployed until something puts the sibling on the droplet.**

**Rejected: dropping the runtime dependency and serving everything from
jsDelivr.** This was my own first suggestion and it does not survive contact
with what Health imports — not just `index.json` but `loadIndex`, `resolveMeal`
and `hash32`. The matcher runs **in process**; the CDN solves image hosting and
nothing about resolution. Dropping the package therefore means copying **1,368
lines** of segmentation, alias tables and tier logic into Health, where
Foodsum's 38 tests would no longer cover it and the two could disagree about
what `Dal + 1 roti` resolves to — precisely the drift the library exists to
prevent.

**The images are excluded on purpose, and it is not only about size.** The
corpus is 6 photographs today and is designed to grow toward ~350. The stronger
reason is that shipping them creates a **second delivery path**: the droplet
would answer `/foodsum/...` from its own disk while the built bundle points at
the CDN, so the two could serve different pictures for one slug and nothing
downstream could tell. One source, and it is the tag. `corpus/index.json` is
**not** excluded — it is what the matcher imports, and it is the one corpus file
the running app genuinely needs.

**`public/foodsum` is excluded from Health's own copy** — it is a local symlink
into `../../Foodsum/corpus/images` for dev convenience, which would arrive on
the droplet as a dangling link.

**Consequence — the tag is now a deploy artefact.** Hosted images come from
`@v1`, so ingesting a new batch means: commit, tag, push the tag, bump
`NEXT_PUBLIC_FOODSUM_BASE` in both `.env` files, and **rebuild** — `NEXT_PUBLIC_*`
is inlined at build time, so an `.env` edit alone changes nothing. A branch ref
was rejected: jsDelivr caches `@main` for hours, so it gives neither instant
updates nor a stable corpus.

**Also fixed in the same change: `UpNext.tsx` had never been wired to Foodsum.**
Only `DietView` was, so the dashboard's next-meal card rendered an empty band
even for meals that resolve. It now uses the same `dishImage()`/`dishTone()`
pair, with the same strict rule (a photograph only when every fragment resolves,
otherwise the deterministic gradient) — deliberately not a looser one, because
that slot previously held a random `picsum.photos` image and the failure mode to
avoid is a card that looks like it knows what you ate when it does not. The
gradient CSS composes `.f-dish-ph`'s token ramp rather than restating it.

**Verified by execution:** `bash -n` clean on all three scripts; a dry run
confirmed **zero `.webp`** and `corpus/index.json` present; the real deploy ran
and the droplet holds **256 KB, 0 images**; `./deploy.sh core-only` deploys all
three libraries in order. Health typechecks clean with the `UpNext` change.
**NOT verified: no app has been rebuilt on the droplet yet**, so the
materialisation step and the hosted `NEXT_PUBLIC_FOODSUM_BASE` are proven as far
as "the files are in place", not as "hosted Health rendered a meal photo".

---

---

## 2026-08-25 — Foodsum goes HYBRID: per-dish is the base, per-meal wins when we have the plate

**Decided (Sal's call).** Foodsum gains a **meal** catalogue (`src/meals.ts`,
6 entries) alongside its 25 dishes. Resolution order:

1. the **whole typed string** names a meal we have photographed → that one
   image, done;
2. otherwise → per-fragment dish resolution, unchanged;
3. nothing → `images: []` → render nothing.

**Why not one or the other, measured against the real 37 `Meal` rows.**

| | |
|---|---|
| Rows | 37 |
| **Distinct** meal strings | **28** — they barely repeat |
| Dishes covering all 28 **and every future combination** | **25** |

`Dal + 1 roti + mixed veg sabzi`, `Dal + 1 roti + sabzi` and
`Dal + 1 roti + sprouts salad` are three near-identical plates typed three
ways. So **per-meal alone does not scale** — the combination space is unbounded
and most images would be used once — and **per-dish alone does not look like a
meal**, because a strip of three bowls is not a picture of dinner. The hybrid
takes the cheap general case from dishes and spends real photographs only where
a string actually repeats. Six meals ship: four that repeat in the logs
(3×, 3×, 2×, 2×) and two standing plan entries.

**Step 1 is conditional on the IMAGE existing, not on the meal matching**, and
that is what makes the whole thing additive rather than a rewrite. A meal entry
with no photograph yet falls through to the fragment path, so adding a meal can
never take away dish images that were already rendering. The corpus is still
empty, so **today every call takes the fragment path and nothing has changed at
all** — verified: `corpus/index.json`'s diff is purely additive, zero deleted
lines.

### Meal matching is the SAME exact lookup, and the stakes are why

Meal strings are long, free-text and vary (`+ sabzi` vs `+ mixed veg sabzi`),
so the pull toward scoring is stronger here than anywhere else in that repo. It
is refused for a stronger reason than it was for dishes. The ordering the design
commits to is

> **right meal > right fragments > nothing > wrong meal**

A wrong *dish* photo misrepresents a third of a row; a wrong *meal* photo
misrepresents all of it **while claiming to show the whole thing**, and unlike a
dish miss it has a soft landing available — the fragment strip. So a near miss
must fall back, which is exactly what an exact map lookup does when it misses.
**Rejected:** token-sorting the key before lookup, so `roti + dal` and
`dal + roti` agree — it is one plausible-sounding step from making any bag of
the same words the same plate. **Rejected:** a second, looser matcher for meals;
`normalise()` and the alias-table discipline are reused verbatim, so there is
one normaliser in the repo and not two.

Verified by execution against six constructed near misses — a component added,
removed, swapped, one word different twice, and the same words reordered — all
six fall to the dish strip and none returns a meal image.

### One slug namespace, two lookup namespaces

Meals and dishes **share one slug namespace**, and a collision is **fatal**
(`loadIndex` throws, so `buildIndex` cannot write one, and `npm run check`
reports it rather than crashing). The reason is physical, not tidiness: the slug
is the URL and both kinds are served out of the same `corpus/images/<slug>/`
tree, so two entries claiming `greek-yogurt` would silently fight over one
directory and nothing downstream could tell. **Rejected:** separate namespaces
per kind — it makes exactly that collision *legal*, which is the opposite of
what was wanted.

Their **lookup tables are separate** (`byKey` vs `byMealKey`), because they
answer different questions: one is consulted once against the whole string, the
other once per fragment. Merged, a fragment could tier-1 hit a meal — a third of
a plate returning a picture of the whole plate. A key claimed by **both** is
fatal too: one string cannot mean a dish at fragment level and a meal at row
level.

**A meal must compose at least two known dishes** (`buildIndex` throws
otherwise). A single dish typed alone is a dish however often it repeats —
`Whey shake (1.5 scoop)` is the third most-logged string and deliberately has no
meal entry, because a second slug for one picture of one thing leaves nothing to
say which URL a consumer should have asked for. Components are **derived** by
running the meal name back through the real dish matcher rather than
hand-listed, so a typo stops resolving instead of agreeing with itself forever.

### The style contract gained a meal variant, not a second style

`STYLE.md` now carries a second fixed prefix — a composed plate, still 90°
overhead, still plain matte white ceramic, still the ~`#EDEAE6` seamless
warm-grey ground and the mandatory contact shadow. **Two hard exclusions had to
be replaced for meals** ("a second dish", "more than one vessel in frame") since
a meal is several things by definition; they become "cutlery, chopsticks,
napkins, or glasses" and "any vessel not holding part of the named meal", and
every other exclusion applies unchanged. One rule is new and meal-only: **a
missing component is a wrong meal** — `npm run missing` prints `must show:` per
meal so it can be counted off.

`scripts/lib/style.mjs` had to change with it: the old parse matched
`### Fixed prefix` loosely and would have picked whichever heading came first,
which would have let the **section order of a markdown file decide which prompt
every image in the corpus was generated from.** It now resolves both sections by
exact heading, and the headings carry the style version so a bump that misses
one fails loudly instead of generating v2 images from the v1 prompt.

### Health needs NO change — checked rather than assumed

`Health/lib/foodImage.ts` shows a picture only when `fullyResolved` and
`withoutImages` is empty, then takes `images[0].url`. A rendered meal hit
satisfies all three as-is. Its three lines are **replayed verbatim in Foodsum's
test suite**, so "Health needs no edit" is executed rather than asserted about
code in another package. One consequence worth knowing:
`Paneer bhurji + 1 roti + salad` showed **nothing** before (its "salad" fragment
is a deliberate refusal) and will show the plate once photographed — which is
right, because the meal photo shows the salad that was actually there, the one
thing a generic salad photo never could.

`fullyResolved` is therefore `true` on a rendered meal hit even when a fragment
missed. That is a widening of the field's meaning and it is documented at the
declaration so nobody reads it as a bug.

**Verified by execution:** `npm test` 23 → **38 tests, all passing** — including
a meal hit beating the fragment strip, a meal *alias* hit, an imageless meal not
suppressing the strip, six near misses falling back, meal keys being invisible
to fragment resolution and vice versa, both collision classes fatal at load,
`buildIndex` refusing a colliding and a one-dish meal, and **`npm run check`
executed as a subprocess against a deliberately corrupted index**, exiting 1
with the collision named. `npm run report` still reads **91.8% / 0 wrong
matches / 62 exact / 16 alias / 7 refusals**, unchanged, and now lists the 13
of 37 rows that match a meal beside it. `npm run build`, `npm run check` and
`npm run missing` all run clean.

**Test artefacts were created and deleted:** every temp corpus is a
`mkdtemp` removed in a `finally`, and the one test that corrupts
`corpus/index.json` restores it in a `finally` (and it is regenerable with
`npm run build` regardless). **The shipped corpus is still in its zero-image
state** — `corpus/images/` and `inbox/` contain nothing but their READMEs,
confirmed after the run.

**NOT verified.** No meal image has ever been generated, so nothing here shows
that a model follows the new meal prefix, that a composed plate survives the 4:3
centre crop as predictably as a single bowl does, or that it fits the 40 KB
budget at 400×300 — a plate of several items is busier than one bowl, and that
budget is the thing most likely to bite first. Every meal-image test uses a
placeholder file. `npm run ingest` was **not** run with a real meal file, and
nothing has been seen in Health's UI.

---

---

## 2026-08-25 — Foodsum's image pipeline: the agent drops a picture in `inbox/`, code does the rest

**Decided.** Foodsum gains `AGENTS.md`, an `inbox/` folder and three scripts —
**`npm run missing`** (the queue, with each dish's prompt already assembled),
**`npm run ingest`** (`inbox/` → corpus, enforcing every rule) and
**`npm run check`** (the drift detector). Sal's ask: *"create proper setup for
foodsum library so I can simply run codex on it and it would generate the
minimum size image and place it in the right folder with right details."*

**The whole shape in one sentence: the generating agent's only job is to produce
a picture and drop it in `inbox/`.** Everything mechanical — crop, size, format,
byte budget, metadata strip, filename, folder, variant number, the index — is
done once, in code.

**Why not let the agent write into `corpus/` directly.** Two reasons, and the
second is the real one. First, an image model cannot reliably hit an exact pixel
size, an aspect ratio, a format or a byte budget; asking it to try is asking it
to fail intermittently. Second, and worse: **`imageUrlFor` builds URLs from the
index, never from the disk**, so a file at a wrong path or a wrong size produces
a URL that resolves to nothing, silently, and the first symptom is a broken card
in Health. A pipeline that cannot express the wrong answer is the only kind that
holds when the writer is an agent that will be run unattended.

**Rejected.** *A `--generate` flag that calls an image model from the script.*
It is what "simply run codex on it" sounds like, and it is the wrong seam: the
generation step is exactly the step that needs a human or a model to LOOK at the
result, which STYLE.md makes the rule that outranks looks ("a wrong dish is
worse than no image"). It also puts an API key and a model choice inside a
library that has neither. **Rejected.** *Letting a filename create a dish.* A
slug is permanent because it is the URL; an agent that can mint one by naming a
file can grow the catalogue by typo. An unknown filename is rejected.
**Rejected.** *Upscaling to fill the size ladder.* Ingest writes only the rungs
the source supports, so a 1024² generation yields 160/400/800 and no 1200×900.
An upscaled 1200×900 is a lie about the image's resolution, and it is the rung a
consumer gets by DEFAULT when it asks for no size (`LARGEST`) — see the
consequence below.

### Failure is all-or-nothing, per file

A file that cannot meet spec writes **nothing** — no half-populated variant
folder, no index entry — and the run exits 1 naming the reason. STYLE.md's own
argument forces this: an empty slot renders cleanly by design and a wrong one
misinforms, but a three-quarters-populated one is worse than either, because the
URL exists and only some of it works. Every rung is encoded in memory and
verified (dimensions, format, no metadata) before anything touches disk, and a
write that throws part-way removes the variant folder it created.

### STYLE.md is parsed, not restated

`scripts/lib/style.mjs` reads the style version, the fixed prompt prefix, the
weight budget and the hard exclusions **out of `STYLE.md` at runtime**. A second
copy of the prefix in a script is precisely the drift STYLE.md exists to
prevent, and it would drift silently — the images would still generate, just not
as a set. A failed parse fails every script loudly rather than falling back to a
stale constant.

**The one number invented here** is the weight budget for the rungs STYLE.md
does not name. It budgets 400×300 only (under 40 KB); the others are scaled by
pixel area, labelled in the code as a **tooling default rather than style
spec**, and overridable with `--budget-scale`.

### `styleVersion` lives in a sidecar, and the index mirrors it

Each variant folder gets a `meta.json` — style version, ingest date, source file
and size, crop, per-rung bytes and quality — and `src/build.ts` mirrors
`styleVersion` plus the available rungs into `index.json` as `variantMeta`.
**The sidecar is the source of truth**, not the index: it sits beside the image
it describes, so deleting or moving a variant cannot leave a stale record
behind, and `npm run build` stays a pure function of what is on disk. A variant
with no sidecar reports `styleVersion: 'unknown'` rather than silently claiming
`v1`, and `check` flags it. `variantMeta` is **omitted entirely when a dish has
no images**, so the shipped empty index is byte-identical to what it was before
the field existed.

**Rejected.** *A single `corpus/manifest.json`.* One file to write, but it is a
second record of the same fact that can disagree with the disk — the thing the
sidecar cannot do.

### sharp is a devDependency of the scripts, never of the library

Foodsum's runtime stays dependency-free — `src/` imports nothing but `node:*` —
which is what makes a consumer able to load the index and match locally with no
install cost. `sharp` is declared in `devDependencies` (it already resolves from
the hoisted workspace root, where Quickie put it) and imported **lazily**, so
`npm run report`, `npm test` and every consumer path work with it absent. Note
the hoisted copy is currently **0.34.5**, not Quickie's declared `^0.35.3`; the
range here is `>=0.34.5` and no install was run, because that would touch the
root lockfile — out of bounds for this change.

**Consequence — the default `LARGEST` size can 404 for a small source.**
`imageUrlFor` defaults to `1200x900` when no size is passed, and a variant built
from a 1024² generation has no such rung. Health's cards pass `size: '400x300'`,
which always exists, so this is latent rather than live; `check` verifies the
400×300 rung specifically. Fixing it properly means either making `LARGEST`
per-variant (a resolve-behaviour change, out of bounds here) or demanding
≥1200×900 sources. In `NEXT.md`.

**Consequence — `corpus/portions.json` is new.** STYLE.md requires the portion
in the prompt and takes it from Health's `Food` row, but Foodsum's catalogue
carries no portion field, so the 13 Food-table portions are committed here (and
refreshable with `npm run missing -- --db`, which maps a Food row onto a slug by
running it through Foodsum's own matcher rather than a second name-matching
table). **The 11 dishes with no Food row have no portion and none was
invented** — `missing` marks them `NO PORTION KNOWN` and the prefix's "realistic
home-cooked portion" is what covers them.

**Verified by execution**, with synthetic images generated by sharp and every
artefact deleted afterwards (the corpus is back to zero images, `npm test`
23/23, `npm run check` OK):
- `missing` in all four modes against the real index — 25 dishes, 0 with images;
  `--demand` correctly ordered roti (13× in the real logs) first; `--db` read
  Health's live `Food` table and matched 11 portions.
- `ingest` end to end: a 1024² source with a `Software` EXIF tag became
  160×120/400×300/800×600 WebP at 1.2/3.1/6.6 KB with **exif, icc and xmp all
  absent**, a correct sidecar, a correct `variantMeta` entry, and
  `resolveMeal('Dal + 1 roti')` then returned a URL pointing at a file that
  really exists. A second file landed as variant 2, and a 1600×1200 source
  populated all four rungs.
- Every failure path, individually: unknown slug, source too small to reach
  400×300, over the **canonical 40 KB budget** (STYLE.md's own number), and over
  a non-canonical one. Each wrote nothing and exited 1.
- `check` caught all six corruptions it exists to catch: a promised rung deleted,
  wrong dimensions, a missing sidecar, an orphan folder / stray file /
  non-integer variant, over budget, and metadata not stripped.

**NOT verified — and this is the honest limit of the work.** **No real generated
food image has ever been through this pipeline.** Every input was synthetic
(flat shapes and noise), so what is proven is the mechanical contract — crop,
resize, encode, budget, strip, name, index, reject — and nothing at all about
whether an image model actually follows `STYLE.md`. Whether generations come
back as consistent 90° flat-lays on plain white ceramic with a contact shadow,
and whether the 40 KB budget is comfortable or tight for a real photograph
(a busy image is exactly what blows it), are both open until Sal generates one.
The style contract is unproven, not proven.

---

---

## 2026-08-25 — Foodsum is an internal library; publishing is a LATER decision

**Decided (Sal).** `Lumen/Foodsum` (`@suite/foodsum`) is a **library of this
suite**, on the same footing as `@suite/core` and `@suite/anatomy`. It may be
published as an open-source repo later; that is not decided and nothing should
be built on the assumption that it will be.

**Consequence — it stays where it is.** It sits beside `Core/` and `Anatomy/`
because that is where this repo keeps its libraries. A `Lumen/Libraries/`
folder was considered and **rejected for now**: the only real argument for one
was separating *publishable* packages from internal ones, and this decision
removes that distinction. Moving `Core` in particular was rejected outright —
its path is referenced throughout `CLAUDE.md`, `ARCHITECTURE.md` and dozens of
entries in this log, and every app's `deploy.sh` materialises `/opt/Core` by
path, so the churn is large and the benefit is cosmetic.

**Consequence — do not design for a public API.** Prefer whatever serves Health
best. If publication is chosen later, the corpus and the matcher are already
separable (`corpus/` is data, `src/` is pure functions with no Health imports),
so nothing is being foreclosed by treating it as internal today.

**Still true and unchanged:** it has zero dependencies, needs no schema change,
and is **not yet in the workspace list** — that entry belongs in the same change
that makes Health import it, not before.

---

## 2026-08-25 — Foodsum is built as a library: segment, resolve by exact lookup, render nothing when unsure

**Decided.** `Lumen/Foodsum/` (`@suite/foodsum`) exists — the corpus layout, a
generated `corpus/index.json`, a hand-maintained catalogue of 25 dishes, a
segmenting matcher with three confidence tiers, and 23 tests driven by Health's
real meal names. Built to the approved plan (`Lumen/ideas/foodsum-plan.html`),
stage 1 only. **The corpus is empty and Health is untouched** — both
deliberately.

**Why a library and not a service.** The plan's most load-bearing choice, kept:
`index.json` ships to the consumer and matching happens there. That deletes a
network hop per meal row, a cold start, a rate limit and an availability
dependency, and it makes resolution work offline. There is no matching server
because there is no matching server to have an outage.

### The unit of resolution is the fragment, never the meal row

Measured, not assumed: **30 of the 37 real `Meal` rows (81%) contain a `+`**.
"Dal + 1 roti + mixed veg sabzi" is one row and three dishes. Any design that
assumes one meal → one image is designing for data Health does not have, and
returning a photo of dal for that row shows one third of the meal AS the meal.
So `segment()` splits on `+` `,` `&`, and `resolveMeal` returns an ordered
strip capped at 3.

**` with ` is a SOFT separator — tried only after the whole fragment failed.**
"Oats with milk" is a single row in Health's own `Food` table; splitting it
eagerly reports two dishes where one was logged. **`/` is not a separator at
all**: in this vocabulary it means "or" (`Rajma / Chana`), and it appears in
zero of the 37 rows.

**Asides and parentheticals are stripped BEFORE splitting**, because
"Egg bhurji (2 eggs + 2 whites) + 2 roti" carries a `+` inside the parentheses
that is not a dish boundary. Segmenting first yields "egg bhurji (2 eggs",
"2 whites)" and "2 roti" — two garbage fragments. Regression-tested.

### Three tiers, and nothing between tier 2 and tier 3

Tier 1 `exact` (slug or canonical name) and tier 2 `alias` (a hand-curated
exact map hit) render. Tier 3 renders **nothing** — no element, no reserved
box, no broken image, no category fallback. Same rule `exerciseArtSlug()`
already has.

**No fuzzy tier was built, and the reason is behaviour, not cost.**
Nearest-neighbour, trigram similarity and token overlap all lack an "I don't
know": they always return the closest thing. "paneer bhurji" and "egg bhurji"
share a token and are different dishes; the nearest thing to "aloo palak" in a
food corpus is a different green curry. Each converts a **safe miss** into a
**confident wrong dish**. `Health/ATTRIBUTION.md` records 15 illustrations
rejected after being rendered and looked at (sit-up → crunch, suitcase-carry →
farmer-carry) — every one would have passed a similarity threshold. Tiers 1 and
2 are reported separately even though both render, because a rising tier-2
share is the diagnostic that the alias table is doing work.

**Consequence:** coverage grows by adding a line to `src/dishes.ts`, and
`npm run report` prints exactly which line to write. That is the intended
maintenance loop, not a workaround for a missing matcher.

### An empty corpus is the shipping state, not a degraded one

Sal generates the images, so the library had to be fully functional and fully
testable with zero image files — and it is: 25 dishes resolve, `images` comes
back empty, and every consumer correctly renders nothing. `test/corpus.test.ts`
executes both halves against real temp directories, including the file-drop
path (create `<slug>/<n>/400x300.webp` → rebuild → the URL appears), so "adding
an image is a file drop plus a rebuild" is a claim that has been run rather
than asserted.

**A third test fails when `corpus/index.json` is stale.** Editing `dishes.ts`
and forgetting `npm run build` is the one way this repo could silently serve a
consumer a catalogue that disagrees with its source.

**A contested alias is FATAL at `loadIndex`**, not resolved by array order. Two
dishes claiming one alias means the resolution of that string depends on file
ordering, which is exactly the quiet ambiguity the whole matcher refuses.

### Two refusals that are features, and are tested as such

`salad` (6 occurrences) and `marie gold biscuits` (1) resolve to **nothing**,
recorded in an exported `REFUSED` map with the reason, so a future reader can
tell "not built yet" from "refused on purpose" and does not helpfully add the
alias that breaks the rule. Bare `salad` is a category — a generic salad photo
for whatever was on the plate is a wrong answer wearing a right answer's
clothes. `Marie Gold` is a **brand**: the real exposure in an AI-generated image
corpus is trademark and trade dress, not copyright, so the corpus admits generic
dish names only.

**Rejected.** Aliasing "marie gold biscuits" to a generic `biscuits` slug. It
would lift the resolve rate to 92.9% by putting a brand in the lookup path,
which is the policy line the corpus is supposed to hold.

### Three corrections to the plan, from reality

1. **The plan's worked example shows "mixed veg sabzi" failing as a category.
   It resolves.** Health's own curated `Food` table contains
   "Mixed Vegetable Sabzi (1 katori, low oil)" — it is a controlled-vocabulary
   entry, not a guess, and Sal's logs use the bare and full forms in the same
   week. Bare `sabzi` is aliased to it and this is the ONE place a
   category-shaped word maps to a dish; the note in `dishes.ts` says why. Bare
   `salad` still fails, so the plan's real point survives with a live example.
2. **13 `Food` rows expand to 14 slugs, not 13.** Two rows name alternatives
   that do not look alike: "Rajma / Chana" is two dishes (split), while "Greek
   Yogurt / Hung Curd" is one (kept together). The Food table's unit is a
   portion target; this corpus's unit is a picture.
3. **The plan's "delete UpNext's live `picsum.photos` request" cleanup is
   already done.** `Health/components/UpNext.tsx:71` now carries a comment
   explaining the removal and says the empty `.f-upnext-photo` slot was kept
   deliberately for whatever lands there later — which is this. So the Health
   wiring is one slot smaller than the plan budgets for.
4. **The pretty URL contract (`/i/dal.jpg`, `/i/dal/400x300.jpg`) is a hosting
   nicety, not the library's output.** Those need a rewrite layer. The library
   emits the fully-explicit `<base>/<slug>/<variant>/<size>.<format>`, which is
   a real file any static host serves as-is with no rules at all. Adding the
   shorthand in stage 3 is additive — these URLs keep working.

Also noted: `curd` is deliberately **not** an alias of `greek-yogurt`. Set curd
and strained yogurt look different on a plate, and this is a corpus of things
to look at.

### Not in the npm workspace, on purpose

`Foodsum` is absent from the root `package.json` `workspaces` list. It has zero
dependencies, runs on `node --experimental-strip-types`, and **has no consumer**
— adding it would install nothing and declare a link nothing follows. Add the
entry in the same change that makes Health import it, not before.

**NOT DONE, deliberately: any Health wiring.** `Meal` has no photo column, the
Diet screen is mid-redesign, and the consumer story is its own decision. Note
the corollary the plan called out and this change preserves: foodsum needs **no
schema change, no migration and no upload route**, so it is unblocked by the
pending Postgres cutover and cannot land inside that untested procedure. When
the real meal-photo feature arrives, the user's own photo wins and the lookup is
the fallback beneath it — the same precedence exercises already use.

**Verified by execution.** 23 tests pass (`npm test`); `npm run build` is
idempotent; `npm run report` run against **both** the committed fixture and the
live `health_db_local` via `--db`, with identical results. Over the 37 real
rows: **85 fragments, 91.8% resolved (62 exact / 16 alias), 7 unresolved — all
7 documented refusals — and ZERO wrong matches**, established by reading the
report's per-dish grouping by hand, which is the only way that number can be
established. **NOT verified: nothing has been rendered.** No image exists, no
UI consumes this, and the visual half of "is this the right picture of dal"
cannot begin until the corpus does.
