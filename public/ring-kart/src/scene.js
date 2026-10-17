// Everything you see, drawn like a 1970s Saturday-morning cartoon: a turquoise sky over a striped sun and painted
// hills, puffy clouds, lollipop trees and spruces in ink outlines, a patchwork of fields, the road with its kerbs,
// Armco, catch fences and painted tarmac, the gate and the gantry, corner boards, and the cars, each drawn from a side
// view to its own proportions, with racing stripes. Everything is cel-shaded (three flat bands of light, no gradients)
// and the cars and trees carry a brown ink outline. Three.js r128, the copy Cathedral Lab keeps on the site.
import * as THREE from '../../cathedral-lab/src/vendor/three.module.js?v=0.15';
import { pointAt } from './track.js?v=0.15';

// Colours here are written as on a paint chart (sRGB); the renderer works in linear light, so convert them.
const col = c => new THREE.Color(c).convertSRGBToLinear();
const rnd = (() => { let s = 1234567; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); })();

// ---------- the look ----------
// The palette: a 70s colour script. INK is the outline, a warm brown rather than black, as the old cels were inked.
export const PAL = { ink: '#2a1a0e', cream: '#fff1cf', mustard: '#f2b631', orange: '#ec6f2b', red: '#d8402b', brown: '#6b3e1e', avocado: '#8a9a2b', teal: '#2f9c9a', grass: '#8cc63f' };
// Cel shading: three flat bands of light, shadow, middle and lit.
const RAMP = (() => { const t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; })();
const toon = (o = {}) => new THREE.MeshToonMaterial({ gradientMap: RAMP, ...o, ...(typeof o.color === 'number' || typeof o.color === 'string' ? { color: col(o.color) } : {}) });
// The ink: each outlined mesh has a twin drawn inside out, a little fatter along its smoothed normals, in INK. Its
// colour fades into the fog with distance the way the rest of the world does.
const inkU = { ink: { value: col(PAL.ink) }, fogColor: { value: new THREE.Color() }, fogNear: { value: 170 }, fogFar: { value: 820 } };
export function setInkFog(fog) { inkU.fogColor.value.copy(fog.color); inkU.fogNear.value = fog.near; inkU.fogFar.value = fog.far; }
function inkMat(thick) {
  return new THREE.ShaderMaterial({
    uniforms: { ...inkU, thick: { value: thick } }, side: THREE.BackSide,
    vertexShader: `attribute vec3 onormal; uniform float thick; varying float vDepth;
      void main() { vec4 p = vec4(position + onormal * thick, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      vec4 mv = modelViewMatrix * p; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 ink; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying float vDepth;
      void main() { gl_FragColor = vec4(mix(ink, fogColor, smoothstep(fogNear, fogFar, vDepth)), 1.0); }`,
  });
}
// normals averaged over every vertex at the same spot, so the fattened twin has no cracks at hard edges
function inkNormals(g) {
  const p = g.attributes.position, n = g.attributes.normal, sum = new Map(), key = i => `${Math.round(p.getX(i) * 500)},${Math.round(p.getY(i) * 500)},${Math.round(p.getZ(i) * 500)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i), v = sum.get(k) || [0, 0, 0]; v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i); sum.set(k, v); }
  const o = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = sum.get(key(i)), l = Math.hypot(v[0], v[1], v[2]) || 1; o.set([v[0] / l, v[1] / l, v[2] / l], i * 3); }
  g.setAttribute('onormal', new THREE.BufferAttribute(o, 3)); return g;
}

// `look` is the track's own look from its data file: `theme` ("forest", the Eifel; "dry", golden California hills and
// oaks; "coast", sea on the left, beach, palms), `words` painted on the road, the `start` and `finish` signs, and a
// `lighthouse` at the finish. Only one lap of a circuit is drawn (track.drawA to drawB): the laps after it are the same
// road.
export function buildWorld(scene, track, look = {}) {
  const W = track.width, half = W / 2, n = track.n, A = track.drawA ?? 0, Bk = track.drawB ?? n - 1;
  const group = new THREE.Group(); scene.add(group);

  // ---------- road ----------
  const road = ribbon(track, k => [-half, half], 0.02, (k, side) => [side, k * track.ds / 10], A, Bk);
  road.material = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: asphalt() });
  road.material.map.wrapS = road.material.map.wrapT = THREE.RepeatWrapping;
  road.receiveShadow = true; group.add(road);
  // grass verge out to the Armco and a little past it
  for (const side of [-1, 1]) {
    const verge = ribbon(track, k => side > 0 ? [half, (side > 0 ? track.wallR[k] : track.wallL[k]) + 3] : [-(track.wallL[k] + 3), -half], -0.02, (k, s) => [s, k * track.ds / 6], A, Bk);
    verge.material = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: grassTex() });
    verge.material.map.wrapS = verge.material.map.wrapT = THREE.RepeatWrapping;
    group.add(verge);
  }
  // kerbs on the inside of the corners, red and white
  const kerbTex = kerb();
  for (const side of [-1, 1]) {
    const runs = []; let start = -1;
    for (let k = A; k <= Bk; k++) {
      const on = track.curv[k] * side > 0.018;
      if (on && start < 0) start = k; if (!on && start >= 0) { if (k - start > 4) runs.push([start, k]); start = -1; }
    }
    for (const [a, b] of runs) {
      const m = ribbon(track, k => side > 0 ? [half - 0.2, half + 1.3] : [-half - 1.3, -half + 0.2], 0.06, (k, s) => [s, k * track.ds / 2.4], Math.max(0, a - 3), Math.min(n - 1, b + 3));
      m.material = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: kerbTex }); group.add(m);
    }
  }
  // the Armco: two rails on posts, cream steel with a brown band
  const railMat = toon({ map: armco(), side: THREE.DoubleSide });
  railMat.map.wrapS = THREE.RepeatWrapping;
  for (const side of [-1, 1]) {
    const off = k => side > 0 ? track.wallR[k] : -track.wallL[k];
    group.add(wall(track, off, 0.3, 1.05, railMat, A, Bk));
  }
  // catch fences on the outside of the corners, a few metres behind the Armco, with a post every dozen metres
  const fenceMat = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: fence(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fenceMat.map.wrapS = THREE.RepeatWrapping;
  const fencePosts = [];
  for (const side of [-1, 1]) {
    const wl = side > 0 ? track.wallR : track.wallL, base = W / 2 + track.verge;
    let start = -1;
    for (let k = A; k <= Bk + 1; k++) {
      // outside of the bends, in long stretches, not all the way round
      const on = k <= Bk && look.theme !== 'coast' && wl[k] >= base - 0.01 && Math.sin(k * 0.0123 + side * 1.7) + Math.sin(k * 0.0051) > -0.3 && k > track.gateAt + 20;
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        if (k - start > 30) {
          const off = () => side * (base + 1.8);
          group.add(wall(track, off, 0.1, 3.4, fenceMat, start, k - 1));
          for (let j = start; j < k; j += 6) fencePosts.push(pointAt(track, j, off()));
        }
        start = -1;
      }
    }
  }
  const fp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 5).translate(0, 1.75, 0), new THREE.MeshToonMaterial({ gradientMap: RAMP, color: col(0x7d6a55) }), fencePosts.length);
  fencePosts.forEach((p, i) => fp.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  group.add(fp);
  const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12), posts = new THREE.InstancedMesh(postGeo, new THREE.MeshToonMaterial({ gradientMap: RAMP, color: col(0x7d6a55) }), Math.ceil(n / 2) * 2 + 4);
  { let i = 0; const m = new THREE.Matrix4(); for (let k = A; k <= Bk; k += 2) for (const side of [-1, 1]) { const p = pointAt(track, k, side > 0 ? track.wallR[k] + 0.08 : -track.wallL[k] - 0.08); m.makeTranslation(p.x, p.y + 0.4, p.z); posts.setMatrixAt(i++, m); } posts.count = i; }
  group.add(posts);

  // ---------- the hills and the forest ----------
  const { terrain, treeSpots, seaY } = hills(track, look);
  group.add(terrain);
  group.add(...(look.theme === 'coast' ? palms(treeSpots) : forest(treeSpots, look.theme)));
  if (seaY != null) group.add(sea(track, seaY));

  // ---------- painted tarmac: names and doodles fans leave on the road ----------
  const words = look.words || ['GRUNE HOLLE', 'VOLLGAS', 'BTG', 'NOS', 'LIFT?', 'BRAKE', 'DO NOT LIFT', 'EIFEL', 'NO TRUCKS', 'SEND IT', '20.8 KM', 'RING'];
  for (let i = 0; i < Math.round(40 * (Bk - A) / 3300); i++) {
    const k = Math.floor(A + 80 + rnd() * (Bk - A - 200));
    if (Math.abs(track.curv[k]) > 0.01) continue;
    const decal = paint(words[i % words.length], i);
    const p = pointAt(track, k, (rnd() - 0.5) * W * 0.5);
    decal.position.set(p.x, track.y[k] + 0.035, p.z);
    // flat on the road, the top of the letters pointing up the road, so they read the right way as you drive over them
    decal.rotation.order = 'YXZ'; decal.rotation.set(-Math.PI / 2, -track.h[k] - Math.PI / 2, 0);
    group.add(decal);
  }

  // ---------- corner boards ----------
  const boarded = new Set();
  for (const m of track.marks) {
    if (m.name === 'Gantry' || m.name === 'Touristenfahrten' || m.name === 'Start' || m.at < A || m.at > Bk || boarded.has(m.name)) continue;
    boarded.add(m.name);
    const k = Math.max(0, m.at - 12), side = track.curv[Math.min(n - 1, m.at + 10)] > 0 ? -1 : 1;
    const p = pointAt(track, k, side > 0 ? track.wallR[k] + 2.2 : -track.wallL[k] - 2.2);
    const b = board(m.name.replace('oe', 'ö').replace('ue', 'ü').replace('Ex-Muehle', 'Ex-Mühle').replace('Bruennchen', 'Brünnchen').replace('Doettinger Hoehe', 'Döttinger Höhe').replace('Quiddelbacher Hoehe', 'Quiddelbacher Höhe').replace('Fuchsroehre', 'Fuchsröhre'));
    b.position.set(p.x, p.y, p.z); b.rotation.y = -track.h[k] - Math.PI / 2; group.add(b);
  }

  // ---------- the gate and the gantry ----------
  // the Ring has its Touristenfahrten gate; elsewhere a start gantry (on a circuit the finish is the same one)
  const gate = track.format === 'ring' ? gateHouse(track) : null; if (gate) group.add(gate.group);
  group.add(gantry(track, track.finishK, look.finish || 'The Gantry'));
  if (track.format === 'sprint') group.add(gantry(track, track.startK, look.start || 'Start'));
  if (look.lighthouse) group.add(lighthouse(track));
  return { gate };
}

// The sky, painted as a cartoon background: a dome from turquoise overhead to a cream haze at the horizon, a striped
// 70s sun low in the sky, rows of painted hills on a band all the way round, and puffy outlined clouds. It follows the
// camera. The horizon colour is the fog's, so the world fades into the painting.
export const HORIZON = 0xfbe3b0;
export function buildSky() {
  const grp = new THREE.Group();
  const geo = new THREE.SphereGeometry(1100, 32, 20), pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
  const zen = col(0x2aa7c4), mid = col(0x8fd8d0), hor = col(HORIZON), below = col(0xd9b26a);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 1100;
    if (t > 0.18) c.copy(mid).lerp(zen, Math.min(1, (t - 0.18) / 0.5));
    else if (t > 0) c.copy(hor).lerp(mid, t / 0.18);
    else c.copy(hor).lerp(below, Math.min(1, -t / 0.08));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); dome.renderOrder = -3; grp.add(dome);
  // the sun: orange to yellow, cut by the stripes of a 70s sunset
  const sunTex = canvas(256, 256, (g, w, h) => {
    const r = w * 0.46, grad = g.createLinearGradient(0, h / 2 - r, 0, h / 2 + r);
    grad.addColorStop(0, '#ffe46b'); grad.addColorStop(0.5, '#ffb238'); grad.addColorStop(1, '#ec5a2b');
    g.fillStyle = grad; g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) { const y = h / 2 + i * 18 - 6, th = 3 + i * 2.2; g.fillRect(0, y, w, th); }
    g.globalCompositeOperation = 'source-over';
  });
  const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false })); sunS.position.set(-560, 140, -780); sunS.scale.set(300, 300, 1); sunS.renderOrder = -2; grp.add(sunS);
  // the painted hills: three rows, the farthest palest, each with an inked edge, on a band round the horizon
  const hillTex = canvas(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rows = [['#a9c7a3', 0.38, 0.0021, 70], ['#78a874', 0.55, 0.0037, 52], ['#4f8a5c', 0.72, 0.0061, 34]];
    rows.forEach(([fill, base, f, amp], r) => {
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) { const a = x / w * Math.PI * 2; g.lineTo(x, h * base - amp * (0.6 * Math.sin(a * 3 + r * 2) + 0.4 * Math.sin(a * 7 + r * 5)) * (0.7 + 0.3 * Math.sin(a * 2 + r))); }
      g.lineTo(w, h); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = PAL.ink; g.globalAlpha = 0.35 + r * 0.2; g.lineWidth = 3; g.stroke(); g.globalAlpha = 1;
    });
  });
  hillTex.wrapS = THREE.RepeatWrapping; hillTex.repeat.x = 3;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1000, 1000, 300, 64, 1, true), new THREE.MeshBasicMaterial({ map: hillTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  band.position.y = 40; band.renderOrder = -1; grp.add(band);
  // clouds: puffs of white with an ink line round them and a cream belly
  const cloudTex = canvas(256, 128, (g, w, h) => {
    const puffs = []; for (let i = 0; i < 7; i++) puffs.push([w * (0.2 + i * 0.1 + (rnd() - 0.5) * 0.05), h * (0.58 - Math.sin(i / 6 * Math.PI) * 0.18), 18 + Math.sin(i / 6 * Math.PI) * 22]);
    for (const [x, y, r] of puffs) { g.fillStyle = PAL.ink; g.beginPath(); g.arc(x, y, r + 4, 0, 7); g.fill(); }
    for (const [x, y, r] of puffs) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.fillStyle = '#f6e6c4'; for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y + r * 0.45, r * 0.6, 0, Math.PI); g.fill(); }
  });
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, d = 650 + rnd() * 280, sz = 110 + rnd() * 120;
    const cs = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false })); cs.renderOrder = -1;
    cs.position.set(Math.cos(a) * d, 170 + rnd() * 240, Math.sin(a) * d); cs.scale.set(sz, sz * 0.5, 1); grp.add(cs);
  }
  return grp;
}

// The best line, painted on the road: a ribbon of inked chevrons along the line, each stretch in the colour of what
// your feet should be doing there. The page repaints it for each car (`paint(phase)`), since a slower car brakes
// later and less; the line itself is the same for every car.
export const PHASE_COLOURS = ['#8ccf3f', '#f6d23c', '#ec6f2b', '#d8402b'];   // gas, coast, brake, hard brake
// drawn for samples a to b: on a circuit, one lap (the second, a flying lap, so its colours are the ones you will see
// lap after lap)
export function buildLine(track, lat, a = 0, b = track.n - 1) {
  const n = b - a + 1, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), colours = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const k = a + i, l = pointAt(track, k, lat[k] - 0.55), r = pointAt(track, k, lat[k] + 0.55);
    pos.set([l.x, l.y + 0.05, l.z, r.x, r.y + 0.05, r.z], i * 6);
    const v = k * track.ds / 3.2; uv.set([0, v, 1, v], i * 4);
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(colours, 3)); g.setIndex(idx);
  // a chevron pointing up the road, white so the vertex colour shows through, with an ink edge, on a faint band
  const tex = canvas(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(0, 0, w, h);
    c.beginPath(); c.moveTo(6, 10); c.lineTo(w / 2, 40); c.lineTo(w - 6, 10); c.lineTo(w - 6, 26); c.lineTo(w / 2, 56); c.lineTo(6, 26); c.closePath();
    c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 4; c.lineJoin = 'round'; c.stroke();
  });
  tex.wrapT = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: true }));
  mesh.renderOrder = 2; mesh.visible = false;
  const c = new THREE.Color();
  const paint = phase => {
    for (let i = 0; i < n; i++) { c.set(PHASE_COLOURS[phase[a + i]]).convertSRGBToLinear(); colours.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6); }
    g.attributes.color.needsUpdate = true;
  };
  return { mesh, paint };
}

// A strip along the road between two sideways offsets; uv(k, side) gives texture coordinates.
function ribbon(track, offs, lift, uv, a = 0, b = track.n - 1) {
  const cnt = b - a + 1, pos = new Float32Array(cnt * 6), uvs = new Float32Array(cnt * 4), idx = [];
  for (let k = a, i = 0; k <= b; k++, i++) {
    const [l, r] = offs(k);
    const pl = pointAt(track, k, l), pr = pointAt(track, k, r);
    pos.set([pl.x, pl.y + lift, pl.z, pr.x, pr.y + lift, pr.z], i * 6);
    const [u0, v0] = uv(k, 0), [u1] = uv(k, 1); uvs.set([0, v0, 1, v0], i * 4); void u0; void u1;
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g);
}
// An upright strip (the rail) at a sideways offset, from lo to hi above the road.
function wall(track, off, lo, hi, mat, a = 0, b = track.n - 1) {
  const cnt = b - a + 1, pos = new Float32Array(cnt * 6), uv = new Float32Array(cnt * 4), idx = [], rep = (hi - lo) * 1.6;
  for (let k = a, i = 0; k <= b; k++, i++) {
    const p = pointAt(track, k, off(k)); pos.set([p.x, p.y + lo, p.z, p.x, p.y + hi, p.z], i * 6);
    const u = k * track.ds / rep; uv.set([u, 0, u, 1], i * 4);
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide; return m;
}

// The ground: a height field over the whole circuit. Near the road it sits just under the tarmac; away from it, it
// follows the road's general height and rolls into hills. Trees go where it is far enough from the road.
function hills(track, look = {}) {
  const { x, z, y } = track, A = track.drawA ?? 0, Bk = track.drawB ?? track.n - 1, coast = look.theme === 'coast', dry = look.theme === 'dry';
  // on the coast the sea lies to the left of the road, a few metres below the lowest of it
  let ymin = Infinity; for (let k = A; k <= Bk; k++) ymin = Math.min(ymin, y[k]);
  const seaY = coast ? ymin - 3 : null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = A; k <= Bk; k++) { x0 = Math.min(x0, x[k]); x1 = Math.max(x1, x[k]); z0 = Math.min(z0, z[k]); z1 = Math.max(z1, z[k]); }
  const pad = 420; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  const cell = 8, nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  // nearest road sample, through a coarse bucket grid
  const B = 24, bx = Math.ceil((x1 - x0) / B) + 1, bucket = new Map();
  for (let k = A; k <= Bk; k++) { const key = Math.floor((x[k] - x0) / B) + Math.floor((z[k] - z0) / B) * bx; (bucket.get(key) || bucket.set(key, []).get(key)).push(k); }
  const coarse = []; for (let k = A; k <= Bk; k += 25) coarse.push(k);
  const H = new Float32Array(nx * nz), D = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const px = x0 + i * cell, pz = z0 + j * cell;
    let best = -1, bd = Infinity;
    const cx = Math.floor((px - x0) / B), cz = Math.floor((pz - z0) / B);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const l = bucket.get(cx + dx + (cz + dz) * bx); if (l) for (const k of l) { const d = (px - x[k]) ** 2 + (pz - z[k]) ** 2; if (d < bd) { bd = d; best = k; } } }
    // far height: weighted by distance over the whole lap
    let sw = 0, sh = 0; for (const k of coarse) { const w = 1 / ((px - x[k]) ** 2 + (pz - z[k]) ** 2 + 400); sw += w; sh += w * y[k]; }
    const far = sh / sw, d = best >= 0 ? Math.sqrt(bd) : 999;
    // just under the road, and lower again on a banked corner, whose inside edge dips below the centre line
    const near = best >= 0 ? y[best] - Math.abs(Math.tan(track.bank[best])) * track.width : far;
    const roll = (Math.sin(px * 0.011) * Math.cos(pz * 0.009) * 9 + Math.sin(px * 0.031 + pz * 0.027) * 3);
    const t = Math.min(1, Math.max(0, (d - 14) / 70));
    let hgt = (near - 0.9) * (1 - t) + (far + roll + Math.min(30, (d - 14) * 0.08)) * t;
    // the coast: on the sea side the land falls away past the verge, through a beach, under the water
    let left = false;
    if (coast && best >= 0) { left = -(px - x[best]) * Math.sin(track.h[best]) + (pz - z[best]) * Math.cos(track.h[best]) < 0; if (left) hgt = Math.min(hgt, near - 0.9 - Math.max(0, d - 16) * 0.45); }
    H[i + j * nx] = hgt; D[i + j * nx] = left ? -d : d;
  }
  const g = new THREE.PlaneGeometry((nx - 1) * cell, (nz - 1) * cell, nx - 1, nz - 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const i = v % nx, j = Math.floor(v / nx);
    pos.setXYZ(v, x0 + i * cell, H[i + j * nx], z0 + j * cell);
    // bright grass by the road, a patchwork of fields away from it: greens, olive and a mustard field or two
    const px = x0 + i * cell, pz = z0 + j * cell, fld = Math.sin(px * 0.0071 + Math.sin(pz * 0.004) * 2) * Math.cos(pz * 0.0063 - px * 0.002);
    const dd = D[i + j * nx], pick = Math.abs(dd) < 40 ? 0 : fld > 0.55 ? 3 : fld > 0.2 ? 1 : fld < -0.5 ? 2 : 0;
    // the Eifel's greens and a mustard field; California's golden grass; on the coast, sand on the sea side
    const pal = dry ? ['#c9b45a', '#d8c070', '#b9a24c', '#e2c97a'] : ['#8cc63f', '#a6c94b', '#6fb04a', '#e0b23e'];
    c.set(coast && dd < 0 ? '#f2d59a' : pal[pick]).convertSRGBToLinear(); cols.set([c.r, c.g, c.b], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, toon({ vertexColors: true }));
  terrain.receiveShadow = true;
  // trees: dense forest from just past the Armco outwards, with a few clearings
  const treeSpots = [];
  for (let j = 0; j < nz; j += 2) for (let i = 0; i < nx; i += 2) {
    const dd = D[i + j * nx], d = Math.abs(dd); if (d < 22 || d > 230) continue;
    if (coast && (dd < 0 ? d > 30 || H[i + j * nx] < seaY + 0.5 : rnd() > 0.35)) continue;   // palms on the beach and here and there inland
    if (dry && rnd() > 0.3) continue;                                                       // scattered oaks on open hills
    const clearing = Math.sin((x0 + i * cell) * 0.004) * Math.cos((z0 + j * cell) * 0.005) > 0.55;
    if (clearing || rnd() > (d < 60 ? 0.8 : 0.42)) continue;
    treeSpots.push([x0 + i * cell + (rnd() - 0.5) * cell * 2, H[i + j * nx] - 0.3, z0 + j * cell + (rnd() - 0.5) * cell * 2, rnd()]);
  }
  return { terrain, treeSpots, seaY };
}

// the sea: a wide flat of turquoise with painted wave lines, to the horizon
function sea(track, seaY) {
  const tex = canvas(256, 256, (g, w, h) => { g.fillStyle = '#2fb3c4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8fe0e0'; g.lineWidth = 5; g.lineCap = 'round'; for (let i = 0; i < 9; i++) { const y = (i * 53) % h, x = (i * 97) % w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 18, y - 10, x + 36, y); g.quadraticCurveTo(x + 54, y + 10, x + 72, y); g.stroke(); } });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(60, 60);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), toon({ map: tex }));
  let cx = 0, cz = 0; for (let k = track.drawA; k <= track.drawB; k++) { cx += track.x[k]; cz += track.z[k]; } const nn = track.drawB - track.drawA + 1;
  m.position.set(cx / nn, seaY, cz / nn); return m;
}
// a palm: a leaning, tapering trunk in rings, and a crown of drooping fronds
function palms(spots) {
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, 9, 7, 6, true).translate(0, 4.5, 0);
  { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setX(i, p.getX(i) + (yy / 9) ** 2 * 1.6); } trunk.computeVertexNormals(); }
  const fronds = merge(Array.from({ length: 7 }, (_, i) => new THREE.SphereGeometry(0.5, 8, 5).scale(4.2, 0.35, 1.1).translate(2.0, -0.5, 0).rotateZ(-0.35).rotateY(i * Math.PI * 2 / 7).translate(1.6, 9, 0)));
  inkNormals(fronds); inkNormals(trunk);
  const T = new THREE.InstancedMesh(trunk, toon({ color: 0x9a6b3c }), spots.length), Ti = new THREE.InstancedMesh(trunk, inkMat(0.08), spots.length);
  const F = new THREE.InstancedMesh(fronds, toon(), spots.length), Fi = new THREE.InstancedMesh(fronds, inkMat(0.12), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color(), greens = ['#3f9a3a', '#5aa83c', '#2f8a4a'];
  spots.forEach((s, i) => { const k = 0.8 + (s[3] * 7919 % 1) * 0.5; ps.set(s[0], s[1], s[2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s[3] * 6.28); sc.set(k, k, k); m.compose(ps, q, sc); T.setMatrixAt(i, m); Ti.setMatrixAt(i, m); F.setMatrixAt(i, m); Fi.setMatrixAt(i, m); c.set(greens[Math.floor(s[3] * 997) % 3]).convertSRGBToLinear(); F.setColorAt(i, c); });
  return [T, Ti, F, Fi];
}
// a lighthouse on the sea side of the finish: red and white bands, a gallery and a lamp
function lighthouse(track) {
  const k = Math.min(track.n - 1, track.finishK + 20), p = pointAt(track, k, -(track.wallL[k] + 14)), grp = new THREE.Group();
  const bands = canvas(32, 256, (g, w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff1cf' : '#d8402b'; g.fillRect(0, i * h / 6, w, h / 6); } });
  const tower = new THREE.CylinderGeometry(1.6, 2.6, 16, 16).translate(0, 8, 0), cap = new THREE.CylinderGeometry(2.2, 2.2, 0.5, 16).translate(0, 16.2, 0), lamp = new THREE.CylinderGeometry(1.2, 1.2, 1.8, 12).translate(0, 17.4, 0), roof = new THREE.ConeGeometry(1.6, 1.8, 12).translate(0, 19.2, 0);
  grp.add(new THREE.Mesh(tower, toon({ map: bands })), new THREE.Mesh(cap, toon({ color: 0x2a1a0e })), new THREE.Mesh(lamp, new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, 1.1) })), new THREE.Mesh(roof, toon({ color: 0xd8402b })));
  const ink = merge([tower.clone(), cap.clone(), roof.clone()]); grp.add(new THREE.Mesh(inkNormals(ink), inkMat(0.12)));
  grp.position.set(p.x, track.y[k] - 1, p.z); return grp;
}

function forest(spots, theme) {
  // a spruce: tiers of branches that hang down and out, narrowing to a point
  const prof = [[0.3, 2], [2.9, 3.2], [1.1, 3.6], [2.5, 5.6], [0.9, 6], [2.0, 8], [0.7, 8.4], [1.4, 10.4], [0.45, 10.8], [0.8, 12.4], [0, 14]];
  const pine = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 7); pine.translate(0, -1.2, 0);
  // a lollipop tree, the cartoon broadleaf: a ball of leaves on a stick
  const leaf = new THREE.SphereGeometry(3.3, 9, 7); leaf.scale(1, 1.12, 1); leaf.translate(0, 6.2, 0);
  const trunk = new THREE.CylinderGeometry(0.32, 0.45, 3.4, 6); trunk.translate(0, 1.7, 0);
  inkNormals(pine); inkNormals(leaf);
  // on dry hills only the round ones, as oaks
  if (theme === 'dry') spots.forEach(s => { if (s[3] < 0.62) s[3] = 0.62 + s[3] * 0.38 / 0.62; });
  const nP = spots.filter(s => s[3] < 0.62).length, nL = spots.length - nP;
  // white materials: each tree's own colour is set per instance, and the two multiply
  const P = new THREE.InstancedMesh(pine, toon(), nP), Pi = new THREE.InstancedMesh(pine, inkMat(0.16), nP);
  const Lf = new THREE.InstancedMesh(leaf, toon(), nL), Li = new THREE.InstancedMesh(leaf, inkMat(0.16), nL);
  const T = new THREE.InstancedMesh(trunk, toon({ color: 0x8a5a2b }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color();
  const pines = ['#2f7a4f', '#3c8a55', '#2b6b4c'], balls = theme === 'dry' ? ['#4f7a35', '#5e8a3a', '#46703a', '#6b8a3f'] : ['#5aa83c', '#3f8f3a', '#7cbc3a', '#4c9e46', '#5aa83c', '#e0a630', '#d9752b'];
  let ip = 0, il = 0;
  spots.forEach((s, i) => {
    const k = 0.7 + (s[3] * 7919 % 1) * 0.7;
    ps.set(s[0], s[1], s[2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s[3] * 6.28); sc.set(k, k * (0.9 + (s[3] * 104729 % 1) * 0.5), k);
    m.compose(ps, q, sc); T.setMatrixAt(i, m);
    if (s[3] < 0.62) { P.setMatrixAt(ip, m); Pi.setMatrixAt(ip, m); c.set(pines[Math.floor(s[3] * 997) % pines.length]).convertSRGBToLinear(); P.setColorAt(ip++, c); }
    else { Lf.setMatrixAt(il, m); Li.setMatrixAt(il, m); c.set(balls[Math.floor(s[3] * 7907) % balls.length]).convertSRGBToLinear(); Lf.setColorAt(il++, c); }
  });
  return [P, Pi, Lf, Li, T];
}

// ---------- textures, drawn on canvases ----------
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.encoding = THREE.sRGBEncoding; return t; }
// cartoon tarmac: one warm purple-grey with a few soft blotches, thick cream edge lines and a dashed line down the middle
function asphalt() {
  return canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#80768a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '96,86,108' : '128,118,140'},0.18)`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 14 + rnd() * 26, 30 + rnd() * 60, 0, 0, 7); g.fill(); }
    g.fillStyle = PAL.cream; g.fillRect(5, 0, 12, h); g.fillRect(w - 17, 0, 12, h);
    g.fillRect(w / 2 - 5, 0, 10, h * 0.45);
  });
}
// the rails: cream steel with a brown band and an inked top and bottom
function armco() {
  return canvas(32, 64, (g, w, h) => {
    g.fillStyle = '#e8dfcb'; g.fillRect(0, 0, w, h); g.fillStyle = '#b39f80'; g.fillRect(0, h * 0.44, w, h * 0.12);
    g.fillStyle = PAL.ink; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4); g.fillRect(w - 3, 0, 3, h);
  });
}
// the catch fence: a diamond wire mesh you can see through
function fence() {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(90,70,50,0.6)'; g.lineWidth = 2;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 16 + h, 0); g.lineTo(i * 16, h); g.stroke(); }
    g.fillStyle = PAL.ink; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  });
}
// the verge, mown in light and dark bands across the road
function grassTex() {
  return canvas(64, 128, (g, w, h) => { g.fillStyle = '#8cc63f'; g.fillRect(0, 0, w, h); g.fillStyle = '#7db534'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#6a9d2c'; g.fillRect(0, 0, 6, h); });
}
function kerb() { return canvas(32, 64, (g, w, h) => { g.fillStyle = PAL.red; g.fillRect(0, 0, w, h / 2); g.fillStyle = PAL.cream; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = PAL.ink; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); }); }
// words painted on the road, in a fat 70s script with an ink edge
function paint(text, i) {
  const cols = [PAL.cream, PAL.mustard, PAL.orange, '#7fd6d0', '#ffffff'];
  const t = canvas(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = '72px "Racing Sans One", "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.85;
    g.lineWidth = 10; g.strokeStyle = PAL.ink; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 4); g.fillStyle = cols[i % cols.length]; g.fillText(text, w / 2, h / 2 + 4);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshToonMaterial({ gradientMap: RAMP, map: t, transparent: true, depthWrite: false }));
}
// the name over a car: a cream pill with an ink edge
export function label(text, sub) {
  const t = canvas(512, 128, (g, w, h) => {
    g.fillStyle = PAL.cream; g.strokeStyle = PAL.ink; g.lineWidth = 8; round(g, 8, 14, w - 16, h - 28, 40); g.fill(); g.stroke();
    g.fillStyle = PAL.brown; fit(g, text, 44, 'Bungee, Barlow, sans-serif', w - 70); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, sub ? h / 2 - 12 : h / 2 + 2);
    if (sub) { g.font = '26px Bungee, Barlow, sans-serif'; g.fillText(sub, w / 2, h / 2 + 24); }
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true })); sp.scale.set(4.4, 1.1, 1); return sp;
}
// set a font no bigger than px that fits text in maxW: Bungee is wide, and a long car name would spill out
function fit(g, text, px, fam, maxW) { do { g.font = `${px}px ${fam}`; px -= 2; } while (px > 12 && g.measureText(text).width > maxW); }
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function board(name) {
  const t = canvas(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = PAL.cream; g.strokeStyle = PAL.ink; g.lineWidth = 10; round(g, 6, 6, w - 12, h - 12, 34); g.fill(); g.stroke();
    for (const [c, y] of [[PAL.mustard, 22], [PAL.orange, 34], [PAL.red, 46]]) { g.fillStyle = c; g.fillRect(16, h - y - 6, w - 32, 10); }
    g.fillStyle = PAL.brown; fit(g, name, 60, '"Racing Sans One", "Barlow Condensed", sans-serif', w - 60); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 - 14);
  });
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2), new THREE.MeshToonMaterial({ gradientMap: RAMP, map: t, transparent: true, alphaTest: 0.5 })); face.position.y = 3.2; grp.add(face);
  // the back of the board: plain brown, so the name does not read backwards from the other side
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.9), toon({ color: PAL.brown })); back.position.set(0, 3.2, -0.02); back.rotation.y = Math.PI; grp.add(back);
  for (const x of [-2.6, 2.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), new THREE.MeshToonMaterial({ gradientMap: RAMP, color: col(0x6b3e1e) })); p.position.set(x, 1.6, -0.05); grp.add(p); }
  return grp;
}

