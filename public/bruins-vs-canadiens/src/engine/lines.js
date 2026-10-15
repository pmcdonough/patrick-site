// Lines, benches and shifts: rotations, stoppage and on-the-fly changes, line matching, bench minors, faceoffs.
// Installed into the engine by createSim (sim.js): it reads the shared state from S, gets the other modules' functions
// when link() runs, and adds its own to S.
import { RH, RW, clamp, endDot, ownNet, toFx, zone } from './rink.js?v=0.49';

export function install(S) {
  const { avgDef, game, log, onPP, PH, puck, rnd, shorthanded, SYS, teams } = S;
  let blowWhistle;   // from other modules, bound by link()

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

  Object.assign(S, { ROT, pattern, nextLine, peekLine, buildUnit, rebuildOnIce, stoppageChange, matchLines, safeToChange, defending, shiftTarget, changing, fDoor, dDoor, doorFor, startUnitChange, startSoloChange, manageChanges, benchMinor, setFaceoff });
  return () => { ({ blowWhistle } = S); };
}
