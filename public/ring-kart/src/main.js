// Ring Kart: the page. Loads the lap and the cars, builds the world, runs the queue at the gate, the race and the
// result, reads the keyboard, a gamepad or the touch buttons, and draws the HUD, the map and the sound.
//
// index.html loads it with a version stamp (src/main.js?v=VERSION), and every import carries the same stamp (Three.js
// comes from Cathedral Lab's copy with Cathedral Lab's), so a visitor never mixes files from two deploys.
import * as THREE from '../../cathedral-lab/src/vendor/three.module.js?v=0.14';
import { buildTrack, cornerAt, locateGlobal, pointAt } from './track.js?v=0.8';
import { makeCar, step, collide, driveAI, assist, gearbox, drs, cornerSpeed, nextCorner } from './drive.js?v=0.8';
import { buildWorld, buildSky, buildLine, HORIZON, setInkFog, carMesh, label } from './scene.js?v=0.8';
import { racingPath, lineFor, drivePro, PHASE } from './line.js?v=0.8';
import { Sound } from './audio.js?v=0.8';

const VERSION = '0.8';
const $ = id => document.getElementById(id);
$('version').textContent = 'v' + VERSION;
const store = { get(k, d) { try { const v = localStorage.getItem('ringkart.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('ringkart.' + k, JSON.stringify(v)); } catch { /* private window */ } } };
const pretty = s => s.replace('Megane', 'Mégane').replace('Citroen', 'Citroën');
const ord = n => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
const corner = n => n.replace('Ex-Muehle', 'Ex-Mühle').replace('Bruennchen', 'Brünnchen').replace('Doettinger Hoehe', 'Döttinger Höhe').replace('Quiddelbacher Hoehe', 'Quiddelbacher Höhe').replace('Fuchsroehre', 'Fuchsröhre');

// ---------- data ----------
const load = n => fetch(`data/${n}.json?v=${VERSION}`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(n + ' ' + r.status); return r.json(); });
const [TRACK, CARS] = await Promise.all([load('track'), load('cars')]);
const R = CARS.race, RV = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.value]));
const track = buildTrack(TRACK);
const gateS = track.gateAt * track.ds, finishK = track.n - 12, finishS = finishK * track.ds;

// ---------- 3D ----------
const cv = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); }
catch (e) { $('stage').insertAdjacentHTML('beforeend', '<div class="nogl">This browser could not start 3D graphics.</div>'); $('loading').hidden = true; throw e; }
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(HORIZON).convertSRGBToLinear();
scene.fog = new THREE.Fog(scene.background.getHex(), 170, 820);
const sky = buildSky(); scene.add(sky);
setInkFog(scene.fog);
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1400);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x41532f, 0.75));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
// the signs and the names over the cars are painted with the page's 70s fonts, so wait for them (but not for long)
await Promise.race([Promise.all(['56px Shrikhand', '44px Righteous'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
const world = buildWorld(scene, track);
// the best line: one path for every car, its speeds and phases for the car you pick
const PATH = racingPath(track), lineMesh = buildLine(track, PATH); scene.add(lineMesh.mesh);
let LINE = null;
const gate = world.gate;
$('loading').hidden = true;

// ---------- particles: sparks from drifts, smoke from the tyres, dust off the grass ----------
const PN = 600, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pLife = new Float32Array(PN), pVel = new Float32Array(PN * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
// each particle a cartoon puff: a round dab of colour with an ink rim
const puff = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#2a1a0e'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill(); const t = new THREE.CanvasTexture(c); return t; })();
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.7, map: puff, vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: false }));
points.frustumCulled = false; scene.add(points);
let pNext = 0;
function emit(x, y, z, vx, vy, vz, col, life) { const i = pNext; pNext = (pNext + 1) % PN; pPos.set([x, y, z], i * 3); pVel.set([vx, vy, vz], i * 3); pCol.set(col, i * 3); pLife[i] = life; }
function particles(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -9999; continue; }
    pLife[i] -= dt; pVel[i * 3 + 1] -= 4 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ---------- cars ----------
const SPECS = CARS.player;
let choice = store.get('car', 'gti');
if (!SPECS.find(s => s.id === choice)) choice = 'gti';
let cars = [], player = null, group = [];
const meshes = new Map();
// how much help: Beginner brakes for you and steers you off the Armco, Intermediate steps in only when you are far
// too fast or nearly on the rail, Expert is the bare car. The numbers are in cars.json (race.modes). Each mode keeps
// its own best laps; Expert keeps the ones from before there were modes. The pro always drives Expert.
const MODES = RV.modes, MODE_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
const MODE_NOTE = {
  beginner: 'Brakes for you when you come in too fast and steers you off the Armco. The walls and the grass hardly slow you.',
  intermediate: 'Brakes for you only when you are far too fast, and nudges you off the Armco. Hitting it costs a little.',
  expert: 'No help. The Armco and the grass cost what they cost, the way the pro drives it.'
};
let mode = store.get('mode', 'beginner');
if (!MODES[mode]) mode = 'beginner';
// times on the real lap (from 0.8) are kept apart from those on the hand-traced one before it, which was a different
// length: `lap2.` in front of the old keys, which stay in the browser untouched
const bestKey = id => 'lap2.' + (mode === 'expert' ? 'best.' + id : `best.${mode}.${id}`);
function setMode(m) {
  mode = m; store.set('mode', m);
  document.querySelectorAll('.modes [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('modeNote').textContent = MODE_NOTE[m];
  if (player && S.mode === 'pick') player.mode = MODES[m];
}
document.querySelectorAll('.modes [data-mode]').forEach(b => b.onclick = () => { setMode(b.dataset.mode); picker(); });
function addCar(spec, k, lat, role) {
  const c = makeCar(spec, track, k, lat);
  c.role = role; c.traffic = role === 'traffic';
  const m = carMesh(spec.body); m.rotation.order = 'YZX'; scene.add(m);
  if (role !== 'player') { const l = label(pretty(spec.name)); l.position.y = spec.body.hgt + 1.3; l.visible = false; m.add(l); m.label = l; }
  if (role === 'player') {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.9, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb238, transparent: true, opacity: 0.95 }));
    flame.rotation.z = Math.PI / 2; flame.position.set(-spec.body.len / 2 - 0.7, 0.42, -0.45); flame.visible = false; m.add(flame); m.flame = flame;
  }
  meshes.set(c, m); cars.push(c); return c;
}
function clearCars() { for (const m of meshes.values()) scene.remove(m); meshes.clear(); cars = []; group = []; player = null; }

