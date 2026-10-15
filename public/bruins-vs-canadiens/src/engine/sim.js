// The hockey engine: rosters and ratings from the data files, the game state, lines and changes, formations,
// skater and goalie decisions, puck physics and the rules. It never touches the page: it runs the same in the
// browser, in a background worker and in Node. The page reads its state and listens to its events.
//
//   const sim = createSim(DATA, { drift: true });
//   sim.on('log', (text, cls) => ...)      a play-by-play line, at the moment it happens (read sim.game for the clock)
//   sim.on('fx', (kind, data) => ...)      'ring' (a hit or block), 'save' (a hard save), 'goal' (the goal light)
//   sim.on('final', () => ...)             the game is over
//   sim.on('reset', () => ...)             a new game started
//   sim.setTactics(i, { fore, brk, entry, oz, dz, pp, pk, agg })   club i's game plan (the same as setting sim.teams[i].tac)
//   sim.cfg                                engine multipliers (the sliders); every one at 1 is the NHL-average calibration
//   sim.newGame(); while (!sim.game.over) sim.tick(0.03);
//
// The engine is split by subject. This file holds the game state, starts a game and runs the tick; rink.js (geometry),
// xg.js (expected goals) and rosters.js (ratings) are plain functions, and officials, lines, formations, ai, physics
// and rules each install their functions into one shared object, S, then link to each other's (see install in each).
// Trigonometry, exp, log and pow come from detmath.js, never from Math, so a seed plays the same game everywhere.
// Random numbers come from Math.random; the tools and the strategy test seed it per game (docs/RESTRUCTURE.md step 3
// passes a generator in instead). `drift: false` stops the small idle sway of players on their spots.
import * as DM from './detmath.js?v=0.44';
import { RW, RH, GL, NETW, NETD, CORNER, RINK_Y, BENCH_H, BOX_H, BLUE, rnd, clamp, dist, toRink, toFx, ownNet, oppNet, zone } from './rink.js?v=0.44';
import { makeXg } from './xg.js?v=0.44';
import { buildTeams } from './rosters.js?v=0.44';
import * as officialsModule from './officials.js?v=0.44';
import * as linesModule from './lines.js?v=0.44';
import * as formationsModule from './formations.js?v=0.44';
import * as aiModule from './ai.js?v=0.44';
import * as physicsModule from './physics.js?v=0.44';
import * as rulesModule from './rules.js?v=0.44';