// The Touristenfahrten gate: a booth, a barrier arm, a light, and the sign. Returns the arm so the page can lift it.
function gateHouse(track) {
  const grp = new THREE.Group(), k = track.gateAt, p = pointAt(track, k, 0), h = track.h[k];
  grp.position.set(p.x, p.y, p.z); grp.rotation.y = -h;
  const W = track.width;
  // local frame: +x along the road, +z to the right
  const booth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.2), new THREE.MeshToonMaterial({ gradientMap: RAMP, color: col(0xfff1cf) })); booth.position.set(0.8, 1.3, W / 2 + 1.6); grp.add(booth);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, W + 8), new THREE.MeshToonMaterial({ gradientMap: RAMP, color: col(0xec6f2b) })); roof.position.set(0, 5.2, 0); grp.add(roof);
  for (const z of [-W / 2 - 2, W / 2 + 3]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 0.4), new THREE.MeshToonMaterial({ gradientMap: RAMP, color: col(0x6d747c) })); c.position.set(0, 2.6, z); grp.add(c); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshBasicMaterial({ map: canvas(1024, 144, (g, w, hh) => { g.fillStyle = PAL.brown; g.fillRect(0, 0, w, hh); for (const [c, y] of [[PAL.mustard, 8], [PAL.orange, 18], [PAL.red, 28]]) { g.fillStyle = c; g.fillRect(0, hh - y - 4, w, 8); } g.fillStyle = PAL.cream; fit(g, 'Nordschleife Touristenfahrten', 78, '"Racing Sans One", "Barlow Condensed", sans-serif', w - 60); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Nordschleife Touristenfahrten', w / 2, hh / 2 - 8); }), side: THREE.DoubleSide }));
  sign.position.set(-0.25, 5.2 - 1.05, 0); sign.rotation.y = -Math.PI / 2; grp.add(sign);
  // the arm pivots at the booth and lies across the road
  const pivot = new THREE.Group(); pivot.position.set(0.2, 1.05, W / 2 + 0.4); grp.add(pivot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, W + 0.4), new THREE.MeshToonMaterial({ gradientMap: RAMP, map: canvas(16, 128, (g, w, hh) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d81e2c' : '#f4f4f4'; g.fillRect(0, i * 16, w, 16); } }) }));
  arm.position.z = -(W + 0.4) / 2; pivot.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: col(0xff2a2a) })); lamp.position.set(-0.3, 2.4, W / 2 + 0.5); grp.add(lamp);
  return { group: grp, pivot, lamp };
}
function gantry(track, k, text) {
  const p = pointAt(track, k, 0), W = track.width;
  const grp = new THREE.Group(); grp.position.set(p.x, p.y, p.z); grp.rotation.y = -track.h[k];
  const steel = toon({ color: PAL.orange });
  for (const z of [-W / 2 - 1.2, W / 2 + 1.2]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); c.position.set(0, 3.5, z); grp.add(c); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, W + 3), steel); beam.position.y = 7; grp.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.4), new THREE.MeshBasicMaterial({ map: canvas(1024, 144, (g, w, h) => { g.fillStyle = PAL.brown; g.fillRect(0, 0, w, h); g.fillStyle = PAL.mustard; fit(g, text, 84, '"Racing Sans One", "Barlow Condensed", sans-serif', w - 80); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 - 2); }), side: THREE.DoubleSide }));
  sign.position.set(-0.75, 7, 0); sign.rotation.y = -Math.PI / 2; grp.add(sign);
  return grp;
}