// ---------- the session: queue, race, result ----------
let camInit = false;
const S = { mode: 'pick', t: 0, queue: [], lastRelease: -99, barrier: 0, barrierTarget: 0, raceStart: 0, raceT: 0, finished: [], cornerName: '', cornerT: 0, paused: false, camMode: 0, resultShown: false };
function setup() {
  clearCars();
  const spec = SPECS.find(s => s.id === choice);
  const gap = RV.queueGap, gk = track.gateAt;
  const behind = (i, len) => gk - Math.round((2.6 + i * gap + len / 2) / track.ds);
  // the queue, front first: four rivals, you, two fast cars behind you
  const rivals = shuffle(CARS.rivals.slice()).slice(0, 4);
  S.queue = [];
  rivals.forEach((r, i) => { const c = addCar({ ...r, drift: 1 }, behind(i, r.body.len), 0, 'rival'); S.queue.push(c); });
  player = addCar(spec, behind(4, spec.body.len), 0, 'player'); player.mode = MODES[mode]; S.queue.push(player);
  CARS.chasers.forEach((r, i) => { const c = addCar(r, behind(5 + i, r.body.len), 0, 'chaser'); S.queue.push(c); });
  // two rivals already through the gate, a little way down the road
  shuffle(CARS.rivals.filter(r => !rivals.includes(r))).slice(0, 2).forEach((r, i) => {
    const c = addCar(r, gk + Math.round((110 - i * 55) / track.ds), 1.5 - i * 3, 'rival'); c.v = 26 - i * 4; c.released = true; c.releasedAt = -6 + i * 3;
  });
  // traffic out on the lap, keeping right
  const T = CARS.traffic, nT = RV.trafficCount;
  for (let i = 0; i < nT; i++) {
    const s = gateS + 240 + (finishS - gateS - 600) * (i + rnd() * 0.6) / nT;
    const c = addCar(T[i % T.length], Math.round(s / track.ds), track.width * 0.22, 'traffic'); c.v = T[i % T.length].vmax * 0.6; c.released = true;
  }
  group = cars.filter(c => c.role !== 'traffic');
  LINE = lineFor(track, PATH, spec); lineMesh.paint(LINE.phase);
  S.timeScale = 1;
  S.t = 0; S.lastRelease = -1.2; S.barrier = 0; S.barrierTarget = 0; S.raceStart = 0; S.raceT = 0; S.finished = []; S.resultShown = false; S.cornerName = ''; S.cornerT = 0; S.hint = 0;
  camInit = false;
}
let seed = (Date.now() % 100000) + 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- the car picker ----------
const maxOf = k => Math.max(...SPECS.map(s => s[k]));
function picker() {
  $('cars').innerHTML = SPECS.map(s => `<button class="carpick" data-id="${s.id}" aria-pressed="${s.id === choice}">
    <span class="sw" style="background:${s.body.color}"></span><b>${s.name}</b><p>${s.note}</p>
    <span class="bars"><span>Top speed</span><i style="--w:${(s.vmax / maxOf('vmax') * 100).toFixed(0)}%"></i><span>Acceleration</span><i style="--w:${(s.accel / maxOf('accel') * 100).toFixed(0)}%"></i><span>Grip</span><i style="--w:${(s.grip / maxOf('grip') * 100).toFixed(0)}%"></i><span>Drift</span><i style="--w:${(s.drift / maxOf('drift') * 100).toFixed(0)}%"></i></span>
    ${store.get(bestKey(s.id), 0) ? `<p>Your best on ${MODE_NAME[mode]}: ${fmt(store.get(bestKey(s.id), 0))}</p>` : ''}</button>`).join('');
  $('cars').querySelectorAll('.carpick').forEach(b => b.onclick = () => { choice = b.dataset.id; store.set('car', choice); picker(); setup(); });
}
setMode(mode); picker(); setup();
// on a phone the page scrolls; put the whole stage on screen when the driving starts
const onStage = () => { if (innerWidth < 900 || touch) $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
const toRace = () => { $('result').hidden = true; $('pick').hidden = true; setup(); S.mode = 'queue'; S.t = 0; S.lastRelease = -1.2; hudFor('race'); sound.start(); cv.focus?.(); onStage(); };
const toPick = () => { $('result').hidden = true; setup(); S.mode = 'pick'; $('pick').hidden = false; hudFor('pick'); picker(); };
$('go').onclick = toRace;
$('watch').onclick = () => { $('result').hidden = true; startPro(); onStage(); };
$('resume').onclick = () => pause(false);
$('restart').onclick = () => { pause(false); if (S.mode === 'pro' || S.mode === 'proDone') toPick(); else toRace(); };
$('proStop').onclick = () => { pause(false); toPick(); };
// which HUD shows: none on the picker; the race HUD; the pro lap's (no position or gaps, a title bar instead)
function hudFor(m) { $('hud').hidden = m === 'pick'; $('touch').hidden = !touch || m === 'pick'; $('hud').classList.toggle('pro', m === 'pro'); $('stage').classList.toggle('pro', m === 'pro'); $('inset').classList.toggle('on', m !== 'pick'); }

// ---------- input: keyboard, gamepad, touch ----------
const keys = new Set();
const ctl = { left: 0, right: 0, gas: 0, brake: 0, drift: 0 };
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k) && S.mode !== 'pick') e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if (k === 'escape' && (S.mode === 'pro' || S.mode === 'proDone')) { pause(false); toPick(); return; }
  if (k === 'escape' || k === 'p') { if (S.mode === 'queue' || S.mode === 'race' || S.mode === 'pro') pause(!S.paused); }
  if (k === 'l') setLine(!lineOn());
  if (k === 'm') toggleSound();
  if (k === 'c') nextCamera();
  if (k === 'e' && player && S.mode === 'race') honk();
  if (k === 'g') setGasMode(!autoGas);
  if (k === 'f') full();
  if (k === 'r' && player && S.mode === 'race') rescue();
  if (k === 'x' && player && S.mode === 'race') S.drsReq = true;
  if ((k === ' ' || k === 'enter') && S.mode === 'queue') ticket();
  if (k === 'enter' && S.mode === 'pick') $('go').click();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && (S.mode === 'race' || S.mode === 'queue')) pause(true); });
const touch = matchMedia('(pointer: coarse)').matches;
// the touch buttons show while you drive (or watch the pro, which keeps only the camera and line buttons)
$('touch').querySelectorAll('[data-k]').forEach(b => {
  const on = v => { ctl[b.dataset.k] = v; b.classList.toggle('on', !!v); if (v && b.dataset.k !== 'drift' && S.mode === 'queue' && b.dataset.k === 'gas') ticket(); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); on(1); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => on(0));
});
cv.addEventListener('pointerdown', () => { if (S.mode === 'queue') ticket(); });
// the small buttons on a touch screen for what the keyboard does with C, L, E and R
$('touch').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  const a = b.dataset.act;
  if (a === 'cam') nextCamera(); if (a === 'line') setLine(!lineOn()); if (a === 'horn' && S.mode === 'race') honk(); if (a === 'reset' && S.mode === 'race') rescue(); if (a === 'drs' && S.mode === 'race') S.drsReq = true;
}));
// C: behind, high, on the bonnet; on the pro lap, the director's cut, behind, on the bonnet
const PRO_CAMS = ['The director', 'Behind', 'On the bonnet'];
function nextCamera() {
  if (S.mode === 'pro' || S.mode === 'proDone') { S.proCam = ((S.proCam || 0) + 1) % 3; toast(PRO_CAMS[S.proCam]); D.shot = null; }
  else { S.camMode = (S.camMode + 1) % 3; toast(['Behind', 'High', 'On the bonnet'][S.camMode]); }
}
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1300); }
// The layout: right hand on the arrows (up for gas, left and right to steer, down to brake and reverse), left thumb on
// Space for the brake, left little finger on Shift for the drift. WASD works too, for the other way round.
// Keys and touch buttons are all or nothing; the wheel and the brake pedal are not. Steering eases toward the key you
// hold, in about a sixth of a second, and back to straight a little quicker, so a tap is a small correction and a hold
// is full lock. The brake comes on over a tenth of a second, so a tap of Space is a dab and a hold is everything.
// With the gas always on (G, or the switch by the cars), the car drives itself forward unless you brake.
const wheel = { v: 0, brake: 0 };
let autoGas = store.get('autoGas', false);
function readInput(dt) {
  const k = n => keys.has(n);
  const want = (k('arrowright') || k('d') ? 1 : 0) - (k('arrowleft') || k('a') ? 1 : 0) + ctl.right - ctl.left;
  const rate = want === 0 ? 8 : Math.sign(want) !== Math.sign(wheel.v) && wheel.v ? 10 : 6;
  wheel.v += Math.max(-rate * dt, Math.min(rate * dt, want - wheel.v));
  let steer = wheel.v;
  // Space only brakes: at a standstill it holds the car rather than backing it up, which is Down's job
  const reverse = k('arrowdown') || k('s') || ctl.brake ? 1 : 0, space = k(' ') && (!player || player.v > 0.5) ? 1 : 0;
  const pedal = Math.max(reverse, space);
  wheel.brake = pedal ? Math.min(1, wheel.brake + dt * 10) : 0;
  let brake = reverse && player && player.v <= 0.5 ? 1 : wheel.brake;
  let gas = k('arrowup') || k('w') || ctl.gas || (autoGas && !pedal && S.mode === 'race') ? 1 : 0;
  let drift = k('shift') || !!ctl.drift;
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer += Math.sign(ax) * (Math.abs(ax) - 0.12) / 0.88;
    const b = i => gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0;
    gas = Math.max(gas, b(7), b(0)); brake = Math.max(brake, b(6), b(2)); if (b(5) || b(4) || b(1)) drift = true;
    if (S.mode === 'queue' && (b(0) || b(7)) && !S.padTicket) { S.padTicket = true; ticket(); } else if (!b(0) && !b(7)) S.padTicket = false;
    if (b(3)) S.drsReq = true;
    if (b(9) && !S.padPause) { S.padPause = true; if (S.mode === 'race' || S.mode === 'queue') pause(!S.paused); } else if (!b(9)) S.padPause = false;
  }
  return { steer: Math.max(-1, Math.min(1, steer)), gas, brake, drift };
}
// the best line on the road, and the coach saying what your feet should do; one switch for racing, kept in the
// browser. The pro lap shows it unless you turn it off there.
let showLine = store.get('line', false);
function setLine(v) {
  if (S.mode === 'pro' || S.mode === 'proDone') S.proLine = v; else { showLine = v; store.set('line', v); }
  const b = $('lineMode'); b.setAttribute('aria-pressed', String(showLine)); b.textContent = showLine ? 'Best line: on' : 'Best line: off';
  const t = $('touchLine'); if (t) t.classList.toggle('on', lineOn());
}
const lineOn = () => (S.mode === 'pro' || S.mode === 'proDone') ? S.proLine !== false : showLine && S.mode !== 'pick';
function setGasMode(v) { autoGas = v; store.set('autoGas', v); const b = $('gasMode'); if (b) { b.setAttribute('aria-pressed', String(v)); b.textContent = v ? 'Gas: always on' : 'Gas: hold Up'; } }
// the horn: slow traffic within a stone's throw ahead pulls over to the right and lets you by
function honk() {
  sound.horn();
  for (const c of cars) if (c.traffic && !c.hidden && c.s > player.s && c.s - player.s < 90) c.yieldT = 3;
  S.honkT = 0.6;
}
function pause(v) { S.paused = v; $('paused').hidden = !v; if (v) sound.quiet(); }
function rescue() {
  const p = pointAt(track, player.k, Math.max(-3, Math.min(3, player.lat)));
  Object.assign(player, { x: p.x, z: p.z, y: p.y + 0.5, vy: 0, h: p.h, v: Math.min(player.v, 12), air: true, drift: null });
}

