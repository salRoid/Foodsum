# The corpus

**This folder is empty on purpose.** Sal generates the images; the matcher,
the index and the tests all work and are all verified with zero images
present. An empty corpus is not a degraded state to be fixed before use — it
is the state this ships in, and every consumer already renders nothing for a
dish with no picture.

## Layout

```
corpus/images/<slug>/<variant>/<size>.<format>
                │       │        │       └── webp | jpg
                │       │        └── 160x120 | 400x300 | 800x600 | 1200x900
                │       └── 1, 2, 3 …  (1-indexed, contiguous)
                └── must be a slug in src/dishes.ts
```

Example:

```
corpus/images/dal/1/160x120.webp
corpus/images/dal/1/400x300.webp
corpus/images/dal/1/800x600.webp
corpus/images/dal/1/1200x900.webp
corpus/images/dal/2/400x300.webp
```

The path **is** the URL (`/i/dal/1/400x300.webp`), which is what lets this be
served by any static host with no rewrite rules and no compute at all.

## Adding one — do NOT write into this folder by hand

```bash
npm run missing      # the queue + the exact prompt for each dish
#   …generate, then LOOK AT IT, then save as inbox/<slug>.png…
npm run ingest       # crop · resize · convert · strip · file · index
npm run check
```

Everything below this line is the *layout ingest produces*, documented so the
result is legible. Writing a file here yourself skips the crop, the budget, the
metadata strip and the `meta.json` sidecar, and `npm run check` will flag it —
one dish per image still matters (the strip shows several dishes side by side,
so a thali photo misrepresents every fragment except the one it was filed
under), but ingest cannot check that. **Look at the image** before ingesting: a
wrong or ambiguous picture is the failure mode the whole matcher is built to
avoid, and no amount of correct matching survives a bad photo.

Ingest writes every rung the source supports **without upscaling** — a 1024²
generation yields 160/400/800 and no 1200×900, which is normal and fine. Each
variant folder also carries a `meta.json` recording the style version and
provenance; `npm run build` mirrors it into `index.json`.

## Rules

- **Generic dish names only.** No brands, no restaurant names, no packaged
  products. A generated "Marie Gold biscuit" or "Oreo" reproduces trade dress,
  and trademark — not copyright — is the real exposure in an AI-generated
  corpus. This is why "Marie Gold biscuits" is refused in `src/dishes.ts`.
- **A variant folder is only counted if it is a bare integer.** `1`, `2`, `3`.
  Not `1a`, not `variant-1`.
- **The size ladder is fixed.** Four rungs, pre-rendered. Arbitrary sizing is
  what forces a compute layer into a static project; `397x291` is a 404 and
  that is deliberate.
- **Never rename a slug.** It is the URL. Add an alias instead.
- Record what generated the images in `ATTRIBUTION.md` as you go — "were these
  AI-generated?" is the first question anyone will ask, and the answer is only
  cheap to write down while it is still known.
