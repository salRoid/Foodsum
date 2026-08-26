// Where the food data actually comes from — resolved in ONE place.
//
// Foodsum's catalogue is a source file (`src/dishes.ts`), but two facts it
// needs are Health's, not ours: the PORTION for a dish (Health's curated
// `Food` table) and the DEMAND for one (what has really been eaten, the `Meal`
// table). Both were previously reached through a connection string hardcoded
// in two different scripts, which is two definitions of "the server" waiting
// to disagree.
//
// Resolution order, first hit wins:
//   1. --url <postgres url>            explicit, always wins
//   2. $FOODSUM_DB_URL                 for CI / an ssh tunnel
//   3. Health's own .env DATABASE_URL  the app's answer, not a guess
//   4. postgresql://<user>@localhost/health_db_local
//
// ── OR A DUMP FILE, WHICH IS THE PRODUCTION ROUTE ──
// `--dump [file]` (default `data/health-dump.json`) reads a snapshot taken from
// the DROPLET by `Health/foodsum-dump.sh` instead of talking to any database.
// That is how the queue gets computed against what EVERY user has really eaten:
// hosted Postgres is unreachable from a laptop, and `health_db_local` is one
// developer's mirror of it, taken whenever `sync-db.sh` last ran.
//
// The dump carries the two result sets verbatim — `food` and `meals`, same rows
// and same order the two SELECTs below produce, duplicates intact — so every
// script downstream counts exactly what it would have counted live.
//
// THERE IS NO DIRECT LINE TO THE DROPLET, and that is not an omission. Hosted
// Health's Postgres is loopback-only on that machine (ARCHITECTURE.md §5), so
// the sanctioned path to production data is `Lumen/sync-db.sh sync Health`,
// which mirrors it into `health_db_local` — after which (4) IS the server's
// data. Point `--url` at a tunnel if you genuinely need it live.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './style.mjs';

const HEALTH_ENV = join(ROOT, '..', 'Health', '.env');

function fromHealthEnv() {
  try {
    const line = readFileSync(HEALTH_ENV, 'utf8')
      .split('\n')
      .filter((l) => /^\s*(export\s+)?DATABASE_URL\s*=/.test(l))
      .pop();
    if (!line) return null;
    const raw = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    // A `file:` URL is Health's retired SQLite fallback — not a Postgres URL,
    // and psql would fail on it with a message about nothing in particular.
    return raw.startsWith('postgres') ? raw : null;
  } catch {
    return null;
  }
}

export const DEFAULT_DUMP = join(ROOT, 'data', 'health-dump.json');

/**
 * A dump is addressed as `dump:<path>` so it travels through the same single
 * `url` value every script already prints in its header and passes to `query`.
 * One code path, and the header still says where the numbers came from — which
 * matters more here than anywhere, because a stale dump and a live database
 * produce reports that look identical.
 */
export function dbUrl(argv = process.argv.slice(2)) {
  const d = argv.indexOf('--dump');
  if (d >= 0) {
    const next = argv[d + 1];
    return `dump:${next && !next.startsWith('--') ? next : DEFAULT_DUMP}`;
  }
  if (process.env.FOODSUM_DUMP) return `dump:${process.env.FOODSUM_DUMP}`;
  const i = argv.indexOf('--url');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (process.env.FOODSUM_DB_URL) return process.env.FOODSUM_DB_URL;
  return fromHealthEnv() ?? `postgresql://${process.env.USER}@localhost/health_db_local`;
}

/**
 * The dump answers the two queries Foodsum actually asks, and REFUSES anything
 * else rather than returning an empty result set. A snapshot that silently
 * answers "no rows" to a query it does not hold is a report that under-counts
 * without ever looking wrong — the one failure mode this whole repo is built to
 * avoid, applied to its own inputs.
 */
function fromDump(path, sql) {
  let dump;
  try {
    dump = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(
      `foodsum: could not read the dump at ${path}\n  ${err.message}\n` +
        '  Take one with `cd ../Health && ./foodsum-dump.sh` (it reads the droplet).',
    );
  }
  const rows = /FROM "Food"/.test(sql) ? dump.food : /FROM "Meal"/.test(sql) ? dump.meals : null;
  if (!rows) throw new Error(`foodsum: the dump does not answer this query:\n  ${sql.trim()}`);
  return rows.filter((l) => String(l).trim());
}

/** One column, one row per line, blanks dropped. Throws with the URL named. */
export function query(url, sql) {
  if (url.startsWith('dump:')) return fromDump(url.slice(5), sql);
  try {
    return execFileSync('psql', [url, '-At', '-c', sql], { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .split('\n')
      .filter((l) => l.trim());
  } catch (err) {
    const why = (err.stderr?.toString() || err.message).trim().split('\n')[0];
    throw new Error(
      `foodsum: could not read ${url}\n  ${why}\n` +
        '  If the database is missing, run `cd Lumen && ./sync-db.sh sync Health` first.',
    );
  }
}

/** The two queries Foodsum asks, named once so a dump and a live read agree. */
export const FOOD_SQL = 'SELECT name FROM "Food" ORDER BY name;';
export const MEALS_SQL = 'SELECT name FROM "Meal" ORDER BY "date", "slot";';

/**
 * Is there a real source of rows behind this invocation?
 *
 * `--demand` used to mean "order by the 37-row test fixture", which is a
 * SNAPSHOT of one developer's data taken to pin a test's pass criterion — fine
 * as a fallback, wrong as the thing that decides what gets photographed next.
 * With `--db` or `--dump` present the queue is ordered by what every user has
 * actually logged, and the scripts say which of the two they used.
 */
export function isLive(argv = process.argv.slice(2)) {
  return argv.includes('--db') || argv.includes('--dump') || !!process.env.FOODSUM_DUMP;
}
