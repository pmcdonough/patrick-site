// The engine's guarantees, checked in Node with no browser:  node --test tools/test   (about half a minute)
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../engine');

// Everything a game leaves in the engine, as plain data: players by number instead of object links.
function snapshot(sim) {
  const ref = v => v && typeof v === 'object' && 'num' in v && 'team' in v ? `${v.team.abbr}#${v.num}${v.goalie ? 'G' : ''}` : v && v.abbr && v.lines ? `team ${v.abbr}` : v;
  const plain = (o, depth = 0) => {
    if (depth > 6 || o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(x => typeof x === 'object' && x && ('num' in x || x.lines) ? ref(x) : plain(x, depth + 1));
    return Object.fromEntries(Object.keys(o).sort().map(k => [k, k === 'team' ? ref(o[k]) : typeof o[k] === 'object' && o[k] && ('num' in o[k] || o[k].lines) ? ref(o[k]) : plain(o[k], depth + 1)]));
  };
  return JSON.stringify({ game: plain(sim.game), puck: plain(sim.puck), teams: sim.teams.map(t => plain(t)) });
}

test('a seed plays the same game whatever came before it', async () => {
  const E = await load();
  const a = E.create({ nhl: true }), b = E.create({ nhl: true });
  const first = [E.play(a, 1), E.play(a, 2)];
  const second = [E.play(b, 2), E.play(b, 1)].reverse();
  assert.deepEqual(second, first);
});

test('a new game keeps nothing from the last one', async () => {
  const E = await load();
  const used = E.create({ nhl: true }), fresh = E.create({ nhl: true });
  E.play(used, 3);                                   // a whole game, so every kind of state has been touched
  for (const sim of [used, fresh]) { sim.newGame(7); for (let k = 0; k < 2000; k++) sim.tick(0.03); }
  assert.equal(snapshot(used), snapshot(fresh));
});

test('every random draw in a seeded game comes from its own generator', async () => {
  const E = await load();
  const sim = E.create({ nhl: true }), saved = Math.random;
  Math.random = () => { throw new Error('the engine called Math.random during a seeded game'); };
  try { sim.newGame(11); for (let k = 0; k < 20000 && !sim.game.over; k++) sim.tick(0.03); }
  finally { Math.random = saved; }
});

test('no icing is called on a team that is shorthanded', async () => {
  const E = await load();
  const sim = E.create({ nhl: true }); let icings = 0;
  sim.on('log', text => {
    const m = text.match(/^Icing on the (.+?);/); if (!m) return;
    const t = sim.teams.find(x => x.name === m[1]); icings++;
    assert.ok(!sim.shorthanded(t), `icing called on the ${t.name} while shorthanded: ${text}`);
  });
  for (const seed of [4, 5]) E.play(sim, seed);
  assert.ok(icings > 0, 'the games had no icings at all, so the check checked nothing');
});

test('the plan drawer offers only choices the systems data defines', async () => {
  const E = await load();
  const SYS = require('../../public/bruins-vs-canadiens/data/systems.json');
  const SECTION = { fore: 'forecheck', brk: 'breakout', entry: 'entry', oz: 'offensiveZone', dz: 'defensiveZone', pp: 'powerPlay', pk: 'penaltyKill' };
  for (const [card, section] of Object.entries(SECTION)) for (const v of E.options('BOS', card)) assert.ok(SYS[section][v], `${card} offers ${v}, which systems.json ${section} does not define`);
});

test('play never freezes and nobody stays out for a period', async () => {
  // Seeds 1 and 4 at the build defaults froze before sim 0.46: a pass died just short of the far blue line, stayed
  // "in flight" with its receiver held onside, nobody else chased it, and one line stayed out for most of a period.
  const E = await load();
  const sim = E.create();
  for (const seed of [1, 4]) {
    let still = 0, worstStill = 0, worstShift = 0, who = '';
    E.play(sim, seed, s => {
      const p = s.puck;
      still = !s.game.faceoff && !p.carrier && Math.hypot(p.vx, p.vy) < 2 ? still + 0.03 : 0; worstStill = Math.max(worstStill, still);
      for (const t of s.teams) for (const q of t.all) if (q.onIce && q.shift > worstShift) { worstShift = q.shift; who = `${t.abbr} #${q.num}`; }
    });
    assert.ok(worstStill <= 5, `seed ${seed}: the puck sat loose and still for ${worstStill.toFixed(0)} s`);
    assert.ok(worstShift <= 180, `seed ${seed}: ${who} stayed on for ${worstShift.toFixed(0)} s`);
  }
});

test('a snapshot restored, in the same engine or another, plays on exactly as the game did', async () => {
  const E = await load();
  const a = E.create(), b = E.create();
  a.newGame(5); for (let k = 0; k < 40000; k++) a.tick(0.03);      // well into the second period, mid-play
  const snap = a.snapshot();
  const run = sim => { for (let k = 0; k < 4000 && !sim.game.over; k++) sim.tick(0.03); return snapshot(sim); };
  const original = run(a);
  a.restore(snap); assert.equal(run(a), original, 'restored into the same engine');
  b.newGame(99); for (let k = 0; k < 500; k++) b.tick(0.03);        // another engine in another game
  b.restore(snap); assert.equal(run(b), original, 'restored into another engine');
  b.restore(snap); assert.equal(run(b), original, 'and again: a snapshot is not used up');
});

test('a forced decision happens on the next tick, once, and a reseed changes what follows', async () => {
  const E = await load();
  const sim = E.create();
  sim.newGame(5);
  let k = 0; while (!(sim.puck.carrier && !sim.puck.carrier.goalie) && k++ < 20000) sim.tick(0.03);
  const p = sim.puck.carrier, snap = sim.snapshot();
  const shots = () => sim.teams[p.team.id].attempts;
  const before = shots(); sim.force(p, { kind: 'shoot' }); sim.tick(0.03);
  assert.equal(shots(), before + 1, 'the forced shot was taken');
  assert.equal(sim.puck.carrier, null);
  const ends = new Set(); for (let s = 1; s <= 5; s++) { sim.restore(snap); sim.reseed(s); for (let j = 0; j < 300; j++) sim.tick(0.03); ends.add(snapshot(sim)); }
  assert.ok(ends.size > 1, 'different seeds from the same moment play differently');
});

test('every goal beat a save roll, whoever touched the puck last', async () => {
  const E = await load();
  const sim = E.create({ nhl: true }); let goals = 0, free = 0;
  sim.on('fx', kind => { if (kind === 'goal') { goals++; if (!sim.puck.beaten) free++; } });
  for (const s of [1, 2, 3, 4]) E.play(sim, s);
  assert.ok(goals > 10, 'enough goals to check');
  assert.equal(free, 0, `${free} of ${goals} goals went in without a save roll`);
});
