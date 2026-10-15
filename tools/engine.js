// The engine in Node, set up the way the page sets it up, for the headless tools (lab, shifts, rules, nhl-average).
// The page is the reference: a fresh visit with nothing saved in the browser runs the build defaults
// (data/defaults.json) with the game plans as the plan drawer shows them. tools/lab.js --pool checks that the
// page's own workers play every seed exactly as this does.
//
//   const E = await require('./engine').load();
//   const sim = E.create({ nhl: true });           every multiplier at 1.0 (the NHL-average tick)
//   E.setCard(sim, 'BOS', 'fore', '131');         change one choice, as the plan drawer would
//   const row = E.play(sim, seed);                one seeded game, its final numbers
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SIM = path.join(__dirname, '..', 'public', 'bruins-vs-canadiens');
const NAMES = ['rosters', 'ratings', 'systems', 'physics', 'moneypuck-2025', 'defaults', 'xg-model'];
// card key -> the page's control suffix and the tactic field the engine reads
const CARDS = { fore: 'Fore', brk: 'Break', entry: 'Entry', oz: 'Oz', dz: 'Dz', pp: 'PP', pk: 'PK', agg: 'Agg' };

const readData = () => Object.fromEntries(NAMES.map(n => [n, JSON.parse(fs.readFileSync(path.join(SIM, 'data', n + '.json'), 'utf8'))]));

// The choices the plan drawer offers for each card, and its starting values, read from the page's markup.
function pageControls() {
  const html = fs.readFileSync(path.join(SIM, 'index.html'), 'utf8'), out = {};
  for (const side of ['h', 'a']) for (const [card, id] of Object.entries(CARDS)) {
    if (card === 'agg') { const m = html.match(new RegExp(`<input id="${side}Agg"[^>]*value="(\\d+)"`)); out[side + id] = { value: +m[1] }; continue; }
    const m = html.match(new RegExp(`<select id="${side}${id}"[^>]*>([\\s\\S]*?)</select>`));
    const options = [...m[1].matchAll(/<option value="([^"]+)"([^>]*)>/g)];
    out[side + id] = { options: options.map(o => o[1]), value: (options.find(o => /selected/.test(o[2])) || options[0])[1] };
  }
  return out;
}

const mulberry = s => { let a = s * 2654435761; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

async function load() {
  const { createSim } = await import(pathToFileURL(path.join(SIM, 'src', 'engine', 'sim.js')).href);
  const controls = pageControls();
  const side = (sim, abbr) => { const i = sim.teams.findIndex(t => t.abbr === abbr); if (i < 0) throw new Error(`no club ${abbr}`); return i; };

  // A sim as a fresh page has it. `params` overrides physics.json values ({ key: 'a.b.c', v }) for this sim only.
  function create({ nhl = false, params = [] } = {}) {
    const DATA = readData();
    for (const { key, v } of params) {
      const ks = key.split('.'), last = ks.pop(); let o = DATA.physics;
      for (const k of ks) { o = o[k]; if (!o) throw new Error(`no physics key ${key}`); }
      if (!(last in o)) throw new Error(`no physics key ${key}`);
      o[last] = typeof o[last] === 'number' ? +v : v;
    }
    const sim = createSim(DATA);
    const admin = DATA.defaults.admin || {};
    for (const k of Object.keys(sim.cfg)) sim.cfg[k] = nhl ? 1 : admin[k] !== undefined ? +admin[k] : 1;
    // the page's controls: markup values, then the build defaults' systems; aggression is a 0-100 slider
    sim.controls = {};
    for (const [i, s] of [[0, 'h'], [1, 'a']]) {
      const club = sim.teams[i].abbr, saved = (DATA.defaults.systems || {})[club] || {};
      for (const id of Object.values(CARDS)) {
        const v = saved[id] !== undefined ? saved[id] : controls[s + id].value;
        sim.controls[s + id] = id === 'Agg' ? Math.round(+v * (saved[id] !== undefined ? 100 : 1)) : String(v);
      }
    }
    readTactics(sim);
    return sim;
  }
  function readTactics(sim) {
    for (const [i, s] of [[0, 'h'], [1, 'a']]) sim.setTactics(i, Object.fromEntries(Object.entries(CARDS).map(([card, id]) => [card, id === 'Agg' ? sim.controls[s + id] / 100 : sim.controls[s + id]])));
  }
  // One card for one club, as the plan drawer sets it: an offered option, or aggression from 0 to 1.
  function setCard(sim, abbr, card, v) {
    if (!CARDS[card]) throw new Error(`unknown card ${card}`);
    const id = (side(sim, abbr) ? 'a' : 'h') + CARDS[card];
    if (card === 'agg') sim.controls[id] = Math.round(+v * 100);
    else { if (!controls[id].options.includes(String(v))) throw new Error(`${abbr}.${card} has no option ${v}`); sim.controls[id] = String(v); }
    readTactics(sim);
  }
  const options = (abbr, card) => card === 'agg' ? ['0', '0.25', '0.5', '0.75', '1'] : controls['h' + CARDS[card]].options;

  // One seeded game from the opening faceoff; `each` runs after every tick if given.
  function play(sim, seed, each) {
    const saved = Math.random; Math.random = mulberry(seed);
    try {
      sim.newGame(); let k = 0;
      while (!sim.game.over && k++ < 300000) { sim.tick(0.03); if (each) each(sim); }
    } finally { Math.random = saved; }
    const g = sim.game;
    return { seed, end: g.shootout ? 'SO' : g.overtime ? 'OT' : 'REG', teams: sim.teams.map(t => ({
      abbr: t.abbr, goals: t.score, sog: t.shots, attempts: t.attempts, blocksMade: t.blocked, missed: t.missed, xg: t.xg,
      low: t.tier.low, medium: t.tier.medium, high: t.tier.high, pim: t.pim, offsides: t.offsides, icings: t.icings,
      takeaways: t.take, faceoffs: t.faceoffs, faceoffsWon: t.faceoffsWon, freezes: t.freezes })) };
  }
  return { create, setCard, options, play, CARDS };
}

module.exports = { load, mulberry, CARDS };
