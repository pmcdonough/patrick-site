// Headless matchup lab: many games in parallel, reproducible, with confidence intervals.
//
//   node tools/lab.js                                   100 games at the build defaults, report vs league and reference
//   node tools/lab.js --nhl                             same at the NHL-average tick (every multiplier 1.0)
//   node tools/lab.js --games 50 --set BOS.fore=131     change a card for the run (several: comma separated)
//   node tools/lab.js --compare BOS.agg=0.9             run the cards as set, then with this change, same seeds
//   node tools/lab.js --sweep BOS.fore                  every option of one card, same seeds for each
//   node tools/lab.js --json out.json                   also write every game's numbers
//   node tools/lab.js --save                            make this run the reference in tools/baselines.json
//   node tools/lab.js --games 20 --order                also replay the seeds in one worker in reverse order: every game must match
//   node tools/lab.js --games 20 --pool                 also play the seeds in the page's own background workers (Test a strategy): every game must match
//   node tools/lab.js --param shotDecision.xgChoice.minXg=0.1   try a physics.json value without editing the file
//
// The report compares each club's per-game numbers with the league (MoneyPuck 2025-26 and the rules
// benchmarks in physics.json) and with the saved reference run for the same level, seeds and games.
// A seeded run reproduces exactly, so any difference from the reference means the engine changed.
// The reference also keeps a fingerprint of every game (a hash of its final numbers), so the report
// says "identical" only when every game finished exactly as before, not just the averages.
//
// The engine runs in Node (tools/engine.js), set up as a fresh visit to the page sets it up, in child processes
// (faster than worker threads here: eight threads in one process slow each other down by about half).
// --pool is the one part that needs a browser: it loads the page and plays the same seeds in its own workers.
//
// Cards: fore brk entry oz dz pp pk (the options the plan drawer offers) and agg (0 to 1), per club abbr.
// Each game g plays with Math.random seeded from (--seed + g), so a run is reproducible and two
// settings compared with --compare or --sweep face the same random stream game for game. The
// game diverges as soon as the change matters, so the pairing helps a little; the intervals
// below are what to trust.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const isChild = process.argv[2] === '--child';

const { writeBaselines } = require('./serve');
const { load, CARDS: CARD_IDS } = require('./engine');
const DATA = path.join(__dirname, '..', 'public', 'bruins-vs-canadiens', 'data');
const BASELINE_FILE = path.join(__dirname, 'baselines.json');
const BASELINES = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};

function args() {
  const a = process.argv.slice(2), o = { games: 100, seed: 1, workers: Math.max(1, Math.min(8, os.cpus().length - 2)), nhl: false, set: '', compare: '', sweep: '', json: '', save: false, param: '', order: false, pool: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k === 'nhl' || k === 'save' || k === 'order' || k === 'pool') o[k] = true;
    else if (k in o) o[k] = typeof o[k] === 'number' ? +a[++i] : a[++i];
    else { console.error(`unknown option ${a[i]}`); process.exit(2); }
  }
  return o;
}
const parseSet = s => (s ? s.split(',') : []).map(x => { const [k, v] = x.split('='); const [club, card] = k.split('.'); if (!CARD_IDS[card]) throw new Error(`unknown card ${card}`); return { club, card, v }; });

// ---------- worker processes: each builds the sim and plays its share of the seeds ----------
if (isChild) {
  const ready = load();
  process.on('message', async ({ id, seeds, nhl, set, params }) => {
    try {
      const E = await ready;
      const sim = E.create({ nhl, params });
      for (const { club, card, v } of set) E.setCard(sim, club, card, v);
      const rows = seeds.map(seed => E.play(sim, seed));
      process.send({ id, rows, tac: sim.teams.map(t => ({ abbr: t.abbr, ...t.tac })), cfg: { ...sim.cfg } });
    } catch (e) { process.send({ id, error: e.stack || String(e) }); }
  });
}

