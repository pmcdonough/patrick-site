// Rosters and ratings: each club's lines, pairs and goalies from data/rosters.json, rated from the stat lines and
// MoneyPuck (data/ratings.json, moneypuck-2025.json), with skating speed from physics.json.
import { clamp } from './rink.js?v=0.44';

export function buildTeams(DATA, XGF) {
  const RT = DATA.ratings, PH = DATA.physics, MP = DATA['moneypuck-2025'];
  function buildRosters(R) {
    const out = {};
    for (const key of Object.keys(R.teams)) {
      const T = R.teams[key]; const P = T.players;
      const row = id => { const p = P[id]; const st = p.stats; return [p.name, p.number, st.gp, st.g, st.a, st.plusMinus, st.pim, st.sog, st.toiMin, id]; };
      const grow = id => { const p = P[id]; return [p.name, p.number, p.stats.svPctUsed ?? p.stats.svPct, id]; };
      out[key] = { name: T.name, abbr: T.abbr, col: T.colors.primary, col2: T.colors.secondary, ink: T.colors.ink,
        F: T.lineup.F.map(l => l.map(row)), D: T.lineup.D.map(l => l.map(row)), G: T.lineup.G.map(grow),
        extras: T.lineup.extras, injured: T.lineup.injured, lineupAsOf: T.lineup.asOf };
    }
    return out;
  }
  const ROSTERS = buildRosters(DATA.rosters);

  function mkSkater(row, team, isD) {
    const [name, num, gp, g, a, pm, pim, sog, toi, id] = row;
    const G = Math.max(gp, RT.minGamesForRates); // small samples regress toward a modest baseline
    const gpg = g / G, apg = a / G;
    const shoot = clamp(RT.shoot.base + gpg * RT.shoot.perGoalPerGame + (sog ? g / sog : RT.shoot.shootingPctFallback) * RT.shoot.perShootingPct, RT.shoot.min, RT.shoot.max);
    const pass = clamp(RT.pass.base + apg * RT.pass.perAssistPerGame, RT.pass.min, RT.pass.max);
    const def = clamp(RT.def.base + pm * RT.def.perPlusMinus + (isD ? RT.def.defenseBonus : 0) + toi * RT.def.perToiMinute + (pim > RT.def.pimOver ? RT.def.pimBonus : 0), RT.def.min, RT.def.max);
    const skate = clamp(RT.skate.base + (gpg + apg) * RT.skate.perPointPerGame + toi * RT.skate.perToiMinute - (isD ? RT.skate.defensePenalty : 0), RT.skate.min, RT.skate.max);
    const mp = MP && MP.skaters[id] && MP.skaters[id].ratings; // MoneyPuck-derived ratings take precedence over the stat-line formula
    const S = mp ? mp.shoot : shoot, Pa = mp ? mp.pass : pass, De = mp ? mp.def : def;
    const ovr = (S + Pa + De + skate) / 4;
    const faceoff = mp ? mp.faceoff : 0.45, pen60 = mp ? mp.penaltiesPer60 : (MP ? MP.league.penaltiesPer60Skater : 0.7);
    const finishing = (MP && MP.skaters[id] && XGF[(MP.skaters[id].mpName || '').toLowerCase()]) || 1;
    return { team, id, name, num, isD, gp, g, a, shoot: S, pass: Pa, def: De, skate, skill: ovr, faceoff, pen60, mpRated: !!mp, finishing, spd: PH.skater.topSpeed.baseFtPerSec + skate * PH.skater.topSpeed.perSkateRating,
             x: 100, y: 42, vx: 0, vy: 0, goalie: false, onIce: false, box: 0, shift: 0, toi: 0, leaving: false, role: isD ? 'LD' : 'C', dist: 0, topSpd: 0, bursts: 0 };
  }
  function mkGoalie(row, team) {
    const [name, num, sv, id] = row;
    const mg = MP && MP.goalies[id];
    const tiers = mg ? { low: mg.tiers.low.svPctShrunk, medium: mg.tiers.medium.svPctShrunk, high: mg.tiers.high.svPctShrunk } : null;
    return { team, id, name, num, goalie: true, skill: clamp((sv - RT.goalie.svPctFloor) / RT.goalie.svPctRange, RT.goalie.min, RT.goalie.max), tiers, freezeRate: mg ? mg.freezeRate : null, spd: PH.goalie.speedFtPerSec, x: 100, y: 42, vx: 0, vy: 0, onIce: false, box: 0, shift: 0, toi: 0, role: 'G' };
  }

  const teams = [
    { id: 0, key: 'BOS', dir: 1 },
    { id: 1, key: 'MTL', dir: -1 }
  ];
  teams.forEach(t => {
    const R = ROSTERS[t.key];
    Object.assign(t, { name: R.name, abbr: R.abbr, col: R.col, col2: R.col2, ink: R.ink, score: 0, shots: 0, attempts: 0, blocked: 0, missed: 0, xg: 0, offsides: 0, icings: 0, clears: 0, tier: { low: 0, medium: 0, high: 0 }, faceoffs: 0, faceoffsWon: 0, freezes: 0, poss: 0, oz: 0, take: 0, pim: 0, changes: 0, tac: {}, players: [] });
    t.lines = { F: R.F.map(l => l.map(r => mkSkater(r, t, false))), D: R.D.map(l => l.map(r => mkSkater(r, t, true))) };
    t.lines.F.forEach(l => { l[0].role = 'LW'; l[1].role = 'C'; l[2].role = 'RW'; l.forEach((p, i) => p.slot = i); });
    t.lines.D.forEach(l => { l[0].role = 'LD'; l[1].role = 'RD'; l.forEach((p, i) => p.slot = i); });
    t.goalies = R.G.map(r => mkGoalie(r, t)); t.goalie = t.goalies[0];
    t.all = [...t.lines.F.flat(), ...t.lines.D.flat()];
    t.bench = { x0: t.id ? 104 : 58, x1: t.id ? 142 : 96 }; t.bench.door = (t.bench.x0 + t.bench.x1) / 2;
    t.bench.left = t.bench.x0 + 5; t.bench.right = t.bench.x1 - 5;
    t.pbox = { x0: t.id ? 112 : 62, x1: t.id ? 138 : 88 };
    t.rot = { F: 0, D: 0 }; t.onF = []; t.onD = []; t.lineF = 0; t.lineD = 0;
  });
  return { ROSTERS, teams };
}
