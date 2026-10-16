// Bruins vs Canadiens: the page. The engine is in engine/sim.js and never touches the page; this file draws it,
// runs the controls and the Watch view's game plans, and the Game plan lab (its own plans, a baseline, changes tested
// against it, and the comparison with the real teams).
// index.html loads it with a version stamp (src/main.js?v=VERSION), and every import carries the same stamp, so a
// visitor never mixes files from two deploys. Bump them all with VERSION; tools/smoke.js fails if they disagree.
import { createSim } from './engine/sim.js?v=0.62';
import { installReview } from './review.js?v=0.62';

export function startSim(DATA) {
  const $ = id => document.getElementById(id);
  // admin settings (multipliers), driven by the sliders in the Admin panel
  const VERSION = '0.62';
  $('version').textContent = 'v' + VERSION; $('versionD').textContent = 'v' + VERSION;
  const sim = createSim(DATA);
  const { cfg, teams, game, puck, officials, tick, newGame, teamSample, moveOfficials, RW, RH, GL, NETW, NETD, CORNER, RINK_Y, BENCH_H, BOX_H, BLUE,
    ROSTERS, SYS, PH, MP, XG, clamp, dist, active, shorthanded, oppNet, zone, readLook, buildUnit, peekLine, shiftTarget, fDoor, dDoor, doorFor,
    fatigueLevel, goalieLine } = sim;
  const ADMIN = [['accel', 'Acceleration', 0.5, 2.5], ['speed', 'Top speed', 0.6, 1.6], ['cruise', 'Cruise effort', 0.5, 1.4], ['passSpd', 'Pass speed', 0.6, 1.6], ['passAcc', 'Pass accuracy', 0.5, 2], ['glide', 'Puck glide', 0.5, 2], ['goalie', 'Goalie coverage', 0.6, 1.4], ['shots', 'Shot volume', 0.4, 2.5]];
  const canvas = $('c');
  let ctx = canvas.getContext('2d');
  // draw onto another canvas with the same functions (the shot review's rink)
  const withCtx = (c2, f) => { const was = ctx; ctx = c2; try { f(); } finally { ctx = was; } };
  const S = canvas.width / RW; // px per ft
  const css = () => getComputedStyle(document.documentElement);


  function readTactics() {
    const read = k => ({ fore: $(k + 'Fore').value, brk: $(k + 'Break').value, entry: $(k + 'Entry').value, oz: $(k + 'Oz').value, dz: $(k + 'Dz').value, pp: $(k + 'PP').value, pk: $(k + 'PK').value, agg: $(k + 'Agg').value / 100 });
    teams[0].tac = read('h'); teams[1].tac = read('a');
  }
  // only the plan drawer drives the game being watched; the Game plan lab's controls never do
  document.querySelectorAll('#planDrawer select, #planDrawer input[type=range]').forEach(el => el.addEventListener('input', readTactics));
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

  // the play by play, newest first, with the game clock at the moment of each line
  sim.on('log', (text, cls) => {
    const li = document.createElement('li');
    const m = Math.floor(game.clock / 60), s = Math.floor(game.clock % 60);
    li.innerHTML = `<time>${['1st', '2nd', '3rd', 'OT'][game.period - 1]} ${m}:${String(s).padStart(2, '0')}</time><span class="${cls || ''}"></span>`;
    li.lastChild.textContent = text;
    const ul = $('log'); ul.prepend(li);
    while (ul.children.length > 60) ul.lastChild.remove();
  });
  sim.on('reset', () => { $('log').innerHTML = ''; });
  sim.on('final', () => recordResult());
  // every Watch game is seeded (a fresh random seed each time), so the shot review can rebuild any moment of it
  let LABGAME = null, labAcc = 0;   // a lab game on the rink (see playLabGame)
  const watchGame = () => { leaveLabGame(); newGame(1 + Math.floor(Math.random() * 2147483646)); };
  watchGame();



  // Record this session: wins, losses and overtime or shootout losses per club, kept while the page is open.
  const record = { w: [0, 0], l: [0, 0], otl: [0, 0] };
  function recordResult() {
    if (game.recorded || !game.over) return; game.recorded = true;
    const w = teams[0].score > teams[1].score ? 0 : 1, l = 1 - w;
    record.w[w]++; if (game.overtime || game.shootout) record.otl[l]++; else record.l[l]++;
    const el = $('record'); if (el) el.textContent = `This session: ${teams[0].abbr} ${record.w[0]}-${record.l[0]}-${record.otl[0]}, ${teams[1].abbr} ${record.w[1]}-${record.l[1]}-${record.otl[1]} (W-L-OTL)`;
  }


  // ---------- Effects: skate trails, puck streak, hit ripples, goal light ----------
  const FX = { on: true, sticks: true, sight: true, rings: [], goalLight: null, saveFlash: null, lastGoalScorer: null, scorerT: 0 };
  try { FX.on = localStorage.getItem('rinkFx') !== 'off'; FX.sticks = localStorage.getItem('rinkSticks') !== 'off'; FX.sight = localStorage.getItem('rinkSight') !== 'off'; } catch (e) {}
  const fxRing = (x, y, col, big) => { if (FX.on) FX.rings.push({ x, y, col, t: 0, max: big ? 0.9 : 0.5, r: big ? 9 : 5 }); };
  sim.on('fx', (kind, d) => {
    if (kind === 'ring') fxRing(d.x, d.y, d.col, d.big);
    else if (kind === 'save') { if (FX.on) FX.saveFlash = { x: d.x, y: d.y, t: 0.3 }; }
    else if (kind === 'goal' && FX.on) { FX.goalLight = { net: d.net, dir: d.dir, t: 2.5 }; FX.lastGoalScorer = d.scorer; FX.scorerT = 2.5; fxRing(d.x, d.y, d.col, true); }
  });
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
      // the crease is the half circle in front of the goal line, toward center ice: the right half at the left net, the left half at the right net
      ctx.beginPath(); ctx.moveTo(x, RH / 2 - 6); ctx.arc(x, RH / 2, 6, d > 0 ? -Math.PI / 2 : Math.PI / 2, d > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
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
    // what he will do with it, by the same rule carrierThink uses: shoot a look worth taking unless a pass is clearly better
    const XC = PH.shotDecision.xgChoice;
    const reads = read.myV >= XC.minXg && read.myV * XC.passMustBeatBy >= read.bestV ? 'shoot' : read.best && read.bestV > read.myV * XC.passMustBeatBy && read.bestV >= XC.minXg ? 'pass' : 'hold';
    paintSight(c, oppNet(t), opp, read, reads === 'shoot' ? 'Shooting' : reads === 'pass' ? 'Passing' : 'Holding for a better play', reads === 'pass', reads === 'hold');
  }
  // the sight lines for a carrier c (any {x, y}), the net he attacks, the defenders (any {x, y}) and his read; label is the
  // tag's last word, strongPass draws the pass line bold, quiet greys the label. The shot review paints the same picture.
  function paintSight(c, n, opp, read, label, strongPass, quiet) {
    const posts = [{ x: n.x, y: n.y - NETW / 2 }, { x: n.x, y: n.y + NETW / 2 }];
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
    if (read.best) {
      const strong = strongPass;
      ctx.save(); ctx.strokeStyle = '#0b4ea2'; ctx.globalAlpha = strong ? 0.95 : 0.55; ctx.lineWidth = strong ? 0.7 : 0.45; ctx.setLineDash([1.6, 1.2]);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(read.best.x, read.best.y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 0.45; ctx.beginPath(); ctx.arc(read.best.x, read.best.y, 3.2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // the tag: a yellow wedge mark with his shot, a blue dash with the pass and who it goes to, and his read
    const pctv = v => Math.round(v * 100) + '%';
    const parts = [['wedge', `Shot ${pctv(read.myV)}`], ...(read.best ? [['dash', `Pass to #${read.best.num} ${pctv(read.bestV)}`]] : []), ['read', label]];
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const fontN = '600 2.1px Barlow, "Segoe UI", sans-serif', fontB = '800 2.1px Barlow, "Segoe UI", sans-serif', icon = 2.2, gap = 1.3;
    const widths = parts.map(([k, txt]) => { ctx.font = k === 'read' ? fontB : fontN; return ctx.measureText(txt).width + (k === 'read' ? 0 : icon + 0.6); });
    const w = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) + 1.8, h = 3.2, x = clamp(c.x - w / 2, 1, 199 - w), y = Math.max(0.5, c.y - 7.4);
    ctx.fillStyle = 'rgba(22, 32, 44, 0.9)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 1.6); else ctx.rect(x, y, w, h); ctx.fill();
    let cx = x + 0.9; const my = y + h / 2;
    parts.forEach(([k, txt], i) => {
      if (k === 'wedge') { ctx.fillStyle = 'rgba(255, 200, 60, 0.95)'; ctx.beginPath(); ctx.moveTo(cx, my); ctx.lineTo(cx + icon, my - 0.9); ctx.lineTo(cx + icon, my + 0.9); ctx.closePath(); ctx.fill(); cx += icon + 0.6; }
      if (k === 'dash') { ctx.strokeStyle = '#7fb0ee'; ctx.lineWidth = 0.45; ctx.setLineDash([0.6, 0.45]); ctx.beginPath(); ctx.moveTo(cx, my); ctx.lineTo(cx + icon, my); ctx.stroke(); ctx.setLineDash([]); cx += icon + 0.6; }
      ctx.font = k === 'read' ? fontB : fontN; ctx.fillStyle = k === 'read' ? (quiet ? '#c9d3de' : '#ffd166') : '#fff';
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

  // the shot review under the rink once a game ends (review.js): it records as the game plays and draws with the functions above
  const REVIEW = installReview({ sim, $, withCtx, drawRink, drawSkater, paintSight, S, RINK_Y, RH, RW, makeSim: () => createSim(DATA) });

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

  // ---------- The Game plan lab: its own plans for both teams, a baseline, and changes tested against it ----------
  // Everything here plays at the NHL settings (every multiplier 1.0) in background workers that import the engine
  // (src/lab/worker.js), or on an engine of its own on the page when a browser cannot start them. It never touches the
  // game being watched: the lab's plans live here and in this browser's storage, not in the Watch view's plan drawer.
  // A game seeded with s plays exactly as tools/lab.js plays seed s.
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
    ['Shots blocked', 'blockedFor', 'blocked', 'Attempts stopped before the net, nearly always by a defender.', 'blocked'],
    ['Missed the net', 'missed', 'missed', 'Attempts wide or high.'],
    ['Game flow'],
    ['Penalties taken', 'pens', 'penalties', 'Minor penalties per game.'],
    ['Faceoffs won', 'fo', 'faceoffWinPct', 'Share of draws won.'],
    ['Goalie freezes', 'freezes', 'freezes', 'Times the other goalie covered the puck.'],
    ['Offsides', 'offsides', 'offsidesPerTeamGame', 'Offside calls against the team.'],
    ['Icings', 'icings', 'icingsPerTeamGame', 'Icings called against the team; there is no icing on the penalty kill.'],
  ];
  const realVerdict = (v, real) => { if (!(real > 0)) return null; const d = (v - real) / real; return Math.abs(d) <= 0.15 ? ['good', 'On target'] : d > 0.5 ? ['bad', 'Well above'] : d < -0.5 ? ['bad', 'Well below'] : d > 0 ? ['warn', 'Above'] : ['warn', 'Below']; };
  // the baseline's games next to each team's real 2025-26 numbers and the league, with a verdict on each
  function renderCalib(rows) {
    const el = $('calib'); if (!el || !MP || !rows || !rows.length) { $('realBox').hidden = true; return; }
    const n = rows.length, sums = [{}, {}], rec = { w: [0, 0], l: [0, 0], otl: [0, 0] };
    for (const r of rows) { r.teams.forEach((t, i) => { for (const k in t.sample) sums[i][k] = (sums[i][k] || 0) + t.sample[k]; }); const w = r.teams[0].goals > r.teams[1].goals ? 0 : 1; rec.w[w]++; if (r.end !== 'REG') rec.otl[1 - w]++; else rec.l[1 - w]++; }
    const src = sums.map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / n])));
    const fmt = (k, v) => k === 'fo' || k === 'faceoffWinPct' ? Math.round(v * 100) + '%' : (k === 'xg' || k === 'score' || k === 'goals' || k === 'xGoals') ? v.toFixed(2) : v.toFixed(1);
    let on = 0, all = 0;
    const realOf = (t, rk) => MP.teams[t.abbr][rk] !== undefined ? MP.teams[t.abbr][rk] : PH.rulesBenchmarks[rk];
    const realRec = teams.map(t => DATA.rosters.teams[t.key].record);
    // each team gets two columns, the baseline's number (with its verdict) and the real one, so the two never read as one
    let html = `<table><thead><tr><th rowspan="2">Per team per game</th>${teams.map(t => `<th colspan="2" class="tm">${t.name}</th>`).join('')}<th rowspan="2" class="lg">NHL average</th></tr><tr>${teams.map(() => '<th class="n">Sim</th><th class="r">Real</th>').join('')}</tr></thead><tbody>`;
    let pointsRow = `<tr><td class="m"><b>Points %</b><span>Share of the standings points: two for a win, one for an overtime or shootout loss.</span></td>` + teams.map((t, i) => { const sim = (2 * rec.w[i] + rec.otl[i]) / (2 * n), real = realRec[i] ? realRec[i].points / (2 * realRec[i].gp) : null; return `<td class="n">${Math.round(sim * 100)}%<span class="rec">${rec.w[i]}-${rec.l[i]}-${rec.otl[i]}</span></td><td class="r">${real === null ? '-' : Math.round(real * 100) + '%'}<span class="rec">${realRec[i] ? `${realRec[i].w}-${realRec[i].l}-${realRec[i].otl}` : ''}</span></td>`; }).join('') + '<td class="lg">50%</td></tr>';
    for (const row of REAL_ROWS) {
      if (row.length === 1) { html += `<tr class="sec"><td colspan="${2 * teams.length + 2}">${row[0]}</td></tr>`; if (pointsRow) { html += pointsRow; pointsRow = ''; } continue; }
      const [label, sk, rk, say, term] = row;
      const cells = teams.map((t, i) => {
        const v = src[i][sk], real = realOf(t, rk), vd = realVerdict(v, real);
        if (vd) { all++; if (vd[0] === 'good') on++; }
        return `<td class="n">${fmt(sk, v)}${vd ? `<span class="pill ${vd[0]}">${vd[1]}</span>` : ''}</td><td class="r">${real !== undefined ? fmt(rk, real) : '-'}</td>`;
      }).join('');
      const lg = MP.league.perGame[rk] !== undefined ? MP.league.perGame[rk] : PH.rulesBenchmarks[rk];
      html += `<tr><td class="m"><b>${label}${term ? ` <button type="button" class="tip" data-term="${term}" aria-label="What is this?">?</button>` : ''}</b><span>${say}</span></td>${cells}<td class="lg">${lg !== undefined ? fmt(rk, lg) : '-'}</td></tr>`;
    }
    el.innerHTML = html + '</tbody></table>';
    $('realScore').textContent = `${on} of ${all} numbers on target`;
    $('realBox').hidden = false;
  }

  const TKEYS = [['Fore', 'Forecheck', 'fore'], ['Break', 'Breakout', 'brk'], ['Entry', 'Entry', 'entry'], ['Oz', 'Offensive zone', 'oz'], ['Dz', 'Defensive zone', 'dz'], ['PP', 'Power play', 'pp'], ['PK', 'Penalty kill', 'pk'], ['Agg', 'Aggression', 'agg']];
  const TEST = { running: false, stop: false, pool: null, poolFailed: false, secPerGame: 2.4 };
  const pre = i => i ? 'a' : 'h';
  const NHL_CFG = () => Object.fromEntries(Object.keys(cfg).map(k => [k, 1]));
  const AGG_STEPS = ['0', '25', '50', '75', '100'];

  const poolSize = () => clamp((navigator.hardwareConcurrency || 4) - 1, 1, 8);
  const workersNow = () => TEST.poolFailed ? 1 : poolSize();
  // the options a ranking plays besides the baseline's own (aggression in five steps)
  const rankOptions = (k, cur) => (k === 'Agg' ? AGG_STEPS : optionsOf(k).map(([v]) => v)).filter(v => !(k === 'Agg' ? Math.abs(+v - +cur) < 13 : v === cur));
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
  // The slow path: the same seeded games, one after another on the page, 4,000 ticks per frame, on an engine of their
  // own, so the game being watched is only paused, never touched.
  let pageSim = null;
  function runInPage(jobs, rows, onRow, finish, done0 = 0, total = jobs.length) {
    const s = pageSim || (pageSim = createSim(DATA));
    const wasPaused = game.paused; game.paused = true;
    let i = 0, done = done0, cur = null;
    const end = () => { game.paused = wasPaused; finish(); };
    TEST.finish = end;
    const start = j => { Object.assign(s.cfg, j.cfg); s.setTactics(0, j.tacs[0]); s.setTactics(1, j.tacs[1]); s.newGame(j.seed); cur = j; };
    const step = () => {
      if (TEST.stop) return end();
      if (!cur) { if (i >= jobs.length) return end(); start(jobs[i++]); }
      let k = 0; while (k++ < 4000 && !s.game.over) s.tick(0.03);
      if (s.game.over) { rows.set(cur.id, { end: s.game.shootout ? 'SO' : s.game.overtime ? 'OT' : 'REG', teams: s.teams.map(t => ({ goals: t.score, xg: t.xg, sog: t.shots, sample: s.teamSample(t) })) }); done++; onRow(done, total); cur = null; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- the lab's plans: one per team, as control values (option values; aggression 0 to 100) ----------
  // The originals are the build plans (data/defaults.json), the same ones a fresh Watch game starts from. The flow:
  // run the baseline (both plans over seeds 1..n), edit either plan, test the edited plans against the baseline on the
  // same seeds, or rerun the baseline to make the edited plans the new reference. Plans, the baseline and the tests are
  // kept in this browser (rink.lab) for this sim version; results saved by another version are dropped.
  const optionsOf = k => [...$('h' + k).options].map(o => [o.value, o.text]);
  const originalPlans = () => teams.map((t, i) => Object.fromEntries(TKEYS.map(([k]) => {
    const v = DATA.defaults && DATA.defaults.systems && DATA.defaults.systems[t.abbr] && DATA.defaults.systems[t.abbr][k];
    const el = $(pre(i) + k), dflt = el.tagName === 'SELECT' ? ([...el.options].find(o => o.defaultSelected) || el.options[0]).value : el.defaultValue;
    return [k, v === undefined ? String(dflt) : k === 'Agg' ? String(Math.round(v * 100)) : String(v)];
  })));
  const copyPlans = p => p.map(x => ({ ...x }));
  const LAB = { coach: 0, plans: originalPlans(), base: null, tested: [], lastRun: null };
  const validPlans = ps => Array.isArray(ps) && ps.length === 2 && ps.every(p => p && TKEYS.every(([k]) => k === 'Agg' ? +p[k] >= 0 && +p[k] <= 100 : optionsOf(k).some(([o]) => o === p[k])));
  try {
    const saved = JSON.parse(localStorage.getItem('rink.lab') || 'null');
    if (saved) {
      if (saved.coach === 1) LAB.coach = 1;
      if (validPlans(saved.plans)) LAB.plans = copyPlans(saved.plans);
      if (saved.v === VERSION && saved.base && validPlans(saved.base.plans)) { LAB.base = saved.base; LAB.tested = Array.isArray(saved.tested) ? saved.tested : []; LAB.lastRun = saved.lastRun || null; }
    }
  } catch (e) {}
  function saveLab() {
    const data = { v: VERSION, coach: LAB.coach, plans: LAB.plans, base: LAB.base, tested: LAB.tested, lastRun: LAB.lastRun };
    for (let keep = LAB.tested.length; keep >= 0; keep--) {   // if the browser runs out of room, drop the oldest tests first
      try { localStorage.setItem('rink.lab', JSON.stringify({ ...data, tested: LAB.tested.slice(0, keep) })); return; } catch (e) {}
    }
  }
  const tacOfPlan = p => Object.fromEntries(TKEYS.map(([k, , t]) => [t, k === 'Agg' ? +p[k] / 100 : p[k]]));
  const keyOf = plans => JSON.stringify(plans);
  const optText = (k, v) => k === 'Agg' ? `${aggWord(+v / 100).toLowerCase()} (${(+v / 100).toFixed(2)})` : (optionsOf(k).find(([o]) => o === v) || [v, v])[1];
  const choiceName = k => TKEYS.find(x => x[0] === k)[1];
  const lc = v => v.charAt(0).toLowerCase() + v.slice(1);
  const sameChoice = (k, a, b) => k === 'Agg' ? Math.abs(+a - +b) < 1 : a === b;
  // what differs between two sets of plans, per team, in words
  const diffs = (from, to) => teams.map((t, i) => ({ team: t, list: TKEYS.filter(([k]) => !sameChoice(k, from[i][k], to[i][k])).map(([k]) => `${lc(choiceName(k))} ${lc(optText(k, to[i][k]))} (was ${lc(optText(k, from[i][k]))})`) })).filter(d => d.list.length);
  const dotStyle = i => i ? 'background:var(--away);border-color:var(--away-3)' : 'background:var(--home);border-color:var(--home-2)';
  // one team's plan as a grid of choices; `tag` keeps the ids apart (o for theirs, m for yours)
  function buildGrid(el, team, tag) {
    const p = LAB.plans[team];
    el.innerHTML = TKEYS.map(([k, label]) => k === 'Agg'
      ? `<label class="agg" data-k="Agg"><span>${label} <b class="aggv" id="${tag}AggV"></b></span><input type="range" id="${tag}Agg" min="0" max="100" value="${p.Agg}"></label>`
      : `<label data-k="${k}">${label}<select id="${tag}${k}">${optionsOf(k).map(([v, t]) => `<option value="${v}"${v === p[k] ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`).join('');
    // compact: what each choice means is its hover text (the plan drawer on Watch and How it works spell them out)
    const SECTION = { Fore: 'forecheck', Break: 'breakout', Entry: 'entry', Oz: 'offensiveZone', Dz: 'defensiveZone', PP: 'powerPlay', PK: 'penaltyKill' };
    const describe = k => { const el = $(tag + k); if (k === 'Agg') { el.title = `${aggWord(el.value / 100)} aggression. ${SYS.coaching ? SYS.coaching.aggression.desc : ''}`; return; } const d = SYS[SECTION[k]][el.value]; el.title = d && d.desc ? d.desc : ''; for (const o of el.options) { const od = SYS[SECTION[k]][o.value]; if (od && od.desc) o.title = od.desc; } };
    TKEYS.forEach(([k]) => { describe(k); $(tag + k).addEventListener('input', e => { LAB.plans[team][k] = String(e.target.value); describe(k); saveLab(); labRefresh(); }); });
  }
  function buildLab() {
    const c = LAB.coach, me = teams[c], op = teams[1 - c];
    document.querySelectorAll('[data-coach]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.coach === c));
    $('myName').textContent = me.name; $('oppName').textContent = op.name;
    $('myDot').style.cssText = dotStyle(c); $('oppDot').style.cssText = dotStyle(1 - c);
    $('myBlock').className = 'side ' + (c ? 'mtl' : 'bos'); $('oppBlock').className = 'side ' + (c ? 'bos' : 'mtl');
    buildGrid($('myGrid'), c, 'm'); buildGrid($('oppGrid'), 1 - c, 'o');
    const keep = $('rankDim').value;
    $('rankDim').innerHTML = TKEYS.map(([k, label]) => `<option value="${k}">${label} (${rankOptions(k, (LAB.base || LAB).plans[c][k]).length + 1} options)</option>`).join('');
    if (keep) $('rankDim').value = keep;
    if (LAB.base) renderBaseline(); else labRefresh();
    renderTested();
  }
  // the buttons, the hint and the changed marks follow the plans: rerun and test only after an edit since the last run
  function labRefresh() {
    const c = LAB.coach, me = teams[c], op = teams[1 - c], b = LAB.base, key = keyOf(LAB.plans), n = +$('labN').value;
    const edited = key !== LAB.lastRun, offBase = !!b && key !== b.key, run = TEST.running;
    $('labRun').textContent = b ? 'Rerun the baseline' : 'Run the baseline';
    // each button against its own last run: rerun once the plans differ from the baseline (or the games count changed),
    // test once they changed since the last test and differ from the baseline
    $('labRun').disabled = run || !!b && !offBase && n === b.seeds.length;
    $('testRun').hidden = !b; $('testRun').disabled = run || !edited || !offBase;
    $('labRun').className = b ? 'secondary' : 'primary';
    $('testRun').textContent = b && offBase && !edited ? 'Tested' : 'Test against the baseline';
    $('labRun').title = $('labRun').disabled && !run ? 'These plans are the baseline. Change a choice or the number of games first.' : '';
    $('testRun').title = $('testRun').disabled && !run ? (offBase ? 'These plans are tested; the result is below. Change a choice to test something else.' : 'These are the baseline plans. Change a choice first.') : '';
    $('rankBox').hidden = !b; $('rankRun').disabled = run;
    if (b) {   // the ranking: what it asks, for whom, and how long it takes
      const k = $('rankDim').value || 'Fore', name = lc(choiceName(k)), m = rankOptions(k, b.plans[c][k]).length;
      const rs = Math.ceil(m * b.seeds.length * TEST.secPerGame / workersNow()), rtime = rs < 90 ? rs + ' seconds' : Math.round(rs / 60) + ' minutes';
      const ask = k === 'Agg' ? `Not sure how aggressive the ${me.name} should be? This plays five levels of aggression` : `Not sure which ${name} the ${me.name} should use? This plays every ${name}`;
      $('rankIntro').innerHTML = `${ask} on the baseline's ${b.seeds.length} games against the ${op.name}' plan, with the rest of the ${me.name}' plan as in the baseline, and ranks them by net chances. It tells you which option helps most, and whether the choice matters at all against this plan. Changes made since the baseline are left out; to rank the ${op.name}' options, coach the ${op.name}.`;
      $('rankRun').textContent = `Find the best ${name} (${m} more option${m === 1 ? '' : 's'}, about ${rtime})`;
    }
    $('forWho').innerHTML = `<span class="dot" style="${dotStyle(c)}"></span><span>${b ? `The ${me.name}' plan against the ${op.name}' plan as run, ${b.seeds.length} games at the NHL settings` : `The ${me.name} against the ${op.name}`}</span>`;
    const workers = workersNow(), secs = Math.ceil((b ? b.seeds.length : n) * TEST.secPerGame / workers), time = secs < 90 ? secs + ' seconds' : Math.round(secs / 60) + ' minutes';
    const changed = b ? diffs(b.plans, LAB.plans) : [], tests = LAB.tested.filter(e => e.kind === 'test');
    const clears = LAB.tested.length ? ' (that clears the tests below)' : '';
    const mine = tests.findIndex(e => e.key === key), jump = mine >= 0 ? `<button type="button" class="linkish" data-jump="${mine}">Test ${tests.length - mine}</button>` : 'the result';
    $('actHint').innerHTML = !b ? `Edit either plan if you like, then run the baseline: ${n} games, about ${time} on this computer.`
      : !offBase ? 'These are the baseline plans. Change a choice in either plan to test it against the baseline.'
      : !edited ? `These plans are tested: see ${jump} below. Change a choice to test something else, or rerun the baseline to make these plans the new baseline${clears}.`
      : `Changed from the baseline: ${changed.map(d => `<b>${d.team.name}</b> ${d.list.join(', ')}`).join('; ')}. Test it on the baseline's ${b.seeds.length} games (about ${time}), or rerun the baseline to make these plans the new baseline${clears}.`;
    // mark every choice that differs from the baseline
    for (const [grid, team] of [['myGrid', c], ['oppGrid', 1 - c]]) $(grid).querySelectorAll('label[data-k]').forEach(l => l.classList.toggle('changed', !!b && !sameChoice(l.dataset.k, b.plans[team][l.dataset.k], LAB.plans[team][l.dataset.k])));
    // each aggression slider says where it sits, and where the baseline had it once it moved
    for (const [tag, team] of [['m', c], ['o', 1 - c]]) { const v = +LAB.plans[team].Agg, was = b && +b.plans[team].Agg; $(tag + 'AggV').textContent = `${aggWord(v / 100)}, ${v} of 100${b && !sameChoice('Agg', was, v) ? `, baseline ${was}` : ''}`; }
  }
  document.querySelectorAll('[data-coach]').forEach(b => b.addEventListener('click', () => { if (TEST.running || LAB.coach === +b.dataset.coach) return; LAB.coach = +b.dataset.coach; saveLab(); buildLab(); }));
  $('labReset').addEventListener('click', () => { if (TEST.running) return; LAB.plans = originalPlans(); saveLab(); buildLab(); });
  $('labN').addEventListener('input', labRefresh);
  $('rankDim').addEventListener('input', labRefresh);
  $('actHint').addEventListener('click', e => { const j = e.target.closest('[data-jump]'); if (!j) return; const el = $('tested').querySelectorAll('article.test')[+j.dataset.jump]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  // copy the lab's plans to the Watch view and start a game there with them
  $('watchPlans').addEventListener('click', () => {
    LAB.plans.forEach((p, i) => TKEYS.forEach(([k]) => { const el = $(pre(i) + k); el.value = p[k]; el.dispatchEvent(new Event('input')); }));
    watchGame(); game.paused = false; $('pause').textContent = 'Pause';
    showView('watch'); window.scrollTo(0, 0);
  });

  // ---------- statistics and the results ----------
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const ci95 = a => a.length > 1 ? 1.96 * Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)) / Math.sqrt(a.length) : 0;
  const pct = v => Math.round(100 * v) + '%';
  const sgn = (v, d = 2) => { const r = Math.abs(v).toFixed(d); return +r === 0 ? r : (v > 0 ? '+' : '−') + r; };   // a difference that rounds to zero shows no sign
  const perGame = (row, c) => { const me = row.teams[c], op = row.teams[1 - c], win = me.goals > op.goals; return { xgd: me.xg - op.xg, gd: me.goals - op.goals, xgf: me.xg, xga: op.xg, pts: win ? 1 : row.end !== 'REG' ? 0.5 : 0 }; };
  const verdict = (m, e) => m - e > 0 ? ['good', 'Clear edge'] : m + e < 0 ? ['bad', 'Clear cost'] : ['flat', 'Too close to call'];
  function rangeBar(m, e, scale) {
    const x = v => clamp(50 + (v / scale) * 50, 0, 100), col = m - e > 0 ? '#1f7a4a' : m + e < 0 ? '#a3241b' : 'var(--fg-dim)';
    return `<div class="range" aria-hidden="true"><div class="axis"></div><div class="zero"></div><div class="span" style="left:${x(m - e)}%;width:${x(m + e) - x(m - e)}%;background:${col}"></div><div class="pt" style="left:${x(m)}%;background:${col}"></div></div>`;
  }
  // a team's record over a set of games, per game
  function recordOf(rows, i) {
    let w = 0, l = 0, o = 0, gf = 0, ga = 0, xf = 0, xa = 0;
    for (const r of rows) { const me = r.teams[i], op = r.teams[1 - i]; if (me.goals > op.goals) w++; else if (r.end !== 'REG') o++; else l++; gf += me.goals; ga += op.goals; xf += me.xg; xa += op.xg; }
    const n = rows.length || 1; return { w, l, o, pts: (2 * w + o) / (2 * n), gf: gf / n, ga: ga / n, xf: xf / n, xa: xa / n };
  }
  const RECORD_HEAD = '<tr><th></th><th>W-L-OTL</th><th>Pts</th><th>GF</th><th>GA</th><th>xGF</th><th>xGA</th></tr>';
  const recordRow = (label, x, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td><td>${x.w}-${x.l}-${x.o}</td><td>${pct(x.pts)}</td><td>${x.gf.toFixed(2)}</td><td>${x.ga.toFixed(2)}</td><td>${x.xf.toFixed(2)}</td><td>${x.xa.toFixed(2)}</td></tr>`;
  const recordTable = rows => `<table>${RECORD_HEAD}${teams.map((t, i) => recordRow(t.abbr, recordOf(rows, i))).join('')}</table>`;
  // baseline and test for each team, the coached team first, each with the change between them
  function changeTable(rowsA, rowsB, c) {
    const int = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);
    return `<table>${RECORD_HEAD}${[c, 1 - c].map(i => {
      const a = recordOf(rowsA, i), b = recordOf(rowsB, i), pp = Math.round(100 * b.pts) - Math.round(100 * a.pts);
      return recordRow(`${teams[i].abbr} baseline`, a, 'grp') + recordRow(`${teams[i].abbr} test`, b) +
        `<tr class="chg"><td>Change</td><td>${int(b.w - a.w)} ${int(b.l - a.l)} ${int(b.o - a.o)}</td><td>${int(pp)}</td><td>${sgn(b.gf - a.gf)}</td><td>${sgn(b.ga - a.ga)}</td><td>${sgn(b.xf - a.xf)}</td><td>${sgn(b.xa - a.xa)}</td></tr>`;
    }).join('')}</table>`;
  }
  function renderBaseline() {
    const b = LAB.base, c = LAB.coach, me = teams[c], op = teams[1 - c];
    const g = b.rows.map(r => perGame(r, c)), pts = mean(g.map(x => x.pts));
    $('baseHeadline').textContent = `The ${me.name} take ${pct(pts)} of the points against this ${op.name} plan, on ${mean(g.map(x => x.xgf)).toFixed(1)} chances a game for and ${mean(g.map(x => x.xga)).toFixed(1)} against.`;
    $('baseExplain').hidden = true;
    $('baseRecord').innerHTML = recordTable(b.rows) + gamePicker('base', b.rows.map((_, i) => i), b.rows);
    renderCalib(b.rows);
    labRefresh();
  }
  // a test against the baseline, game for game on the same seeds, from the coached team's side
  function compare(rowsA, rowsB, c) {
    const d = rowsA.map((ra, i) => { const a = perGame(ra, c), b = perGame(rowsB[i], c); return { xg: b.xgd - a.xgd, xgf: b.xgf - a.xgf, xga: b.xga - a.xga, gd: b.gd - a.gd, pts: b.pts - a.pts }; });
    const S = k => [mean(d.map(x => x[k])), ci95(d.map(x => x[k]))];
    const [xm, xe] = S('xg'), [gm, ge] = S('gd'), [pm, pe] = S('pts'), [fm] = S('xgf'), [am] = S('xga');
    return { xm, xe, gm, ge, pm, pe, fm, am, pA: mean(rowsA.map(r => perGame(r, c).pts)), pB: mean(rowsB.map(r => perGame(r, c).pts)), n: rowsA.length };
  }
  const tip = (term, what) => ` <button type="button" class="tip" data-term="${term}" aria-label="${what}">?</button>`;
  function testCard(e, num) {
    const c = LAB.coach, me = teams[c], rowsA = e.idx.map(i => LAB.base.rows[i]), r = compare(rowsA, e.rowsB, c);
    const vx = verdict(r.xm, r.xe), vg = verdict(r.gm, r.ge), vp = verdict(r.pm, r.pe);
    const what = diffs(LAB.base.plans, e.plans).map(d => `<b>${d.team.name}:</b> ${d.list.join(', ')}`).join('<br>');
    const head = vx[0] === 'good' ? `Better for the ${me.name}: about ${Math.abs(r.xm).toFixed(1)} more net chances a game than the baseline.` : vx[0] === 'bad' ? `Worse for the ${me.name}: about ${Math.abs(r.xm).toFixed(1)} fewer net chances a game than the baseline.` : `About the same as the baseline for the ${me.name}.`;
    const tiles = [
      ['Net chances' + tip('net', 'What are net chances?'), sgn(r.xm), `chances for ${sgn(r.fm)}, against ${sgn(r.am)} a game`, vx, rangeBar(r.xm, r.xe, 2.5)],
      ['Goal difference', sgn(r.gm), 'per game, against the baseline', vg, rangeBar(r.gm, r.ge, 2.5)],
      ['Points' + tip('pts', 'What is points %?'), `${pct(r.pA)} → ${pct(r.pB)}`, 'baseline, then this test', vp, rangeBar(r.pm, r.pe, 0.35)],
    ].map(([k, big, sub, [cls, label], bar]) => `<div class="v ${cls}"><div class="k">${k}</div><div class="big">${big}</div><div class="sub">${sub}</div>${bar}<span class="pill ${cls}">${label}</span></div>`).join('');
    const explain = vx[0] !== 'flat' && vp[0] === 'flat' ? `The chance difference is real at ${r.n} games. The points difference is not yet: points swing about ${Math.round(r.pe * 100)} points either way from luck alone${tip('close', 'What does too close to call mean?')}. Chances are the number to trust here.`
      : vx[0] === 'flat' ? `Neither number separates it from the baseline at ${r.n} games${tip('close', 'What does too close to call mean?')}. Run more games, or treat them as even.` : `Both chances and points separate it from the baseline at ${r.n} games.`;
    const ti = LAB.tested.indexOf(e);
    return `<article class="change test"><span class="tnum">Test ${num}</span><p class="what">${what}</p><p class="headline sm">${head}</p><div class="verdicts">${tiles}</div><p class="hint">${explain}</p>
      <details class="more"><summary>Records</summary><div class="calib lab">${changeTable(rowsA, e.rowsB, c)}</div><p class="hint">Points change in percentage points. Differences are this test minus the baseline, game for game: both play the same games, with the same bounces until a change makes play go another way. A 95% range that includes zero means the two are not separated at this many games.</p></details>${gamePicker('test', e.idx, rowsA, e.rowsB, ti)}</article>`;
  }
  // a ranking's answer in one sentence: the best option if one clearly beats the baseline's, otherwise whether the choice matters
  function rankCard(e) {
    const me = teams[e.c], op = teams[1 - e.c], name = lc(choiceName(e.k)), txt = v => optText(e.k, v);
    const The = e.k === 'Agg' ? 'Aggression' : 'The ' + name;
    const cur = e.list.find(r => r.cur), others = e.list.filter(r => !r.cur);
    const better = others.filter(r => r.m - r.e > 0), worse = others.filter(r => r.m + r.e < 0), best = better[0];
    const head = best ? `${txt(best.v)} is the best ${name} for the ${me.name} here: about ${best.m.toFixed(1)} more net chances a game than ${lc(txt(cur.v))}, the baseline's.`
      : worse.length === others.length ? `${txt(cur.v)}, the baseline's ${name}, is already the best: every other option gives the ${me.name} fewer net chances.`
      : worse.length ? `No ${name} beats ${lc(txt(cur.v))}, the baseline's. ${worse.map(r => txt(r.v)).join(' and ')} ${worse.length === 1 ? 'costs' : 'cost'} the ${me.name} chances; the rest are too close to call.`
      : `${The} barely matters against this ${op.name} plan: no option separates from ${lc(txt(cur.v))}, the baseline's, at ${e.n} games.`;
    const rows = e.list.map(r => { const [cls, label] = r.cur ? ['cur', 'Baseline plan'] : verdict(r.m, r.e); return `<div class="r${r.cur ? ' cur' : ''}"><div class="name">${txt(r.v)}<small>${r.cur ? 'what the others are measured from' : sgn(r.m) + ' net chances a game'}</small></div>${r.cur ? '<div class="range" aria-hidden="true"><div class="axis"></div><div class="zero"></div></div>' : rangeBar(r.m, r.e, 2.5)}<span class="pill ${cls}">${label}</span></div>`; }).join('');
    const inPlan = best && sameChoice(e.k, LAB.plans[e.c][e.k], best.v);
    const use = best ? (inPlan ? `<p class="hint">${txt(best.v)} is in the ${me.name}' plan now. Test it against the baseline to see it with the rest of your changes.</p>` : `<div class="row"><button type="button" class="secondary" data-use="${e.c}|${e.k}|${best.v}">Put ${lc(txt(best.v))} in the ${me.name}' plan</button></div>`) : '';
    return `<article class="change rankres"><span class="tnum">Best ${name}</span><p class="headline sm">${head}</p><p class="what">Every ${name} for the ${me.name} on the baseline's ${e.n} games, the rest of the plan as in the baseline.</p><div class="rank">${rows}</div>${use}<p class="hint">Each dot is the best estimate of net chances against the baseline's ${name}, and its band the 95% range. Right of the line is better for the ${me.name}. A band that crosses the line is too close to call.</p></article>`;
  }
  // a ranking's best option, put into that team's plan
  $('tested').addEventListener('click', ev => {
    const u = ev.target.closest('[data-use]'); if (!u || TEST.running) return;
    const [c, k, v] = u.dataset.use.split('|'); LAB.plans[+c][k] = v; saveLab(); buildLab();
    const grid = +c === LAB.coach ? 'myGrid' : 'oppGrid', el = $(grid).querySelector(`[data-k="${k}"]`);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1900);
  });
  // a picker for the games of a run: each with its score, sorted by how much the test changed it for the coached team
  function gamePicker(kind, idxs, rowsA, rowsB, testIndex) {
    const c = LAB.coach, me = teams[c], sc = r => `${teams[0].abbr} ${r.teams[0].goals}, ${teams[1].abbr} ${r.teams[1].goals}${r.end !== 'REG' ? ' ' + r.end : ''}`;
    const items = idxs.map((bi, k) => ({ bi, k, seed: LAB.base.seeds[bi], swing: rowsB ? perGame(rowsB[k], c).xgd - perGame(rowsA[k], c).xgd : 0 }));
    if (rowsB) items.sort((a, b) => b.swing - a.swing);
    const opts = items.map(x => `<option value="${x.k}">Game ${x.seed}: ${rowsB ? `baseline ${sc(rowsA[x.k])}, test ${sc(rowsB[x.k])}, ${sgn(x.swing, 1)} net chances` : sc(rowsA[x.k])}</option>`).join('');
    return `<div class="gamepick"><label>${rowsB ? `Open a game, the biggest swings for the ${me.name} first` : 'Open a baseline game'}<select data-pick="${kind}" data-test="${testIndex === undefined ? '' : testIndex}">${opts}</select></label><div class="row">${rowsB ? '<button type="button" data-open="base">Watch it with the baseline plans</button><button type="button" data-open="test">Watch it with the test plans</button>' : '<button type="button" data-open="base">Watch and review it</button>'}</div></div>`;
  }
  // opening a lab game on the Watch rink, from the baseline card or a test card
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (!b || TEST.running || !LAB.base) return;
    const box = b.closest('.gamepick'), sel = box.querySelector('select'), k = +sel.value, ti = sel.dataset.test;
    if (ti === '') { const bi = k; playLabGame(LAB.base.seeds[bi], LAB.base.plans, `Baseline game ${LAB.base.seeds[bi]}`, LAB.base.rows[bi]); return; }
    const e2 = LAB.tested[+ti], bi = e2.idx[k], seed = LAB.base.seeds[bi], test = b.dataset.open === 'test';
    playLabGame(seed, test ? e2.plans : LAB.base.plans, `${test ? 'Test' : 'Baseline'} game ${seed}${test ? ', the test plans' : ', the baseline plans'}`, test ? e2.rowsB[k] : LAB.base.rows[bi]);
  });
  function renderTested() {
    let n = LAB.tested.filter(e => e.kind === 'test').length + 1;
    $('tested').innerHTML = LAB.base ? LAB.tested.map(e => e.kind === 'rank' ? rankCard(e) : testCard(e, --n)).join('') : '';
  }

  // ---------- running ----------
  function setRunning(on) {
    TEST.running = on; TEST.stop = false; $('labStop').hidden = !on;
    if (!on) $('labBar').style.width = '0%';
    labRefresh();
  }
  const progress = (done, total, what) => { $('labBar').style.width = (100 * done / total) + '%'; $('labNote').textContent = `${what}: game ${done} of ${total}`; if (TEST.rankNote) $('rankNote').textContent = $('labNote').textContent; };
  const timed = async (jobs, what) => {
    setRunning(true); const t0 = performance.now();
    const rows = await runJobs(jobs, (d, tot) => progress(d, tot, what));
    const secs = (performance.now() - t0) / 1000; if (rows.size) TEST.secPerGame = secs * (TEST.pool ? poolSize() : 1) / rows.size;
    setRunning(false); return { rows, secs };
  };
  $('labRun').addEventListener('click', async () => {
    if (TEST.running) return;
    const n = +$('labN').value, seeds = Array.from({ length: n }, (_, i) => i + 1), plans = copyPlans(LAB.plans), tacs = plans.map(tacOfPlan);
    const { rows, secs } = await timed(seeds.map(sd => ({ id: sd, seed: sd, tacs, cfg: NHL_CFG() })), 'Baseline');
    const done = seeds.filter(sd => rows.has(sd));
    $('labNote').textContent = `Baseline: ${done.length} games${TEST.stop ? ', stopped early' : ''}, ${Math.round(secs)} seconds.`;
    if (!done.length) return;
    LAB.base = { key: keyOf(plans), plans, seeds: done, rows: done.map(sd => rows.get(sd)) }; LAB.tested = []; LAB.lastRun = LAB.base.key;
    saveLab(); renderBaseline(); renderTested();
  });
  // plays the given plans on the baseline's seeds; returns the baseline indexes it finished and those rows
  async function playOnBase(plans, what) {
    const b = LAB.base, tacs = plans.map(tacOfPlan);
    const { rows } = await timed(b.seeds.map(sd => ({ id: sd, seed: sd, tacs, cfg: NHL_CFG() })), what);
    const idx = b.seeds.map((sd, i) => rows.has(sd) ? i : -1).filter(i => i >= 0);
    return { idx, rowsB: idx.map(i => rows.get(b.seeds[i])) };
  }
  $('testRun').addEventListener('click', async () => {
    if (TEST.running || !LAB.base) return;
    const plans = copyPlans(LAB.plans), key = keyOf(plans);
    const { idx, rowsB } = await playOnBase(plans, 'Test');
    $('labNote').textContent = TEST.stop ? 'Stopped early.' : '';
    if (!idx.length) return;
    LAB.tested.unshift({ kind: 'test', key, plans, idx, rowsB }); LAB.lastRun = key;
    saveLab(); renderTested(); labRefresh();
    $('tested').firstElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('rankRun').addEventListener('click', async () => {
    if (TEST.running || !LAB.base) return;
    const c = LAB.coach, k = $('rankDim').value, b = LAB.base, cur = b.plans[c][k];
    const others = rankOptions(k, cur);
    const plansFor = v => { const p = copyPlans(b.plans); p[c][k] = v; return p; };
    const jobs = others.flatMap(v => { const tacs = plansFor(v).map(tacOfPlan); return b.seeds.map(sd => ({ id: v + '|' + sd, seed: sd, tacs, cfg: NHL_CFG() })); });
    TEST.rankNote = true; const { rows } = await timed(jobs, `Finding the best ${lc(choiceName(k))}`); TEST.rankNote = false;
    $('labNote').textContent = $('rankNote').textContent = TEST.stop ? 'Stopped early.' : '';
    const list = [{ v: cur, m: 0, e: 0, cur: true }, ...others.map(v => {
      const idx = b.seeds.map((sd, i) => rows.has(v + '|' + sd) ? i : -1).filter(i => i >= 0); if (!idx.length) return null;
      const d = idx.map(i => perGame(rows.get(v + '|' + b.seeds[i]), c).xgd - perGame(b.rows[i], c).xgd);
      return { v, m: mean(d), e: ci95(d) };
    }).filter(Boolean)].sort((x, y) => y.m - x.m);
    LAB.tested.unshift({ kind: 'rank', c, k, n: b.seeds.length, list }); saveLab(); renderTested();
    $('tested').firstElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('labStop').addEventListener('click', () => { TEST.stop = true; if (TEST.finish) TEST.finish(); });

  // ---------- Views, steps, drawers and game plans ----------
  const VIEWS = ['watch', 'lab'];
  function showView(v) {
    if (!VIEWS.includes(v)) v = 'watch';
    document.querySelectorAll('nav.views [data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
    document.querySelectorAll('section.view').forEach(sec => { sec.hidden = sec.dataset.view !== v; });
  }
  document.querySelectorAll('nav.views [data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  // the page opens on Watch; a link can ask for the lab (#lab, or the old #test and #real)
  { const h = location.hash.slice(1); showView(['lab', 'test', 'real'].includes(h) ? 'lab' : 'watch'); }
  document.querySelectorAll('[data-go-lab]').forEach(b => b.addEventListener('click', () => { showView('lab'); window.scrollTo(0, 0); $('myGrid').querySelector('select').focus({ preventScroll: true }); }));
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
  // a choice's meaning, written under its select in the plan drawer (the lab's compact grids use hover text instead)
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
  document.querySelectorAll('#planDrawer select, #planDrawer input[type=range]').forEach(el => el.addEventListener('input', renderPlans));
  renderPlans();
  buildLab();
  // short explainers for the numbers a newcomer will not know
  const TERMS = {
    chances: ['Chances (expected goals)', "How many goals a team's shots were worth, from where and how each one was taken. A shot from the slot is worth far more than one from the point. Over many games, chances predict results better than goals do."],
    sight: ['Sight lines', `What the player with the puck sees in the offensive zone. The yellow wedge runs from him to the two posts: the open part of the net he can shoot at. A defender in front of him casts a dark shadow over the part he blocks. The blue dash goes to his best pass, the ringed teammate. The tag gives the chance each one has of becoming a goal and his read: he shoots a look worth at least ${Math.round(PH.shotDecision.xgChoice.minXg * 100)}% unless a pass is clearly better, passes when a teammate has a clearly better look, and otherwise holds the puck for a better play. Slow the game to 0.5x to follow it.`],
    baseline: ['Baseline', "Your plan against theirs in the Game plan lab, 100 games at the NHL settings. Every change you try plays the same games and is compared with it."],
    same: ['The same games', 'A change plays games that start from the same random numbers as the baseline, so the bounces are the same until the change makes play go another way. A gap between them comes from the change, not from easier games.'],
    net: ['Net chances', 'Chances for minus chances against, per game. The best single number for whether a plan is working.'],
    close: ['Too close to call', 'The difference is smaller than the normal swing from luck at this many games. Run more games, or treat the two plans as even.'],
    edge: ['Clear edge, clear cost', 'The whole 95% range of the difference is on one side of zero, so luck alone is unlikely to explain it at this many games.'],
    pts: ['Points %', 'Share of the available standings points: two for a win, one for an overtime or shootout loss.'],
    hd: ['High-danger shots', 'Shots with at least a 20% chance of going in, almost all from close to the net.'],
    md: ['Medium-danger shots', 'Shots with an 8% to 20% chance: the slot and the inside of the circles.'],
    ld: ['Low-danger shots', 'Shots with under an 8% chance: the point, the outside and sharp angles.'],
    attempts: ['Shot attempts', 'Every shot a team takes: on goal, blocked or missed. Analysts call the count Corsi.'],
    blocked: ['Blocked shots', 'Shots stopped on the way to the net, nearly always by a defender getting in front. One that hits a teammate in the lane counts too, as it does in NHL scoring.'],
    poss: ['Possession', 'Share of the time each team had the puck on a stick.'],
    take: ['Takeaways', 'Times a player stole the puck from the carrier.'],
    pk: ['Penalty kill', 'Playing a man short. There is no icing, so the killers clear the puck the length of the ice whenever they get it.'],
    nhl: ['NHL settings', 'Skating, passing and shooting at the values calibrated to real NHL tracking data. The Game plan lab always uses them; the Watch settings start faster because it is more fun to watch.'],
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
  $('newgame').addEventListener('click', () => { if (!SIM_END.on) watchGame(); });
  // Sim to the final horn: the rest of this game at once, the same ticks the rink would play, a few thousand per frame
  // so the page stays responsive; then the review opens
  const SIM_END = { on: false };
  $('simEnd').addEventListener('click', () => {
    if (SIM_END.on || game.over) return;
    SIM_END.on = true; const b = $('simEnd'); b.disabled = $('newgame').disabled = true;
    const run = () => {
      for (let k = 0; k < 4000 && !game.over; k++) { tick(0.03); REVIEW.step(0.03); }
      b.textContent = game.over ? 'Sim to the final horn' : `Simming: ${['1st', '2nd', '3rd', 'OT'][game.period - 1] || 'OT'} period`;
      if (!game.over) { requestAnimationFrame(run); return; }
      SIM_END.on = false; b.disabled = true; $('newgame').disabled = false; FX.rings = []; FX.goalLight = null;
      const rv = $('review'); if (!rv.hidden) rv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    requestAnimationFrame(run);
  });
  sim.on('reset', () => { $('simEnd').disabled = false; });
  sim.on('final', () => { if (!SIM_END.on) $('simEnd').disabled = true; });

  // ---------- A lab game on the rink ----------
  // Any game the lab played can be opened here: its seed, the plans it was played with and the NHL settings, ticking at
  // the lab's fixed 0.03 s, so it plays exactly as it did in the lab and its shots can be reviewed. The Watch plans and
  // sliders are not touched; leaving the lab game (New game, or the link in the note) puts them back in charge.
  function playLabGame(seed, plans, label, row) {
    LABGAME = { seed, label, row }; labAcc = 0;
    plans.forEach((p, i) => sim.setTactics(i, tacOfPlan(p)));
    Object.keys(cfg).forEach(k => { cfg[k] = 1; });
    newGame(seed); game.paused = false; $('pause').textContent = 'Pause';
    const r = row.teams;
    $('labGameNote').innerHTML = `<b>${label}</b>, at the NHL settings: it plays exactly as it did in the lab, where it ended ${teams[0].abbr} ${r[0].goals}, ${teams[1].abbr} ${r[1].goals}${row.end !== 'REG' ? ` (${row.end})` : ''}. Sim to the final horn to go straight to its review. <button type="button" class="linkish" id="labGameLeave">Back to my own game</button>`;
    $('labGameNote').hidden = false; $('labGameLeave').addEventListener('click', watchGame);
    showView('watch'); window.scrollTo(0, 0);
  }
  function leaveLabGame() {
    if (!LABGAME) return; LABGAME = null; $('labGameNote').hidden = true;
    ADMIN.forEach(([k]) => { const i = $('adm_' + k); if (i) cfg[k] = +i.value; });
    readTactics();
  }
  // touching the Watch plans or sliders hands the rink back to them: the game is no longer the lab's
  ['planDrawer', 'setDrawer'].forEach(id => $(id).addEventListener('input', () => { if (LABGAME) leaveLabGame(); }));
  sim.on('final', () => {
    if (!LABGAME) return;
    const r = LABGAME.row.teams, same = teams[0].score === r[0].goals && teams[1].score === r[1].goals;
    $('labGameNote').insertAdjacentHTML('beforeend', `<span class="lgcheck ${same ? 'ok' : 'bad'}">${same ? 'Final matches the lab.' : 'Final differs from the lab.'}</span>`);
  });

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    if (!game.paused && !SIM_END.on && LABGAME) { labAcc += real * game.speed; while (labAcc >= 0.03) { fxTick(0.03); tick(0.03); REVIEW.step(0.03); labAcc -= 0.03; } moveOfficials(real * game.speed); }
    else if (!game.paused && !SIM_END.on) { let g = real * game.speed; while (g > 0) { const d = Math.min(g, 0.03); fxTick(d); tick(d); REVIEW.step(d); g -= d; } moveOfficials(real * game.speed); }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRink(); drawBenches(); drawOfficials(); drawPlayers(); drawWhistle(); updateHud(); updateSheets(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // debug and test hook: lets a harness step the engine headlessly
  window.rinkSim = { sim, tick, teams, game, puck, DATA, cfg, newGame, teamSample, runJobs, TEST, LAB, REVIEW };
}
// ---------- Data loading: the JSON files next to this page ----------
(async () => {
  const names = ['rosters', 'ratings', 'systems', 'physics', 'moneypuck-2025', 'defaults', 'xg-model'];
  const DATA = {};
  try {
    await Promise.all(names.map(async n => { const r = await fetch('data/' + n + '.json', { cache: 'no-store' }); if (!r.ok) throw new Error('data/' + n + '.json ' + r.status); DATA[n] = await r.json(); }));
  } catch (e) { document.getElementById('note').textContent = 'Could not load the game data. Reload the page to try again.'; throw e; }
  try { startSim(DATA); } catch (e) { document.getElementById('note').textContent = 'Could not start: ' + e.message; throw e; }
})();
