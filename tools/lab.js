// Headless matchup lab: many games in parallel, reproducible, with confidence intervals.
//
//   node tools/lab.js                                   100 games at the build defaults, report vs league and reference
//   node tools/lab.js --nhl                             same at the NHL-average tick (every multiplier 1.0)
//   node tools/lab.js --games 50 --set BOS.fore=131     change a card for the run (several: comma separated)
//   node tools/lab.js --compare BOS.agg=0.9             run the cards as set, then with this change, same seeds
//   node tools/lab.js --sweep BOS.fore                  every option of one card, same seeds for each
//   node tools/lab.js --json out.json                   also write every game's numbers
//   node tools/lab.js --save                            make this run the reference in tools/baselines.json
//   node tools/lab.js --param shotDecision.xgChoice.minXg=0.1   try a physics.json value without editing the file
//
// The report compares each club's per-game numbers with the league (MoneyPuck 2025-26 and the rules
// benchmarks in physics.json) and with the saved reference run for the same level, seeds and games.
// A seeded run reproduces exactly, so any difference from the reference means the engine changed.
//
// Cards: fore brk entry oz dz pp pk (option values as in systems.json) and agg (0 to 1), per club abbr.
// Each game g plays with Math.random seeded from (--seed + g), so a run is reproducible and two
// settings compared with --compare or --sweep face the same random stream game for game. The
// game diverges as soon as the change matters, so the pairing helps a little; the intervals
// below are what to trust.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PAGE = path.join(__dirname, '..', 'public', 'bruins-vs-canadiens', 'index.html');
const DATA = path.join(__dirname, '..', 'public', 'bruins-vs-canadiens', 'data');
const BASELINE_FILE = path.join(__dirname, 'baselines.json');
const BASELINES = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
const CARD_IDS = { fore: 'Fore', brk: 'Break', entry: 'Entry', oz: 'Oz', dz: 'Dz', pp: 'PP', pk: 'PK', agg: 'Agg' };

function args() {
  const a = process.argv.slice(2), o = { games: 100, seed: 1, workers: Math.max(1, Math.min(8, os.cpus().length - 2)), nhl: false, set: '', compare: '', sweep: '', json: '', save: false, param: '' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k === 'nhl' || k === 'save') o[k] = true;
    else if (k in o) o[k] = typeof o[k] === 'number' ? +a[++i] : a[++i];
    else { console.error(`unknown option ${a[i]}`); process.exit(2); }
  }
  return o;
}
const parseSet = s => (s ? s.split(',') : []).map(x => { const [k, v] = x.split('='); const [club, card] = k.split('.'); if (!CARD_IDS[card]) throw new Error(`unknown card ${card}`); return { club, card, v }; });