// the switches on the picker, once their settings exist
setGasMode(autoGas); setLine(showLine);
$('gasMode').onclick = () => setGasMode(!autoGas);
$('lineMode').onclick = () => setLine(!showLine);

// ---------- the gate ----------
function ticket() {
  if (S.mode !== 'queue' || player.released) return;
  if (S.queue[0] !== player || player.s < gateS - 4 - player.spec.body.len / 2 - 2) { S.hint = 1.6; return; }
  release(player);
}
function release(c) {
  c.released = true; c.releasedAt = S.t; S.lastRelease = S.t; S.barrierTarget = 1; S.queue.shift();
  if (c === player) { S.mode = 'race'; S.raceStart = S.t; sound.beep(); }
}
function queueStep(dt) {
  // the barrier goes up for one car, then down behind it
  const front = S.queue[0];
  if (S.barrierTarget === 1 && S.t - S.lastRelease > 1.6) S.barrierTarget = 0;
  if (front && front !== player && S.barrier < 0.05 && S.t - S.lastRelease > RV.release && front.s > gateS - 3 - front.spec.body.len / 2 - 1.5) release(front);
  S.barrier += (S.barrierTarget - S.barrier) * Math.min(1, dt * 5);
  gate.pivot.rotation.x = S.barrier * 1.35;
  gate.lamp.material.color.setHex(S.barrier > 0.5 ? 0x22ff66 : 0xff2a2a);
  // cars still in the queue creep up and stop behind the one ahead, or at the arm
  S.queue.forEach((c, i) => {
    if (c === player) return;
    const ahead = i ? S.queue[i - 1] : null;
    const stopAt = ahead ? ahead.s - ahead.spec.body.len / 2 - 2.2 - c.spec.body.len / 2 : gateS - 2.5 - c.spec.body.len / 2;
    const want = Math.max(0, Math.min(7, (stopAt - c.s) * 0.9));
    const p = pointAt(track, c.k + 6, 0);
    let ang = Math.atan2(p.z - c.z, p.x - c.x) - c.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    c.input = { steer: Math.max(-1, Math.min(1, ang * 2)), gas: c.v < want - 0.3 ? 0.6 : 0, brake: c.v > want + 0.2 ? 1 : 0, drift: false };
  });
}

// ---------- the loop ----------
let last = performance.now();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.paused) { renderer.render(scene, camera); return; }
  // slow motion on the pro lap: the car in the air off a crest, and the run under the gantry
  const slow = S.mode === 'pro' && player.air && player.airT > 0.12 ? 0.3 : S.mode === 'proDone' && S.t - S.doneAt < 2 ? 0.45 : 1;
  S.timeScale += (slow - S.timeScale) * Math.min(1, dt * (slow < S.timeScale ? 10 : 3));
  dt *= S.timeScale;
  const steps = Math.ceil(dt / (1 / 120)); const h = dt / steps;
  for (let i = 0; i < steps; i++) tick(h);
  draw(dt);
}
function tick(dt) {
  S.t += dt;
  if (S.mode === 'pro' || S.mode === 'proDone') { proTick(dt); return; }
  if (S.mode === 'queue' || S.mode === 'race' || S.mode === 'done') {
    queueStep(dt);
    // you
    const inp = readInput(dt);
    if (S.mode === 'done') { inp.gas = 0; inp.brake = 0.4; inp.drift = false; inp.steer = Math.max(-1, Math.min(1, -player.lat * 0.1)); }
    player.input = inp;
    if (S.autopilot && player.released && S.mode === 'race') driveAI(player, dt, track, cars, { paceScale: 1.05 });
    else S.aid = player.released && S.mode === 'race' && mode !== 'expert' ? assist(player, track, MODES[mode]) : 0;
    if (!player.released) { player.input.drift = false; }
    // DRS: a tap of X (or Y on a pad, DRS on a phone) opens the flap if the straight allows; it shuts itself
    if (player.released && S.mode === 'race') drs(player, track, S.drsReq);
    S.drsReq = false;
    // everyone else
    for (const c of cars) {
      if (c === player || c.hidden || !c.released) continue;
      let paceScale = 1;
      if (c.role !== 'traffic' && S.mode !== 'pick') {
        // a light rubber band, as in kart games: the pack never runs away from you or falls hopelessly behind
        const gap = c.s - player.s;
        const RB = RV.rubber; paceScale = gap > RB.ahead ? RB.slow : gap < -RB.behind ? RB.fast : 1;
      }
      driveAI(c, dt, track, cars, { paceScale });
    }
    for (const c of cars) {
      if (c.hidden) continue;
      if (S.mode === 'pick' && c === player) continue;
      step(c, dt, track, R, cars);
      if (c === player) gearbox(c, dt);
      // the arm, and the start of the road behind the queue
      if (!c.released) {
        const lim = gateS - 2.4 - c.spec.body.len / 2;
        if (c.s > lim) { const back = c.s - lim; c.x -= Math.cos(track.h[c.k]) * back; c.z -= Math.sin(track.h[c.k]) * back; c.s = lim; c.v = Math.min(c.v, 0); }
        if (c.s < 3) { c.x += Math.cos(track.h[0]) * (3 - c.s); c.z += Math.sin(track.h[0]) * (3 - c.s); c.v = Math.max(0, c.v); }
      }
      if (c.k >= track.n - 3) { c.hidden = true; }
      if (!c.done && c.s >= finishS && c.released && c.role !== 'traffic') { c.done = true; c.time = S.t - (c.releasedAt ?? 0); S.finished.push(c); }
    }
    collide(cars.filter(c => !c.hidden && Math.abs(c.s - player.s) < 400 || !c.released));
    if (S.mode === 'race') S.raceT = S.t - S.raceStart;
    if (player.done && S.mode === 'race') { S.mode = 'done'; S.doneAt = S.t; sound.finish(); }
    if (S.mode === 'done' && !S.resultShown && S.t - S.doneAt > 1.6) result();
  }
}

