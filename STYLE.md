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

A generation prompt is **fixed prefix + subject**. There are exactly **two**
prefixes — one for a single dish, one for a composed meal — both versioned,
both living here; only the subject changes. Never rewrite a prefix per subject:
that is precisely how a set drifts.

`scripts/lib/style.mjs` parses both out of this file by their exact heading, so
a prefix has one definition and the section order of this document cannot
decide which one an image was generated from.

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

## The meal variant — a composed plate

Some entries in the corpus are whole **meals**, not dishes: a plate that gets
eaten repeatedly and deserves one real photograph rather than a strip of three
dish pictures side by side. See `src/meals.ts` for which and why.

A meal image is **the same style**, differing only in what is on the surface.
Angle, vessel, background, light, contact shadow and every accuracy rule below
are unchanged — a meal photo that looked like a different set would defeat the
entire point of having one prefix.

### Fixed prefix — component (v1)

> Top-down 90° overhead photograph of {dish}, served in a single plain matte
> white ceramic katori (small round bowl), the bowl centred and filling the
> entire frame edge to edge. Pure flat white background, completely seamless.
> Absolutely no shadow of any kind, no contact shadow, no cast shadow. Soft
> perfectly even diffuse lighting with no directional falloff. Realistic
> home-cooked portion, filled to just below the rim. Photographic, natural
> colour, no styling flourishes.

**A component is NOT a dish photograph.** It exists to be CUT OUT and placed
into a katori-shaped slot on a thali, so three things are different and all
three matter:

- **No shadow, ever.** The thali supplies one shadow per slot, so a component
  carrying its own arrives as a dark smear on the tray. This is the single most
  common way a composed plate looks wrong.
- **Filling the frame, not 75% of it.** The composer scales by the frame, so a
  component shot at 75% is silently smaller than its neighbours in the same
  thali — and inconsistent scale between katoris is the other way it looks wrong.
- **Pure white, not warm-grey.** The background is discarded; warm-grey leaves a
  halo when keyed out, and a halo survives Beacon's 1-bit dithering as a ring.

For a `flat` component (roti, naan, dosa) replace the katori clause with: *laid
flat and centred on a pure white background, filling the entire frame, no
vessel.* For a `mound` component (rice) use: *heaped as a single mound, centred,
filling the frame, no vessel.*

**Hard exclusions — component.** Every dish exclusion applies, plus: no vessel
other than the one katori; no second bowl; no tray, thali, plate or placemat
under it; nothing cropped by the frame edge except deliberately, at the bowl's
own rim.

### Fixed prefix — meal (v1)

> Top-down 90° overhead photograph of one complete meal of {meal}, arranged
> together on a plain matte white ceramic plate, with any wet or loose
> component in its own small plain matte white ceramic bowl set beside the
> plate. Seamless flat light warm-grey background, no surface texture, no
> cloth, no props. Soft diffuse even lighting from above with a soft contact
> shadow under every vessel. The meal centred as one arrangement, filling
> roughly 80% of the frame. Realistic home-cooked portions as stated.
> Photographic, natural colour, no styling flourishes.

**Per meal, only the meal name goes in `{meal}` — verbatim, portions
included.** A meal carries its portions inside its own name (`Greek yogurt
200g + 8 almonds`), so unlike a dish it takes nothing from the `Food` table.

### Hard exclusions — meals

Two of the dish exclusions cannot apply to a plate that is several things by
definition, so for a meal image they are **replaced** by narrower rules. Every
other exclusion below applies in full and unchanged.

- hands, people, or any part of a body
- cutlery, chopsticks, napkins, or glasses
- any vessel that is not holding part of the named meal
- text, labels, watermarks, or signage
- garnish beyond what the dish genuinely has (no scattered herbs "for styling")
- a patterned, coloured, wooden, marble, or textured surface
- steam, splashes, motion, or a "hero" restaurant treatment
- a visible frame edge, border, or vignette

**A missing component is a wrong meal.** `Dal + 1 roti + sprouts salad` with no
salad in frame is not a slightly imperfect image of that meal; it is an image
of a different one, and it is worse than a dish strip because it claims to show
the whole row. Count the components against the name before accepting it —
`npm run missing` prints them.

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

1. `npm run missing` — lists **dishes** and **meals** with no image, each with
   its prompt already assembled from the right prefix. The two prefixes are not
   interchangeable; copy the one printed under the entry.
2. Generate. Drop the raw file into `inbox/<slug>.<ext>`.
3. **Look at it.** Reject wrong dishes here, not later. For a meal, count its
   components against the `must show:` line first.
4. `npm run ingest` — crops, resizes, converts, strips metadata, names the file,
   writes the index entry with `styleVersion: v1`, and fails loudly if anything
   does not meet the table above.

The agent's only job is step 2. Everything mechanical is code, so a
wrong-named, wrong-sized or wrong-format file cannot reach the corpus.
