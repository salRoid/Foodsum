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

export function readStyle() {
  const md = readFileSync(STYLE_PATH, 'utf8');

  const vm = md.match(/\*\*Style version:\s*`([^`]+)`\*\*/);
  if (!vm) throw new Error('foodsum: STYLE.md has no "**Style version: `vN`**" line');
  const styleVersion = vm[1];

  // The blockquote under "### Fixed prefix (vN)".
  const pm = md.match(/###\s*Fixed prefix[^\n]*\n\n((?:>[^\n]*\n)+)/);
  if (!pm) throw new Error('foodsum: STYLE.md has no "### Fixed prefix" blockquote');
  const prefix = pm[1]
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!prefix.includes('{dish}')) {
    throw new Error('foodsum: STYLE.md prompt prefix has no {dish} placeholder');
  }

  const bm = md.match(/Target weight[^|]*\|\s*\*\*under\s+([\d.]+)\s*KB\*\*/i);
  if (!bm) throw new Error('foodsum: STYLE.md has no "Target weight … under N KB" row');
  const canonicalBudgetBytes = Math.round(parseFloat(bm[1]) * 1024);

  // The hard exclusions, so AGENTS.md and `missing` can quote them verbatim
  // instead of paraphrasing (a paraphrased rule is a changed rule).
  const em = md.match(/##\s*Hard exclusions[^\n]*\n\n[^\n]*\n\n((?:-[^\n]*\n)+)/);
  const exclusions = em
    ? em[1].split('\n').filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim())
    : [];

  return { styleVersion, prefix, canonicalBudgetBytes, exclusions };
}

/** `prefix` with `{dish}` filled in. The ONLY sanctioned way to build a prompt. */
export function promptFor(style, dishText) {
  return style.prefix.replace('{dish}', dishText);
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