// ---------- the pro lap ----------
// Your car alone on the lap, driven by the pro on the best line at the best speeds, from the barrier to the gantry,
// filmed by a director cutting between cameras (see `director` below), in slow motion off the jumps.
function startPro() {
  clearCars();
  const spec = SPECS.find(s => s.id === choice);
  player = addCar(spec, track.gateAt - Math.round((3 + spec.body.len / 2) / track.ds), 0, 'player');
  player.released = true; group = [player];
  LINE = lineFor(track, PATH, spec); lineMesh.paint(LINE.phase);
  Object.assign(S, { mode: 'pro', t: 0, raceT: 0, resultShown: false, cornerName: '', cornerT: 0, barrier: 0, barrierTarget: 1, lastRelease: 0, proStart: 1.2, proLine: true, proCam: 0, timeScale: 1, doneAt: 0 });
  D.shot = null; camInit = false;
  $('pick').hidden = true; $('result').hidden = true; hudFor('pro'); setLine(true);
  $('protag').innerHTML = `<b>The pro</b> in the ${pretty(spec.name)}`;
  sound.start(); sound.beep();
}
function proTick(dt) {
  S.barrier += (S.barrierTarget - S.barrier) * Math.min(1, dt * 5);
  gate.pivot.rotation.x = S.barrier * 1.35; gate.lamp.material.color.setHex(S.barrier > 0.5 ? 0x22ff66 : 0xff2a2a);
  if (S.mode === 'pro' && S.t > S.proStart) drivePro(player, dt, track, LINE);
  else if (S.mode === 'pro') player.input = { steer: 0, gas: 0, brake: 0, drift: false };   // waiting for the barrier; no brake, which at a standstill is reverse
  else player.input = { steer: Math.max(-1, Math.min(1, -player.lat * 0.1)), gas: 0, brake: player.v > 1 ? 0.8 : 0, drift: false };
  step(player, dt, track, R, []); gearbox(player, dt);
  if (player.k >= track.n - 6) player.v = Math.min(player.v, 2);   // pull up before the end of the road
  if (S.mode === 'pro') S.raceT = Math.max(0, S.t - S.proStart);
  if (S.mode === 'pro' && player.s >= finishS) {
    player.done = true; player.time = S.raceT; S.mode = 'proDone'; S.doneAt = S.t; sound.finish();
    store.set('lap2.pro.' + choice, player.time);
  }
  if (S.mode === 'proDone' && !S.resultShown && S.t - S.doneAt > 2.4) proResult();
}
function proResult() {
  S.resultShown = true;
  const p = player, mine = store.get(bestKey(choice), 0);
  $('resTitle').textContent = 'The pro, bridge to gantry';
  $('resTime').innerHTML = `${fmt(p.time)}<small>in the ${p.spec.name}, on the best line all the way.${mine ? ` Your best in it on ${MODE_NAME[mode]} is ${fmt(mine)}, ${(mine - p.time).toFixed(1)} s off.` : ''} Turn on the best line to follow it: green is gas, yellow coast, orange brake, red brake hard.</small>`;
  $('resOrder').innerHTML = '';
  resultButtons([['Drive it yourself', () => { toRace(); setLine(true); }, true], ['Watch again', () => startPro()], ['Change car', toPick]]);
  $('result').hidden = false; $('touch').hidden = true;
}
function resultButtons(list) {
  const row = $('resRow'); row.innerHTML = '';
  for (const [label, fn, primary] of list) { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.onclick = fn; row.append(b); }
}

// ---------- drawing ----------
const up = new THREE.Vector3(0, 1, 0);
const TAIL_OFF = new THREE.Color(0xa3101c).convertSRGBToLinear(), TAIL_ON = new THREE.Color(4, 0.25, 0.25);
function draw(dt) {
  // cars to their meshes
  for (const [c, m] of meshes) {
    m.visible = !c.hidden;
    if (c.hidden) continue;
    m.position.set(c.x, c.y, c.z);
    m.rotation.set(c.roll, -c.h - (c === player || c.drift ? c.slide : 0), c.pitch);
    // squash and stretch, the cartoon way: squash on a hard landing, stretch out under a turbo
    const sq = Math.min(0.22, (c.landed || 0) * 0.3), st = c.boost > 0 ? 0.07 : 0;
    m.scale.set(1 + sq * 0.6 + st, 1 - sq - st * 0.5, 1 + sq * 0.6);
    // brake lights
    if (m.tail) { const on = c.input.brake > 0 && c.v > 0.5; if (m.tail.on !== on) { m.tail.on = on; m.tail.color.copy(on ? TAIL_ON : TAIL_OFF); } }
    if (m.label) { const d = Math.hypot(c.x - player.x, c.z - player.z); m.label.visible = S.mode !== 'pick' && d < 70 && d > 9; }
  }
  for (const [c, m] of meshes) if (!c.hidden) for (const w of m.wheels) w.rotation.z -= c.v * dt / 0.33;
  // the DRS flap swings flat when it opens
  for (const [c, m] of meshes) if (m.flap && !c.hidden) { const want = c.drs ? 0.45 : 0; m.flap.rotation.z += (want - m.flap.rotation.z) * Math.min(1, dt * 12); }
  const pm = meshes.get(player);
  // the camera sits inside your car's ink outline on the bonnet, so hide it there (the director sets its own)
  if (pm.ink) pm.ink.visible = S.mode === 'pick' || ((S.mode === 'pro' || S.mode === 'proDone') ? S.proCam !== 2 : S.camMode !== 2);
  if (pm.flame) { pm.flame.visible = player.boost > 0; pm.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1); }
  // effects behind your car
  if (S.mode !== 'pick') {
    const bx = player.x - Math.cos(player.h) * player.spec.body.len * 0.45, bz = player.z - Math.sin(player.h) * player.spec.body.len * 0.45;
    if (player.drift && !player.air) {
      const t = player.drift.t, B = RV.boost;
      const col = t > B.t2 ? [1, 0.55, 0.12] : t > B.t1 ? [0.3, 0.72, 1] : [0.85, 0.85, 0.85];
      for (const s of [-1, 1]) {
        const ox = -Math.sin(player.h) * s * 0.8, oz = Math.cos(player.h) * s * 0.8;
        emit(bx + ox, player.y + 0.15, bz + oz, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, col, 0.35);
        if (Math.random() < 0.5) emit(bx + ox, player.y + 0.3, bz + oz, (Math.random() - 0.5), 0.8, (Math.random() - 0.5), [1, 0.97, 0.9], 0.9);
      }
    }
    if (player.grass && player.v > 5) emit(bx, player.y + 0.2, bz, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, [0.45, 0.38, 0.25], 0.7);
    if (player.scrape > 0 && player.v > 5) for (let i = 0; i < 3; i++) emit(player.x, player.y + 0.5, player.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, [1, 0.85, 0.4], 0.3);
  }
  particles(dt);
  camera3(dt);
  hud(dt);
  // where the ears are: the camera, so a trackside camera hears the car come and go
  const ed = camera.position.distanceTo(new THREE.Vector3(player.x, player.y + 0.6, player.z));
  sound.hear(ed, dt > 0 && S.earD != null && Math.abs(S.earD - ed) < 4 ? (S.earD - ed) / dt : 0); S.earD = ed;   // a cut is a jump, not a closing speed
  sound.update(player, S.mode, dt);
  renderer.render(scene, camera);
}

