// Keystone's 3D build: the scene, the instruction booklet, the step controls, Inspect, load coloring and the cutaway.
// The building and its loads come from notre-dame.js, the force lines from the solver behind it.
//
// index.html loads it with a version stamp (src/main.js?v=VERSION), and every import carries the same stamp, so a
// visitor never mixes files from two deploys. node tools/bump.js keystone 0.x sets them all; tools/smoke.js checks them.
import * as THREE from './vendor/three.module.js?v=0.1';
import { OrbitControls } from './vendor/OrbitControls.js?v=0.1';
import { pieces, steps, STEP_STRUCK, forceLines, computeLoads, live } from './notre-dame.js?v=0.1';

const VERSION = '0.1';
const $ = id => document.getElementById(id);
$('version').textContent = 'v' + VERSION;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const on = id => $(id).getAttribute('aria-pressed') === 'true';
const press = (id, v) => $(id).setAttribute('aria-pressed', String(v));

// ---------- Scene ----------
// Soft and plain on purpose: even light from the sky, a low warm sun with soft shadows, no grid, and a ground that
// fades into the sky, so the stones and the red force lines are what you see.
const cv = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); }
catch (e) { $('stage').insertAdjacentHTML('beforeend', '<div class="nogl">This browser could not start 3D graphics.</div>'); throw e; }
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
const controls = new OrbitControls(camera, cv); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 8; controls.maxDistance = 220;
camera.position.set(-60, 34, 66); controls.target.set(0, 16, 0);
const lin = h => new THREE.Color(h).convertSRGBToLinear();
const hemi = new THREE.HemisphereLight(lin(0xeef2f6), lin(0xb9b1a3), 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(lin(0xfff3e2), 1.15); sun.position.set(-40, 70, 45); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 55, bottom: -10, near: 10, far: 200 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 96), new THREE.MeshLambertMaterial()); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true; scene.add(ground);
// a person for scale, by the west end of the nave
const person = new THREE.Group(), pm = new THREE.MeshStandardMaterial({ color: lin(0x4a5a6c), roughness: 0.8 });
const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.45, 16), pm); pb.position.y = 0.73;
const ph = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), pm); ph.position.y = 1.65;
person.add(pb, ph); person.position.set(-2.2, 0.08, 8.2); person.traverse(o => o.castShadow = true); scene.add(person);

const cutPlane = new THREE.Plane(V3(0, 0, -1), 99);
const MATS = {
  stone: () => new THREE.MeshStandardMaterial({ color: lin(0xe3d8c3), roughness: 0.95 }),
  web: () => new THREE.MeshStandardMaterial({ color: lin(0xebe2d0), roughness: 0.95, side: THREE.DoubleSide }),
  timber: () => new THREE.MeshStandardMaterial({ color: lin(0xc8924f), roughness: 0.85 }),
  oak: () => new THREE.MeshStandardMaterial({ color: lin(0x93683f), roughness: 0.9 }),
  lead: () => new THREE.MeshStandardMaterial({ color: lin(0x8a949d), roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }),
  glass: t => new THREE.MeshStandardMaterial({ color: lin([0x3d6db5, 0xb2404f, 0x4b8a66][t]), roughness: 0.3, transparent: true, opacity: 0.8, emissive: lin([0x1c3f80, 0x6e1f2b, 0x1d4d33][t]), side: THREE.DoubleSide }),
  pave: () => new THREE.MeshStandardMaterial({ color: lin(0xd2c9b7), roughness: 0.95 }),
};
const meshes = [];
pieces.forEach((p, i) => {
  const m = new THREE.Mesh(p.geo, MATS[p.mat](p.tint)); m.material.clippingPlanes = [cutPlane];
  m.castShadow = p.mat !== 'glass'; m.receiveShadow = true; m.visible = false; m.userData.i = i;
  p.mesh = m; p.base = m.material.color.clone(); scene.add(m); meshes.push(m);
  p.geo.computeBoundingBox(); p.box = p.geo.boundingBox.clone();
});

