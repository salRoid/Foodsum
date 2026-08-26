#!/usr/bin/env node
// inbox/ → corpus/. The step that makes a bad file unable to reach the corpus.
//
// THE SHAPE, and the reason for it: an image model cannot reliably hit an exact
// pixel size, an exact aspect ratio, a file format or a byte budget, and an
// agent writing straight into `corpus/images/<slug>/<variant>/<size>.<format>`
// is one typo away from a file nothing will ever serve — silently, because
// `imageUrlFor` builds the URL from the index, not from the disk. So the
// generating agent's ONLY job is to produce a picture and drop it in `inbox/`.
// Everything mechanical happens here, in code, exactly once.
//
//   npm run ingest              ingest every file in inbox/
//   npm run ingest -- --dry     say what would happen, write nothing
//   npm run ingest -- --keep    leave the source in inbox/ instead of inbox/done/
//   npm run ingest -- --budget-scale 1.5   loosen the NON-canonical rungs
//
// Per file: validate the name against the catalogue → centre-crop to 4:3 →
// write every ladder rung the source can supply without upscaling (400×300 is
// mandatory) → WebP → step quality down until each rung is under budget →
// strip ALL metadata → write a `meta.json` sidecar carrying the style version →
// rebuild `corpus/index.json`.
//
// IT IS ALL-OR-NOTHING PER FILE. A file that cannot meet spec writes nothing at
// all — no half-populated variant folder, no index entry. STYLE.md's rule is
// that an empty slot renders cleanly by design and a wrong one misinforms; a
// three-quarters-populated one is worse than either, because the URL exists.

import { readdirSync, mkdirSync, writeFileSync, renameSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

import {
  readStyle, budgetFor, readJson, loadSharp,
  ROOT, INBOX, IMAGES, INDEX_JSON, CANONICAL_SIZE,
} from './lib/style.mjs';
import { buildIndex } from '../src/build.ts';
import { ASPECTS, ASPECT_SIZES, ASPECT_CANONICAL } from '../src/index-schema.ts';
import { DISHES } from '../src/dishes.ts';
import { MEALS } from '../src/meals.ts';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const num = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const DRY = has('--dry');
const KEEP = has('--keep');
const BUDGET_SCALE = num('--budget-scale', 1);

const ACCEPTED_INPUT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.avif']);
// Dishes and meals share ONE slug namespace and ONE images tree, so ingest
// treats them identically — same crop, same ladder, same budgets, same sidecar.
// `loadIndex` has already made a collision between the two fatal, so a name
// here can only mean one thing.
const SLUGS = new Set([...DISHES.map((d) => d.slug), ...MEALS.map((m) => m.slug)]);
const [CW, CH] = CANONICAL_SIZE.split('x').map(Number);
/** WebP quality ladder, walked downward until the rung fits its budget. */
const QUALITY_STEPS = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40];

const style = readStyle();
const sharp = await loadSharp();

// ── the queue ───────────────────────────────────────────────────────────────
if (!existsSync(INBOX)) mkdirSync(INBOX, { recursive: true });
const files = readdirSync(INBOX)
  .filter((f) => !f.startsWith('.') && f !== 'README.md' && f !== 'done')
  .filter((f) => statSync(join(INBOX, f)).isFile())
  .sort();

if (files.length === 0) {
  console.log('\nfoodsum: inbox/ is empty. Run `npm run missing` for the queue.\n');
  process.exit(0);
}

console.log(`\n── foodsum · ingest ── style ${style.styleVersion}${DRY ? ' · DRY RUN' : ''} ──\n`);

let ok = 0;
const failures = [];

for (const file of files) {
  const src = join(INBOX, file);
  try {
    const result = await ingestOne(src, file);
    ok++;
    console.log(`  ✓ ${file}  →  ${result.rel}`);
    console.log(`      variant ${result.variant} · ${result.rungs.map((r) => `${r.size} ${r.kb}KB q${r.quality}`).join(' · ')}`);
    if (!DRY && !KEEP) {
      const doneDir = join(INBOX, 'done');
      mkdirSync(doneDir, { recursive: true });
      renameSync(src, join(doneDir, file));
    }
  } catch (err) {
    failures.push({ file, message: err.message });
    console.log(`  ✗ ${file}`);
    console.log(`      ${err.message.split('\n').join('\n      ')}`);
  }
}

// ── the index ───────────────────────────────────────────────────────────────
// Rebuilt from disk rather than patched in place: `buildIndex` is already the
// single definition of what the index is, and a second writer would be free to
// disagree with it. Skipped on a dry run and when nothing landed.
if (ok > 0 && !DRY) {
  const index = buildIndex(IMAGES);
  writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + '\n');
  const meals = index.meals ?? [];
  const withImages = index.dishes.filter((d) => d.variants > 0).length;
  const mealsWith = meals.filter((m) => m.variants > 0).length;
  console.log(
    `\n  index rebuilt: ${withImages}/${index.dishes.length} dishes and ` +
      `${mealsWith}/${meals.length} meals now have an image`,
  );
}

