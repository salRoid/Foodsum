# Foodsum — instructions for the generating agent

Your job is to **generate food images and drop them in `inbox/`**. That is all.

Everything mechanical — cropping, resizing, format, file size, metadata,
filenames, folder layout, the index — is done by `npm run ingest`. Do not do any
of it yourself, and **never write into `corpus/` directly**. A file written
straight into the corpus is one typo away from being a URL nothing serves, and
nothing will notice until a card renders broken.

---

## The loop — two commands, one review

```
npm run brief -- --prod   # ① what to generate: writes corpus/brief.json
#   → read corpus/brief.json → `missing[]`. Each record has the exact `file`
#     to write (inbox/<slug>.png) and the exact `prompt`. Generate ONE image
#     per record. `candidates[]` are NOT yours — they are unresolved fragments
#     awaiting a catalogue decision, and you must not invent slugs for them.
# …LOOK AT EVERY IMAGE. Reject a wrong dish here, not later…
npm run publish           # ② ingest → check → test → commit → tag vN+1 →
                          #    push → repoint hosted Health → rebuild → prove
```

`npm run publish -- --dry` prints the plan and changes nothing. `npm run
missing` / `npm run export` still exist and answer the wider question (every
catalogue dish with no image, eaten or not); `brief` is scoped to what was
actually LOGGED recently, which is the queue that matters.

## The prompt

**Fixed prefix + subject.** There are exactly two prefixes — one for a dish, one
for a meal — both in `STYLE.md`, both versioned. `npm run missing` prints the
right one, fully assembled, under every entry. **Copy it verbatim.** Do not
rewrite, shorten, embellish or "improve" a prefix for a particular subject — a
per-subject prefix is exactly how a set of three hundred images stops looking
like one set, and that is the whole problem this specification exists to solve.

The only part that varies is the subject: a dish name plus its portion, or a
meal name verbatim (a meal carries its portions inside its own name). `missing`
already fills it in.

---

## The style, in one line each

Read **`STYLE.md`** — it is the contract and it is authoritative. The summary,
so you can spot a bad generation without re-reading it every time:

- 90° overhead flat-lay. Plain matte white ceramic. Flat seamless light
  warm-grey background (~`#EDEAE6`, deliberately **not** white).
- A **soft contact shadow under the vessel** is mandatory. It is what separates
  a white bowl from a light background. No shadow → reject.
- Dish centred, ~75% of the frame, realistic home-cooked portion.

## Reject the image if it contains any of these

- hands, people, or any part of a body
- cutlery, chopsticks, napkins, glasses, or a second dish
- text, labels, watermarks, or signage
- garnish beyond what the dish genuinely has (no scattered herbs "for styling")
- a patterned, coloured, wooden, marble, or textured surface
- steam, splashes, motion, or a "hero" restaurant treatment
- more than one vessel in frame
- a visible frame edge, border, or vignette

### For a MEAL image, two of those are replaced

A composed plate is several things by definition, so **"a second dish"** and
**"more than one vessel in frame"** do not apply. In their place:

- **cutlery, chopsticks, napkins, or glasses** — still rejected
- **any vessel not holding part of the named meal** — still rejected

Everything else on the list above applies unchanged. And one rule that exists
only for meals:

- **a missing component is a WRONG MEAL.** `Dal + 1 roti + sprouts salad` with
  no salad in frame is not a slightly imperfect picture of that meal; it is a
  picture of a different one, and it is worse than a dish strip because it
  claims to show the whole row. `npm run missing` prints `must show:` under
  every meal — count them off before accepting the image.

## The rule that outranks all of the above

**A wrong dish is worse than no image.** A generated Indian dish can look
completely plausible and be the wrong food — dal that is actually sambar, roti
that is a tortilla, paneer that is tofu. An empty slot renders cleanly by
design; a wrong one misinforms someone about what they ate.

**A wrong MEAL is worse still.** A wrong dish photo misrepresents a third of a
row; a wrong meal photo misrepresents all of it while claiming to be the whole
thing. And an empty meal slot is a soft landing rather than a blank: the
matcher simply falls back to the individual dish pictures. So the bar for
accepting a meal image is higher than for a dish, not lower.

**When in doubt, reject it and move on.** Leaving a dish or a meal without a
picture is a correct outcome, not a failure.

---

## Where the file goes, and what it is called

```
inbox/<slug>.png
```

- `<slug>` must be a slug that **already exists** in `src/dishes.ts` or
  `src/meals.ts`. `npm run missing` prints the exact filename for every entry in
  both queues. Meals and dishes share one slug namespace and one images tree, so
  a filename can only ever mean one of them.
- A second picture for the same dish: `inbox/<slug>-2.png` (ingest files it as
  the next variant automatically — do not choose a variant number yourself).
- PNG, JPEG, WebP, TIFF and AVIF are all accepted as input.
- **Generate SQUARE, at least 1200×1200.** Do not try to hit 400×300, or a
  file size — ingest normalises all of it. But the source size is not a
  nice-to-have, and this is the one instruction to get right:

  Ingest centre-crops the same photograph **once per aspect ratio** — 4:3, 1:1
  and 16:9 — and writes only the rungs the crop can supply **without
  upscaling**. 1200×1200 is what fills all twelve. A smaller source ingests
  perfectly happily and silently contributes fewer rungs.

  **That failure is invisible until it reaches the app.** Health asks for the
  **16:9** rungs by name, so a variant carrying only the 4:3 ladder resolves
  correctly and then renders NOTHING — no error, no broken image. On
  2026-08-26 that hid 24 of 38 variants; see `DECISIONS.md`.

  **So: after every ingest, read the `✓` line and count the rungs. Twelve is
  correct. Four means the source was too small — regenerate larger, do not
  accept it.**

**You may not add a dish or a meal.** A filename that is not a known slug is
rejected. Adding either is a code change — `src/dishes.ts` or `src/meals.ts`,
with an alias table behind it — and a slug is permanent because it is the URL.

---

## Afterwards

`npm run ingest` rebuilds `corpus/index.json` itself. Then:

```bash
npm run check        # every index entry true on disk, nothing unaccounted for
npm test             # the matcher suite, including the staleness guard
```

Both must pass before you report the work as done — and so must the twelve-rung
check above. `npm run check` does NOT catch a short ladder: it verifies that
every entry in the index is true on disk, and a variant with four rungs is
truthfully a variant with four rungs. Counting them is your job.
