// Cathedral Lab's 3D build: the scene, the instruction booklet, the step controls, Inspect, load coloring and the cutaway.
// The building and its loads come from notre-dame.js, the force lines from the solver behind it.
//
// index.html loads it with a version stamp (src/main.js?v=VERSION), and every import carries the same stamp, so a
// visitor never mixes files from two deploys. node tools/bump.js cathedral 0.x sets them all; tools/smoke.js checks them.
import * as THREE from './vendor/three.module.js?v=0.7';
import { OrbitControls } from './vendor/OrbitControls.js?v=0.7';
import { pieces, steps, STEP_STRUCK, HIDERS, forceLines, computeLoads, live, KIT } from './notre-dame.js?v=0.7';

const VERSION = '0.7';
const $ = id => document.getElementById(id);
$('version').textContent = 'v' + VERSION;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const on = id => $(id).getAttribute('aria-pressed') === 'true';
// The scene is drawn only when something has changed, so a still model costs nothing: on a phone that is the battery.
let dirty = true;
const redraw = () => { dirty = true; };
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
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2400);
const controls = new OrbitControls(camera, cv); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 8; controls.maxDistance = 480;
camera.position.set(-60, 34, 66); controls.target.set(0, 16, 0);
const lin = h => new THREE.Color(h).convertSRGBToLinear();
const hemi = new THREE.HemisphereLight(lin(0xeef2f6), lin(0xb9b1a3), 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(lin(0xfff3e2), 1.15); sun.position.set(-40, 70, 45); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 120, bottom: -90, near: 10, far: 500 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1600, 96), new THREE.MeshLambertMaterial()); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true; scene.add(ground);
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
  bronze: () => new THREE.MeshStandardMaterial({ color: lin(0x8c6a3c), roughness: 0.45, metalness: 0.6 }),
  copper: () => new THREE.MeshStandardMaterial({ color: lin(0x6aa596), roughness: 0.6, metalness: 0.3 }),
};
// ---------- Batches ----------
// Thousands of pieces can't each be their own object on a phone, so the pieces that come and go together (same step, same
// removal, same material, same roof group) are merged into one mesh. Each piece keeps the range of vertices and triangles
// it occupies in its batch: that is how it is colored, picked and dropped into place (the drop runs on the graphics card,
// each piece with its own delay, so a step still goes in stone by stone).
const DUR = reduce ? 0.001 : 0.52, batches = [], meshes = [];
{
  const byKey = new Map();
  pieces.forEach(p => {
    const key = [p.step, p.until, p.mat, p.tint, p.group].join('|');
    if (!byKey.has(key)) { const B = { step: p.step, until: p.until, mat: p.mat, group: p.group, pieces: [] }; byKey.set(key, B); batches.push(B); }
    byKey.get(key).pieces.push(p);
  });
  for (const B of batches) {
    let nv = 0, ni = 0;
    for (const { geo: g } of B.pieces) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), dly = new Float32Array(nv), idx = new Uint32Array(ni);
    const mat = MATS[B.mat](B.pieces[0].tint), base = mat.color.clone(), stagger = Math.min(0.045, 1.1 / B.pieces.length);
    mat.color.set(0xffffff); mat.vertexColors = true; mat.clippingPlanes = [cutPlane];
    let v = 0, i = 0;
    B.pieces.forEach((p, k) => {
      const g = p.geo, n = g.attributes.position.count, m = g.index ? g.index.count : n;
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); dly.fill(k * stagger, v, v + n);
      for (let j = 0; j < n; j++) col.set([base.r, base.g, base.b], (v + j) * 3);
      if (g.index) for (let j = 0; j < m; j++) idx[i + j] = g.index.array[j] + v; else for (let j = 0; j < m; j++) idx[i + j] = v + j;
      g.computeBoundingBox(); p.box = g.boundingBox.clone();
      Object.assign(p, { batch: B, v0: v, vn: n, i0: i, in: m, base, shown: base.clone() });
      v += n; i += m; g.dispose(); p.geo = null;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aDelay', new THREE.BufferAttribute(dly, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
    B.u = { uTime: { value: 0 }, uMode: { value: 0 } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, B.u);
      sh.vertexShader = 'attribute float aDelay;\nuniform float uTime;\nuniform int uMode;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        if (uMode != 0) {
          float k = clamp((uTime - aDelay) / ${DUR.toFixed(3)}, 0.0, 1.0), e = 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
          transformed.y += uMode == 1 ? (1.0 - e) * 3.2 : -e * 1.2;
        }`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = B.mat !== 'glass'; mesh.receiveShadow = true; mesh.visible = false;
    B.mesh = mesh; B.last = (B.pieces.length - 1) * stagger + DUR; scene.add(mesh); meshes.push(mesh);
  }
}

// ---------- Force lines ----------
// One whole path at a time: the line of thrust at the bay line facing you (or at the cut), from the crown of the vault
// through the rib, down the walls, along the flyers and through the buttresses to the ground. It is drawn over the stone,
// like a diagram, because most of it runs inside walls and piers, and in its true color (no tone mapping, which washes
// red to pink). Rounded tubes with a ball at each end, so it reads as one smooth stroke.
const forceGroup = new THREE.Group(); scene.add(forceGroup);
const forceMat = new THREE.MeshBasicMaterial({ clippingPlanes: [cutPlane], depthTest: false, depthWrite: false, toneMapped: false });
const onTop = m => { m.renderOrder = 10; return m; };
function tube(pts, r) {
  const g = new THREE.Group(), path = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
  g.add(onTop(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 6, r, 12, false), forceMat)));
  const ball = new THREE.SphereGeometry(r, 12, 8);
  for (const p of [pts[0], pts[pts.length - 1]]) { const b = onTop(new THREE.Mesh(ball, forceMat)); b.position.copy(p); g.add(b); }
  return g;
}
const baseBall = new THREE.SphereGeometry(0.4, 20, 14);
const bayLines = forceLines().map(({ z, end, radial, at, normal, lines, bases }) => {
  const g = new THREE.Group(); Object.assign(g.userData, { z, end, radial, at, normal });
  lines.forEach(l => g.add(tube(l.pts, l.r)));
  bases.forEach(p => { const b = onTop(new THREE.Mesh(baseBall, forceMat)); b.position.copy(p); g.add(b); });
  forceGroup.add(g); return g;
});
function pickBayLine() {
  // with the cutaway on, the bay line just behind the cut (the apse's lines are not cut across); otherwise the nearest one
  // that you see broadside, not edge on
  const cut = on('v-cut') ? cutPlane.constant : null, look = camera.getWorldDirection(V3());
  const score = g => cut != null ? (!g.userData.radial && g.userData.z <= cut + 1e-6 ? cut - g.userData.z : Infinity) : camera.position.distanceTo(g.userData.at) / (0.15 + Math.abs(look.dot(g.userData.normal)));
  // the lines next to the crossing and the towers end up inside the transept walls and the towers, so they are never shown
  const best = bayLines.filter(g => !g.userData.end).reduce((a, g) => score(g) < score(a) ? g : a);
  bayLines.forEach(g => { if (g.visible !== (g === best)) { g.visible = g === best; redraw(); } });
}
forceGroup.visible = false;

// ---------- Load coloring ----------
const RAMP = [[0, 0x6f8fb5], [0.25, 0x9cbfaa], [0.5, 0xead77a], [0.75, 0xe9995a], [1, 0xd0454b]].map(([t, c]) => [t, lin(c)]);
function rampColor(mpa) {
  const t = Math.max(0, Math.min(1, (Math.log10(mpa) - Math.log10(0.05)) / (Math.log10(4) - Math.log10(0.05))));
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) return RAMP[i - 1][1].clone().lerp(RAMP[i][1], (t - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
  return RAMP.at(-1)[1].clone();
}

// ---------- State and animation ----------
const NSTEPS = steps.length, NBAGS = new Set(steps.map(s => s.bag)).size;
const state = { n: NSTEPS, follow: true, playing: false, sel: null, camT: null, loadView: false, started: false };
function applyStep(n, animate) {
  const prevN = state.n, now = performance.now(); state.n = n;
  for (const B of batches) {
    const p = B.pieces[0], show = live(p, n), was = live(p, prevN);
    B.anim = null; B.u.uMode.value = 0;
    if (animate && show && !was && B.step === n - 1) { B.anim = { t0: now, mode: 1 }; B.u.uMode.value = 1; B.u.uTime.value = 0; B.mesh.visible = true; }
    else if (animate && !show && was && B.until === n - 1) { B.anim = { t0: now, mode: 2 }; B.u.uMode.value = 2; B.u.uTime.value = 0; }
    else B.mesh.visible = show;
    B.fresh = B.step === n - 1 && show;
  }
  computeLoads(n); recolor(); syncUI();
  if (animate && state.follow && n > 0) frameStep(n - 1);
}
const FRESH = lin(0xe8a23a).multiplyScalar(0.28), SEL = lin(0x5b8fe0), NONE = new THREE.Color(0), want = new THREE.Color();
function recolor() {
  // a piece's vertex colors are rewritten only when its color changes, so stepping through the build stays cheap
  for (const p of pieces) {
    if (state.loadView && p.bear > 0 && p.mat === 'stone' && live(p, state.n)) want.copy(rampColor(Math.max(0.01, p.stress))); else want.copy(p.base);
    if (state.sel === p) want.lerp(SEL, 0.55);
    if (want.equals(p.shown)) continue;
    p.shown.copy(want);
    const a = p.batch.mesh.geometry.attributes.color;
    for (let j = p.v0; j < p.v0 + p.vn; j++) { a.array[j * 3] = want.r; a.array[j * 3 + 1] = want.g; a.array[j * 3 + 2] = want.b; }
    a.needsUpdate = true;
  }
  const roofOn = on('v-roof');
  for (const B of batches) {
    if (B.mat !== 'glass') B.mesh.material.emissive.copy(B.fresh && !state.loadView ? FRESH : NONE);
    if (B.group === 'roof') B.mesh.visible = roofOn && live(B.pieces[0], state.n);
  }
  redraw();
  state.forces = on('v-forces') && state.n > STEP_STRUCK;
  $('fkey').hidden = !state.forces;
  showForces();
}
// From the west, once the front stands, the line of thrust would be drawn over the towers, where it means nothing, so it
// waits until you go round to the side or cut the building open; the key says so.
function showForces() {
  const by = on('v-cut') ? null : HIDERS.find(h => state.n > h.step && (h.west != null ? camera.position.z > h.west : camera.position.z < h.east));
  const hidden = state.forces && !!by;
  if (forceGroup.visible !== (state.forces && !hidden)) { forceGroup.visible = state.forces && !hidden; redraw(); }
  if ((by && by.msg) !== state.fHidden) { state.fHidden = by && by.msg; $('fkeyMsg').textContent = hidden ? `${by.msg} Go round to the side, or turn on Cutaway.` : 'The path the vault\'s weight and outward push take to the ground: through a rib, down the wall, along the flyer and into the buttress. Shown at the bay line facing you.'; }
}

// ---------- Camera ----------
// Scroll or pinch zooms toward what is under the pointer, so zooming in on the roof keeps the roof in view. Double-click
// or double-tap a piece to fly to it, or the sky to see the whole building; Whole building does the same. The point the
// camera turns around never leaves the building, so a drag can't lose it.
function frameBox(box, minDist = 26) {
  const c = box.getCenter(V3()), size = box.getSize(V3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.min(controls.maxDistance - 10, Math.max(minDist, size * 1.25) * Math.max(1, 1.3 / camera.aspect));
  state.camT = { t0: performance.now(), fromT: controls.target.clone(), toT: c, fromP: camera.position.clone(), toP: c.clone().add(dir.multiplyScalar(dist)) };
  if (state.camT.toP.y < 3) state.camT.toP.y = 3;
}
function frameStep(i) {
  const box = new THREE.Box3(); let any = false;
  pieces.forEach(p => { if (p.step === i || p.until === i) { box.union(p.box); any = true; } });
  if (steps[i].focus === 'forces' || !any) box.set(V3(-17, 0, -10), V3(17, 36, 10));
  frameBox(box);
}
function frameAll() {
  const box = new THREE.Box3();
  pieces.forEach(p => { if (p.batch.mesh.visible) box.union(p.box); });
  if (box.isEmpty()) box.set(V3(-17, 0, -10), V3(17, 6, 10));
  frameBox(box);
}
const BOUNDS = new THREE.Box3(); pieces.forEach(p => BOUNDS.union(p.box)); BOUNDS.expandByScalar(2);
function clampTarget() {
  const before = controls.target.clone(); controls.target.clamp(BOUNDS.min, BOUNDS.max);
  if (!before.equals(controls.target)) { camera.position.add(controls.target.clone().sub(before)); redraw(); }
}
function stopFollow() { state.camT = null; if (state.follow) { state.follow = false; press('v-follow', false); } }
const ray = new THREE.Raycaster(), tri = [V3(), V3(), V3()], at = V3(), entry = V3();
// The piece under the pointer: a ray against each visible piece's box first, then against its own triangles in its batch.
function hitAt(e) {
  const r = cv.getBoundingClientRect(), R = ray.ray;
  ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
  let best = null;
  for (const p of pieces) {
    if (!p.batch.mesh.visible || !R.intersectBox(p.box, entry) || (best && R.origin.distanceTo(entry) > best.d)) continue;
    const g = p.batch.mesh.geometry, pos = g.attributes.position.array, idx = g.index.array;
    for (let t = p.i0; t < p.i0 + p.in; t += 3) {
      for (let q = 0; q < 3; q++) { const v = idx[t + q] * 3; tri[q].set(pos[v], pos[v + 1], pos[v + 2]); }
      if (!R.intersectTriangle(tri[0], tri[1], tri[2], false, at) || cutPlane.distanceToPoint(at) < 0) continue;
      const d = R.origin.distanceTo(at);
      if (!best || d < best.d) best = { d, point: at.clone(), piece: p };
    }
  }
  return best;
}
function pointUnder(e) {
  const hit = hitAt(e); if (hit) return hit.point;
  // nothing under the pointer: the point in the sky at the depth of what the camera is looking at
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(V3()), controls.target);
  return ray.ray.intersectPlane(plane, V3()) || controls.target.clone();
}
// caught on the way down to the canvas, before the orbit controls' own zoom, which only zooms toward the middle
$('stage').addEventListener('wheel', e => {
  if (e.target !== cv) return;
  e.preventDefault(); e.stopPropagation(); stopFollow();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  const d = camera.position.distanceTo(controls.target);
  const f = Math.min(Math.max(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)), controls.minDistance / d), controls.maxDistance / d);
  const p = pointUnder(e);
  camera.position.sub(p).multiplyScalar(f).add(p);
  controls.target.sub(p).multiplyScalar(f).add(p);
  clampTarget(); redraw();
}, { capture: true, passive: false });
$('fit').onclick = frameAll;
const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - (1 - t) * (1 - t) * (1 - t);
function tick(now) {
  requestAnimationFrame(tick);
  let busy = false;
  for (const B of batches) if (B.anim) {
    const t = (now - B.anim.t0) / 1000; B.u.uTime.value = t; busy = true;
    if (t > B.last) { if (B.anim.mode === 2) B.mesh.visible = false; B.anim = null; B.u.uMode.value = 0; }
  }
  if (state.camT) { const t = ease((now - state.camT.t0) / (reduce ? 1 : 900)); controls.target.lerpVectors(state.camT.fromT, state.camT.toT, t); camera.position.lerpVectors(state.camT.fromP, state.camT.toP, t); if (t >= 1) state.camT = null; busy = true; }
  if (controls.update()) busy = true;
  if (!state.camT) clampTarget();
  if (state.forces) { showForces(); if (forceGroup.visible) pickBayLine(); }
  if (busy || dirty) { renderer.render(scene, camera); dirty = false; }
}
controls.addEventListener('start', stopFollow);
controls.addEventListener('change', redraw);

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
  else if (n === NSTEPS && !state.started) pg.innerHTML = `<div class="top"><span>${KIT.place}</span><span class="stepno">${pieces.length} pieces</span></div><h2>${KIT.title}</h2><p>${NSTEPS} steps in ${NBAGS} bags, from footings to stained glass. Every stone, rib and roof timber goes in on its own, in the order the masons used.</p><button class="primary" id="begin">Start building</button>`;
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
// on a phone the booklet covers the top of the building, so a tap on it folds it to its title and back
$('page').addEventListener('click', e => { if (!e.target.closest('button') && matchMedia('(max-width: 640px)').matches) $('page').classList.toggle('min'); });
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
  go(state.n + 1, true); playT = setTimeout(loop, 1900 + Math.min(1200, pieces.filter(p => p.step === state.n - 1).length * 30));
}
const toggle = (id, fn) => $(id).onclick = () => { press(id, !on(id)); fn(on(id)); };
toggle('v-forces', recolor);
toggle('v-load', v => { state.loadView = v; recolor(); syncUI(); });
toggle('v-roof', recolor);
toggle('v-follow', v => { state.follow = v; if (v && state.n) frameStep(state.n - 1); });
const setCut = () => { const v = on('v-cut'); $('cutpos').hidden = !v; cutPlane.constant = v ? +$('v-cutz').value : 99; redraw(); };
toggle('v-cut', v => {
  setCut();
  if (v) state.camT = { t0: performance.now(), fromT: controls.target.clone(), toT: V3(0, 18, +$('v-cutz').value), fromP: camera.position.clone(), toP: V3(-6, 24, +$('v-cutz').value + 80) };
});
$('v-cutz').oninput = setCut;

// ---------- Inspect ----------
// A tap selects a piece; a second tap within a third of a second in the same place flies to it (or, on the sky, to the
// whole building). Done by hand rather than with dblclick, which phones do not send.
let down = null, lastTap = null;
cv.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
cv.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const hit = hitAt(e), now = performance.now();
  const dbl = lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 25;
  lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
  state.sel = hit ? hit.piece : null; recolor(); syncInspect();
  if (dbl) { stopFollow(); if (hit) frameBox(state.sel.box, 9); else frameAll(); }
});

// ---------- Theme and size ----------
function theme() {
  const cs = getComputedStyle(document.documentElement), css = n => lin(cs.getPropertyValue(n).trim());
  // the background and the fog are both drawn after the color conversion, so both take the page's color as is,
  // and the ground fades into the sky with no horizon
  const sky = new THREE.Color(cs.getPropertyValue('--sky').trim());
  scene.background = sky; ground.material.color.copy(css('--ground'));
  scene.fog = new THREE.Fog(sky, 480, 1200);
  forceMat.color.copy(css('--thrust'));
  redraw();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function resize() { const r = $('stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); redraw(); }
new ResizeObserver(resize).observe($('stage'));
theme(); resize();
// open on the finished model, like the picture on the box
go(NSTEPS, false); frameAll(); state.camT.t0 = -1e9;
requestAnimationFrame(tick);
window.cathedralLab = { go, state, steps, pieces, batches, renderer, VERSION };
