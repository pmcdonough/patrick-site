// Formations: the spot each skater wants for the situation, the system and the puck.
// Installed into the engine by createSim (sim.js): it reads the shared state from S, gets the other modules' functions
// when link() runs, and adds its own to S.
import { clamp, dist, ownNet, toFx, toRink } from './rink.js?v=0.68';
import * as DM from './detmath.js?v=0.68';

export function install(S) {
  const { PH, SYS, active, drift, game, onPP, puck, shorthanded, teams } = S;
  let manMark, pkSlot;   // from other modules, bound by link()

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
        // the center owns the slot: he takes the most dangerous attacker between the dots, a defenseman who has come down
        // included (before sim 0.61 only forwards counted), and plays goal-side of him
        if (p.role === 'C') {
          const opp = teams[1 - t.id];
          const slotMen = active(opp).filter(o => o !== puck.carrier).map(o => ({ o, fx: 178 - toFx(opp, o.x) })).filter(h => h.fx > 12 && h.fx < 42 && Math.abs(h.o.y - 42.5) < 18).sort((a, b) => a.fx - b.fx);
          if (slotMen.length) { const h = slotMen[0]; fx = clamp(h.fx - 3.5, 6, 40); fy = h.o.y + (h.o.y < 42.5 ? 1.5 : -1.5); }
        }
        if (pfx < 12) { if (p.role === (strong ? 'LD' : 'RD')) [fx, fy] = [4, strong ? 22 : 63]; }
        // defensemen box out the net-front man: whoever is parked in front, forward or defenseman, gets a defender on his hip, goal-side
        if (p.isD) {
          const opp = teams[1 - t.id];
          const front = active(opp).filter(o => o !== puck.carrier && o !== t.pressurer).map(o => ({ o, fx: 178 - toFx(opp, o.x) })).filter(h => h.fx < 26 && Math.abs(h.o.y - 42.5) < 16).sort((a, b) => a.fx - b.fx)[0];
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
      const opp = teams[1 - t.id], GC = PH.gapControl;
      let deepest = 999;
      for (const o of active(opp)) { const ofx = 178 - toFx(opp, o.x) - Math.max(0, -o.vx * t.dir) * GC.readAheadSec; if (ofx < deepest) deepest = ofx; } // read the carrier's speed and back off early
      if (deepest < 999) fx = Math.min(fx, deepest - GC.gapFt);
    }
    return toRink(t, clamp(fx, 4, 174), clamp(fy, 5, 80));
  }

  Object.assign(S, { formationSpot });
  return () => { ({ manMark, pkSlot } = S); };
}