function makePool(n) {
  const workers = Array.from({ length: n }, () => fork(__filename, ['--child'], { serialization: 'advanced' }));
  let next = 0; const waiting = new Map();
  for (const w of workers) w.on('message', m => { const r = waiting.get(m.id); waiting.delete(m.id); m.error ? r.reject(new Error(m.error)) : r.resolve(m); });
  const ask = (w, msg) => new Promise((resolve, reject) => { const id = next++; waiting.set(id, { resolve, reject }); w.send({ ...msg, id }); });
  return { workers, ask, close: () => workers.forEach(w => w.kill()) };
}

// Plays seeds first..first+n-1 across the workers (each worker in reverse order with `reverse`).
async function run(pool, o, set, reverse, nWorkers = pool.workers.length) {
  const seeds = Array.from({ length: o.games }, (_, i) => o.seed + i);
  const ws = pool.workers.slice(0, nWorkers);
  const chunks = ws.map((_, w) => seeds.filter((_, i) => i % ws.length === w)).map(c => reverse ? c.reverse() : c);
  const parts = await Promise.all(ws.map((w, k) => chunks[k].length ? pool.ask(w, { seeds: chunks[k], nhl: o.nhl, set, params: o.params }) : null));
  const done = parts.filter(Boolean);
  const rows = done.flatMap(p => p.rows).sort((a, b) => a.seed - b.seed);
  return { rows, tac: done[0].tac, cfg: done[0].cfg };
}

// The page's own background workers (Test a strategy) play the same seeds; compare what they report for each game.
async function poolCheck(A) {
  const { chromium } = require('playwright');
  const { serve } = require('./serve');
  const { openPage } = require('./harness');
  const srv = await serve(), browser = await chromium.launch();
  try {
    const { page, errors } = await openPage(browser, srv);
    const jobs = A.rows.map(r => ({ id: r.seed, seed: r.seed, tacs: A.tac.map(({ abbr, ...t }) => t), cfg: A.cfg }));
    // then the first three again on the slow path the page falls back to when it cannot start workers
    const res = await page.evaluate(async jobs => {
      const r = window.rinkSim, pack = (rows, js) => js.map(j => { const x = rows.get(j.id); return { end: x.end, teams: x.teams.map(t => [t.goals, +t.xg.toFixed(9), t.sog]) }; });
      const rows = pack(await r.runJobs(jobs, () => {}), jobs), usedWorkers = !r.TEST.poolFailed;
      r.TEST.poolFailed = true; const slow = jobs.slice(0, 3); const inPage = pack(await r.runJobs(slow, () => {}), slow); r.TEST.poolFailed = false;
      return { usedWorkers, rows, inPage };
    }, jobs);
    const key = r => JSON.stringify({ end: r.end, teams: r.teams.map(t => [t.goals, +t.xg.toFixed(9), t.sog]) });
    const differ = [...A.rows.filter((r, n) => key(r) !== JSON.stringify(res.rows[n])).map(r => r.seed),
      ...res.inPage.filter((x, n) => key(A.rows[n]) !== JSON.stringify(x)).map((x, n) => `${A.rows[n].seed} on the page`)];
    return { errors, ok: res.usedWorkers && !differ.length && !errors.length,
      text: errors.length ? `POOL CHECK FAILED: page errors ${JSON.stringify(errors)}\n` : !res.usedWorkers ? 'POOL CHECK FAILED: the page could not start its workers and fell back to playing on the page.\n'
        : differ.length ? `POOL CHECK FAILED: ${differ.length} of ${A.rows.length} games played differently in the page's workers (seeds ${differ.join(', ')}).\n`
        : `Pool check: all ${A.rows.length} games are identical in the page's background workers, and the first 3 on its fallback path.\n` };
  } finally { await browser.close(); await srv.close(); }
}

// One game's fingerprint: a short hash of everything the row records. Expected goals are rounded to
// nine decimals so the hash depends on the game, not on how the sum was printed.
const fingerprint = row => crypto.createHash('sha1').update(JSON.stringify(row, (k, v) => typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(9) : v)).digest('hex').slice(0, 10);

// ---------- statistics ----------
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ci = a => 1.96 * sd(a) / Math.sqrt(a.length);
const wilson = (w, n) => { const z = 1.96, p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; };
const pc = v => (100 * v).toFixed(0) + '%';
const f2 = v => v.toFixed(2);