export function createSim(DATA, opts = {}) {
  const drift = opts.drift !== false;
  const listeners = {};
  const on = (kind, f) => { (listeners[kind] = listeners[kind] || []).push(f); };
  const emit = (kind, ...args) => { const l = listeners[kind]; if (l) for (const f of l) f(...args); };
  const log = (text, cls) => emit('log', text, cls);

  const cfg = { accel: 1, speed: 1, cruise: 1, passSpd: 1, glide: 1, goalie: 1, shots: 1, passAcc: 1 };
  const RT = DATA.ratings, SYS = DATA.systems, PH = DATA.physics, MP = DATA['moneypuck-2025'], XG = DATA['xg-model'];
  const { XGF, xgModel, xgTier } = makeXg(XG);
  const { ROSTERS, teams } = buildTeams(DATA, XGF);

  const active = t => t.players.filter(p => !p.goalie && !p.box);
  const skaters = () => teams.flatMap(active);
  const shorthanded = t => t.all.some(p => p.box > 0);
  const onPP = t => shorthanded(teams[1 - t.id]) && !shorthanded(t);
  const avgDef = line => line.reduce((s, p) => s + p.def, 0) / line.length;

  // ---------- Game state ----------
  const freshPuck = () => ({ x: 100, y: 42.5, vx: 0, vy: 0, carrier: null, lastTeam: null, shot: false, shooter: null, releaseTeam: null, releaseFx: 0, touched: true, sinceSave: 99, xg: undefined });
  const puck = freshPuck();
  function release(from) { puck.releaseTeam = from.team; puck.releaseFx = toFx(from.team, from.x); puck.touched = false; puck.raceJudged = false; }
  const game = { period: 1, clock: 1200, speed: 3, paused: false, over: false, faceoff: null, faceT: 0, note: 'Faceoff', whistle: null };

  // ---------- The modules: each adds its functions to S, then all link to each other's ----------
  const S = { drift, emit, log, cfg, DATA, RT, SYS, PH, MP, XG, XGF, xgModel, xgTier, ROSTERS, teams, active, skaters, shorthanded, onPP, avgDef, freshPuck, puck, release, game };
  const links = [officialsModule, linesModule, formationsModule, aiModule, physicsModule, rulesModule].map(m => m.install(S));
  links.forEach(link => link());
  const { officials, moveOfficials, stoppageChange, setFaceoff, manageChanges, assignTargets, movePlayers, turnGoalie, movePuck, releaseFromBox, checkOffside, endPeriod,
    lookXg, readLook, buildUnit, peekLine, shiftTarget, fDoor, dDoor, doorFor, fatigueLevel, goalieLine } = S;

  function newGame() {
    game.overtime = false; game.shootout = false; game.recorded = false;
    teams.forEach(t => {
      t.score = t.shots = t.attempts = t.blocked = t.missed = t.poss = t.oz = t.take = t.pim = t.changes = t.xg = t.faceoffs = t.faceoffsWon = t.freezes = t.offsides = t.icings = t.clears = 0; t.tier = { low: 0, medium: 0, high: 0 }; t.dir = t.id ? -1 : 1; t.special = false;
      delete t.dumpSide; delete t.dumpT; delete t.changeJitter; delete t.rimT; t.lineF = 0; t.lineD = 0;
      for (const k of ['marks', 'slotCover', 'pressurer', 'fronter', 'sinceEntry', 'wasOff', 'possT', 'delayed', 'chips']) delete t[k];
      // every game starts from the state a freshly built team has, so a game never depends on how the last one ended
      [...t.all, ...t.goalies].forEach(p => { p.x = 100; p.y = 42; p.vx = 0; p.vy = 0; delete p.burst; delete p.rushed; delete p.sprint; delete p.trail; delete p.target; delete p.lookingToShoot; });
      t.all.forEach(p => { p.box = 0; p.onIce = false; p.leaving = false; p.entering = false; p.subOn = false; p.shift = 0; p.toi = 0; p.sub = null; p.gg = 0; p.dist = 0; p.topSpd = 0; p.bursts = 0; p.blocks = 0; p.breakaway = false; p.oneTimers = 0; }); t.flash = null;
      t.goalies.forEach(g => { g.toi = 0; g.dist = 0; g.onIce = false; g.ang = undefined; });
      t.rot = { F: -1, D: -1 }; t.onF = []; t.onD = [];
    });
    for (const k of Object.keys(puck)) delete puck[k]; Object.assign(puck, freshPuck()); game.whistle = null;
    game.period = 1; game.clock = 1200; game.over = false; emit('reset');
    // opening lines only after the clock, the period, the score and both penalty boxes are reset: the rotation reads all of them
    teams.forEach(t => stoppageChange(t, true));
    log('Puck drop at TD Garden. Bruins attack right.');
    setFaceoff(100, 42.5, 'Faceoff');
  }

  function tick(dt) {
    if (game.over) return;
    if (game.faceoff) {
      game.faceT -= dt;
      if (game.faceT <= 0) {
        const hc = teams[0].onF.find(p => p.role === 'C') || teams[0].onF[0], ac = teams[1].onF.find(p => p.role === 'C') || teams[1].onF[0];
        const fh = hc ? hc.faceoff : 0.45, fa = ac ? ac.faceoff : 0.45;
        const win = Math.random() < fh / (fh + fa) ? teams[0] : teams[1];
        teams[0].faceoffs++; teams[1].faceoffs++; win.faceoffsWon++;
        const d = win.onD[Math.floor(Math.random() * win.onD.length)] || win.onF[0];
        const a = DM.atan2(d.y - puck.y, d.x - puck.x); puck.vx = DM.cos(a) * 30; puck.vy = DM.sin(a) * 30; puck.lastTeam = win; puck.cool = 0.1;
        game.faceoff = null; game.note = `${win.name} win the draw`;
      }
      return;
    }
    game.clock -= dt;
    for (const t of teams) for (const p of t.all) if (p.box > 0) { p.box -= dt; if (p.box <= 0) releaseFromBox(t, p); }
    puck.sinceSave += dt; teams.forEach(q => { q.sinceEntry = (q.sinceEntry === undefined ? 99 : q.sinceEntry) + dt; });
    if (puck.carrier) { const t = puck.carrier.team; t.poss += dt; const inOff = zone(t, puck.x) === 'off'; if (inOff) t.oz += dt; if (inOff && !t.wasOff) t.sinceEntry = 0; t.wasOff = inOff; t.possT = (t.possT || 0) + dt; teams[1 - t.id].possT = 0; }
    teams.forEach(t => { manageChanges(t, dt); if (t.dumpT > 0) t.dumpT -= dt; t.rimT = puck.rim && puck.lastTeam !== t ? (t.rimT || 0) + dt : 0; t.players.forEach(p => { p.sprint = false; if (p.rushed > 0) p.rushed -= dt; }); });
    assignTargets(dt); movePlayers(dt); teams.forEach(t => turnGoalie(t.goalie, dt)); movePuck(dt);
    if (!game.faceoff) checkOffside();
    if (!game.faceoff && !puck.carrier) { const sp0 = DM.hypot(puck.vx, puck.vy); puck.deadT = sp0 < 2 && !skaters().some(p => dist(p, puck) < 6) ? (puck.deadT || 0) + dt : 0; if (puck.deadT > 3) { log('Whistle: dead puck.'); setFaceoff(puck.x < 100 ? (puck.x < 75 ? 31 : 80) : (puck.x > 125 ? 169 : 120), puck.y < 42.5 ? 20.5 : 64.5, 'Dead puck'); } }
    if (game.clock <= 0) { game.clock = 0; endPeriod(); }
  }

  function teamSample(t) {
    const opp = teams[1 - t.id];
    return { attempts: t.attempts, shots: t.shots, score: t.score, xg: t.xg, blockedFor: opp.blocked, missed: t.missed, tierHigh: t.tier.high, tierMed: t.tier.medium, tierLow: t.tier.low, pens: t.pim / 2, fo: t.faceoffs ? t.faceoffsWon / t.faceoffs : 0.5, freezes: opp.freezes, offsides: t.offsides, icings: t.icings };
  }
  const setTactics = (i, tac) => { teams[i].tac = tac; };

  return { on, cfg, DATA, teams, game, puck, officials, tick, newGame, setTactics, teamSample, moveOfficials,
    RW, RH, GL, NETW, NETD, CORNER, RINK_Y, BENCH_H, BOX_H, BLUE, ROSTERS, RT, SYS, PH, MP, XG, XGF,
    xgModel, xgTier, clamp, dist, rnd, active, skaters, shorthanded, onPP, toRink, toFx, ownNet, oppNet, zone, lookXg, readLook,
    buildUnit, peekLine, shiftTarget, fDoor, dDoor, doorFor, fatigueLevel, goalieLine };
}