// ---------- browser side ----------
async function openPage(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(fs.readFileSync(PAGE, 'utf8'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.click('#pause');
  await page.evaluate(() => { document.getElementById('log').prepend = () => {}; });
  return { page, errors };
}

// Applies multipliers and cards, then plays the given seeds and returns one row per game.
function playSeeds(page, seeds, nhl, set, param) {
  return page.evaluate(([seeds, nhl, set, CARD_IDS, param]) => {
    const r = window.rinkSim, $ = id => document.getElementById(id);
    for (const { key, v } of param) { const ks = key.split('.'), last = ks.pop(); let o = r.DATA.physics; for (const k of ks) { o = o[k]; if (!o) throw new Error(`no physics key ${key}`); } if (!(last in o)) throw new Error(`no physics key ${key}`); o[last] = typeof o[last] === 'number' ? +v : v; }
    const side = abbr => { const i = r.teams.findIndex(t => t.abbr === abbr); if (i < 0) throw new Error(`no club ${abbr}`); return i ? 'a' : 'h'; };
    if (nhl) for (const k of Object.keys(r.cfg)) r.cfg[k] = 1;
    for (const { club, card, v } of set) {
      const el = $(side(club) + CARD_IDS[card]);
      if (card === 'agg') el.value = Math.round(+v * 100);
      else { if (![...el.options].some(o => o.value === v)) throw new Error(`${club}.${card} has no option ${v}`); el.value = v; }
      el.dispatchEvent(new Event('input'));
    }
    const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rows = [];
    for (const s of seeds) {
      Math.random = mulberry(s * 2654435761);
      $('newgame').click(); let k = 0;
      while (!r.game.over && k++ < 300000) r.tick(0.03);
      rows.push({ seed: s, end: r.game.shootout ? 'SO' : r.game.overtime ? 'OT' : 'REG', teams: r.teams.map(t => ({
        abbr: t.abbr, goals: t.score, sog: t.shots, attempts: t.attempts, blocksMade: t.blocked, missed: t.missed, xg: t.xg,
        low: t.tier.low, medium: t.tier.medium, high: t.tier.high, pim: t.pim, offsides: t.offsides, icings: t.icings,
        takeaways: t.take, faceoffs: t.faceoffs, faceoffsWon: t.faceoffsWon, freezes: t.freezes })) });
    }
    const tac = r.teams.map(t => ({ abbr: t.abbr, ...t.tac }));
    return { rows, tac, cfg: { ...r.cfg } };
  }, [seeds, nhl, set, CARD_IDS, param]);
}

// Plays seeds first..first+n-1 across the worker pages.
async function run(pages, o, set) {
  const seeds = Array.from({ length: o.games }, (_, i) => o.seed + i);
  const chunks = pages.map((_, w) => seeds.filter((_, i) => i % pages.length === w));
  const parts = await Promise.all(pages.map((p, w) => chunks[w].length ? playSeeds(p.page, chunks[w], o.nhl, set, o.params) : null));
  const done = parts.filter(Boolean);
  const rows = done.flatMap(p => p.rows).sort((a, b) => a.seed - b.seed);
  return { rows, tac: done[0].tac, cfg: done[0].cfg };
}

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
  for (const [k, label] of METRICS) {
    const cells = T.map(t => {
      const m = mean(t[k]), e = ci(t[k]), r = ref && ref.perTeam[t.abbr] && ref.perTeam[t.abbr][k];
      const moved = r && Math.abs(m - r[0]) > (same ? 0.001 : e + r[1]); // the reference keeps three decimals
      if (moved) changed++;
      return `${f2(m)} ±${f2(e)} | ${r ? f2(r[0]) + (moved ? ' changed' : '') : '-'} | ${(m >= L[k] ? '+' : '') + (100 * (m - L[k]) / L[k]).toFixed(0)}%`;
    });
    lines.push(`${label} | ${f2(L[k])} | ${cells.join(' | ')}`);
  }
  lines.push('', !ref ? '' : changed ? `${changed} cell(s) changed from the reference. If the engine change was intended, re-run with --save.` : same ? 'Identical to the reference: the engine plays these games exactly as before.' : 'No cell moved beyond its interval.');
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

(async () => {
  const o = args();
  const base = parseSet(o.set);
  o.params = (o.param ? o.param.split(',') : []).map(x => { const [key, v] = x.split('='); return { key, v }; });
  if (o.params.length) console.log(`Physics overrides: ${o.param}`);
  const browsers = await Promise.all(Array.from({ length: o.workers }, () => chromium.launch()));
  const pages = await Promise.all(browsers.map(openPage));
  const t0 = Date.now();
  const level = o.nhl ? 'nhl' : 'defaults';
  const out = { options: o, runs: [] };
  try {
    const A = await run(pages, o, base);
    out.runs.push({ label: 'as set', ...A });
    console.log(`Cards: ${cardLine(A.tac)}`);
    console.log(`Multipliers: ${Object.entries(A.cfg).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
    const { T, text } = matchupTable(A.rows);
    console.log(text + '\n');
    if (!o.compare && !o.sweep) console.log(baselineTable(T, level, o) + '\n');
    if (o.save) {
      if (o.set || o.compare || o.sweep || o.param) throw new Error('--save takes the build as it is; drop --set, --compare, --sweep and --param');
      BASELINES[level] = { games: o.games, seed: o.seed, saved: new Date().toISOString().slice(0, 10), cards: A.tac, cfg: A.cfg, perTeam: summary(T) };
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(BASELINES, null, 1) + '\n');
      console.log(`Saved the ${level} reference to tools/baselines.json.\n`);
    }
    if (o.compare) {
      const change = parseSet(o.compare);
      const B = await run(pages, o, [...base, ...change]);
      out.runs.push({ label: o.compare, ...B });
      console.log(`With ${o.compare}:\n\n${matchupTable(B.rows).text}\n`);
      for (const i of [0, 1]) console.log([...diffHead(A.rows[0].teams[i].abbr, `${o.compare} minus as set`), diffLine(o.compare, A.rows, B.rows, i)].join('\n') + '\n');
    }
    if (o.sweep) {
      const [club, card] = o.sweep.split('.');
      const opts = await pages[0].page.evaluate(([id, card]) => card === 'agg' ? ['0', '0.25', '0.5', '0.75', '1'] : [...document.getElementById(id).options].map(x => x.value),
        [(A.tac[0].abbr === club ? 'h' : 'a') + CARD_IDS[card], card]);
      const i = A.tac.findIndex(t => t.abbr === club);
      const ref = String(A.tac[i][card]);
      const res = [];
      for (const v of opts) {
        const R = String(v) === ref || (card === 'agg' && +v === +ref) ? A : await run(pages, o, [...base, { club, card, v }]);
        out.runs.push({ label: `${club}.${card}=${v}`, ...R });
        res.push([v, R]);
      }
      console.log([...diffHead(club, `each ${card} option minus the current one (${ref})`), ...res.map(([v, R]) => diffLine(`${v}${String(v) === ref ? ' (current)' : ''}`, A.rows, R.rows, i))].join('\n') + '\n');
      console.log(['Absolute, per game:', '', `${card} | Pts% | GF | GA | xGF | xGA | xG share`, '--- | --- | --- | --- | --- | --- | ---',
        ...res.map(([v, R]) => { const t = perTeam(R.rows, i); return `${v} | ${pc(mean(t.pts) / 2)} | ${f2(mean(t.gf))} | ${f2(mean(t.ga))} | ${f2(mean(t.xgf))} | ${f2(mean(t.xga))} | ${pc(mean(t.xgShare))} ±${(100 * ci(t.xgShare)).toFixed(0)}`; })].join('\n') + '\n');
    }
  } finally {
    const errors = pages.flatMap(p => p.errors);
    console.log(`${out.runs.reduce((s, r) => s + r.rows.length, 0)} games in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${o.workers} workers. ERRORS: ${JSON.stringify(errors)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(out));
    await Promise.all(browsers.map(b => b.close()));
    if (errors.length) process.exitCode = 1;
  }
})();