function camera3(dt) {
  const c = player, f = new THREE.Vector3(Math.cos(c.h), 0, Math.sin(c.h));
  let want, look;
  const pro = S.mode === 'pro' || S.mode === 'proDone';
  if (pro && !S.proCam) { director(dt); return; }
  const camMode = pro ? [0, 0, 2][S.proCam] : S.camMode;
  if (S.mode === 'pick') {
    const a = S.t * 0.25;
    want = new THREE.Vector3(c.x + Math.cos(a) * 7.5, c.y + 3.4, c.z + Math.sin(a) * 7.5);
    look = new THREE.Vector3(c.x, c.y + 0.8, c.z);
    camPos.copy(want); camLook.copy(look); camInit = true;
  } else {
    // behind, high, and on the bonnet: just behind the windscreen, low enough to see the nose ahead of you
    const b = c.spec.body, onboard = camMode === 2;
    const dist = [7.2, 13, -b.len * (camera.aspect < 1 ? 0.3 : 0.14)][camMode], ht = [2.8, 5, b.hgt * 0.95][camMode];
    // Q looks back over your shoulder: the camera turns round, in front of the car
    const back = keys.has('q') && S.mode === 'race' ? -1 : 1;
    want = new THREE.Vector3(c.x, c.y + ht, c.z).addScaledVector(f, -dist * back + (back < 0 ? b.len * 0.2 : 0));
    look = new THREE.Vector3(c.x, c.y + (onboard ? b.hgt * 0.62 : 1.2), c.z).addScaledVector(f, (onboard ? 24 : 7) * back);
    const near = onboard ? 0.08 : 0.3; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
    const k = camMode === 2 || back < 0 || S.wasBack ? 1 : 1 - Math.exp(-dt * 7); S.wasBack = back < 0;
    camPos.lerp(want, k); camLook.lerp(look, camMode === 2 ? 1 : 1 - Math.exp(-dt * 12));
    // keep the camera above the ground it is over
    const g = track.y[Math.max(0, c.k - 4)] + 1.0;
    if (camPos.y < g && camMode !== 2) camPos.y = g;
  }
  camera.position.copy(camPos); camera.lookAt(camLook);
  sky.position.copy(camPos);
  const shake = camMode === 2 ? 0.35 : 1;
  if (c.landed > 0.2) camera.position.y += (Math.random() - 0.5) * c.landed * 0.25 * shake;
  if (c.bump > 0.2) camera.position.x += (Math.random() - 0.5) * c.bump * 0.3 * shake;
  // on the bonnet you feel the road: a little shudder that grows with speed, more on the grass
  if (camMode === 2 && !c.air) camera.position.y += (Math.random() - 0.5) * Math.min(0.03, Math.abs(c.v) * 0.0006) * (c.grass ? 4 : 1);
  const fov = 66 + Math.min(14, Math.max(0, c.v - 20) * 0.2) + (c.boost > 0 ? 6 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  sun.position.set(c.x + 60, c.y + 120, c.z + 40); sun.target.position.set(c.x, c.y, c.z);
}

// ---------- the director: how the pro lap is filmed ----------
// Cuts between shots the way a TV director covers a race. Before a tight corner: a camera on the outside of the
// apex, fixed, turning to follow the car and zooming to keep it the same size, with a whoosh as it passes. On a long
// straight: the helicopter, or a camera tracking in front of the car. Off a jump: a low camera to the side, the car
// flying past in slow motion. Otherwise: behind the car, low beside it, or on the bonnet. A shot lasts a few seconds.
const D = { shot: null, t: 0, len: 0, last: '', pos: new THREE.Vector3(), side: 1, sAt: 0, whoosh: false };
const V = () => new THREE.Vector3();
function cut(shot, len) { D.shot = shot; D.t0 = S.t; D.t = 0; D.len = len; D.last = shot; D.whoosh = false; camInit = false; }
// the next tight corner (a 3 or tighter) within reach, skipping the gentle ones on the way
function tightAhead(k, reach) {
  let at = k;
  for (let i = 0; i < 6; i++) { const nc = nextCorner(track, at, reach - (at - k) * track.ds); if (!nc) return null; if (nc.grade <= 3) return { ...nc, dist: (nc.at - k) * track.ds }; at = nc.at + Math.max(3, Math.round(nc.len / track.ds)); }
  return null;
}
function director(dt) {
  const c = player, f = new THREE.Vector3(Math.cos(c.h), 0, Math.sin(c.h)), r = new THREE.Vector3(-f.z, 0, f.x), car = new THREE.Vector3(c.x, c.y, c.z);
  D.t = S.t - D.t0;   // game time, so a shot in slow motion lasts longer on screen
  const tight = S.mode === 'pro' ? tightAhead(c.k, 200) : null;
  // a tight corner coming up is worth cutting to early, once a shot has had a couple of seconds
  const early = tight && tight.dist > 60 && tight.dist < 150 && D.t > 2 && !['trackside', 'jump', 'finish'].includes(D.shot) && D.last !== 'trackside';
  const done = !D.shot || early || (D.t > D.len && D.shot !== 'finish') || (D.shot === 'trackside' && c.s > D.sAt + 22) || (D.shot === 'jump' && !c.air && D.t > 1.6);
  if (S.mode === 'pro' && finishS - c.s < 140 && D.shot !== 'finish') {
    // the finish: a camera past the gantry, up high, that the car runs toward and under
    const at = Math.min(track.n - 1, finishK + 9), p = pointAt(track, at, 3.5);
    D.pos.set(p.x, p.y + 2.4, p.z); D.sAt = 1e9; cut('finish', 30);
  } else if (c.air && c.airT > 0.05 && D.shot !== 'jump' && S.mode === 'pro') {
    // off a crest: a camera low to the side, a little ahead, which the car flies past
    D.side = Math.random() < 0.5 ? -1 : 1; D.pos.copy(car).addScaledVector(r, D.side * 9).addScaledVector(f, Math.max(8, c.v * 0.5)); D.pos.y = c.ground + 0.9; cut('jump', 4);
  } else if (done) {
    const nc = tight, near = nextCorner(track, c.k, 190), straight = !near || (near.dist > 170 && near.grade >= 4);
    if (S.mode === 'proDone' && D.shot !== 'finish') cut('front', 9);
    else if (nc && nc.dist > 45 && D.last !== 'trackside') {
      // on the outside of the apex, a couple of metres behind the Armco, head height
      const at = Math.min(track.n - 1, nc.at + Math.round(nc.len / 2 / track.ds)), out = nc.dir === 'right' ? -1 : 1;
      const p = pointAt(track, at, out > 0 ? track.wallR[at] + 2.5 : -track.wallL[at] - 2.5);
      D.pos.set(p.x, p.y + 1.7, p.z); D.sAt = at * track.ds; cut('trackside', 11);
    } else {
      const pool = straight ? ['heli', 'front', 'low'] : ['chase', 'low', 'bonnet', 'front', 'heli'];
      const pick = pool.filter(x => x !== D.last)[Math.floor(Math.random() * (pool.length - 1))];
      D.side = Math.random() < 0.5 ? -1 : 1; cut(pick, 3.5 + Math.random() * 2.5);
    }
  }
  let want = V(), look = car.clone().add(V().set(0, 0.7, 0)), fov = 60, ease = 8;
  const sh = D.shot;
  if (sh === 'chase') { want.copy(car).addScaledVector(f, -6.2).addScaledVector(r, Math.sin(D.t * 0.5) * 1.6); want.y += 2; look.addScaledVector(f, 6); fov = 62 + Math.min(14, c.v * 0.18); }
  else if (sh === 'low') { want.copy(car).addScaledVector(r, D.side * 3.4).addScaledVector(f, 1.5 - D.t * 0.5); want.y = c.y + 0.55; look.addScaledVector(f, 3); fov = 56; ease = 14; }
  else if (sh === 'front') { want.copy(car).addScaledVector(f, 8.5).addScaledVector(r, D.side * 1.2); want.y += 1.3; fov = 50; ease = 10; }
  else if (sh === 'heli') { want.copy(car).addScaledVector(r, D.side * 24).addScaledVector(f, -8 + D.t * 2); want.y += 15; fov = 38; ease = 2.5; }
  else if (sh === 'bonnet') { want.copy(car).addScaledVector(f, c.spec.body.len * 0.14); want.y += c.spec.body.hgt * 0.95; look = car.clone().addScaledVector(f, 24); look.y += c.spec.body.hgt * 0.7; fov = 70 + Math.min(10, c.v * 0.12); ease = 60; }
  else {
    // fixed cameras: trackside and the jump; they turn to follow and zoom to hold the car's size in frame
    want.copy(D.pos); const d = Math.max(3, D.pos.distanceTo(car));
    fov = Math.max(10, Math.min(60, 2 * Math.atan((sh === 'jump' ? 4.5 : sh === 'finish' ? 11 : 3.6) / d) * 180 / Math.PI)); ease = 60;
    if (sh === 'trackside' && !D.whoosh && d < 16) { D.whoosh = true; sound.whoosh(); }
  }
  // the near plane: close on the bonnet, otherwise normal
  const near = sh === 'bonnet' ? 0.08 : 0.3; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  const pm = meshes.get(c); if (pm && pm.ink) pm.ink.visible = sh !== 'bonnet';
  if (!camInit) { camPos.copy(want); camLook.copy(look); camera.fov = fov; camInit = true; }
  const k = 1 - Math.exp(-dt * ease);
  camPos.lerp(want, k); camLook.lerp(look, Math.min(1, k * 1.5));
  // never under the ground
  const g = track.y[Math.max(0, c.k - 2)] + 0.35; if (camPos.y < g && sh !== 'jump') camPos.y = g;
  camera.position.copy(camPos); camera.lookAt(camLook); sky.position.copy(camPos);
  if (c.landed > 0.2) camera.position.y += (Math.random() - 0.5) * c.landed * 0.3;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * (sh === 'trackside' || sh === 'jump' || sh === 'finish' ? 20 : 4)); camera.updateProjectionMatrix();
  sun.position.set(c.x + 60, c.y + 120, c.z + 40); sun.target.position.set(c.x, c.y, c.z);
}

