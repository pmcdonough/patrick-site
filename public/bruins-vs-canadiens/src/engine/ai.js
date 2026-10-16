// Decisions: who chases, covers and supports; the carrier's read; passes, shots, chips and clears.
// Installed into the engine by createSim (sim.js): it reads the shared state from S, gets the other modules' functions
// when link() runs, and adds its own to S.
import { NETW, clamp, dist, oppNet, ownNet, toFx, toRink, zone } from './rink.js?v=0.61';
import * as DM from './detmath.js?v=0.61';

export function install(S) {
  const { active, cfg, emit, game, log, MP, onPP, PH, puck, random, release, rnd, shorthanded, SYS, teams, XG, xgModel, xgTier } = S;
  let doorFor, formationSpot, hands;   // from other modules, bound by link()

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
    // a decision forced from outside, once (the shot review plays out the pass a shooter passed up)
    if (S.forced && S.forced.p === p) { const f = S.forced; S.forced = null; if (f.kind === 'pass' && f.to) pass(p, f.to); else shoot(p, false, 'forced'); return null; }
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
          if (random() < dt * rate) { shoot(p, false, 'read'); return null; }
          p.lookingToShoot = true;
        } else if (best && bestV > myV * XC.passMustBeatBy && bestV >= XC.minXg && (puck.holdT || 0) >= PH.pass.controlSec && random() < dt * XC.passRatePerSec) { pass(p, best); return null; }
      }
      const PE = SD.perimeter; const dNet = dist(p, n);
      const throughTraffic = laneClear(p, n, opp, 2.2) && pressure > 4; // a body in the lane is fine, a stick on the puck is not
      if (throughTraffic && dNet >= PE.minDistFt && dNet <= PE.maxDistFt && q > 0.05 && random() < dt * PE.ratePerSec * cfg.shots) { shoot(p, false, 'perimeter'); return null; }
      const PR = SD.probabilistic, PS = SD.pointShot;
      const pointShot = p.isD || toFx(t, p.x) < 135;
      const rate = cfg.shots * PR.baseRate * (DM.pow(q, PR.qualityPower) * (0.9 + agg * PR.aggressionWeight) * (0.6 + p.shoot * PR.shooterWeight) + (open && q > PR.openLookMinQuality ? PR.openLookBonus : 0) + (pressure < PR.pressureWithinFt ? PR.pressureBonus * q : 0)) + (pointShot && q > PS.minQuality ? PS.baseRate + (open ? PS.openBonus : 0) : 0);
      if (random() < dt * rate) { shoot(p, false, 'chance'); return null; }
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
      if (dn < 16 + p.shoot * 8 && random() < dt * 6) { shoot(p, false, 'breakaway'); return null; }
      return { x: n.x - t.dir * 5, y: n.y + (p.y < 42 ? -2 : 2) };
    }
    p.breakaway = false;
    // the penalty kill: there is no icing while shorthanded, so the first job with the puck in our end or the neutral zone
    // is to send it the length of the ice and make the power play go back for it. Only a real shorthanded rush keeps it.
    if (shorthanded(t) && !pp && pz !== 'off') {
      const K = SYS.penaltyKill.clear;
      const back = opp.filter(o => toFx(t, o.x) > pfx).length, up = 1 + mates.filter(m => toFx(t, m.x) > pfx - K.rushTrailFt).length;
      const rush = pz === 'neutral' && p.vx * t.dir > K.rushMinSpeedFtPerSec && up > back;
      if (!rush) { if (random() < dt * K.ratePerSec) { pkClear(p, opp); return null; } return { x: p.x, y: p.y }; }
    }
    // a teammate with a step on the last defender: spring him
    if (pz !== 'off') {
      const lastD = Math.max(...opp.map(o => 178 - toFx(teams[1 - t.id], o.x)), 0);
      const sprung = lastD < 112 ? mates.filter(m => !m.leaving && toFx(t, m.x) <= 114 && toFx(t, m.x) >= lastD + 2 && toFx(t, m.x) > pfx + 8 && laneClear(p, m, opp) && dist(p, m) < 90) : [];
      if (sprung.length && random() < dt * 3) { pass(p, sprung.sort((a, b) => toFx(t, b.x) - toFx(t, a.x))[0]); return null; }
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
      if (loose.length && random() < dt * 2) { pass(p, loose[0]); return null; }
      if (q > 0.15 && laneClear(p, oppNet(t), opp, 1.6) && random() < dt * PH.shotDecision.stuckShotRatePerSec) { shoot(p, false, 'stuck'); return null; }
      const n2 = oppNet(t); const towardMid = { x: p.x + (n2.x - p.x) * 0.25, y: p.y + (n2.y - p.y) * 0.35 };
      if (deep.length && random() < dt * 2) { pass(p, deep.sort((a, b) => dist(a, p) - dist(b, p))[0]); return null; } // or just give it to the nearest man and reset
      return towardMid;
    }
    // a carrier with a shot worth taking does not look around for a pass unless a stick is on him
    const holding = p.lookingToShoot && pressure > PH.shotDecision.xgChoice.passUnderPressureFt; p.lookingToShoot = false;
    const W = PH.pass.want;
    // in the offensive zone a pass has to be settled before the next one: no discretionary pass within controlSec of getting the puck
    const wantPass = !holding && (pz !== 'off' || (puck.holdT || 0) >= PH.pass.controlSec) && (pressure < W.pressureFt + agg * W.pressurePerAggressionFt || random() < dt * (pp ? W.powerPlayRatePerSec : W.ratePerSec) * (0.5 + p.pass));
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
      if ((pressure < C.pressureFt || (pk && pressure < C.pkPressureFt) || (gassed && pressure < C.gassedPressureFt)) && random() < dt * C.ratePerSec) { clearPuck(p); return null; }
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
    const laneOpen = laneClear(p, n, opp, XC.laneWidthFt), tight = pressure < XC.tightCoverFt;
    const myV = mine.xg * (laneOpen ? 1 : XC.blockedLaneFactor) * (tight ? XC.tightCoverFactor : 1);
    let best = null, bestV = 0, bestWhy = null;
    for (const m of mates) {
      if (zone(t, m.x) !== 'off' || !laneClear(p, m, opp)) continue;
      const room = Math.min(...opp.map(o => dist(o, m))), d = dist(p, m);
      const look = lookXg(m, t, Math.abs(m.y - p.y) > XC.oneTimerCrossFt && room > XC.openFt);
      if (!look) continue;
      const arrive = clamp(XC.passCompleteBase - d * XC.passCompletePerFt, XC.passCompleteMin, 1), open = room > XC.openFt;
      const v = look.xg * arrive * (open ? 1 : XC.coveredFactor);
      if (v > bestV) { bestV = v; best = m; bestWhy = { xg: look.xg, arrive, open, oneTimer: Math.abs(m.y - p.y) > XC.oneTimerCrossFt && open }; }
    }
    // the parts of each value, for the page to explain: his look before the lane and the pressure, and what the pass was made of
    return { myV, best, bestV, myXg: mine.xg, laneOpen, tight, bestWhy };
  }
  // why: what made him shoot, for the shot event ('read' his look beat his best pass, 'perimeter' a throw at the net through
  // traffic, 'chance' the shot-rate roll, 'stuck' held too long with no clean option, 'breakaway', 'oneTimer')
  function shoot(from, oneTimer, why) {
    const t = from.team, n = oppNet(t);
    const slap = from.isD || dist(from, n) > 45; // point shots are slap or heavy wrist shots: faster
    // expected goals from the shot's geometry and context (rebound, rush, strength, shot type), then the shooter's finishing;
    // the danger tier follows MoneyPuck's xG thresholds. Counted on unblocked attempts.
    const dN = dist(from, n), offY = Math.abs(from.y - n.y);
    const look = lookXg(from, t, oneTimer);
    if (look !== null) { puck.tier = xgTier(look.base); puck.xg = look.xg; }
    else { const TG = PH.dangerTiers; puck.tier = (dN <= TG.high.maxDistFt && offY <= TG.high.maxOffCenterFt) ? 'high' : (dN <= TG.medium.maxDistFt && offY <= TG.medium.maxOffCenterFt) ? 'medium' : 'low'; puck.xg = MP ? MP.league.dangerTiers[puck.tier].goalRate : 0.07; }
    // on net or wide at the league's rate for the shot's danger tier (real shooters miss about as often from in close as
    // from the point), then aimed inside the posts or just wide of one
    const SA = PH.shot.aim, onRate = (XG && XG.onNetByTier) ? XG.onNetByTier[puck.tier] : 0.65;
    const aimY = random() < onRate ? n.y + rnd(-1, 1) * (NETW / 2 - SA.insidePostFt) : n.y + (random() < 0.5 ? -1 : 1) * (NETW / 2 + rnd(SA.wideMinFt, SA.wideMaxFt));
    const a = DM.atan2(aimY - from.y, n.x - from.x);
    const sp = slap ? PH.shot.slap.baseFtPerSec + from.shoot * PH.shot.slap.perShootRating : PH.shot.wrist.baseFtPerSec + from.shoot * PH.shot.wrist.perShootRating;
    puck.carrier = null; puck.vx = DM.cos(a) * sp; puck.vy = DM.sin(a) * sp; puck.lastTeam = t; puck.shot = true; puck.shooter = from; puck.cool = 0.25; puck.beaten = false; release(from);
    const tGoal = (n.x - from.x) / (puck.vx || 1e-6); puck.onNet = tGoal > 0 && Math.abs(from.y + puck.vy * tGoal - n.y) < NETW / 2; // would it hit the net if nothing touched it?
    t.attempts++;
    puck.tierCounted = false;
    emit('shot', { shooter: from, why: why || 'chance', oneTimer: !!oneTimer, xg: puck.xg, tier: puck.tier });   // before any block: the page reads the play as it stood at the release
    // shot block: a defender in the lane, close to the shooter, gets in front of it
    const ot = teams[1 - t.id];
    const dx = DM.cos(a), dy = DM.sin(a); const L = dist(from, n);
        for (const o of active(ot)) {
      const along = (o.x - from.x) * dx + (o.y - from.y) * dy;
      if (along < 2 || along > L * PH.shotBlock.laneFraction) continue;
      const off = Math.abs(-(o.x - from.x) * dy + (o.y - from.y) * dx);
      const reach = PH.shotBlock.laneHalfWidthFt + (along < PH.shotBlock.closeWithinFt ? PH.shotBlock.closeBonusFt : 0); // a defender right on the shooter covers more of the lane
      if (off < reach && random() < PH.shotBlock.probBase + o.def * PH.shotBlock.probPerDef) {
        ot.blocked++; puck.shot = false; puck.touched = true; puck.lastTeam = ot; puck.cool = 0.2; emit('fx', 'ring', { x: o.x, y: o.y, col: '#222', big: false });
        puck.x = o.x + dx * 1.5; puck.y = o.y + dy * 1.5;
        const ra = DM.atan2(-dy, -dx) + rnd(-1.1, 1.1); const rs = rnd(12, 28);
        puck.vx = DM.cos(ra) * rs; puck.vy = DM.sin(ra) * rs;
        o.blocks = (o.blocks || 0) + 1;
        break;
      }
    }
  }

  // Angling: a defender who is goal-side of the carrier and in his way does not let him cut inside. The carrier's route
  // bends to the outside of that defender, toward the boards, as it does when a defenseman takes away the middle on an
  // entry. It changes where he skates, not what he decides; a defender who stays on him gets the usual poke-check chance.
  function angleOff(p, t, tg) {
    const AN = PH.angling, n = oppNet(t);
    if (toFx(t, p.x) < AN.fromFx) return tg;
    const dNet = dist(p, n), dx = tg.x - p.x, dy = tg.y - p.y, L2 = dx * dx + dy * dy;
    if (L2 < 1) return tg;
    let out = tg;
    for (const o of active(teams[1 - t.id])) {
      if (dist(o, p) > AN.engageFt || dist(o, n) > dNet - AN.goalSideFt) continue;
      const u = ((o.x - p.x) * dx + (o.y - p.y) * dy) / L2;                         // where along his route the defender stands
      const lateral = Math.abs((o.x - p.x) * dy - (o.y - p.y) * dx) / Math.sqrt(L2);
      if (u <= 0 || lateral > AN.laneFt) continue;
      const side = p.y === o.y ? (p.y < 42.5 ? -1 : 1) : Math.sign(p.y - o.y);    // the side of the defender he is already on
      const y = side > 0 ? Math.max(out.y, o.y + AN.wideFt) : Math.min(out.y, o.y - AN.wideFt);
      out = { x: out.x, y: clamp(y, 4, 81) };
    }
    return out;
  }

  function assignTargets(dt) {
    // a pass on its way to a teammate is still that team's puck: both sides keep their structure and the defense
    // plays the receiver, instead of everyone treating it as a loose puck for the length of the pass
    const inFlight = !puck.carrier && !puck.shot && puck.receiver && puck.receiver.onIce && !puck.receiver.box && !puck.receiver.leaving && puck.lastTeam === puck.receiver.team
      && DM.hypot(puck.vx, puck.vy) > PH.pass.inFlightMinFtPerSec;   // a pass that has died is a loose puck
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
        if (p === carrier) { const tg = carrierThink(p, dt); p.target = tg && angleOff(p, t, tg); continue; }
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
          // in our zone the man on the puck plays him from the inside, between him and our net, so a drive to the net runs into him
          const inside = situation === 'defense' && pz === 'own' && !(shorthanded(t) && !onPP(t)) ? (t.marks ? SYS.defensiveZone.man : SYS.defensiveZone.zone).carrierGoalSideFt : 0;
          if (!loose && inside > 0) {
            const n = ownNet(t), lx = carrier.x + carrier.vx * 0.25, ly = carrier.y + carrier.vy * 0.25; const d = dist(n, { x: lx, y: ly }) || 1; const k = Math.min(inside, d * 0.5);
            p.target = { x: lx + (n.x - lx) / d * k, y: ly + (n.y - ly) / d * k }; continue;
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


  Object.assign(S, { nearestTo, assign, pkSlot, manMark, manMarks, leadForward, chip, clearPuck, pkClear, laneClear, shotQuality, carrierThink, pass, lookXg, readLook, shoot, assignTargets });
  return () => { ({ doorFor, formationSpot, hands } = S); };
}