// Per game numbers for team i: own and against, and unblocked attempts (attempts minus the opponent's blocks).
function perTeam(rows, i) {
  const j = 1 - i, g = k => rows.map(r => r.teams[i][k]), a = k => rows.map(r => r.teams[j][k]);
  const win = rows.map(r => r.teams[i].goals > r.teams[j].goals ? 1 : 0);
  const otl = rows.map((r, n) => !win[n] && r.end !== 'REG' ? 1 : 0);
  return {
    abbr: rows[0].teams[i].abbr, n: rows.length, win, otl,
    pts: rows.map((_, n) => win[n] ? 2 : otl[n] ? 1 : 0),
    gf: g('goals'), ga: a('goals'), xgf: g('xg'), xga: a('xg'), sog: g('sog'), soga: a('sog'),
    unblocked: rows.map(r => r.teams[i].attempts - r.teams[j].blocksMade),
    gd: rows.map(r => r.teams[i].goals - r.teams[j].goals), xgd: rows.map(r => r.teams[i].xg - r.teams[j].xg),
    xgShare: rows.map(r => r.teams[i].xg / Math.max(0.01, r.teams[i].xg + r.teams[j].xg)),
    low: g('low'), medium: g('medium'), high: g('high'), pim: g('pim'), offsides: g('offsides'), icings: g('icings'), takeaways: g('takeaways'),
  };
}

function matchupTable(rows) {
  const T = [0, 1].map(i => perTeam(rows, i));
  const ot = rows.filter(r => r.end !== 'REG').length;
  const lines = [`${rows.length} games, ${ot} past regulation (${rows.filter(r => r.end === 'SO').length} shootouts)`, '',
    'Club | W-L-OTL | Win% (95%) | Pts% | GF | GA | xGF | xGA | xG share (95%)',
    '--- | --- | --- | --- | --- | --- | --- | --- | ---'];
  for (const t of T) {
    const w = t.win.reduce((s, v) => s + v, 0), l = t.n - w - t.otl.reduce((s, v) => s + v, 0), [lo, hi] = wilson(w, t.n);
    lines.push(`${t.abbr} | ${w}-${l}-${t.n - w - l} | ${pc(w / t.n)} (${pc(lo)}-${pc(hi)}) | ${pc(mean(t.pts) / 2)} | ${f2(mean(t.gf))} | ${f2(mean(t.ga))} | ${f2(mean(t.xgf))} | ${f2(mean(t.xga))} | ${pc(mean(t.xgShare))} (±${(100 * ci(t.xgShare)).toFixed(0)})`);
  }
  return { T, text: lines.join('\n') };
}

// The numbers the report checks, per team per game, and where the league value comes from.
const METRICS = [['gf', 'Goals'], ['xgf', 'Expected goals'], ['sog', 'Shots on goal'], ['unblocked', 'Unblocked attempts'],
  ['low', 'Low-danger'], ['medium', 'Medium-danger'], ['high', 'High-danger'], ['offsides', 'Offsides'], ['icings', 'Icings']];
function league() {
  const L = JSON.parse(fs.readFileSync(path.join(DATA, 'moneypuck-2025.json'), 'utf8')).league.perGame;
  const R = JSON.parse(fs.readFileSync(path.join(DATA, 'physics.json'), 'utf8')).rulesBenchmarks;
  return { gf: L.goals, xgf: L.xGoals, sog: L.shotsOnGoal, unblocked: L.shotAttempts - L.blocked, low: L.lowDangerShots, medium: L.mediumDangerShots, high: L.highDangerShots, offsides: R.offsidesPerTeamGame, icings: R.icingsPerTeamGame };
}
const summary = T => Object.fromEntries(T.map(t => [t.abbr, Object.fromEntries(METRICS.map(([k]) => [k, [+mean(t[k]).toFixed(3), +ci(t[k]).toFixed(3)]]))]));

