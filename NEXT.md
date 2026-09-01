# Foodsum — open threads

**Extracted from `DECISIONS.md` on 2026-09-01.** Every item below was recorded
by a decision entry as **NOT DONE**, **NOT VERIFIED** or **NOT BUILT** and then
left inside a log nobody reads end to end. That is what this file fixes:
deferred work is only tracked if it sits somewhere you would actually look.

**These are quotes, not a triage.** Nothing here has been re-tested or
re-prioritised — some will already be done, some will be obsolete. Read the
entry named above each group in `DECISIONS.md` before acting, **delete the line
when it is finished**, and from now on record a deferral here *at the time you
defer it*, not only inside the decision entry.

Suite-wide open work stays in **`../NEXT.md`**.

---

### 2026-08-26 — Half the corpus was invisible in Health: it had only the 4:3 ladder, and Health asks for 16:9

- **NOT verified: the Diet screen itself.** Health's Firebase sign-in still
  blocks agents, so what is proven is that every URL the real rows resolve to
  exists and serves — not that a card renders it. **Publishing still needs the
  four-step ritual**: commit, `git tag v3 && git push origin v3`, bump the tag
  in both `.env` files, and **rebuild** — `NEXT_PUBLIC_*` is inlined at build
  time.

- **Worth closing at source, not done here:** `npm run check` passes a variant
  that is missing an entire advertised ladder, and Health's failure mode for
  that is silence. A check that flags "this variant carries 4:3 but not 16:9"
  would have caught this the moment it happened rather than a day later.

### 2026-08-26 — Extracting Foodsum's generation brief is a PROJECTION; pulling food data from Health is one command

- **NOT verified: no image has been generated from an exported brief**, so
  what is proven is that the data comes out complete and correct, not that a
  generation run driven from it produces anything. **Also found, not fixed: 3
  of the 38 tests fail, and they failed before this change** — `a dish with no
  images resolves but yields NO image`, `the shipped (imageless) corpus
  behaves exactly as it did before meals`, and the `npm run missing` queue
  test. All three assume an EMPTY corpus, and the corpus now holds **1 dish +
  5 meal** images. They are stale assumptions rather than regressions; fixing
  them means deciding what those tests should assert now, which is not a
  drive-by.

### 2026-08-25 — Foodsum's image pipeline: the agent drops a picture in `inbox/`, code does the rest

- **NOT verified — and this is the honest limit of the work.** **No real
  generated food image has ever been through this pipeline.** Every input was
  synthetic (flat shapes and noise), so what is proven is the mechanical
  contract — crop, resize, encode, budget, strip, name, index, reject — and
  nothing at all about whether an image model actually follows `STYLE.md`.
  Whether generations come back as consistent 90° flat-lays on plain white
  ceramic with a contact shadow, and whether the 40 KB budget is comfortable
  or tight for a real photograph (a busy image is exactly what blows it), are
  both open until Sal generates one. The style contract is unproven, not
  proven.

### 2026-08-25 — Foodsum is built as a library: segment, resolve by exact lookup, render nothing when unsure

- **NOT DONE, deliberately: any Health wiring.** `Meal` has no photo column,
  the Diet screen is mid-redesign, and the consumer story is its own decision.
  Note the corollary the plan called out and this change preserves: foodsum
  needs **no schema change, no migration and no upload route**, so it is
  unblocked by the pending Postgres cutover and cannot land inside that
  untested procedure. When the real meal-photo feature arrives, the user's own
  photo wins and the lookup is the fallback beneath it — the same precedence
  exercises already use.

- **NOT verified: nothing has been rendered.** No image exists, no UI consumes
  this, and the visual half of "is this the right picture of dal" cannot begin
  until the corpus does.

### 2026-08-25 — Foodsum goes HYBRID: per-dish is the base, per-meal wins when we have the plate

- **NOT verified.** No meal image has ever been generated, so nothing here
  shows that a model follows the new meal prefix, that a composed plate
  survives the 4:3 centre crop as predictably as a single bowl does, or that
  it fits the 40 KB budget at 400×300 — a plate of several items is busier
  than one bowl, and that budget is the thing most likely to bite first. Every
  meal-image test uses a placeholder file. `npm run ingest` was **not** run
  with a real meal file, and nothing has been seen in Health's UI.

### 2026-08-25 — Foodsum deploys as a shared library; its IMAGES do not

- **NOT verified: no app has been rebuilt on the droplet yet**, so the
  materialisation step and the hosted `NEXT_PUBLIC_FOODSUM_BASE` are proven as
  far as "the files are in place", not as "hosted Health rendered a meal
  photo".

