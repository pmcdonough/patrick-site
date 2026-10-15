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
// Trigonometry, exp, log and pow come from detmath.js, never from Math, so a seed plays the same game everywhere.
// Random numbers come from Math.random; the tools and the strategy test seed it per game (docs/RESTRUCTURE.md step 3
// passes a generator in instead). `drift: false` stops the small idle sway of players on their spots.
import * as DM from './detmath.js?v=0.43';   // sin, cos, atan2, hypot, exp, log, pow: the same bits in every browser and in Node

export function createSim(DATA, opts = {}) {
  const drift = opts.drift !== false;
  const listeners = {};
  const on = (kind, f) => { (listeners[kind] = listeners[kind] || []).push(f); };
  const emit = (kind, ...args) => { const l = listeners[kind]; if (l) for (const f of l) f(...args); };
  const log = (text, cls) => emit('log', text, cls);

  const cfg = { accel: 1, speed: 1, cruise: 1, passSpd: 1, glide: 1, goalie: 1, shots: 1, passAcc: 1 };

  const RW = 200, RH = 85, GL = 11, NETW = 6, NETD = 4, CORNER = 28;
  const RINK_Y = 13, BENCH_H = 12, BOX_H = 10; // feet above and below the ice for benches and penalty boxes

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => DM.hypot(a.x - b.x, a.y - b.y);

  // ---------- Data-driven rosters: see data/rosters.json (lineups, stats, sources) ----------
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
  const RT = DATA.ratings, SYS = DATA.systems, PH = DATA.physics, MP = DATA['moneypuck-2025'], XG = DATA['xg-model'];
  // Expected goals: the logistic model fit on MoneyPuck shots (see the data file's recipe). Angle is from the net's
  // midline in degrees, distance from the net center in feet. Returns the probability a league-average shooter scores.
  const XGF = XG && XG.shooters ? Object.fromEntries(Object.values(XG.shooters).map(sh => [sh.name.toLowerCase(), sh.finishing])) : {};
  function xgModel(distFt, angleDeg, ctx) {
    if (!XG) return null;
    const c = XG.model.coef, d = Math.max(0, distFt), a = Math.min(90, Math.abs(angleDeg));
    const df = XG.model.defaults || {};
    let z = XG.model.intercept + c.speed * (ctx && ctx.speed !== undefined ? ctx.speed : df.speed || 0) + c.offWing * (ctx && ctx.offWing !== undefined ? ctx.offWing : df.offWing || 0) + c.dist * d + c.logDist * DM.log(d + 1) + c.dist2 * d * d / 100 + c.angle * a + c.angle2 * a * a / 100 + c.distAngle * d * a / 100;
    if (ctx) { if (ctx.rebound) z += c.rebound; if (ctx.rush && c.rush !== undefined) z += c.rush; if (ctx.pp) z += c.pp; if (ctx.sh) z += c.sh; if (ctx.type && c['type_' + ctx.type] !== undefined) z += c['type_' + ctx.type]; }
    return 1 / (1 + DM.exp(-z));
  }
  const xgTier = p => p >= XG.tiers.high.minXg ? 'high' : p >= XG.tiers.low.maxXg ? 'medium' : 'low';

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
  const active = t => t.players.filter(p => !p.goalie && !p.box);
  const skaters = () => teams.flatMap(active);
  const shorthanded = t => t.all.some(p => p.box > 0);
  const onPP = t => shorthanded(teams[1 - t.id]) && !shorthanded(t);
  const avgDef = line => line.reduce((s, p) => s + p.def, 0) / line.length;

  // team-relative coords: fx = distance along attack from own goal line, fy = 0..85
  const toRink = (t, fx, fy) => ({ x: t.dir > 0 ? GL + fx : RW - GL - fx, y: fy });
  const toFx = (t, x) => t.dir > 0 ? x - GL : RW - GL - x;
  const ownNet = t => ({ x: t.dir > 0 ? GL : RW - GL, y: RH / 2 });
  const oppNet = t => ({ x: t.dir > 0 ? RW - GL : GL, y: RH / 2 });
  const zone = (t, x) => { const fx = toFx(t, x); return fx < 64 ? 'own' : fx > 114 ? 'off' : 'neutral'; };

  // ---------- Game state ----------
  const freshPuck = () => ({ x: 100, y: 42.5, vx: 0, vy: 0, carrier: null, lastTeam: null, shot: false, shooter: null, releaseTeam: null, releaseFx: 0, touched: true, sinceSave: 99, xg: undefined });
  const puck = freshPuck();
  function release(from) { puck.releaseTeam = from.team; puck.releaseFx = toFx(from.team, from.x); puck.touched = false; puck.raceJudged = false; }
  const endDot = (t, y) => ({ x: ownNet(t).x + t.dir * 20, y: y < 42.5 ? 20.5 : 64.5 });
  const neutralDot = (t, y) => ({ x: t.dir > 0 ? 120 : 80, y: y < 42.5 ? 20.5 : 64.5 });
  const game = { period: 1, clock: 1200, speed: 3, paused: false, over: false, faceoff: null, faceT: 0, note: 'Faceoff', whistle: null };
  // Officiating crew in the NHL's lead/trail mechanics. The referee works as the lead official: at the
  // goal line (his "home base") when the puck is in an end zone, on the blue line through the neutral
  // zone, and he hustles ahead of a rush to be at the far goal line before the play. The two linesmen
  // take opposite boards; the one nearer the zone in play is the lead linesman and straddles that blue
  // line for offside, the trail linesman holds near the red line to judge icing and races to the end
  // boards on a potential icing.
  const officials = [
    { kind: 'ref', x: 100, y: 80, vx: 0, vy: 0 },
    { kind: 'linesman', x: 75, y: 2.6, vx: 0, vy: 0, side: 2.6, lead: true },
    { kind: 'linesman', x: 125, y: 82.4, vx: 0, vy: 0, side: 82.4, lead: false }
  ];
  function blowWhistle(note) {
    const linesmanCall = /Offside|Icing/.test(note);
    const who = linesmanCall ? officials.slice(1).sort((a, b) => dist(a, puck) - dist(b, puck))[0] : officials[0];
    game.whistle = { t: 3, who, text: note, at: { x: puck.x, y: puck.y } };
  }
  function moveOfficials(dt) {
    if (game.whistle) { game.whistle.t -= dt; if (game.whistle.t <= 0) game.whistle = null; }
    const fo = game.faceoff;
    const zoneSide = puck.x < 75 ? -1 : puck.x > 125 ? 1 : 0; // -1 left end zone, 1 right end zone, 0 neutral
    const L = officials.slice(1);
    // lead linesman: re-pick whenever the puck enters an end zone (the one closer to that blue line)
    if (zoneSide !== 0 && game.lastZoneSide !== zoneSide) {
      const bl = zoneSide < 0 ? 75 : 125;
      L.sort((a, b) => Math.abs(a.x - bl) - Math.abs(b.x - bl)); L[0].lead = true; L[1].lead = false;
    }
    game.lastZoneSide = zoneSide;
    // potential icing in progress: puck shot from behind the red line, untouched, heading for the far goal line
    const rt = puck.releaseTeam;
    const icingRun = rt && !puck.touched && !puck.carrier && puck.releaseFx < 89 && Math.abs(puck.vx) > 15 && toFx(rt, puck.x) > 100 && !shorthanded(rt);
    const icingEnd = icingRun ? (rt.dir > 0 ? RW - GL : GL) : null;
    for (const o of officials) {
      let tx, ty, top = PH.officials.skateSpeedFtPerSec;
      if (o.kind === 'ref') {
        const rushDir = puck.carrier ? Math.sign(puck.carrier.vx) : Math.sign(puck.vx);
        if (fo) { tx = fo.x + (fo.x < 100 ? 16 : -16); ty = fo.y < 42 ? 76 : 9; }
        else if (zoneSide !== 0) { // home base: goal line extended, opposite side from the puck, off the boards
          const glx = zoneSide < 0 ? GL + 3 : RW - GL - 3;
          tx = glx; ty = puck.y < 42 ? 72 : 13;
          if (Math.abs(puck.y - ty) < 14) ty = puck.y < 42 ? 80 : 5; // play comes to him: back to the boards
        } else { // neutral zone: on the blue line ahead of the play, boards side, anticipating the rush
          tx = rushDir > 0 ? 125 : rushDir < 0 ? 75 : puck.x;
          ty = puck.y < 42 ? 78 : 7;
          if (Math.abs(puck.vx) > 20 || (puck.carrier && Math.abs(puck.carrier.vx) > 15)) tx = rushDir > 0 ? 165 : 35; // get ahead of the rush
          top = PH.officials.hustleSpeedFtPerSec;
        }
      } else {
        const dropper = fo && L.slice().sort((a, b) => dist(a, fo) - dist(b, fo))[0] === o;
        if (dropper) { tx = fo.x; ty = fo.y + (fo.y < 42 ? -3.2 : 3.2); }
        else if (fo) { tx = fo.x < 100 ? 75 : 125; ty = o.side; }
        else if (icingRun && !o.lead) { tx = icingEnd + (icingEnd < 100 ? 6 : -6); ty = o.side; top = PH.officials.hustleSpeedFtPerSec; } // trail linesman races to the end boards
        else if (zoneSide !== 0) {
          const bl = zoneSide < 0 ? 75 : 125;
          tx = o.lead ? bl : (zoneSide < 0 ? 104 : 96); // lead straddles the blue line; trail near the red line, ready for the breakout
          ty = o.side;
        } else { // neutral zone: both at blue lines, lead on the line play is moving toward
          const dirx = puck.carrier ? Math.sign(puck.carrier.vx || 1) : Math.sign(puck.vx || 1);
          tx = o.lead ? (dirx > 0 ? 125 : 75) : (dirx > 0 ? 75 : 125);
          ty = o.side;
        }
      }
      const dx = tx - o.x, dy = ty - o.y, d = DM.hypot(dx, dy);
      const sp = Math.min(top * cfg.speed, Math.sqrt(2 * PH.officials.accelFtPerSec2 * d));
      if (d > 0.3) { o.x += dx / d * sp * dt; o.y += dy / d * sp * dt; }
      keepOnIce(o, 1.2); keepOffNets(o, 1.4);
    }
  }
  const BLUE = [75, 125];


  // ---------- Lines, benches and shifts ----------
  // Rotation patterns give line 1 and pair 1 the most ice, like real TOI splits (L1 ~19 min, L4 ~12; D1 ~24, D3 ~16).
  const ROT = SYS.deployment.rotation;
  // Deployment: who the coach sends next. Late in a close game the bench shortens to the top three
  // forward lines and the top two pairs. Power-play and penalty-kill units have their own rotations.
  function pattern(t, unit) {
    const pp = onPP(t), pk = shorthanded(t) && !pp;
    if (pp) return ROT['pp' + unit];
    if (pk) return ROT['pk' + unit];
    const opp = teams[1 - t.id];
    const LC = SYS.deployment.lateCloseGame;
    const late = game.period >= 3 && game.clock < LC.clockUnderSec && t.score <= opp.score;
    if (late) return LC[unit];
    return ROT[unit];
  }
  function nextLine(t, unit) {
    const pat = pattern(t, unit);
    t.rot[unit] = (t.rot[unit] + 1) % pat.length;
    return pat[t.rot[unit]];
  }
  function peekLine(t, unit) { const pat = pattern(t, unit); return pat[(t.rot[unit] + 1) % pat.length]; }
  // Build the unit that will take the ice from a line template: skip anyone in the box or already out
  // there, borrow from the next line for a missing slot, and dress only two forwards while shorthanded.
  function buildUnit(t, unit, idx) {
    const lines = t.lines[unit]; const want = unit === 'F' ? (shorthanded(t) && !onPP(t) ? 2 : 3) : 2;
    const out = [];
    const tmpl = lines[idx];
    const slots = unit === 'F' ? (want === 2 ? [1, 2] : [0, 1, 2]) : [0, 1];
    for (const s of slots) {
      let p = tmpl[s];
      if (p.box || p.onIce) {
        p = null;
        for (let k = 1; k < lines.length && !p; k++) { const c = lines[(idx + k) % lines.length][s]; if (!c.box && !c.onIce && !out.includes(c)) p = c; }
        if (!p) for (const l of lines) for (const c of l) if (!c.box && !c.onIce && !out.includes(c) && !p) p = c;
      }
      if (p) out.push(p);
    }
    return out;
  }
  function rebuildOnIce(t) {
    t.players = [...t.onF, ...t.onD, t.goalie];
    t.goalie.onIce = true;
  }
  function stoppageChange(t, force) {
    const avgShift = u => u.length ? u.reduce((s, p) => s + p.shift, 0) / u.length : 99;
    const pp = onPP(t), pk = shorthanded(t) && !pp;
    const situationChanged = (pp || pk) !== !!t.special; t.special = pp || pk;
    for (const unit of ['F', 'D']) {
      const on = unit === 'F' ? t.onF : t.onD;
      const wantCount = unit === 'F' ? (pk ? 2 : 3) : 2;
      if (force || situationChanged || on.length !== wantCount || avgShift(on) > (unit === 'F' ? 22 : 30) || on.some(p => p.leaving || p.entering)) {
        on.forEach(p => { p.onIce = false; p.leaving = false; p.entering = false; p.subOn = false; p.sub = null; p.shift = 0; });
        const idx = nextLine(t, unit);
        const fresh = buildUnit(t, unit, idx);
        fresh.forEach(p => { p.onIce = true; p.shift = 0; p.leaving = false; p.entering = false; });
        if (unit === 'F') { t.onF = fresh; t.lineF = idx; } else { t.onD = fresh; t.lineD = idx; }
        t.changes++;
      }
    }
    rebuildOnIce(t);
  }
  // Home has the last change: when the visitors send out their top line for a draw in Boston's end,
  // Boston answers with its best defensive forward line.
  function matchLines(home, away, x) {
    if (away.lineF !== 0 || zone(home, x) !== 'own' || onPP(home) || shorthanded(home)) return;
    let best = 0, bd = -1; home.lines.F.forEach((l, i) => { const d = avgDef(l); if (d > bd) { bd = d; best = i; } });
    if (best === home.lineF) return;
    home.onF.forEach(p => { p.onIce = false; p.shift = 0; });
    home.onF = buildUnit(home, 'F', best); home.onF.forEach(p => { p.onIce = true; p.shift = 0; }); home.lineF = best;
    rebuildOnIce(home);
  }
  // On the fly: is it safe for this team to change right now? Never while the other side is coming
  // at us; yes when the puck is deep in their end, or when we can dump it in from the neutral zone.
  function safeToChange(t) {
    const c = puck.carrier; const W = SYS.deployment.changeWindows;
    if (game.faceoff || t.delayed || !c) return false;        // never off a loose puck
    const cfx = toFx(t, c.x);
    if (c.team === t) return cfx >= W.ownCarryMinFx && cfx <= W.ownCarryMaxFx && zone(t, c.x) !== 'def';
    // They have it: only while retrieving deep in their own end and not yet moving it up.
    return toFx(c.team, c.x) < W.oppRetrievingMaxFx && Math.abs(c.vx) < W.oppRetrievingMaxSpeed;
  }
  // Are we defending right now (they have the puck, or last touched it, outside our offensive zone)?
  function defending(t) {
    const c = puck.carrier;
    if (c) return c.team !== t && zone(t, c.x) !== 'off';
    return puck.lastTeam && puck.lastTeam !== t && zone(t, puck.x) !== 'off';
  }
  // Target shift length by unit and situation: ~45 s for forwards (shorter down the lineup),
  // ~55 s for defense, longer for the first power-play unit, short for penalty killers.
  function shiftTarget(t, unit, idx) {
    const ST = SYS.deployment.shiftTargetsSec;
    if (onPP(t)) return idx === 0 ? ST.ppUnit1 : ST.ppUnit2;
    if (shorthanded(t)) return unit === 'F' ? ST.pkF : ST.pkD;
    if (unit === 'D') return ST.Dbase + idx * ST.DperPair;
    return ST.F[idx] || 40;
  }
  const changing = t => [...t.onF, ...t.onD].some(p => p.leaving || p.entering);
  // Two doors per bench. Forwards change through the door at the attacking end, defense through the
  // door at the defending end; both swap when the teams change ends for the second period.
  const fDoor = t => t.dir > 0 ? t.bench.right : t.bench.left;
  const dDoor = t => t.dir > 0 ? t.bench.left : t.bench.right;
  const doorFor = (t, p) => p.isD ? dDoor(t) : fDoor(t);
  function startUnitChange(t, unit) {
    const on = unit === 'F' ? t.onF : t.onD;
    const idx = nextLine(t, unit);
    const fresh = buildUnit(t, unit, idx);
    // the skater nearest the bench is first man off; everyone takes the matching slot's replacement
    const door = unit === 'D' ? dDoor(t) : fDoor(t);
    const order = on.slice().sort((a, b) => Math.abs(a.x - door) - Math.abs(b.x - door));
    order.forEach((p, i) => { p.leaving = true; p.sub = fresh[i] || null; p.subOn = false; });
    if (unit === 'F') t.lineF = idx; else t.lineD = idx;
    t.flash = { t: 2.2, text: unit === 'F' ? 'LINE CHANGE' : 'D CHANGE' };
    t.changeJitter = rnd(-4, 6); t.changes++;
  }
  // a single tired skater near the bench swaps himself out while the play is at the far end
  function startSoloChange(t, p) {
    const unit = p.isD ? 'D' : 'F';
    const lines = t.lines[unit]; const cur = p.isD ? t.lineD : t.lineF;
    let sub = null;
    for (let k = 1; k < lines.length && !sub; k++) { const c = lines[(cur + k) % lines.length][p.slot]; if (!c.box && !c.onIce) sub = c; }
    if (!sub) return;
    p.leaving = true; p.sub = sub; p.subOn = false;
    t.flash = { t: 1.6, text: `#${p.num} OFF, #${sub.num} ON` };
    t.changes++;
  }
  function manageChanges(t, dt) {
    if (t.flash) { t.flash.t -= dt; if (t.flash.t <= 0) t.flash = null; }
    for (const unit of ['F', 'D']) {
      const on = unit === 'F' ? t.onF : t.onD;
      on.forEach(p => { p.shift += dt; p.toi += dt; });
    }
    t.goalie.toi += dt;
    const safe = safeToChange(t);
    // A gassed unit takes the first half-decent window: our puck past our blue line, or a loose puck in their end.
    const gassed = [...t.onF, ...t.onD].some(p => p.shift > SYS.deployment.changeWindows.desperateAfterSec);
    const desperate = gassed && !game.faceoff && !t.delayed && (puck.carrier ? (puck.carrier.team === t ? toFx(t, puck.carrier.x) > 80 : toFx(puck.carrier.team, puck.carrier.x) < 45) : toFx(t, puck.x) > 130);
    if (!changing(t) && (safe || desperate)) {
      // units stagger: forwards first when both are due, defense on the next safe window
      for (const unit of ['F', 'D']) {
        const on = unit === 'F' ? t.onF : t.onD;
        if (!on.length) continue;
        const avg = on.reduce((s, p) => s + p.shift, 0) / on.length;
        if (avg > shiftTarget(t, unit, unit === 'F' ? t.lineF : t.lineD) + (t.changeJitter || 0)) { startUnitChange(t, unit); break; }
      }
    }
    if (!changing(t)) {
      // solo changes: a skater who is both tired and close to the gate while the puck is far away
      const far = Math.abs(puck.x - t.bench.door) > 55 && zone(t, puck.x) !== 'own' && !(puck.carrier && puck.carrier.team !== t && toFx(t, puck.x) < 80);
      for (const p of [...t.onF, ...t.onD]) {
        const target = shiftTarget(t, p.isD ? 'D' : 'F', p.isD ? t.lineD : t.lineF);
        if (far && !defending(t) && p.shift > target + 4 && Math.abs(p.x - doorFor(t, p)) < 30 && p.y < 45 && p !== puck.carrier) { startSoloChange(t, p); break; }
      }
    }
    // complete swaps: the fresh skater may step on once the tired one is within a stick length of the gate
    for (const unit of ['F', 'D']) {
      const on = unit === 'F' ? t.onF : t.onD;
      for (let i = 0; i < on.length; i++) {
        const p = on[i];
        if (p.entering) { if (p.y > 6 || p.shift > 2) p.entering = false; continue; }
        if (!p.leaving) continue;
        const door = doorFor(t, p);
        const near = Math.abs(p.x - door) < 9 && p.y < 7;
        if (near && p.sub && !p.subOn && !p.sub.onIce && !p.sub.box) {
          const s = p.sub; s.onIce = true; s.shift = 0; s.leaving = false; s.entering = true; s.x = clamp(door + rnd(-2.5, 2.5), 4, RW - 4); s.y = 2.4; s.vx = 0; s.vy = 14;
          on.push(s); p.subOn = true;
        }
        if (Math.abs(p.x - door) < 5 && p.y < 4.2) {
          p.onIce = false; p.leaving = false; p.subOn = false; p.sub = null; p.shift = 0; p.vx = p.vy = 0;
          on.splice(i, 1); i--;
        }
      }
    }
    rebuildOnIce(t);
  }
  function benchMinor(t, server) {
    server.box = PH.game.minorPenaltySec; t.pim += 2;
    server.onIce = false; server.leaving = false; server.entering = false; server.sub = null;
    t.onF = t.onF.filter(q => q !== server); t.onD = t.onD.filter(q => q !== server); rebuildOnIce(t);
    log(`Bench minor: ${t.name}, too many men on the ice (2:00), served by #${server.num} ${server.name}.`, 'goal');
    const d = endDot(t, puck.y);
    setFaceoff(d.x, d.y, `${teams[1 - t.id].name} power play`);
  }

  function setFaceoff(x, y, note, noChangeTeam) {
    game.faceoff = { x, y }; game.faceT = PH.game.faceoffPauseSec; game.note = note;
    teams.forEach(q => q.players.forEach(p => { p.trail = null; })); puck.trail = null;
    if (note !== 'Faceoff') blowWhistle(note);
    puck.carrier = null; puck.vx = puck.vy = 0; puck.x = x; puck.y = y; puck.shot = false; puck.touched = true; puck.releaseTeam = null; puck.receiver = null; puck.oneTimer = false; puck.holdT = 0; puck.lastHolder = null; puck.rim = false; puck.beaten = false; puck.sinceSave = 99; teams.forEach(q => { q.possT = 0; q.sinceEntry = 99; q.wasOff = false; });
    // line changes at the stoppage: visitors first, then the home team (which may match lines); the icing team cannot change
    [teams[1], teams[0]].forEach(t => { if (t !== noChangeTeam) stoppageChange(t, false); else { [...t.onF, ...t.onD].forEach(p => { p.leaving = false; p.entering = false; p.subOn = false; p.sub = null; }); rebuildOnIce(t); } });
    if (noChangeTeam !== teams[0]) matchLines(teams[0], teams[1], x);
    teams.forEach(t => {
      t.inZone = toFx(t, x) > 114; t.delayed = false;
      const back = -t.dir;
      const spots = { C: [x + back * 1.5, y], LW: [x + back * 4, y - 14 * t.dir], RW: [x + back * 4, y + 14 * t.dir], LD: [x + back * 20, y - 10], RD: [x + back * 20, y + 10] };
      t.players.forEach(p => {
        if (p.goalie) { const n = ownNet(t); p.x = n.x + t.dir * 2.5; p.y = n.y; }
        else { const s = spots[p.role]; p.x = clamp(s[0], 4, RW - 4); p.y = clamp(s[1], 4, RH - 4); }
        p.vx = p.vy = 0;
      });
    });
  }

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

  // ---------- Formations ----------
  function formationSpot(t, p, pz, situation) {
    const tac = t.tac; const pfx = toFx(t, puck.x), pfy = puck.y;
    let fx, fy;
    if (situation === 'offense') {
      if (pz === 'own') {
        [fx, fy] = SYS.breakout[tac.brk].spots[p.role];
        // Once we have clean possession the forwards go: each one leaves his support spot and skates
        // north ahead of the puck, timing the burst so he takes the pass in stride.
        const FL = SYS.breakout.flow; const c = puck.carrier;
        if (c && c.team === t && !p.isD && p !== c && (t.possT || 0) > FL.startAfterSec) {
          const k = clamp(((t.possT || 0) - FL.startAfterSec) / FL.rampSec, 0, 1);
          const ahead = p.role === 'C' ? FL.centerAheadFt : FL.wingAheadFt;
          const goFx = Math.min(FL.maxFx, pfx + ahead);
          if (goFx > fx) { fx = fx + (goFx - fx) * k; fy = p.role === 'C' ? 42 : (p.role === 'RW' ? 73 : 12); }
        }
      } else if (pz === 'neutral') {
        const NA = SYS.neutralAttack; const weak = pfy < 42 ? 'RW' : 'LW';
        const leadFx = Math.min(NA.leadMaxFx, pfx + NA.leadAhead);
        if (p.role === weak) [fx, fy] = [leadFx, weak === 'RW' ? 73 : 12];
        else if (p.role === 'LW' || p.role === 'RW') [fx, fy] = [Math.min(NA.leadMaxFx + 2, pfx + NA.wingAhead), p.role === 'RW' ? 76 : 9];
        else if (p.role === 'C') [fx, fy] = [Math.min(NA.leadMaxFx, pfx + NA.centerAhead), 42];
        else [fx, fy] = [pfx - NA.dTrail, p.role === 'LD' ? 28 : 57];
      } else if (onPP(t)) {
        const PPF = SYS.powerPlay[tac.pp]; [fx, fy] = PPF.spots[p.role];
        if (PPF.mirrorToPuckSide && pfy > 42) fy = 85 - fy;
        // keep moving off the puck: small drifts along the wall and across the slot so a lane opens
        const ph = { LW: 0, RW: 2.1, C: 4.2, LD: 1.0, RD: 3.1 }[p.role] || 0; const tt = game.period * 1200 - game.clock;
        if (drift) { fy += 4 * DM.sin(tt * 1.1 + ph); fx += 3 * DM.sin(tt * 0.7 + ph); }
      } else {
        const OZ = SYS.offensiveZone[tac.oz]; const M = SYS.offensiveZone.motion;
        let role = p.role;
        // the cycle rotates: corner, half wall and net front are passed along every few seconds so the puck side keeps moving
        if (OZ.cycleOrder && !p.isD) { const i = OZ.cycleOrder.indexOf(role); if (i >= 0) role = OZ.cycleOrder[(i + Math.floor((t.possT || 0) / M.cycleEverySec)) % OZ.cycleOrder.length]; }
        [fx, fy] = OZ.spots[role];
        if (OZ.mirrorToPuckSide && pfy > 42) fy = 85 - fy;
        // nobody stands still: small drifts along the wall and across the slot so a lane opens
        const ph = { LW: 0, RW: 2.1, C: 4.2, LD: 1.0, RD: 3.1 }[p.role] || 0; const tt = game.period * 1200 - game.clock;
        if (drift) { fy += M.driftFt * DM.sin(tt * 1.1 + ph); fx += M.driftFt * 0.75 * DM.sin(tt * 0.7 + ph); }
      }
    } else if (situation === 'defense') {
      // shorthanded, the forecheck is the penalty kill's: one man pressures, the rest hold the middle and the blue line
      const FC = shorthanded(t) && !onPP(t) ? SYS.penaltyKill.forecheck : SYS.forecheck[tac.fore];
      if (pz === 'off') {
        const s = FC.inZone[p.role]; if (!s) return null; [fx, fy] = s;
      } else if (pz === 'neutral') {
        const s = FC.neutral[p.role]; if (!s) return null; [fx, fy] = [pfx + s[0], s[1]];
      } else if (shorthanded(t) && !onPP(t)) {
        const s = pkSlot(t, p, SYS.penaltyKill[tac.pk].slots); [fx, fy] = s;
      } else if (tac.dz === 'man') {
        const mark = manMark(t, p);
        // between his man and the net, with more cushion the farther his man is from it, so a cut to the net runs into him
        if (mark) { const MC = SYS.defensiveZone.man, n = ownNet(t); const d = dist(mark, n) || 1; const k = Math.min(clamp(d * MC.cushionPerFt, MC.minCushionFt, MC.maxCushionFt), d * 0.6); return { x: mark.x + (n.x - mark.x) / d * k, y: mark.y + (n.y - mark.y) / d * k }; }
        [fx, fy] = [10, 42];
      } else {
        const strong = pfy < 42;
        [fx, fy] = SYS.defensiveZone.zone.spots[p.role];
        if (p.isD) { const ZD = SYS.defensiveZone.zone.dSpread; const off = (p.role === 'LD') === strong ? ZD.strongSideFt : ZD.weakSideFt; fy = p.role === 'LD' ? 42.5 - off : 42.5 + off; }
        // the center owns the slot: he takes the most dangerous uncovered forward between the dots and plays goal-side of him
        if (p.role === 'C') {
          const opp = teams[1 - t.id];
          const slotMen = active(opp).filter(o => o !== puck.carrier && !o.isD).map(o => ({ o, fx: 178 - toFx(opp, o.x) })).filter(h => h.fx > 12 && h.fx < 42 && Math.abs(h.o.y - 42.5) < 18).sort((a, b) => a.fx - b.fx);
          if (slotMen.length) { const h = slotMen[0]; fx = clamp(h.fx - 3.5, 6, 40); fy = h.o.y + (h.o.y < 42.5 ? 1.5 : -1.5); }
        }
        if (pfx < 12) { if (p.role === (strong ? 'LD' : 'RD')) [fx, fy] = [4, strong ? 22 : 63]; }
        // defensemen box out the net-front man: whoever is parked in front gets a defender on his hip, goal-side
        if (p.isD) {
          const opp = teams[1 - t.id];
          const front = active(opp).filter(o => !o.isD && o !== t.pressurer).map(o => ({ o, fx: 178 - toFx(opp, o.x) })).filter(h => h.fx < 26 && Math.abs(h.o.y - 42.5) < 16).sort((a, b) => a.fx - b.fx)[0];
          if (front) {
            const other = active(t).find(q => q.isD && q !== p);
            const mine = !other || other === t.pressurer || Math.abs(other.y - front.o.y) > Math.abs(p.y - front.o.y);
            if (mine) { fx = clamp(front.fx - 2.5, 2.5, 20); fy = front.o.y + (front.o.y < 42.5 ? 2 : -2); }
          }
        }
        // wingers shade to the high opponent on their side (the point man or the half-wall shooter) and stay goal-side of him
        if (p.role === 'LW' || p.role === 'RW') {
          const opp = teams[1 - t.id]; const side = p.role === 'LW';
          const highs = active(opp).filter(o => o !== puck.carrier && (side ? o.y < 42 : o.y >= 42)).map(o => ({ o, fx: 178 - toFx(opp, o.x) })).filter(h => h.fx > 22 && h.fx < 70);
          if (highs.length) { const h = highs.sort((a, b) => a.fx - b.fx)[0]; fx = clamp(h.fx - 5, 18, 50); fy = clamp(h.o.y + (side ? 5 : -5), 8, 77); }
        }
        // the slot comes first: a defender assigned to a slot attacker plays on his hip, goal-side
        const cover = t.slotCover && t.slotCover.get(p);
        if (cover) { const SC = SYS.defensiveZone.zone.slotCoverage; fx = clamp(cover.fx - SC.goalSideFt, 3, SC.maxFx); fy = cover.o.y + (cover.o.y < 42.5 ? SC.insideFt : -SC.insideFt); }
      }
    } else {
      [fx, fy] = { LW: [pfx + 8, 14], RW: [pfx + 8, 71], C: [pfx, 42], LD: [pfx - 20, 28], RD: [pfx - 20, 57] }[p.role];
    }
    // gap control: a defenseman never lets an attacker get behind him while the other team has the puck
    if (p.isD && situation !== 'offense' && pz !== 'own') {
      const opp = teams[1 - t.id];
      let deepest = 999;
      for (const o of active(opp)) { const ofx = 178 - toFx(opp, o.x) - Math.max(0, -o.vx * t.dir) * 0.7; if (ofx < deepest) deepest = ofx; } // read the carrier's speed and back off early
      if (deepest < 999) fx = Math.min(fx, deepest - 9);
    }
    return toRink(t, clamp(fx, 4, 174), clamp(fy, 5, 80));
  }

  // ---------- AI ----------
  function nearestTo(list, pt) { let b = null, bd = 1e9; for (const p of list) { const d = dist(p, pt); if (d < bd) { bd = d; b = p; } } return b; }
  // nearest-first pairing of players to spots; `keep` (optional) is the current pairing and `stickFt` how much closer a new spot must be to switch
  function assign(players, spots, keep, stickFt) {
    const out = new Map(); const pairs = [];
    players.forEach(p => spots.forEach((s, i) => pairs.push([dist(p, s) - (keep && keep.get(p) === s ? stickFt : 0), p, i])));
    pairs.sort((a, b) => a[0] - b[0]);
    const used = new Set();
    for (const [, p, i] of pairs) { if (out.has(p) || used.has(i)) continue; out.set(p, spots[i]); used.add(i); }
    return out;
  }
  function pkSlot(t, p, slots) {
    const pts = slots.map(([fx, fy]) => toRink(t, fx, fy));
    const m = assign(active(t).filter(q => q !== t.pressurer), pts);
    const s = m.get(p) || pts[0];
    return [toFx(t, s.x), s.y];
  }
  // man-on-man: defensemen take the opposing forwards down low, forwards take the points (and any extra forward).
  // Everyone is marked, the puck carrier included: the man on the carrier is the one who pressures him, and nobody
  // else leaves his man to do it. Computed once per tick in assignTargets; manMark reads the result.
  const manMark = (t, p) => (t.marks && t.marks.get(p)) || null;
  function manMarks(t) {
    const opp = active(teams[1 - t.id]);
    const mine = active(t).filter(q => !q.leaving);
    const myD = mine.filter(q => q.isD), myF = mine.filter(q => !q.isD);
    const oppF = opp.filter(o => !o.isD), oppD = opp.filter(o => o.isD);
    // a defender keeps his man unless another is closer by more than stickFt, so marks do not swap every time two attackers cross
    const keep = t.marks, stick = SYS.defensiveZone.man.stickFt;
    const m1 = assign(myD, oppF, keep, stick);
    const taken = new Set(m1.values());
    const m2 = assign(myF, [...oppD, ...oppF.filter(o => !taken.has(o))], keep, stick);
    t.marks = new Map([...m1, ...m2]);
    return t.marks;
  }
  function leadForward(p, t) {
    let best = null, bf = -1;
    for (const m of active(t)) { if (m === p || m.leaving) continue; const fx = toFx(t, m.x); if (fx <= 114 && fx > bf && fx > toFx(t, p.x) + 6) { bf = fx; best = m; } }
    return best;
  }
  function chip(from, soft) {
    const t = from.team; const E = SYS.entry;
    // a dump is rimmed hard into the near corner so it wraps behind the net to the far side; a chip is a soft flip past the defender
    const target = toRink(t, soft ? E.chip.chipToFx : E.dump.dumpToFx, from.y < 42 ? (soft ? 10 : 2.5) : (soft ? 75 : 82.5));
    const a = DM.atan2(target.y - from.y, target.x - from.x) + rnd(-0.05, 0.05);
    const sp = soft ? E.chip.chipSpeedFtPerSec : E.dump.dumpSpeedFtPerSec;
    if (!soft) { t.dumpSide = from.y < 42 ? 'top' : 'bottom'; t.dumpT = 6; puck.rim = true; }
    puck.carrier = null; puck.vx = DM.cos(a) * sp; puck.vy = DM.sin(a) * sp; puck.lastTeam = t; puck.shot = false; puck.cool = 0.25; release(from);
  }
  // clear: under pressure in your own end, bang it off the boards up the near wall (or just flip it out on the kill)
  function clearPuck(from) {
    const t = from.team; const C = SYS.clearing;
    const target = toRink(t, C.aimFx, from.y < 42 ? 1.5 : 83.5);
    const a = DM.atan2(target.y - from.y, target.x - from.x) + rnd(-0.06, 0.06);
    const sp = C.speedFtPerSec * (0.85 + from.pass * 0.3);
    puck.carrier = null; puck.vx = DM.cos(a) * sp; puck.vy = DM.sin(a) * sp; puck.lastTeam = t; puck.shot = false; puck.cool = 0.25; release(from);
    puck.rim = true; puck.raceJudged = false; t.clears = (t.clears || 0) + 1;
  }
  // A penalty-kill clear down the ice: down the open lane closest to straight ahead, past the far goal line; with every
  // lane covered he lifts it over the sticks (nobody can touch it while it is in the air).
  function pkClear(from, opp) {
    const t = from.team, K = SYS.penaltyKill.clear;
    const lanes = K.laneYs.map(y => toRink(t, K.aimFx, y)).filter(g => laneClear(from, g, opp, K.laneWidthFt)).sort((a, b) => Math.abs(a.y - from.y) - Math.abs(b.y - from.y));
    const lift = !lanes.length, target = lift ? toRink(t, K.aimFx, 42.5) : lanes[0];
    const a = DM.atan2(target.y - from.y, target.x - from.x) + rnd(-K.aimSpreadRad, K.aimSpreadRad);
    const sp = K.speedFtPerSec * (0.9 + from.pass * 0.2);
    puck.carrier = null; puck.vx = DM.cos(a) * sp; puck.vy = DM.sin(a) * sp; puck.lastTeam = t; puck.shot = false; puck.receiver = null; puck.cool = lift ? K.liftSec : 0.25; release(from);
    puck.rim = Math.abs(target.y - 42.5) > 25; puck.raceJudged = false; t.clears = (t.clears || 0) + 1;
  }
  function laneClear(from, to, opp, width = 4) {
    const dx = to.x - from.x, dy = to.y - from.y, L = DM.hypot(dx, dy) || 1;
    for (const o of opp) {
      const t = clamp(((o.x - from.x) * dx + (o.y - from.y) * dy) / (L * L), 0, 1);
      const px = from.x + dx * t, py = from.y + dy * t;
      if (DM.hypot(o.x - px, o.y - py) < width && t > 0.08) return false;
    }
    return true;
  }
  function shotQuality(p, t) {
    const n = oppNet(t); const d = dist(p, n); const ang = Math.abs(DM.atan2(p.y - n.y, (n.x - p.x) * t.dir));
    if (toFx(t, p.x) > 178 || ang > 1.3) return 0;
    return clamp(1 - d / 75, 0, 1) * (1 - ang / 1.7);
  }

  function carrierThink(p, dt) {
    const t = p.team, opp = active(teams[1 - t.id]);
    const pz = zone(t, p.x);
    const pfx = toFx(t, p.x);
    const pressure = Math.min(...opp.map(o => dist(o, p)));
    const mates = active(t).filter(m => m !== p && !m.leaving);
    const agg = t.tac.agg;
    const pp = onPP(t);
    const q = shotQuality(p, t);
    if (pz === 'off' && q > 0) {
      const open = laneClear(p, oppNet(t), opp, 5.2) && pressure > 6;
      const SD = PH.shotDecision; const n = oppNet(t);
      // shoot or pass, by expected goals: my look now (worth less with a defender in the lane) against the best pass,
      // which is the receiver's look times the chance the pass gets there and he is still open when it does
      const XC = SD.xgChoice, read = readLook(p, t, opp, mates, pressure);
      if (read) {
        const { myV, best, bestV } = read;
        if (myV >= XC.minXg && myV * XC.passMustBeatBy >= bestV) {
          const rate = XC.shootRatePerSec * clamp((myV - XC.minXg) / (XC.cleanXg - XC.minXg), 0.15, 1);
          if (Math.random() < dt * rate) { shoot(p); return null; }
          p.lookingToShoot = true;
        } else if (best && bestV > myV * XC.passMustBeatBy && bestV >= XC.minXg && (puck.holdT || 0) >= PH.pass.controlSec && Math.random() < dt * XC.passRatePerSec) { pass(p, best); return null; }
      }
      const PE = SD.perimeter; const dNet = dist(p, n);
      const throughTraffic = laneClear(p, n, opp, 2.2) && pressure > 4; // a body in the lane is fine, a stick on the puck is not
      if (throughTraffic && dNet >= PE.minDistFt && dNet <= PE.maxDistFt && q > 0.05 && Math.random() < dt * PE.ratePerSec * cfg.shots) { shoot(p); return null; }
      const PR = SD.probabilistic, PS = SD.pointShot;
      const pointShot = p.isD || toFx(t, p.x) < 135;
      const rate = cfg.shots * PR.baseRate * (DM.pow(q, PR.qualityPower) * (0.9 + agg * PR.aggressionWeight) * (0.6 + p.shoot * PR.shooterWeight) + (open && q > PR.openLookMinQuality ? PR.openLookBonus : 0) + (pressure < PR.pressureWithinFt ? PR.pressureBonus * q : 0)) + (pointShot && q > PS.minQuality ? PS.baseRate + (open ? PS.openBonus : 0) : 0);
      if (Math.random() < dt * rate) { shoot(p); return null; }
    }
    // a skater heading for a change gets the puck deep and goes: dump and change
    if (p.leaving && pz !== 'off') {
      if (pfx > 90) { chip(p, false); return null; }
      const m = nearestTo(mates.filter(x => laneClear(p, x, opp)), p); if (m) { pass(p, m); return null; }
    }
    // breakaway: nobody between the carrier and the net
    // an opponent counts as goal-side unless he is clearly behind the carrier; a wide opponent needs a bigger head start to be beaten
    const BA = PH.shotDecision.breakaway;
    const oppAhead = opp.filter(o => 178 - toFx(teams[1 - t.id], o.x) > pfx - BA.behindByFt - Math.max(0, Math.abs(o.y - p.y) - BA.wideAllowanceFt) * 0.6);
    const headedIn = p.vx * t.dir > 8;
    if ((p.breakaway || (pfx > 92 && pfx < 106 && headedIn)) && oppAhead.length === 0 && pz !== 'own' && pfx < 172) {
      if (!p.breakaway) { p.breakaway = true; game.note = `Breakaway, ${p.name}!`; log(`Breakaway: ${t.abbr} #${p.num} ${p.name} is in alone.`); }
      const n = oppNet(t); const dn = dist(p, n);
      if (dn < 16 + p.shoot * 8 && Math.random() < dt * 6) { shoot(p); return null; }
      return { x: n.x - t.dir * 5, y: n.y + (p.y < 42 ? -2 : 2) };
    }
    p.breakaway = false;
    // the penalty kill: there is no icing while shorthanded, so the first job with the puck in our end or the neutral zone
    // is to send it the length of the ice and make the power play go back for it. Only a real shorthanded rush keeps it.
    if (shorthanded(t) && !pp && pz !== 'off') {
      const K = SYS.penaltyKill.clear;
      const back = opp.filter(o => toFx(t, o.x) > pfx).length, up = 1 + mates.filter(m => toFx(t, m.x) > pfx - K.rushTrailFt).length;
      const rush = pz === 'neutral' && p.vx * t.dir > K.rushMinSpeedFtPerSec && up > back;
      if (!rush) { if (Math.random() < dt * K.ratePerSec) { pkClear(p, opp); return null; } return { x: p.x, y: p.y }; }
    }
    // a teammate with a step on the last defender: spring him
    if (pz !== 'off') {
      const lastD = Math.max(...opp.map(o => 178 - toFx(teams[1 - t.id], o.x)), 0);
      const sprung = lastD < 112 ? mates.filter(m => !m.leaving && toFx(t, m.x) <= 114 && toFx(t, m.x) >= lastD + 2 && toFx(t, m.x) > pfx + 8 && laneClear(p, m, opp) && dist(p, m) < 90) : [];
      if (sprung.length && Math.random() < dt * 3) { pass(p, sprung.sort((a, b) => toFx(t, b.x) - toFx(t, a.x))[0]); return null; }
    }
    if (pz === 'neutral') {
      const offsideMate = mates.some(m => toFx(t, m.x) > 113.5);
      const lead = leadForward(p, t);
      const entry = t.tac.entry;
      const defenderAhead = opp.some(o => toFx(t, o.x) > pfx && toFx(t, o.x) < pfx + 14 && Math.abs(o.y - p.y) < 10);
      if (!offsideMate) {
        const standingUp = opp.some(o => { const ofx = 178 - toFx(teams[1 - t.id], o.x); return ofx > pfx && ofx < pfx + 22 && Math.abs(o.y - p.y) < 16; });
        if (entry === 'chip' && pfx > SYS.entry.chip.chipFromFx && (standingUp || pfx > 110)) { chip(p, true); p.team.chips = (p.team.chips || 0) + 1; return null; }
        // dump only from the dump window, and only when a defender is standing up at the line; a carrier who is already clear carries it in
        if (entry === 'dump' && pfx > SYS.entry.dump.dumpFromFx && pfx < SYS.entry.dump.dumpUntilFx && standingUp && !(t.dumpT > 0)) { chip(p, false); return null; }
        if (lead && laneClear(p, lead, opp) && dist(p, lead) < 75 && (entry === 'headman' || pressure < 9 || toFx(t, lead.x) > pfx + 22)) { pass(p, lead); return null; }
        if (pressure < SYS.entry.bailOutPressureFt && pfx > SYS.entry.dump.dumpFromFx) { chip(p, false); return null; }
        if (pressure < 6) { const m = nearestTo(mates.filter(x => laneClear(p, x, opp)), p); if (m) { pass(p, m); return null; } }
        return toRink(t, SYS.entry.carry.driveFx, p.y < 42 ? 10 : 75);
      }
      if (pressure < 6) { const m = nearestTo(mates.filter(x => toFx(t, x.x) < pfx && laneClear(p, x, opp)), p); if (m) { pass(p, m); return null; } }
      return toRink(t, Math.min(pfx, 108), p.y < 42 ? 20 : 65);
    }
    const stuck = (puck.holdT || 0) > PH.shotDecision.stuckAfterSec; // held too long with no clean option
    if (stuck && pz === 'off') {
      // looser lane for the pass, then a shot through bodies, then walk the puck toward the middle to change the angle
      const deep = mates.filter(m => toFx(t, m.x) > 124);
      const loose = deep.filter(m => laneClear(p, m, opp, 2.4) && dist(p, m) > 6).sort((a, b) => shotQuality(b, t) - shotQuality(a, t));
      if (loose.length && Math.random() < dt * 2) { pass(p, loose[0]); return null; }
      if (q > 0.15 && laneClear(p, oppNet(t), opp, 1.6) && Math.random() < dt * PH.shotDecision.stuckShotRatePerSec) { shoot(p); return null; }
      const n2 = oppNet(t); const towardMid = { x: p.x + (n2.x - p.x) * 0.25, y: p.y + (n2.y - p.y) * 0.35 };
      if (deep.length && Math.random() < dt * 2) { pass(p, deep.sort((a, b) => dist(a, p) - dist(b, p))[0]); return null; } // or just give it to the nearest man and reset
      return towardMid;
    }
    // a carrier with a shot worth taking does not look around for a pass unless a stick is on him
    const holding = p.lookingToShoot && pressure > PH.shotDecision.xgChoice.passUnderPressureFt; p.lookingToShoot = false;
    const W = PH.pass.want;
    // in the offensive zone a pass has to be settled before the next one: no discretionary pass within controlSec of getting the puck
    const wantPass = !holding && (pz !== 'off' || (puck.holdT || 0) >= PH.pass.controlSec) && (pressure < W.pressureFt + agg * W.pressurePerAggressionFt || Math.random() < dt * (pp ? W.powerPlayRatePerSec : W.ratePerSec) * (0.5 + p.pass));
    if (wantPass) {
      let best = null, bs = -1;
      for (const m of mates) {
        if (!laneClear(p, m, opp)) continue;
        if (pfx < 89 && dist(p, m) > 75) continue; // a missed bomb from behind the red line is an icing
        const prog = (toFx(t, m.x) - pfx);
        const open = Math.min(...opp.map(o => dist(o, m)));
        const sq = shotQuality(m, t) * (0.6 + m.shoot * 0.8);
        const score = open * 0.6 + prog * (pz === 'off' ? 0.15 : 0.45) + (open > 6 ? sq * 8 : 0) - dist(p, m) * 0.1;
        if (score > bs && dist(p, m) > 6) { bs = score; best = m; }
      }
      if (best && (pressure < 7 || bs > 12)) { pass(p, best); return null; }
    }
    if (pz === 'own') {
      const C = SYS.clearing; const pk = shorthanded(t) && !onPP(t);
      // A gassed unit gets it out like a penalty kill does: off the glass and go change.
      const gassed = [...t.onF, ...t.onD].some(q => q.shift > SYS.deployment.changeWindows.desperateAfterSec);
      if ((pressure < C.pressureFt || (pk && pressure < C.pkPressureFt) || (gassed && pressure < C.gassedPressureFt)) && Math.random() < dt * C.ratePerSec) { clearPuck(p); return null; }
      const n = ownNet(t);
      if (dist(p, n) < 10 && t.tac.brk !== 'reverse') return toRink(t, 40, p.y < 42 ? 12 : 73);
      return toRink(t, Math.max(pfx + 25, 40), p.y < 42 ? 14 : 71);
    }
    const net = oppNet(t);
    if (laneClear(p, net, opp, 6) && q > 0.5 && pressure > 10 && dist(p, net) < 40) return { x: net.x - t.dir * 6, y: net.y + (p.y < 42 ? -3 : 3) };
    const f = formationSpot(t, p, 'off', 'offense');
    if (f && toFx(t, f.x) < 120) return toRink(t, 122, f.y);
    return f || net;
  }

  function pass(from, to) {
    // lead the receiver: solve roughly for where he will be when the puck arrives
    let sp = clamp(PH.pass.speedBaseFtPerSec + dist(from, to) * PH.pass.speedPerFt, PH.pass.minFtPerSec, PH.pass.maxFtPerSec) * cfg.passSpd;
    let lead = { x: to.x, y: to.y };
    for (let i = 0; i < 3; i++) { const tArr = dist(from, lead) / sp; lead = { x: to.x + to.vx * tArr * 0.9, y: to.y + to.vy * tArr * 0.9 }; }
    const d = dist(from, lead) || 1;
    const err = ((1 - from.pass) * PH.pass.errorPerPassDeficit + d * PH.pass.errorPerFt) * (from.rushed > 0 ? 2.2 : 1) * hands(from) / cfg.passAcc; // long passes are harder to hit; a hurried one is worse
    const a = DM.atan2(lead.y - from.y, lead.x - from.x) + rnd(-err, err);
    puck.carrier = null; puck.vx = DM.cos(a) * sp; puck.vy = DM.sin(a) * sp; puck.lastTeam = from.team; puck.shot = false; puck.cool = 0.25; release(from);
    puck.receiver = to; puck.reached = new Set();
    // a pass into the slot is a one-timer if the receiver has a look
    // one-timer: a cross-ice pass to an open man in the slot
    const oppAll = active(teams[1 - from.team.id]);
    puck.oneTimer = zone(from.team, to.x) === 'off' && shotQuality(to, from.team) > 0.45 && Math.abs(to.y - from.y) > 14 && Math.min(...oppAll.map(o => dist(o, to))) > 7;
  }
  // Expected goals of a shot from where p stands now: the same context shoot() records (type, rebound, strength),
  // times the shooter's finishing. Used to score the shot itself and to decide between shooting and passing.
  function lookXg(p, t, oneTimer) {
    const n = oppNet(t), dN = dist(p, n);
    if (toFx(t, p.x) > 178) return 0;
    const slap = p.isD || dN > 45;
    const angleDeg = Math.abs(DM.atan2(p.y - n.y, (n.x - p.x) * t.dir)) * 180 / Math.PI;
    const ctx = { type: slap ? 'SLAP' : (oneTimer ? 'SNAP' : 'WRIST'), rebound: puck.sinceSave < PH.shot.xg.reboundWithinSec, pp: onPP(t), sh: shorthanded(t) && !onPP(t) };
    const base = xgModel(dN, angleDeg, ctx);
    return base === null ? null : { base, xg: clamp(base * p.finishing, 0.005, 0.9) };
  }
  // The carrier's read in the offensive zone: his own look (worse with a defender in the lane or on him) and the best
  // pass (the receiver's look times the chance the pass gets there). carrierThink decides with it; the sight lines draw it.
  function readLook(p, t, opp, mates, pressure) {
    const XC = PH.shotDecision.xgChoice, n = oppNet(t), mine = lookXg(p, t, false);
    if (!mine) return null;
    const myV = mine.xg * (laneClear(p, n, opp, XC.laneWidthFt) ? 1 : XC.blockedLaneFactor) * (pressure < XC.tightCoverFt ? XC.tightCoverFactor : 1);
    let best = null, bestV = 0;
    for (const m of mates) {
      if (zone(t, m.x) !== 'off' || !laneClear(p, m, opp)) continue;
      const room = Math.min(...opp.map(o => dist(o, m))), d = dist(p, m);
      const look = lookXg(m, t, Math.abs(m.y - p.y) > XC.oneTimerCrossFt && room > XC.openFt);
      if (!look) continue;
      const v = look.xg * clamp(XC.passCompleteBase - d * XC.passCompletePerFt, XC.passCompleteMin, 1) * (room > XC.openFt ? 1 : XC.coveredFactor);
      if (v > bestV) { bestV = v; best = m; }
    }
    return { myV, best, bestV };
  }
  function shoot(from, oneTimer) {
    const t = from.team, n = oppNet(t);
    const aimY = n.y + rnd(-PH.shot.aimSpreadFt, PH.shot.aimSpreadFt);
    const slap = from.isD || dist(from, n) > 45; // point shots are slap or heavy wrist shots: faster, less accurate
    const err = ((oneTimer ? PH.shot.oneTimerExtraError : 0) + (1 - from.shoot) * PH.shot.errorPerShootDeficit + dist(from, n) * PH.shot.errorPerFt + (slap ? PH.shot.slap.extraError : 0)) * hands(from);
    const a = DM.atan2(aimY - from.y, n.x - from.x) + rnd(-err, err);
    const sp = slap ? PH.shot.slap.baseFtPerSec + from.shoot * PH.shot.slap.perShootRating : PH.shot.wrist.baseFtPerSec + from.shoot * PH.shot.wrist.perShootRating;
    puck.carrier = null; puck.vx = DM.cos(a) * sp; puck.vy = DM.sin(a) * sp; puck.lastTeam = t; puck.shot = true; puck.shooter = from; puck.cool = 0.25; puck.beaten = false; release(from);
    const tGoal = (n.x - from.x) / (puck.vx || 1e-6); puck.onNet = tGoal > 0 && Math.abs(from.y + puck.vy * tGoal - n.y) < NETW / 2; // would it hit the net if nothing touched it?
    t.attempts++;
    // expected goals from the shot's geometry and context (rebound, rush, strength, shot type), then the shooter's finishing;
    // the danger tier follows MoneyPuck's xG thresholds. Counted on unblocked attempts.
    const dN = dist(from, n), offY = Math.abs(from.y - n.y);
    const look = lookXg(from, t, oneTimer);
    if (look !== null) { puck.tier = xgTier(look.base); puck.xg = look.xg; }
    else { const TG = PH.dangerTiers; puck.tier = (dN <= TG.high.maxDistFt && offY <= TG.high.maxOffCenterFt) ? 'high' : (dN <= TG.medium.maxDistFt && offY <= TG.medium.maxOffCenterFt) ? 'medium' : 'low'; puck.xg = MP ? MP.league.dangerTiers[puck.tier].goalRate : 0.07; }
    puck.tierCounted = false;
    // shot block: a defender in the lane, close to the shooter, gets in front of it
    const ot = teams[1 - t.id];
    const dx = DM.cos(a), dy = DM.sin(a); const L = dist(from, n);
        for (const o of active(ot)) {
      const along = (o.x - from.x) * dx + (o.y - from.y) * dy;
      if (along < 2 || along > L * PH.shotBlock.laneFraction) continue;
      const off = Math.abs(-(o.x - from.x) * dy + (o.y - from.y) * dx);
      const reach = PH.shotBlock.laneHalfWidthFt + (along < PH.shotBlock.closeWithinFt ? PH.shotBlock.closeBonusFt : 0); // a defender right on the shooter covers more of the lane
      if (off < reach && Math.random() < PH.shotBlock.probBase + o.def * PH.shotBlock.probPerDef) {
        ot.blocked++; puck.shot = false; puck.touched = true; puck.lastTeam = ot; puck.cool = 0.2; emit('fx', 'ring', { x: o.x, y: o.y, col: '#222', big: false });
        puck.x = o.x + dx * 1.5; puck.y = o.y + dy * 1.5;
        const ra = DM.atan2(-dy, -dx) + rnd(-1.1, 1.1); const rs = rnd(12, 28);
        puck.vx = DM.cos(ra) * rs; puck.vy = DM.sin(ra) * rs;
        o.blocks = (o.blocks || 0) + 1;
        break;
      }
    }
  }

  function assignTargets(dt) {
    // a pass on its way to a teammate is still that team's puck: both sides keep their structure and the defense
    // plays the receiver, instead of everyone treating it as a loose puck for the length of the pass
    const inFlight = !puck.carrier && !puck.shot && puck.receiver && puck.receiver.onIce && !puck.receiver.box && !puck.receiver.leaving && puck.lastTeam === puck.receiver.team;
    const carrier = puck.carrier || (inFlight ? puck.receiver : null);
    const loose = !carrier;
    for (const t of teams) {
      const opp = teams[1 - t.id];
      const sk = active(t).filter(p => !p.leaving || p === carrier);
      const situation = loose ? 'loose' : carrier.team === t ? 'offense' : 'defense';
      const pz = zone(t, puck.x);
      const attacking = (loose ? puck.lastTeam : carrier.team) === t;
      const holdLine = attacking && pz !== 'off';
      const onside = tg => holdLine && toFx(t, tg.x) > 106 ? toRink(t, 106, tg.y) : tg;
      let chaser = null, chaser2 = null;
      if (loose) chaser = (puck.receiver && puck.receiver.team === t && puck.receiver.onIce && !puck.receiver.box && puck.lastTeam === t) ? puck.receiver : nearestTo(sk, puck);
      if (situation === 'defense') {
        chaser = nearestTo(sk, carrier);
        const pk = shorthanded(t) && !onPP(t);
        if (!pk && pz === 'own' && t.tac.dz === 'man') { for (const [d, a] of manMarks(t)) if (a === carrier) chaser = d; } else t.marks = null;
        if (pk && pz === 'own' && !SYS.penaltyKill[t.tac.pk].pressure && !(toFx(t, carrier.x) < 40 && Math.abs(carrier.y - 42.5) < 16)) chaser = null;
        if (!pk && SYS.forecheck[t.tac.fore].secondChaser && pz === 'off') chaser2 = nearestTo(sk.filter(p => p !== chaser), carrier);
      }
      t.pressurer = chaser; t.fronter = null;
      // front the shot: in our zone the nearest free defender steps into the carrier's shooting lane
      let fronter = null;
      if (situation === 'defense' && pz === 'own' && !t.marks && shotQuality(carrier, opp) > 0.35) { // man coverage has no fronter: everyone is on his man
        // the center stays home on the slot man if there is one; otherwise anyone can front the shot
        const slotThreat = active(opp).some(o => o !== carrier && !o.isD && 178 - toFx(opp, o.x) < 42 && Math.abs(o.y - 42.5) < 18);
        fronter = nearestTo(sk.filter(p => p !== chaser && p !== chaser2 && !(slotThreat && p.role === 'C')), carrier);
      }
      t.fronter = fronter;
      // protect the slot: in zone coverage every attacker in the slot gets the nearest free defender, the most dangerous first
      const prevCover = t.slotCover; t.slotCover = null;
      if (situation === 'defense' && pz === 'own' && t.tac.dz !== 'man' && !(shorthanded(t) && !onPP(t))) {
        const SC = SYS.defensiveZone.zone.slotCoverage;
        const threats = active(opp).filter(o => o !== carrier).map(o => ({ o, fx: 178 - toFx(opp, o.x) })).filter(h => h.fx > 3 && h.fx < SC.maxFx && Math.abs(h.o.y - 42.5) < SC.halfWidthFt).sort((a, b) => a.fx - b.fx);
        let free = sk.filter(p => p !== chaser && p !== chaser2 && p !== fronter && !p.leaving);
        for (const h of threats) {
          // the defender already on this man keeps him unless another free one is closer by more than stickFt
          let d = nearestTo(free, h.o);
          const had = prevCover && [...prevCover].find(([q, ph]) => ph.o === h.o && free.includes(q));
          if (had && d && dist(had[0], h.o) - SC.stickFt < dist(d, h.o)) d = had[0];
          if (!d) break;
          (t.slotCover = t.slotCover || new Map()).set(d, h); free = free.filter(p => p !== d);
        }
      }
      for (const p of active(t)) {
        if (p === carrier && inFlight) { // meet the pass: the point on the puck's path he can reach
          const vv = puck.vx * puck.vx + puck.vy * puck.vy || 1; const tau = clamp(((p.x - puck.x) * puck.vx + (p.y - puck.y) * puck.vy) / vv, 0, 1.5);
          p.target = onside({ x: puck.x + puck.vx * tau, y: puck.y + puck.vy * tau }); continue;
        }
        if (p === carrier) { p.target = carrierThink(p, dt); continue; }
        if (p.leaving) { const door = doorFor(t, p); p.target = { x: door + (p.x < door ? -1.5 : 1.5), y: 1.5 }; continue; }
        if (t.dumpT > 0 && loose && attacking && !p.isD && p !== chaser) { // dump and chase: the far-side forward sprints for the far corner where the rim arrives
          const farY = t.dumpSide === 'top' ? 78 : 7; if ((p.role === 'RW') === (t.dumpSide === 'top')) { const corner = toRink(t, 170, farY); p.target = onside(dist(puck, corner) < 30 ? { x: puck.x + puck.vx * 0.25, y: puck.y + puck.vy * 0.25 } : corner); p.sprint = true; continue; }
        }
        if (attacking && pz !== 'off' && toFx(t, p.x) > 113) { p.target = toRink(t, 109, p.y); continue; }
        if (attacking && t.delayed) { p.target = toRink(t, 109, p.y); continue; }
        if (p === chaser) {
          if (loose && puck.receiver === p) { // meet the pass: the point on the puck's path he can reach
            const vv = puck.vx * puck.vx + puck.vy * puck.vy || 1; const tau = clamp(((p.x - puck.x) * puck.vx + (p.y - puck.y) * puck.vy) / vv, 0, 1.5);
            p.target = onside({ x: puck.x + puck.vx * tau, y: puck.y + puck.vy * tau }); continue;
          }
          p.target = onside(loose ? { x: puck.x + puck.vx * 0.3, y: puck.y + puck.vy * 0.3 } : { x: carrier.x + carrier.vx * 0.25, y: carrier.y + carrier.vy * 0.25 }); continue;
        }
        if (p === chaser2) { p.target = { x: carrier.x - carrier.vx * 0.3 + t.dir * -6, y: carrier.y + (carrier.y < 42 ? 8 : -8) }; continue; }
        if (p === fronter) { const n = ownNet(t); const d = dist(carrier, n) || 1; const k = Math.min(9, d * 0.45); p.target = { x: carrier.x + (n.x - carrier.x) / d * k, y: carrier.y + (n.y - carrier.y) / d * k }; continue; }
        let f = formationSpot(t, p, pz, situation);
        if (!f) f = { x: carrier.x - t.dir * 10, y: carrier.y };
        if (situation === 'offense' && pz === 'off') {
          const o = nearestTo(opp.players, f); if (o && dist(o, f) < 5) f = { x: f.x, y: clamp(f.y + (f.y < o.y ? -6 : 6), 5, 80) };
        }
        p.target = onside(f);
      }
      const g = t.goalie, n = ownNet(t);
      const ang = DM.atan2(puck.y - n.y, (puck.x - n.x) * t.dir);
      const depth = puck.carrier && puck.carrier.team === t ? 1.5 : clamp(4 - Math.abs(ang) * 2.5, 1, 4);
      g.target = { x: n.x + t.dir * depth, y: clamp(n.y + DM.sin(ang) * depth * 1.4, n.y - 4.5, n.y + 4.5) };
    }
  }

  // Fatigue 0..1 from time on ice this shift: nothing until startsAt, full at fullAt.
  const fatigueLevel = p => p.goalie ? 0 : clamp((p.shift - PH.skater.fatigue.startsAtShiftSec) / (PH.skater.fatigue.fullAtShiftSec - PH.skater.fatigue.startsAtShiftSec), 0, 1);
  const fatigue = p => 1 - PH.skater.fatigue.maxSlowdown * fatigueLevel(p);
  const hands = p => 1 + PH.skater.fatigue.handsPenalty * fatigueLevel(p);
  function movePlayers(dt) {
    const all = teams.flatMap(t => t.players).filter(p => !p.box);
    for (const p of all) {
      const tg = p.target || p;
      const dx = tg.x - p.x, dy = tg.y - p.y, d = DM.hypot(dx, dy);
      // effort: full speed only when chasing, rushing or far from the spot; otherwise cruise at ~65% (EDGE: bursts over 20 mph are a handful per shift)
      const ours = puck.carrier && puck.carrier.team === p.team;
      const breakingOut = ours && zone(p.team, puck.carrier.x) === 'own' && (p.team.possT || 0) > SYS.breakout.flow.startAfterSec && !p.leaving;
      const rush = p === puck.carrier && (zone(p.team, p.x) === 'neutral' || breakingOut) && !p.leaving;
      const onRush = ours && zone(p.team, puck.carrier.x) === 'neutral' && puck.carrier.vx * p.team.dir > 4 && !p.leaving;
      const burst = (breakingOut || onRush) && !p.isD && p !== puck.carrier;
      // back-check: caught above the puck while the other team has it (or it is loose and heading our way) means sprint
      const theirs = puck.carrier ? puck.carrier.team !== p.team : puck.lastTeam && puck.lastTeam !== p.team;
      const caughtUpIce = theirs && toFx(p.team, p.x) > toFx(p.team, puck.x) - 12 && zone(p.team, puck.x) !== 'off';
      // a rimmed dump: the defending retriever has to turn, read the rim and go; the chasing forward is already flying
      const retrievingRim = puck.rim && !puck.carrier && puck.lastTeam && puck.lastTeam !== p.team && (p.team.rimT || 0) < 1.1;
      // defending our own zone (a pass between two attackers counts) a defender works to his spot, which is usually a man
      const holder = puck.carrier || (!puck.shot && puck.receiver && puck.lastTeam === puck.receiver.team ? puck.receiver : null);
      const defendingHome = holder && holder.team !== p.team && zone(p.team, puck.x) === 'own' && d > PH.skater.effort.defendOwnZoneUrgentBeyondFt;
      const urgent = !retrievingRim && (rush || burst || p.sprint || p === p.team.pressurer || p === p.team.fronter || caughtUpIce || defendingHome || (!puck.carrier && d > 40));
      const max = p.goalie ? p.spd : p.spd * cfg.speed * fatigue(p) * (p === puck.carrier ? PH.skater.effort.carrierFactor : 1) * (urgent ? 1 : Math.min(1, (p === puck.carrier || p.leaving || d > 30 ? PH.skater.effort.withPurpose : PH.skater.effort.cruise) * cfg.cruise));
      const want = d < 0.8 ? 0 : Math.min(max, Math.sqrt(2 * PH.skater.brakingFtPerSec2 * (p.goalie ? 1 : cfg.accel) * d));
      const ax = (d ? dx / d : 0) * want - p.vx, ay = (d ? dy / d : 0) * want - p.vy;
      const am = DM.hypot(ax, ay), acc = (p.goalie ? PH.goalie.accelFtPerSec2 : PH.skater.accelFtPerSec2 * cfg.accel * (1 - PH.skater.fatigue.accelSlowdown * fatigueLevel(p))) * dt;
      if (am > acc) { p.vx += ax / am * acc; p.vy += ay / am * acc; } else { p.vx += ax; p.vy += ay; }
      for (const o of all) if (o !== p && !o.goalie && !p.goalie) { const dd = dist(p, o); if (dd < 3 && dd > 0) { p.vx += (p.x - o.x) / dd * 8 * dt; p.vy += (p.y - o.y) / dd * 8 * dt; } }
      p.x += p.vx * dt; p.y += p.vy * dt; p.dist = (p.dist || 0) + DM.hypot(p.vx, p.vy) * dt; const spd = DM.hypot(p.vx, p.vy); if (spd > p.topSpd) p.topSpd = spd; if (spd > 29.3 && !p.burst) { p.bursts = (p.bursts || 0) + 1; p.burst = true; } if (spd < 26) p.burst = false;
      keepOnIce(p, p.leaving ? 1.0 : 1.5); if (!p.goalie) keepOffNets(p, 1.6);
    }
  }

  function keepOffNets(o, r) {
    for (const [x0, x1] of [[GL - NETD, GL], [RW - GL, RW - GL + NETD]]) {
      const y0 = RH / 2 - NETW / 2, y1 = RH / 2 + NETW / 2;
      if (o.x > x0 - r && o.x < x1 + r && o.y > y0 - r && o.y < y1 + r) {
        const push = [[o.x - (x0 - r), -1, 0], [(x1 + r) - o.x, 1, 0], [o.y - (y0 - r), 0, -1], [(y1 + r) - o.y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        o.x += push[1] * push[0]; o.y += push[2] * push[0];
        if (push[1]) o.vx *= -0.2; else o.vy *= -0.2;
      }
    }
  }
  function keepOnIce(o, r, rest = 0.6) {
    o.x = clamp(o.x, r, RW - r); o.y = clamp(o.y, r, RH - r);
    for (const [cx, cy] of [[CORNER, CORNER], [RW - CORNER, CORNER], [CORNER, RH - CORNER], [RW - CORNER, RH - CORNER]]) {
      const inX = (cx === CORNER ? o.x < cx : o.x > cx), inY = (cy === CORNER ? o.y < cy : o.y > cy);
      if (inX && inY) { const d = DM.hypot(o.x - cx, o.y - cy); if (d > CORNER - r) { const nx = (o.x - cx) / d, ny = (o.y - cy) / d; o.x = cx + nx * (CORNER - r); o.y = cy + ny * (CORNER - r); const dot = o.vx * nx + o.vy * ny; if (dot > 0) { o.vx -= (1 + rest) * dot * nx; o.vy -= (1 + rest) * dot * ny; } } }
    }
  }

  // Goalie coverage: a line centered on the goalie, perpendicular to the puck, as wide as his butterfly
  function goalieTargetAngle(g, qx, qy) {
    // square to the shot: face the puck's direction of travel when it is a shot coming his way, otherwise face the puck from the net
    const n = ownNet(g.team); const sp = DM.hypot(puck.vx, puck.vy);
    const incoming = sp > 40 && !puck.carrier && (puck.vx * g.team.dir < 0);
    return incoming ? DM.atan2(-puck.vy, -puck.vx) : DM.atan2(qy - n.y, (qx - n.x) * g.team.dir > 0 ? (qx - n.x) : g.team.dir * 0.5);
  }
  function turnGoalie(g, dt) {
    const want = goalieTargetAngle(g, puck.x, puck.y);
    if (g.ang === undefined) g.ang = want;
    let da = want - g.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const maxTurn = PH.goalie.turnRateRadPerSec * dt; // a goalie shuffles and rotates, he does not snap
    g.ang += clamp(da, -maxTurn, maxTurn);
  }
  function goalieLine(g) {
    const a = g.ang === undefined ? goalieTargetAngle(g, puck.x, puck.y) : g.ang;
    const w = (PH.goalie.lineHalfWidthBaseFt + g.skill * PH.goalie.lineHalfWidthPerRating) * cfg.goalie;
    const nx = -DM.sin(a), ny = DM.cos(a);
    return [g.x - nx * w, g.y - ny * w, g.x + nx * w, g.y + ny * w];
  }
  function pointToSegment(qx, qy, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1;
    const t = clamp(((qx - ax) * dx + (qy - ay) * dy) / L2, 0, 1);
    return DM.hypot(qx - (ax + dx * t), qy - (ay + dy * t));
  }
  function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }
  function movePuck(dt) {
    puck.cool = Math.max(0, (puck.cool || 0) - dt);
    if (puck.carrier) {
      puck.holdT = puck.carrier === puck.lastHolder ? (puck.holdT || 0) + dt : 0; puck.lastHolder = puck.carrier;
      const c = puck.carrier; const a = DM.atan2(c.vy, c.vx) || 0; const m = DM.hypot(c.vx, c.vy);
      puck.x = c.x + (m > 1 ? DM.cos(a) * 2.2 : 0); puck.y = c.y + (m > 1 ? DM.sin(a) * 2.2 : 0);
      puck.vx = c.vx; puck.vy = c.vy;
      const t = c.team; const ot = teams[1 - t.id]; const opp = active(ot);
      for (const o of opp) {
        if (dist(o, c) < PH.turnover.stealRadiusFt) {
          if (!shorthanded(ot) && Math.random() < dt * (PH.turnover.minorPenaltyRateBase + ot.tac.agg * PH.turnover.minorPenaltyRatePerAggression) * clamp(o.pen60 / (MP ? MP.league.penaltiesPer60Skater : 0.7), 0.4, 2.2)) { penalize(o, c); return; }
          if (Math.random() < dt * (PH.turnover.stealRateBase + ot.tac.agg * PH.turnover.stealRatePerAggression) * (0.7 + o.def - c.skill * 0.6) * (c.rushed > 0 ? 3 : 1) * hands(c)) { puck.carrier = o; puck.cool = 0.3; ot.take++; puck.touched = true; emit('fx', 'ring', { x: o.x, y: o.y, col: ot.col2, big: false }); break; }
        }
      }
      return;
    }
    const sp = DM.hypot(puck.vx, puck.vy);
    const fr = DM.pow(1 - PH.puck.frictionPerFrameAt60Hz / cfg.glide, dt * 60); puck.vx *= fr; puck.vy *= fr;
    if (sp < 0.5) { puck.vx = puck.vy = 0; }
    const px = puck.x, py = puck.y;
    puck.x += puck.vx * dt; puck.y += puck.vy * dt;
    for (const t of teams) {
      const n = ownNet(t); const front = t.dir;
      const inY = puck.y > n.y - NETW / 2 && puck.y < n.y + NETW / 2;
      const crossed = front > 0 ? (px >= n.x && puck.x < n.x) : (px <= n.x && puck.x > n.x);
      const g = t.goalie;
      // the goalie is a line squared to the puck; a shot that crosses that line is a save (usually)
      const seg = goalieLine(g);
      // the line is his squared coverage; his body still blocks a puck that passes within reach of his center even when the line is late
      const bodyR = PH.goalie.bodyRadiusFt;
      const crossesGoalie = segmentsCross(px, py, puck.x, puck.y, seg[0], seg[1], seg[2], seg[3]) || pointToSegment(g.x, g.y, px, py, puck.x, puck.y) < bodyR;
      const smothered = sp < 10 && dist(puck, g) < 2.6;
      // every puck that reaches the goal line between the posts gets its one save roll, even when it slipped past where he
      // was standing (a deflection, a pass across the crease, a shot to the side he was leaving); before 0.35 those went in free
      if ((crossesGoalie || smothered || (crossed && inY)) && puck.lastTeam !== t && !puck.beaten) {
        const hard = sp > PH.goalie.saveProb.hardShotFtPerSec;
        // save probability: the goalie's 2025-26 save percentage for this shot's danger tier (MoneyPuck), else the generic model
        let saveP;
        if (puck.shot && g.tiers && puck.xg !== undefined && MP) {
          // goal probability = the shot's expected goals, scaled by how this goalie's real save rate in the tier compares with the league's
          const lg = MP.league.dangerTiers[puck.tier].leagueSvPct; const q = (1 - g.tiers[puck.tier]) / (1 - lg);
          // xG is per unblocked attempt; this check runs only on pucks that reach the goalie, so divide by the league share of unblocked shots that hit the net
          saveP = clamp(1 - puck.xg / (XG.onNetShare || 0.65) * q * PH.goalie.tierGoalScale, 0.35, 0.995);
        } else saveP = (puck.shot && g.tiers) ? 1 - (1 - g.tiers[puck.tier]) * PH.goalie.tierGoalScale : hard ? PH.goalie.saveProb.hardBase + g.skill * PH.goalie.saveProb.hardPerRating : PH.goalie.saveProb.soft;
        const wide = puck.shot && !puck.onNet;
        if (puck.shot) { if (wide) puck.shooter.team.missed++; else puck.shooter.team.shots++; countUnblocked(puck.shooter.team); puck.shot = false; }
        if (!(wide || Math.random() < saveP)) puck.beaten = true; // through him: no second chance on the next tick
        if (!puck.beaten) {
          puck.lastTeam = t; puck.touched = true; if (sp > 25) emit('fx', 'save', { x: g.x, y: g.y });
          const FZ = PH.goalie.freeze; const attackers = active(teams[1 - t.id]).filter(o => dist(o, g) < FZ.attackerWithinFt).length;
          const fzScale = g.freezeRate && MP ? clamp(g.freezeRate / 0.21, 0.6, 1.6) : 1; // each goalie's own freeze tendency (freezes per shot on goal, league ~0.21)
          const freezeP = ((attackers ? FZ.probWithPressure : FZ.probNoPressure) + (hard ? FZ.hardShotBonus : 0)) * fzScale;
          if (sp > 25 && Math.random() < freezeP) { t.freezes++; setFaceoff(front > 0 ? 31 : 169, puck.y < 42 ? 20.5 : 64.5, 'Goalie freezes it'); log(`${g.name} covers it up${attackers ? ' with traffic in the crease' : ''}.`); return; }
          const a = DM.atan2(puck.y < 42 ? -1.6 : 1.6, front) + rnd(-0.4, 0.4); // steer the rebound to the corner
          puck.vx = DM.cos(a) * 45; puck.vy = DM.sin(a) * 45; puck.shot = false; puck.cool = PH.goalie.reboundCoolSec; puck.sinceSave = 0; // nobody gets it until it has traveled
          puck.x = g.x + front * 2.5; puck.y = g.y + (puck.y < g.y ? -1.5 : 1.5); // rebound off the pads, kicked away
          continue;
        }
      }
      if (crossed && inY) { if (puck.shot) { puck.shooter.team.shots++; countUnblocked(puck.shooter.team); } goal(teams[1 - t.id], t); return; }
      const inNetX = front > 0 ? (puck.x < n.x && puck.x > n.x - NETD) : (puck.x > n.x && puck.x < n.x + NETD);
      if (inNetX && inY && !crossed) { puck.y = n.y + (puck.y < n.y ? -(NETW / 2 + 1.2) : (NETW / 2 + 1.2)); puck.vy = (puck.y < n.y ? -1 : 1) * 6; } // slipped in from the side or back: kick it out beside the net
      if (inNetX && Math.abs(puck.y - n.y) < NETW / 2 + 0.8 && !inY) { puck.y = n.y + Math.sign(puck.y - n.y) * (NETW / 2 + 1); puck.vy *= -0.5; }
      if (!(inNetX && !inY) && Math.abs(puck.y - n.y) < NETW / 2 + 0.6) {
        const behind = front > 0 ? (puck.x < n.x - NETD && puck.x > n.x - NETD - 1 && puck.vx > 0) : (puck.x > n.x + NETD && puck.x < n.x + NETD + 1 && puck.vx < 0);
        if (behind) puck.vx *= -0.5;
      }
    }
    if (puck.shot && puck.shooter) { const st = puck.shooter.team; const pfxP = toFx(st, puck.x); if (pfxP > 178.5 || (pfxP > 174 && Math.abs(puck.y - 42.5) > NETW / 2 + 1 && Math.abs(puck.vx) < 8)) { st.missed++; countUnblocked(st); puck.shot = false; } }
    const rim = puck.rim && sp > 40 ? PH.puck.rimRestitution : PH.puck.boardRestitution; // a deliberate rim keeps its speed around the boards; a missed shot does not
    keepOnIce(puck, 0.5, rim);
    if (puck.x <= 0.5 || puck.x >= RW - 0.5) puck.vx *= -rim;
    if (puck.y <= 0.5 || puck.y >= RH - 0.5) puck.vy *= -rim;
    const rt = puck.releaseTeam;
    if (rt && !puck.touched && puck.releaseFx < 89 && !shorthanded(rt)) {
      const pfxP = toFx(rt, puck.x); const opp = teams[1 - rt.id];
      // hybrid icing (Rule 81): at the end-zone dots the linesman judges the race; a defender winning it is icing, an attacker winning it waves it off
      if (pfxP > 158 && !puck.raceJudged) {
        puck.raceJudged = true;
        const spot = toRink(rt, 176, clamp(puck.y, 3, 82));
        const att = Math.min(...active(rt).map(q => dist(q, spot)));
        const def = Math.min(...active(opp).map(q => dist(q, spot)));
        const goalieOut = dist(opp.goalie, spot) < 9; // the goalie coming out to play it waves icing
        if (!goalieOut && def <= att + 2) { rt.icings++; const d = endDot(rt, puck.y); log(`Icing on the ${rt.name}; no line change for them.`); setFaceoff(d.x, d.y, 'Icing', rt); return; }
        puck.releaseTeam = null; game.note = goalieOut ? 'Goalie plays it, no icing' : 'Icing waved off: attacker wins the race';
      }
      if (pfxP > 178 && Math.abs(puck.y - 42.5) > NETW / 2) { rt.icings++; const d = endDot(rt, puck.y); log(`Icing on the ${rt.name}; no line change for them.`); setFaceoff(d.x, d.y, 'Icing', rt); return; }
    }
    if (puck.cool > 0) return;
    const fast = sp > 45;
    // a stick in the passing lane: each defender gets one chance per pass to get a piece of it when it goes by within reach
    if (!puck.shot && puck.receiver && puck.lastTeam) {
      const R = PH.pass; puck.reached = puck.reached || new Set();
      for (const d of active(teams[1 - puck.lastTeam.id])) {
        if (puck.reached.has(d) || dist(d, puck) > R.stickReachFt) continue;
        puck.reached.add(d);
        if (Math.random() < R.stickDeflectBase + d.def * R.stickDeflectPerDef) {
          const a = DM.atan2(puck.vy, puck.vx) + rnd(-R.deflectAngleRad, R.deflectAngleRad), k = rnd(R.deflectSpeedMin, R.deflectSpeedMax);
          puck.vx = DM.cos(a) * sp * k; puck.vy = DM.sin(a) * sp * k; puck.receiver = null; puck.oneTimer = false; puck.lastTeam = d.team; puck.cool = 0.15; puck.touched = true;
          return;
        }
      }
    }
    let best = null, bd = 1e9;
    for (const p of skaters()) { const d = dist(p, puck); if (d < (puck.receiver === p ? PH.skater.receiverPickupRadiusFt : PH.skater.pickupRadiusFt) && d < bd) { bd = d; best = p; } }
    if (best) {
      const ownPass = puck.lastTeam === best.team;
      puck.touched = true;
      if (best.leaving && best.subOn && Math.random() < PH.turnover.benchMinorOnMidChangeTouch) { const srv = best.sub || best; benchMinor(best.team, srv.onIce ? srv : best); return; }
      if (fast && !ownPass && Math.random() > PH.pass.interceptControlPerSkill * best.skill) {
        if (puck.shot && best.team !== puck.shooter.team) { best.team.blocked++; puck.shot = false; puck.lastTeam = best.team; return; }
        // a stick on a pass he cannot control still knocks it off line: slower, a new direction, and nobody's puck
        if (!puck.shot && Math.random() < PH.pass.deflectOnTouch) {
          const a = DM.atan2(puck.vy, puck.vx) + rnd(-PH.pass.deflectAngleRad, PH.pass.deflectAngleRad), k = rnd(PH.pass.deflectSpeedMin, PH.pass.deflectSpeedMax);
          puck.vx = DM.cos(a) * sp * k; puck.vy = DM.sin(a) * sp * k; puck.receiver = null; puck.oneTimer = false; puck.lastTeam = best.team; puck.cool = 0.15;
        }
        return;
      }
      if (fast && ownPass && Math.random() > (puck.receiver === best ? 0.95 : 0.75)) return;
      if (puck.rim && !ownPass) best.rushed = 1.6; // retrieving a hard rim with a forechecker bearing down: the next play is hurried
      puck.carrier = best; puck.shot = false; puck.rim = false; puck.beaten = false;
      if (!ownPass && puck.lastTeam) best.team.take++;
      const wasReceiver = puck.receiver === best; const ot1 = puck.oneTimer; puck.receiver = null; puck.oneTimer = false;
      if (wasReceiver && ot1 && shotQuality(best, best.team) > 0.5 && Math.random() < 0.05) { best.oneTimers = (best.oneTimers || 0) + 1; shoot(best, true); return; }
    }
  }

  function countUnblocked(team) {
    if (puck.tierCounted) return; puck.tierCounted = true;
    const tier = puck.tier || 'low'; team.tier[tier]++;
    team.xg += puck.xg !== undefined ? puck.xg : (MP ? MP.league.dangerTiers[tier].goalRate : { low: 0.036, medium: 0.129, high: 0.263 }[tier]);
  }
  const INFRACTIONS = ['hooking', 'tripping', 'slashing', 'holding', 'interference', 'cross-checking'];
  function penalize(p, victim) {
    const t = p.team; p.box = PH.game.minorPenaltySec; t.pim += 2;
    const name = INFRACTIONS[Math.floor(Math.random() * INFRACTIONS.length)];
    log(`Penalty: ${t.abbr} #${p.num} ${p.name}, ${name} (2:00). ${teams[1 - t.id].name} power play.`, 'goal');
    // off the ice and into the box
    p.onIce = false; p.leaving = false; p.sub = null;
    t.onF = t.onF.filter(q => q !== p); t.onD = t.onD.filter(q => q !== p); rebuildOnIce(t);
    const d = endDot(t, victim.y);
    setFaceoff(d.x, d.y, `${teams[1 - t.id].name} power play`);
  }
  function releaseFromBox(t, p) {
    p.box = 0; p.shift = 0; p.leaving = false;
    p.x = (t.pbox.x0 + t.pbox.x1) / 2; p.y = RH - 2; p.vx = 0; p.vy = -10; p.onIce = true;
    if (p.isD) t.onD.push(p); else t.onF.push(p);
    rebuildOnIce(t);
    log(`${t.abbr} #${p.num} ${p.name} out of the box.`);
  }
  function checkOffside() {
    const att = puck.carrier ? puck.carrier.team : puck.lastTeam;
    for (const t of teams) {
      const pfxNow = toFx(t, puck.x);
      const inZ = t.inZone ? pfxNow > 112 : pfxNow > 114;
      const offsideMate = () => active(t).some(p => p !== puck.carrier && !p.leaving && toFx(t, p.x) > 115.2);
      if (inZ && !t.inZone) {
        t.inZone = true;
        if (att === t && offsideMate()) {
          if (puck.carrier && puck.carrier.team === t) { whistleOffside(t); return; }
          t.delayed = true; game.note = 'Delayed offside';
        }
      } else if (!inZ) { t.inZone = false; if (t.delayed) { t.delayed = false; game.note = 'Play on'; } }
      if (t.delayed) {
        if (puck.carrier && puck.carrier.team === t) { whistleOffside(t); return; }
        if (!offsideMate()) { t.delayed = false; game.note = 'Tagged up, play on'; }
      }
    }
  }
  function whistleOffside(t) { t.delayed = false; t.offsides++; const d = neutralDot(t, puck.y); log(`Offside, ${t.name}.`); setFaceoff(d.x, d.y, 'Offside'); }

  function goal(scorer, against) {
    scorer.score++;
    const sh = puck.shooter && puck.shooter.team === scorer ? puck.shooter : null;
    if (sh) sh.gg = (sh.gg || 0) + 1;
    emit('fx', 'goal', { net: ownNet(against), dir: against.dir, scorer: sh, x: puck.x, y: puck.y, col: scorer.col2 });
    const who = sh ? `#${sh.num} ${sh.name}` : 'deflection';
    const pp = onPP(scorer);
    log(`${pp ? 'POWER PLAY ' : ''}GOAL ${scorer.name} (${who}). ${teams[0].abbr} ${teams[0].score}, ${teams[1].abbr} ${teams[1].score}`, 'goal');
    if (pp) against.all.forEach(p => { if (p.box > 0) releaseFromBox(against, p); });
    setFaceoff(100, 42.5, `${scorer.name} score`);
  }

  // Shootout after a scoreless overtime: three shooters each, then sudden death. A shooter's chance is the league
  // shootout rate scaled by his shooting rating and the goalie's quality in tight (his high-danger save rate).
  function shootout() {
    const SO = PH.game.shootout; const goals = [0, 0]; const order = teams.map(t => t.all.filter(p => !p.goalie).sort((a, b) => b.shoot - a.shoot));
    const chance = (p, g) => clamp(SO.leagueRate * (0.6 + p.shoot * 0.8) * (g.tiers ? (1 - g.tiers.high) / (1 - (MP ? MP.league.dangerTiers.high.leagueSvPct : 0.77)) : 1), 0.08, 0.7);
    for (let round = 0; round < 12; round++) {
      for (const i of [0, 1]) {
        const shooter = order[i][round % order[i].length]; const g = teams[1 - i].goalie;
        if (Math.random() < chance(shooter, g)) { goals[i]++; log(`Shootout: ${teams[i].abbr} #${shooter.num} ${shooter.name} scores.`); }
        else log(`Shootout: ${g.name} stops #${shooter.num} ${shooter.name}.`);
      }
      const left = Math.max(0, 2 - round);   // rounds remaining in the first three
      if (round >= 2 && goals[0] !== goals[1]) break;
      if (round < 2 && Math.abs(goals[0] - goals[1]) > left) break;
    }
    const w = goals[0] > goals[1] ? 0 : 1; teams[w].score++; game.shootout = true; game.over = true; emit('final');
    log(`Final: ${teams[w].name} win ${teams[w].score}-${teams[1 - w].score} in a shootout (${goals[0]}-${goals[1]}).`, 'goal'); game.note = 'Final (SO)';
  }
  function endPeriod() {
    if (game.period >= 3 && teams[0].score !== teams[1].score) {
      game.over = true; const w = teams[0].score > teams[1].score ? teams[0] : teams[1]; if (game.period === 4) game.overtime = true;
      log(`Final: ${w.name} win ${Math.max(teams[0].score, teams[1].score)}-${Math.min(teams[0].score, teams[1].score)}${game.period === 4 ? ' in overtime' : ''}.`, 'goal'); game.note = game.period === 4 ? 'Final (OT)' : 'Final'; emit('final'); return;
    }
    if (game.period >= 4) { shootout(); return; }
    game.period++; game.clock = game.period === 4 ? 300 : 1200;
    teams.forEach(t => t.dir *= -1);
    log(`${['1st', '2nd', '3rd', 'OT'][game.period - 1]} period. Teams switch ends.`);
    teams.forEach(t => stoppageChange(t, true));
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
