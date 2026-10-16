// The rules: shot tallies, penalties and the box, offside, goals, the shootout and the end of a period.
// Installed into the engine by createSim (sim.js): it reads the shared state from S, gets the other modules' functions
// when link() runs, and adds its own to S.
import { RH, clamp, endDot, neutralDot, ownNet, toFx } from './rink.js?v=0.55';

export function install(S) {
  const { active, emit, game, log, MP, onPP, PH, puck, random, teams } = S;
  let rebuildOnIce, setFaceoff, stoppageChange;   // from other modules, bound by link()

  function countUnblocked(team) {
    if (puck.tierCounted) return; puck.tierCounted = true;
    const tier = puck.tier || 'low'; team.tier[tier]++;
    team.xg += puck.xg !== undefined ? puck.xg : (MP ? MP.league.dangerTiers[tier].goalRate : { low: 0.036, medium: 0.129, high: 0.263 }[tier]);
  }
  const INFRACTIONS = ['hooking', 'tripping', 'slashing', 'holding', 'interference', 'cross-checking'];
  function penalize(p, victim) {
    const t = p.team; p.box = PH.game.minorPenaltySec; t.pim += 2;
    const name = INFRACTIONS[Math.floor(random() * INFRACTIONS.length)];
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
        if (random() < chance(shooter, g)) { goals[i]++; log(`Shootout: ${teams[i].abbr} #${shooter.num} ${shooter.name} scores.`); }
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

  Object.assign(S, { countUnblocked, INFRACTIONS, penalize, releaseFromBox, checkOffside, whistleOffside, goal, shootout, endPeriod });
  return () => { ({ rebuildOnIce, setFaceoff, stoppageChange } = S); };
}