// ---------- HUD: the onboard telemetry strip ----------
// Drawn at twice the size it is shown, so the lines stay sharp on any screen.
const map = $('map'), mg = map.getContext('2d'), tach = $('tach'), tg = tach.getContext('2d'), prof = $('profile'), pg = prof.getContext('2d');
const ORANGE = '#f5a623';
let mapBase = null, profBase = null;
function drawMapBase() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < track.n; k++) { x0 = Math.min(x0, track.x[k]); x1 = Math.max(x1, track.x[k]); z0 = Math.min(z0, track.z[k]); z1 = Math.max(z1, track.z[k]); }
  const W = map.width, H = map.height, pad = 14, s = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (z1 - z0));
  const ox = (W - (x1 - x0) * s) / 2 - x0 * s, oz = (H - (z1 - z0) * s) / 2 - z0 * s;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [w, col] of [[10, '#1a0f07'], [5, ORANGE]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let k = 0; k < track.n; k += 4) g[k ? 'lineTo' : 'moveTo'](track.x[k] * s + ox, track.z[k] * s + oz); g.stroke(); }
  const dot = (k, col) => { g.fillStyle = col; g.beginPath(); g.arc(track.x[k] * s + ox, track.z[k] * s + oz, 6, 0, 7); g.fill(); };
  dot(track.gateAt, '#a8c043'); dot(finishK, '#f2b631');
  mapBase = { c, s, ox, oz };
}
// the height of the lap from the gate to the gantry, as a silhouette
function drawProfileBase() {
  const W = prof.width, H = prof.height, a = track.gateAt, b = finishK;
  let lo = Infinity, hi = -Infinity; for (let k = a; k <= b; k++) { lo = Math.min(lo, track.y[k]); hi = Math.max(hi, track.y[k]); }
  const X = k => (k - a) / (b - a) * W, Y = k => H - 6 - (track.y[k] - lo) / (hi - lo || 1) * (H - 14);
  const shape = (g, fill) => { g.beginPath(); g.moveTo(0, H); for (let k = a; k <= b; k += 3) g.lineTo(X(k), Y(k)); g.lineTo(W, H); g.closePath(); g.fillStyle = fill; g.fill(); };
  const mk = fill => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); shape(g, fill); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); for (let k = a; k <= b; k += 3) g[k === a ? 'moveTo' : 'lineTo'](X(k), Y(k)); g.stroke(); return c; };
  profBase = { dim: mk('rgba(255,241,207,0.14)'), lit: mk('rgba(236,111,43,0.75)'), X, Y };
}
// the revs, as on the Porsche broadcast: a row of bars rising from left to right, green, yellow toward the change,
// red past the redline; near the change they all flash, and on the limiter they blink red
function drawTach(rpm, gear, E) {
  const REDLINE = E.redline, shift = E.shift || REDLINE * 0.97, top = Math.ceil(REDLINE / 1000) * 1000, W = tach.width, H = tach.height, N = 36;
  const x0 = 10, x1 = W - 10, base = H - 40, flash = rpm > shift * 0.985 && gear > 0 && gear < E.vg.length && Math.floor(performance.now() / 70) % 2;
  tg.clearRect(0, 0, W, H);
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N, r = f * top, x = x0 + (x1 - x0) * i / N, w = (x1 - x0) / N - 3, h = 14 + (base - 14) * Math.pow(f, 1.2), on = r <= rpm;
    tg.fillStyle = !on ? 'rgba(255,241,207,0.12)' : flash ? '#2f9c9a' : r > REDLINE ? '#d8402b' : r > shift * 0.93 ? '#f2b631' : '#a8c043';
    tg.fillRect(x, base - h, w, h);
  }
  tg.font = '24px Righteous, Barlow, sans-serif'; tg.textAlign = 'center'; tg.textBaseline = 'top';
  for (let t = 0, T = top / 1000; t <= T; t++) { tg.fillStyle = t * 1000 > REDLINE ? '#ec6f2b' : '#fff1cf'; tg.fillText(t, x0 + (x1 - x0) * t / T, base + 8); }
}
// the rear wing in profile: the main plane, and the flap above it that tilts flat when DRS is open
const sil = $('sil'), sg = sil.getContext('2d');
function drawSil(open) {
  const W = sil.width, H = sil.height; sg.clearRect(0, 0, W, H);
  sg.lineJoin = 'round'; sg.lineCap = 'round'; sg.strokeStyle = '#2a1a0e'; sg.lineWidth = 4;
  // the tail of the car and the swan necks
  sg.fillStyle = '#c7cdd3'; sg.beginPath(); sg.moveTo(8, H - 6); sg.quadraticCurveTo(40, H - 40, 120, H - 34); sg.lineTo(232, H - 30); sg.lineTo(232, H - 6); sg.closePath(); sg.fill(); sg.stroke();
  sg.fillStyle = '#1a1a1a'; for (const x of [84, 118]) { sg.beginPath(); sg.moveTo(x, H - 36); sg.quadraticCurveTo(x + 18, H - 52, x + 8, 34); sg.lineTo(x + 18, 34); sg.quadraticCurveTo(x + 26, H - 52, x + 12, H - 36); sg.closePath(); sg.fill(); sg.stroke(); }
  // the main plane
  sg.beginPath(); sg.moveTo(40, 36); sg.quadraticCurveTo(110, 18, 180, 30); sg.lineTo(178, 40); sg.quadraticCurveTo(110, 32, 44, 46); sg.closePath(); sg.fill(); sg.stroke();
  // the flap, pivoting on its front edge: up and steep when shut, laid flat when open
  const a = -0.55 + 0.5 * open, px = 168, py = 26, len = 62;
  sg.save(); sg.translate(px, py); sg.rotate(Math.PI + a); sg.fillStyle = open > 0.5 ? '#8a9a2b' : '#1a1a1a';
  sg.beginPath(); sg.moveTo(0, -4); sg.quadraticCurveTo(len / 2, -10, len, -3); sg.lineTo(len, 4); sg.quadraticCurveTo(len / 2, 2, 0, 5); sg.closePath(); sg.fill(); sg.stroke(); sg.restore();
}
// the driver's hands on the wheel, a cartoon of the broadcast's cockpit camera: the wheel turns with your steering, the
// shift lights across its top fill with the revs, the gear shows in its middle, and a paddle flicks on each change
const ins = $('inset'), ig = ins.getContext('2d'), wheelI = { a: 0, up: 0, down: 0, ups: 0, downs: 0 };
function drawInset(p, gb, dt) {
  if (!ins.classList.contains('on') || ins.offsetParent === null) return;
  const W = ins.width, H = ins.height, E = p.engine, ink = '#2a1a0e';
  wheelI.a += (p.input.steer * 1.4 - wheelI.a) * Math.min(1, dt * 10);
  if (gb.ups !== wheelI.ups) { wheelI.ups = gb.ups; wheelI.up = 0.18; } if (gb.downs !== wheelI.downs) { wheelI.downs = gb.downs; wheelI.down = 0.18; }
  wheelI.up = Math.max(0, wheelI.up - dt); wheelI.down = Math.max(0, wheelI.down - dt);
  // the cabin: windscreen, dashboard, the roll cage's front hoop
  ig.fillStyle = '#7fd3cf'; ig.fillRect(0, 0, W, H);
  ig.fillStyle = '#8cc63f'; ig.beginPath(); ig.moveTo(0, 92); ig.lineTo(W, 84); ig.lineTo(W, H); ig.lineTo(0, H); ig.fill();
  ig.fillStyle = '#b9b2a6'; ig.beginPath(); ig.moveTo(W * 0.38, 86); ig.lineTo(W * 0.62, 86); ig.lineTo(W * 0.95, H); ig.lineTo(W * 0.05, H); ig.fill();
  ig.fillStyle = '#3b2414'; ig.beginPath(); ig.moveTo(0, 116); ig.quadraticCurveTo(W / 2, 92, W, 116); ig.lineTo(W, H); ig.lineTo(0, H); ig.fill();
  ig.strokeStyle = '#1a1a1a'; ig.lineWidth = 10; ig.beginPath(); ig.moveTo(18, H); ig.lineTo(46, 0); ig.moveTo(W - 18, H); ig.lineTo(W - 46, 0); ig.stroke();
  // the wheel
  const cx = W / 2, cy = 132, R = 70;
  ig.save(); ig.translate(cx, cy); ig.rotate(wheelI.a);
  ig.lineWidth = 4; ig.strokeStyle = ink;
  // paddles behind it: right is up, left is down
  for (const [s, on] of [[1, wheelI.up], [-1, wheelI.down]]) { ig.fillStyle = on > 0 ? '#f2b631' : '#c7cdd3'; ig.beginPath(); ig.ellipse(s * (R * 0.62 + (on > 0 ? 4 : 0)), -R * 0.32, 18, 28, s * 0.5, 0, 7); ig.fill(); ig.stroke(); }
  ig.fillStyle = '#1a1a1a'; ig.beginPath(); ig.arc(0, 0, R, 0, 7); ig.arc(0, 0, R - 18, 0, 7, true); ig.fill(); ig.stroke(); ig.beginPath(); ig.arc(0, 0, R - 18, 0, 7); ig.stroke();
  ig.fillStyle = '#ec6f2b'; ig.fillRect(-5, -R, 10, 18);
  ig.fillStyle = '#2b2b2b'; ig.beginPath(); ig.moveTo(-42, -34); ig.arcTo(58, -34, 58, 28, 16); ig.arcTo(58, 28, -58, 28, 16); ig.arcTo(-58, 28, -58, -34, 16); ig.arcTo(-58, -34, 58, -34, 16); ig.closePath(); ig.fill(); ig.stroke();
  // shift lights: ten across the top of the hub, green, yellow, red, then all blue at the change
  const shift = E.shift || E.redline * 0.97, f = Math.max(0, (gb.rpm - E.redline * 0.6) / (shift - E.redline * 0.6));
  for (let i = 0; i < 10; i++) { const lit = f * 10 > i, all = f >= 1; ig.fillStyle = !lit ? '#4a3a2a' : all ? '#2f9cff' : i < 4 ? '#8ccf3f' : i < 7 ? '#f6d23c' : '#d8402b'; ig.beginPath(); ig.arc(-45 + i * 10, -24, 4, 0, 7); ig.fill(); }
  ig.fillStyle = '#f2b631'; ig.font = '30px Righteous, Barlow, sans-serif'; ig.textAlign = 'center'; ig.textBaseline = 'middle';
  ig.fillText(gb.gear < 0 ? 'R' : gb.gear === 0 ? 'N' : gb.gear, 0, 4);
  // gloves at a quarter to three
  for (const s of [-1, 1]) { ig.fillStyle = '#d8402b'; ig.beginPath(); ig.ellipse(s * (R - 8), -8, 20, 26, s * -0.3, 0, 7); ig.fill(); ig.stroke(); ig.fillStyle = '#fff1cf'; ig.beginPath(); ig.ellipse(s * (R - 2), 14, 14, 7, 0, 0, 7); ig.fill(); ig.stroke(); }
  ig.restore();
}
drawMapBase(); drawProfileBase();
const fmt2 = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
const dial = { rpm: 900, gas: 0, brake: 0, flap: 0 };
let lastHud = 0;
function hud(dt) {
  if (S.mode === 'pick') return;
  const p = player;
  // position: finishers in the order they reached the gantry, then everyone else by how far round they are
  const order = group.slice().sort((a, b) => (a.done && b.done) ? a.time - b.time : a.done ? -1 : b.done ? 1 : b.s - a.s);
  const pos = order.indexOf(p) + 1;
  S.order = order;
  // the dials ease toward the gearbox and the pedals, every frame
  const gb = p.gb || gearbox(p, 0), e = Math.min(1, dt * 10);
  dial.rpm += (gb.rpm - dial.rpm) * Math.min(1, dt * 30);
  dial.gas += ((p.input.gas || p.boost > 0 ? 1 : 0) - dial.gas) * e; dial.brake += (p.input.brake - dial.brake) * e;
  $('thr').style.height = (dial.gas * 100).toFixed(0) + '%'; $('brk').style.height = (dial.brake * 100).toFixed(0) + '%';
  drawTach(dial.rpm, gb.gear, p.engine);
  // DRS: the wing in profile and the chip, for a car that has it
  const hasDrs = !!p.spec.drs;
  if (hasDrs !== S.hasDrs) { S.hasDrs = hasDrs; $('drsbox').hidden = !hasDrs; $('tele').classList.toggle('has-drs', hasDrs); const td = $('touchDrs'); if (td) td.hidden = !hasDrs; }
  if (hasDrs) {
    const st = p.drs ? 'open' : track.drsZone[p.k] && !p.air && S.mode !== 'queue' ? 'ready' : '';
    if (st !== S.drsShown) { S.drsShown = st; const el = $('drs'); el.className = 'drs ' + st; el.textContent = touch ? 'DRS' : st === 'open' ? 'DRS open' : st === 'ready' ? 'DRS · X' : 'DRS'; if (st === 'open') sound.drs(); }
    dial.flap += ((p.drs ? 1 : 0) - dial.flap) * Math.min(1, dt * 12); drawSil(dial.flap);
  }
  drawInset(p, gb, dt);
  $('time').textContent = fmt2(S.mode === 'queue' ? 0 : player.done ? player.time : S.raceT);
  if (performance.now() - lastHud > 90) {
    lastHud = performance.now();
    $('posN').textContent = ord(pos); $('posOf').textContent = '/' + group.length;
    const best = store.get(bestKey(choice), 0); $('best').textContent = best ? `Best ${fmt(best)} in the ${p.spec.name}, ${MODE_NAME[mode]}` : '';
    $('kmh').textContent = Math.round(Math.abs(p.v) * 3.6);
    $('gear').textContent = gb.gear < 0 ? 'R' : gb.gear === 0 ? 'N' : gb.gear;
    $('flags').textContent = [p.boost > 0 && 'Turbo', p.drift && 'Drift', p.slipT > RV.slip.build && 'Tow', S.mode === 'race' && S.aid > 0.25 && 'Help', p.air && 'Air', p.grass && 'Grass'].filter(Boolean).join('  ·  ');
    // the gaps: the car ahead and the car behind, in seconds at your speed
    if (S.mode === 'race') {
      const row = (c, cls) => `<div class="${cls}"><span>${c === p ? `${ord(order.indexOf(c) + 1)}  You` : `${ord(order.indexOf(c) + 1)}  ${pretty(c.spec.name)}`}</span><span>${c === p ? '' : (c.s > p.s ? '+' : '-') + (Math.abs(c.s - p.s) / Math.max(12, Math.abs(p.v))).toFixed(1) + ' s'}</span></div>`;
      const i = order.indexOf(p), ahead = order[i - 1], behind = order[i + 1];
      $('gaps').innerHTML = (ahead && !ahead.done ? row(ahead, '') : '') + row(p, 'me') + (behind ? row(behind, '') : '');
    } else $('gaps').innerHTML = '';
  }
  const ch = $('charge'), B = RV.boost;
  if (p.boost > 0) { ch.className = 'boost'; ch.style.width = Math.min(100, p.boost / B.b2 * 100) + '%'; }
  else if (p.drift) { ch.className = p.drift.t > B.t2 ? 't2' : ''; ch.style.width = Math.min(100, p.drift.t / B.t2 * 100) + '%'; }
  else ch.style.width = '0';
  $('vignette').classList.toggle('boost', p.boost > 0);
  $('zoom').classList.toggle('on', p.boost > 0 && S.mode === 'race');
  // corner names as you reach them
  const name = cornerAt(track, p.k + 14);
  if (name !== S.cornerName && (S.mode === 'race' || S.mode === 'pro')) { S.cornerName = name; S.cornerT = 2.4; $('corner').textContent = corner(name); }
  S.cornerT -= dt; $('corner').classList.toggle('on', S.cornerT > 0);
  // pace notes: the next corner, how tight, how far, and BRAKE when you are too quick to make it
  paceNotes(p);
  coach(p);
  // prompts
  const pr = $('prompt');
  let msg = '';
  if (S.mode === 'queue') {
    const ahead = S.queue.indexOf(player);
    if (ahead > 0) msg = `${ahead} ${ahead === 1 ? 'car' : 'cars'} ahead of you<small>Creep up with the gas. Rev it if you like.</small>`;
    else msg = player.s > gateS - 6 - player.spec.body.len / 2 ? `Tap your ticket<small>Space, Enter, a tap or the A button lifts the barrier</small>` : 'Pull up to the barrier';
    if (S.hint > 0) { S.hint -= dt; if (ahead > 0) msg = `Wait your turn<small>${ahead} ${ahead === 1 ? 'car' : 'cars'} still ahead of you at the barrier</small>`; }
  } else if (S.mode === 'race' && S.raceT < 2.5) msg = 'Go';
  pr.innerHTML = msg; pr.hidden = !msg; pr.classList.toggle('big', msg === 'Go');
  // the map: you in red, the race in white, the traffic in grey
  mg.clearRect(0, 0, map.width, map.height); mg.drawImage(mapBase.c, 0, 0);
  const at = (c, r, fill, ring) => { mg.fillStyle = fill; mg.beginPath(); mg.arc(c.x * mapBase.s + mapBase.ox, c.z * mapBase.s + mapBase.oz, r, 0, 7); mg.fill(); if (ring) { mg.strokeStyle = ring; mg.lineWidth = 3; mg.stroke(); } };
  for (const c of cars) if (!c.hidden && c !== p) at(c, c.role === 'traffic' ? 3 : 5, c.role === 'traffic' ? 'rgba(255,241,207,0.45)' : '#fff1cf');
  at(p, 8, '#d8402b', '#fff1cf');
  // the height of the lap, lit as far as you have come
  const W = prof.width, H = prof.height, frac = Math.max(0, Math.min(1, (p.k - track.gateAt) / (finishK - track.gateAt)));
  pg.clearRect(0, 0, W, H); pg.drawImage(profBase.dim, 0, 0);
  if (frac > 0) pg.drawImage(profBase.lit, 0, 0, W * frac, H, 0, 0, W * frac, H);
  for (const c of group) if (!c.hidden && c !== p && c.k > track.gateAt) { const x = profBase.X(Math.min(finishK, c.k)); pg.fillStyle = '#fff'; pg.fillRect(x - 1.5, profBase.Y(Math.min(finishK, c.k)) - 9, 3, 7); }
  if (p.k >= track.gateAt) { const k = Math.min(finishK, p.k), x = profBase.X(k), y = profBase.Y(k); pg.fillStyle = '#ff2d2d'; pg.strokeStyle = '#fff'; pg.lineWidth = 2; pg.beginPath(); pg.arc(x, y, 6, 0, 7); pg.fill(); pg.stroke(); }
}

