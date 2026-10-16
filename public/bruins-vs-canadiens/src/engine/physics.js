// Movement and the puck: skating, fatigue, staying on the ice, goalies, the puck in flight, saves and rebounds.
// Installed into the engine by createSim (sim.js): it reads the shared state from S, gets the other modules' functions
// when link() runs, and adds its own to S.
import { CORNER, GL, NETD, NETW, RH, RW, clamp, dist, endDot, ownNet, toFx, toRink, zone } from './rink.js?v=0.56';
import * as DM from './detmath.js?v=0.56';

export function install(S) {
  const { active, cfg, emit, game, log, MP, PH, puck, random, rnd, shorthanded, skaters, SYS, teams, XG } = S;
  let benchMinor, countUnblocked, goal, penalize, setFaceoff, shoot, shotQuality;   // from other modules, bound by link()

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
          if (!shorthanded(ot) && random() < dt * (PH.turnover.minorPenaltyRateBase + ot.tac.agg * PH.turnover.minorPenaltyRatePerAggression) * clamp(o.pen60 / (MP ? MP.league.penaltiesPer60Skater : 0.7), 0.4, 2.2)) { penalize(o, c); return; }
          if (random() < dt * (PH.turnover.stealRateBase + ot.tac.agg * PH.turnover.stealRatePerAggression) * (0.7 + o.def - c.skill * 0.6) * (c.rushed > 0 ? 3 : 1) * hands(c)) { puck.carrier = o; puck.cool = 0.3; ot.take++; puck.touched = true; emit('fx', 'ring', { x: o.x, y: o.y, col: ot.col2, big: false }); break; }
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
        if (!(wide || random() < saveP)) puck.beaten = true; // through him: no second chance on the next tick
        if (!puck.beaten) {
          puck.lastTeam = t; puck.touched = true; if (sp > 25) emit('fx', 'save', { x: g.x, y: g.y });
          const FZ = PH.goalie.freeze; const attackers = active(teams[1 - t.id]).filter(o => dist(o, g) < FZ.attackerWithinFt).length;
          const fzScale = g.freezeRate && MP ? clamp(g.freezeRate / 0.21, 0.6, 1.6) : 1; // each goalie's own freeze tendency (freezes per shot on goal, league ~0.21)
          const freezeP = ((attackers ? FZ.probWithPressure : FZ.probNoPressure) + (hard ? FZ.hardShotBonus : 0)) * fzScale;
          if (sp > 25 && random() < freezeP) { t.freezes++; setFaceoff(front > 0 ? 31 : 169, puck.y < 42 ? 20.5 : 64.5, 'Goalie freezes it'); log(`${g.name} covers it up${attackers ? ' with traffic in the crease' : ''}.`); return; }
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
        if (random() < R.stickDeflectBase + d.def * R.stickDeflectPerDef) {
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
      if (best.leaving && best.subOn && random() < PH.turnover.benchMinorOnMidChangeTouch) { const srv = best.sub || best; benchMinor(best.team, srv.onIce ? srv : best); return; }
      if (fast && !ownPass && random() > PH.pass.interceptControlPerSkill * best.skill) {
        if (puck.shot && best.team !== puck.shooter.team) { best.team.blocked++; puck.shot = false; puck.lastTeam = best.team; return; }
        // a stick on a pass he cannot control still knocks it off line: slower, a new direction, and nobody's puck
        if (!puck.shot && random() < PH.pass.deflectOnTouch) {
          const a = DM.atan2(puck.vy, puck.vx) + rnd(-PH.pass.deflectAngleRad, PH.pass.deflectAngleRad), k = rnd(PH.pass.deflectSpeedMin, PH.pass.deflectSpeedMax);
          puck.vx = DM.cos(a) * sp * k; puck.vy = DM.sin(a) * sp * k; puck.receiver = null; puck.oneTimer = false; puck.lastTeam = best.team; puck.cool = 0.15;
        }
        return;
      }
      if (fast && ownPass && random() > (puck.receiver === best ? 0.95 : 0.75)) return;
      if (puck.rim && !ownPass) best.rushed = 1.6; // retrieving a hard rim with a forechecker bearing down: the next play is hurried
      // a shot caught cleanly in flight is a blocked shot: a defender's block, or one a teammate in the lane got in the way of
      if (puck.shot) { if (best.team !== puck.shooter.team) best.team.blocked++; else best.team.blockedOwn++; }
      puck.carrier = best; puck.shot = false; puck.rim = false; puck.beaten = false;
      if (!ownPass && puck.lastTeam) best.team.take++;
      const wasReceiver = puck.receiver === best; const ot1 = puck.oneTimer; puck.receiver = null; puck.oneTimer = false;
      if (wasReceiver && ot1 && shotQuality(best, best.team) > 0.5 && random() < 0.05) { best.oneTimers = (best.oneTimers || 0) + 1; shoot(best, true, 'oneTimer'); return; }
    }
  }


  Object.assign(S, { fatigueLevel, fatigue, hands, movePlayers, keepOffNets, keepOnIce, goalieTargetAngle, turnGoalie, goalieLine, pointToSegment, segmentsCross, movePuck });
  return () => { ({ benchMinor, countUnblocked, goal, penalize, setFaceoff, shoot, shotQuality } = S); };
}