// Each metric per club: the league value, the saved reference run, and this run with its interval.
// "changed" means this run differs from the reference by more than the two intervals together;
// "vs league" is how far this run's mean sits from the league, as a share of the league value.
function baselineTable(T, level, o) {
  const L = league(), ref = BASELINES[level], same = ref && ref.games === o.games && ref.seed === o.seed;
  const lines = [`Report (${level === 'nhl' ? 'NHL-average multipliers' : 'build defaults'}, per team per game). Reference: ${ref ? `${ref.games} games from seed ${ref.seed}, saved ${ref.saved}${same ? '' : ' (different games or seeds, so expect noise)'}` : 'none saved, run with --save'}`, ''];
  lines.push('Metric | League | ' + T.map(t => `${t.abbr} now | ${t.abbr} ref | ${t.abbr} vs league`).join(' | '));
  lines.push('--- | --- | ' + T.map(() => '--- | --- | ---').join(' | '));
  let changed = 0;
  const prints = same && ref.fingerprints, differ = prints ? o.rows.filter((r, n) => fingerprint(r) !== prints[n]).map(r => r.seed) : [];
  for (const [k, label] of METRICS) {
    const cells = T.map(t => {
      const m = mean(t[k]), e = ci(t[k]), r = ref && ref.perTeam[t.abbr] && ref.perTeam[t.abbr][k];
      const moved = r && Math.abs(m - r[0]) > (same ? 0.001 : e + r[1]); // the reference keeps three decimals
      if (moved) changed++;
      return `${f2(m)} ±${f2(e)} | ${r ? f2(r[0]) + (moved ? ' changed' : '') : '-'} | ${(m >= L[k] ? '+' : '') + (100 * (m - L[k]) / L[k]).toFixed(0)}%`;
    });
    lines.push(`${label} | ${f2(L[k])} | ${cells.join(' | ')}`);
  }
  const games = differ.length ? ` ${differ.length} of ${o.rows.length} games finished differently (seeds ${differ.slice(0, 8).join(', ')}${differ.length > 8 ? ', ...' : ''}).` : '';
  lines.push('', !ref ? '' : changed || differ.length ? `${changed} cell(s) changed from the reference.${games} If the engine change was intended, re-run with --save.`
    : same && prints ? `Identical to the reference: all ${prints.length} games finished exactly as before.`
    : same ? 'Identical to the reference in every average. It has no game fingerprints yet; re-save it with --save to add them.' : 'No cell moved beyond its interval.');
  return lines.join('\n');
}

// Difference B minus A for one club, paired by seed.
function diffLine(label, A, B, i) {
  const a = perTeam(A, i), b = perTeam(B, i);
  const d = k => b[k].map((v, n) => v - a[k][n]);
  const cell = k => { const x = d(k), m = mean(x), e = ci(x), sig = Math.abs(m) > e ? ' *' : ''; return `${m >= 0 ? '+' : ''}${f2(m)} ±${f2(e)}${sig}`; };
  const pts = d('pts').map(v => v / 2), m = mean(pts), e = ci(pts);
  return `${label} | ${m >= 0 ? '+' : ''}${(100 * m).toFixed(0)}% ±${(100 * e).toFixed(0)}${Math.abs(m) > e ? ' *' : ''} | ${cell('gd')} | ${cell('xgd')} | ${cell('gf')} | ${cell('ga')} | ${cell('xgf')} | ${cell('xga')}`;
}
const diffHead = (abbr, what) => [`${abbr}: ${what} (paired by seed, 95% interval, * = interval excludes zero)`, '', 'Setting | Pts% | Goal diff | xG diff | GF | GA | xGF | xGA', '--- | --- | --- | --- | --- | --- | --- | ---'];

const cardLine = tac => tac.map(t => `${t.abbr} ${t.fore}/${t.brk}/${t.entry}/${t.oz}/${t.dz}/${t.pp}/${t.pk} agg ${(+t.agg).toFixed(2)}`).join('   ');

