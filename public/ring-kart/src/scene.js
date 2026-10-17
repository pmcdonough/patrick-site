// Everything you see, drawn like a 1970s Saturday-morning cartoon: a turquoise sky over a striped sun and painted
// hills, puffy clouds, lollipop trees and spruces in ink outlines, a patchwork of fields, the road with its kerbs,
// Armco, catch fences and painted tarmac, the gate and the gantry, corner boards, and the cars, each drawn from a side
// view to its own proportions, with racing stripes. Everything is cel-shaded (three flat bands of light, no gradients)
// and the cars and trees carry a brown ink outline. Three.js r128, the copy Cathedral Lab keeps on the site.
import * as THREE from '../../cathedral-lab/src/vendor/three.module.js?v=0.11';
import { pointAt } from './track.js?v=0.6';

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

export function buildWorld(scene, track) {
  const W = track.width, half = W / 2, n = track.n;
  const group = new THREE.Group(); scene.add(group);

  // ---------- road ----------
  const road = ribbon(track, k => [-half, half], 0.02, (k, side) => [side, k * track.ds / 10]);
  road.material = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: asphalt() });
  road.material.map.wrapS = road.material.map.wrapT = THREE.RepeatWrapping;
  road.receiveShadow = true; group.add(road);
  // grass verge out to the Armco and a little past it
  for (const side of [-1, 1]) {
    const verge = ribbon(track, k => side > 0 ? [half, (side > 0 ? track.wallR[k] : track.wallL[k]) + 3] : [-(track.wallL[k] + 3), -half], -0.02, (k, s) => [s, k * track.ds / 6]);
    verge.material = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: grassTex() });
    verge.material.map.wrapS = verge.material.map.wrapT = THREE.RepeatWrapping;
    group.add(verge);
  }
  // kerbs on the inside of the corners, red and white
  const kerbTex = kerb();
  for (const side of [-1, 1]) {
    const runs = []; let start = -1;
    for (let k = 0; k < n; k++) {
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
    group.add(wall(track, off, 0.3, 1.05, railMat));
  }
  // catch fences on the outside of the corners, a few metres behind the Armco, with a post every dozen metres
  const fenceMat = new THREE.MeshToonMaterial({ gradientMap: RAMP, map: fence(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fenceMat.map.wrapS = THREE.RepeatWrapping;
  const fencePosts = [];
  for (const side of [-1, 1]) {
    const wl = side > 0 ? track.wallR : track.wallL, base = W / 2 + track.verge;
    let start = -1;
    for (let k = 0; k <= n; k++) {
      // outside of the bends, in long stretches, not all the way round
      const on = k < n && wl[k] >= base - 0.01 && Math.sin(k * 0.0123 + side * 1.7) + Math.sin(k * 0.0051) > -0.3 && k > track.gateAt + 20;
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
  { let i = 0; const m = new THREE.Matrix4(); for (let k = 0; k < n; k += 2) for (const side of [-1, 1]) { const p = pointAt(track, k, side > 0 ? track.wallR[k] + 0.08 : -track.wallL[k] - 0.08); m.makeTranslation(p.x, p.y + 0.4, p.z); posts.setMatrixAt(i++, m); } posts.count = i; }
  group.add(posts);

  // ---------- the hills and the forest ----------
  const { terrain, treeSpots } = hills(track);
  group.add(terrain);
  group.add(...forest(treeSpots));

  // ---------- painted tarmac: names and doodles fans leave on the road ----------
  const words = ['GRUNE HOLLE', 'VOLLGAS', 'BTG', 'NOS', 'LIFT?', 'BRAKE', 'DO NOT LIFT', 'EIFEL', 'NO TRUCKS', 'SEND IT', '20.8 KM', 'RING'];
  for (let i = 0; i < 40; i++) {
    const k = Math.floor(80 + rnd() * (n - 200));
    if (Math.abs(track.curv[k]) > 0.01) continue;
    const decal = paint(words[i % words.length], i);
    const p = pointAt(track, k, (rnd() - 0.5) * W * 0.5);
    decal.position.set(p.x, track.y[k] + 0.035, p.z);
    // flat on the road, the top of the letters pointing up the road, so they read the right way as you drive over them
    decal.rotation.order = 'YXZ'; decal.rotation.set(-Math.PI / 2, -track.h[k] - Math.PI / 2, 0);
    group.add(decal);
  }

  // ---------- corner boards ----------
  for (const m of track.marks) {
    if (m.name === 'Gantry' || m.name === 'Touristenfahrten') continue;
    const k = Math.max(0, m.at - 12), side = track.curv[Math.min(n - 1, m.at + 10)] > 0 ? -1 : 1;
    const p = pointAt(track, k, side > 0 ? track.wallR[k] + 2.2 : -track.wallL[k] - 2.2);
    const b = board(m.name.replace('oe', 'ö').replace('ue', 'ü').replace('Ex-Muehle', 'Ex-Mühle').replace('Bruennchen', 'Brünnchen').replace('Doettinger Hoehe', 'Döttinger Höhe').replace('Quiddelbacher Hoehe', 'Quiddelbacher Höhe').replace('Fuchsroehre', 'Fuchsröhre'));
    b.position.set(p.x, p.y, p.z); b.rotation.y = -track.h[k] - Math.PI / 2; group.add(b);
  }

  // ---------- the gate and the gantry ----------
  const gate = gateHouse(track); group.add(gate.group);
  group.add(gantry(track));
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
export function buildLine(track, lat) {
  const n = track.n, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), colours = new Float32Array(n * 6), idx = [];
  for (let k = 0; k < n; k++) {
    const l = pointAt(track, k, lat[k] - 0.55), r = pointAt(track, k, lat[k] + 0.55);
    pos.set([l.x, l.y + 0.05, l.z, r.x, r.y + 0.05, r.z], k * 6);
    const v = k * track.ds / 3.2; uv.set([0, v, 1, v], k * 4);
    if (k) { const q = (k - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
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
    for (let k = 0; k < n; k++) { c.set(PHASE_COLOURS[phase[k]]).convertSRGBToLinear(); colours.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6); }
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
function hills(track) {
  const { n, x, z, y } = track;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < n; k++) { x0 = Math.min(x0, x[k]); x1 = Math.max(x1, x[k]); z0 = Math.min(z0, z[k]); z1 = Math.max(z1, z[k]); }
  const pad = 420; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  const cell = 8, nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  // nearest road sample, through a coarse bucket grid
  const B = 24, bx = Math.ceil((x1 - x0) / B) + 1, bucket = new Map();
  for (let k = 0; k < n; k++) { const key = Math.floor((x[k] - x0) / B) + Math.floor((z[k] - z0) / B) * bx; (bucket.get(key) || bucket.set(key, []).get(key)).push(k); }
  const coarse = []; for (let k = 0; k < n; k += 25) coarse.push(k);
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
    const hgt = (near - 0.9) * (1 - t) + (far + roll + Math.min(30, (d - 14) * 0.08)) * t;
    H[i + j * nx] = hgt; D[i + j * nx] = d;
  }
  const g = new THREE.PlaneGeometry((nx - 1) * cell, (nz - 1) * cell, nx - 1, nz - 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const i = v % nx, j = Math.floor(v / nx);
    pos.setXYZ(v, x0 + i * cell, H[i + j * nx], z0 + j * cell);
    // bright grass by the road, a patchwork of fields away from it: greens, olive and a mustard field or two
    const px = x0 + i * cell, pz = z0 + j * cell, fld = Math.sin(px * 0.0071 + Math.sin(pz * 0.004) * 2) * Math.cos(pz * 0.0063 - px * 0.002);
    const pick = D[i + j * nx] < 40 ? 0 : fld > 0.55 ? 3 : fld > 0.2 ? 1 : fld < -0.5 ? 2 : 0;
    c.set(['#8cc63f', '#a6c94b', '#6fb04a', '#e0b23e'][pick]).convertSRGBToLinear(); cols.set([c.r, c.g, c.b], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, toon({ vertexColors: true }));
  terrain.receiveShadow = true;
  // trees: dense forest from just past the Armco outwards, with a few clearings
  const treeSpots = [];
  for (let j = 0; j < nz; j += 2) for (let i = 0; i < nx; i += 2) {
    const d = D[i + j * nx]; if (d < 22 || d > 230) continue;
    const clearing = Math.sin((x0 + i * cell) * 0.004) * Math.cos((z0 + j * cell) * 0.005) > 0.55;
    if (clearing || rnd() > (d < 60 ? 0.8 : 0.42)) continue;
    treeSpots.push([x0 + i * cell + (rnd() - 0.5) * cell * 2, H[i + j * nx] - 0.3, z0 + j * cell + (rnd() - 0.5) * cell * 2, rnd()]);
  }
  return { terrain, treeSpots };
}

function forest(spots) {
  // a spruce: tiers of branches that hang down and out, narrowing to a point
  const prof = [[0.3, 2], [2.9, 3.2], [1.1, 3.6], [2.5, 5.6], [0.9, 6], [2.0, 8], [0.7, 8.4], [1.4, 10.4], [0.45, 10.8], [0.8, 12.4], [0, 14]];
  const pine = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 7); pine.translate(0, -1.2, 0);
  // a lollipop tree, the cartoon broadleaf: a ball of leaves on a stick
  const leaf = new THREE.SphereGeometry(3.3, 9, 7); leaf.scale(1, 1.12, 1); leaf.translate(0, 6.2, 0);
  const trunk = new THREE.CylinderGeometry(0.32, 0.45, 3.4, 6); trunk.translate(0, 1.7, 0);
  inkNormals(pine); inkNormals(leaf);
  const nP = spots.filter(s => s[3] < 0.62).length, nL = spots.length - nP;
  // white materials: each tree's own colour is set per instance, and the two multiply
  const P = new THREE.InstancedMesh(pine, toon(), nP), Pi = new THREE.InstancedMesh(pine, inkMat(0.16), nP);
  const Lf = new THREE.InstancedMesh(leaf, toon(), nL), Li = new THREE.InstancedMesh(leaf, inkMat(0.16), nL);
  const T = new THREE.InstancedMesh(trunk, toon({ color: 0x8a5a2b }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color();
  const pines = ['#2f7a4f', '#3c8a55', '#2b6b4c'], balls = ['#5aa83c', '#3f8f3a', '#7cbc3a', '#4c9e46', '#5aa83c', '#e0a630', '#d9752b'];
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
    g.clearRect(0, 0, w, h); g.font = '72px Shrikhand, "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.85;
    g.lineWidth = 10; g.strokeStyle = PAL.ink; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 4); g.fillStyle = cols[i % cols.length]; g.fillText(text, w / 2, h / 2 + 4);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshToonMaterial({ gradientMap: RAMP, map: t, transparent: true, depthWrite: false }));
}
// the name over a car: a cream pill with an ink edge
export function label(text, sub) {
  const t = canvas(512, 128, (g, w, h) => {
    g.fillStyle = PAL.cream; g.strokeStyle = PAL.ink; g.lineWidth = 8; round(g, 8, 14, w - 16, h - 28, 40); g.fill(); g.stroke();
    g.fillStyle = PAL.brown; g.font = '44px Righteous, Barlow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, sub ? h / 2 - 12 : h / 2 + 2);
    if (sub) { g.font = '26px Righteous, Barlow, sans-serif'; g.fillText(sub, w / 2, h / 2 + 24); }
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true })); sp.scale.set(4.4, 1.1, 1); return sp;
}
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function board(name) {
  const t = canvas(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = PAL.cream; g.strokeStyle = PAL.ink; g.lineWidth = 10; round(g, 6, 6, w - 12, h - 12, 34); g.fill(); g.stroke();
    for (const [c, y] of [[PAL.mustard, 22], [PAL.orange, 34], [PAL.red, 46]]) { g.fillStyle = c; g.fillRect(16, h - y - 6, w - 32, 10); }
    g.fillStyle = PAL.brown; g.font = `${name.length > 14 ? 44 : 56}px Shrikhand, "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 - 14);
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
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshBasicMaterial({ map: canvas(1024, 144, (g, w, hh) => { g.fillStyle = PAL.brown; g.fillRect(0, 0, w, hh); for (const [c, y] of [[PAL.mustard, 8], [PAL.orange, 18], [PAL.red, 28]]) { g.fillStyle = c; g.fillRect(0, hh - y - 4, w, 8); } g.fillStyle = PAL.cream; g.font = '78px Shrikhand, "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Nordschleife Touristenfahrten', w / 2, hh / 2 - 8); }), side: THREE.DoubleSide }));
  sign.position.set(-0.25, 5.2 - 1.05, 0); sign.rotation.y = -Math.PI / 2; grp.add(sign);
  // the arm pivots at the booth and lies across the road
  const pivot = new THREE.Group(); pivot.position.set(0.2, 1.05, W / 2 + 0.4); grp.add(pivot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, W + 0.4), new THREE.MeshToonMaterial({ gradientMap: RAMP, map: canvas(16, 128, (g, w, hh) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d81e2c' : '#f4f4f4'; g.fillRect(0, i * 16, w, 16); } }) }));
  arm.position.z = -(W + 0.4) / 2; pivot.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: col(0xff2a2a) })); lamp.position.set(-0.3, 2.4, W / 2 + 0.5); grp.add(lamp);
  return { group: grp, pivot, lamp };
}
function gantry(track) {
  const k = track.n - 12, p = pointAt(track, k, 0), W = track.width;
  const grp = new THREE.Group(); grp.position.set(p.x, p.y, p.z); grp.rotation.y = -track.h[k];
  const steel = toon({ color: PAL.orange });
  for (const z of [-W / 2 - 1.2, W / 2 + 1.2]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); c.position.set(0, 3.5, z); grp.add(c); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, W + 3), steel); beam.position.y = 7; grp.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.4), new THREE.MeshBasicMaterial({ map: canvas(1024, 144, (g, w, h) => { g.fillStyle = PAL.brown; g.fillRect(0, 0, w, h); g.fillStyle = PAL.mustard; g.font = '84px Shrikhand, "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('The Gantry', w / 2, h / 2 - 2); }), side: THREE.DoubleSide }));
  sign.position.set(-0.75, 7, 0); sign.rotation.y = -Math.PI / 2; grp.add(sign);
  return grp;
}

// ---------- cars ----------
// Each car is drawn from a side view, as a designer would sketch it: the lower body's outline (bumpers, bonnet,
// beltline, boot) cut round the wheel arches, with the wings bulging over them, extruded across the car's width with
// rounded edges; on top a glasshouse that narrows toward the roof (the tumblehome), painted pillars and roof, then
// mirrors, bumpers, grille, lights, number plates, an exhaust, wheels with whitewall tyres, and a soft shadow underneath.
// Proportions come from each car's real length, width and height; the shape comes from its style. Cartoon touches:
// fat rounded edges, wheels a size too big, streaky cartoon glass, twin racing stripes, and an ink outline.
//
// Profiles are shares of length from the back (0) to the front (1) and of height: `top` is the lower body's upper
// line, back to front; `cab` the glasshouse, from the bottom of the rear window round to the bottom of the windscreen;
// `wheels` the axles; `b` where the B-pillar stands, if it has one; `panel` paints the glasshouse solid back to there
// (a van's load bay).
const STYLE = {
  coupe:    { top: [[0, 0.4], [0.03, 0.54], [0.2, 0.6], [0.68, 0.6], [0.93, 0.5], [1, 0.38]], cab: [[0.1, 0.6], [0.42, 1], [0.56, 1], [0.7, 0.6]], wheels: [0.2, 0.81] },
  hatch:    { top: [[0, 0.5], [0.02, 0.62], [0.72, 0.64], [0.95, 0.54], [1, 0.44]], cab: [[0.02, 0.63], [0.13, 1], [0.56, 1], [0.74, 0.64]], wheels: [0.17, 0.81], b: 0.4 },
  sedan:    { top: [[0, 0.5], [0.02, 0.62], [0.2, 0.64], [0.7, 0.64], [0.95, 0.55], [1, 0.46]], cab: [[0.19, 0.64], [0.3, 1], [0.6, 1], [0.72, 0.64]], wheels: [0.18, 0.8], b: 0.46 },
  wagon:    { top: [[0, 0.52], [0.02, 0.62], [0.74, 0.62], [0.96, 0.56], [1, 0.48]], cab: [[0.02, 0.62], [0.03, 1], [0.64, 1], [0.76, 0.62]], wheels: [0.18, 0.8], b: 0.44 },
  van:      { top: [[0, 0.44], [0.01, 0.48], [0.84, 0.48], [0.97, 0.4], [1, 0.3]], cab: [[0.0, 0.48], [0.0, 1], [0.76, 1], [0.88, 0.48]], wheels: [0.16, 0.84], panel: 0.6 },
  roadster: { top: [[0, 0.5], [0.03, 0.66], [0.32, 0.68], [0.6, 0.68], [0.95, 0.56], [1, 0.46]], cab: null, wheels: [0.18, 0.82] },
  tiny:     { top: [[0, 0.5], [0.03, 0.6], [0.7, 0.6], [0.94, 0.54], [1, 0.46]], cab: [[0.04, 0.6], [0.09, 1], [0.6, 1], [0.75, 0.6]], wheels: [0.15, 0.84], b: 0.42 },
};
const lerpLine = (pts, x) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) || 1); } return pts[pts.length - 1][1]; };
// keep the points of a polygon on one side of a line: a*x + b*y >= d
function clip(poly, a, b, d) {
  const out = [], f = p => a * p[0] + b * p[1] - d;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q); if (fp >= 0) out.push(p); if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } });
  return out;
}
// a side-view polygon extruded across the car, centred on z, from width w
function slab(poly, w, bevel = 0) {
  const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, bevel ? { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 10 } : { depth: w, bevelEnabled: false });
  g.translate(0, 0, -(bevel ? w - 2 * bevel : w) / 2); return g;
}
// one geometry from many, so a car is a handful of draw calls
function merge(geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0; for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return m;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
let shadowTex = null, plateTex = null, glassTex = null;
// a stripe colour that stands out from the paint: cream on dark or saturated cars, orange on pale ones
const stripeFor = hex => { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.62 ? PAL.orange : PAL.cream; };

export function carMesh(body) {
  const st = STYLE[body.style] || STYLE.hatch, L = body.len, Wd = body.wid, H = body.hgt;
  const clear = 0.16, X = f => -L / 2 + f * L, Y = f => clear * 0.4 + f * (H - clear * 0.4);
  const grp = new THREE.Group();
  const paint = toon({ color: body.color }), trim = toon({ color: body.trim }), black = toon({ color: 0x2b2420 });
  if (!glassTex) { glassTex = canvas(128, 128, (g, w, h) => { g.fillStyle = '#8fd0e6'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9fbff'; g.save(); g.translate(w / 2, h / 2); g.rotate(-0.7); g.fillRect(-90, -30, 180, 14); g.fillRect(-90, -6, 180, 6); g.restore(); }); glassTex.wrapS = glassTex.wrapT = THREE.RepeatWrapping; glassTex.repeat.set(0.9, 0.9); }
  const glass = toon({ map: glassTex });
  const wr = Math.min(0.42, H * 0.27), arch = wr + 0.1, wx = st.wheels.map(X), inkParts = [];

  // ---------- the lower body, with arches and wings ----------
  let top = st.top.map(([f, h]) => [X(f), Y(h)]);
  for (const x of wx) {
    // the wing over each wheel: at least a hand's width of metal above the arch
    const need = wr + arch + 0.09;
    for (const dx of [-arch * 1.25, 0, arch * 1.25]) top.push([x + dx, Math.max(lerpLine(top, x + dx), need - (dx ? 0.03 : 0))]);
    top.sort((a, b) => a[0] - b[0]);
  }
  const sh = new THREE.Shape(), yb = clear + 0.1;
  sh.moveTo(-L / 2, yb + 0.06); sh.lineTo(-L / 2 + 0.1, yb);
  for (const x of wx) { sh.lineTo(x - arch, yb); sh.absarc(x, wr, arch, Math.PI - Math.asin(Math.min(1, (yb - wr) / arch)), Math.asin(Math.min(1, (yb - wr) / arch)), true); }
  sh.lineTo(L / 2 - 0.12, yb); sh.lineTo(L / 2, yb + 0.1);
  for (let i = top.length - 1; i >= 0; i--) sh.lineTo(top[i][0], top[i][1]);
  const bev = 0.13;
  const lowerGeo = new THREE.ExtrudeGeometry(sh, { depth: Wd - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.08, bevelSegments: 4, curveSegments: 14 });
  lowerGeo.translate(0, 0, -(Wd - 2 * bev) / 2);
  const lower = new THREE.Mesh(lowerGeo, paint); lower.castShadow = true; grp.add(lower); inkParts.push(lowerGeo);

  // ---------- the glasshouse, pillars and roof ----------
  const paintBits = [], trimBits = [], blackBits = [], stripeBits = [];
  // racing stripes over the bonnet and boot: a band along the body's top line, standing just proud of it
  if (body.style !== 'van') {
    const band = [...top.map(([x, y]) => [x, y + 0.02]), ...top.slice().reverse().map(([x, y]) => [x, y - 0.1])];
    for (const z of [-0.17, 0.17]) stripeBits.push(slab(band, 0.17).translate(0, 0, z));
  }
  const tw = Wd * 0.84;
  if (st.cab) {
    const cab = st.cab.map(([f, h]) => [X(f), Y(h)]);
    const g = new THREE.Mesh(slab(cab, tw), glass); g.castShadow = true; grp.add(g); inkParts.push(g.geometry);
    // the roof, a skin over the top of the glass
    const roofY = cab[1][1];
    paintBits.push(slab(clip(cab, 0, 1, roofY - 0.05), tw + 0.04).translate(0, 0.015, 0));
    // pillars: thin painted strips on each side of the glass along its front and rear edges, and the B-pillar
    // a strip of the glasshouse within `thick` of the edge from p to q
    const cx = cab.reduce((t, p) => t + p[0], 0) / cab.length, cy = cab.reduce((t, p) => t + p[1], 0) / cab.length;
    const edge = (p, q, thick) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); let nx = dy / len, ny = -dx / len;
      if (nx * (cx - p[0]) + ny * (cy - p[1]) > 0) { nx = -nx; ny = -ny; }   // n points out of the glass
      return clip(cab, nx, ny, nx * p[0] + ny * p[1] - thick);
    };
    const sides = poly => { if (poly.length > 2) for (const s of [-1, 1]) paintBits.push(slab(poly, 0.03).translate(0, 0, s * (tw / 2 + 0.01))); };
    sides(edge(cab[3], cab[2], 0.09));    // the A-pillar
    sides(edge(cab[0], cab[1], 0.12));    // the C-pillar
    if (st.b) sides(clip(clip(cab, 1, 0, X(st.b) - 0.06), -1, 0, -(X(st.b) + 0.06)));
    if (st.panel) sides(clip(cab, -1, 0, -X(st.panel)));
    // the window line: a dark seal along the bottom of the glass
    paintBits.push(slab([[cab[0][0], cab[0][1] - 0.01], [cab[3][0], cab[3][1] - 0.01], [cab[3][0], cab[3][1] + 0.03], [cab[0][0], cab[0][1] + 0.03]], tw + 0.02));
    // racing stripes over the roof
    if (body.style !== 'van') for (const z of [-0.17, 0.17]) stripeBits.push(slab(clip(cab, 0, 1, roofY - 0.03), 0.17).translate(0, 0.04, z));
    // door mirrors at the foot of the windscreen
    for (const s of [-1, 1]) paintBits.push(box(0.12, 0.1, 0.16, cab[3][0] - 0.12, cab[3][1] + 0.08, s * (Wd / 2 + 0.06)));
  } else {
    // a roadster: the windscreen in its frame, roll hoops, two seats and the driver
    const xs = X(0.6), ys = Y(0.68);
    const ws = [[xs - 0.02, ys], [xs, ys], [xs - 0.3, H], [xs - 0.33, H]];
    grp.add(new THREE.Mesh(slab(ws, Wd * 0.8), glass));
    trimBits.push(slab([[xs - 0.33, H - 0.03], [xs - 0.29, H - 0.03], [xs - 0.3, H], [xs - 0.33, H]], Wd * 0.82));
    for (const s of [-1, 1]) { blackBits.push(box(0.4, 0.38, 0.5, X(0.42), ys + 0.08, s * Wd * 0.22)); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), toon({ color: 0x6b3e1e })); head.position.set(X(0.4), ys + 0.42, Wd * 0.22); grp.add(head);
  }

  // ---------- bumpers, sills, grille, plates, exhaust ----------
  trimBits.push(box(0.16, 0.2, Wd * 0.94, L / 2 - 0.05, yb + 0.06, 0), box(0.16, 0.2, Wd * 0.94, -L / 2 + 0.05, yb + 0.06, 0));
  trimBits.push(box(L * 0.42, 0.08, Wd + 0.01, (wx[0] + wx[1]) / 2, yb + 0.02, 0));
  const noseY = lerpLine(top, L / 2 - 0.05), tailY = lerpLine(top, -L / 2 + 0.05);
  blackBits.push(box(0.06, Math.max(0.08, (noseY - yb) * 0.32), Wd * 0.42, L / 2 + 0.05, yb + (noseY - yb) * 0.55, 0));
  blackBits.push(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8).rotateZ(Math.PI / 2).translate(-L / 2 - 0.03, yb - 0.02, Wd * 0.28));
  if (!plateTex) plateTex = canvas(128, 28, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d3f9a'; g.fillRect(0, 0, 14, h); g.strokeStyle = '#222'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(22 + i * 16, 7, 10, 14); });
  const plate = new THREE.MeshBasicMaterial({ map: plateTex });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), plate); p.position.set(s * (L / 2 + 0.09), yb + 0.06, 0); p.rotation.y = s * Math.PI / 2; grp.add(p); }

  // ---------- lights ----------
  const head = new THREE.MeshBasicMaterial({ color: col(0xfff6d8) }), tail = new THREE.MeshBasicMaterial({ color: col(0xa3101c) });
  grp.tail = tail;   // the page lights it up under braking
  const heads = [], tails = [];
  for (const s of [-1, 1]) {
    heads.push(box(0.1, 0.09, Wd * 0.2, L / 2 + 0.035, noseY - 0.09, s * Wd * 0.32));
    tails.push(box(0.08, 0.1, Wd * 0.24, -L / 2 - 0.03, tailY - 0.1, s * Wd * 0.33));
  }
  grp.add(new THREE.Mesh(merge(heads), head), new THREE.Mesh(merge(tails), tail));

  // ---------- the wing, the roof box ----------
  if (body.wing) {
    const wy = Math.max(H * 0.82, tailY + 0.32), wxp = X(0.06);
    trimBits.push(slab([[wxp - 0.2, wy], [wxp + 0.18, wy + 0.03], [wxp + 0.18, wy + 0.07], [wxp - 0.2, wy + 0.05]], Wd * 0.92));
    for (const s of [-1, 1]) { trimBits.push(box(0.36, 0.14, 0.03, wxp, wy + 0.02, s * Wd * 0.46), box(0.08, wy - tailY + 0.02, 0.05, wxp + 0.05, (wy + tailY) / 2, s * Wd * 0.25)); }
  }
  if (body.roofbox) blackBits.push(box(1.7, 0.34, 0.9, X(0.4), H + 0.2, 0), box(0.06, 0.06, Wd * 0.8, X(0.25), H + 0.04, 0), box(0.06, 0.06, Wd * 0.8, X(0.55), H + 0.04, 0));

  for (const [bits, mat] of [[paintBits, paint], [trimBits, trim], [blackBits, black], [stripeBits, toon({ color: stripeFor(body.color) })]]) if (bits.length) { const m = new THREE.Mesh(merge(bits), mat); m.castShadow = true; grp.add(m); if (mat !== black || !body.roofbox) inkParts.push(m.geometry); }
  // the ink outline round the whole body
  grp.ink = new THREE.Mesh(inkNormals(merge(inkParts)), inkMat(0.035)); grp.add(grp.ink);   // the page hides it when the camera sits inside it, on the bonnet

  // ---------- wheels: a fat tyre with a whitewall, a chrome dish, five slots ----------
  const tyreG = new THREE.CylinderGeometry(wr, wr, 0.28, 20).rotateX(Math.PI / 2);
  const wallG = new THREE.RingGeometry(wr * 0.66, wr * 0.84, 22).translate(0, 0, 0.142);
  const rimG = merge([new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.04, 18).rotateX(Math.PI / 2).translate(0, 0, 0.12)]);
  const slotG = merge([0, 1, 2, 3, 4].map(i => box(wr * 0.14, wr * 0.32, 0.02, 0, wr * 0.36, 0.142).rotateZ(i * Math.PI * 2 / 5)));
  const tyre = toon({ color: 0x2b2420 }), wall = toon({ color: PAL.cream, side: THREE.DoubleSide }), rim = toon({ color: 0xd6d2c8 }), slot = toon({ color: 0x5a4a3a });
  const tyreInk = inkMat(0.03), tyreInkG = inkNormals(tyreG.clone());
  grp.wheels = [];
  for (const [x, s] of [[wx[1], 1], [wx[1], -1], [wx[0], 1], [wx[0], -1]]) {
    const w = new THREE.Group(); w.position.set(x, wr, s * (Wd / 2 - 0.14));
    const face = new THREE.Group(); face.add(new THREE.Mesh(wallG, wall), new THREE.Mesh(rimG, rim), new THREE.Mesh(slotG, slot)); if (s < 0) face.rotation.y = Math.PI;
    w.add(new THREE.Mesh(tyreG, tyre), new THREE.Mesh(tyreInkG, tyreInk), face); grp.add(w); grp.wheels.push(w);
  }

  // ---------- a soft shadow, so the car sits on the road from any distance ----------
  // a cartoon shadow: a flat oval with a soft edge
  if (!shadowTex) shadowTex = canvas(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(42,26,14,0.5)'); r.addColorStop(1, 'rgba(42,26,14,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.15, Wd * 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  blob.position.y = 0.04; blob.renderOrder = 1; grp.add(blob);
  return grp;
}