// ---------- cars ----------
// Each car is a smooth shell, the way an animator models a cartoon car: no flat panels and no corners. The body is
// lofted along the car, a rounded section at every step (a superellipse: a square with its corners blown round,
// flatter underneath), as wide as the car in the middle and closing in a round nose and tail. Its top follows the
// car's side view (bonnet, beltline, boot) with fat wings swelling over the wheels; its bottom rises over each wheel,
// so the tyres tuck up under the wings. The glasshouse is a second, narrower loft sitting on it, a bubble with the
// windows painted on: windscreen, side glass, rear window, the pillars and roof in the body colour, each pane with an
// ink line round it and a glint across it. Then round lights ringed in ink, a grille, rounded bumpers, mirrors, the wing or the roof
// box, fat round-shouldered tyres on chrome dishes, an ink outline and a soft shadow. Proportions come from the real
// length, width and height; the shape from the style. Toon shading and the ink do the rest.
//
// Profiles are shares of length from the back (0) to the front (1) and of height: `top` is the body's upper line, back
// to front; `cab` the glasshouse, from the bottom of the rear window round to the bottom of the windscreen; `wheels`
// the axles; `b` where the B-pillar stands, if it has one; `panel` paints the glasshouse solid back to there (a van's
// load bay).
const STYLE = {
  coupe:    { top: [[0, 0.4], [0.03, 0.54], [0.2, 0.6], [0.68, 0.6], [0.93, 0.5], [1, 0.38]], cab: [[0.1, 0.6], [0.42, 1], [0.56, 1], [0.7, 0.6]], wheels: [0.2, 0.81] },
  hatch:    { top: [[0, 0.5], [0.02, 0.62], [0.72, 0.64], [0.95, 0.54], [1, 0.44]], cab: [[0.02, 0.63], [0.13, 1], [0.56, 1], [0.74, 0.64]], wheels: [0.17, 0.81], b: 0.4 },
  sedan:    { top: [[0, 0.5], [0.02, 0.62], [0.2, 0.64], [0.7, 0.64], [0.95, 0.55], [1, 0.46]], cab: [[0.19, 0.64], [0.3, 1], [0.6, 1], [0.72, 0.64]], wheels: [0.18, 0.8], b: 0.46 },
  wagon:    { top: [[0, 0.52], [0.02, 0.62], [0.74, 0.62], [0.96, 0.56], [1, 0.48]], cab: [[0.02, 0.62], [0.03, 1], [0.64, 1], [0.76, 0.62]], wheels: [0.18, 0.8], b: 0.44 },
  van:      { top: [[0, 0.44], [0.01, 0.48], [0.84, 0.48], [0.97, 0.4], [1, 0.3]], cab: [[0.0, 0.48], [0.0, 1], [0.76, 1], [0.88, 0.48]], wheels: [0.16, 0.84], panel: 0.6 },
  roadster: { top: [[0, 0.5], [0.03, 0.66], [0.32, 0.68], [0.6, 0.68], [0.95, 0.56], [1, 0.46]], cab: null, wheels: [0.18, 0.82] },
  tiny:     { top: [[0, 0.5], [0.03, 0.6], [0.7, 0.6], [0.94, 0.54], [1, 0.46]], cab: [[0.04, 0.6], [0.09, 1], [0.6, 1], [0.75, 0.6]], wheels: [0.15, 0.84], b: 0.42 },
  // a 2-door Bronco with the top and doors off: a flat, square tub, a long flat bonnet, short overhangs; no glasshouse
  bronco:   { top: [[0, 0.5], [0.03, 0.55], [0.2, 0.56], [0.72, 0.56], [0.76, 0.6], [0.97, 0.6], [1, 0.52]], cab: null, wheels: [0.17, 0.81] },
  // a 911: high rear deck, a fastback roof, a low bonnet between the front wings
  gt3:      { top: [[0, 0.44], [0.03, 0.58], [0.16, 0.64], [0.3, 0.62], [0.62, 0.55], [0.84, 0.54], [0.96, 0.46], [1, 0.36]], cab: [[0.14, 0.62], [0.38, 1], [0.52, 1], [0.69, 0.55]], wheels: [0.19, 0.8] },
};
const lerpLine = (pts, x) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) || 1); } return pts[pts.length - 1][1]; };
// a profile sampled finely and blurred, so its corners round off: f from 0 to 1 -> value
function smooth(fn, blur, N = 160) {
  const raw = Array.from({ length: N + 1 }, (_, i) => fn(i / N)), out = new Float32Array(N + 1), r = Math.max(1, Math.round(blur * N));
  for (let i = 0; i <= N; i++) { let t = 0, w = 0; for (let j = -r; j <= r; j++) { const k = Math.max(0, Math.min(N, i + j)), q = 1 - Math.abs(j) / (r + 1); t += raw[k] * q; w += q; } out[i] = t / w; }
  return f => { const x = Math.max(0, Math.min(1, f)) * N, i = Math.min(N - 1, Math.floor(x)), t = x - i; return out[i] * (1 - t) + out[i + 1] * t; };
}
// a superellipse: the point at angle th on a rounded square of half-sizes a by b, exponent n (2 is an ellipse)
const se = (th, n) => { const c = Math.cos(th), s = Math.sin(th); return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)]; };
// a surface from a function of (u along, v around), U by V quads, with uvs; normals averaged across the seam
function loft(U, V, fn, closed = true) {
  const pos = new Float32Array((U + 1) * (V + 1) * 3), uv = new Float32Array((U + 1) * (V + 1) * 2), idx = [];
  for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) { const o = i * (V + 1) + j, p = fn(i / U, j / V); pos.set(p, o * 3); uv.set([i / U, j / V], o * 2); }
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) { const a = i * (V + 1) + j, b = a + V + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (closed) { const n = g.attributes.normal.array; for (let i = 0; i <= U; i++) { const a = i * (V + 1) * 3, b = (i * (V + 1) + V) * 3; for (let k = 0; k < 3; k++) n[a + k] = n[b + k] = (n[a + k] + n[b + k]) / 2; } }
  return g;
}
// one geometry from many, so a car is a handful of draw calls
function merge(geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0; for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return m;
}
// a side-view polygon extruded across the car with rounded edges, centred on z, width w
function slab(poly, w, bevel = 0.02) {
  const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(w - 2 * bevel) / 2); return g;
}
// a ball squashed to sizes sx, sy, sz, at (x, y, z), turned to face along the normal (nx, ny, nz)
const blob = (sx, sy, sz, x, y, z, nx = 1, ny = 0, nz = 0) => {
  const g = new THREE.SphereGeometry(0.5, 16, 12).scale(sx, sy, sz);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(nx, ny, nz).normalize())));
  return g.translate(x, y, z);
};
// a bar with round ends across the car, radius r, length w
const capsule = (r, w, x, y) => merge([new THREE.CylinderGeometry(r, r, w, 14).rotateX(Math.PI / 2), new THREE.SphereGeometry(r, 14, 10).translate(0, 0, w / 2), new THREE.SphereGeometry(r, 14, 10).translate(0, 0, -w / 2)]).translate(x, y, 0);
let shadowTex = null, plateTex = null;
// a stripe colour that stands out from the paint: cream on dark or saturated cars, orange on pale ones
const stripeFor = hex => { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.62 ? PAL.orange : PAL.cream; };
const lighter = (hex, t) => '#' + new THREE.Color(hex).lerp(new THREE.Color(0xffffff), t).getHexString();

