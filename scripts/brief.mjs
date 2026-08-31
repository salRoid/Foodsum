// The GENERATION BRIEF: what Foodsum is missing, as data an agent can act on.
//
//   npm run brief                 read meals from the local health_db_local
//   npm run brief -- --prod       read meals STRAIGHT FROM PRODUCTION over ssh
//   npm run brief -- --all        include PLANNED meals, not just logged ones
//   npm run brief -- --days 30    window (default 30)
//   npm run brief -- --json       machine-readable only, nothing else
//
// ── WHY THIS EXISTS BESIDE `missing` AND `export` ──────────────────────────
// `missing` and `export` answer "which dishes ALREADY IN THE CATALOGUE have no
// photograph". That is the right question once a dish exists, and it is the
// wrong question when the food you ate is one the catalogue has never heard
// of — Foodsum cannot be missing an image for a dish it does not know about.
// Measured on the real logs for 25-30 Aug 2026: every dish that RESOLVED
// already had a photograph (13 of 13), while THIRTY-ONE fragments resolved to
// nothing at all. `missing` reported an empty queue and was correct; the queue
// was empty because the catalogue was.
//
// So this emits BOTH halves:
//   candidates — fragments no dish claims, i.e. `src/dishes.ts` entries to write
//   missing    — catalogue dishes that were eaten and have no image yet
//
// ── IT NEVER WRITES `src/dishes.ts`, AND THAT IS THE POINT ─────────────────
// An alias is an EXACT string a person would really type. A script that mints
// aliases from whatever was logged is a matcher that has learned to guess, and
// on its first run it would have aliased "4 marie gold biscuits" — a brand,
// refused on purpose. `suggestedSlug` below is a STARTING POINT for a human or
// a model to judge, never an instruction. The rules it must be judged against
// travel in the JSON (`rules`) so the thing consuming this cannot apply a
// different policy than the catalogue documents.
//
// ── WHY --prod EXISTS ─────────────────────────────────────────────────────
// On 2026-08-31 `health_db_local` held 37 meals while production held 71, and
// on the same day `./sync-db.sh sync Health` reproducibly produced a dump with
// 51 of those 71 rows (cause unresolved — see NEXT.md). Anything measured off
// the mirror is a fact about the mirror. --prod reads the server directly and
// depends on no sync having worked.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadIndex } from '../src/index-schema.ts';
import { resolveMealFragments } from '../src/resolve.ts';
import { REFUSED } from '../src/dishes.ts';
import { normalise } from '../src/normalise.ts';
import {
  ROOT, INDEX_JSON, PORTIONS_JSON, readStyle, promptFor, dishText, readJson, CANONICAL_SIZE,
} from './lib/style.mjs';
import { dbUrl, query } from './lib/db.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const JSON_ONLY = has('--json');
const say = (...a) => { if (!JSON_ONLY) console.log(...a); };

const days = Number(val('--days', '30'));
const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

// ── the meals ──────────────────────────────────────────────────────────────
// LOGGED ONLY by default. Sal's correction of 2026-08-26: "it should be based
// on what i logged not what you planned". On that day's data 35 of 37 rows were
// PLAN rows, so counting them handed his own plan back to him as evidence of
// what he eats — the feature being wrong, not a rounding error.
const wantPlanned = has('--all');
const VPS = 'root@200.234.42.67';

function fromProd() {
  const sql = `select date || E'\\t' || planned || E'\\t' || name from "Meal" `
            + `where date >= '${since}' order by date`;
  const remote = `su - postgres -c ${JSON.stringify(`psql -tAc ${JSON.stringify(sql)} health_db`)}`;
  const out = execFileSync('ssh', [VPS, remote], { encoding: 'utf8', timeout: 60_000 });
  return out.trim().split('\n').filter(Boolean).map((l) => {
    const [date, planned, ...rest] = l.split('\t');
    return { date, planned: planned === 'true' || planned === 't', name: rest.join('\t').trim() };
  });
}

function fromLocal() {
  const url = dbUrl(argv);
  const rows = query(url, `select date, planned, name from "Meal" where date >= '${since}' order by date`);
  return rows.map((r) => ({
    date: String(r.date ?? r[0]),
    planned: r.planned === true || r.planned === 't' || r.planned === 'true',
    name: String(r.name ?? r[2]).trim(),
  }));
}

const all = has('--prod') ? fromProd() : fromLocal();
const meals = all.filter((m) => (wantPlanned ? true : !m.planned));

// ── resolve ────────────────────────────────────────────────────────────────
const idx = loadIndex(JSON.parse(readFileSync(INDEX_JSON, 'utf8')));
const bySlug = new Map(idx.raw.dishes.map((d) => [d.slug, d]));
const style = readStyle();
const portions = readJson(PORTIONS_JSON, { portions: {} }).portions ?? {};

const eaten = new Map();       // slug -> { n, examples:Set }
const unresolved = new Map();  // normalised fragment -> { n, examples:Set }

