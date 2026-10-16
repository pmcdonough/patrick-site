// Play Review: every unblocked shot of one real game scored by expected goals against the best pass and the drive the
// model saw, with a replay. The scoring uses the sim's own expected-goal model, rink and math (its engine modules), so
// the two can never disagree. index.html loads this with a version stamp (src/main.js?v=VERSION); imports from the
// sim's engine carry the sim's version instead. tools/smoke.js checks both.
import { makeXg } from '../../bruins-vs-canadiens/src/engine/xg.js?v=0.60';
import { RW, RH, GL, dist, clamp } from '../../bruins-vs-canadiens/src/engine/rink.js?v=0.60';
import * as DM from '../../bruins-vs-canadiens/src/engine/detmath.js?v=0.60';

(async () => {
  const VERSION = '0.10';
  document.getElementById('version').textContent = 'Play review v' + VERSION;
  const $ = id => document.getElementById(id);
  const get = async u => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  // Data: the sim's expected-goal model and systems, and this game's file.
  let XG, SYS, GAME;
  try { [XG, SYS, GAME] = await Promise.all([get('../bruins-vs-canadiens/data/xg-model.json'), get('../bruins-vs-canadiens/data/systems.json'), get('data/game-2025020812.json')]); }
  catch (e) { $('sub').textContent = 'Could not load the game data. Reload the page to try again.'; throw e; }

  // ---------- expected goals: the sim's model (engine/xg.js) ----------
  const { XGF, xgModel } = makeXg(XG);
  const finishing = name => XGF[(name || '').toLowerCase()] || 1;
  const TYPE = { wrist: 'WRIST', snap: 'SNAP', slap: 'SLAP', 'tip-in': 'TIP', backhand: 'BACK', deflected: 'DEFL', 'wrap-around': 'WRAP', 'bat': 'DEFL', 'poke': 'DEFL', 'between-legs': 'BACK', 'cradle': 'WRIST' };

  // ---------- rink frame: every shot drawn with the shooter attacking to the right; the sim's rink (engine/rink.js) ----------
  const NET = { x: RW - GL, y: RH / 2 };
  const angleTo = p => Math.abs(DM.atan2(p.y - NET.y, NET.x - p.x)) * 180 / Math.PI;
  const toRink = (fx, fy) => ({ x: GL + fx, y: fy });         // team-relative feet from own goal line -> rink x
  const oppToRink = (fx, fy) => ({ x: RW - GL - fx, y: fy }); // defending team's own-goal frame -> rink x
  const P = GAME.players; const name = id => (P[id] || {}).name || '?'; const num = id => (P[id] || {}).number || '';
  const OZ = { BOS: 'cycle', MTL: 'umbrella' };               // the systems the sim runs for each club; a real pre-scout would observe these
  const ROLE = { L: 'LW', R: 'RW', C: 'C', D: 'D' };

  // Place the shooter's teammates on the offensive-zone system spots (mirrored to the puck side) and the defenders on
  // zone coverage, then let the nearest defender close on the shooter. Positions are inferred, not observed.
  function reconstruct(s) {
    const shooter = { id: s.shooter, name: name(s.shooter), x: 189 - s.attack.fromGoalLine, y: 42.5 + s.attack.offMidline, team: s.team, role: ROLE[(P[s.shooter] || {}).pos] };
    const mirror = shooter.y > 42.5;
    const my = fy => mirror ? 85 - fy : fy;
    const spots = SYS.offensiveZone[OZ[s.team] || 'cycle'].spots;
    const mates = s.onIce[s.team].filter(id => id !== s.shooter).map(id => ({ id, name: name(id), team: s.team, pos: (P[id] || {}).pos }));
    const roles = ['LW', 'C', 'RW', 'LD', 'RD'].filter(r => r !== shooter.role && !(shooter.role === 'D' && r === 'LD'));
    // forwards take forward roles by position, defense take D roles; leftovers fill what is open
    const taken = new Set();
    for (const m of mates) { const want = m.pos === 'D' ? ['LD', 'RD'] : [ROLE[m.pos], 'LW', 'RW', 'C']; m.role = want.find(r => roles.includes(r) && !taken.has(r)) || roles.find(r => !taken.has(r)); taken.add(m.role); }
    for (const m of mates) { const sp = spots[m.role] || [140, 42]; const r = toRink(sp[0], my(sp[1])); m.x = r.x; m.y = r.y; }
    // keep a teammate from standing on the shooter
    for (const m of mates) if (dist(m, shooter) < 8) { m.y += m.y < shooter.y ? -8 : 8; }
    const zs = SYS.defensiveZone.zone.spots;
    const opps = s.onIce[s.opp].map(id => ({ id, name: name(id), team: s.opp, pos: (P[id] || {}).pos }));
    const droles = ['LD', 'RD', 'C', 'LW', 'RW']; const dt = new Set();
    for (const o of opps) { const want = o.pos === 'D' ? ['LD', 'RD'] : [ROLE[o.pos], 'C', 'LW', 'RW']; o.role = want.find(r => droles.includes(r) && !dt.has(r)) || droles.find(r => !dt.has(r)); dt.add(o.role); const sp = zs[o.role] || [24, 42]; const r = oppToRink(sp[0], my(sp[1])); o.x = r.x; o.y = r.y; }
    // zone coverage reacts to the shape: a defenseman boxes out the net-front man, the center plays goal-side of the slot man
    const goalSide = (o, m, k) => { const d = dist(m, NET) || 1; o.x = m.x + (NET.x - m.x) / d * k; o.y = m.y + (NET.y - m.y) / d * k; o.marking = m; };
    const front = mates.filter(m => dist(m, NET) < 26 && Math.abs(m.y - 42.5) < 16).sort((a, b) => dist(a, NET) - dist(b, NET));
    const ds = opps.filter(o => o.role === 'LD' || o.role === 'RD');
    if (front[0] && ds.length) { const d0 = ds.sort((a, b) => Math.abs(a.y - front[0].y) - Math.abs(b.y - front[0].y))[0]; goalSide(d0, front[0], 2.5); }
    const slot = mates.filter(m => !m.pos.match(/D/) && dist(m, NET) >= 12 && dist(m, NET) < 42 && Math.abs(m.y - 42.5) < 18 && !(front[0] && m === front[0]))[0];
    const c = opps.find(o => o.role === 'C'); if (slot && c) goalSide(c, slot, 3.5);
    // the nearest defender pressures the shooter from the net side
    const near = opps.filter(o => !o.marking).sort((a, b) => dist(a, shooter) - dist(b, shooter))[0] || opps[0];
    if (near) { const d = dist(shooter, NET) || 1; const k = Math.min(6, d * 0.4); near.x = shooter.x + (NET.x - shooter.x) / d * k; near.y = shooter.y + (NET.y - shooter.y) / d * k; near.pressurer = true; }
    // the goalie
    const goalie = { x: NET.x - 2.5, y: NET.y + (shooter.y - NET.y) * 0.08, team: s.opp };
    return { shooter, mates, opps, goalie };
  }

  const laneBlockedPt = (a, b, o, w = 3.5) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1; const t = clamp(((o.x - a.x) * dx + (o.y - a.y) * dy) / L2, 0, 1); if (t < 0.05) return false; return DM.hypot(a.x + dx * t - o.x, a.y + dy * t - o.y) < w; };
  const RP_DRIVE = { ft: 15, minFromNetFt: 10, corridorFt: 4.5, cutFt: 6, carryFtPerSec: 20, closeFtPerSec: 18, turnoverBase: 0.12, turnoverPerBody: 0.3, underPressureFt: 4, turnoverUnderPressure: 0.2 };
  const laneBlocked = (a, b, opps, w = 3.5) => opps.some(o => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1; const t = clamp(((o.x - a.x) * dx + (o.y - a.y) * dy) / L2, 0, 1); if (t < 0.12 || t > 0.9) return false; return DM.hypot(a.x + dx * t - o.x, a.y + dy * t - o.y) < w; });

  function score(s) {
    const R = reconstruct(s);
    const ctx = { pp: s.strength.pp, sh: s.strength.sh, rebound: !!(s.prev && s.prev.team === s.team && /shot|goal/.test(s.prev.type) && s.prev.secBefore <= 3) };
    const shotXg = xgModel(dist(R.shooter, NET), angleTo(R.shooter), { ...ctx, type: TYPE[s.shotType] || 'WRIST' }) * finishing(R.shooter.name);
    const options = R.mates.map(m => {
      const d = dist(R.shooter, m); const blocked = laneBlocked(R.shooter, m, R.opps);
      const completion = clamp(0.96 - 0.0045 * d, 0.4, 0.96) * (blocked ? 0.45 : 1);
      const press = Math.min(...R.opps.map(o => dist(o, m)));   // a defender on the receiver's hip takes away most of the look
      const pressure = press < 4 ? 0.6 : press < 8 ? 0.85 : 1;
      const recXg = xgModel(dist(m, NET), angleTo(m), { ...ctx, type: 'SNAP' }) * finishing(m.name) * pressure;
      const value = completion * 0.9 * recXg;   // the one-timer still has to get through: 0.9 of the receiver's look
      return { m, d: Math.round(d), blocked, completion, recXg, pressure, value };
    }).sort((a, b) => b.value - a.value);
    const best = options[0];
    // the drive: walk the puck DRIVE.ft closer along the line to the net if the corridor is clear, and shoot from there
    const D = RP_DRIVE; const toNet = dist(R.shooter, NET); let drive = null;
    if (toNet > D.ft + D.minFromNetFt && !/tip|defl/.test(s.shotType || '')) {   // a tip or deflection is not a possession decision
      const u = D.ft / toNet; let spot = { x: R.shooter.x + (NET.x - R.shooter.x) * u, y: R.shooter.y + (NET.y - R.shooter.y) * u };
      // the drive goes around the man closing on the shooter: cut to the side away from him
      const press = R.opps.find(o => o.pressurer);
      // cut toward the middle of the ice (a better angle), unless the man closing on the shooter is on that side
      { const mid = R.shooter.y > 42.5 ? -1 : 1; const side = press && Math.sign(press.y - R.shooter.y) === mid && Math.abs(press.y - R.shooter.y) > 1 ? -mid : mid; spot = { x: spot.x, y: clamp(spot.y + side * D.cutFt, 6, 79) }; }
      // The inference always puts one defender closing on the shooter, which the page cannot verify, so the drive assumes
      // the cut beats that man and charges for everyone else in the corridor. The method note says so.
      const inPath = R.opps.filter(o => o !== press && laneBlockedPt(R.shooter, spot, o, D.corridorFt)).length;
      const nearest = Math.min(...R.opps.filter(o => o !== press).map(o => dist(o, spot)));
      const pressure = nearest < 4 ? 0.6 : nearest < 8 ? 0.85 : 1;
      const turnover = clamp(D.turnoverBase + D.turnoverPerBody * inPath, 0, 0.9);
      const xg = xgModel(dist(spot, NET), angleTo(spot), { ...ctx, type: 'WRIST' }) * finishing(R.shooter.name) * pressure;
      drive = { spot, inPath, pressure, turnover, xg, value: (1 - turnover) * xg };
    }
    const gapPass = best ? best.value - shotXg : -1, gapDrive = drive ? drive.value - shotXg : -1;
    return { s, R, ctx, shotXg, options, best, drive, gap: gapPass, gapPass, gapDrive, gapRight: shotXg - Math.max(best ? best.value : 0, drive ? drive.value : 0) };
  }

  const shots = GAME.shots.filter(s => s.result !== 'block' && s.attack.fromGoalLine <= 75 && s.onIce[s.team].length >= 3);
  const scored = shots.map(score);
  window.playReview = { scored };   // test hook for tools/review.js
  const better = scored.filter(x => x.gapPass > 0.02); const betterDrive = scored.filter(x => x.gapDrive > 0.02); const right = scored.filter(x => x.gapRight > 0);

  // ---------- header and stats ----------
  const m = GAME.meta;
  $('title').textContent = `${m.away} ${m.score[m.away]} at ${m.home} ${m.score[m.home]}`;
  $('sub').textContent = `${m.date}, ${m.venue}. Every unblocked shot in the game, scored by expected goals, against the best pass the model saw from the same spot. Teammate and defender positions are inferred from each club's systems, not tracked, so treat each case as a question to put to the video, not a verdict.`;
  const fmt = v => (100 * v).toFixed(v < 0.095 ? 1 : 0) + '%';
  const sumXg = t => scored.filter(x => x.s.team === t).reduce((a, x) => a + x.shotXg, 0);
  $('stats').innerHTML = [
    [scored.length, 'unblocked shots scored'], [better.length, 'had a pass worth more (over 2 points)'], [betterDrive.length, 'had a drive worth more (over 2 points)'], [right.length, 'were the right call'],
    [sumXg('BOS').toFixed(2), 'Bruins expected goals'], [sumXg('MTL').toFixed(2), 'Canadiens expected goals'],
    [GAME.goals.length, 'goals'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  // ---------- list and detail ----------
  let team = '', selected = null, scenario = 'pass';
  const SCEN = { pass: { title: 'Shots where a pass was worth more', key: 'gapPass', alt: 'pass' }, drive: { title: 'Shots where driving to the net was worth more', key: 'gapDrive', alt: 'drive' }, right: { title: 'Shots that were the right call', key: 'gapRight', alt: 'best' } };
  function render() {
    const sc = SCEN[scenario]; $('scenarioTitle').textContent = sc.title;
    const rows = scored.filter(x => !team || x.s.team === team).filter(x => x[sc.key] > 0).sort((a, b) => b[sc.key] - a[sc.key]).slice(0, 10);
    $('list').innerHTML = rows.map((x, i) => `<div class="row" role="option" data-i="${x.s.i}" aria-selected="${selected === x.s.i}"><span class="n">${i + 1}</span><span class="who">${x.s.team} #${num(x.s.shooter)} ${x.R.shooter.name}<small>P${x.s.period} ${x.s.clock}, ${x.s.shotType || 'shot'} from ${Math.round(dist(x.R.shooter, NET))} ft, ${x.s.result === 'goal' ? 'goal' : x.s.result === 'miss' ? 'missed' : 'saved'}</small></span><span class="gap">+${(100 * x[sc.key]).toFixed(0)}</span></div>`).join('') || '<div class="row">No shots in this scenario.</div>';
    if (rows.length && (selected === null || !rows.some(r => r.s.i === selected))) selected = rows[0].s.i;
    $('list').querySelectorAll('.row[data-i]').forEach(el => { el.setAttribute('aria-selected', +el.dataset.i === selected); el.onclick = () => { selected = +el.dataset.i; render(); }; });
    const x = scored.find(y => y.s.i === selected); if (x) detail(x);
  }
  $('scenarios').querySelectorAll('button').forEach(b => b.onclick = () => { scenario = b.dataset.sc; $('scenarios').querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b)); selected = null; render(); });
  $('filters').querySelectorAll('button').forEach(b => b.onclick = () => { team = b.dataset.team; $('filters').querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b)); selected = null; render(); });

  // ---------- replay: a mock reconstruction of the seconds before and after the shot ----------
  // There is no tracking data, so the movement is synthesized: every skater travels from a plausible start to his
  // inferred spot over the lead-in, the puck follows the real preceding event to the real shot, and after the shot
  // the real result plays on the left while the model's pass plays on the right. Every panel is labeled as such.
  // Times are ice time (game-clock seconds). Playback speed stretches them on the wall clock; 0.5x is slow motion.
  const BLUE = 125;   // the attacking blue line in the rink frame
  const RP = { leadDefault: 5, leadMin: 2, leadMax: 8, after: 3, passFtPerSec: 70, wristFtPerSec: 90, slapFtPerSec: 120, carryFtPerSec: 22, rushFwdFtPerSec: [20, 27], rushDFtPerSec: [17, 23], backcheckFtPerSec: [18, 25], zoneDriftFtPerSec: 5 };
  let view = 'both', lead = RP.leadDefault, speed = 0.5, playing = false, tcur = -RP.leadDefault, clip = null, raf = null, lastTs = 0;
  const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const lerp = (a, b, u) => a + (b - a) * u;
  const seeded = (n) => { let x = (n * 9301 + 49297) % 233280; return () => (x = (x * 9301 + 49297) % 233280) / 233280; };
  const prevToRink = (s) => {   // the preceding event's coordinates in the same attacking frame as the shot
    if (!s.prev || s.prev.x === undefined || s.prev.x === null) return null;
    const ar = s.attack.attackRight; const gx = ar ? 89 : -89;
    return { x: 189 - Math.abs(gx - s.prev.x), y: 42.5 + (ar ? s.prev.y : -s.prev.y) };
  };
  function buildClip(x) {
    const { s, R, best } = x; const rnd = seeded(s.i + 1);
    const jit = k => (rnd() - 0.5) * 2 * k;
    const prev = prevToRink(s); const secBefore = s.prev ? Math.min(lead, Math.max(0.8, s.prev.secBefore)) : lead;
    const rush = !prev || prev.x < 125 || (s.prev && /faceoff|takeaway|giveaway|hit/.test(s.prev.type) && prev.x < 150);
    // skaters: start positions by scenario, arrive at the inferred spots just before the shot
    const paths = [];
    const pick = ([a, b]) => a + rnd() * (b - a);
    // start = where a skater at that speed would have been `lead` seconds of ice time before he arrives at his spot
    const add = (p, arrive, v, lateral) => { const T = Math.max(0.3, arrive + lead); const dx = rush ? v * T : Math.min(v * T, 10 + rnd() * 6); const ang = rush ? jit(0.25) : rnd() * Math.PI * 2; const sx = clamp(p.x - Math.cos(ang) * dx, 4, 186), sy = clamp(p.y - Math.sin(ang) * dx * (rush ? 0.35 : 1) + (rush ? lateral : 0), 6, 79); paths.push({ p, sx, sy, ex: p.x, ey: p.y, arrive }); };
    for (const m of R.mates) rush ? add(m, -0.6 + jit(0.4), m.pos === 'D' ? pick(RP.rushDFtPerSec) : pick(RP.rushFwdFtPerSec), jit(8)) : add(m, -0.4 + jit(0.4), RP.zoneDriftFtPerSec, 0);
    for (const o of R.opps) rush ? add(o, o.pressurer ? -0.3 : -0.9 + jit(0.4), pick(RP.backcheckFtPerSec), jit(6)) : add(o, o.pressurer ? -0.3 : -0.8 + jit(0.5), RP.zoneDriftFtPerSec, 0);
    // the puck: from the preceding event to the shooter. A long way means a pass from the nearest teammate; otherwise the shooter carries it.
    let start = prev ? { x: clamp(prev.x, 20, 186), y: clamp(prev.y, 6, 79) } : { x: clamp(R.shooter.x - RP.carryFtPerSec * Math.min(lead, 2.5), 20, 186), y: R.shooter.y + jit(6) };
    const far = dist(start, R.shooter) > 45 && R.mates.length;
    let carrier = null, passAt = null;
    if (far) { carrier = R.mates.slice().sort((a, b) => dist(a, start) - dist(b, start))[0]; passAt = -Math.min(1.4, secBefore * 0.4); }
    // the shooter: carries from the event at carry speed, or skates into his spot to take the pass
    const shooterT = Math.max(0.3, lead - 0.15);
    const shooterStart = far ? { x: clamp(R.shooter.x - (rush ? pick(RP.rushFwdFtPerSec) : RP.zoneDriftFtPerSec) * shooterT * 0.6 + jit(4), 4, 186), y: clamp(R.shooter.y + jit(6), 6, 79) }
                             : (() => { const d = dist(start, R.shooter); const reach = RP.carryFtPerSec * shooterT; if (d <= reach) return start; const u = 1 - reach / d; return { x: lerp(start.x, R.shooter.x, u), y: lerp(start.y, R.shooter.y, u) }; })();
    paths.push({ p: R.shooter, sx: shooterStart.x, sy: shooterStart.y, ex: R.shooter.x, ey: R.shooter.y, arrive: -0.15 });
    if (carrier) { const cp = paths.find(q => q.p === carrier); const T = Math.max(0.3, cp.arrive + lead); const d = dist(start, carrier); const reach = RP.carryFtPerSec * T; const u = d <= reach ? 0 : 1 - reach / d; cp.sx = lerp(start.x, carrier.x, u); cp.sy = lerp(start.y, carrier.y, u); cp.arrive = -0.3; }
    const x0 = clamp(Math.min(...paths.map(q => q.sx), start.x) - 10, 0, 96);
    const shotSpeed = (s.shotType === 'slap') ? RP.slapFtPerSec : RP.wristFtPerSec;
    const tNet = dist(R.shooter, NET) / shotSpeed;
    const useDrive = scenario === 'drive' || (scenario === 'right' && x.drive && (!best || x.drive.value >= best.value));
    const altT = useDrive ? { drive: RP_DRIVE.ft / RP_DRIVE.carryFtPerSec, release: 0.2 } : { pass: dist(R.shooter, best.m) / RP.passFtPerSec, release: 0.25 };
    if (useDrive) altT.net = altT.drive + altT.release + dist(x.drive.spot, NET) / shotSpeed; else altT.net = altT.pass + altT.release + dist(best.m, NET) / shotSpeed;
    const c = { s, R, best, drive: x.drive, useDrive, paths, secBefore, rush, carrier, passAt, start, shotSpeed, tNet, altT, result: s.result, shotXg: x.shotXg, x0, tEntry: -lead };
    // offside: nobody on the attacking side may be in the zone before the puck. Find when the puck crosses the blue line,
    // then frame() holds attackers at the line until it does and lets them in over the next 0.7 s.
    if (start.x < BLUE) { c.tEntry = 0; for (let t = -lead; t <= 0; t += 0.02) { if (frame(c, t, false, true).puck.x >= BLUE) { c.tEntry = t; break; } } }
    return c;
  }
  // position of a path at time t (seconds relative to the shot)
  function at(path, t) {
    const t0 = -lead, t1 = path.arrive; const u = ease(clamp((t - t0) / (t1 - t0), 0, 1));
    const x = lerp(path.sx, path.ex, u), y = lerp(path.sy, path.ey, u);
    const du = 0.05; const u2 = ease(clamp((t + du - t0) / (t1 - t0), 0, 1)); return { x, y, vx: (lerp(path.sx, path.ex, u2) - x) / du, vy: (lerp(path.sy, path.ey, u2) - y) / du };
  }
  function frame(c, t, alt, noGate) {
    const sk = c.paths.map(pt => ({ p: pt.p, ...at(pt, t) }));
    const shooter = sk.find(q => q.p === c.R.shooter);
    if (!noGate && c.tEntry > -lead) {
      // hold attackers without the puck at the blue line until the puck is in, then let them in over 0.7 s
      const g = t < c.tEntry ? 0 : ease(Math.min(1, (t - c.tEntry) / 0.7));
      for (const q of sk) { if (q.p.team !== c.R.shooter.team || q.p === c.carrier || q.p === c.R.shooter) continue; if (q.x > BLUE - 2) { const over = q.x - (BLUE - 2); q.x = BLUE - 2 + over * g; if (g < 1) { q.vx *= g; } } }
    }
    let puck, holder = null, note = '', light = 0;
    if (t < 0) {
      if (c.carrier && t < c.passAt) { holder = sk.find(q => q.p === c.carrier); puck = { x: holder.x + 2, y: holder.y }; }
      else if (c.carrier) { const from = at(c.paths.find(q => q.p === c.carrier), c.passAt); const flight = Math.min(1, (t - c.passAt) / Math.max(0.3, dist(from, shooter) / RP.passFtPerSec)); puck = flight < 1 ? { x: lerp(from.x, shooter.x, flight), y: lerp(from.y, shooter.y, flight), v: RP.passFtPerSec } : { x: shooter.x + 2, y: shooter.y }; if (flight >= 1) holder = shooter; }
      else { holder = shooter; puck = { x: shooter.x + 2, y: shooter.y }; }
    } else if (!alt) {
      // the real shot and its real result
      const u = Math.min(1, t / c.tNet); const ny = c.result === 'miss' ? NET.y + (shooter.y < 42.5 ? -5.5 : 5.5) : NET.y + (shooter.y - 42.5) * 0.06;
      puck = { x: lerp(shooter.x, NET.x, u), y: lerp(shooter.y, ny, u), v: u < 1 ? c.shotSpeed : 0 };
      if (t >= c.tNet) {
        const dt = t - c.tNet;
        if (c.result === 'goal') { puck = { x: NET.x + 2.5, y: ny }; light = Math.max(0, 1 - dt / 2.5); note = 'Goal'; }
        else if (c.result === 'miss') { const k = Math.min(1, dt / 1.5); puck = { x: lerp(NET.x, 196, Math.min(1, dt / 0.3)), y: lerp(ny, ny < 42.5 ? 8 : 77, k) }; note = 'Wide'; }
        else { const k = Math.min(1, dt / 1.8); puck = { x: lerp(NET.x - 3, 170, k), y: lerp(ny, ny < 42.5 ? 14 : 71, k) }; note = 'Save'; }
      }
    } else {
      // the model's alternative: a drive to the net, or the pass, the one-timer, and the look it would have been
      const T = c.altT;
      if (c.useDrive) {
        const sp = c.drive.spot;
        if (t < T.drive) { const u = t / T.drive; shooter.x = lerp(shooter.x, sp.x, u); shooter.y = lerp(shooter.y, sp.y, u); puck = { x: shooter.x + 2, y: shooter.y }; holder = shooter; }
        else if (t < T.drive + T.release) { shooter.x = sp.x; shooter.y = sp.y; puck = { x: sp.x + 2, y: sp.y }; holder = shooter; }
        else { shooter.x = sp.x; shooter.y = sp.y; const u = Math.min(1, (t - T.drive - T.release) / Math.max(0.05, T.net - T.drive - T.release)); puck = { x: lerp(sp.x, NET.x - 1, u), y: lerp(sp.y, NET.y + (sp.y - 42.5) * 0.06, u), v: u < 1 ? c.shotSpeed : 0 }; if (u >= 1) note = fmt(c.drive.xg) + ' look'; }
      } else {
      const rec = sk.find(q => q.p === c.best.m);
      if (t < T.pass) { const u = t / T.pass; puck = { x: lerp(shooter.x, rec.x, u), y: lerp(shooter.y, rec.y, u), v: RP.passFtPerSec }; }
      else if (t < T.pass + T.release) { puck = { x: rec.x + 2, y: rec.y }; holder = rec; }
      else { const u = Math.min(1, (t - T.pass - T.release) / Math.max(0.05, T.net - T.pass - T.release)); puck = { x: lerp(rec.x, NET.x - 1, u), y: lerp(rec.y, NET.y + (rec.y - 42.5) * 0.06, u), v: u < 1 ? c.shotSpeed : 0 }; if (u >= 1) note = fmt(c.best.recXg) + ' look'; }
      }
    }
    // after the shot everyone drifts on with the play: attackers toward the net, defenders hold
    if (t > 0) for (const q of sk) { const k = Math.min(1, t / 2); if (q.p.team === c.R.shooter.team && q.p !== c.R.shooter) { q.x += (NET.x - 8 - q.x) * 0.12 * k; q.y += (NET.y - q.y) * 0.1 * k; } }
    const goalie = { x: NET.x - 2.5, y: clamp(NET.y + (puck.y - NET.y) * 0.25, NET.y - 3.5, NET.y + 3.5), team: c.R.goalie.team };
    return { sk, puck, holder, goalie, note, light, shooter };
  }
  function detail(x) {
    const { s, R, best, shotXg } = x;
    clip = buildClip(x); tcur = -lead; playing = true; lastTs = 0;
    $('detail').innerHTML = `<h3>${s.team} #${num(s.shooter)} ${R.shooter.name}, period ${s.period} at ${s.clock}</h3>
      <p class="meta">${s.shotType || 'shot'} from ${Math.round(dist(R.shooter, NET))} ft, ${Math.round(angleTo(R.shooter))} degrees off the midline, ${s.strength.own} on ${s.strength.opp}${x.ctx.rebound ? ', rebound' : ''}${s.prev ? `, ${s.prev.secBefore}s after a ${s.prev.type.replace(/-/g, ' ')}` : ''}. Result: ${s.result === 'goal' ? 'goal' : s.result === 'miss' ? 'missed the net' : 'saved'}.</p>
      <div class="controls">
        <button type="button" id="playBtn" aria-pressed="true">Pause</button>
        <button type="button" id="replayBtn">Replay</button>
        <label title="Seconds of ice time before the shot; the clip runs ${RP.after} s of ice time after it">Lead-in <input type="number" id="leadIn" min="${RP.leadMin}" max="${RP.leadMax}" step="1" value="${lead}"> s ice time</label>
        <span class="spd" title="Playback speed; below 1x is slow motion"><button type="button" data-s="0.25" aria-pressed="${speed === 0.25}">0.25x</button><button type="button" data-s="0.5" aria-pressed="${speed === 0.5}">0.5x</button><button type="button" data-s="1" aria-pressed="${speed === 1}">1x</button></span>
        <input type="range" id="scrub" min="${-lead}" max="${RP.after}" step="0.05" value="${-lead}">
        <span id="tread" class="tread" title="Ice time relative to the shot">-${lead.toFixed(1)}s</span>
      </div>
      <div class="view" id="view">
        <button type="button" data-v="both" aria-pressed="true">Both: real play, model as a ghost</button>
        <button type="button" data-v="real">What happened</button>
        <button type="button" data-v="alt">What the model saw</button>
      </div>
      <canvas id="cA" width="1040" height="560"></canvas>
      <div class="reads">
        <div class="pane real"><h4>What happened</h4><p class="num">${fmt(shotXg)}<small>chance to score, shot taken</small></p><p>${R.shooter.name} shoots. ${R.opps.find(o => o.pressurer) ? 'Nearest defender ' + R.opps.find(o => o.pressurer).name + ' closing.' : ''}</p></div>
        <div class="pane alt"><h4>What the model saw</h4>${clip.useDrive ? `<p class="num">${fmt(x.drive.value)}<small>walk in ${RP_DRIVE.ft} ft and shoot</small></p><p>${Math.round((1 - x.drive.turnover) * 100)}% to get there with the puck${x.drive.inPath ? ` past ${x.drive.inPath} defender${x.drive.inPath > 1 ? 's' : ''}` : ''}, then a ${fmt(x.drive.xg)} look from ${Math.round(dist(x.drive.spot, NET))} ft${x.drive.pressure < 1 ? ' under pressure' : ''}.</p>` : `<p class="num">${fmt(best.value)}<small>pass to ${best.m.name}, then his shot</small></p><p>${Math.round(best.completion * 100)}% to complete a ${best.d} ft pass${best.blocked ? ' through a body' : ''}, then a ${fmt(best.recXg)} look from ${Math.round(dist(best.m, NET))} ft${best.pressure < 1 ? ' with a defender on him' : ''}.</p>`}</div>
      </div>
      <p class="note">${scenario === 'right' ? `The shot beat every alternative by ${(100 * x.gapRight).toFixed(1)} points: best pass ${fmt(best.value)}${x.drive ? `, drive ${fmt(x.drive.value)}` : ''}.` : clip.useDrive ? `Gap: ${(100 * x.gapDrive).toFixed(1)} points of expected goals in favor of driving to the net. Best pass instead: ${best ? best.m.name + ' ' + fmt(best.value) : 'none'}.` : `Gap: ${(100 * x.gapPass).toFixed(1)} points of expected goals in favor of the pass. Other options: ${x.options.slice(1, 4).map(o => `${o.m.name} ${fmt(o.value)}`).join(', ') || 'none'}${x.drive ? `; drive ${fmt(x.drive.value)}` : ''}.`} The shooter's spot, the shot and its result are real; the other positions are inferred and the movement is a mock reconstruction (${clip.rush ? 'rush' : 'in-zone'} scenario from the preceding ${s.prev ? s.prev.type.replace(/-/g, ' ') : 'play'}).</p>`;
    $('playBtn').onclick = () => { playing = !playing; $('playBtn').textContent = playing ? 'Pause' : 'Play'; $('playBtn').setAttribute('aria-pressed', playing); if (playing && tcur >= RP.after) tcur = -lead; };
    $('replayBtn').onclick = () => { tcur = -lead; playing = true; $('playBtn').textContent = 'Pause'; $('playBtn').setAttribute('aria-pressed', true); };
    $('leadIn').onchange = () => { lead = clamp(+$('leadIn').value || RP.leadDefault, RP.leadMin, RP.leadMax); $('leadIn').value = lead; $('scrub').min = -lead; clip = buildClip(x); tcur = -lead; };
    $('detail').querySelectorAll('.spd button').forEach(b => b.onclick = () => { speed = +b.dataset.s; $('detail').querySelectorAll('.spd button').forEach(o => o.setAttribute('aria-pressed', o === b)); });
    $('view').querySelectorAll('button').forEach(b => b.onclick = () => { view = b.dataset.v; $('view').querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b)); paint(); });
    $('scrub').oninput = () => { tcur = +$('scrub').value; playing = false; $('playBtn').textContent = 'Play'; $('playBtn').setAttribute('aria-pressed', false); paint(); };
    if (!raf) raf = requestAnimationFrame(tick);
    paint();
  }
  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (!clip) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0; lastTs = ts;
    if (playing) { tcur += dt * speed; if (tcur >= RP.after) { tcur = RP.after; playing = false; const b = $('playBtn'); if (b) { b.textContent = 'Play'; b.setAttribute('aria-pressed', false); } } }
    paint();
  }
  function paint() {
    const cA = $('cA'); if (!cA || !clip) return;
    const sc = $('scrub'); if (sc && document.activeElement !== sc) sc.value = tcur;
    const tr = $('tread'); if (tr) tr.textContent = (tcur < 0 ? '-' : '+') + Math.abs(tcur).toFixed(1) + 's';
    const Freal = frame(clip, tcur, false), Falt = frame(clip, tcur, true);
    const Preal = frame(clip, Math.max(-lead, tcur - 0.05), false), Palt = frame(clip, Math.max(-lead, tcur - 0.05), true);
    Freal.puckPrev = Preal.puck; Falt.puckPrev = Palt.puck;
    if (view === 'real') draw(cA, Freal, clip, tcur, false, null);
    else if (view === 'alt') draw(cA, Falt, clip, tcur, true, null);
    else draw(cA, Freal, clip, tcur, false, Falt);
  }

  // ---------- drawing: the offensive zone, shooter attacking right, in the sim's style ----------
  function draw(cv, F, c, t, alt, ghost) {
    const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
    const X0 = c.x0 !== undefined ? c.x0 : 96, X1 = 200, S = W / (X1 - X0); const px = x => (x - X0) * S, py = y => 20 + y * (H - 40) / 85;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#eef5fb'; ctx.fillRect(0, 0, W, H);
    const vline = (x, col, w) => { if (x < X0) return; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(85)); ctx.stroke(); };
    vline(100, '#c8102e', 2); vline(125, '#0b4ea2', 2); vline(75, '#0b4ea2', 2); vline(189, '#c8102e', 1); vline(11, '#c8102e', 1);
    ctx.lineWidth = 1; ctx.strokeStyle = '#c8102e';
    for (const cx of [169, 31]) if (cx - 15 > X0) for (const y of [20.5, 64.5]) { ctx.beginPath(); ctx.arc(px(cx), py(y), 15 * S, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(px(cx), py(y), 3, 0, Math.PI * 2); ctx.fill(); }
    for (const cx of [120, 80]) if (cx > X0) for (const y of [20.5, 64.5]) { ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(px(cx), py(y), 3, 0, Math.PI * 2); ctx.fill(); }
    if (X0 < 85) { ctx.strokeStyle = '#0b4ea2'; ctx.beginPath(); ctx.arc(px(100), py(42.5), 15 * S, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = '#0b4ea2'; ctx.beginPath(); ctx.arc(px(189), py(42.5), 6 * S, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    if (F.light > 0) { const g = ctx.createRadialGradient(px(192), py(42.5), 0, px(192), py(42.5), 16 * S); g.addColorStop(0, `rgba(230,30,30,${0.55 * F.light})`); g.addColorStop(1, 'rgba(230,30,30,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px(192), py(42.5), 16 * S, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(200,16,46,0.5)'; ctx.fillRect(px(189), py(39.5), 4 * S, 6 * (H - 40) / 85);
    ctx.fillStyle = '#9aa4b1'; ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('mock movement, inferred positions', 10, H - 8);
    const colors = { BOS: ['#000000', '#ffb81c'], MTL: ['#af1e2d', '#192168'] };
    const att = colors[c.R.shooter.team] || ['#333', '#999'], def = colors[F.goalie.team] || ['#777', '#ccc'];
    // skate trails for anyone moving fast
    ctx.lineCap = 'round';
    for (const q of F.sk) { const v = Math.hypot(q.vx, q.vy); if (v < 12) continue; const col = q.p.team === c.R.shooter.team ? (att[0] === '#000000' ? att[1] : att[0]) : (def[0] === '#000000' ? def[1] : def[0]); for (let k = 1; k <= 6; k++) { const tb = t - k * 0.08; const pos = at(c.paths.find(pp => pp.p === q.p), Math.max(-lead, tb)); ctx.strokeStyle = col; ctx.globalAlpha = 0.3 * (1 - k / 7); ctx.lineWidth = 1 + 3 * (1 - k / 7); ctx.beginPath(); ctx.moveTo(px(q.x), py(q.y)); ctx.lineTo(px(pos.x), py(pos.y)); ctx.stroke(); break; } }
    ctx.globalAlpha = 1;
    // goalie: a line squared to the puck
    const ga = Math.atan2(F.puck.y - F.goalie.y, F.puck.x - F.goalie.x); const hw = 2.8;
    ctx.strokeStyle = def[0]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px(F.goalie.x - Math.sin(ga) * hw), py(F.goalie.y + Math.cos(ga) * hw)); ctx.lineTo(px(F.goalie.x + Math.sin(ga) * hw), py(F.goalie.y - Math.cos(ga) * hw)); ctx.stroke();
    const dot = (q, col, col2, label, big) => {
      // stick toward the puck when close, else along the line of travel
      const dp = Math.hypot(F.puck.x - q.x, F.puck.y - q.y); const v = Math.hypot(q.vx || 0, q.vy || 0);
      const flying = (F.puck.v || 0) > 40 && F.holder !== q;   // nobody reaches for a puck in flight
      const sa = dp < 16 && !flying ? Math.atan2(F.puck.y - q.y, F.puck.x - q.x) : v > 2 ? Math.atan2(q.vy, q.vx) : null;
      if (sa !== null) { const len = F.holder === q ? Math.min(3.6, dp) : 3.4; const ex = q.x + Math.cos(sa) * len, ey = q.y + Math.sin(sa) * len; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(q.x), py(q.y)); ctx.lineTo(px(ex), py(ey)); ctx.stroke(); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px(ex), py(ey)); ctx.lineTo(px(ex + Math.cos(sa + 1.35) * 1.1), py(ey + Math.sin(sa + 1.35) * 1.1)); ctx.stroke(); }
      const rr = (big ? 11 : 9) * Math.max(0.8, Math.min(1.25, S / 8)); ctx.beginPath(); ctx.arc(px(q.x), py(q.y), rr, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col2; ctx.stroke();
      ctx.fillStyle = col2 === '#ffb81c' ? '#ffb81c' : '#fff'; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, px(q.x), py(q.y) + 0.5);
      if (F.holder === q) { ctx.beginPath(); ctx.arc(px(q.x), py(q.y), rr + 4, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke(); }
    };
    for (const q of F.sk) if (q.p.team !== c.R.shooter.team) dot(q, def[0], def[1], num(q.p.id), false);
    for (const q of F.sk) if (q.p.team === c.R.shooter.team && q.p !== c.R.shooter) dot(q, att[0], att[1], num(q.p.id), false);
    dot(F.shooter, att[0], att[1], num(c.R.shooter.id), true);
    if (alt && t >= 0 && c.useDrive) { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#0d8a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(c.R.shooter.x), py(c.R.shooter.y)); ctx.lineTo(px(c.drive.spot.x), py(c.drive.spot.y)); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#0d8a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(c.drive.spot.x), py(c.drive.spot.y), 15, 0, Math.PI * 2); ctx.stroke(); }
    if (alt && t >= 0 && !c.useDrive) { const rec = F.sk.find(q => q.p === c.best.m); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#0d8a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(F.shooter.x), py(F.shooter.y)); ctx.lineTo(px(rec.x), py(rec.y)); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#0d8a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(rec.x), py(rec.y), 15, 0, Math.PI * 2); ctx.stroke(); }
    // puck with a streak back along its own path when it is moving fast
    const streak = (pk, prev, col) => { if (!prev || !(pk.v > 40)) return; const dx = pk.x - prev.x, dy = pk.y - prev.y, L = Math.hypot(dx, dy) || 1; const k = Math.min(8, L * 3); ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px(pk.x), py(pk.y)); ctx.lineTo(px(pk.x - dx / L * k), py(pk.y - dy / L * k)); ctx.stroke(); ctx.globalAlpha = 1; };
    streak(F.puck, F.puckPrev, '#111');
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px(F.puck.x), py(F.puck.y), 3.2, 0, Math.PI * 2); ctx.fill();
    if (ghost && t >= 0) {
      // the model's alternative as a ghost on the same rink: green, translucent, same clock
      const g = '#0d8a5a';
      if (c.useDrive) { ctx.setLineDash([5, 5]); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(px(c.R.shooter.x), py(c.R.shooter.y)); ctx.lineTo(px(c.drive.spot.x), py(c.drive.spot.y)); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(px(ghost.shooter.x), py(ghost.shooter.y), 11, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(num(c.R.shooter.id), px(ghost.shooter.x), py(ghost.shooter.y) + 0.5); }
      else { const rec = ghost.sk.find(q => q.p === c.best.m); ctx.setLineDash([5, 5]); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(px(c.R.shooter.x), py(c.R.shooter.y)); ctx.lineTo(px(rec.x), py(rec.y)); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(rec.x), py(rec.y), 15, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      streak(ghost.puck, ghost.puckPrev, g);
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(13,138,90,0.35)'; ctx.beginPath(); ctx.arc(px(ghost.puck.x), py(ghost.puck.y), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (ghost.note) { ctx.fillStyle = g; ctx.font = '700 15px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(ghost.note, W - 12, 46); }
    }
    if (F.note) { ctx.fillStyle = alt ? '#0d8a5a' : (F.note === 'Goal' ? '#c8102e' : '#16202c'); ctx.font = '700 15px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(F.note, W - 12, 24); }
    ctx.fillStyle = '#5f6b78'; ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText((t < 0 ? '-' : '+') + Math.abs(t).toFixed(1) + 's', 12, 24);
  }

  $('method').innerHTML = `<p>Each unblocked shot in the game is placed on the rink from the play-by-play coordinates, with the shooter attacking to the right. The other nine skaters are not in the public data, so the page places the shooter's teammates on the spots of the offensive-zone system the sim runs for that club (Boston cycles low, Montreal plays an umbrella), mirrored to the puck side, and the defenders on zone coverage: a defenseman boxes out the net-front man, the center plays goal-side of the slot man, and the nearest free defender closes on the shooter.</p>
    <p>The shot taken is scored with the expected-goal model (distance, angle, shot type, rebound, strength), the same model and the same code the hockey sim uses, times the shooter's finishing from his last two seasons. Each teammate is scored as a one-timer from his spot, times the chance the pass gets there: 96% for a short pass, falling about half a point per foot, and less than half that through a defender's lane. A receiver with a defender within 4 ft keeps 60% of his look, within 8 ft 85%. The gap is the difference, in points of expected goals. A gap of 10 means the pass was worth a tenth of a goal more than the shot.</p>
    <p>Three scenarios. Pass worth more ranks shots by how much the best pass beat the shot. Drive worth more asks whether walking the puck 15 ft closer, cutting 6 ft toward the middle for a better angle (or away from the man closing on the shooter if he is on that side), and shooting from there was worth more. The page cannot see how close that man really was, so the drive assumes the cut beats him and charges for everyone else: the chance of getting there with the puck starts at 88% and drops 30 points for every other defender in a 4.5 ft corridor, and the look from the new spot keeps 60% with another defender within 4 ft, 85% within 8. Read a high drive gap as: if he had a step, the walk-in was worth it. Tips and deflections are left out, since nobody chose to shoot from there. Right call ranks the shots that beat every alternative by the most, so the list is not only criticism.</p>
    <p>One rink, three views. The default shows the real play with the model's alternative as a green ghost on the same clock from the moment of the shot: the pass or the walk-in, the ghost puck, and the look it would have been. The other two views show either read alone. The gray streak behind a puck is its own path, drawn only while it is in flight. The replay respects offside: attackers without the puck hold at the blue line until the puck is in the zone.</p>
    <p>The replay is a mock reconstruction, not tracking. All times are ice time: the lead-in is 2 to 8 seconds of game clock before the shot, the clip runs 3 seconds after, and the playback speed stretches that on your screen (0.5x is slow motion, the default). The puck starts at the real preceding event and is carried at about 15 mph toward the real shot; a long way means a teammate carries and passes, a short way means the shooter carries it himself, and if the event was farther than that speed covers in the lead-in, the carry is already under way when the clip opens. Skaters skate at real speeds for the whole lead-in: on a rush, forwards at 20 to 27 ft/s and back-checkers at 18 to 25 ft/s, so a 5 second lead-in starts in the neutral zone and the view widens to show it; in a cycle, everyone drifts a few feet around his spot. The pressuring defender arrives last. After the shot, the left panel plays the real result (goal, save or wide) and the right panel plays the pass, the one-timer and the look it would have been, with no invented result. Nothing in the replay is used for scoring; it is there to make the two reads easy to compare.</p>
    <p>What this does and does not prove. It finds the shots where a better option probably existed given where the teammates usually are. It cannot see whether the teammate was actually open, which is what video, or tracking data, settles. Tracking data, the position of every skater, both goalies and the puck many times a second, would change the page more than anything else: the nine positions it now infers at each shot would be observed, the pass and pressure numbers could be fit from real passes instead of set by hand, the expected-goal model could see where the goalie was and who screened him, and the replay would be the real play instead of a reconstruction. Model: logistic regression fit on ${XG.rowsUsed.toLocaleString()} MoneyPuck unblocked shots from the ${XG.sources.map(x => x.file.replace('shots_', '').replace('.csv', '')).join(' and ')} seasons; holdout log loss ${XG.fit.logLoss} against ${XG.fit.moneypuckLogLoss} for MoneyPuck's own model.</p>`;

  render();
})();