if (!isChild) (async () => {
  const o = args();
  const base = parseSet(o.set);
  o.params = (o.param ? o.param.split(',') : []).map(x => { const [key, v] = x.split('='); return { key, v }; });
  if (o.params.length) console.log(`Physics overrides: ${o.param}`);
  const pool = makePool(o.workers);
  const errors = [];
  const t0 = Date.now();
  const level = o.nhl ? 'nhl' : 'defaults';
  const out = { options: o, runs: [] };
  try {
    const A = await run(pool, o, base);
    out.runs.push({ label: 'as set', ...A });
    console.log(`Cards: ${cardLine(A.tac)}`);
    console.log(`Multipliers: ${Object.entries(A.cfg).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
    const { T, text } = matchupTable(A.rows);
    console.log(text + '\n');
    if (!o.compare && !o.sweep) console.log(baselineTable(T, level, { ...o, rows: A.rows }) + '\n');
    if (o.order) {
      const R = await run(pool, o, base, true, 1);
      const differ = A.rows.filter((r, n) => fingerprint(r) !== fingerprint(R.rows[n])).map(r => r.seed);
      console.log(differ.length ? `ORDER CHECK FAILED: ${differ.length} of ${A.rows.length} games changed when played in reverse order in one worker (seeds ${differ.join(', ')}). State is leaking from one game to the next.\n`
        : `Order check: all ${A.rows.length} games are identical played in reverse order in one worker.\n`);
      if (differ.length) process.exitCode = 1;
    }
    if (o.pool) {
      const P = await poolCheck(A);
      console.log(P.text); errors.push(...P.errors);
      if (!P.ok) process.exitCode = 1;
    }
    if (o.save) {
      if (o.set || o.compare || o.sweep || o.param) throw new Error('--save takes the build as it is; drop --set, --compare, --sweep and --param');
      BASELINES[level] = { games: o.games, seed: o.seed, saved: new Date().toISOString().slice(0, 10), cards: A.tac, cfg: A.cfg, perTeam: summary(T), fingerprints: A.rows.map(fingerprint) };
      writeBaselines(BASELINE_FILE, BASELINES);
      console.log(`Saved the ${level} reference to tools/baselines.json.\n`);
    }
    if (o.compare) {
      const change = parseSet(o.compare);
      const B = await run(pool, o, [...base, ...change]);
      out.runs.push({ label: o.compare, ...B });
      console.log(`With ${o.compare}:\n\n${matchupTable(B.rows).text}\n`);
      for (const i of [0, 1]) console.log([...diffHead(A.rows[0].teams[i].abbr, `${o.compare} minus as set`), diffLine(o.compare, A.rows, B.rows, i)].join('\n') + '\n');
    }
    if (o.sweep) {
      const [club, card] = o.sweep.split('.');
      if (!CARD_IDS[card]) throw new Error(`unknown card ${card}`);
      const opts = (await load()).options(club, card);
      const i = A.tac.findIndex(t => t.abbr === club);
      const ref = String(A.tac[i][card]);
      const res = [];
      for (const v of opts) {
        const R = String(v) === ref || (card === 'agg' && +v === +ref) ? A : await run(pool, o, [...base, { club, card, v }]);
        out.runs.push({ label: `${club}.${card}=${v}`, ...R });
        res.push([v, R]);
      }
      console.log([...diffHead(club, `each ${card} option minus the current one (${ref})`), ...res.map(([v, R]) => diffLine(`${v}${String(v) === ref ? ' (current)' : ''}`, A.rows, R.rows, i))].join('\n') + '\n');
      console.log(['Absolute, per game:', '', `${card} | Pts% | GF | GA | xGF | xGA | xG share`, '--- | --- | --- | --- | --- | --- | ---',
        ...res.map(([v, R]) => { const t = perTeam(R.rows, i); return `${v} | ${pc(mean(t.pts) / 2)} | ${f2(mean(t.gf))} | ${f2(mean(t.ga))} | ${f2(mean(t.xgf))} | ${f2(mean(t.xga))} | ${pc(mean(t.xgShare))} ±${(100 * ci(t.xgShare)).toFixed(0)}`; })].join('\n') + '\n');
    }
  } catch (e) { errors.push(e.message); throw e; } finally {
    console.log(`${out.runs.reduce((s, r) => s + r.rows.length, 0)} games in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${o.workers} workers. ERRORS: ${JSON.stringify(errors)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(out));
    await pool.close();
    if (errors.length) process.exitCode = 1;
  }
})();