export function carMesh(body) {
  const st = STYLE[body.style] || STYLE.hatch, L = body.len, Wd = body.wid, H = body.hgt;
  // the race kit (the GT3 RS): lower, bigger wheels, flared arches, one wide stripe, and the parts below
  const race = body.kit === 'race';
  // the Bronco kit: lifted high on huge tyres under black flares, square everywhere, the top and doors off
  const bronco = body.kit === 'bronco';
  const clear = race ? 0.12 : bronco ? 0.5 : 0.16, X = f => -L / 2 + f * L, Y = h => clear * 0.4 + h * (H - clear * 0.4);
  const grp = new THREE.Group(), inkParts = [];
  const wr = race ? Math.min(0.5, H * 0.36) : bronco ? 0.6 : Math.min(0.48, H * 0.33), wf = st.wheels;
  const stripes = body.style !== 'van', sc = body.stripe || stripeFor(body.color);

  // ---------- the body ----------
  // the top: the side view, with a wing swelling over each wheel, its corners rounded off
  const bell = (f, c, w) => { const d = Math.abs(f - c) / w; return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d); };
  const archW = wr * (bronco ? 1.35 : 1.5) / L, fender = wr * 2 + (race ? 0.1 : bronco ? 0.08 : 0.14);
  const top = smooth(f => { let y = Y(lerpLine(st.top, f)); for (const c of wf) y = Math.max(y, y + (fender - y) * bell(f, c, archW * 1.2)); return y; }, 0.035);
  // the bottom: a sill between the wheels, rising over each one to just above the axle, and up into the nose and tail
  const sill = clear + 0.07;
  const bottom = smooth(f => { let y = sill; for (const c of wf) y += (wr * 1.02 - sill) * bell(f, c, archW); return y; }, 0.02);
  // the plan: full width in the middle, a fat swelling over the wheels, a rounded nose and tail
  const pe = bronco ? 10 : 5, plan = f => (1 - Math.abs(2 * f - 1) ** pe) ** (1 / pe);
  const half = f => Wd / 2 * (1 + (race ? 0.1 : bronco ? 0.08 : 0.035) * Math.max(...wf.map(c => bell(f, c, archW * (race ? 1.5 : 1.3)))));
  // a 911's front wings stand up either side of a lower bonnet, so on the race kit the top of each section rises
  // toward its shoulders over the front of the car (the headlights sit on top of those wings)
  const wings = f => race ? 0.11 * bell(f, 0.86, 0.17) : 0;
  const bodyAt = (f, th) => {
    const p = plan(f), yt = top(f), yb = bottom(f), yc = (yt + yb) / 2 + (1 - p) * 0.04, hh = (yt - yb) / 2 * p ** 0.3;
    const up = Math.sin(th) > 0, [cz, cy] = se(th, bronco ? 7 : up ? 3 : 4.5);
    const tumble = up ? 1 - (bronco ? 0.02 : 0.07) * Math.sin(th) ** 2 : 1;
    const rise = up ? wings(f) * p * p * Math.exp(-(((Math.abs(cz) - 0.68) / 0.24) ** 2)) * Math.sin(th) : 0;
    return [X(f), yc + hh * cy + rise, -half(f) * p * cz * tumble];
  };
  // the girth of the body at f, for painting things their real size on a canvas that wraps round it
  const girth = f => { let g = 0, a = bodyAt(f, 0); for (let i = 1; i <= 48; i++) { const b = bodyAt(f, i / 48 * Math.PI * 2); g += Math.hypot(b[1] - a[1], b[2] - a[2]); a = b; } return g; };
  // the paint: the colour, a soft highlight along each shoulder, and the twin stripes over the top
  const bodyTex = canvas(race || bronco ? 512 : 256, race || bronco ? 256 : 128, (g, w, h) => {
    g.fillStyle = body.color; g.fillRect(0, 0, w, h);
    g.fillStyle = lighter(body.color, bronco ? 0.4 : 0.28);
    for (const v of [0.16, 0.34]) { round(g, w * 0.14, h * v - h / 64, w * 0.7, h / 32, h / 64); g.fill(); }
    if (bronco) broncoPaint(g, w, h);
    else if (stripes && !race) { g.fillStyle = sc; for (const v of [0.218, 0.262]) g.fillRect(0, h * v - h * 0.016, w, h * 0.032); }
    if (race) raceLivery(g, w, h);
  });
  // the Bronco's paint: the open tub dark inside between the windscreen and the tail, the door openings dark down the
  // sides (doors off), black flares round each wheel and black rock rails along the sills
  function broncoPaint(g, w, h) {
    const tub = '#1b1612';
    g.fillStyle = tub; round(g, w * 0.07, h * 0.16, w * 0.66, h * 0.18, h * 0.04); g.fill();
    for (const [a, b] of [[0.03, 0.12], [0.38, 0.47]]) { round(g, w * 0.36, h * a, w * 0.3, h * (b - a), h * 0.03); g.fill(); }
    g.fillStyle = '#111111';
    for (let x = 0; x < w; x += 2) { const f = (x + 1) / w, b = Math.max(...wf.map(c => bell(f, c, archW * 1.25))); if (b > 0.05) { const dv = 0.11 * b; for (const v of [0, 0.5]) g.fillRect(x, h * (v - dv), 2, h * dv * 2); g.fillRect(x, h * (1 - dv), 2, h * dv); } }
    for (const [a, b] of [[0.53, 0.58], [0.92, 0.97]]) g.fillRect(w * 0.22, h * a, w * 0.5, h * (b - a));
  }
  // the race livery, painted in the body's own coordinates (u along the car, v round it; the near side, z > 0, is
  // v 0.25 to 0.75): one wide stripe over the top, black sills, a pinstripe, bonnet vents, side vents and intakes, and
  // a roundel with the number on each door, the right way up from each side
  function raceLivery(g, w, h) {
    const ink = sc;
    // the stripe: 0.46 m wide all the way, so a share of the girth that grows as the body narrows toward the ends;
    // it runs from the tail's top edge to the bonnet's front edge, not down over the nose and tail themselves
    for (let x = Math.round(w * 0.05); x < w * 0.935; x += 2) { const dv = 0.23 / girth((x + 1) / w); g.fillStyle = ink; g.fillRect(x, h * (0.25 - dv), 2, h * dv * 2); g.fillStyle = lighter(sc, 0.35); g.fillRect(x, h * (0.25 - dv - 0.012), 2, 2); g.fillRect(x, h * (0.25 + dv + 0.012) - 2, 2, 2); }
    g.fillStyle = ink; for (const [a, b] of [[0.53, 0.575], [0.925, 0.97]]) g.fillRect(w * 0.12, h * a, w * 0.76, h * (b - a));
    for (const v of [0.035, 0.465]) g.fillRect(w * 0.2, h * v - 1.5, w * 0.6, 3);
    const slot = (u, v, sw, sh, n) => { g.fillStyle = '#151515'; round(g, w * u - sw / 2, h * v - sh / 2, sw, sh, Math.min(sw, sh) / 2.5); g.fill(); g.fillStyle = '#5a5f66'; for (let i = 1; i < n; i++) g.fillRect(w * u - sw / 2 + 4, h * v - sh / 2 + sh * i / n - 1, sw - 8, 2); };
    for (const v of [0.172, 0.328]) slot(0.86, v, w * 0.07, h * 0.06, 4);        // bonnet vents
    for (const v of [0.02, 0.48]) { slot(0.68, v, w * 0.035, h * 0.05, 3); slot(0.3, v, w * 0.07, h * 0.045, 3); }   // vents behind the front wheels, intakes ahead of the rear
    // the roundels: round on the car, so squashed here by the body's own stretch (u spans the length, v the girth)
    const ru = 0.5, rw = w * 0.42 / L, rh = h * 0.42 / girth(ru);
    for (const [v, flip] of [[0.444, false], [0.056, true]]) {
      g.save(); g.translate(w * ru, h * v); if (flip) g.rotate(Math.PI); g.scale(1, rh / rw);
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(0, 0, rw / 2, 0, 7); g.fill(); g.lineWidth = rw * 0.06; g.strokeStyle = '#151515'; g.stroke();
      g.fillStyle = '#151515'; g.font = `${Math.round(rw * 0.62)}px Bungee, "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(body.number || '', 0, rw * 0.04);
      g.restore();
    }
  }
  bodyTex.flipY = false;
  const bodyGeo = loft(64, 48, (u, v) => bodyAt(u, v * Math.PI * 2));
  const paint = toon({ map: bodyTex });
  const shell = new THREE.Mesh(bodyGeo, paint); shell.castShadow = true; grp.add(shell); inkParts.push(bodyGeo);
  const surf = (f, th) => new THREE.Vector3(...bodyAt(f, th));
  const normal = (f, th) => { const a = surf(f, th), b = surf(f + 0.004, th), c = surf(f, th + 0.01); return b.sub(a).cross(c.sub(a)).normalize(); };

  // ---------- the glasshouse ----------
  const trim = toon({ color: body.trim }), black = toon({ color: 0x2b2420 }), chrome = toon({ color: 0xe4ded2 });
  const trimBits = [], blackBits = [], chromeBits = [], mirrorBits = [], rimBits = [];
  if (bronco) broncoCabin();
  else if (st.cab) {
    const [c0, c1, c2, c3] = st.cab, f0 = c0[0], f3 = c3[0];
    const roof = smooth(f => Y(lerpLine([[f0 - 0.001, c0[1]], [c1[0], c1[1]], [c2[0], c2[1]], [f3 + 0.001, c3[1]]], f0 + f * (f3 - f0))), 0.06);
    const cabAt = (u, th) => {
      const f = f0 + u * (f3 - f0), base = top(f) - 0.05, hc = Math.max(0, roof(u) - base) * (1 - Math.abs(2 * u - 1) ** 8) ** 0.2;
      const [cz, cy] = se(th, 2.6), w = half(f) * plan(f) * 0.88 * (1 - Math.abs(2 * u - 1) ** 6) ** (1 / 6);
      return [X(f), base + hc * cy, -w * cz * (1 - 0.16 * Math.sin(th) ** 2)];
    };
    // the panes, painted on: u along the glasshouse, v round it from one sill over the roof to the other
    const fu = f => (f - f0) / (f3 - f0), r1 = fu(c1[0]), r2 = fu(c2[0]);
    const cabTex = canvas(384, 192, (g, w, h) => {
      g.fillStyle = body.color; g.fillRect(0, 0, w, h);
      const pane = (u0, u1, v0, v1) => {
        if (u1 - u0 < 0.02) return;
        const x = u0 * w, y = v0 * h, pw = (u1 - u0) * w, ph = (v1 - v0) * h;
        round(g, x, y, pw, ph, Math.min(14, ph / 3)); g.fillStyle = '#8fd0e6'; g.fill();
        g.save(); g.clip();
        // a roll cage seen through the glass: a hoop and a diagonal in the accent colour
        if (race) { g.strokeStyle = sc; g.lineWidth = Math.max(3, ph * 0.07); g.beginPath(); g.moveTo(x + pw * 0.3, y + ph); g.lineTo(x + pw * 0.75, y); g.moveTo(x + pw * 0.12, y); g.lineTo(x + pw * 0.12, y + ph); g.moveTo(x + pw * 0.88, y); g.lineTo(x + pw * 0.88, y + ph); g.stroke(); }
        g.fillStyle = '#e9fbff'; g.translate(x + pw * 0.4, y + ph / 2); g.rotate(-0.5); g.fillRect(-pw, -ph * 0.14, pw * 2, ph * 0.12); g.fillRect(-pw, ph * 0.06, pw * 2, ph * 0.05); g.restore();
        g.strokeStyle = PAL.ink; g.lineWidth = 2.5; round(g, x, y, pw, ph, Math.min(14, ph / 3)); g.stroke();
      };
      // side glass, either side, split at the B-pillar, and solid behind a van's panel
      const s0 = st.panel ? fu(st.panel) + 0.01 : 0.05, s1 = 0.97, b = st.b ? fu(st.b) : null;
      for (const [v0, v1] of [[0.07, 0.29], [0.71, 0.93]]) {
        if (b != null) { pane(s0, b - 0.025, v0, v1); pane(b + 0.025, s1, v0, v1); } else pane(s0, s1, v0, v1);
      }
      // the windscreen over the front slope, the rear window over the back one
      pane(r2 + 0.015, 0.985, 0.34, 0.66);
      // a sun strip across the top of the windscreen, its words read from in front of the car
      if (race) {
        const x = (r2 + 0.015) * w, sw = w * 0.07, y0 = h * 0.35, y1 = h * 0.65;
        g.fillStyle = sc; g.fillRect(x, y0, sw, y1 - y0);
        g.save(); g.translate(x + sw / 2, (y0 + y1) / 2); g.rotate(-Math.PI / 2); g.fillStyle = '#f4f1ea'; g.font = `${Math.round(sw * 0.62)}px Bungee, "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RING KART', 0, 1); g.restore();
      }
      if (!st.panel) pane(0.02, Math.max(0.05, r1 - 0.015), 0.35, 0.65);
      if (stripes && !race) { g.fillStyle = sc; for (const v of [0.455, 0.545]) g.fillRect(r1 * w, h * v - h * 0.025, (r2 - r1) * w, h * 0.05); }
      if (race) { g.fillStyle = sc; g.fillRect(r1 * w - 6, h * 0.42, (r2 - r1) * w + 12, h * 0.16); }
    });
    cabTex.flipY = false;
    const cabGeo = loft(48, 32, (u, v) => cabAt(u, v * Math.PI), false);
    const cab = new THREE.Mesh(cabGeo, toon({ map: cabTex })); cab.castShadow = true; grp.add(cab); inkParts.push(cabGeo);
    // door mirrors at the foot of the windscreen: little round blobs on stalks
    const fm = c3[0] - 0.05, ym = top(fm) + 0.06;
    for (const s of [-1, 1]) mirrorBits.push(blob(0.12, 0.09, 0.12, X(fm), ym, s * half(fm) * plan(fm) * 0.9));
  } else {
    // a roadster: a windscreen in a rounded frame, two seats, the driver's head
    const xs = X(0.6), ys = top(0.6);
    const wt = ys + 0.3, ws = [[xs - 0.02, ys], [xs, ys], [xs - 0.24, wt], [xs - 0.27, wt]];
    grp.add(new THREE.Mesh(slab(ws, Wd * 0.74, 0.015), toon({ color: 0x8fd0e6 })));
    trimBits.push(slab([[xs - 0.28, wt - 0.04], [xs - 0.22, wt - 0.04], [xs - 0.23, wt + 0.01], [xs - 0.28, wt + 0.01]], Wd * 0.76, 0.02));
    for (const s of [-1, 1]) blackBits.push(blob(0.42, 0.5, 0.48, X(0.42), ys + 0.12, s * Wd * 0.22));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), toon({ color: 0x6b3e1e })); head.position.set(X(0.4), ys + 0.46, Wd * 0.22); grp.add(head);
  }

  // ---------- lights, grille, bumpers, exhaust, plates ----------
  const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.3) }), tail = new THREE.MeshBasicMaterial({ color: col(0xa3101c) });
  grp.tail = tail;   // the page lights it up under braking
  const heads = [], tails = [];
  // round headlights set into the nose, round tail lights into the tail, each a squashed ball on the surface
  const lamp = (f, th, size, list) => { const p = surf(f, th), n = normal(f, th); if (n.x * (f > 0.5 ? 1 : -1) < 0) n.negate(); list.push(blob(size * 0.35, size, size, p.x - n.x * 0.02, p.y - n.y * 0.02, p.z - n.z * 0.02, n.x, n.y, n.z)); };
  const LAMP = [0.95, Math.PI - 0.95];   // either side, up on the shoulder of the nose and the tail
  // a 911's frog eyes sit high on the front wings, big and round, with a dark ring inside
  const hf = race ? 0.93 : 0.982, hth = bronco ? [] : race ? [1.0, Math.PI - 1.0] : LAMP, hs = race ? Math.min(0.38, H * 0.29) : Math.min(0.34, H * 0.24), lens = [];
  for (const th of hth) lamp(hf, th, hs, heads);
  if (!bronco) for (const th of LAMP) lamp(0.018, th, Math.min(0.26, H * 0.18), tails);
  if (bronco) broncoLights(heads, tails, lens);
  // a rim round each headlight, in ink, and for the frog eyes an inner ring
  for (const th of hth) {
    const p = surf(hf, th), n = normal(hf, th); if (n.x < 0) n.negate();
    rimBits.push(blob(0.08, hs * 1.18, hs * 1.18, p.x - n.x * 0.04, p.y - n.y * 0.04, p.z - n.z * 0.04, n.x, n.y, n.z));
    if (race) lens.push(blob(0.05, hs * 0.55, hs * 0.55, p.x + n.x * 0.045, p.y + n.y * 0.045, p.z + n.z * 0.045, n.x, n.y, n.z));
  }
  // and a light bar across the tail, which glows with the round ones under braking
  if (race) tails.push(capsule(0.03, Wd * 0.72, X(0.012), top(0.03) - 0.1));
  grp.add(new THREE.Mesh(merge(heads), headM), new THREE.Mesh(merge(tails), tail), new THREE.Mesh(merge(rimBits), toon({ color: PAL.ink })));
  // the right indicators, front and back corner (+z is the car's right), which the page flashes amber
  const blinkM = new THREE.MeshBasicMaterial({ color: col(0x8a4a10) }); grp.blink = blinkM;
  grp.add(new THREE.Mesh(merge([0.97, 0.03].map(f => { const th = f > 0.5 ? Math.PI - 0.25 : Math.PI - 0.3, p = surf(f, th), n = normal(f, th); if (n.z < 0) n.negate(); return blob(0.05, 0.08, 0.14, p.x, p.y, p.z, n.x, n.y, n.z); })), blinkM));
  if (lens.length) grp.add(new THREE.Mesh(merge(lens), toon({ color: 0x6f8794 })));
  const noseB = bottom(0.97), tailB = bottom(0.03);
  if (bronco) broncoEnds();
  else if (race) {
    // a wide mouth with intakes at its corners, a splitter jutting out under it and canards on the corners
    const my = noseB + (top(0.97) - noseB) * 0.34;
    blackBits.push(blob(0.16, Math.max(0.16, (top(0.97) - noseB) * 0.42), Wd * 0.5, X(1) - 0.04, my, 0));
    for (const s of [-1, 1]) blackBits.push(blob(0.14, 0.18, Wd * 0.16, X(0.985) - 0.04, my - 0.02, s * Wd * 0.33));
    blackBits.push(blob(0.42, 0.06, Wd * 1.02, X(1) - 0.02, noseB - 0.01, 0));
    for (const s of [-1, 1]) for (const dy of [0.04]) blackBits.push(slab([[X(0.93), my - 0.04 + dy], [X(1) - 0.02, my - 0.1 + dy], [X(1) - 0.02, my - 0.07 + dy], [X(0.93), my - 0.01 + dy]], 0.03, 0.008).translate(0, 0, s * (half(0.95) * plan(0.95) + 0.01)));
    blackBits.push(capsule(0.05, Wd * 0.7, X(0.015), tailB + 0.04));
    // twin exhausts in the middle of the tail
    for (const s of [-1, 1]) chromeBits.push(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 14).rotateZ(Math.PI / 2).translate(X(0) + 0.03, tailB + 0.1, s * 0.12));
  } else {
    blackBits.push(blob(0.12, Math.max(0.12, (top(0.97) - noseB) * 0.32), Wd * 0.42, X(1) - 0.03, noseB + (top(0.97) - noseB) * 0.32, 0));
    // a slim rounded lip under the nose and the tail
    blackBits.push(capsule(0.05, Wd * 0.6, X(0.985), noseB + 0.04), capsule(0.05, Wd * 0.6, X(0.015), tailB + 0.04));
  }
  if (!race && !bronco) chromeBits.push(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12).rotateZ(Math.PI / 2).translate(X(0) + 0.02, tailB + 0.02, Wd * 0.26));
  // the underside between the wheels, so nothing shows through under the car
  blackBits.push(new THREE.BoxGeometry(L * 0.86, 0.12, Wd * 0.7).translate(0, wr * 0.95, 0));
  if (!plateTex) plateTex = canvas(128, 28, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d3f9a'; g.fillRect(0, 0, 14, h); g.strokeStyle = '#222'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(22 + i * 16, 7, 10, 14); });
  const plate = new THREE.MeshBasicMaterial({ map: plateTex });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.1), plate); p.position.set(s * (L / 2 + 0.105), (s > 0 ? noseB : tailB) + 0.1, 0); p.rotation.y = s * Math.PI / 2; grp.add(p); }

  // ---------- the wing, the roof box ----------
  if (body.wing === 'swan') {
    // a GT3 RS's wing: a big plane hung from swan necks that rise over it, tall end plates, and the DRS flap above
    // its trailing edge, on a pivot of its own so the page can open it
    const tailY = top(0.05), wy = Math.max(H * 1.05, tailY + 0.5), wxp = X(0.08), span = Wd * 0.98;
    trimBits.push(slab([[wxp - 0.24, wy + 0.02], [wxp + 0.24, wy + 0.06], [wxp + 0.24, wy + 0.1], [wxp - 0.24, wy + 0.07]], span, 0.02));
    for (const s of [-1, 1]) {
      trimBits.push(slab([[wxp - 0.3, wy - 0.06], [wxp + 0.26, wy - 0.02], [wxp + 0.26, wy + 0.2], [wxp - 0.3, wy + 0.26]], 0.035, 0.012).translate(0, 0, s * span / 2));
      // the neck: up from the deck behind the engine cover, over the plane, and down onto its top
      trimBits.push(slab([[wxp + 0.12, tailY - 0.04], [wxp + 0.22, tailY - 0.04], [wxp + 0.2, wy + 0.2], [wxp + 0.02, wy + 0.24], [wxp - 0.02, wy + 0.08], [wxp + 0.04, wy + 0.08], [wxp + 0.07, wy + 0.16], [wxp + 0.13, wy + 0.13]], 0.04, 0.012).translate(0, 0, s * Wd * 0.22));
    }
    const flap = new THREE.Group(); flap.position.set(wxp - 0.08, wy + 0.13, 0);
    const fg = slab([[-0.2, 0.09], [0, 0], [0, 0.03], [-0.2, 0.12]], span - 0.06, 0.012);
    const fm = new THREE.Mesh(fg, trim); fm.castShadow = true; flap.add(fm, new THREE.Mesh(inkNormals(fg.clone()), inkMat(0.03)));
    grp.add(flap); grp.flap = flap;
  } else if (body.wing) {
    const tailY = top(0.04), wy = Math.max(H * 0.84, tailY + 0.34), wxp = X(0.07);
    // a slim plane on two swan necks, with small round-cornered end plates
    trimBits.push(slab([[wxp - 0.2, wy], [wxp + 0.17, wy + 0.035], [wxp + 0.17, wy + 0.065], [wxp - 0.2, wy + 0.04]], Wd * 0.84, 0.015));
    for (const s of [-1, 1]) trimBits.push(slab([[wxp - 0.16, wy - 0.03], [wxp + 0.17, wy], [wxp + 0.17, wy + 0.11], [wxp - 0.16, wy + 0.08]], 0.03, 0.01).translate(0, 0, s * Wd * 0.42), slab([[wxp + 0.02, tailY - 0.05], [wxp + 0.09, tailY - 0.05], [wxp + 0.07, wy + 0.04], [wxp + 0.03, wy + 0.04]], 0.04, 0.01).translate(0, 0, s * Wd * 0.2));
  }
  if (body.roofbox) blackBits.push(blob(1.8, 0.36, 0.92, X(0.4), H + 0.22, 0), new THREE.BoxGeometry(0.06, 0.08, Wd * 0.78).translate(X(0.27), H + 0.03, 0), new THREE.BoxGeometry(0.06, 0.08, Wd * 0.78).translate(X(0.53), H + 0.03, 0));

  for (const [bits, mat] of [[trimBits, trim], [blackBits, black], [chromeBits, chrome], [mirrorBits, toon({ color: body.color })]]) if (bits.length) { const m = new THREE.Mesh(merge(bits), mat); m.castShadow = true; grp.add(m); inkParts.push(m.geometry); }
  // the ink outline round the whole car
  grp.ink = new THREE.Mesh(inkNormals(merge(inkParts)), inkMat(0.035)); grp.add(grp.ink);   // the page hides it when the camera sits inside it, on the bonnet

  // ---------- wheels: a fat tyre with round shoulders, a chrome dish, five slots ----------
  const tw = bronco ? 0.46 : 0.3, prof = [], fancy = race || bronco;
  // the tyre's cross-section, turned round the axle: a rounded rectangle from the rim out to the tread
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * i / 12, rr = bronco ? 0.11 : 0.075; prof.push(new THREE.Vector2(wr - rr + Math.cos(a) * rr, Math.sin(a) * (tw / 2 - 0.02) * 0.9 + Math.sign(Math.sin(a)) * 0.0)); }
  prof.unshift(new THREE.Vector2(wr * 0.62, -tw / 2 + 0.03)); prof.push(new THREE.Vector2(wr * 0.62, tw / 2 - 0.03));
  let tyreG = new THREE.LatheGeometry(prof, 24).rotateX(Math.PI / 2);
  // mud-terrain tyres: chunky tread blocks all round, staggered side to side
  if (bronco) tyreG = merge([tyreG, ...Array.from({ length: 22 }, (_, i) => new THREE.BoxGeometry(0.13, 0.06, tw * 0.42).translate(0, wr + 0.005, (i % 2 ? 1 : -1) * tw * 0.2).rotateZ(i * Math.PI * 2 / 22))]);
  const rimG = new THREE.CylinderGeometry(wr * 0.64, wr * 0.6, 0.06, 20).rotateX(Math.PI / 2).translate(0, 0, tw / 2 - 0.04);
  const capG = new THREE.SphereGeometry(wr * 0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, tw / 2 - 0.02);
  const slotG = merge([0, 1, 2, 3, 4].map(i => new THREE.BoxGeometry(wr * 0.13, wr * 0.22, 0.02).translate(0, wr * 0.4, tw / 2 - 0.005).rotateZ(i * Math.PI * 2 / 5)));
  const tyre = toon({ color: 0x2b2420, side: THREE.DoubleSide }), slot = toon({ color: 0x5a4a3a }), hub = toon({ color: body.trim === '#111111' || body.trim === '#1a1a1a' ? 0xd6d2c8 : body.trim });
  // the race kit's wheels: five fat spokes in the rim colour on a dark dish, inside a bright lip, and a centre lock
  const rimMat = fancy ? toon({ color: 0x0d0d0d }) : chrome, spokeG = fancy ? merge([0, 1, 2, 3, 4].map(i => new THREE.BoxGeometry(wr * 0.16, wr * 0.5, 0.03).translate(0, wr * 0.3, tw / 2 - 0.01).rotateZ(i * Math.PI * 2 / 5))) : slotG;
  const lipG = new THREE.RingGeometry(wr * 0.58, wr * 0.66, 28).translate(0, 0, tw / 2 - 0.005);
  const spoke = fancy ? toon({ color: body.rims || 0x3a3d42 }) : slot, lip = toon({ color: 0xd6d2c8, side: THREE.DoubleSide });
  const tyreInk = inkMat(0.03), tyreInkG = inkNormals(tyreG.clone());
  grp.wheels = [];
  for (const [f, s] of [[wf[1], 1], [wf[1], -1], [wf[0], 1], [wf[0], -1]]) {
    const w = new THREE.Group(); w.position.set(X(f), wr, s * (fancy ? half(f) * plan(f) - tw / 2 + (bronco ? 0.05 : 0.01) : Wd / 2 - tw / 2 - 0.02));
    const face = new THREE.Group(); face.add(new THREE.Mesh(rimG, rimMat), new THREE.Mesh(capG, fancy ? spoke : hub), new THREE.Mesh(spokeG, spoke)); if (fancy) face.add(new THREE.Mesh(lipG, lip)); if (s < 0) face.rotation.y = Math.PI;
    w.add(new THREE.Mesh(tyreG, tyre), new THREE.Mesh(tyreInkG, tyreInk), face); grp.add(w); grp.wheels.push(w);
  }
  // the Bronco's spare, the same big wheel, on the tailgate
  if (bronco) {
    const sp = new THREE.Group(), face = new THREE.Group(); face.add(new THREE.Mesh(rimG, rimMat), new THREE.Mesh(capG, spoke), new THREE.Mesh(spokeG, spoke), new THREE.Mesh(lipG, lip));
    sp.add(new THREE.Mesh(tyreG, tyre), new THREE.Mesh(tyreInkG, tyreInk), face); sp.rotation.y = -Math.PI / 2; sp.scale.setScalar(0.92);
    sp.position.set(backX(0, top(0.05) - 0.3) - tw * 0.46, top(0.05) - 0.3, 0); grp.add(sp);
  }

  // ---------- the Bronco: the open cabin, the family, the cage and the board, the face and the tail ----------
  // where the body's surface is, front and back, at a height and a sideways offset (the square nose is not at X(1))
  function inside(f, z, y) { const p = plan(f), yt = top(f), yb = bottom(f), yc = (yt + yb) / 2 + (1 - p) * 0.04, hh = (yt - yb) / 2 * p ** 0.3, a = half(f) * p; return a > 0 && hh > 0 && (Math.abs(z) / a) ** 7 + (Math.abs(y - yc) / hh) ** 7 <= 1; }
  function faceX(z, y) { for (let f = 1; f > 0.5; f -= 0.002) if (inside(f, z, y)) return X(f); return X(0.95); }
  function backX(z, y) { for (let f = 0; f < 0.5; f += 0.002) if (inside(f, z, y)) return X(f); return X(0.05); }
  function broncoLights(heads, tails, lens) {
    // round headlights at the ends of the grille, each in a white ring, and tall tail lights on the back corners
    const yl = top(0.97) - 0.2, fx = faceX(Wd * 0.32, yl);
    for (const s of [-1, 1]) {
      rimBits.push(blob(0.05, 0.3, 0.3, fx + 0.03, yl, s * Wd * 0.32));
      lens.push(blob(0.05, 0.25, 0.25, fx + 0.05, yl, s * Wd * 0.32));
      heads.push(blob(0.05, 0.17, 0.17, fx + 0.07, yl, s * Wd * 0.32));
      tails.push(blob(0.06, 0.34, 0.12, backX(Wd * 0.43, top(0.03) - 0.24) - 0.01, top(0.03) - 0.24, s * Wd * 0.43));
    }
  }
  function broncoEnds() {
    // the face: a wide black grille between the lights; a steel bumper with red tow hooks and a skid plate under it
    const yl = top(0.97) - 0.2, fx = faceX(0, yl);
    blackBits.push(blob(0.08, 0.34, Wd * 0.86, fx + 0.01, yl, 0));
    blackBits.push(capsule(0.11, Wd * 0.9, faceX(0, bottom(0.97) + 0.12) + 0.1, bottom(0.97) + 0.08), blob(0.5, 0.06, Wd * 0.6, faceX(0, bottom(0.97) + 0.12) - 0.1, bottom(0.97) - 0.06, 0));
    for (const s of [-1, 1]) chromeBits.push(new THREE.TorusGeometry(0.06, 0.022, 6, 12).rotateY(Math.PI / 2).translate(faceX(0, bottom(0.97) + 0.12) + 0.2, bottom(0.97) + 0.08, s * Wd * 0.3));
    blackBits.push(capsule(0.1, Wd * 0.9, backX(0, bottom(0.03) + 0.12) - 0.08, bottom(0.03) + 0.08));
    // rock rails along the sills
    for (const s of [-1, 1]) blackBits.push(new THREE.CylinderGeometry(0.06, 0.06, L * 0.36, 10).rotateZ(Math.PI / 2).translate(X(0.49), bottom(0.49) - 0.02, s * half(0.49) * 0.96));
  }
  function tube(a, b, r = 0.04, list = blackBits) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), 8);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())));
    list.push(g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2));
  }
  function broncoCabin() {
    const belt = top(0.5), wsx = X(0.72), cageTop = belt + 0.74, cz = Wd / 2 * 0.8, bx = X(0.47), cx = X(0.19);
    // the windscreen in its frame, nearly upright, and mirrors on its hinges
    const glass = new THREE.MeshBasicMaterial({ color: col(0xbfe8f2), transparent: true, opacity: 0.28, depthWrite: false });
    const gl = new THREE.BoxGeometry(0.03, cageTop - belt - 0.1, cz * 2 - 0.1).rotateZ(0.12).translate(wsx - 0.04, (belt + cageTop) / 2, 0);
    const gm = new THREE.Mesh(gl, glass); grp.add(gm);
    for (const s of [-1, 1]) { tube([wsx, belt, s * cz], [wsx - 0.1, cageTop, s * cz], 0.045); blackBits.push(blob(0.08, 0.12, 0.18, wsx + 0.02, belt + 0.06, s * (cz + 0.18))); }
    tube([wsx - 0.1, cageTop, -cz], [wsx - 0.1, cageTop, cz], 0.05); tube([wsx, belt + 0.02, -cz], [wsx, belt + 0.02, cz], 0.04);
    // the roll cage: a hoop behind the front seats, one at the back, rails along the top
    for (const [x, t] of [[bx, cageTop], [cx, cageTop - 0.06]]) { for (const s of [-1, 1]) tube([x, belt - 0.05, s * cz], [x, t, s * cz]); tube([x, t, -cz], [x, t, cz]); }
    for (const s of [-1, 1]) { tube([wsx - 0.1, cageTop, s * cz], [bx, cageTop, s * cz]); tube([bx, cageTop, s * cz], [cx, cageTop - 0.06, s * cz]); }
    // seats, a wheel for Dad
    for (const [x, z] of [[X(0.55), -0.45], [X(0.55), 0.45], [X(0.33), -0.5], [X(0.33), 0], [X(0.33), 0.5]]) blackBits.push(blob(0.16, 0.42, 0.44, x - 0.2, belt + 0.02, z));
    blackBits.push(new THREE.TorusGeometry(0.17, 0.025, 6, 20).rotateY(Math.PI / 2).rotateZ(-0.5).translate(X(0.62), belt + 0.2, -0.45));
    // the family: Dad driving, Mum beside him, and in the back the three kids
    const ppl = {};
    const put = (hex, g) => (ppl[hex] = ppl[hex] || []).push(g);
    const SKIN = ['#f1c7a5', '#e0ad86', '#f0c4a0', '#dba67e', '#efc29c'];
    const FAMILY = [
      { x: X(0.55), z: -0.45, s: 1, skin: SKIN[0], hair: '#8f8a84', top: '#5b7fb5', cut: 'short', grey: true, wheel: true },
      { x: X(0.55), z: 0.45, s: 0.95, skin: SKIN[1], hair: '#1f1a17', top: '#e2553a', cut: 'bun', hoops: true },
      { x: X(0.33), z: -0.5, s: 0.88, skin: SKIN[2], hair: '#7a4e2d', top: '#a9bde0', cut: 'long', stripes: true },
      { x: X(0.33), z: 0, s: 0.8, skin: SKIN[3], hair: '#16120f', top: '#ef7d3a', cut: 'short' },
      { x: X(0.33), z: 0.5, s: 0.74, skin: SKIN[4], hair: '#8a5a33', top: '#f29a3e', cut: 'shoulder', flowers: true },
    ];
    for (const p of FAMILY) {
      const s = p.s, y0 = belt + 0.05 + (1 - s) * 0.12, hr = 0.17 * (0.78 + 0.22 * s), hy = y0 + 0.42 * s + hr;
      put(p.top, blob(0.3 * s, 0.5 * s, 0.42 * s, p.x, y0 + 0.12 * s, p.z));
      for (const k of [-1, 1]) put(p.top, blob(0.14 * s, 0.14 * s, 0.14 * s, p.x, y0 + 0.3 * s, p.z + k * 0.22 * s));
      if (p.stripes) for (const k of [-0.1, 0, 0.1]) put('#ffffff', blob(0.02, 0.4 * s, 0.025, p.x + 0.15 * s, y0 + 0.1 * s, p.z + k * s));
      if (p.flowers) for (const [dy, dz, c] of [[0.05, -0.08, '#ffd23f'], [0.15, 0.07, '#ff6fa0'], [-0.02, 0.1, '#ffd23f'], [0.2, -0.06, '#ff6fa0']]) put(c, blob(0.03, 0.05, 0.05, p.x + 0.15 * s, y0 + dy * s + 0.08, p.z + dz * s));
      // arms reaching forward: to the wheel for Dad, resting for everyone else
      for (const k of [-1, 1]) { const hand = p.wheel ? [X(0.62) - 0.02, belt + 0.26 + k * -0.06, p.z + k * 0.13] : [p.x + 0.22 * s, y0 + 0.1 * s, p.z + k * 0.2 * s]; put(p.top, blob(0.12 * s, 0.12 * s, 0.12 * s, p.x + 0.05 * s, y0 + 0.24 * s, p.z + k * 0.22 * s)); tube([p.x + 0.05 * s, y0 + 0.24 * s, p.z + k * 0.22 * s], hand, 0.045 * s, ppl[p.skin] = ppl[p.skin] || []); put(p.skin, blob(0.08 * s, 0.08 * s, 0.08 * s, ...hand)); }
      put(p.skin, blob(0.1 * s, 0.12 * s, 0.1 * s, p.x, y0 + 0.4 * s, p.z));
      put(p.skin, blob(hr * 2, hr * 2.15, hr * 2, p.x, hy, p.z));
      for (const k of [-1, 1]) put(p.skin, blob(0.05, 0.07, 0.04, p.x, hy, p.z + k * hr * 1.02));
      // a cartoon face toward the front: big eyes, a smile
      for (const k of [-1, 1]) { put('#ffffff', blob(0.03, hr * 0.42, hr * 0.32, p.x + hr * 0.92, hy + hr * 0.12, p.z + k * hr * 0.36)); put('#2a1a0e', blob(0.03, hr * 0.22, hr * 0.17, p.x + hr * 0.98, hy + hr * 0.1, p.z + k * hr * 0.34)); }
      put('#8a3b2a', new THREE.TorusGeometry(hr * 0.34, 0.012, 6, 10, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).translate(p.x + hr * 0.95, hy - hr * 0.38, p.z));
      // hair
      put(p.hair, new THREE.SphereGeometry(hr * 1.07, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(1.02, 1.08, 1).rotateZ(0.35).translate(p.x - 0.01, hy + 0.01, p.z));
      if (p.cut === 'bun') put(p.hair, new THREE.SphereGeometry(hr * 0.5, 12, 10).translate(p.x - hr * 0.35, hy + hr * 1.05, p.z));
      if (p.cut === 'long') put(p.hair, blob(hr * 0.9, hr * 2.8, hr * 1.9, p.x - hr * 0.6, hy - hr * 0.9, p.z));
      if (p.cut === 'shoulder') put(p.hair, blob(hr * 0.8, hr * 1.8, hr * 1.9, p.x - hr * 0.6, hy - hr * 0.45, p.z));
      if (p.grey) put('#b8b2aa', blob(hr * 0.6, hr * 0.7, hr * 2.1, p.x - hr * 0.3, hy - hr * 0.05, p.z));
      if (p.hoops) for (const k of [-1, 1]) put('#e2b13c', new THREE.TorusGeometry(0.035, 0.008, 6, 12).translate(p.x, hy - hr * 0.55, p.z + k * hr * 1.02));
    }
    for (const [hex, list] of Object.entries(ppl)) { const g = merge(list); grp.add(new THREE.Mesh(g, toon({ color: hex }))); inkParts.push(g); }
    // the surfboard, strapped along the top of the cage, nose forward; on its own pivot at the tail so DRS lifts its nose
    const bl = 2.7, board = new THREE.Group(); board.position.set(X(0.27) - 0.25, cageTop + 0.08, 0);
    const deck = canvas(256, 64, (g, w, h) => { g.fillStyle = '#f6ecd2'; g.fillRect(0, 0, w, h); for (const [c, y, t] of [['#2f9c9a', 0.5, 0.16], ['#ec6f2b', 0.3, 0.05], ['#ec6f2b', 0.7, 0.05], ['#f2b631', 0.2, 0.03], ['#f2b631', 0.8, 0.03]]) { g.fillStyle = c; g.fillRect(0, h * (y - t / 2), w, h * t); } });
    const bg = new THREE.SphereGeometry(0.5, 28, 10).scale(bl, 0.085, 0.6).translate(bl / 2, 0, 0);
    const bm = new THREE.Mesh(bg, toon({ map: deck })); board.add(bm, new THREE.Mesh(inkNormals(bg.clone()), inkMat(0.025)));
    board.add(new THREE.Mesh(slab([[0.15, -0.03], [0.4, -0.03], [0.2, -0.22]], 0.02, 0.006), toon({ color: '#2f9c9a' })));
    for (const x of [bx, cx]) board.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.66).translate(x - board.position.x, -0.02, 0), toon({ color: 0x1a1a1a })));
    grp.add(board); grp.flap = board; grp.flapOpen = 0.12;
  }

  // ---------- a cartoon shadow: a flat oval with a soft edge ----------
  if (!shadowTex) shadowTex = canvas(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(42,26,14,0.5)'); r.addColorStop(1, 'rgba(42,26,14,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.15, Wd * 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.y = 0.04; shadow.renderOrder = 1; grp.add(shadow);
  return grp;
}
