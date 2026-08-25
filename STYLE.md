# Foodsum — image style specification

**Style version: `v1`** (recorded per image in the index; a restyle bumps this
and the report can then list every image still on an older version).

This file exists because the hard problem is not generating one good image — it
is generating **three hundred that look like one set**. Each generation is
independent, so anything left unstated drifts: angle, plate, light, distance,
background. Everything below is stated so it cannot.

Decided with Sal, 2026-08-25.

---

## The three decisions everything else follows from

| | |
|---|---|
| **Angle** | **90° overhead flat-lay.** No perspective to match between generations, portions read honestly, and a round bowl crops predictably into 4:3. |
| **Vessel** | **Plain white ceramic.** Matte, unpatterned, no rim decoration, no branding. |
| **Background** | **Flat, seamless, light neutral.** No cloth, no props, no surface texture. |

### The one conflict these create, and how it is resolved

White ceramic on a light background has no edge. Left alone the bowl dissolves
into the backdrop and every card looks like a smudge at 400×300.

So the backdrop is **NOT white**: it is a light *warm grey* — around `#EDEAE6`,
a step or two darker than the ceramic — and every image carries a **soft contact
shadow** beneath the vessel. That shadow is not decoration; it is what separates
the dish from the background. An image without it is rejected.

---

## The prompt contract

A generation prompt is **fixed prefix + dish**. The prefix is versioned and
lives here; only the dish part changes. Never rewrite the prefix per dish —
that is precisely how a set drifts.

### Fixed prefix (v1)

> Top-down 90° overhead photograph of {dish}, served in a plain matte white
> ceramic bowl (or on a plain matte white ceramic plate where the dish is not a
> bowl dish). Seamless flat light warm-grey background, no surface texture, no
> cloth, no props. Soft diffuse even lighting from above with a soft contact
> shadow under the vessel. Dish centred, filling roughly 75% of the frame.
> Realistic home-cooked portion. Photographic, natural colour, no styling
> flourishes.

### Per dish

Only the dish name and its **portion**, taken from the `Food` row — the names
already carry it (`Dal (1 katori, cooked)`, `Roti (1 medium, no ghee)`). The
portion is part of the prompt because a picture of a mountain of rice against a
row that says "1 katori" is a lie the user will act on.

---

## Hard exclusions

Reject the image if it contains any of these:

- hands, people, or any part of a body
- cutlery, chopsticks, napkins, glasses, or a second dish
- text, labels, watermarks, or signage
- garnish beyond what the dish genuinely has (no scattered herbs "for styling")
- a patterned, coloured, wooden, marble, or textured surface
- steam, splashes, motion, or a "hero" restaurant treatment
- more than one vessel in frame
- a visible frame edge, border, or vignette

## Accuracy — the rule that outranks looks

**A wrong dish is worse than no image.** This is the same rule the matcher
already enforces by refusing low-confidence names, and it matters more here:
a generated Indian dish can look completely plausible and be the wrong food.
Dal that is actually sambar, roti that is a tortilla, paneer that is tofu.

So: review before ingest, never generate straight into the corpus, and when in
doubt reject. An empty slot renders cleanly by design; a wrong one misinforms.

---

## Technical output

The generator does **not** need to hit these — `npm run ingest` enforces them.
Produce the largest clean square-ish image available and let the pipeline
normalise.

| | |
|---|---|
| Aspect | **4:3** (cropped centre if the source is square) |
| Canonical size | **400 × 300** — what the cards actually render |
| Format | **WebP** |
| Target weight | **under 40 KB**; quality tuned down until it fits |
| Metadata | **stripped** — no EXIF, no generator tags |
| Colour | sRGB |

---

## Workflow

1. `npm run missing` — lists dishes with no image, with their prompt already
   assembled from the prefix + the row.
2. Generate. Drop the raw file into `inbox/<slug>.<ext>`.
3. **Look at it.** Reject wrong dishes here, not later.
4. `npm run ingest` — crops, resizes, converts, strips metadata, names the file,
   writes the index entry with `styleVersion: v1`, and fails loudly if anything
   does not meet the table above.

The agent's only job is step 2. Everything mechanical is code, so a
wrong-named, wrong-sized or wrong-format file cannot reach the corpus.