const nc = $('noteArrow').getContext('2d');
let lastNote = '';
function paceNotes(p) {
  const note = S.mode === 'race' || S.mode === 'pro' ? nextCorner(track, p.k, Math.max(140, p.v * 4.5)) : null;
  $('note').classList.toggle('on', !!note);
  const vt = cornerSpeed(p, track, 1.0), late = S.mode === 'race' && !p.air && p.v > vt + 2.5;
  $('brakecue').classList.toggle('on', late);
  if (!note) { lastNote = ''; return; }
  $('noteDist').textContent = note.dist < 12 ? 'now' : Math.round(note.dist / 10) * 10 + ' m';
  const key = note.dir + note.grade + note.tightens;
  if (key === lastNote) return; lastNote = key;
  $('noteTxt').textContent = `${note.dir === 'left' ? 'Left' : 'Right'} ${note.grade}${note.tightens ? ', tightens' : ''}`;
  // the arrow: the tighter the corner, the more it curls
  const W = 120, sweep = [0, 2.9, 2.3, 1.8, 1.35, 0.95, 0.6][note.grade], r = 30, s = note.dir === 'left' ? -1 : 1;
  nc.clearRect(0, 0, W, W); nc.save(); nc.translate(W / 2 - s * r * 0.6, 92); nc.scale(s, 1);
  const a0 = Math.PI, a1 = Math.PI + sweep, ex = r * Math.cos(a1) + r, ey = r * Math.sin(a1);
  for (const [w, c] of [[22, '#3b1f0e'], [13, '#ffd23f']]) {
    nc.strokeStyle = c; nc.lineWidth = w; nc.lineCap = 'round'; nc.beginPath(); nc.moveTo(0, 18); nc.lineTo(0, 0); nc.arc(r, 0, r, a0, a1); nc.stroke();
  }
  // the head, pointing along the curve
  const tx = -Math.sin(a1), ty = Math.cos(a1), nx = -ty, ny = tx;
  nc.beginPath(); nc.moveTo(ex + tx * 20, ey + ty * 20); nc.lineTo(ex + nx * 16, ey + ny * 16); nc.lineTo(ex - nx * 16, ey - ny * 16); nc.closePath();
  nc.fillStyle = '#ffd23f'; nc.strokeStyle = '#3b1f0e'; nc.lineWidth = 5; nc.lineJoin = 'round'; nc.stroke(); nc.fill();
  nc.restore();
}

