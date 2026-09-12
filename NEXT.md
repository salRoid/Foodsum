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
  future non-empty `brief.missing[]` generation run consumes its JSON fields
  end to end. The live brief currently has no missing catalogue dishes, so
  that path cannot be exercised honestly without a synthetic input.

### 2026-08-25 — Foodsum is built as a library: segment, resolve by exact lookup, render nothing when unsure

- **NOT DONE, deliberately: any Health wiring.** `Meal` has no photo column,
  the Diet screen is mid-redesign, and the consumer story is its own decision.
  Note the corollary the plan called out and this change preserves: foodsum
  needs **no schema change, no migration and no upload route**, so it is
  unblocked by the pending Postgres cutover and cannot land inside that
  untested procedure. When the real meal-photo feature arrives, the user's own
  photo wins and the lookup is the fallback beneath it — the same precedence
  exercises already use.

### 2026-08-25 — Foodsum goes HYBRID: per-dish is the base, per-meal wins when we have the plate

- **NOT verified: the new meal photographs have not been seen in Health's
  hosted UI.** Generation, visual review, 4:3/1:1/16:9 cropping, and ingest are
  now proven for all 24 catalogue meals; the remaining check is publishing the
  corpus and viewing the Diet screen through authenticated Health.

### 2026-08-25 — Foodsum deploys as a shared library; its IMAGES do not

- **NOT verified: no app has been rebuilt on the droplet yet**, so the
  materialisation step and the hosted `NEXT_PUBLIC_FOODSUM_BASE` are proven as
  far as "the files are in place", not as "hosted Health rendered a meal
  photo".
