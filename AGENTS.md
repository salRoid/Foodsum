# Foodsum — instructions for the generating agent

Your job is to **generate food images and drop them in `inbox/`**. That is all.

Everything mechanical — cropping, resizing, format, file size, metadata,
filenames, folder layout, the index — is done by `npm run ingest`. Do not do any
of it yourself, and **never write into `corpus/` directly**. A file written
straight into the corpus is one typo away from being a URL nothing serves, and
nothing will notice until a card renders broken.

---

## The loop

```bash
npm run missing      # what needs generating, with the exact prompt for each
# …generate an image for one dish…
# …LOOK AT IT. Reject a wrong dish here, not later…
# …save it as inbox/<slug>.png…
npm run ingest       # crops, resizes, converts, strips, files, indexes
```

`npm run ingest` prints `✓` per accepted file and `✗ <reason>` per rejected one,
and **a rejected file writes nothing at all**. If it rejects, fix the cause or
regenerate — do not work around it.

---

## The prompt

**Fixed prefix + dish.** The prefix is in `STYLE.md` and is versioned.
`npm run missing` prints the assembled prompt for every dish. **Copy it
verbatim.** Do not rewrite, shorten, embellish or "improve" the prefix for a
particular dish — a per-dish prefix is exactly how a set of three hundred
images stops looking like one set, and that is the whole problem this
specification exists to solve.

The only part that varies is the dish name and its portion, and `missing`
already fills both in.

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

## The rule that outranks all of the above

**A wrong dish is worse than no image.** A generated Indian dish can look
completely plausible and be the wrong food — dal that is actually sambar, roti
that is a tortilla, paneer that is tofu. An empty slot renders cleanly by
design; a wrong one misinforms someone about what they ate.

**When in doubt, reject it and move on.** Leaving a dish without a picture is a
correct outcome, not a failure.

---

## Where the file goes, and what it is called

```
inbox/<slug>.png
```

- `<slug>` must be a slug that **already exists** in `src/dishes.ts`.
  `npm run missing` prints the exact filename for every dish in the queue.
- A second picture for the same dish: `inbox/<slug>-2.png` (ingest files it as
  the next variant automatically — do not choose a variant number yourself).
- PNG, JPEG, WebP, TIFF and AVIF are all accepted as input.
- **Generate the largest clean image you can.** Do not try to hit 400×300, or
  4:3, or a file size — ingest normalises all of it. A square image is fine and
  expected; it is centre-cropped. The one hard input requirement is that the
  4:3 centre crop must be at least 400×300, so anything from ~512×512 upward is
  safe. Bigger is better: larger sources populate more rungs of the size ladder.

**You may not add a dish.** A filename that is not a known slug is rejected.
Adding a dish is a code change in `src/dishes.ts` with an alias table behind it,
and a slug is permanent because it is the URL.

---

## Afterwards

`npm run ingest` rebuilds `corpus/index.json` itself. Then:

```bash
npm run check        # every index entry true on disk, nothing unaccounted for
npm test             # the matcher suite, including the staleness guard
```

Both must pass before you report the work as done.
