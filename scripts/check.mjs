#!/usr/bin/env node
// Does the corpus on disk actually match what `corpus/index.json` promises?
//
// This is the drift detector. `npm run ingest` writes correct files; nothing
// else guarantees they STAY correct — a hand-dropped file, a half-finished
// move, an index rebuilt against a different tree, a restyle that only got
// through half the corpus. Every one of those is invisible until a card
// renders a broken image, because `imageUrlFor` builds URLs from the index and
// never looks at the disk.
//
//   npm run check                exit 1 on any problem
//   npm run check -- --style v1  additionally flag every image NOT on v1
//   npm run check -- --budget-scale 1.5   match a looser ingest
//
// Checked, per index entry: the file exists · exact dimensions · WebP · under
// budget · no EXIF/ICC/IPTC/XMP · a sidecar with a style version.
// Checked, per disk: no orphan file, no orphan slug, no gap in the variant
// numbering, no unknown file inside a variant folder.

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { readStyle, budgetFor, readJson, loadSharp, IMAGES, INDEX_JSON } from './lib/style.mjs';
import { loadIndex } from '../src/index-schema.ts';

const argv = process.argv.slice(2);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const WANT_STYLE = val('--style', null);
const BUDGET_SCALE = Number(val('--budget-scale', 1));

const style = readStyle();
const sharp = await loadSharp();

// `loadIndex` is where the STRUCTURAL invariants live — a duplicate slug, a
// contested alias, and a slug or key claimed by BOTH a dish and a meal. It
// throws, which is right for a consumer and wrong for a report, so it is caught
// here and printed as a check failure. A dish and a meal cannot reach this
// state through `npm run build` (which validates before writing), but a
// hand-edited index can, and that is exactly what this script exists to notice.
let idx;
try {
  idx = loadIndex(readJson(INDEX_JSON));
} catch (err) {
  console.error(`\n── foodsum · corpus check ── style ${style.styleVersion} ──\n`);
  console.error('  1 PROBLEM(S):\n');
  console.error(`  ✗ corpus/index.json will not load: ${err.message}`);
  console.error('');
  process.exit(1);
}

const problems = [];
const warnings = [];
let filesChecked = 0;

// ── every index entry must be true on disk ──────────────────────────────────
// Dishes and meals are checked IDENTICALLY. They share one images tree, one
// URL shape, one ingest and one size ladder, so a second loop here would be a
// second set of rules free to fall out of step with the first.
const entries = [...idx.raw.dishes, ...(idx.raw.meals ?? [])];

for (const dish of entries) {
  const meta = dish.variantMeta ?? [];

  if (dish.variants !== meta.length) {
    problems.push(`${dish.slug}: index says ${dish.variants} variants but carries ${meta.length} variantMeta entries — rebuild with \`npm run build\``);
  }

  // Contiguous 1..n. A gap makes `pickVariant` address a folder that is not
  // there, and it does so DETERMINISTICALLY — the same dish 404s every time.
  const nums = meta.map((m) => m.v).sort((a, b) => a - b);
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) {
      problems.push(`${dish.slug}: variant numbering is not contiguous (${nums.join(',')}) — pickVariant will address a folder that does not exist`);
      break;
    }
  }

  for (const v of meta) {
    const dir = join(IMAGES, dish.slug, String(v.v));

    if (v.styleVersion === 'unknown') {
      problems.push(`${dish.slug}/${v.v}: no meta.json — was this dropped in by hand instead of through \`npm run ingest\`?`);
    } else if (WANT_STYLE && v.styleVersion !== WANT_STYLE) {
      warnings.push(`${dish.slug}/${v.v}: style ${v.styleVersion}, wanted ${WANT_STYLE} — needs regenerating`);
    }

    if (!v.sizes.includes('400x300')) {
      problems.push(`${dish.slug}/${v.v}: no 400x300 rung — that is the size the cards render`);
    }

    for (const size of v.sizes) {
      const file = join(dir, `${size}.webp`);
      if (!existsSync(file)) { problems.push(`${dish.slug}/${v.v}/${size}.webp: in the index, missing on disk`); continue; }

      filesChecked++;
      const [w, h] = size.split('x').map(Number);
      const bytes = statSync(file).size;
      const budget = budgetFor(style, size, BUDGET_SCALE);
      const m = await sharp(file).metadata();

      if (m.format !== 'webp') problems.push(`${dish.slug}/${v.v}/${size}.webp: format is ${m.format}, not webp`);
      if (m.width !== w || m.height !== h) problems.push(`${dish.slug}/${v.v}/${size}.webp: is ${m.width}×${m.height}, should be ${w}×${h}`);
      if (bytes > budget) problems.push(`${dish.slug}/${v.v}/${size}.webp: ${(bytes / 1024).toFixed(1)}KB over the ${(budget / 1024).toFixed(1)}KB budget`);
      if (m.exif || m.icc || m.iptc || m.xmp) {
        problems.push(`${dish.slug}/${v.v}/${size}.webp: carries metadata (${['exif', 'icc', 'iptc', 'xmp'].filter((k) => m[k]).join(', ')}) — STYLE.md requires it stripped`);
      }
    }
  }
}

