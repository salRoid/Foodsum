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
# …generate an image for one dish or one meal…
# …LOOK AT IT. Reject a wrong dish here, not later…
# …save it as inbox/<slug>.png…
npm run ingest       # crops, resizes, converts, strips, files, indexes
```

`npm run missing` prints **two queues**:

| | |
|---|---|
| **DISHES** | one dish, one vessel. The base of the corpus. |
| **MEALS** | one composed plate of several things — the handful of meals eaten often enough to deserve a real photograph instead of a strip of dish pictures. |

They use **different prompt prefixes**, both fixed, both in `STYLE.md`. Copy the
one printed under the entry. A meal shot with the dish prompt is a bowl of one
thing, and a dish shot with the meal prompt is a plate of inventions.

Otherwise they are the same job and go through the same `npm run ingest`:
`inbox/<slug>.png` either way, slug must already exist, no other difference.

`npm run ingest` prints `✓` per accepted file and `✗ <reason>` per rejected one,
and **a rejected file writes nothing at all**. If it rejects, fix the cause or
regenerate — do not work around it.

---

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
- **Generate the largest clean image you can.** Do not try to hit 400×300, or
  4:3, or a file size — ingest normalises all of it. A square image is fine and
  expected; it is centre-cropped. The one hard input requirement is that the
  4:3 centre crop must be at least 400×300, so anything from ~512×512 upward is
  safe. Bigger is better: larger sources populate more rungs of the size ladder.

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

Both must pass before you report the work as done.
