// Ring Kart: the page. Loads the lap and the cars, builds the world, runs the queue at the gate, the race and the
// result, reads the keyboard, a gamepad or the touch buttons, and draws the HUD, the map and the sound.
//
// index.html loads it with a version stamp (src/main.js?v=VERSION), and every import carries the same stamp (Three.js
// comes from Cathedral Lab's copy with Cathedral Lab's), so a visitor never mixes files from two deploys.
import * as THREE from '../../cathedral-lab/src/vendor/three.module.js?v=0.10';
import { buildTrack, cornerAt, locateGlobal, pointAt } from './track.js?v=0.2';
import { makeCar, step, collide, driveAI, revs, REDLINE } from './drive.js?v=0.2';
import { buildWorld, buildSky, HORIZON, carMesh, label } from './scene.js?v=0.2';
import { Sound } from './audio.js?v=0.2';

const VERSION = '0.2';
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
// the car paint and the Armco reflect the sky: an environment map made once from a cloudless copy of it
{ const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(); env.add(buildSky(false)); scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose(); }
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1400);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x41532f, 0.75));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const world = buildWorld(scene, track);
const gate = world.gate;
$('loading').hidden = true;

// ---------- particles: sparks from drifts, smoke from the tyres, dust off the grass ----------
const PN = 600, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pLife = new Float32Array(PN), pVel = new Float32Array(PN * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
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
function addCar(spec, k, lat, role) {
  const c = makeCar(spec, track, k, lat);
  c.role = role; c.traffic = role === 'traffic';
  const m = carMesh(spec.body); m.rotation.order = 'YZX'; scene.add(m);
  if (role !== 'player') { const l = label(pretty(spec.name)); l.position.y = spec.body.hgt + 1.3; l.visible = false; m.add(l); m.label = l; }
  if (role === 'player') {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.85 }));
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
  player = addCar(spec, behind(4, spec.body.len), 0, 'player'); S.queue.push(player);
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
    ${store.get('best.' + s.id, 0) ? `<p>Your best: ${fmt(store.get('best.' + s.id, 0))}</p>` : ''}</button>`).join('');
  $('cars').querySelectorAll('.carpick').forEach(b => b.onclick = () => { choice = b.dataset.id; store.set('car', choice); picker(); setup(); });
}
picker(); setup();
$('go').onclick = () => { S.mode = 'queue'; S.t = 0; S.lastRelease = -1.2; $('pick').hidden = true; $('hud').hidden = false; sound.start(); cv.focus?.(); };
$('again').onclick = () => { $('result').hidden = true; setup(); S.mode = 'queue'; $('hud').hidden = false; };
$('change').onclick = () => { $('result').hidden = true; setup(); S.mode = 'pick'; $('pick').hidden = false; $('hud').hidden = true; picker(); };
$('resume').onclick = () => pause(false);
$('restart').onclick = () => { pause(false); setup(); S.mode = 'queue'; };

// ---------- input: keyboard, gamepad, touch ----------
const keys = new Set();
const ctl = { left: 0, right: 0, gas: 0, brake: 0, drift: 0 };
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && S.mode !== 'pick') e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if (k === 'escape' || k === 'p') { if (S.mode === 'queue' || S.mode === 'race') pause(!S.paused); }
  if (k === 'm') toggleSound();
  if (k === 'c') S.camMode = (S.camMode + 1) % 3;
  if (k === 'f') full();
  if (k === 'r' && player && S.mode === 'race') rescue();
  if ((k === ' ' || k === 'enter') && S.mode === 'queue') ticket();
  if (k === 'enter' && S.mode === 'pick') $('go').click();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && (S.mode === 'race' || S.mode === 'queue')) pause(true); });
const touch = matchMedia('(pointer: coarse)').matches;
if (touch) $('touch').hidden = false;
$('touch').querySelectorAll('button').forEach(b => {
  const on = v => { ctl[b.dataset.k] = v; b.classList.toggle('on', !!v); if (v && b.dataset.k !== 'drift' && S.mode === 'queue' && b.dataset.k === 'gas') ticket(); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); on(1); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => on(0));
});
cv.addEventListener('pointerdown', () => { if (S.mode === 'queue') ticket(); });
function readInput() {
  const k = n => keys.has(n);
  let steer = (k('arrowright') || k('d') ? 1 : 0) - (k('arrowleft') || k('a') ? 1 : 0) + ctl.right - ctl.left;
  let gas = k('arrowup') || k('w') || ctl.gas ? 1 : 0, brake = k('arrowdown') || k('s') || ctl.brake ? 1 : 0;
  let drift = k(' ') || k('shift') || !!ctl.drift;
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer += Math.sign(ax) * (Math.abs(ax) - 0.12) / 0.88;
    const b = i => gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0;
    gas = Math.max(gas, b(7), b(0)); brake = Math.max(brake, b(6), b(2)); if (b(5) || b(4) || b(1)) drift = true;
    if (S.mode === 'queue' && (b(0) || b(7)) && !S.padTicket) { S.padTicket = true; ticket(); } else if (!b(0) && !b(7)) S.padTicket = false;
    if (b(9) && !S.padPause) { S.padPause = true; if (S.mode === 'race' || S.mode === 'queue') pause(!S.paused); } else if (!b(9)) S.padPause = false;
  }
  return { steer: Math.max(-1, Math.min(1, steer)), gas, brake, drift };
}
function pause(v) { S.paused = v; $('paused').hidden = !v; if (v) sound.quiet(); }
function rescue() {
  const p = pointAt(track, player.k, Math.max(-3, Math.min(3, player.lat)));
  Object.assign(player, { x: p.x, z: p.z, y: p.y + 0.5, vy: 0, h: p.h, v: Math.min(player.v, 12), air: true, drift: null });
}

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
  const steps = Math.ceil(dt / (1 / 120)); const h = dt / steps;
  for (let i = 0; i < steps; i++) tick(h);
  draw(dt);
}
function tick(dt) {
  S.t += dt;
  if (S.mode === 'queue' || S.mode === 'race' || S.mode === 'done') {
    queueStep(dt);
    // you
    const inp = readInput();
    if (S.mode === 'done') { inp.gas = 0; inp.brake = 0.4; inp.drift = false; inp.steer = Math.max(-1, Math.min(1, -player.lat * 0.1)); }
    player.input = inp;
    if (S.autopilot && player.released && S.mode === 'race') driveAI(player, dt, track, cars, { paceScale: 1.05 });
    if (!player.released) { player.input.drift = false; }
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
    // brake lights
    if (m.tail) { const on = c.input.brake > 0 && c.v > 0.5; if (m.tail.on !== on) { m.tail.on = on; m.tail.color.copy(on ? TAIL_ON : TAIL_OFF); } }
    if (m.label) { const d = Math.hypot(c.x - player.x, c.z - player.z); m.label.visible = S.mode !== 'pick' && d < 70 && d > 9; }
  }
  for (const [c, m] of meshes) if (!c.hidden) for (const w of m.wheels) w.rotation.z -= c.v * dt / 0.33;
  const pm = meshes.get(player);
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
        if (Math.random() < 0.5) emit(bx + ox, player.y + 0.3, bz + oz, (Math.random() - 0.5), 0.8, (Math.random() - 0.5), [0.8, 0.8, 0.82], 0.9);
      }
    }
    if (player.grass && player.v > 5) emit(bx, player.y + 0.2, bz, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, [0.45, 0.38, 0.25], 0.7);
    if (player.scrape > 0 && player.v > 5) for (let i = 0; i < 3; i++) emit(player.x, player.y + 0.5, player.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, [1, 0.85, 0.4], 0.3);
  }
  particles(dt);
  camera3(dt);
  hud(dt);
  sound.update(player, S.mode, dt);
  renderer.render(scene, camera);
}

function camera3(dt) {
  const c = player, f = new THREE.Vector3(Math.cos(c.h), 0, Math.sin(c.h));
  let want, look;
  if (S.mode === 'pick') {
    const a = S.t * 0.25;
    want = new THREE.Vector3(c.x + Math.cos(a) * 7.5, c.y + 3.4, c.z + Math.sin(a) * 7.5);
    look = new THREE.Vector3(c.x, c.y + 0.8, c.z);
    camPos.copy(want); camLook.copy(look); camInit = true;
  } else {
    // behind, high, and on the bonnet: just behind the windscreen, low enough to see the nose ahead of you
    const b = c.spec.body, onboard = S.camMode === 2;
    const dist = [7.2, 13, -b.len * (camera.aspect < 1 ? 0.3 : 0.06)][S.camMode], ht = [2.8, 5, b.hgt * 0.8][S.camMode];
    want = new THREE.Vector3(c.x, c.y + ht, c.z).addScaledVector(f, -dist);
    look = new THREE.Vector3(c.x, c.y + (onboard ? b.hgt * 0.62 : 1.2), c.z).addScaledVector(f, onboard ? 24 : 7);
    const near = onboard ? 0.08 : 0.3; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
    const k = S.camMode === 2 ? 1 : 1 - Math.exp(-dt * 7);
    camPos.lerp(want, k); camLook.lerp(look, S.camMode === 2 ? 1 : 1 - Math.exp(-dt * 12));
    // keep the camera above the ground it is over
    const g = track.y[Math.max(0, c.k - 4)] + 1.0;
    if (camPos.y < g && S.camMode !== 2) camPos.y = g;
  }
  camera.position.copy(camPos); camera.lookAt(camLook);
  sky.position.copy(camPos);
  const shake = S.camMode === 2 ? 0.35 : 1;
  if (c.landed > 0.2) camera.position.y += (Math.random() - 0.5) * c.landed * 0.25 * shake;
  if (c.bump > 0.2) camera.position.x += (Math.random() - 0.5) * c.bump * 0.3 * shake;
  // on the bonnet you feel the road: a little shudder that grows with speed, more on the grass
  if (S.camMode === 2 && !c.air) camera.position.y += (Math.random() - 0.5) * Math.min(0.03, Math.abs(c.v) * 0.0006) * (c.grass ? 4 : 1);
  const fov = 66 + Math.min(14, Math.max(0, c.v - 20) * 0.2) + (c.boost > 0 ? 6 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
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
  for (const [w, col] of [[9, 'rgba(0,0,0,0.6)'], [4, ORANGE]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let k = 0; k < track.n; k += 4) g[k ? 'lineTo' : 'moveTo'](track.x[k] * s + ox, track.z[k] * s + oz); g.stroke(); }
  const dot = (k, col) => { g.fillStyle = col; g.beginPath(); g.arc(track.x[k] * s + ox, track.z[k] * s + oz, 6, 0, 7); g.fill(); };
  dot(track.gateAt, '#4fd14a'); dot(finishK, '#ffd400');
  mapBase = { c, s, ox, oz };
}
// the height of the lap from the gate to the gantry, as a silhouette
function drawProfileBase() {
  const W = prof.width, H = prof.height, a = track.gateAt, b = finishK;
  let lo = Infinity, hi = -Infinity; for (let k = a; k <= b; k++) { lo = Math.min(lo, track.y[k]); hi = Math.max(hi, track.y[k]); }
  const X = k => (k - a) / (b - a) * W, Y = k => H - 6 - (track.y[k] - lo) / (hi - lo || 1) * (H - 14);
  const shape = (g, fill) => { g.beginPath(); g.moveTo(0, H); for (let k = a; k <= b; k += 3) g.lineTo(X(k), Y(k)); g.lineTo(W, H); g.closePath(); g.fillStyle = fill; g.fill(); };
  const mk = fill => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); shape(g, fill); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); for (let k = a; k <= b; k += 3) g[k === a ? 'moveTo' : 'lineTo'](X(k), Y(k)); g.stroke(); return c; };
  profBase = { dim: mk('rgba(255,255,255,0.12)'), lit: mk('rgba(245,166,35,0.55)'), X, Y };
}
// the revs: an arc of bars from 0 to 8,000, green, then amber, red past the redline
function drawTach(rpm, gear) {
  const W = tach.width, H = tach.height, cx = W / 2, cy = H * 0.66, R = H * 0.52, a0 = Math.PI * 0.86, a1 = Math.PI * 2.14, top = 8000, N = 44;
  tg.clearRect(0, 0, W, H);
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N, r = f * top, a = a0 + (a1 - a0) * f, on = r <= rpm;
    tg.strokeStyle = !on ? 'rgba(255,255,255,0.12)' : r > REDLINE ? '#ff3b3b' : r > 6000 ? '#ffc93b' : '#4fd14a';
    tg.lineWidth = 5; tg.beginPath();
    tg.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); tg.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); tg.stroke();
  }
  tg.font = '700 22px Barlow, sans-serif'; tg.textAlign = 'center'; tg.textBaseline = 'middle';
  for (let t = 0; t <= 8; t++) { const a = a0 + (a1 - a0) * t / 8; tg.fillStyle = t * 1000 > REDLINE ? '#ff6b6b' : 'rgba(255,255,255,0.8)'; tg.fillText(t, cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40)); }
  // a shift light when it is time to change up
  if (rpm > 6500 && gear > 0 && gear < 6) { tg.fillStyle = '#4fb7ff'; tg.beginPath(); tg.arc(cx, cy - 4, 9, 0, 7); tg.fill(); }
  tg.fillStyle = 'rgba(255,255,255,0.7)'; tg.font = '600 18px Barlow, sans-serif'; tg.fillText('rpm × 1000', cx, H - 12);
}
drawMapBase(); drawProfileBase();
const fmt2 = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
const dial = { rpm: 900, gas: 0, brake: 0 };
let lastHud = 0;
function hud(dt) {
  if (S.mode === 'pick') return;
  const p = player;
  // position: finishers in the order they reached the gantry, then everyone else by how far round they are
  const order = group.slice().sort((a, b) => (a.done && b.done) ? a.time - b.time : a.done ? -1 : b.done ? 1 : b.s - a.s);
  const pos = order.indexOf(p) + 1;
  S.order = order;
  // the dials ease toward the gearbox and the pedals, every frame
  const gb = revs(p), e = Math.min(1, dt * 10);
  dial.rpm += (gb.rpm - dial.rpm) * Math.min(1, dt * (gb.rpm > dial.rpm ? 9 : 6));
  dial.gas += ((p.input.gas || p.boost > 0 ? 1 : 0) - dial.gas) * e; dial.brake += (p.input.brake - dial.brake) * e;
  $('thr').style.height = (dial.gas * 100).toFixed(0) + '%'; $('brk').style.height = (dial.brake * 100).toFixed(0) + '%';
  drawTach(dial.rpm, gb.gear);
  $('time').textContent = fmt2(S.mode === 'queue' ? 0 : player.done ? player.time : S.raceT);
  if (performance.now() - lastHud > 90) {
    lastHud = performance.now();
    $('posN').textContent = ord(pos); $('posOf').textContent = '/' + group.length;
    const best = store.get('best.' + choice, 0); $('best').textContent = best ? 'Best ' + fmt(best) + ' in the ' + p.spec.name : '';
    $('kmh').textContent = Math.round(Math.abs(p.v) * 3.6);
    $('gear').textContent = gb.gear < 0 ? 'R' : gb.gear === 0 ? 'N' : gb.gear;
    $('flags').textContent = [p.boost > 0 && 'Turbo', p.drift && 'Drift', p.slipT > RV.slip.build && 'Tow', p.air && 'Air', p.grass && 'Grass'].filter(Boolean).join('  ·  ');
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
  // corner names as you reach them
  const name = cornerAt(track, p.k + 14);
  if (name !== S.cornerName && S.mode === 'race') { S.cornerName = name; S.cornerT = 2.4; $('corner').textContent = corner(name); }
  S.cornerT -= dt; $('corner').classList.toggle('on', S.cornerT > 0);
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
  for (const c of cars) if (!c.hidden && c !== p) at(c, c.role === 'traffic' ? 3 : 5, c.role === 'traffic' ? 'rgba(190,196,204,0.6)' : '#ffffff');
  at(p, 8, '#ff2d2d', '#ffffff');
  // the height of the lap, lit as far as you have come
  const W = prof.width, H = prof.height, frac = Math.max(0, Math.min(1, (p.k - track.gateAt) / (finishK - track.gateAt)));
  pg.clearRect(0, 0, W, H); pg.drawImage(profBase.dim, 0, 0);
  if (frac > 0) pg.drawImage(profBase.lit, 0, 0, W * frac, H, 0, 0, W * frac, H);
  for (const c of group) if (!c.hidden && c !== p && c.k > track.gateAt) { const x = profBase.X(Math.min(finishK, c.k)); pg.fillStyle = '#fff'; pg.fillRect(x - 1.5, profBase.Y(Math.min(finishK, c.k)) - 9, 3, 7); }
  if (p.k >= track.gateAt) { const k = Math.min(finishK, p.k), x = profBase.X(k), y = profBase.Y(k); pg.fillStyle = '#ff2d2d'; pg.strokeStyle = '#fff'; pg.lineWidth = 2; pg.beginPath(); pg.arc(x, y, 6, 0, 7); pg.fill(); pg.stroke(); }
}

function result() {
  S.resultShown = true;
  const p = player, order = S.order;
  const place = order.indexOf(p) + 1;
  const prev = store.get('best.' + choice, 0), best = !prev || p.time < prev;
  if (best) store.set('best.' + choice, p.time);
  $('resTitle').textContent = place === 1 ? 'First to the gantry' : `${ord(place)} to the gantry`;
  $('resTime').innerHTML = `${fmt(p.time)}<small>Bridge to gantry in the ${p.spec.name}${best ? (prev ? `, a new best by ${(prev - p.time).toFixed(1)} s` : ', your first time in it') : `, best ${fmt(prev)}`}</small>`;
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
window.ringKart = { VERSION, track, S, get cars() { return cars; }, get player() { return player; }, keys, start: () => $('go').click(), ticket, autopilot: v => { S.autopilot = v; },
  // play on without drawing, a step at a time, the way the checks drive a whole lap in a few seconds
  run: secs => { for (let t = 0; t < secs; t += 1 / 120) tick(1 / 120); for (let i = 0; i < 40; i++) camera3(1 / 30); draw(1 / 60); } };