console.log(`\n  ${ok} ingested, ${failures.length} rejected${DRY ? ' (dry run — nothing written)' : ''}\n`);

if (failures.length) {
  console.error('REJECTED — nothing was written for these. Fix or regenerate:\n');
  for (const f of failures) console.error(`  ${f.file}: ${f.message.split('\n')[0]}`);
  console.error('');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * `<slug>.<ext>` or `<slug>-<n>.<ext>` / `<slug>--<anything>.<ext>`.
 *
 * The slug must already be in the catalogue. Ingest deliberately does NOT
 * create dishes: adding a dish is a code change in `src/dishes.ts` with an
 * alias table behind it, and letting a filename mint a slug would let an agent
 * grow the catalogue by accident — with a slug it invented, which is permanent
 * because the slug is the URL.
 */
function slugFromFilename(file) {
  const stem = basename(file, extname(file));
  if (SLUGS.has(stem)) return stem;
  const trimmed = stem.replace(/(--.*|-\d+)$/, '');
  if (SLUGS.has(trimmed)) return trimmed;
  throw new Error(
    `"${stem}" is not a slug in src/dishes.ts or src/meals.ts. Name the file <slug>.png ` +
      'exactly — run `npm run missing` for the list. Adding a NEW dish or meal is a code ' +
      'change, not a file drop.',
  );
}

async function ingestOne(src, file) {
  const ext = extname(file).toLowerCase();
  if (!ACCEPTED_INPUT.has(ext)) {
    throw new Error(`unsupported input format "${ext}" (accepted: ${[...ACCEPTED_INPUT].join(' ')})`);
  }
  const slug = slugFromFilename(file);

  const meta = await sharp(src).metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable image — no dimensions');

  // ── centre-crop, ONCE PER ASPECT ──────────────────────────────────────────
  // One photograph, three crops. A consumer does not have one hole to fill:
  // Health alone renders a dish in a wide half-width band, a card hero and a
  // 16:9 panel, and a 4:3 picture is wrong in two of the three. `index-schema`
  // has defined the three ladders and `imageUrlFor` has served them for a
  // while; this is the producing half, which never existed — which is why every
  // variant on disk carried 4:3 rungs while the index advertised twelve.
  //
  // STYLE.md's angle decision is what makes a centre crop safe at all: a 90°
  // overhead flat-lay with the dish centred and filling ~75% of the frame crops
  // predictably. A centre crop of a perspective shot would decapitate the plate.
  //
  // 4:3 IS STILL THE ONLY MANDATORY ONE. A narrow aspect contributes whatever
  // rungs the source can supply and nothing more, so adding aspects cannot make
  // a file that used to ingest start failing — the promise `index-schema.ts`
  // already documents on ASPECT_CANONICAL, kept here rather than restated.
  const crops = {};
  const encoded = [];
  const dropped = [];

  for (const aspect of ASPECTS) {
    // The ratio is DERIVED from the ladder's own canonical rung, never written
    // down a second time: a constant here could drift from ASPECT_SIZES and
    // produce a "16:9" file that is not 16:9.
    const [aw, ah] = ASPECT_CANONICAL[aspect].split('x').map(Number);
    const targetAR = aw / ah;
    const srcAR = meta.width / meta.height;
    const cropW = srcAR > targetAR ? Math.round(meta.height * targetAR) : meta.width;
    const cropH = srcAR > targetAR ? meta.height : Math.round(meta.width / targetAR);

    if (aspect === '4:3' && (cropW < CW || cropH < CH)) {
      throw new Error(
        `too small: ${meta.width}×${meta.height} centre-crops to ${cropW}×${cropH}, ` +
          `below the canonical ${CANONICAL_SIZE}. Upscaling is refused — regenerate larger.`,
      );
    }

    // Only rungs the crop can supply WITHOUT upscaling. Never invent pixels:
    // an upscaled 1200×900 is a lie about the image's resolution, and it is the
    // rung a consumer gets by default when it asks for no size at all.
    const rungs = ASPECT_SIZES[aspect].filter((size) => {
      const [w, h] = size.split('x').map(Number);
      return w <= cropW && h <= cropH;
    });

    if (aspect === '4:3' && !rungs.includes(CANONICAL_SIZE)) {
      throw new Error(`cannot produce the canonical ${CANONICAL_SIZE} rung from ${cropW}×${cropH}`);
    }
    if (rungs.length === 0) continue;

    const base = sharp(src).extract({
      left: Math.floor((meta.width - cropW) / 2),
      top: Math.floor((meta.height - cropH) / 2),
      width: cropW,
      height: cropH,
    });

    // ── encode every rung, all in memory, before anything touches the corpus ──
    for (const size of rungs) {
      const [w, h] = size.split('x').map(Number);
      const budget = budgetFor(style, size, BUDGET_SCALE);
      let hit = null;
      for (const quality of QUALITY_STEPS) {
        const buf = await base
          .clone()
          .resize(w, h, { fit: 'cover', position: 'centre' })
          .toColourspace('srgb')
          // sharp strips metadata unless `withMetadata()` is called. It is
          // deliberately NOT called: STYLE.md requires no EXIF and no generator
          // tags, and the corpus is intended for publication.
          .webp({ quality, effort: 6 })
          .toBuffer();
        if (buf.length <= budget) { hit = { size, aspect, quality, buf, budget }; break; }
        hit = { size, aspect, quality, buf, budget }; // keep the smallest attempt for the error
      }

      if (hit.buf.length > hit.budget) {
        // A 4:3 rung over budget is still FATAL — that ladder is the spec, and
        // its canonical rung's budget is STYLE.md's own number. A narrow rung
        // over budget is DROPPED and reported instead: making it fatal would
        // break the "adding aspects cannot fail a file that used to ingest"
        // promise, and a ladder is allowed to be short (no-upscale already
        // shortens it) but never half-written.
        if (aspect === '4:3') {
          throw new Error(
            `${size} will not fit its budget: ${(hit.buf.length / 1024).toFixed(1)}KB at ` +
              `quality ${hit.quality} (lowest tried), budget ${(hit.budget / 1024).toFixed(1)}KB. ` +
              (size === CANONICAL_SIZE
                ? 'That budget is STYLE.md\'s. A busy, high-contrast or textured image is the usual ' +
                  'cause — STYLE.md asks for a seamless flat background for exactly this reason.'
                : 'This rung\'s budget is a tooling default; --budget-scale loosens it.'),
          );
        }
        dropped.push(`${size} (${(hit.buf.length / 1024).toFixed(1)}KB over ${(hit.budget / 1024).toFixed(1)}KB)`);
        continue;
      }
      encoded.push(hit);
    }

    crops[aspect] = `${cropW}x${cropH}`;
  }

  // ── verify what we are about to write, before writing it ─────────────────
  for (const e of encoded) {
    const [w, h] = e.size.split('x').map(Number);
    const m = await sharp(e.buf).metadata();
    if (m.width !== w || m.height !== h) throw new Error(`internal: ${e.size} encoded as ${m.width}×${m.height}`);
    if (m.format !== 'webp') throw new Error(`internal: ${e.size} encoded as ${m.format}`);
    if (m.exif || m.icc || m.iptc || m.xmp) throw new Error(`internal: ${e.size} still carries metadata`);
  }

  const variant = nextVariant(slug);
  const dir = join(IMAGES, slug, String(variant));
  const rel = `corpus/images/${slug}/${variant}/`;
  const rungReport = encoded.map((e) => ({
    size: e.size, quality: e.quality, kb: (e.buf.length / 1024).toFixed(1),
  }));

  if (DRY) return { rel, variant, rungs: rungReport };

  // ── write, all-or-nothing ────────────────────────────────────────────────
  mkdirSync(dir, { recursive: true });
  try {
    for (const e of encoded) writeFileSync(join(dir, `${e.size}.webp`), e.buf);
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify(
        {
          styleVersion: style.styleVersion,
          ingestedAt: new Date().toISOString().slice(0, 10),
          sourceFile: file,
          sourceSize: `${meta.width}x${meta.height}`,
          // `crop` stays the 4:3 box so a sidecar written before aspects
          // existed and one written now mean the same thing; `crops` carries
          // the rest. Reusing the old key for a map would silently change what
          // every existing meta.json claims.
          crop: crops['4:3'],
          crops,
          sizes: encoded.map((e) => e.size),
          // Which rungs were skipped for weight, so a short narrow ladder is a
          // recorded decision rather than a mystery at `npm run check` time.
          ...(dropped.length ? { droppedForBudget: dropped } : {}),
          format: 'webp',
          bytes: Object.fromEntries(encoded.map((e) => [e.size, e.buf.length])),
          quality: Object.fromEntries(encoded.map((e) => [e.size, e.quality])),
        },
        null,
        2,
      ) + '\n',
    );
  } catch (err) {
    rmSync(dir, { recursive: true, force: true }); // never leave a partial variant
    throw err;
  }

  return { rel, variant, rungs: rungReport };
}

/**
 * The next free 1-indexed variant number.
 *
 * Contiguous by construction — `countVariants` counts folders, so a gap would
 * make the index claim more variants than `pickVariant` can address, and the
 * missing one would 404 deterministically for whichever dish hashed onto it.
 */
function nextVariant(slug) {
  const dir = join(IMAGES, slug);
  if (!existsSync(dir)) return 1;
  const taken = readdirSync(dir)
    .filter((e) => /^\d+$/.test(e) && statSync(join(dir, e)).isDirectory())
    .map(Number);
  let n = 1;
  while (taken.includes(n)) n++;
  return n;
}