for (const m of meals) {
  for (const f of resolveMealFragments(idx, m.name)) {
    // Unresolved fragments key on the NORMALISED text — the same function the
    // matcher and REFUSED use — or "4 marie gold biscuits" never matches the
    // 'marie gold biscuits' refusal and is reported as a fresh candidate.
    const key = f.dish ? f.dish.slug : normalise(f.text);
    const bag = f.dish ? eaten : unresolved;
    const e = bag.get(key) ?? { n: 0, examples: new Set() };
    e.n += 1; if (e.examples.size < 3) e.examples.add(m.name);
    bag.set(key, e);
  }
}

// A slug people would plausibly want. NOT authoritative — see the header.
function suggestSlug(fragment) {
  // Strip a LEADING quantity phrase only, in order, and never mid-string: a
  // blanket unit strip turned "cup of tea" into "of tea" -> `of-tea`, which is
  // worse than no suggestion because it reads like a considered answer.
  return fragment
    .replace(/^\d+(\.\d+)?\s*/, '')                                        // "4 idli"
    .replace(/^(katori|tbsp|tsp|scoop|cup|bowl|glass|piece|pcs?)\s+/, '')    // "katori sambar"
    .replace(/^of\s+/, '')                                                  // what "cup of tea" leaves
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const candidates = [...unresolved.entries()]
  .sort((a, b) => b[1].n - a[1].n)
  .map(([fragment, e]) => ({
    fragment,
    occurrences: e.n,
    examples: [...e.examples],
    refused: REFUSED[fragment] ?? null,
    suggestedSlug: REFUSED[fragment] ? null : suggestSlug(fragment),
  }));

const missing = [...eaten.entries()]
  .filter(([slug]) => (bySlug.get(slug)?.variants ?? 0) === 0)
  .sort((a, b) => b[1].n - a[1].n)
  .map(([slug, e]) => {
    const d = bySlug.get(slug);
    return {
      slug, name: d.name, occurrences: e.n, examples: [...e.examples],
      // The file `npm run ingest` will accept. Anything else is rejected —
      // a filename that can mint a slug is a catalogue that grows by typo.
      file: `inbox/${slug}.png`,
      canonicalSize: CANONICAL_SIZE,
      prompt: promptFor(style, dishText(d, portions)),
    };
  });

const brief = {
  generatedAt: new Date().toISOString(),
  source: has('--prod') ? `production health_db via ssh ${VPS}` : dbUrl(argv),
  window: { since, days, mealsRead: all.length, mealsAnalysed: meals.length, includesPlanned: wantPlanned },
  // Carried WITH the data so whatever consumes this cannot apply a different
  // policy than the catalogue documents. src/dishes.ts is the long form.
  rules: {
    alias: 'An alias is an EXACT string a person might type for THIS dish. Never a category, never a near-miss. A spelling nobody wrote down must fail to NOTHING — recoverable — rather than to a confidently wrong dish.',
    brand: 'Generic dish names only. No brands, no restaurant names, no packaged products: trade dress is the real exposure in a generated image corpus. Marie Gold, Domino’s, Winkies, Whole Truth are all refused.',
    category: 'A category is not a dish. Bare "salad" or "curry" resolves to nothing on purpose. The single exception is "sabzi", and only because Health’s own curated Food table contains it as a canonical row.',
    slug: 'A slug is PERMANENT — it is the URL. Renaming one breaks every link. suggestedSlug here is a starting point for human judgement, never an instruction.',
    aliasOntoExisting: 'Prefer an alias on an EXISTING dish over a new slug whenever the food is the same thing (e.g. "cup of tea" → tea). A new slug obliges a new photograph.',
  },
  candidates,
  missing,
};

const out = join(ROOT, 'corpus', 'brief.json');
writeFileSync(out, JSON.stringify(brief, null, 2) + '\n');

if (JSON_ONLY) { console.log(JSON.stringify(brief, null, 2)); process.exit(0); }

say(`\nFoodsum brief — ${brief.source}`);
say(`  ${meals.length} ${wantPlanned ? 'meals' : 'LOGGED meals'} since ${since} (of ${all.length} rows read)\n`);
say(`── ${missing.length} catalogue dish(es) eaten with NO image ${'─'.repeat(28)}`);
for (const m of missing) say(`   ${String(m.occurrences).padStart(2)}x  ${m.slug}  -> ${m.file}`);
if (!missing.length) say('   (none — every dish that resolved already has a photograph)');
say(`\n── ${candidates.filter((c) => !c.refused).length} fragment(s) NO DISH CLAIMS ${'─'.repeat(30)}`);
say('   Each needs a judgement: new dish, alias onto an existing one, or refuse.');
for (const c of candidates.filter((x) => !x.refused))
  say(`   ${String(c.occurrences).padStart(2)}x  ${JSON.stringify(c.fragment).padEnd(40)} suggest: ${c.suggestedSlug}`);
const ref = candidates.filter((c) => c.refused);
if (ref.length) {
  say(`\n── ${ref.length} already REFUSED on purpose (do not "fix" these) ${'─'.repeat(10)}`);
  for (const c of ref) say(`   ${String(c.occurrences).padStart(2)}x  ${c.fragment}`);
}
say(`\nwrote corpus/brief.json`);
