// The officiating crew: where the referee and linesmen skate, and who blows the whistle.
// Installed into the engine by createSim (sim.js): it reads the shared state from S, gets the other modules' functions
// when link() runs, and adds its own to S.
import { GL, RW, dist, toFx } from './rink.js?v=0.48';
import * as DM from './detmath.js?v=0.48';

export function install(S) {
  const { PH, cfg, game, puck, shorthanded } = S;
  let keepOffNets, keepOnIce;   // from other modules, bound by link()

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

  Object.assign(S, { officials, blowWhistle, moveOfficials });
  return () => { ({ keepOffNets, keepOnIce } = S); };
}