// the coach: with the best line on, what your feet should be doing a moment from now, and the speed the line carries
const COACH = ['Gas', 'Coast', 'Brake', 'Brake hard'], COACH_CLS = ['gas', 'coast', 'brake', 'hard'];
let lastCoach = -1;
function coach(p) {
  const on = lineOn() && LINE && (S.mode === 'race' || S.mode === 'pro') && p.k > track.gateAt;
  lineMesh.mesh.visible = lineOn() && S.mode !== 'pick';
  $('coach').classList.toggle('on', !!on);
  if (!on) return;
  const k = Math.min(track.n - 1, p.k + Math.round(Math.max(4, p.v * 0.35) / track.ds)), ph = LINE.phase[k];
  if (ph !== lastCoach) { lastCoach = ph; $('coachTxt').textContent = COACH[ph]; $('coach').className = 'coach on ' + COACH_CLS[ph]; }
  $('coachV').textContent = Math.round(LINE.v[k] * 3.6) + ' km/h';
}

function result() {
  S.resultShown = true;
  const p = player, order = S.order;
  const place = order.indexOf(p) + 1;
  const prev = store.get(bestKey(choice), 0), best = !prev || p.time < prev;
  if (best) store.set(bestKey(choice), p.time);
  $('resTitle').textContent = place === 1 ? 'First to the gantry' : `${ord(place)} to the gantry`;
  $('resTime').innerHTML = `${fmt(p.time)}<small>Bridge to gantry in the ${p.spec.name} on ${MODE_NAME[mode]}${best ? (prev ? `, a new best by ${(prev - p.time).toFixed(1)} s` : ', your first time in it') : `, best ${fmt(prev)}`}</small>`;
  const proT = store.get('lap2.pro.' + choice, 0);
  if (proT) $('resTime').innerHTML += `<small>The pro does it in ${fmt(proT)}: you were ${(p.time - proT).toFixed(1)} s off.</small>`;
  resultButtons([['Go again', toRace, true], ['Watch the pro', () => { $('result').hidden = true; startPro(); }], ['Change car', toPick]]);
  $('touch').hidden = true;
  $('resOrder').innerHTML = order.map(c => `<li class="${c === p ? 'me' : ''}">${c === p ? 'You' : pretty(c.spec.name)}<span>${c.done ? fmt(c.time) : 'still on the lap'}</span></li>`).join('');
  $('result').hidden = false;
}

// ---------- sound ----------
const sound = new Sound();
const soundBtn = $('sound');
function toggleSound() { const on = sound.toggle(); store.set('sound', on); soundBtn.setAttribute('aria-pressed', String(on)); soundBtn.textContent = on ? 'Sound on' : 'Sound off'; }
soundBtn.onclick = () => { sound.start(); toggleSound(); };
if (!store.get('sound', true)) toggleSound();
function full() { const st = $('stage'); if (document.fullscreenElement) document.exitFullscreen(); else st.requestFullscreen?.().catch(() => {}); }
$('full').onclick = full;

// ---------- size ----------
function resize() { const r = cv.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(cv); resize();
requestAnimationFrame(t => { last = t; frame(t); });

// for the checks: the track, the cars and a way to drive without a keyboard
window.ringKart = { VERSION, track, S, get cars() { return cars; }, get player() { return player; }, get line() { return LINE; }, get shot() { return D.shot; }, keys, start: () => $('go').click(), watch: () => $('watch').click(), ticket, autopilot: v => { S.autopilot = v; }, get mode() { return mode; }, setMode,
  // play on without drawing, a step at a time, the way the checks drive a whole lap in a few seconds
  run: secs => { for (let t = 0; t < secs; t += 1 / 120) tick(1 / 120); for (let i = 0; i < 40; i++) camera3(1 / 30); draw(1 / 60); } };
