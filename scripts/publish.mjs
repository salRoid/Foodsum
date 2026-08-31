// ONE COMMAND: ingest what is in inbox/, verify, commit, tag, push, point the
// server at the new tag, rebuild Health, prove it shipped.
//
//   npm run publish            do it
//   npm run publish -- --dry   print every step, run nothing that changes state
//
// This is the second half of the loop Sal asked for on 2026-08-31 — "I run one
// command, codex generates, I review, one command updates the tag on the
// server". The first half is `npm run brief -- --prod` (what to generate) and
// Codex writing into inbox/. The review is yours: LOOK at inbox/ before this.
//
// Why the tag matters: hosted Health reads images from jsDelivr at
// NEXT_PUBLIC_FOODSUM_BASE=…/Foodsum@vN/corpus/images, and NEXT_PUBLIC_* is
// INLINED AT BUILD TIME. So a new tag only reaches users when the env is bumped
// AND Health is rebuilt — an .env edit alone changes nothing. A branch ref was
// rejected on 2026-08-25 because jsDelivr caches @main for hours.
//
// Every step is a hard stop on failure, and the order is chosen so nothing is
// published half-way: ingest+check+test BEFORE any git write, push BEFORE the
// server is repointed, jsDelivr serving the tag BEFORE Health is rebuilt.

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, INBOX } from './lib/style.mjs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const VPS = 'root@200.234.42.67';
const LUMEN = join(ROOT, '..');
const say = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const run = (cmd, args, opts = {}) => {
  console.log(`   $ ${cmd} ${args.join(' ')}`);
  if (DRY && !opts.readOnly) return '';
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit', env: { ...process.env, ...(opts.env ?? {}) } });
  if (r.status !== 0) { console.error(`✗ ${cmd} ${args[0]} failed (exit ${r.status})`); process.exit(1); }
  return r.stdout ?? '';
};
const ssh = (script, opts = {}) => run('ssh', ['-o', 'ServerAliveInterval=15', VPS, script], opts);

// ── 0. what is waiting ──────────────────────────────────────────────────────
const inbox = existsSync(INBOX) ? readdirSync(INBOX).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
say(`① inbox/ holds ${inbox.length} image(s)${inbox.length ? ': ' + inbox.join(', ') : ''}`);
if (inbox.length === 0) {
  const dirty = execFileSync('git', ['status', '--porcelain', 'corpus/images'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!dirty) {
    console.log('   Nothing to publish: inbox is empty and corpus/images is unchanged.');
    if (!DRY) process.exit(0);
    console.log('   (dry) continuing anyway so you can see the plan');
  }
  console.log('   inbox empty but corpus/images has uncommitted changes — publishing those.');
}

// ── 1. ingest → check → test, before ANY git write ─────────────────────────
if (inbox.length) { say('② Ingesting (crop, resize, budget, strip, index) — a rejected file stops here'); run('npm', ['run', 'ingest']); }
say('③ Verifying the corpus');
run('npm', ['run', 'check']);
run('npm', ['test']);

// ── 2. tag = max existing vN + 1 ────────────────────────────────────────────
const tags = execFileSync('git', ['tag'], { cwd: ROOT, encoding: 'utf8' }).split('\n').map((t) => /^v(\d+)$/.exec(t)?.[1]).filter(Boolean).map(Number);
const next = `v${(tags.length ? Math.max(...tags) : 0) + 1}`;
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
say(`④ Committing corpus and tagging ${next} (branch ${branch})`);
run('git', ['add', '-A']);
// Nothing sensitive can be here — Foodsum has no .env, no database, no user
// data; inbox/ and inbox/done are gitignored. Still, refuse if something looks
// wrong rather than trusting that.
const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' });
if (/(^|\/)\.env|secret|\.pem$|\.key$/im.test(staged)) { console.error('✗ refusing: a secret-shaped path is staged:\n' + staged); process.exit(1); }
// A tag can be worth cutting with NOTHING to commit — images ingested and
// committed earlier in the day are exactly that case, and `git commit` with an
// empty index exits non-zero, which used to abort the whole publish one step
// before the tag. Commit only when something is actually staged.
const pending = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).trim();
if (pending) {
  run('git', ['commit', '-q', '-m', `corpus ${next}: ${inbox.length ? inbox.length + ' new image(s) — ' + inbox.map((f) => f.replace(/\.[^.]+$/, '')).join(', ') : 'corpus update'}`]);
} else {
  console.log('   (nothing staged — tagging the commit already on this branch)');
}
run('git', ['tag', next]);
run('git', ['push', '-q', 'origin', branch]);
run('git', ['push', '-q', 'origin', next]);

// ── 3. jsDelivr must serve the tag before the server is pointed at it ──────
const base = `https://cdn.jsdelivr.net/gh/salRoid/Foodsum@${next}/corpus/images`;
say(`⑤ Waiting for jsDelivr to serve ${next}`);
if (!DRY) {
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    const code = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '20', `${base}/../index.json`], { encoding: 'utf8' });
    ok = code === '200'; if (!ok) { console.log(`   ${code}, retrying…`); execFileSync('sleep', ['10']); }
  }
  if (!ok) { console.error(`✗ jsDelivr is not serving ${next} yet — the tag is pushed; re-run later to finish.`); process.exit(1); }
  console.log('   200 ✓');
} else console.log(`   (dry) would poll ${base}/../index.json`);

// ── 4. repoint Health on the VPS, in BOTH env files, then rebuild ──────────
say(`⑥ Pointing hosted Health at ${next}`);
ssh(`set -e; for f in /opt/health/.env /opt/health/.env.docker; do
  sed -i -E 's#(NEXT_PUBLIC_FOODSUM_BASE=\\"?)https://cdn.jsdelivr.net/gh/salRoid/Foodsum@v[0-9]+#\\1https://cdn.jsdelivr.net/gh/salRoid/Foodsum@${next}#' "$f"; grep -H NEXT_PUBLIC_FOODSUM_BASE "$f"; done`);
say('⑦ Rebuilding Health so the inlined base moves (this is the slow step)');
run('bash', ['./deploy-vps.sh', 'Health', '--no-push'], { cwd: LUMEN });

// ── 5. prove it: the served bundle names the new tag ────────────────────────
say('⑧ Proving the tag reached the browser');
if (!DRY) {
  const html = execFileSync('curl', ['-s', '-m', '20', `https://health.salroid.me/?cb=${Date.now()}`], { encoding: 'utf8' });
  const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[^"]+\.js/g) ?? [])].slice(0, 25);
  const hit = chunks.some((c) => execFileSync('curl', ['-s', '-m', '20', `https://health.salroid.me${c}`], { encoding: 'utf8' }).includes(`Foodsum@${next}`));
  if (!hit) { console.error(`✗ no served chunk mentions Foodsum@${next} — the rebuild did not inline the new base. Do NOT trust the 200.`); process.exit(1); }
  console.log(`   a served chunk carries Foodsum@${next} ✓`);
}
console.log(`\n✅ Foodsum ${next} is live: ${base}`);
