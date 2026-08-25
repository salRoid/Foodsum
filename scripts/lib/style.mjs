// STYLE.md, read as data.
//
// The prompt prefix, the style version and the weight budget are PARSED OUT OF
// `STYLE.md` at runtime rather than restated here. That is deliberate: a second
// copy of the prefix is exactly how a set drifts, and STYLE.md itself says the
// prefix is versioned and lives there. If the parse fails, every script that
// depends on it fails loudly rather than falling back to a stale constant.
//
// The ONLY numbers invented here are the per-rung weight budgets for the sizes
// STYLE.md does not name. STYLE.md specifies a budget for 400×300 only; the
// others are scaled by pixel area and are TOOLING DEFAULTS, not style spec.
// They are overridable with `--budget-scale`. See `budgetFor`.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STYLE_PATH = join(ROOT, 'STYLE.md');
export const INBOX = join(ROOT, 'inbox');
export const IMAGES = join(ROOT, 'corpus', 'images');
export const INDEX_JSON = join(ROOT, 'corpus', 'index.json');
export const PORTIONS_JSON = join(ROOT, 'corpus', 'portions.json');

/** The rung the cards actually render, and the one STYLE.md budgets. */
export const CANONICAL_SIZE = '400x300';

/**
 * The section of STYLE.md under one EXACT heading line, up to the next heading
 * of the same or a shallower depth.
 *
 * Matching the heading exactly, rather than by a loose `##\s*Hard exclusions`
 * pattern, is deliberate. The meal variant added `### Fixed prefix — meal (v1)`
 * and `### Hard exclusions — meals` next to the dish originals, and a loose
 * pattern silently picks whichever comes first in the file — which would have
 * made the section order of a markdown document decide which prompt every image
 * in the corpus was generated from.
 */
function section(md, heading) {
  const depth = heading.match(/^#+/)[0].length;
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= depth,
  );
  return lines.slice(start + 1, end === -1 ? lines.length : end).join('\n');
}

/** The first blockquote in a section, flattened to one line. */
function blockquote(body, heading) {
  const m = body?.match(/(?:^|\n)((?:>[^\n]*\n)+)/);
  if (!m) throw new Error(`foodsum: STYLE.md section "${heading}" has no blockquote`);
  return m[1]
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first `- ` bullet list in a section. */
function bullets(body) {
  if (!body) return [];
  const m = body.match(/(?:^|\n)((?:-[^\n]*\n)+)/);
  if (!m) return [];
  return m[1]
    .split('\n')
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim());
}

const DISH_PREFIX_HEADING = '### Fixed prefix (v1)';
const MEAL_PREFIX_HEADING = '### Fixed prefix — meal (v1)';
const DISH_EXCLUSIONS_HEADING = '## Hard exclusions';
const MEAL_EXCLUSIONS_HEADING = '### Hard exclusions — meals';

export function readStyle() {
  const md = readFileSync(STYLE_PATH, 'utf8');

  const vm = md.match(/\*\*Style version:\s*`([^`]+)`\*\*/);
  if (!vm) throw new Error('foodsum: STYLE.md has no "**Style version: `vN`**" line');
  const styleVersion = vm[1];

  // The two prefix headings carry the style version in their own text, so a
  // version bump that forgets to bump a heading fails loudly here rather than
  // generating v2 images from the v1 prompt.
  const dishHeading = DISH_PREFIX_HEADING.replace('v1', styleVersion);
  const mealHeading = MEAL_PREFIX_HEADING.replace('v1', styleVersion);

  const dishBody = section(md, dishHeading);
  if (!dishBody) throw new Error(`foodsum: STYLE.md has no "${dishHeading}" section`);
  const prefix = blockquote(dishBody, dishHeading);
  if (!prefix.includes('{dish}')) {
    throw new Error('foodsum: STYLE.md dish prompt prefix has no {dish} placeholder');
  }

  const mealBody = section(md, mealHeading);
  if (!mealBody) throw new Error(`foodsum: STYLE.md has no "${mealHeading}" section`);
  const mealPrefix = blockquote(mealBody, mealHeading);
  if (!mealPrefix.includes('{meal}')) {
    throw new Error('foodsum: STYLE.md meal prompt prefix has no {meal} placeholder');
  }

  const bm = md.match(/Target weight[^|]*\|\s*\*\*under\s+([\d.]+)\s*KB\*\*/i);
  if (!bm) throw new Error('foodsum: STYLE.md has no "Target weight … under N KB" row');
  const canonicalBudgetBytes = Math.round(parseFloat(bm[1]) * 1024);

  // The hard exclusions, so AGENTS.md and `missing` can quote them verbatim
  // instead of paraphrasing (a paraphrased rule is a changed rule).
  const exclusions = bullets(section(md, DISH_EXCLUSIONS_HEADING));
  // A meal is several things by definition, so two dish exclusions are
  // REPLACED for meals rather than dropped. STYLE.md restates the whole list
  // there; it is quoted whole rather than diffed, for the same reason.
  const mealExclusions = bullets(section(md, MEAL_EXCLUSIONS_HEADING));

  return {
    styleVersion,
    prefix,
    mealPrefix,
    canonicalBudgetBytes,
    exclusions,
    mealExclusions: mealExclusions.length ? mealExclusions : exclusions,
  };
}

/** `prefix` with `{dish}` filled in. The ONLY sanctioned way to build a dish prompt. */
export function promptFor(style, dishText) {
  return style.prefix.replace('{dish}', dishText);
}

/**
 * `mealPrefix` with `{meal}` filled in. The ONLY sanctioned way to build a meal
 * prompt — and note it takes the meal's NAME verbatim, portions and all,
 * because a meal's portions live inside its own string rather than in Health's
 * `Food` table.
 */
export function mealPromptFor(style, mealName) {
  return style.mealPrefix.replace('{meal}', mealName);
}

/**
 * Weight budget for a rung.
 *
 * STYLE.md budgets 400×300 only. Everything else is scaled by pixel area from
 * that figure — a tooling default, stated as one, so nobody mistakes it for the
 * agreed spec. `scale` widens or narrows every non-canonical rung at once.
 */
export function budgetFor(style, size, scale = 1) {
  const [w, h] = size.split('x').map(Number);
  if (size === CANONICAL_SIZE) return style.canonicalBudgetBytes;
  const area = (w * h) / (400 * 300);
  return Math.round(style.canonicalBudgetBytes * area * scale);
}

/** The dish text for a prompt: name plus portion when one is known. */
export function dishText(dish, portions) {
  const portion = portions?.[dish.slug];
  return portion ? `${dish.name} (${portion})` : dish.name;
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

/**
 * sharp, resolved lazily from the workspace.
 *
 * Foodsum's RUNTIME is dependency-free and stays that way — `src/` imports
 * nothing but `node:*`. sharp is a build-tool dependency of the ingest and
 * check SCRIPTS only, declared in `devDependencies`, and it already resolves
 * from the hoisted workspace root (Quickie depends on it). A consumer that
 * imports `@suite/foodsum` never touches this file.
 */
export async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch (err) {
    throw new Error(
      'foodsum: sharp is not resolvable. It is a devDependency of the image ' +
        'pipeline only (the library runtime needs nothing). Run `npm install` ' +
        `at the workspace root.\n  ${err.message}`,
    );
  }
}
