# `data/` — snapshots of Health, never committed

**Everything in here except this file is gitignored, and must stay that way.**
A dump is real meal logs for real accounts. Nothing generated *from* it is
personal — a slug, a portion and a prompt are not — but the dump itself is.

## Where it comes from

```bash
cd ../Health && ./foodsum-dump.sh        # → data/health-dump.json
```

Hosted Health's Postgres is loopback-only on the droplet
(`Lumen/ARCHITECTURE.md` §5), so there is no line from a laptop to it. That
script runs `psql` **on** the droplet over ssh and brings back one JSON object.

## Why a dump rather than `health_db_local`

`health_db_local` is one developer's mirror, refreshed whenever `sync-db.sh`
last ran. The queue it produces is that person's eating habits. **An image is
generated once and served to everyone**, so what gets photographed next should
be decided by every row every user has logged — which is what the dump carries,
and what `--dump` makes the scripts count.

## What it holds

| key | |
|---|---|
| `food` | `SELECT name FROM "Food" ORDER BY name` — verbatim, for portions |
| `meals` | `SELECT name FROM "Meal" ORDER BY date, slot` — verbatim, **duplicates intact** |
| `mealDemand` | each distinct string with `times` logged and `users` who logged it |
| `summary` | row counts and the number of distinct users |
| `generatedAt` | when the snapshot was taken |

`food` and `meals` are the exact result sets the scripts would have got live,
in the same order, because `scripts/lib/db.mjs` serves them in place of psql.
**Duplicates are the point** — demand is measured by how often a string
repeats, so de-duplicating would silently flatten every frequency reported.

## Using it

```bash
npm run pull    -- --dump      # what resolves, what misses, what to add
npm run missing -- --dump      # the generation queue + the exact prompts
npm run export  -- --dump      # the same queue as JSON, for a batch
```

A dump that does not answer a query **throws** rather than returning no rows.
A snapshot that quietly answers "nothing" under-counts without ever looking
wrong, which is this repo's one prohibited failure mode pointed at its own
inputs.

## It goes stale

Nothing here notices. Take a fresh one before a generation run; `generatedAt`
is printed by every script that reads it.
