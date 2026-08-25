#!/usr/bin/env node
// Build `corpus/index.json` from `src/dishes.ts` + whatever is in
// `corpus/images/`.
//
// This is the ONLY step between adding a dish (or dropping in an image) and a
// consumer seeing it. Run it after either. It is idempotent, it writes one
// file, and it fails loudly on a contested alias rather than picking a winner.
//
//   npm run build
//
// The work lives in `src/build.ts` so it can be exercised against a temp
// corpus in the test suite.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = buildIndex(join(ROOT, 'corpus', 'images'));

writeFileSync(join(ROOT, 'corpus', 'index.json'), JSON.stringify(index, null, 2) + '\n');

const withImages = index.dishes.filter((d) => d.variants > 0).length;
console.log(
  `foodsum: wrote ${index.dishes.length} dishes, ` +
    `${index.dishes.reduce((n, d) => n + d.keys.length, 0)} lookup keys, ` +
    `${withImages} with images → corpus/index.json`,
);