// ── and nothing on disk may be unaccounted for ──────────────────────────────
// An orphan is not cosmetic. A folder for a slug that no longer exists is dead
// weight in a published corpus; a stray file inside a variant folder is either
// a rung the index does not know about (so nothing ever serves it) or debris.
const known = new Map(entries.map((d) => [d.slug, d]));
if (existsSync(IMAGES)) {
  for (const entry of readdirSync(IMAGES)) {
    const p = join(IMAGES, entry);
    if (!statSync(p).isDirectory()) {
      if (entry !== 'README.md') warnings.push(`corpus/images/${entry}: stray file at the corpus root`);
      continue;
    }
    const dish = known.get(entry);
    if (!dish) { problems.push(`corpus/images/${entry}/: not a dish or meal slug in the catalogue — orphan folder`); continue; }

    for (const vd of readdirSync(p)) {
      const vp = join(p, vd);
      if (!statSync(vp).isDirectory()) { warnings.push(`corpus/images/${entry}/${vd}: stray file`); continue; }
      if (!/^\d+$/.test(vd)) { problems.push(`corpus/images/${entry}/${vd}/: variant folders must be bare integers — this one is invisible to the index`); continue; }

      const inIndex = (dish.variantMeta ?? []).find((m) => m.v === Number(vd));
      if (!inIndex) { problems.push(`corpus/images/${entry}/${vd}/: on disk, absent from the index — run \`npm run build\``); continue; }

      for (const f of readdirSync(vp)) {
        if (f === 'meta.json') continue;
        if (!/^\d+x\d+\.(webp|jpg)$/.test(f)) { problems.push(`corpus/images/${entry}/${vd}/${f}: not a ladder rung, and nothing will ever serve it`); continue; }
        const size = f.replace(/\.(webp|jpg)$/, '');
        if (!inIndex.sizes.includes(size)) problems.push(`corpus/images/${entry}/${vd}/${f}: on disk, absent from the index`);
      }
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const meals = idx.raw.meals ?? [];
const dishVariants = idx.raw.dishes.reduce((n, d) => n + d.variants, 0);
const mealVariants = meals.reduce((n, m) => n + m.variants, 0);
console.log(`\n── foodsum · corpus check ── style ${style.styleVersion} ──\n`);
console.log(
  `  ${idx.raw.dishes.length} dishes (${dishVariants} variants) · ` +
    `${meals.length} meals (${mealVariants} variants) · ` +
    `${filesChecked} image files verified\n`,
);

for (const w of warnings) console.log(`  ! ${w}`);
if (warnings.length) console.log('');

if (problems.length === 0) {
  console.log('  OK — every index entry is true on disk, and nothing on disk is unaccounted for.\n');
  process.exit(0);
}

console.error(`  ${problems.length} PROBLEM(S):\n`);
for (const p of problems) console.error(`  ✗ ${p}`);
console.error('');
process.exit(1);
