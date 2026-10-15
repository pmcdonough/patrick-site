// Bruins vs Canadiens: the whole sim, one module for now (docs/RESTRUCTURE.md, step 1).
// index.html loads it with a version stamp (src/main.js?v=VERSION); bump both together.
// src/lab/worker.js imports it too, behind a stand-in page, to play Test a strategy games.
export function startSim(DATA) {
  const $ = id => document.getElementById(id);
  // admin settings (multipliers), driven by the sliders in the Admin panel
  const VERSION = '0.41';
  $('version').textContent = 'v' + VERSION; $('versionD').textContent = 'v' + VERSION;
  const cfg = { accel: 1, speed: 1, cruise: 1, passSpd: 1, glide: 1, goalie: 1, shots: 1, passAcc: 1 };
  const ADMIN = [['accel', 'Acceleration', 0.5, 2.5], ['speed', 'Top speed', 0.6, 1.6], ['cruise', 'Cruise effort', 0.5, 1.4], ['passSpd', 'Pass speed', 0.6, 1.6], ['passAcc', 'Pass accuracy', 0.5, 2], ['glide', 'Puck glide', 0.5, 2], ['goalie', 'Goalie coverage', 0.6, 1.4], ['shots', 'Shot volume', 0.4, 2.5]];
  const canvas = $('c'), ctx = canvas.getContext('2d');
  const RW = 200, RH = 85, GL = 11, NETW = 6, NETD = 4, CORNER = 28;
  const RINK_Y = 13, BENCH_H = 12, BOX_H = 10; // feet above and below the ice for benches and penalty boxes
  const S = canvas.width / RW; // px per ft
  const css = () => getComputedStyle(document.documentElement);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
    let z = XG.model.intercept + c.speed * (ctx && ctx.speed !== undefined ? ctx.speed : df.speed || 0) + c.offWing * (ctx && ctx.offWing !== undefined ? ctx.offWing : df.offWing || 0) + c.dist * d + c.logDist * Math.log(d + 1) + c.dist2 * d * d / 100 + c.angle * a + c.angle2 * a * a / 100 + c.distAngle * d * a / 100;
    if (ctx) { if (ctx.rebound) z += c.rebound; if (ctx.rush && c.rush !== undefined) z += c.rush; if (ctx.pp) z += c.pp; if (ctx.sh) z += c.sh; if (ctx.type && c['type_' + ctx.type] !== undefined) z += c['type_' + ctx.type]; }
    return 1 / (1 + Math.exp(-z));
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

  function readTactics() {
    const read = k => ({ fore: $(k + 'Fore').value, brk: $(k + 'Break').value, entry: $(k + 'Entry').value, oz: $(k + 'Oz').value, dz: $(k + 'Dz').value, pp: $(k + 'PP').value, pk: $(k + 'PK').value, agg: $(k + 'Agg').value / 100 });
    teams[0].tac = read('h'); teams[1].tac = read('a');
  }
  document.querySelectorAll('select, input[type=range]').forEach(el => el.addEventListener('input', readTactics));
  readTactics();
  // Hover text on the game-plan choices, read from the systems data: every option explains itself, the select shows the
  // current choice's explanation, and the aggression dial says what it changes.
  (() => {
    const SECTION = { Fore: 'forecheck', Break: 'breakout', Entry: 'entry', Oz: 'offensiveZone', Dz: 'defensiveZone', PP: 'powerPlay', PK: 'penaltyKill' };
    for (const side of ['h', 'a']) {
      for (const [suffix, section] of Object.entries(SECTION)) {
        const sel = $(side + suffix); if (!sel) continue;
        const describe = () => { const d = SYS[section][sel.value]; sel.title = d && d.desc ? `${d.label || sel.selectedOptions[0].textContent}: ${d.desc}` : ''; };
        for (const o of sel.options) { const d = SYS[section][o.value]; if (d && d.desc) o.title = d.desc; }
        sel.addEventListener('input', describe); describe();
      }
      const agg = $(side + 'Agg'); if (agg && SYS.coaching) { const d = SYS.coaching.aggression.desc; const show = () => { agg.title = `Aggression ${(agg.value / 100).toFixed(2)}. ${d}`; }; agg.addEventListener('input', show); show(); }
    }
  })();
  // build the admin sliders
  (() => {
    const box = $('admin');
    // each slider is centered on the build default (data/defaults.json) and carries a tick at 1.00, the NHL-average calibration
    const buildAdmin = (DATA.defaults && DATA.defaults.admin) || {};
    ADMIN.forEach(([k, label, lo, hi]) => {
      const def = buildAdmin[k] !== undefined ? +buildAdmin[k] : 1;
      let half = Math.max(def - lo, hi - def, 0.3); if (def - half < 0.1) half = def - 0.1; const min = +(def - half).toFixed(2), max = +(def + half).toFixed(2);
      const lab = document.createElement('label'); lab.htmlFor = 'adm_' + k; lab.innerHTML = label + ' <span></span>';
      const wrap = document.createElement('div'); wrap.className = 'slider';
      const inp = document.createElement('input'); inp.type = 'range'; inp.id = 'adm_' + k; inp.min = min; inp.max = max; inp.step = 0.05; inp.value = def;
      const tick = document.createElement('span'); tick.className = 'tick'; tick.title = 'NHL average (\u00d71.00)'; tick.style.left = (100 * (1 - min) / (max - min)).toFixed(1) + '%';
      const show = () => { lab.lastChild.textContent = '\u00d7' + (+inp.value).toFixed(2) + (Math.abs(+inp.value - def) < 0.001 ? ' (default)' : ''); };
      inp.addEventListener('input', () => { cfg[k] = +inp.value; show(); });
      cfg[k] = def; show(); wrap.append(inp, tick); box.append(lab, wrap);
    });
    const store = { get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
    const setAdmin = vals => ADMIN.forEach(([k]) => { const v = vals && vals[k] !== undefined ? vals[k] : (buildAdmin[k] !== undefined ? buildAdmin[k] : 1); cfg[k] = v; const i = $('adm_' + k); i.value = v; i.dispatchEvent(new Event('input')); });
    const adminNote = msg => { $('adminNote').textContent = msg; };
    $('adminSave').addEventListener('click', () => { adminNote(store.set('rink.admin', { ...cfg }) ? 'Saved. These values load automatically in this browser.' : 'Could not save in this browser.'); });
    $('adminReset').addEventListener('click', () => { const saved = store.get('rink.admin'); setAdmin(saved); adminNote(saved ? 'Reset to your saved defaults.' : 'Reset to factory values (nothing saved yet).'); });
    $('adminFactory').addEventListener('click', () => { store.del('rink.admin'); ADMIN.forEach(([k]) => { cfg[k] = 1; const i = $('adm_' + k); i.value = 1; i.dispatchEvent(new Event('input')); }); adminNote('Set every slider to the NHL-average calibration (\u00d71.00) and cleared saved defaults.'); });
    const BD = DATA.defaults || {};
    if (BD.admin) adminNote('Loaded the build defaults.');
    const savedAdmin = store.get('rink.admin'); if (savedAdmin) { setAdmin(savedAdmin); adminNote('Loaded your saved defaults.'); }
    // team systems: same idea for every select and slider in the two systems blocks
    const SYS_IDS = ['Fore', 'Break', 'Entry', 'Oz', 'Dz', 'PP', 'PK', 'Agg'].flatMap(f => ['h' + f, 'a' + f]);
    if (BD.systems) SYS_IDS.forEach(id => { const side = id[0] === 'h' ? 'BOS' : 'MTL'; const key = id.slice(1); const v = BD.systems[side] && BD.systems[side][key]; if (v !== undefined) $(id).value = key === 'Agg' ? Math.round(v * 100) : v; });
    readTactics();
    const factorySys = Object.fromEntries(SYS_IDS.map(id => [id, $(id).value]));
    const setSys = vals => { SYS_IDS.forEach(id => { const v = vals && vals[id] !== undefined ? vals[id] : factorySys[id]; $(id).value = v; $(id).dispatchEvent(new Event('input')); }); readTactics(); };
    const sysNote = msg => { $('sysNote').textContent = msg; };
    $('sysSave').addEventListener('click', () => { sysNote(store.set('rink.systems', Object.fromEntries(SYS_IDS.map(id => [id, $(id).value]))) ? 'Saved as your default systems.' : 'Could not save in this browser.'); });
    $('sysReset').addEventListener('click', () => { const saved = store.get('rink.systems'); setSys(saved); sysNote(saved ? 'Reset to your saved systems.' : 'Reset to the factory systems.'); });
    const savedSys = store.get('rink.systems'); if (savedSys) { setSys(savedSys); sysNote('Loaded your saved systems.'); }
    // export / import of the full settings as the data/defaults.json format
    const SYS_KEYS = ['Fore', 'Break', 'Entry', 'Oz', 'Dz', 'PP', 'PK', 'Agg'];
    const exportSettings = () => ({ schema: 'rink-sim-defaults/1', exported: new Date().toISOString().slice(0, 10),
      admin: Object.fromEntries(ADMIN.map(([k]) => [k, cfg[k]])),
      systems: { BOS: Object.fromEntries(SYS_KEYS.map(k => [k, k === 'Agg' ? $('h' + k).value / 100 : $('h' + k).value])), MTL: Object.fromEntries(SYS_KEYS.map(k => [k, k === 'Agg' ? $('a' + k).value / 100 : $('a' + k).value])) },
      notes: 'Engine multipliers and both clubs\' systems. Aggression is 0 to 1.' });
    $('exportBtn').addEventListener('click', () => { $('exportBox').hidden = false; $('exportText').value = JSON.stringify(exportSettings(), null, 2); });
    $('copyBtn').addEventListener('click', () => { const ta = $('exportText'); const done = () => adminNote('Copied to the clipboard.'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); adminNote('Select the text and copy it.'); }); else { ta.select(); adminNote('Select the text and copy it.'); } });
    $('applyBtn').addEventListener('click', () => { try { const j = JSON.parse($('exportText').value); if (j.admin) setAdmin(j.admin); if (j.systems) SYS_IDS.forEach(id => { const side = id[0] === 'h' ? 'BOS' : 'MTL'; const key = id.slice(1); const v = j.systems[side] && j.systems[side][key]; if (v !== undefined) $(id).value = key === 'Agg' ? Math.round(v * 100) : v; }); readTactics(); adminNote('Applied the pasted settings.'); } catch (e) { adminNote('That is not valid settings JSON.'); } });
  })();

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
      const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
      const sp = Math.min(top * cfg.speed, Math.sqrt(2 * PH.officials.accelFtPerSec2 * d));
      if (d > 0.3) { o.x += dx / d * sp * dt; o.y += dy / d * sp * dt; }
      keepOnIce(o, 1.2); keepOffNets(o, 1.4);
    }
  }
  const BLUE = [75, 125];

  function log(text, cls) {
    const li = document.createElement('li');
    const m = Math.floor(game.clock / 60), s = Math.floor(game.clock % 60);
    li.innerHTML = `<time>${['1st', '2nd', '3rd', 'OT'][game.period - 1]} ${m}:${String(s).padStart(2, '0')}</time><span class="${cls || ''}"></span>`;
    li.lastChild.textContent = text;
    const ul = $('log'); ul.prepend(li);
    while (ul.children.length > 60) ul.lastChild.remove();
  }

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

  // Record this session: wins, losses and overtime or shootout losses per club, kept while the page is open.
  const record = { w: [0, 0], l: [0, 0], otl: [0, 0] };
  function recordResult() {
    if (game.recorded || !game.over) return; game.recorded = true;
    const w = teams[0].score > teams[1].score ? 0 : 1, l = 1 - w;
    record.w[w]++; if (game.overtime || game.shootout) record.otl[l]++; else record.l[l]++;
    const el = $('record'); if (el) el.textContent = `This session: ${teams[0].abbr} ${record.w[0]}-${record.l[0]}-${record.otl[0]}, ${teams[1].abbr} ${record.w[1]}-${record.l[1]}-${record.otl[1]} (W-L-OTL)`;
    calibT = 0;
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
    game.period = 1; game.clock = 1200; game.over = false; $('log').innerHTML = '';
    // opening lines only after the clock, the period, the score and both penalty boxes are reset: the rotation reads all of them
    teams.forEach(t => stoppageChange(t, true));
    log('Puck drop at TD Garden. Bruins attack right.');
    setFaceoff(100, 42.5, 'Faceoff');
  }
  newGame();

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
        if (!window.__noDrift) { fy += 4 * Math.sin(tt * 1.1 + ph); fx += 3 * Math.sin(tt * 0.7 + ph); }
      } else {
        const OZ = SYS.offensiveZone[tac.oz]; const M = SYS.offensiveZone.motion;
        let role = p.role;
        // the cycle rotates: corner, half wall and net front are passed along every few seconds so the puck side keeps moving
        if (OZ.cycleOrder && !p.isD) { const i = OZ.cycleOrder.indexOf(role); if (i >= 0) role = OZ.cycleOrder[(i + Math.floor((t.possT || 0) / M.cycleEverySec)) % OZ.cycleOrder.length]; }
        [fx, fy] = OZ.spots[role];
        if (OZ.mirrorToPuckSide && pfy > 42) fy = 85 - fy;
        // nobody stands still: small drifts along the wall and across the slot so a lane opens
        const ph = { LW: 0, RW: 2.1, C: 4.2, LD: 1.0, RD: 3.1 }[p.role] || 0; const tt = game.period * 1200 - game.clock;
        if (!window.__noDrift) { fy += M.driftFt * Math.sin(tt * 1.1 + ph); fx += M.driftFt * 0.75 * Math.sin(tt * 0.7 + ph); }
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
    const a = Math.atan2(target.y - from.y, target.x - from.x) + rnd(-0.05, 0.05);
    const sp = soft ? E.chip.chipSpeedFtPerSec : E.dump.dumpSpeedFtPerSec;
    if (!soft) { t.dumpSide = from.y < 42 ? 'top' : 'bottom'; t.dumpT = 6; puck.rim = true; }
    puck.carrier = null; puck.vx = Math.cos(a) * sp; puck.vy = Math.sin(a) * sp; puck.lastTeam = t; puck.shot = false; puck.cool = 0.25; release(from);
  }
  // clear: under pressure in your own end, bang it off the boards up the near wall (or just flip it out on the kill)
  function clearPuck(from) {
    const t = from.team; const C = SYS.clearing;
    const target = toRink(t, C.aimFx, from.y < 42 ? 1.5 : 83.5);
    const a = Math.atan2(target.y - from.y, target.x - from.x) + rnd(-0.06, 0.06);
    const sp = C.speedFtPerSec * (0.85 + from.pass * 0.3);
    puck.carrier = null; puck.vx = Math.cos(a) * sp; puck.vy = Math.sin(a) * sp; puck.lastTeam = t; puck.shot = false; puck.cool = 0.25; release(from);
    puck.rim = true; puck.raceJudged = false; t.clears = (t.clears || 0) + 1;
  }
  // A penalty-kill clear down the ice: down the open lane closest to straight ahead, past the far goal line; with every
  // lane covered he lifts it over the sticks (nobody can touch it while it is in the air).
  function pkClear(from, opp) {
    const t = from.team, K = SYS.penaltyKill.clear;
    const lanes = K.laneYs.map(y => toRink(t, K.aimFx, y)).filter(g => laneClear(from, g, opp, K.laneWidthFt)).sort((a, b) => Math.abs(a.y - from.y) - Math.abs(b.y - from.y));
    const lift = !lanes.length, target = lift ? toRink(t, K.aimFx, 42.5) : lanes[0];
    const a = Math.atan2(target.y - from.y, target.x - from.x) + rnd(-K.aimSpreadRad, K.aimSpreadRad);
    const sp = K.speedFtPerSec * (0.9 + from.pass * 0.2);
    puck.carrier = null; puck.vx = Math.cos(a) * sp; puck.vy = Math.sin(a) * sp; puck.lastTeam = t; puck.shot = false; puck.receiver = null; puck.cool = lift ? K.liftSec : 0.25; release(from);
    puck.rim = Math.abs(target.y - 42.5) > 25; puck.raceJudged = false; t.clears = (t.clears || 0) + 1;
  }
  function laneClear(from, to, opp, width = 4) {
    const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy) || 1;
    for (const o of opp) {
      const t = clamp(((o.x - from.x) * dx + (o.y - from.y) * dy) / (L * L), 0, 1);
      const px = from.x + dx * t, py = from.y + dy * t;
      if (Math.hypot(o.x - px, o.y - py) < width && t > 0.08) return false;
    }
    return true;
  }
  function shotQuality(p, t) {
    const n = oppNet(t); const d = dist(p, n); const ang = Math.abs(Math.atan2(p.y - n.y, (n.x - p.x) * t.dir));
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
      const rate = cfg.shots * PR.baseRate * (Math.pow(q, PR.qualityPower) * (0.9 + agg * PR.aggressionWeight) * (0.6 + p.shoot * PR.shooterWeight) + (open && q > PR.openLookMinQuality ? PR.openLookBonus : 0) + (pressure < PR.pressureWithinFt ? PR.pressureBonus * q : 0)) + (pointShot && q > PS.minQuality ? PS.baseRate + (open ? PS.openBonus : 0) : 0);
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
    const a = Math.atan2(lead.y - from.y, lead.x - from.x) + rnd(-err, err);
    puck.carrier = null; puck.vx = Math.cos(a) * sp; puck.vy = Math.sin(a) * sp; puck.lastTeam = from.team; puck.shot = false; puck.cool = 0.25; release(from);
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
    const angleDeg = Math.abs(Math.atan2(p.y - n.y, (n.x - p.x) * t.dir)) * 180 / Math.PI;
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
    const a = Math.atan2(aimY - from.y, n.x - from.x) + rnd(-err, err);
    const sp = slap ? PH.shot.slap.baseFtPerSec + from.shoot * PH.shot.slap.perShootRating : PH.shot.wrist.baseFtPerSec + from.shoot * PH.shot.wrist.perShootRating;
    puck.carrier = null; puck.vx = Math.cos(a) * sp; puck.vy = Math.sin(a) * sp; puck.lastTeam = t; puck.shot = true; puck.shooter = from; puck.cool = 0.25; puck.beaten = false; release(from);
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
    const dx = Math.cos(a), dy = Math.sin(a); const L = dist(from, n);
        for (const o of active(ot)) {
      const along = (o.x - from.x) * dx + (o.y - from.y) * dy;
      if (along < 2 || along > L * PH.shotBlock.laneFraction) continue;
      const off = Math.abs(-(o.x - from.x) * dy + (o.y - from.y) * dx);
      const reach = PH.shotBlock.laneHalfWidthFt + (along < PH.shotBlock.closeWithinFt ? PH.shotBlock.closeBonusFt : 0); // a defender right on the shooter covers more of the lane
      if (off < reach && Math.random() < PH.shotBlock.probBase + o.def * PH.shotBlock.probPerDef) {
        ot.blocked++; puck.shot = false; puck.touched = true; puck.lastTeam = ot; puck.cool = 0.2; fxRing(o.x, o.y, '#222', false);
        puck.x = o.x + dx * 1.5; puck.y = o.y + dy * 1.5;
        const ra = Math.atan2(-dy, -dx) + rnd(-1.1, 1.1); const rs = rnd(12, 28);
        puck.vx = Math.cos(ra) * rs; puck.vy = Math.sin(ra) * rs;
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
      const ang = Math.atan2(puck.y - n.y, (puck.x - n.x) * t.dir);
      const depth = puck.carrier && puck.carrier.team === t ? 1.5 : clamp(4 - Math.abs(ang) * 2.5, 1, 4);
      g.target = { x: n.x + t.dir * depth, y: clamp(n.y + Math.sin(ang) * depth * 1.4, n.y - 4.5, n.y + 4.5) };
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
      const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
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
      const am = Math.hypot(ax, ay), acc = (p.goalie ? PH.goalie.accelFtPerSec2 : PH.skater.accelFtPerSec2 * cfg.accel * (1 - PH.skater.fatigue.accelSlowdown * fatigueLevel(p))) * dt;
      if (am > acc) { p.vx += ax / am * acc; p.vy += ay / am * acc; } else { p.vx += ax; p.vy += ay; }
      for (const o of all) if (o !== p && !o.goalie && !p.goalie) { const dd = dist(p, o); if (dd < 3 && dd > 0) { p.vx += (p.x - o.x) / dd * 8 * dt; p.vy += (p.y - o.y) / dd * 8 * dt; } }
      p.x += p.vx * dt; p.y += p.vy * dt; p.dist = (p.dist || 0) + Math.hypot(p.vx, p.vy) * dt; const spd = Math.hypot(p.vx, p.vy); if (spd > p.topSpd) p.topSpd = spd; if (spd > 29.3 && !p.burst) { p.bursts = (p.bursts || 0) + 1; p.burst = true; } if (spd < 26) p.burst = false;
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
      if (inX && inY) { const d = Math.hypot(o.x - cx, o.y - cy); if (d > CORNER - r) { const nx = (o.x - cx) / d, ny = (o.y - cy) / d; o.x = cx + nx * (CORNER - r); o.y = cy + ny * (CORNER - r); const dot = o.vx * nx + o.vy * ny; if (dot > 0) { o.vx -= (1 + rest) * dot * nx; o.vy -= (1 + rest) * dot * ny; } } }
    }
  }

  // Goalie coverage: a line centered on the goalie, perpendicular to the puck, as wide as his butterfly
  function goalieTargetAngle(g, qx, qy) {
    // square to the shot: face the puck's direction of travel when it is a shot coming his way, otherwise face the puck from the net
    const n = ownNet(g.team); const sp = Math.hypot(puck.vx, puck.vy);
    const incoming = sp > 40 && !puck.carrier && (puck.vx * g.team.dir < 0);
    return incoming ? Math.atan2(-puck.vy, -puck.vx) : Math.atan2(qy - n.y, (qx - n.x) * g.team.dir > 0 ? (qx - n.x) : g.team.dir * 0.5);
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
    const nx = -Math.sin(a), ny = Math.cos(a);
    return [g.x - nx * w, g.y - ny * w, g.x + nx * w, g.y + ny * w];
  }
  function pointToSegment(qx, qy, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1;
    const t = clamp(((qx - ax) * dx + (qy - ay) * dy) / L2, 0, 1);
    return Math.hypot(qx - (ax + dx * t), qy - (ay + dy * t));
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
      const c = puck.carrier; const a = Math.atan2(c.vy, c.vx) || 0; const m = Math.hypot(c.vx, c.vy);
      puck.x = c.x + (m > 1 ? Math.cos(a) * 2.2 : 0); puck.y = c.y + (m > 1 ? Math.sin(a) * 2.2 : 0);
      puck.vx = c.vx; puck.vy = c.vy;
      const t = c.team; const ot = teams[1 - t.id]; const opp = active(ot);
      for (const o of opp) {
        if (dist(o, c) < PH.turnover.stealRadiusFt) {
          if (!shorthanded(ot) && Math.random() < dt * (PH.turnover.minorPenaltyRateBase + ot.tac.agg * PH.turnover.minorPenaltyRatePerAggression) * clamp(o.pen60 / (MP ? MP.league.penaltiesPer60Skater : 0.7), 0.4, 2.2)) { penalize(o, c); return; }
          if (Math.random() < dt * (PH.turnover.stealRateBase + ot.tac.agg * PH.turnover.stealRatePerAggression) * (0.7 + o.def - c.skill * 0.6) * (c.rushed > 0 ? 3 : 1) * hands(c)) { puck.carrier = o; puck.cool = 0.3; ot.take++; puck.touched = true; fxRing(o.x, o.y, ot.col2, false); break; }
        }
      }
      return;
    }
    const sp = Math.hypot(puck.vx, puck.vy);
    const fr = (1 - PH.puck.frictionPerFrameAt60Hz / cfg.glide) ** (dt * 60); puck.vx *= fr; puck.vy *= fr;
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
          puck.lastTeam = t; puck.touched = true; if (FX.on && sp > 25) FX.saveFlash = { x: g.x, y: g.y, t: 0.3 };
          const FZ = PH.goalie.freeze; const attackers = active(teams[1 - t.id]).filter(o => dist(o, g) < FZ.attackerWithinFt).length;
          const fzScale = g.freezeRate && MP ? clamp(g.freezeRate / 0.21, 0.6, 1.6) : 1; // each goalie's own freeze tendency (freezes per shot on goal, league ~0.21)
          const freezeP = ((attackers ? FZ.probWithPressure : FZ.probNoPressure) + (hard ? FZ.hardShotBonus : 0)) * fzScale;
          if (sp > 25 && Math.random() < freezeP) { t.freezes++; setFaceoff(front > 0 ? 31 : 169, puck.y < 42 ? 20.5 : 64.5, 'Goalie freezes it'); log(`${g.name} covers it up${attackers ? ' with traffic in the crease' : ''}.`); return; }
          const a = Math.atan2(puck.y < 42 ? -1.6 : 1.6, front) + rnd(-0.4, 0.4); // steer the rebound to the corner
          puck.vx = Math.cos(a) * 45; puck.vy = Math.sin(a) * 45; puck.shot = false; puck.cool = PH.goalie.reboundCoolSec; puck.sinceSave = 0; // nobody gets it until it has traveled
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
          const a = Math.atan2(puck.vy, puck.vx) + rnd(-R.deflectAngleRad, R.deflectAngleRad), k = rnd(R.deflectSpeedMin, R.deflectSpeedMax);
          puck.vx = Math.cos(a) * sp * k; puck.vy = Math.sin(a) * sp * k; puck.receiver = null; puck.oneTimer = false; puck.lastTeam = d.team; puck.cool = 0.15; puck.touched = true;
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
          const a = Math.atan2(puck.vy, puck.vx) + rnd(-PH.pass.deflectAngleRad, PH.pass.deflectAngleRad), k = rnd(PH.pass.deflectSpeedMin, PH.pass.deflectSpeedMax);
          puck.vx = Math.cos(a) * sp * k; puck.vy = Math.sin(a) * sp * k; puck.receiver = null; puck.oneTimer = false; puck.lastTeam = best.team; puck.cool = 0.15;
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
    if (FX.on) { const n = ownNet(against); FX.goalLight = { net: n, dir: against.dir, t: 2.5 }; FX.lastGoalScorer = sh; FX.scorerT = 2.5; fxRing(puck.x, puck.y, scorer.col2, true); }
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
    const w = goals[0] > goals[1] ? 0 : 1; teams[w].score++; game.shootout = true; game.over = true; recordResult();
    log(`Final: ${teams[w].name} win ${teams[w].score}-${teams[1 - w].score} in a shootout (${goals[0]}-${goals[1]}).`, 'goal'); game.note = 'Final (SO)';
  }
  function endPeriod() {
    if (game.period >= 3 && teams[0].score !== teams[1].score) {
      game.over = true; const w = teams[0].score > teams[1].score ? teams[0] : teams[1]; if (game.period === 4) game.overtime = true;
      log(`Final: ${w.name} win ${Math.max(teams[0].score, teams[1].score)}-${Math.min(teams[0].score, teams[1].score)}${game.period === 4 ? ' in overtime' : ''}.`, 'goal'); game.note = game.period === 4 ? 'Final (OT)' : 'Final'; recordResult(); return;
    }
    if (game.period >= 4) { shootout(); return; }
    game.period++; game.clock = game.period === 4 ? 300 : 1200;
    teams.forEach(t => t.dir *= -1);
    log(`${['1st', '2nd', '3rd', 'OT'][game.period - 1]} period. Teams switch ends.`);
    teams.forEach(t => stoppageChange(t, true));
    setFaceoff(100, 42.5, 'Faceoff');
  }

  // ---------- Effects: skate trails, puck streak, hit ripples, goal light ----------
  const FX = { on: true, sticks: true, sight: true, rings: [], goalLight: null, saveFlash: null, lastGoalScorer: null, scorerT: 0 };
  try { FX.on = localStorage.getItem('rinkFx') !== 'off'; FX.sticks = localStorage.getItem('rinkSticks') !== 'off'; FX.sight = localStorage.getItem('rinkSight') !== 'off'; } catch (e) {}
  const fxRing = (x, y, col, big) => { if (FX.on) FX.rings.push({ x, y, col, t: 0, max: big ? 0.9 : 0.5, r: big ? 9 : 5 }); };
  function fxTick(dt) {
    for (const r of FX.rings) r.t += dt; FX.rings = FX.rings.filter(r => r.t < r.max);
    if (FX.goalLight) { FX.goalLight.t -= dt; if (FX.goalLight.t <= 0) FX.goalLight = null; }
    if (FX.saveFlash) { FX.saveFlash.t -= dt; if (FX.saveFlash.t <= 0) FX.saveFlash = null; }
    if (FX.scorerT > 0) FX.scorerT -= dt;
    if (!FX.on) return;
    for (const t of teams) for (const p of t.players) {
      if (!p.onIce || p.goalie) { p.trail = null; continue; }
      const v = Math.hypot(p.vx, p.vy);
      if (!p.trail) p.trail = [];
      p.trail.push({ x: p.x, y: p.y, v }); if (p.trail.length > 16) p.trail.shift();
    }
    if (!puck.trail) puck.trail = [];
    puck.trail.push({ x: puck.x, y: puck.y, v: Math.hypot(puck.vx, puck.vy), c: !!puck.carrier }); if (puck.trail.length > 12) puck.trail.shift();
  }
  function drawFx() {
    if (!FX.on) return;
    // goal light: a red glow behind the net that was just beaten
    if (FX.goalLight) {
      const n = FX.goalLight.net; const k = FX.goalLight.t / 2.5; const pulse = 0.55 + 0.45 * Math.sin(FX.goalLight.t * 14);
      const g = ctx.createRadialGradient(n.x - FX.goalLight.dir * 3, n.y, 0, n.x - FX.goalLight.dir * 3, n.y, 16);
      g.addColorStop(0, `rgba(230,30,30,${0.55 * k * pulse})`); g.addColorStop(1, 'rgba(230,30,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x - FX.goalLight.dir * 3, n.y, 16, 0, Math.PI * 2); ctx.fill();
    }
    // save flash: a quick white bloom on the goalie
    if (FX.saveFlash) { const f = FX.saveFlash; const k = f.t / 0.3; ctx.fillStyle = `rgba(255,255,255,${0.7 * k})`; ctx.beginPath(); ctx.arc(f.x, f.y, 2 + (1 - k) * 4, 0, Math.PI * 2); ctx.fill(); }
    // skate trails: a tapered ribbon behind anyone really moving, in his team's color
    ctx.lineCap = 'round';
    for (const t of teams) for (const p of t.players) {
      const tr = p.trail; if (!tr || tr.length < 3) continue;
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i]; const k = i / tr.length; const sp = clamp((a.v - 14) / 16, 0, 1); if (sp <= 0) continue;
        ctx.strokeStyle = t.trailCol || (t.trailCol = /^#[0-2]/.test(t.col) ? t.col2 : t.col); ctx.globalAlpha = 0.35 * k * sp; ctx.lineWidth = 0.6 + 1.6 * k * sp;
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(a.x, a.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // puck streak on shots and hard passes
    const pt = puck.trail;
    if (pt && pt.length > 2) for (let i = 1; i < pt.length; i++) {
      const a = pt[i]; if (a.c || a.v < 40) continue; const k = i / pt.length;
      ctx.strokeStyle = '#111'; ctx.globalAlpha = 0.5 * k; ctx.lineWidth = 0.3 + 0.9 * k;
      ctx.beginPath(); ctx.moveTo(pt[i - 1].x, pt[i - 1].y); ctx.lineTo(a.x, a.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // rings: hits, blocks and the scorer
    for (const r of FX.rings) { const k = r.t / r.max; ctx.strokeStyle = r.col; ctx.globalAlpha = 0.8 * (1 - k); ctx.lineWidth = 0.7 * (1 - k) + 0.2; ctx.beginPath(); ctx.arc(r.x, r.y, 2.5 + r.r * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  $('fxBtn').addEventListener('click', () => { FX.on = !FX.on; $('fxBtn').setAttribute('aria-pressed', FX.on); try { localStorage.setItem('rinkFx', FX.on ? 'on' : 'off'); } catch (e) {} });
  $('fxBtn').setAttribute('aria-pressed', FX.on);
  const showSight = () => { $('sightBtn').setAttribute('aria-pressed', FX.sight); $('sightLegend').hidden = !FX.sight; };
  $('sightBtn').addEventListener('click', () => { FX.sight = !FX.sight; showSight(); try { localStorage.setItem('rinkSight', FX.sight ? 'on' : 'off'); } catch (e) {} });
  showSight();
  $('stickBtn').addEventListener('click', () => { FX.sticks = !FX.sticks; $('stickBtn').setAttribute('aria-pressed', FX.sticks); try { localStorage.setItem('rinkSticks', FX.sticks ? 'on' : 'off'); } catch (e) {} });
  $('stickBtn').setAttribute('aria-pressed', FX.sticks);

  function tick(dt) {
    fxTick(dt);
    if (game.over) return;
    if (game.faceoff) {
      game.faceT -= dt;
      if (game.faceT <= 0) {
        const hc = teams[0].onF.find(p => p.role === 'C') || teams[0].onF[0], ac = teams[1].onF.find(p => p.role === 'C') || teams[1].onF[0];
        const fh = hc ? hc.faceoff : 0.45, fa = ac ? ac.faceoff : 0.45;
        const win = Math.random() < fh / (fh + fa) ? teams[0] : teams[1];
        teams[0].faceoffs++; teams[1].faceoffs++; win.faceoffsWon++;
        const d = win.onD[Math.floor(Math.random() * win.onD.length)] || win.onF[0];
        const a = Math.atan2(d.y - puck.y, d.x - puck.x); puck.vx = Math.cos(a) * 30; puck.vy = Math.sin(a) * 30; puck.lastTeam = win; puck.cool = 0.1;
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
    if (!game.faceoff && !puck.carrier) { const sp0 = Math.hypot(puck.vx, puck.vy); puck.deadT = sp0 < 2 && !skaters().some(p => dist(p, puck) < 6) ? (puck.deadT || 0) + dt : 0; if (puck.deadT > 3) { log('Whistle: dead puck.'); setFaceoff(puck.x < 100 ? (puck.x < 75 ? 31 : 80) : (puck.x > 125 ? 169 : 120), puck.y < 42.5 ? 20.5 : 64.5, 'Dead puck'); } }
    if (game.clock <= 0) { game.clock = 0; endPeriod(); }
  }

  // ---------- Drawing ----------
  function drawRink() {
    const s = css(); const ice = s.getPropertyValue('--ice').trim();
    ctx.save(); ctx.scale(S, S); ctx.translate(0, RINK_Y);
    ctx.fillStyle = ice;
    roundRect(0, 0, RW, RH, CORNER); ctx.fill();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = s.getPropertyValue('--ice-line-red').trim();
    [GL, RW - GL].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, RH - 6); ctx.stroke(); });
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, RH); ctx.stroke();
    ctx.strokeStyle = s.getPropertyValue('--ice-line-blue').trim();
    BLUE.forEach(x => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, RH); ctx.stroke(); });
    ctx.lineWidth = 0.25;
    ctx.beginPath(); ctx.arc(100, RH / 2, 15, 0, Math.PI * 2); ctx.stroke();
    // center-ice logo spot in the home colors
    ctx.fillStyle = 'rgba(255,184,28,0.35)'; ctx.beginPath(); ctx.arc(100, RH / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = s.getPropertyValue('--ice-line-red').trim();
    [[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); });
    [[80, 20.5], [80, 64.5], [120, 20.5], [120, 64.5]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(100,170,230,0.35)';
    [[GL, 1], [RW - GL, -1]].forEach(([x, d]) => {
      ctx.beginPath(); ctx.moveTo(x, RH / 2 - 4); ctx.arc(x, RH / 2, 6, -Math.PI / 2 * d, Math.PI / 2 * d, d < 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(200,16,46,0.35)'; ctx.fillRect(d > 0 ? x - NETD : x, RH / 2 - NETW / 2, NETD, NETW); ctx.strokeRect(d > 0 ? x - NETD : x, RH / 2 - NETW / 2, NETD, NETW);
      ctx.fillStyle = 'rgba(100,170,230,0.35)';
    });
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawSkater(p, x, y, r, dim) {
    const t = p.team;
    ctx.globalAlpha = dim ? 0.55 : 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = t.col; ctx.fill();
    ctx.lineWidth = r * 0.22; ctx.strokeStyle = p.goalie ? '#ffffff' : t.col2; ctx.stroke();
    ctx.fillStyle = t.ink; ctx.font = `700 ${r * 1.05}px Barlow, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.num, x, y + r * 0.05);
    ctx.globalAlpha = 1;
  }
  function drawGoalie(g) {
    const t = g.team; const seg = goalieLine(g);
    ctx.lineCap = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = t.col; ctx.beginPath(); ctx.moveTo(seg[0], seg[1]); ctx.lineTo(seg[2], seg[3]); ctx.stroke();
    ctx.lineWidth = 0.5; ctx.strokeStyle = t.col2; ctx.beginPath(); ctx.moveTo(seg[0], seg[1]); ctx.lineTo(seg[2], seg[3]); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.x, g.y, 1.5, 0, Math.PI * 2); ctx.fillStyle = t.col; ctx.fill(); ctx.lineWidth = 0.35; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = t.ink; ctx.font = '700 1.5px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.num, g.x, g.y + 0.1);
  }
  function drawBenches() {
    const s = css();
    ctx.save(); ctx.scale(S, S);
    ctx.font = '800 3.2px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textBaseline = 'middle';
    for (const t of teams) {
      // bench above the ice
      const b = t.bench;
      ctx.fillStyle = s.getPropertyValue('--panel').trim(); ctx.strokeStyle = s.getPropertyValue('--line').trim(); ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.roundRect(b.x0, 0.6, b.x1 - b.x0, BENCH_H - 0.6, 1.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = t.col; ctx.fillRect(b.x0, 0.6, b.x1 - b.x0, 3.0);
      ctx.fillStyle = t.ink; ctx.textAlign = 'left'; ctx.font = '800 2.6px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(`${t.name.toUpperCase()} BENCH`, b.x0 + 1.2, 2.15);
      // door marker
      const fd = fDoor(t), dd = dDoor(t);
      ctx.fillStyle = t.col2; ctx.fillRect(fd - 3, BENCH_H - 0.6, 6, 0.6); ctx.fillRect(dd - 3, BENCH_H - 0.6, 6, 0.6);
      ctx.fillStyle = s.getPropertyValue('--fg-dim').trim(); ctx.font = '700 1.6px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('F', fd, BENCH_H - 1.4); ctx.fillText('D', dd, BENCH_H - 1.4);
      // who is on deck: the next line and pair stand at the gate once the unit on the ice is getting tired
      const deck = new Set();
      for (const unit of ['F', 'D']) {
        const on = unit === 'F' ? t.onF : t.onD; if (!on.length) continue;
        const avg = on.reduce((q, p) => q + p.shift, 0) / on.length;
        if (avg > shiftTarget(t, unit, unit === 'F' ? t.lineF : t.lineD) - 12 || on.some(p => p.leaving)) {
          [...t.onF, ...t.onD].forEach(p => { if (p.sub) deck.add(p.sub); });
          if (!on.some(p => p.leaving)) buildUnit(t, unit, peekLine(t, unit)).forEach(p => deck.add(p));
        }
      }
      const benched = [...t.all.filter(p => !p.onIce && !p.box && !deck.has(p)), t.goalies[1]];
      const row1 = benched.filter(p => !p.isD && !p.goalie), row2 = benched.filter(p => p.isD || p.goalie);
      // forwards sit at their door's end of the bench, defense (and the backup goalie) at theirs
      const fSide = fd > dd ? 1 : -1;
      row1.forEach((p, i) => drawSkater(p, fSide > 0 ? b.x1 - 3 - i * 3.6 : b.x0 + 3 + i * 3.6, 5.3, 1.15, false));
      row2.forEach((p, i) => drawSkater(p, fSide > 0 ? b.x0 + 3 + i * 3.6 : b.x1 - 3 - i * 3.6, 7.9, 1.15, false));
      // on deck: each man stands at his unit's door, forwards and defense on their own sides
      const deckF = [...deck].filter(p => !p.isD), deckD = [...deck].filter(p => p.isD);
      const place = (list, door, side) => list.map((p, i) => ({ p, x: door + side * (i - (list.length - 1) / 2) * 3.0 }));
      [...place(deckF, fd, 1), ...place(deckD, dd, 1)].forEach(({ p, x }) => { const y = BENCH_H - 1.7; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,140,0,0.35)'; ctx.fill(); drawSkater(p, x, y, 1.15, false); });
      if (t.flash) { ctx.globalAlpha = Math.min(1, t.flash.t); ctx.fillStyle = '#ff8c00'; ctx.textAlign = 'right'; ctx.font = '800 2.6px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(t.flash.text, b.x1 - 1.2, 2.15); ctx.globalAlpha = 1; }
      // penalty box below the ice
      const pb = t.pbox; const y0 = RINK_Y + RH + 0.8;
      ctx.fillStyle = s.getPropertyValue('--panel').trim(); ctx.strokeStyle = s.getPropertyValue('--line').trim();
      ctx.beginPath(); ctx.roundRect(pb.x0, y0, pb.x1 - pb.x0, BOX_H - 1.4, 1.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = s.getPropertyValue('--fg-dim').trim(); ctx.textAlign = 'left'; ctx.font = '800 3.2px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(`${t.abbr} PENALTY BOX`, pb.x0 + 1.2, y0 + 2.4);
      const boxed = t.all.filter(p => p.box > 0);
      boxed.forEach((p, i) => {
        const x = pb.x0 + 4 + i * 9, y = y0 + 6;
        drawSkater(p, x, y, 1.6, false);
        ctx.fillStyle = '#d9480f'; ctx.textAlign = 'left'; ctx.font = '700 2.6px "Barlow Condensed", sans-serif';
        ctx.fillText(`${Math.floor(p.box / 60)}:${String(Math.floor(p.box % 60)).padStart(2, '0')}`, x + 2.4, y);
        ctx.font = '800 3.2px "Barlow Condensed", "Arial Narrow", sans-serif';
      });
    }
    // timekeeper's bench between the boxes
    ctx.fillStyle = s.getPropertyValue('--fg-dim').trim(); ctx.textAlign = 'center'; ctx.font = '800 3.2px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText('SCOREKEEPER', 100, RINK_Y + RH + 5.5);
    ctx.restore();
  }
  // Sight lines: what the puck carrier sees in the offensive zone. A lit wedge from him to the posts, a shadow behind every
  // defender in front of him, a line to his best pass (bold when it is worth more than his shot) and both values as a tag.
  // Drawn from the same read carrierThink decides with (readLook); it changes nothing in the game.
  function drawSight() {
    const c = puck.carrier; if (!c || c.goalie || c.box) return;
    const t = c.team; if (zone(t, c.x) !== 'off') return;
    const opp = active(teams[1 - t.id]), mates = active(t).filter(m => m !== c && !m.leaving);
    const read = readLook(c, t, opp, mates, Math.min(...opp.map(o => dist(o, c)))); if (!read) return;
    const n = oppNet(t), posts = [{ x: n.x, y: n.y - NETW / 2 }, { x: n.x, y: n.y + NETW / 2 }];
    const far = q => ({ x: c.x + (q.x - c.x) * 1.04, y: c.y + (q.y - c.y) * 1.04 });
    ctx.save();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); const f0 = far(posts[0]), f1 = far(posts[1]); ctx.lineTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.closePath();
    ctx.fillStyle = 'rgba(255, 200, 60, 0.38)'; ctx.fill();
    ctx.strokeStyle = 'rgba(214, 150, 0, 0.9)'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(f0.x, f0.y); ctx.lineTo(c.x, c.y); ctx.lineTo(f1.x, f1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(22, 32, 44, 0.3)';
    const toNet = { x: n.x - c.x, y: n.y - c.y };
    for (const o of opp) {
      const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy), r = 2.2;
      if (d < r + 0.5 || dx * toNet.x + dy * toNet.y <= 0) continue;
      const a = Math.atan2(dy, dx), h = Math.asin(r / d), L = 90;
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(a + Math.PI / 2 + h) * r, o.y + Math.sin(a + Math.PI / 2 + h) * r);
      ctx.lineTo(c.x + Math.cos(a + h) * L, c.y + Math.sin(a + h) * L); ctx.lineTo(c.x + Math.cos(a - h) * L, c.y + Math.sin(a - h) * L);
      ctx.lineTo(o.x + Math.cos(a - Math.PI / 2 - h) * r, o.y + Math.sin(a - Math.PI / 2 - h) * r); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // what he will do with it, by the same rule carrierThink uses: shoot a look worth taking unless a pass is clearly better
    const XC = PH.shotDecision.xgChoice;
    const reads = read.myV >= XC.minXg && read.myV * XC.passMustBeatBy >= read.bestV ? 'shoot' : read.best && read.bestV > read.myV * XC.passMustBeatBy && read.bestV >= XC.minXg ? 'pass' : 'hold';
    if (read.best) {
      const strong = reads === 'pass';
      ctx.save(); ctx.strokeStyle = '#0b4ea2'; ctx.globalAlpha = strong ? 0.95 : 0.55; ctx.lineWidth = strong ? 0.7 : 0.45; ctx.setLineDash([1.6, 1.2]);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(read.best.x, read.best.y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 0.45; ctx.beginPath(); ctx.arc(read.best.x, read.best.y, 3.2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // the tag: a yellow wedge mark with his shot, a blue dash with the pass and who it goes to, and his read
    const pctv = v => Math.round(v * 100) + '%';
    const parts = [['wedge', `Shot ${pctv(read.myV)}`], ...(read.best ? [['dash', `Pass to #${read.best.num} ${pctv(read.bestV)}`]] : []), ['read', reads === 'shoot' ? 'Shooting' : reads === 'pass' ? 'Passing' : 'Holding for a better play']];
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const fontN = '600 2.1px Barlow, "Segoe UI", sans-serif', fontB = '800 2.1px Barlow, "Segoe UI", sans-serif', icon = 2.2, gap = 1.3;
    const widths = parts.map(([k, txt]) => { ctx.font = k === 'read' ? fontB : fontN; return ctx.measureText(txt).width + (k === 'read' ? 0 : icon + 0.6); });
    const w = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) + 1.8, h = 3.2, x = clamp(c.x - w / 2, 1, 199 - w), y = Math.max(0.5, c.y - 7.4);
    ctx.fillStyle = 'rgba(22, 32, 44, 0.9)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 1.6); else ctx.rect(x, y, w, h); ctx.fill();
    let cx = x + 0.9; const my = y + h / 2;
    parts.forEach(([k, txt], i) => {
      if (k === 'wedge') { ctx.fillStyle = 'rgba(255, 200, 60, 0.95)'; ctx.beginPath(); ctx.moveTo(cx, my); ctx.lineTo(cx + icon, my - 0.9); ctx.lineTo(cx + icon, my + 0.9); ctx.closePath(); ctx.fill(); cx += icon + 0.6; }
      if (k === 'dash') { ctx.strokeStyle = '#7fb0ee'; ctx.lineWidth = 0.45; ctx.setLineDash([0.6, 0.45]); ctx.beginPath(); ctx.moveTo(cx, my); ctx.lineTo(cx + icon, my); ctx.stroke(); ctx.setLineDash([]); cx += icon + 0.6; }
      ctx.font = k === 'read' ? fontB : fontN; ctx.fillStyle = k === 'read' ? (reads === 'hold' ? '#c9d3de' : '#ffd166') : '#fff';
      ctx.fillText(txt, cx, my + 0.1); cx += ctx.measureText(txt).width + gap;
    });
    ctx.restore();
  }
  function drawPlayers() {
    ctx.save(); ctx.scale(S, S); ctx.translate(0, RINK_Y);
    drawFx();
    if (FX.sight) drawSight();
    for (const t of teams) for (const p of t.players) {
      if (p.box) continue;
      // shadow for fatigue: a tired skater's ring fades
      if (p.goalie) { drawGoalie(p); continue; }
      drawSkater(p, p.x, p.y, 2.0, p.leaving);
      const fl = fatigueLevel(p);
      if (fl > 0.3) {   // tired: amber arc, red when gassed
        ctx.globalAlpha = 1;
        ctx.strokeStyle = fl > 0.75 ? 'rgba(220,60,50,0.9)' : 'rgba(240,170,40,0.85)';
        ctx.lineWidth = 0.45; ctx.beginPath(); ctx.arc(p.x, p.y, 2.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fl); ctx.stroke();
      }
      // stick: on the puck when it is close, otherwise carried along the line of travel; a short blade at the end
      const m = Math.hypot(p.vx, p.vy); const dp = dist(p, puck);
      let sa = null; if (dp < 16 && !p.leaving) sa = Math.atan2(puck.y - p.y, puck.x - p.x); else if (m > 2) sa = Math.atan2(p.vy, p.vx);
      if (!FX.sticks) { if (m > 2) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx / m * 3.4, p.y + p.vy / m * 3.4); ctx.lineWidth = 0.4; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke(); } }
      else if (sa !== null) {
        const len = p === puck.carrier ? Math.min(3.6, dp) : 3.4; const ex = p.x + Math.cos(sa) * len, ey = p.y + Math.sin(sa) * len;
        ctx.lineWidth = 0.4; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(sa + 1.35) * 1.1, ey + Math.sin(sa + 1.35) * 1.1); ctx.stroke();
      }
      if (FX.on && FX.scorerT > 0 && p === FX.lastGoalScorer) { const k = 0.5 + 0.5 * Math.sin(FX.scorerT * 10); ctx.strokeStyle = t.col2; ctx.globalAlpha = 0.9; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(p.x, p.y, 3.6 + k, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      if (p === puck.carrier) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.3, 0, Math.PI * 2); ctx.lineWidth = 0.5; ctx.strokeStyle = '#111'; ctx.stroke(); }
      if (p.leaving) { // headed to the gate
        ctx.setLineDash([1.2, 1.2]); ctx.strokeStyle = t.col2 === '#ffb81c' ? '#b8860b' : t.col; ctx.lineWidth = 0.35;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(doorFor(t, p), 0.5); ctx.stroke(); ctx.setLineDash([]);
      }
      if (p.entering) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.0, 0, Math.PI * 2); ctx.lineWidth = 0.5; ctx.strokeStyle = t.col2; ctx.stroke(); }
    }
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(puck.x, puck.y, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawOfficials() {
    ctx.save(); ctx.scale(S, S); ctx.translate(0, RINK_Y);
    for (const o of officials) {
      const calling = game.whistle && game.whistle.who === o;
      if (calling) { const k = 0.5 + 0.5 * Math.sin(performance.now() / 120); ctx.beginPath(); ctx.arc(o.x, o.y, 3.6 + k, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,140,0,' + (0.25 + 0.25 * k) + ')'; ctx.fill(); }
      ctx.save(); ctx.beginPath(); ctx.arc(o.x, o.y, 1.6, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(o.x - 2, o.y - 2, 4, 4);
      ctx.fillStyle = '#111'; [-1.35, -0.45, 0.45, 1.35].forEach(dx => ctx.fillRect(o.x + dx - 0.22, o.y - 2, 0.44, 4));
      ctx.restore();
      ctx.beginPath(); ctx.arc(o.x, o.y, 1.6, 0, Math.PI * 2); ctx.lineWidth = 0.3; ctx.strokeStyle = calling ? '#ff8c00' : '#111'; ctx.stroke();
      if (o.kind === 'ref') { ctx.fillStyle = '#ff8c00'; ctx.beginPath(); ctx.arc(o.x, o.y, 0.55, 0, Math.PI * 2); ctx.fill(); }
      if (calling) { ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 0.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(o.x + 1.2, o.y - 0.6); ctx.lineTo(o.x + 2.4, o.y - 3.4); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawWhistle() {
    const w = game.whistle; if (!w) return;
    ctx.save(); ctx.scale(S, S); ctx.translate(0, RINK_Y);
    const o = w.who; const label = w.text.toUpperCase();
    ctx.font = '800 3px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 4; const bx = clamp(o.x, tw / 2 + 2, RW - tw / 2 - 2); const by = o.y < 42 ? o.y + 6 : o.y - 6;
    ctx.globalAlpha = Math.min(1, w.t); ctx.fillStyle = '#ff8c00';
    ctx.beginPath(); ctx.roundRect(bx - tw / 2, by - 2.2, tw, 4.4, 1); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillText(label, bx, by + 0.1);
    ctx.setLineDash([1, 1]); ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(w.at.x, w.at.y); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(w.at.x, w.at.y, 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------- Roster sheets ----------
  const mmss = v => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  function buildSheets() {
    teams.forEach(t => {
      const el = $(t.id ? 'sheetA' : 'sheetH');
      const PD = DATA.rosters.teams[t.key].players;
      const tip = p => { const d = PD[p.id]; if (!d) return ''; const st = d.stats; return p.goalie ? `${st.season}: ${st.gp} GP, ${st.w}-${st.l}, .${String(Math.round(st.svPct * 1000)).padStart(3, '0')} SV%, ${st.gaa} GAA` : `${st.season} ${st.team}: ${st.gp} GP, ${st.g} G, ${st.a} A, ${st.plusMinus > 0 ? '+' : ''}${st.plusMinus}, ${st.pim} PIM, ${st.sog} SOG, ${st.toiMin} TOI. Ratings${p.mpRated ? ' (MoneyPuck)' : ''}: shoot ${p.shoot.toFixed(2)}, pass ${p.pass.toFixed(2)}, def ${p.def.toFixed(2)}, skate ${p.skate.toFixed(2)}, faceoff ${p.faceoff.toFixed(2)}` + (d.note ? '. ' + d.note : ''); };
      const unit = (lbl, ps) => `<div class="unit"><span class="lbl">${lbl}</span><span class="pl">${ps.map(p => `<span data-pid="${t.id}-${p.num}" title="${tip(p).replace(/"/g, '&quot;')}"><b>${p.num} ${p.name}</b><small></small></span>`).join('')}</span></div>`;
      el.innerHTML = `<h3><span style="color:${t.id ? t.col : 'inherit'}">${t.name}</span><small>${t.id ? 'VISITORS' : 'HOME'}</small></h3>`
        + t.lines.F.map((l, i) => unit('L' + (i + 1), l)).join('')
        + t.lines.D.map((l, i) => unit('D' + (i + 1), l)).join('')
        + unit('G', t.goalies)
        + `<p class="legend">Extras: ${ROSTERS[t.key].extras.join(', ')}. Injured: ${ROSTERS[t.key].injured.join(', ')}.</p>`;
    });
  }
  buildSheets();
  (() => {
    const R = DATA.rosters; const el = $('datasrc'); if (!el) return;
    const links = (R.sources || []).map(x => `<a href="${x.url}" target="_blank" rel="noopener">${x.title}</a>: ${x.usedFor}`).join('<br>');
    const sysRefs = (DATA.systems.references || []).map(x => `<a href="${x.url}" target="_blank" rel="noopener">${x.title}</a>`).join(', ');
    const phRefs = (DATA.physics.references || []).map(x => `<a href="${x.url}" target="_blank" rel="noopener">${x.title}</a>: ${x.usedFor}`).join('<br>');
    const mpSrc = MP ? `<p><b>MoneyPuck 2025-26</b><br><a href="${MP.source.url}" target="_blank" rel="noopener">${MP.source.title}</a>: player ratings (shoot, pass, def, faceoff, penalty tendency), goalie save percentage by danger tier, league and team per-game benchmarks for calibration. ${MP.source.note}</p>` : '';
    const xgSrc = XG ? `<p><b>Expected goals</b><br>A logistic model of goal probability from shot distance, angle, type, rebound, rush and strength, fit on ${XG.rowsUsed.toLocaleString()} unblocked MoneyPuck shots (${XG.sources.map(x => x.file.replace('.csv', '').replace('shots_', '')).join(' and ')} seasons). Holdout log loss ${XG.fit.logLoss} (MoneyPuck's own model: ${XG.fit.moneypuckLogLoss}). Shooter finishing from goals versus expected goals over the same seasons. ${XG.sources[0].terms}.</p>` : '';
    el.innerHTML = `${xgSrc}${mpSrc}<p>Rosters as of ${R.asOf}; ratings from the ${R.ratingsSeason}. Hover a player on the roster sheets for his stat line.</p><p><b>Roster and stat sources</b><br>${links}</p><p><b>Systems references</b><br>${sysRefs}</p><p><b>Physics references</b><br>${phRefs}</p>`;
  })();
  let sheetT = 0;
  function updateSheets(now) {
    if (now - sheetT < 250) return; sheetT = now;
    for (const t of teams) for (const p of [...t.all, ...t.goalies]) {
      const el = document.querySelector(`[data-pid="${t.id}-${p.num}"]`); if (!el) continue;
      el.className = p.box ? 'pen' : p.onIce ? 'on' : '';
      el.style.color = p.onIce ? (t.id ? t.col : '') : '';
      el.lastChild.textContent = p.box ? 'PEN ' + mmss(p.box) : mmss(p.toi) + (p.onIce && !p.goalie ? ` (${Math.round(p.shift)}s)` : '') + (p.gg ? ` ${p.gg}G` : '') + (p.blocks ? ` ${p.blocks}blk` : '');
    }
  }

  function updateHud() {
    $('sHome').textContent = teams[0].score; $('sAway').textContent = teams[1].score;
    $('period').textContent = ['1st', '2nd', '3rd', 'OT'][game.period - 1];
    $('clock').textContent = mmss(game.clock);
    let note = game.note;
    const pk = teams.find(t => shorthanded(t));
    if (pk && !game.faceoff && !game.over) { const left = Math.max(...pk.all.map(p => p.box)); note = `${teams[1 - pk.id].name} PP ${mmss(left)}`; }
    $('note').textContent = game.paused ? 'Paused' : note;
    $('stShots').textContent = `${teams[0].shots} to ${teams[1].shots}`;
    const xgT = teams[0].xg + teams[1].xg, sh = xgT > 0.05 ? teams[0].xg / xgT : 0.5;
    $('cbH').style.width = (sh * 100).toFixed(1) + '%'; $('cbA').style.width = (100 - sh * 100).toFixed(1) + '%';
    $('chPct').textContent = xgT <= 0.05 ? 'even' : `${Math.round(Math.max(sh, 1 - sh) * 100)}% ${sh >= 0.5 ? teams[0].name : teams[1].name}`;
    $('stPP').textContent = pk && !game.over ? `${teams[1 - pk.id].name} power play` : 'Even strength';
    const lastLog = $('log').firstElementChild; $('logSum').textContent = lastLog ? 'last: ' + lastLog.textContent.replace(/^\S+ \S+\s*/, '') : '';
    $('pimH').textContent = teams[0].pim; $('pimA').textContent = teams[1].pim;
    $('shH').textContent = teams[0].shots; $('shA').textContent = teams[1].shots;
    $('atH').textContent = teams[0].attempts; $('atA').textContent = teams[1].attempts;
    $('blH').textContent = teams[0].blocked; $('blA').textContent = teams[1].blocked;
    $('msH').textContent = teams[0].missed; $('msA').textContent = teams[1].missed;
    $('xgH').textContent = teams[0].xg.toFixed(2); $('xgA').textContent = teams[1].xg.toFixed(2);
    $('hdH').textContent = teams[0].tier.high; $('hdA').textContent = teams[1].tier.high;
    $('foH').textContent = (teams[0].faceoffs ? Math.round(teams[0].faceoffsWon / teams[0].faceoffs * 100) : 0) + '%'; $('foA').textContent = (teams[1].faceoffs ? Math.round(teams[1].faceoffsWon / teams[1].faceoffs * 100) : 0) + '%';
    const tot = teams[0].poss + teams[1].poss || 1;
    $('posH').textContent = Math.round(teams[0].poss / tot * 100) + '%'; $('posA').textContent = Math.round(teams[1].poss / tot * 100) + '%';
    $('ozH').textContent = mmss(teams[0].oz); $('ozA').textContent = mmss(teams[1].oz);
    $('tkH').textContent = teams[0].take; $('tkA').textContent = teams[1].take;
    $('chH').textContent = teams[0].changes; $('chA').textContent = teams[1].changes;
  }

  // ---------- Calibration: sim per-game rates vs MoneyPuck 2025-26 ----------
  const CAL_ROWS = [['Shot attempts', 'attempts', 'shotAttempts'], ['Shots on goal', 'shots', 'shotsOnGoal'], ['Goals', 'score', 'goals'], ['Expected goals', 'xg', 'xGoals'], ['Blocked (by opp.)', 'blockedFor', 'blocked'], ['Missed net', 'missed', 'missed'], ['High-danger shots', 'tierHigh', 'highDangerShots'], ['Medium-danger', 'tierMed', 'mediumDangerShots'], ['Low-danger', 'tierLow', 'lowDangerShots'], ['Penalties taken', 'pens', 'penalties'], ['Faceoff win %', 'fo', 'faceoffWinPct'], ['Goalie freezes', 'freezes', 'freezes'], ['Offsides', 'offsides', 'offsidesPerTeamGame'], ['Icings', 'icings', 'icingsPerTeamGame']];
  function teamSample(t) {
    const opp = teams[1 - t.id];
    return { attempts: t.attempts, shots: t.shots, score: t.score, xg: t.xg, blockedFor: opp.blocked, missed: t.missed, tierHigh: t.tier.high, tierMed: t.tier.medium, tierLow: t.tier.low, pens: t.pim / 2, fo: t.faceoffs ? t.faceoffsWon / t.faceoffs : 0.5, freezes: opp.freezes, offsides: t.offsides, icings: t.icings };
  }
  let batch = null; // { n, sums: [ {..}, {..} ], w, l, otl } from the last lab run
  const addToBatch = () => teams.forEach((t, i) => { const s = teamSample(t); for (const k in s) batch.sums[i][k] = (batch.sums[i][k] || 0) + s[k]; });
  // How real is it: each sim number per team per game next to that team's real 2025-26 number and the league, in groups,
  // with a one-line reading and an on target / above / below verdict. Reads the last test run, or this game scaled to 60 minutes.
  const REAL_ROWS = [
    ['Results'],
    ['Goals', 'score', 'goals', 'Goals scored per game.'],
    ['Chances (expected goals)', 'xg', 'xGoals', 'What the shots were worth by where and how they were taken.', 'chances'],
    ['Shots on goal', 'shots', 'shotsOnGoal', 'Shots the goalie had to stop, goals included.'],
    ['Shot attempts', 'attempts', 'shotAttempts', 'Every shot, including blocked and missed ones.', 'attempts'],
    ['Shot quality'],
    ['High-danger shots', 'tierHigh', 'highDangerShots', 'At least a 20% chance to score, nearly all from close in.', 'hd'],
    ['Medium-danger shots', 'tierMed', 'mediumDangerShots', 'Between 8% and 20%: the slot and the inner circles. The sim makes far too many.', 'md'],
    ['Low-danger shots', 'tierLow', 'lowDangerShots', 'Under 8%: the point, the outside and bad angles.', 'ld'],
    ['Defense'],
    ['Shots blocked by the other team', 'blockedFor', 'blocked', 'Attempts a defender got in front of.', 'blocked'],
    ['Missed the net', 'missed', 'missed', 'Attempts wide or high.'],
    ['Game flow'],
    ['Penalties taken', 'pens', 'penalties', 'Minor penalties per game.'],
    ['Faceoffs won', 'fo', 'faceoffWinPct', 'Share of draws won.'],
    ['Goalie freezes', 'freezes', 'freezes', 'Times the other goalie covered the puck.'],
    ['Offsides', 'offsides', 'offsidesPerTeamGame', 'Offside calls against the team.'],
    ['Icings', 'icings', 'icingsPerTeamGame', 'Icings called against the team; there is no icing on the penalty kill.'],
  ];
  const realVerdict = (v, real) => { if (!(real > 0)) return null; const d = (v - real) / real; return Math.abs(d) <= 0.15 ? ['good', 'On target'] : d > 0.5 ? ['bad', 'Well above'] : d < -0.5 ? ['bad', 'Well below'] : d > 0 ? ['warn', 'Above'] : ['warn', 'Below']; };
  function renderCalib() {
    const el = $('calib'); if (!el || !MP) return;
    const fromRun = batch && batch.n;
    const src = fromRun ? batch.sums.map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / batch.n]))) : teams.map(teamSample);
    const played = fromRun ? 1 : Math.max(0.05, ((game.period - 1) * 1200 + (1200 - Math.min(game.clock, 1200))) / 3600); // scale this game to 60 minutes
    const judge = fromRun || played > 0.5;
    const fmt = (k, v) => k === 'fo' || k === 'faceoffWinPct' ? Math.round(v * 100) + '%' : (k === 'xg' || k === 'score' || k === 'goals' || k === 'xGoals') ? v.toFixed(2) : v.toFixed(1);
    let on = 0, all = 0;
    const realOf = (t, rk) => MP.teams[t.abbr][rk] !== undefined ? MP.teams[t.abbr][rk] : PH.rulesBenchmarks[rk];
    const rec = fromRun ? batch : record, recN = fromRun ? batch.n : record.w[0] + record.w[1];
    const realRec = teams.map(t => DATA.rosters.teams[t.key].record);
    let html = `<table><thead><tr><th>Per team per game</th>${teams.map(t => `<th>${t.name}: sim <span class="vs">vs real</span></th>`).join('')}<th>NHL average</th></tr></thead><tbody>`;
    let pointsRow = `<tr><td class="m"><b>Points %</b><span>Share of the standings points: two for a win, one for an overtime or shootout loss.</span></td>` + teams.map((t, i) => { const sim = recN ? (2 * rec.w[i] + rec.otl[i]) / (2 * recN) : null, real = realRec[i] ? realRec[i].points / (2 * realRec[i].gp) : null; return `<td class="n">${sim === null ? '-' : Math.round(sim * 100) + '%'} <span class="vs">vs ${real === null ? '-' : Math.round(real * 100) + '%'}</span>${recN ? `<br><span class="vs">${rec.w[i]}-${rec.l[i]}-${rec.otl[i]} here, ${realRec[i] ? `${realRec[i].w}-${realRec[i].l}-${realRec[i].otl}` : '-'} real</span>` : ''}</td>`; }).join('') + '<td class="lg">50%</td></tr>';
    for (const row of REAL_ROWS) {
      if (row.length === 1) { html += `<tr class="sec"><td colspan="${teams.length + 2}">${row[0]}</td></tr>`; if (pointsRow) { html += pointsRow; pointsRow = ''; } continue; }
      const [label, sk, rk, say, term] = row;
      const cells = teams.map((t, i) => {
        const v = sk === 'fo' ? src[i][sk] : src[i][sk] / played, real = realOf(t, rk), vd = judge ? realVerdict(v, real) : null;
        if (vd) { all++; if (vd[0] === 'good') on++; }
        return `<td class="n">${fmt(sk, v)} <span class="vs">vs ${real !== undefined ? fmt(rk, real) : '-'}</span>${vd ? `<br><span class="pill ${vd[0]}">${vd[1]}</span>` : ''}</td>`;
      }).join('');
      const lg = MP.league.perGame[rk] !== undefined ? MP.league.perGame[rk] : PH.rulesBenchmarks[rk];
      html += `<tr><td class="m"><b>${label}${term ? ` <button type="button" class="tip" data-term="${term}" aria-label="What is this?">?</button>` : ''}</b><span>${say}</span></td>${cells}<td class="lg">${lg !== undefined ? fmt(rk, lg) : '-'}</td></tr>`;
    }
    el.innerHTML = html + '</tbody></table>';
    $('realSource').textContent = fromRun ? `${batch.n} test games` : `This game so far${played < 0.98 ? ', scaled to 60 minutes' : ''}`;
    $('realScore').textContent = judge ? `${on} of ${all} numbers on target` : 'Too early in this game to judge; play 100 games to check.';
    $('calibNote').textContent = fromRun ? `last run, ${batch.n} games: ${all - on} of ${all} cells off` : 'this game so far';
  }

  // ---------- Test a strategy: plan A against plan B, the same seeded games for both, played in background workers ----------
  // Each job is one game: a seed, both teams' tactics and the engine multipliers. A game seeded with s plays exactly as
  // tools/lab.js plays seed s. Workers run this same module behind a stand-in for the page (src/lab/worker.js); when a
  // browser cannot start them the games run on the page, much slower.
  const TKEYS = [['Fore', 'Forecheck', 'fore'], ['Break', 'Breakout', 'brk'], ['Entry', 'Entry', 'entry'], ['Oz', 'Offensive zone', 'oz'], ['Dz', 'Defensive zone', 'dz'], ['PP', 'Power play', 'pp'], ['PK', 'Penalty kill', 'pk'], ['Agg', 'Aggression', 'agg']];
  const TEST = { coach: 0, running: false, stop: false, pool: null, poolFailed: false, secPerGame: 2.4 };
  try { const c = +localStorage.getItem('rink.coach'); if (c === 1) TEST.coach = 1; } catch (e) {}
  const pre = i => i ? 'a' : 'h';
  const NHL_CFG = () => Object.fromEntries(Object.keys(cfg).map(k => [k, 1]));
  const tacOf = (prefix, over) => Object.fromEntries(TKEYS.map(([k, , t]) => { const v = over && over[k] !== undefined ? over[k] : $(prefix + k).value; return [t, k === 'Agg' ? v / 100 : v]; }));
  const bVals = () => Object.fromEntries(TKEYS.map(([k]) => [k, $('b' + k).value]));
  const optLabel = (k, v) => { if (k === 'Agg') return `${aggWord(v / 100).toLowerCase()} aggression`; const o = [...$(pre(TEST.coach) + k).options].find(x => x.value === v); const t = o ? o.text : v; return `${TKEYS.find(x => x[0] === k)[1].toLowerCase()}: ${t.toLowerCase()}`; };
  const bChanges = () => TKEYS.filter(([k]) => $('b' + k).value !== $(pre(TEST.coach) + k).value).map(([k]) => k);

  const poolSize = () => clamp((navigator.hardwareConcurrency || 4) - 1, 1, 8);
  function makePool() {
    if (TEST.poolFailed) return null;
    try {
      const url = new URL('lab/worker.js', import.meta.url); url.search = new URL(import.meta.url).search;   // same version stamp as this file
      const data = JSON.parse(JSON.stringify(DATA));
      return Array.from({ length: poolSize() }, () => { const w = new Worker(url, { type: 'module' }); w.postMessage({ type: 'init', DATA: data }); return w; });
    } catch (e) { TEST.poolFailed = true; return null; }
  }
  function runJobs(jobs, onRow) {
    return new Promise(resolve => {
      const rows = new Map(); let next = 0, done = 0;
      const finish = () => { TEST.finish = null; resolve(rows); };
      if (!TEST.pool) TEST.pool = makePool();
      if (!TEST.pool) return runInPage(jobs, rows, onRow, finish);
      TEST.finish = () => { TEST.pool.forEach(w => w.terminate()); TEST.pool = null; finish(); };
      const feed = w => { if (TEST.stop) return; if (next < jobs.length) { const j = jobs[next++]; w.postMessage({ type: 'job', id: j.id, seed: j.seed, tacs: j.tacs, cfg: j.cfg }); } };
      TEST.pool.forEach(w => {
        w.onmessage = e => { const m = e.data; if (m.type === 'row') { rows.set(m.id, m.row); done++; onRow(done, jobs.length); if (done >= jobs.length) { TEST.finish = null; resolve(rows); return; } } feed(w); };
        w.onerror = ev => { ev.preventDefault(); TEST.pool.forEach(x => x.terminate()); TEST.pool = null; TEST.poolFailed = true; runInPage(jobs.filter(j => !rows.has(j.id)), rows, onRow, finish, done, jobs.length); };
        feed(w);
      });
      if (TEST.pool) TEST.pool.forEach(w => { /* workers that were idle before ready get fed on 'ready' too */ });
    });
  }
  // the slow path: the same seeded games, one after another on the page, 4,000 ticks per frame
  function runInPage(jobs, rows, onRow, finish, done0 = 0, total = jobs.length) {
    const wasPaused = game.paused, saveRandom = Math.random, saveCfg = { ...cfg }; game.paused = true;
    let i = 0, done = done0, cur = null;
    const end = () => { Math.random = saveRandom; Object.assign(cfg, saveCfg); readTactics(); newGame(); game.paused = wasPaused; finish(); };
    TEST.finish = end;
    // the seeded generator is switched on only while this game ticks, so drawing between frames cannot use up its numbers
    let rng = null;
    const start = j => { Object.assign(cfg, j.cfg); teams[0].tac = j.tacs[0]; teams[1].tac = j.tacs[1]; let a = j.seed * 2654435761; rng = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; Math.random = rng; newGame(); Math.random = saveRandom; cur = j; };
    const step = () => {
      if (TEST.stop) return end();
      if (!cur) { if (i >= jobs.length) return end(); start(jobs[i++]); }
      Math.random = rng; let k = 0; while (k++ < 4000 && !game.over) tick(0.03); Math.random = saveRandom;
      if (game.over) { rows.set(cur.id, { end: game.shootout ? 'SO' : game.overtime ? 'OT' : 'REG', teams: teams.map(t => ({ goals: t.score, xg: t.xg, sog: t.shots, sample: teamSample(t) })) }); done++; onRow(done, total); cur = null; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- the setup panel ----------
  function planSentence(side) {
    const txt = k => { const el = $(side + k); return el.selectedOptions ? el.selectedOptions[0].text : ''; };
    const lc = v => v.charAt(0).toLowerCase() + v.slice(1);
    return `${txt('Fore')} forecheck, ${lc(txt('Break'))} breakout, ${lc(txt('Entry'))} to get in. ${txt('Oz')} in the offensive zone, ${lc(txt('Dz'))} coverage in their own end. Power play ${txt('PP')}, penalty kill ${lc(txt('PK'))}, ${lc(aggWord($(side + 'Agg').value / 100))} aggression.`;
  }
  function buildB() {
    const p = pre(TEST.coach);
    $('bGrid').innerHTML = TKEYS.map(([k, label]) => k === 'Agg'
      ? `<label class="agg" data-k="Agg">${label}<input type="range" id="bAgg" min="0" max="100" value="${$(p + 'Agg').value}"></label>`
      : `<label data-k="${k}">${label}<select id="b${k}">${$(p + k).innerHTML}</select></label>`).join('');
    TKEYS.forEach(([k]) => { if (k !== 'Agg') $('b' + k).value = $(p + k).value; $('b' + k).addEventListener('input', testRefresh); });
    document.querySelectorAll('#bGrid label').forEach(describeChoice);
    $('labDim').innerHTML = TKEYS.map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  }
  function testRefresh() {
    const c = TEST.coach, me = teams[c], op = teams[1 - c], p = pre(c);
    document.querySelectorAll('[data-coach]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.coach === c));
    const dotStyle = i => i ? 'background:var(--away);border-color:var(--away-3)' : 'background:var(--home);border-color:var(--home-2)';
    $('myName').textContent = `${me.name} (${me.abbr})`; $('oppName').textContent = `${op.name} (${op.abbr})`;
    $('myDot').style.cssText = dotStyle(c); $('oppDot').style.cssText = dotStyle(1 - c);
    $('planBlock').className = 'side ' + (c ? 'mtl' : 'bos'); $('oppBlock').className = 'side ' + (c ? 'bos' : 'mtl');
    $('planAText').textContent = planSentence(p); $('oppPlan').textContent = `As set now: ${planSentence(pre(1 - c))}`;
    const ch = bChanges();
    document.querySelectorAll('#bGrid label').forEach(l => l.classList.toggle('changed', ch.includes(l.dataset.k)));
    const n = +$('labN').value, games = n * (ch.length ? 2 : 1), workers = TEST.poolFailed ? 1 : poolSize();
    const secs = Math.ceil(games * TEST.secPerGame / workers);
    $('labRun').textContent = ch.length ? `Run plan A and plan B` : 'Run the matchup';
    $('labEst').textContent = `${games} games, about ${secs < 90 ? secs + ' seconds' : Math.round(secs / 60) + ' minutes'} on this computer. Runs use the NHL-realistic settings, the ones the engine is calibrated to, and the game on the Watch view keeps playing.`;
    $('forWho').innerHTML = `<span class="dot" style="${dotStyle(c)}"></span><span>Result for the ${me.name}${ch.length ? ': plan B against plan A' : ''}, both against the ${op.name}' plan as set now</span>`;
  }
  document.querySelectorAll('[data-coach]').forEach(b => b.addEventListener('click', () => { TEST.coach = +b.dataset.coach; try { localStorage.setItem('rink.coach', TEST.coach); } catch (e) {} buildB(); testRefresh(); }));
  $('bReset').addEventListener('click', () => { buildB(); testRefresh(); });
  $('labN').addEventListener('input', testRefresh);
  $('myEdit').addEventListener('click', () => openDrawer('planDrawer', $(TEST.coach ? 'sideA' : 'sideH').querySelector('select')));
  $('oppEdit').addEventListener('click', () => openDrawer('planDrawer', $(TEST.coach ? 'sideH' : 'sideA').querySelector('select')));
  // plan A is the team as set: when it changes, keep plan B's changes and follow plan A everywhere else
  let lastA = null;
  const snapA = () => Object.fromEntries(TKEYS.map(([k]) => [k, $(pre(TEST.coach) + k).value]));
  document.querySelectorAll('.side select, .side input[type=range]').forEach(el => el.addEventListener('input', () => {
    if (!$('bGrid').children.length) return;
    const now = snapA(); if (lastA) TKEYS.forEach(([k]) => { if ($('b' + k).value === lastA[k]) $('b' + k).value = now[k]; }); lastA = now; testRefresh();
  }));
  buildB(); lastA = snapA(); testRefresh();

  // ---------- statistics and the result ----------
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const ci95 = a => a.length > 1 ? 1.96 * Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)) / Math.sqrt(a.length) : 0;
  const pct = v => Math.round(100 * v) + '%';
  const sgn = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const perGame = (row, c) => { const me = row.teams[c], op = row.teams[1 - c], win = me.goals > op.goals; return { xgd: me.xg - op.xg, gd: me.goals - op.goals, xgf: me.xg, xga: op.xg, pts: win ? 1 : row.end !== 'REG' ? 0.5 : 0 }; };
  const verdict = (m, e) => m - e > 0 ? ['good', 'Clear edge'] : m + e < 0 ? ['bad', 'Clear cost'] : ['flat', 'Too close to call'];
  function rangeBar(m, e, scale) {
    const x = v => clamp(50 + (v / scale) * 50, 0, 100), col = m - e > 0 ? '#1f7a4a' : m + e < 0 ? '#a3241b' : 'var(--fg-dim)';
    return `<div class="range" aria-hidden="true"><div class="axis"></div><div class="zero"></div><div class="span" style="left:${x(m - e)}%;width:${x(m + e) - x(m - e)}%;background:${col}"></div><div class="pt" style="left:${x(m)}%;background:${col}"></div></div>`;
  }
  function recordTable(plans) {
    const head = '<tr><th></th><th>W-L-OTL</th><th>Pts</th><th>GF</th><th>GA</th><th>xGF</th><th>xGA</th></tr>';
    const rowsOf = (label, rows) => teams.map((t, i) => { let w = 0, l = 0, o = 0, gf = 0, ga = 0, xf = 0, xa = 0; for (const r of rows) { const me = r.teams[i], op = r.teams[1 - i]; if (me.goals > op.goals) w++; else if (r.end !== 'REG') o++; else l++; gf += me.goals; ga += op.goals; xf += me.xg; xa += op.xg; } const n = rows.length || 1; return `<tr><td>${label} ${t.abbr}</td><td>${w}-${l}-${o}</td><td>${pct((2 * w + o) / (2 * n))}</td><td>${(gf / n).toFixed(2)}</td><td>${(ga / n).toFixed(2)}</td><td>${(xf / n).toFixed(2)}</td><td>${(xa / n).toFixed(2)}</td></tr>`; }).join('');
    return `<table>${head}${plans.map(([label, rows]) => rowsOf(label, rows)).join('')}</table>`;
  }
  function feedRealityCheck(rows) {
    batch = { n: 0, sums: [{}, {}], w: [0, 0], l: [0, 0], otl: [0, 0] };
    for (const r of rows) { r.teams.forEach((t, i) => { for (const k in t.sample) batch.sums[i][k] = (batch.sums[i][k] || 0) + t.sample[k]; }); const w = r.teams[0].goals > r.teams[1].goals ? 0 : 1; batch.w[w]++; if (r.end !== 'REG') batch.otl[1 - w]++; else batch.l[1 - w]++; batch.n++; }
    renderCalib();
  }
  function showResult(rowsA, rowsB, c, changes) {
    const me = teams[c], op = teams[1 - c];
    $('labResult').innerHTML = recordTable(rowsB ? [['Plan A', rowsA], ['Plan B', rowsB]] : [['', rowsA]]);
    if (!rowsB) {
      const g = rowsA.map(r => perGame(r, c)), pts = mean(g.map(x => x.pts));
      $('labHeadline').textContent = `${me.name} take ${pct(pts)} of the points against this ${op.name} plan, on ${mean(g.map(x => x.xgf)).toFixed(1)} chances a game for and ${mean(g.map(x => x.xga)).toFixed(1)} against.`;
      $('labVerdicts').innerHTML = ''; $('labExplain').textContent = `${rowsA.length} games. Change a choice in plan B to test it against this. The records are in Details for analysts; How real is it compares these games with the real teams.`;
      $('labDetails').open = true; return;
    }
    const d = rowsA.map((ra, i) => { const a = perGame(ra, c), b = perGame(rowsB[i], c); return { xg: b.xgd - a.xgd, xgf: b.xgf - a.xgf, xga: b.xga - a.xga, gd: b.gd - a.gd, pts: b.pts - a.pts }; });
    const S = k => [mean(d.map(x => x[k])), ci95(d.map(x => x[k]))];
    const [xm, xe] = S('xg'), [gm, ge] = S('gd'), [pm, pe] = S('pts'), [fm] = S('xgf'), [am] = S('xga');
    const pA = mean(rowsA.map(r => perGame(r, c).pts)), pB = mean(rowsB.map(r => perGame(r, c).pts));
    const vx = verdict(xm, xe), vg = verdict(gm, ge), vp = verdict(pm, pe);
    const what = `Plan B (${changes.map(k => optLabel(k, $('b' + k).value)).join(', ')})`;
    $('labHeadline').textContent = vx[0] === 'good' ? `${what} is better: about ${Math.abs(xm).toFixed(1)} more net chances a game.` : vx[0] === 'bad' ? `${what} is worse: about ${Math.abs(xm).toFixed(1)} fewer net chances a game.` : `${what} and plan A play about the same against this opponent.`;
    $('labVerdicts').innerHTML = [
      ['Net chances', sgn(xm), `chances for ${sgn(fm)}, against ${sgn(am)} a game`, vx, rangeBar(xm, xe, 2.5)],
      ['Goal difference', sgn(gm), 'per game, plan B minus plan A', vg, rangeBar(gm, ge, 2.5)],
      ['Points', `${pct(pA)} → ${pct(pB)}`, `plan A then plan B, ${rowsA.length} games each`, vp, rangeBar(pm, pe, 0.35)],
    ].map(([k, big, sub, [cls, label], bar]) => `<div class="v"><div class="k">${k}${{ 'Net chances': 'net', Points: 'pts' }[k] ? ` <button type="button" class="tip" data-term="${{ 'Net chances': 'net', Points: 'pts' }[k]}" aria-label="What does this mean?">?</button>` : ''}</div><div class="big">${big}</div><div class="sub">${sub}</div>${bar}<span class="pill ${cls}">${label}</span></div>`).join('');
    $('labExplain').innerHTML = vx[0] !== 'flat' && vp[0] === 'flat' ? `The chance difference is real at ${rowsA.length} games. The points difference is not yet: points swing about ${Math.round(pe * 100)} points either way from luck alone <button type="button" class="tip" data-term="close" aria-label="What does too close to call mean?">?</button>. Chances are the number to trust here.`
      : vx[0] === 'flat' ? `Neither number separates the two plans at ${rowsA.length} games <button type="button" class="tip" data-term="close" aria-label="What does too close to call mean?">?</button>. Run more games, or treat them as even.` : `Both chances and points separate the two plans at ${rowsA.length} games.`;
  }
  const seedsFor = n => Array.from({ length: n }, (_, i) => i + 1);
  function setRunning(on) {
    TEST.running = on; TEST.stop = false; $('labRun').disabled = on; $('labSweep').disabled = on; $('labStop').hidden = !on;
    if (!on) { $('labBar').style.width = '0%'; }
  }
  const progress = (done, total, what) => { $('labBar').style.width = (100 * done / total) + '%'; $('labNote').textContent = `${what}: game ${done} of ${total}`; };
  $('labRun').addEventListener('click', async () => {
    if (TEST.running) return;
    const c = TEST.coach, n = +$('labN').value, changes = bChanges(), seeds = seedsFor(n), cfgNHL = NHL_CFG();
    const tA = [tacOf('h'), tacOf('a')], tB = [...tA]; tB[c] = tacOf(pre(c), bVals());
    const jobs = seeds.map(sd => ({ id: 'A' + sd, seed: sd, tacs: tA, cfg: cfgNHL })).concat(changes.length ? seeds.map(sd => ({ id: 'B' + sd, seed: sd, tacs: tB, cfg: cfgNHL })) : []);
    setRunning(true); const t0 = performance.now();
    const rows = await runJobs(jobs, (d, tot) => progress(d, tot, 'Playing'));
    const secs = (performance.now() - t0) / 1000; if (rows.size) TEST.secPerGame = secs * (TEST.pool ? poolSize() : 1) / rows.size;
    const both = seeds.filter(sd => rows.has('A' + sd) && (!changes.length || rows.has('B' + sd)));
    const rowsA = both.map(sd => rows.get('A' + sd)), rowsB = changes.length ? both.map(sd => rows.get('B' + sd)) : null;
    setRunning(false);
    $('labNote').textContent = `${both.length} games for each plan${TEST.stop ? ', stopped early' : ''}, ${Math.round(secs)} seconds.`;
    if (both.length) { feedRealityCheck(rowsA); showResult(rowsA, rowsB, c, changes); } testRefresh();
  });
  $('labSweep').addEventListener('click', async () => {
    if (TEST.running) return;
    const c = TEST.coach, k = $('labDim').value, p = pre(c), n = +$('labN').value, seeds = seedsFor(n), cfgNHL = NHL_CFG(), cur = $(p + k).value;
    const opts = k === 'Agg' ? ['0', '25', '50', '75', '100'] : [...$(p + k).options].map(o => o.value);
    const tA = [tacOf('h'), tacOf('a')];
    const jobs = [];
    for (const v of opts) { const t = [...tA]; t[c] = tacOf(p, { [k]: v }); seeds.forEach(sd => jobs.push({ id: v + '|' + sd, seed: sd, tacs: t, cfg: cfgNHL })); }
    if (!opts.includes(cur)) seeds.forEach(sd => jobs.push({ id: cur + '|' + sd, seed: sd, tacs: tA, cfg: cfgNHL }));
    setRunning(true); $('labSweepResult').innerHTML = ''; const t0 = performance.now();
    const rows = await runJobs(jobs, (d, tot) => progress(d, tot, 'Ranking'));
    const secs = (performance.now() - t0) / 1000; setRunning(false);
    const label = v => k === 'Agg' ? `${aggWord(v / 100)} (${(v / 100).toFixed(2)})` : [...$(p + k).options].find(o => o.value === v).text;
    const base = seeds.filter(sd => rows.has(cur + '|' + sd));
    const list = opts.map(v => {
      const sd = base.filter(x => rows.has(v + '|' + x)); if (!sd.length) return null;
      const d = sd.map(x => perGame(rows.get(v + '|' + x), c).xgd - perGame(rows.get(cur + '|' + x), c).xgd);
      return { v, m: mean(d), e: ci95(d), n: sd.length };
    }).filter(Boolean).sort((a, b) => b.m - a.m);
    const isCur = v => v === cur || (k === 'Agg' && Math.abs(+v - +cur) < 13);
    $('labSweepResult').innerHTML = list.map(r => { const [cls, txt] = r.v === cur ? ['cur', 'Plan A now'] : verdict(r.m, r.e); return `<div class="r"><div class="name">${label(r.v)}${r.v === cur ? ' (plan A)' : ''}<small>${r.v === cur ? 'the baseline' : sgn(r.m) + ' net chances a game'}</small></div>${rangeBar(r.m, r.e, 2.5)}<span class="pill ${cls}">${txt}</span></div>`; }).join('');
    $('labSweepNote').textContent = `${TKEYS.find(x => x[0] === k)[1]} for the ${teams[c].name}, ${n} games per option, ${Math.round(secs)} seconds. The dot is the best estimate and the band the 95% range; right of the line is better for the ${teams[c].name}.`;
    $('labNote').textContent = TEST.stop ? 'Stopped early.' : '';
  });
  $('labStop').addEventListener('click', () => { TEST.stop = true; if (TEST.finish) TEST.finish(); });
  // How real is it: play 100 games with both teams as set, at the NHL-realistic settings, and read them
  $('realRun').addEventListener('click', async () => {
    if (TEST.running) return; const tA = [tacOf('h'), tacOf('a')], cfgNHL = NHL_CFG();
    const jobs = seedsFor(100).map(sd => ({ id: 'R' + sd, seed: sd, tacs: tA, cfg: cfgNHL }));
    setRunning(true); $('realRun').disabled = true;
    const rows = await runJobs(jobs, (d, tot) => { $('realNote').textContent = `Playing game ${d} of ${tot}`; });
    setRunning(false); $('realRun').disabled = false; $('realNote').textContent = '';
    if (rows.size) feedRealityCheck([...rows.values()]);
  });
  let calibT = 0;
  function updateCalib(now) { if (batch && batch.n) return; if (now - calibT < 1000) return; calibT = now; renderCalib(); }

  // ---------- Views, steps, drawers and game plans ----------
  const VIEWS = ['watch', 'test', 'real'];
  function showView(v) {
    if (!VIEWS.includes(v)) v = 'watch';
    document.querySelectorAll('nav.views [data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
    document.querySelectorAll('section.view').forEach(sec => { sec.hidden = sec.dataset.view !== v; });
  }
  document.querySelectorAll('nav.views [data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  // the page always opens on Watch; a link can ask for another view (#test, or the old #lab, and #real)
  { const h = location.hash.slice(1); showView(h === 'lab' || h === 'test' ? 'test' : h === 'real' ? 'real' : 'watch'); }
  // the three steps jump into the strategy test and point at the part that does that step
  const flash = el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.steps [data-go]').forEach(b => b.addEventListener('click', () => {
    showView('test');
    const box = { 1: $('planBlock'), 2: $('labRun'), 3: $('labRecord') }[b.dataset.go];
    if (box.tagName === 'DETAILS') box.open = true;
    box.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' }); flash(box);
    const focus = b.dataset.go === '1' ? $('bGrid').querySelector('select') : b.dataset.go === '2' ? box : null;
    if (b.dataset.go === '1') flash($('oppBlock'));
    if (focus) focus.focus({ preventScroll: true });
  }));
  // drawers: the game plans (both teams) and the settings
  let drawerOpen = null, drawerFrom = null;
  function openDrawer(id, focusEl) {
    closeDrawer(); drawerFrom = document.activeElement; drawerOpen = $(id); drawerOpen.hidden = false; $('scrim').hidden = false;
    (focusEl || drawerOpen.querySelector('.closeD')).focus({ preventScroll: true });
    const sec = focusEl && focusEl.closest('.side'); drawerOpen.scrollTop = sec ? Math.max(0, sec.offsetTop - 12) : 0;
  }
  function closeDrawer() { if (!drawerOpen) return; drawerOpen.hidden = true; $('scrim').hidden = true; drawerOpen = null; if (drawerFrom && drawerFrom.focus) drawerFrom.focus(); }
  $('scrim').addEventListener('click', closeDrawer);
  document.querySelectorAll('.closeD').forEach(b => b.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openDrawer('planDrawer', $(b.dataset.edit === 'h' ? 'sideH' : 'sideA').querySelector('select'))));
  $('gearBtn').addEventListener('click', () => openDrawer('setDrawer'));
  // each choice in the plan drawer shows what it means under it
  document.querySelectorAll('#planDrawer .side .cgrid label').forEach(describeChoice);
  function aggWord(v) { return v < 0.34 ? 'Low' : v < 0.67 ? 'Medium' : 'High'; }
  // a choice's meaning, written under its select (the plan drawer shows all of them, plan B only the ones it changes)
  function describeChoice(l) {
    const SECTION = { Fore: 'forecheck', Break: 'breakout', Entry: 'entry', Oz: 'offensiveZone', Dz: 'defensiveZone', PP: 'powerPlay', PK: 'penaltyKill' };
    const el = l.querySelector('select, input'); if (!el) return;
    const small = document.createElement('small'); small.className = 'desc'; l.append(small);
    const key = el.id.slice(1);
    const say = () => { if (key === 'Agg') { small.textContent = `${aggWord(el.value / 100)}. ${SYS.coaching ? SYS.coaching.aggression.desc : ''}`; return; } const d = SYS[SECTION[key]] && SYS[SECTION[key]][el.value]; small.textContent = d && d.desc ? d.desc : ''; };
    el.addEventListener('input', say); say();
  }
  // each team's plan as a sentence on the Watch view
  function renderPlans() {
    const txt = (side, k) => { const el = $(side + k); return el.selectedOptions ? el.selectedOptions[0].text : ''; };
    const lc = v => v.charAt(0).toLowerCase() + v.slice(1);
    for (const side of ['h', 'a']) {
      $(side === 'h' ? 'planH' : 'planA').textContent = `${txt(side, 'Fore')} forecheck, ${lc(txt(side, 'Break'))} breakout, ${lc(txt(side, 'Entry'))} to get in. ${txt(side, 'Oz')} in the offensive zone, ${lc(txt(side, 'Dz'))} coverage in their own end.`;
      $(side === 'h' ? 'chipsH' : 'chipsA').innerHTML = [`Power play: ${txt(side, 'PP')}`, `Penalty kill: ${txt(side, 'PK')}`, `Aggression: ${lc(aggWord($(side + 'Agg').value / 100))}`].map(c => `<span class="chip">${c}</span>`).join('');
    }
  }
  document.querySelectorAll('.side select, .side input[type=range]').forEach(el => el.addEventListener('input', renderPlans));
  renderPlans();
  // short explainers for the numbers a newcomer will not know
  const TERMS = {
    chances: ['Chances (expected goals)', "How many goals a team's shots were worth, from where and how each one was taken. A shot from the slot is worth far more than one from the point. Over many games, chances predict results better than goals do."],
    sight: ['Sight lines', `What the player with the puck sees in the offensive zone. The yellow wedge runs from him to the two posts: the open part of the net he can shoot at. A defender in front of him casts a dark shadow over the part he blocks. The blue dash goes to his best pass, the ringed teammate. The tag gives the chance each one has of becoming a goal and his read: he shoots a look worth at least ${Math.round(PH.shotDecision.xgChoice.minXg * 100)}% unless a pass is clearly better, passes when a teammate has a clearly better look, and otherwise holds the puck for a better play. Slow the game to 0.5x to follow it.`],
    planA: ['Plan A', 'Your team as it is set now, the plan on the Watch view. It is the baseline every test compares against.'],
    planB: ['Plan B', 'A copy of plan A with the changes you want to try. Change one choice to learn what that choice is worth, or several to test a whole new plan.'],
    same: ['The same games', 'Both plans play games that start from the same random numbers, so the bounces are the same until a difference in plan makes play go another way. A gap between the plans comes from the plans, not from one of them getting easier games.'],
    net: ['Net chances', 'Chances for minus chances against, per game. The best single number for whether a plan is working.'],
    close: ['Too close to call', 'The difference is smaller than the normal swing from luck at this many games. Run more games, or treat the two plans as even.'],
    edge: ['Clear edge, clear cost', 'The whole 95% range of the difference is on one side of zero, so luck alone is unlikely to explain it at this many games.'],
    pts: ['Points %', 'Share of the available standings points: two for a win, one for an overtime or shootout loss.'],
    hd: ['High-danger shots', 'Shots with at least a 20% chance of going in, almost all from close to the net.'],
    md: ['Medium-danger shots', 'Shots with an 8% to 20% chance: the slot and the inside of the circles.'],
    ld: ['Low-danger shots', 'Shots with under an 8% chance: the point, the outside and sharp angles.'],
    attempts: ['Shot attempts', 'Every shot a team takes: on goal, blocked or missed. Analysts call the count Corsi.'],
    blocked: ['Blocked shots', 'Shots a defender got in front of before they reached the net.'],
    poss: ['Possession', 'Share of the time each team had the puck on a stick.'],
    take: ['Takeaways', 'Times a player stole the puck from the carrier.'],
    pk: ['Penalty kill', 'Playing a man short. There is no icing, so the killers clear the puck the length of the ice whenever they get it.'],
    nhl: ['NHL-realistic settings', 'Skating, passing and shooting at the values calibrated to real NHL tracking data. Strategy tests always use them; the watching settings in Settings run faster.'],
  };
  { const g = $('glossary'); if (g) g.innerHTML = Object.values(TERMS).map(([h, d]) => `<dt>${h}</dt><dd>${d}</dd>`).join(''); }
  let pop = null;
  document.addEventListener('click', e => {
    const t = e.target.closest('button.tip'); if (pop) { pop.remove(); pop = null; } if (!t || !TERMS[t.dataset.term]) return;
    const [h, d] = TERMS[t.dataset.term]; pop = document.createElement('div'); pop.className = 'pop'; pop.setAttribute('role', 'tooltip');
    pop.innerHTML = `<b>${h}</b>${d}`; document.body.append(pop);
    const r = t.getBoundingClientRect(); pop.style.left = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, r.left - 20)) + 'px'; pop.style.top = (r.bottom + 8) + 'px';
  });
  const aboutDlg = $('about');
  (() => {   // the About dialog's systems list, one line per choice, from the same descriptions the game plans show
    const el = $('aboutSystems'); if (!el) return;
    const groups = [['Forecheck', 'forecheck'], ['Breakout', 'breakout'], ['Zone entry', 'entry'], ['Offensive zone', 'offensiveZone'], ['Defensive zone', 'defensiveZone'], ['Power play', 'powerPlay'], ['Penalty kill', 'penaltyKill']];
    el.innerHTML = groups.map(([title, key]) => `<p><b>${title}.</b> ` + Object.values(SYS[key]).filter(v => v && typeof v === 'object' && v.label && v.desc).map(v => `<i>${v.label}</i>: ${v.desc}`).join(' ') + '</p>').join('');
  })();
  $('aboutBtn').addEventListener('click', () => { if (aboutDlg.showModal) aboutDlg.showModal(); else aboutDlg.setAttribute('open', ''); });
  $('aboutClose').addEventListener('click', () => aboutDlg.close ? aboutDlg.close() : aboutDlg.removeAttribute('open'));
  aboutDlg.addEventListener('click', e => { if (e.target === aboutDlg) aboutDlg.close(); });

  // ---------- Controls ----------
  $('pause').addEventListener('click', () => { game.paused = !game.paused; $('pause').textContent = game.paused ? 'Resume' : 'Pause'; });
  document.querySelectorAll('.spd').forEach(b => b.addEventListener('click', () => { game.speed = +b.dataset.s; document.querySelectorAll('.spd').forEach(o => o.setAttribute('aria-pressed', o === b)); }));
  $('newgame').addEventListener('click', newGame);

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    if (!game.paused) { let g = real * game.speed; while (g > 0) { const d = Math.min(g, 0.03); tick(d); g -= d; } moveOfficials(real * game.speed); }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRink(); drawBenches(); drawOfficials(); drawPlayers(); drawWhistle(); updateHud(); updateSheets(now); updateCalib(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // debug and test hook: lets a harness step the engine headlessly
  window.rinkSim = { tick, teams, game, puck, DATA, cfg, newGame, teamSample, runJobs, TEST };
}
// ---------- Data loading: the JSON files next to this page ----------
if (!self.__RINK_WORKER) (async () => {
  const names = ['rosters', 'ratings', 'systems', 'physics', 'moneypuck-2025', 'defaults', 'xg-model'];
  const DATA = {};
  try {
    await Promise.all(names.map(async n => { const r = await fetch('data/' + n + '.json', { cache: 'no-store' }); if (!r.ok) throw new Error('data/' + n + '.json ' + r.status); DATA[n] = await r.json(); }));
  } catch (e) { document.getElementById('note').textContent = 'Could not load the game data. Reload the page to try again.'; throw e; }
  try { startSim(DATA); } catch (e) { document.getElementById('note').textContent = 'Could not start: ' + e.message; throw e; }
})();