// ---------- Force lines ----------
// Rounded tubes with a ball at every bend, so the line of thrust reads as one smooth stroke.
const forceGroup = new THREE.Group(); scene.add(forceGroup);
const forceMat = new THREE.MeshBasicMaterial({ clippingPlanes: [cutPlane] });
function tube(pts, r) {
  const g = new THREE.Group(), path = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 6, r, 12, false), forceMat));
  const ball = new THREE.SphereGeometry(r, 12, 8);
  for (const p of [pts[0], pts[pts.length - 1]]) { const b = new THREE.Mesh(ball, forceMat); b.position.copy(p); g.add(b); }
  return g;
}
const FORCES = forceLines();
FORCES.lines.forEach(l => forceGroup.add(tube(l.pts, l.r)));
const baseBall = new THREE.SphereGeometry(0.35, 20, 14);
FORCES.bases.forEach(p => { const b = new THREE.Mesh(baseBall, forceMat); b.position.copy(p); forceGroup.add(b); });
forceGroup.visible = false;

// ---------- Load coloring ----------
const RAMP = [[0, 0x6f8fb5], [0.25, 0x9cbfaa], [0.5, 0xead77a], [0.75, 0xe9995a], [1, 0xd0454b]].map(([t, c]) => [t, lin(c)]);
function rampColor(mpa) {
  const t = Math.max(0, Math.min(1, (Math.log10(mpa) - Math.log10(0.05)) / (Math.log10(4) - Math.log10(0.05))));
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) return RAMP[i - 1][1].clone().lerp(RAMP[i][1], (t - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
  return RAMP.at(-1)[1].clone();
}

// ---------- State and animation ----------
const NSTEPS = steps.length;
const state = { n: NSTEPS, anim: [], follow: true, playing: false, sel: null, camT: null, loadView: false, started: false };
function applyStep(n, animate) {
  const prevN = state.n; state.n = n; state.anim = [];
  const now = performance.now();
  pieces.forEach(p => {
    const show = live(p, n), wasShown = live(p, prevN);
    if (animate && show && !wasShown && p.step === n - 1) { state.anim.push({ p, t0: now, kind: 'in' }); p.mesh.visible = true; }
    else if (animate && !show && wasShown && p.until === n - 1) { state.anim.push({ p, t0: now, kind: 'out' }); }
    else { p.mesh.visible = show; p.mesh.position.set(0, 0, 0); }
  });
  const incoming = state.anim.filter(a => a.kind === 'in');
  incoming.forEach((a, k) => a.t0 = now + k * Math.min(45, 1100 / Math.max(1, incoming.length)));
  pieces.forEach(p => p.fresh = p.step === n - 1 && live(p, n));
  computeLoads(n); recolor(); syncUI();
  if (animate && state.follow && n > 0) frameStep(n - 1);
}
const FRESH = lin(0xe8a23a).multiplyScalar(0.28), SEL = lin(0x2f6fd0).multiplyScalar(0.45), NONE = new THREE.Color(0);
function recolor() {
  pieces.forEach(p => {
    const m = p.mesh.material;
    if (state.loadView && p.bear > 0 && p.mat === 'stone') m.color.copy(rampColor(Math.max(0.01, p.stress)));
    else m.color.copy(p.base);
    if (p.mat !== 'glass') m.emissive.copy(state.sel === p ? SEL : p.fresh && !state.loadView ? FRESH : NONE);
  });
  const roofOn = on('v-roof');
  pieces.forEach(p => { if (p.group === 'roof') p.mesh.visible = roofOn && live(p, state.n); });
  forceGroup.visible = on('v-forces') && state.n > STEP_STRUCK;
}
function frameStep(i) {
  const box = new THREE.Box3(); let any = false;
  pieces.forEach(p => { if (p.step === i || p.until === i) { box.union(p.box); any = true; } });
  if (steps[i].focus === 'forces' || !any) box.set(V3(-17, 0, -10), V3(17, 36, 10));
  const c = box.getCenter(V3()), size = box.getSize(V3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.min(170, Math.max(26, size * 1.25) * Math.max(1, 1.3 / camera.aspect));
  state.camT = { t0: performance.now(), fromT: controls.target.clone(), toT: c, fromP: camera.position.clone(), toP: c.clone().add(dir.multiplyScalar(dist)) };
  if (state.camT.toP.y < 3) state.camT.toP.y = 3;
}
const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - (1 - t) * (1 - t) * (1 - t);
function tick(now) {
  requestAnimationFrame(tick);
  for (const a of state.anim) {
    const t = (now - a.t0) / (reduce ? 1 : 520);
    if (a.kind === 'in') a.p.mesh.position.y = (1 - ease(t)) * 3.2;
    else { a.p.mesh.position.y = -ease(t) * 1.2; if (t >= 1) a.p.mesh.visible = false; }
  }
  if (state.camT) { const t = ease((now - state.camT.t0) / (reduce ? 1 : 900)); controls.target.lerpVectors(state.camT.fromT, state.camT.toT, t); camera.position.lerpVectors(state.camT.fromP, state.camT.toP, t); if (t >= 1) state.camT = null; }
  controls.update(); renderer.render(scene, camera);
}
controls.addEventListener('start', () => { state.camT = null; if (state.follow) { state.follow = false; press('v-follow', false); } });

// ---------- Booklet and controls ----------
const plural = (k, n) => n === 1 ? k : k.endsWith('s') ? `${k}es` : `${k}s`;
function partsOf(i) {
  const add = {}, rem = {};
  pieces.forEach(p => { if (p.step === i) add[p.kind] = (add[p.kind] || 0) + 1; if (p.until === i) rem[p.kind] = (rem[p.kind] || 0) + 1; });
  return Object.entries(add).map(([k, n]) => `<span class="chip"><b>${n}</b> ${plural(k, n)}</span>`).join('') + Object.entries(rem).map(([k, n]) => `<span class="chip out">remove ${n} ${plural(k, n)}</span>`).join('');
}
function syncUI() {
  const n = state.n, pg = $('page');
  if (n === 0) pg.innerHTML = `<div class="top"><span>Start</span><span class="stepno">${NSTEPS} steps</span></div><h2>An empty site on the Île de la Cité</h2><p>Bishop Maurice de Sully laid the first stone in 1163. Press Next step to set the first footing.</p>`;
  else if (n === NSTEPS && !state.started) pg.innerHTML = `<div class="top"><span>Notre-Dame de Paris</span><span class="stepno">${pieces.length} pieces</span></div><h2>Three bays of the nave</h2><p>${NSTEPS} steps in 9 bags, from footings to stained glass. Every stone, rib and roof timber goes in on its own, in the order the masons used.</p><button class="primary" id="begin">Start building</button>`;
  else { const s = steps[n - 1]; pg.innerHTML = `<div class="top"><span>Bag ${s.bag}: ${s.bagName}</span><span class="stepno">Step ${n} of ${NSTEPS}</span></div><h2>${s.title}</h2><p>${s.note}</p><div class="parts">${partsOf(n - 1)}</div>`; }
  const b = $('begin'); if (b) b.onclick = () => { state.started = true; go(0, false); setTimeout(() => go(1, true), 350); };
  $('prev').disabled = n === 0; $('next').disabled = n === NSTEPS;
  $('scrub').max = NSTEPS; $('scrub').value = n;
  const placed = pieces.filter(p => live(p, n)).length, total = pieces.filter(p => p.until == null).length;
  $('count').textContent = `${placed} of ${total} pieces in place`;
  const curBag = n ? steps[n - 1].bag : 0;
  $('bags').innerHTML = [...new Set(steps.map(s => s.bag))].map(bg => {
    const first = steps.findIndex(s => s.bag === bg), last = steps.map(s => s.bag).lastIndexOf(bg);
    return `<button data-bag="${first}" class="${n > last ? 'done' : ''} ${bg === curBag ? 'cur' : ''}"><span>${bg}</span>${steps[first].bagName}</button>`;
  }).join('');
  $('bags').querySelectorAll('button').forEach(btn => btn.onclick = () => { state.started = true; go(+btn.dataset.bag, false); go(+btn.dataset.bag + 1, true); });
  $('legend').hidden = !state.loadView;
  syncInspect();
}
function syncInspect() {
  const p = state.sel, el = $('insp');
  if (!p || !live(p, state.n)) { el.hidden = true; return; }
  el.hidden = false;
  const t = x => `${(x / 9.81).toFixed(x / 9.81 >= 10 ? 0 : 1)} t`;
  el.innerHTML = `<span class="nm">${p.name}</span><dl><dt>Weight</dt><dd>${p.w ? t(p.w) : 'light'}</dd>${p.bear ? `<dt>Carrying, including itself</dt><dd>${t(p.load)}</dd><dt>Pressure where it rests</dt><dd>${p.stress.toFixed(2)} MPa</dd>` : ''}<dt>Placed in</dt><dd>step ${p.step + 1}</dd></dl>`;
}
function go(n, animate) { n = Math.max(0, Math.min(NSTEPS, n)); applyStep(n, animate); }
$('next').onclick = () => { state.started = true; go(state.n + 1, true); };
$('prev').onclick = () => { state.started = true; go(state.n - 1, false); };
$('scrub').oninput = e => { state.started = true; go(+e.target.value, false); };
$('scrub').onchange = e => { const n = +e.target.value; if (n > 0) { go(n - 1, false); go(n, true); } };
let playT = 0;
$('play').onclick = () => {
  state.playing = !state.playing; $('play').textContent = state.playing ? 'Pause' : 'Play';
  if (state.playing) { state.started = true; if (state.n === NSTEPS) go(0, false); loop(); } else clearTimeout(playT);
};
function loop() {
  if (!state.playing) return;
  if (state.n >= NSTEPS) { state.playing = false; $('play').textContent = 'Play'; return; }
  go(state.n + 1, true); playT = setTimeout(loop, 1900 + Math.min(1200, state.anim.length * 30));
}
const toggle = (id, fn) => $(id).onclick = () => { press(id, !on(id)); fn(on(id)); };
toggle('v-forces', recolor);
toggle('v-load', v => { state.loadView = v; recolor(); syncUI(); });
toggle('v-roof', recolor);
toggle('v-follow', v => { state.follow = v; if (v && state.n) frameStep(state.n - 1); });
const setCut = () => { const v = on('v-cut'); $('cutpos').hidden = !v; cutPlane.constant = v ? +$('v-cutz').value : 99; };
toggle('v-cut', v => {
  setCut();
  if (v) state.camT = { t0: performance.now(), fromT: controls.target.clone(), toT: V3(0, 18, +$('v-cutz').value), fromP: camera.position.clone(), toP: V3(-6, 22, +$('v-cutz').value + 62) };
});
$('v-cutz').oninput = setCut;

// ---------- Inspect ----------
const ray = new THREE.Raycaster(); let down = null;
cv.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
cv.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = cv.getBoundingClientRect(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
  const hits = ray.intersectObjects(meshes.filter(m => m.visible)).filter(h => cutPlane.distanceToPoint(h.point) >= 0);
  state.sel = hits.length ? pieces[hits[0].object.userData.i] : null; recolor(); syncInspect();
});

// ---------- Theme and size ----------
function theme() {
  const cs = getComputedStyle(document.documentElement), css = n => lin(cs.getPropertyValue(n).trim());
  // the background and the fog are both drawn after the color conversion, so both take the page's color as is,
  // and the ground fades into the sky with no horizon
  const sky = new THREE.Color(cs.getPropertyValue('--sky').trim());
  scene.background = sky; ground.material.color.copy(css('--ground'));
  scene.fog = new THREE.Fog(sky, 110, 300);
  forceMat.color.copy(css('--thrust'));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function resize() { const r = $('stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe($('stage'));
theme(); resize();
// open on the finished model, like the picture on the box
go(NSTEPS, false);
requestAnimationFrame(tick);
window.keystone = { go, state, steps, pieces, VERSION };
