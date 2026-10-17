// Everything you see: the sky and its clouds, the Eifel hills and spruce forest, the road with its kerbs, Armco, catch
// fences and painted tarmac, the gate with its barrier and the gantry at the end, corner boards, and the cars, each built from a few shaped blocks to its own
// proportions and colours. Three.js r128, the copy Cathedral Lab keeps on the site.
import * as THREE from '../../cathedral-lab/src/vendor/three.module.js?v=0.11';
import { pointAt } from './track.js?v=0.3';

// Colours here are written as on a paint chart (sRGB); the renderer works in linear light, so convert them.
const col = c => new THREE.Color(c).convertSRGBToLinear();
const rnd = (() => { let s = 1234567; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); })();

export function buildWorld(scene, track) {
  const W = track.width, half = W / 2, n = track.n;
  const group = new THREE.Group(); scene.add(group);

  // ---------- road ----------
  const road = ribbon(track, k => [-half, half], 0.02, (k, side) => [side, k * track.ds / 10]);
  road.material = new THREE.MeshLambertMaterial({ map: asphalt() });
  road.material.map.wrapS = road.material.map.wrapT = THREE.RepeatWrapping;
  road.receiveShadow = true; group.add(road);
  // grass verge out to the Armco and a little past it
  for (const side of [-1, 1]) {
    const verge = ribbon(track, k => side > 0 ? [half, (side > 0 ? track.wallR[k] : track.wallL[k]) + 3] : [-(track.wallL[k] + 3), -half], -0.02, (k, s) => [s, k * track.ds / 6]);
    verge.material = new THREE.MeshLambertMaterial({ map: grassTex() });
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
      m.material = new THREE.MeshLambertMaterial({ map: kerbTex }); group.add(m);
    }
  }
  // the Armco: two W-beam rails on posts, galvanised steel that catches the sky
  const railMat = new THREE.MeshStandardMaterial({ map: armco(), metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide });
  railMat.map.wrapS = THREE.RepeatWrapping;
  for (const side of [-1, 1]) {
    const off = k => side > 0 ? track.wallR[k] : -track.wallL[k];
    group.add(wall(track, off, 0.3, 1.05, railMat));
  }
  // catch fences on the outside of the corners, a few metres behind the Armco, with a post every dozen metres
  const fenceMat = new THREE.MeshLambertMaterial({ map: fence(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
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
  const fp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 5).translate(0, 1.75, 0), new THREE.MeshLambertMaterial({ color: col(0x5b636b) }), fencePosts.length);
  fencePosts.forEach((p, i) => fp.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  group.add(fp);
  const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12), posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: col(0x6d747c) }), Math.ceil(n / 2) * 2 + 4);
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

// The sky: a dome from a deep blue overhead to a pale haze at the horizon and a dark green below it (what the car paint
// reflects), with fair-weather clouds. It follows the camera. The horizon colour is the fog's, so distance fades into it.
export const HORIZON = 0xd5e3ec;
export function buildSky(withClouds = true) {
  const grp = new THREE.Group();
  const geo = new THREE.SphereGeometry(1100, 32, 20), pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
  const zen = col(0x3f78c0), mid = col(0x8db7de), hor = col(HORIZON), below = col(0x3c4a34);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 1100;
    if (t > 0.25) c.copy(mid).lerp(zen, Math.min(1, (t - 0.25) / 0.6));
    else if (t > 0) c.copy(hor).lerp(mid, t / 0.25);
    else c.copy(hor).lerp(below, Math.min(1, -t / 0.08));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  grp.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  if (withClouds) {
    const tex = canvas(256, 128, (g, w, h) => {
      for (let i = 0; i < 26; i++) { const x = w * (0.18 + rnd() * 0.64), y = h * (0.45 + rnd() * 0.25), r = 18 + rnd() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    });
    for (let i = 0; i < 28; i++) {
      const a = rnd() * Math.PI * 2, d = 600 + rnd() * 350, sz = 120 + rnd() * 160;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, opacity: 0.75 + rnd() * 0.25 }));
      s.position.set(Math.cos(a) * d, 160 + rnd() * 260, Math.sin(a) * d); s.scale.set(sz, sz * 0.45, 1); grp.add(s);
    }
  }
  grp.renderOrder = -1;
  return grp;
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
    const nse = Math.sin(i * 1.7 + j * 0.3) * 0.5 + Math.sin(i * 0.21 - j * 0.37) * 0.5;
    c.setHSL(0.26 + nse * 0.025, 0.45, 0.3 + nse * 0.05).convertSRGBToLinear(); cols.set([c.r, c.g, c.b], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
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
  const leaf = new THREE.IcosahedronGeometry(3.4, 0); leaf.translate(0, 6, 0);
  const trunk = new THREE.CylinderGeometry(0.35, 0.45, 3, 5); trunk.translate(0, 1.5, 0);
  const nP = spots.filter(s => s[3] < 0.7).length, nL = spots.length - nP;
  // white materials: each tree's own colour is set per instance, and the two multiply
  const P = new THREE.InstancedMesh(pine, new THREE.MeshLambertMaterial({ flatShading: true }), nP);
  const Lf = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial({ flatShading: true }), nL);
  const T = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: col(0x5a4430) }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color();
  let ip = 0, il = 0;
  spots.forEach((s, i) => {
    const k = 0.7 + (s[3] * 7919 % 1) * 0.7;
    ps.set(s[0], s[1], s[2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s[3] * 6.28); sc.set(k, k * (0.9 + (s[3] * 104729 % 1) * 0.5), k);
    m.compose(ps, q, sc); T.setMatrixAt(i, m);
    if (s[3] < 0.7) { P.setMatrixAt(ip, m); c.setHSL(0.36 + (s[3] * 53 % 1) * 0.05, 0.34, 0.17 + s[3] * 0.1).convertSRGBToLinear(); P.setColorAt(ip++, c); }
    else { Lf.setMatrixAt(il, m); c.setHSL(0.24 + s[3] * 0.06, 0.45, 0.25 + (s[3] * 31 % 1) * 0.08).convertSRGBToLinear(); Lf.setColorAt(il++, c); }
  });
  return [P, Lf, T];
}

// ---------- textures, drawn on canvases ----------
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.encoding = THREE.sRGBEncoding; return t; }
function asphalt() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4e54'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40000; i++) { const v = 58 + rnd() * 44 | 0; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
    // patches of newer, darker tarmac, as the Ring is mended a section at a time
    for (const [x, y, pw, ph] of [[0.18, 0.05, 0.34, 0.4], [0.55, 0.52, 0.3, 0.3], [0.05, 0.7, 0.25, 0.22]]) {
      g.fillStyle = 'rgba(28,30,34,0.12)'; g.beginPath(); g.moveTo(w * x, h * y);
      for (const [fx, fy] of [[1, 0.05], [0.95, 1], [0.04, 0.93]]) g.lineTo(w * (x + pw * fx), h * (y + ph * fy));
      g.closePath(); g.fill();
    }
    // the rubbered-in line, where the wheels go, and tar seams across it
    const grad = g.createLinearGradient(0, 0, w, 0);
    for (const [at, a] of [[0, 0], [0.22, 0.2], [0.32, 0], [0.62, 0], [0.72, 0.18], [0.8, 0], [1, 0]]) grad.addColorStop(at, `rgba(18,18,20,${a})`);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(20,20,22,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { g.beginPath(); let x = 0, y = rnd() * h; g.moveTo(x, y); while (x < w) { x += 20 + rnd() * 40; y += (rnd() - 0.5) * 12; g.lineTo(x, y); } g.stroke(); }
    // the white edge lines, a little worn
    g.fillStyle = '#e9e9e4'; g.fillRect(6, 0, 9, h); g.fillRect(w - 15, 0, 9, h);
    g.fillStyle = 'rgba(74,78,84,0.5)'; for (let i = 0; i < 300; i++) g.fillRect(rnd() < 0.5 ? 6 + rnd() * 9 : w - 15 + rnd() * 9, rnd() * h, 2, 2);
  });
}
// a W-beam rail, twice over: bright on the ridges, dark in the folds, a bolt at each post
function armco() {
  return canvas(64, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (const [at, c] of [[0, '#6f777f'], [0.08, '#e4e9ee'], [0.2, '#8d959d'], [0.3, '#f0f3f6'], [0.42, '#727a82'], [0.47, '#2c3136'], [0.53, '#2c3136'], [0.58, '#727a82'], [0.7, '#f0f3f6'], [0.8, '#8d959d'], [0.92, '#e4e9ee'], [1, '#6f777f']]) grad.addColorStop(at, c);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,40,40,0.6)'; for (const y of [0.25, 0.75]) g.fillRect(w - 6, h * y - 3, 4, 6);
  });
}
// the catch fence: a diamond wire mesh you can see through
function fence() {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(160,168,176,0.75)'; g.lineWidth = 1.6;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 16 + h, 0); g.lineTo(i * 16, h); g.stroke(); }
    g.fillStyle = 'rgba(110,118,126,0.9)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  });
}
function grassTex() {
  return canvas(128, 128, (g, w, h) => { g.fillStyle = '#4d7a35'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${85 + rnd() * 25},${40 + rnd() * 20}%,${22 + rnd() * 16}%)`; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 2); } });
}
function kerb() { return canvas(32, 64, (g, w, h) => { g.fillStyle = '#d81e2c'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f4f4f4'; g.fillRect(0, h / 2, w, h / 2); }); }
function paint(text, i) {
  const cols = ['#ffffff', '#ffe14d', '#ff5a6a', '#7fd6ff', '#b4ff7a'];
  const t = canvas(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 86px "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.72; g.fillText(text, w / 2, h / 2 + 4); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false }));
  return m;
}
export function label(text, sub) {
  const t = canvas(512, 128, (g, w, h) => {
    g.fillStyle = 'rgba(15,20,25,0.78)'; round(g, 4, 10, w - 8, h - 20, 22); g.fill();
    g.fillStyle = '#fff'; g.font = '700 46px Barlow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, sub ? h / 2 - 12 : h / 2);
    if (sub) { g.fillStyle = '#c9d2dc'; g.font = '500 28px Barlow, sans-serif'; g.fillText(sub, w / 2, h / 2 + 26); }
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true })); s.scale.set(4.4, 1.1, 1); return s;
}
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function board(name) {
  const t = canvas(512, 160, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#0b4ea2'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillStyle = '#16202c'; g.font = '800 64px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 + 3); });
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); face.position.y = 3.2; grp.add(face);
  for (const x of [-2.6, 2.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), new THREE.MeshLambertMaterial({ color: col(0x777777) })); p.position.set(x, 1.6, -0.05); grp.add(p); }
  return grp;
}

// The Touristenfahrten gate: a booth, a barrier arm, a light, and the sign. Returns the arm so the page can lift it.
function gateHouse(track) {
  const grp = new THREE.Group(), k = track.gateAt, p = pointAt(track, k, 0), h = track.h[k];
  grp.position.set(p.x, p.y, p.z); grp.rotation.y = -h;
  const W = track.width;
  // local frame: +x along the road, +z to the right
  const booth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.2), new THREE.MeshLambertMaterial({ color: col(0xe9e4d8) })); booth.position.set(0.8, 1.3, W / 2 + 1.6); grp.add(booth);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, W + 8), new THREE.MeshLambertMaterial({ color: col(0x16202c) })); roof.position.set(0, 5.2, 0); grp.add(roof);
  for (const z of [-W / 2 - 2, W / 2 + 3]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 0.4), new THREE.MeshLambertMaterial({ color: col(0x6d747c) })); c.position.set(0, 2.6, z); grp.add(c); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshBasicMaterial({ map: canvas(1024, 144, (g, w, hh) => { g.fillStyle = '#0b4ea2'; g.fillRect(0, 0, w, hh); g.fillStyle = '#fff'; g.font = '800 92px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NORDSCHLEIFE  TOURISTENFAHRTEN', w / 2, hh / 2 + 4); }), side: THREE.DoubleSide }));
  sign.position.set(-0.25, 5.2 - 1.05, 0); sign.rotation.y = -Math.PI / 2; grp.add(sign);
  // the arm pivots at the booth and lies across the road
  const pivot = new THREE.Group(); pivot.position.set(0.2, 1.05, W / 2 + 0.4); grp.add(pivot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, W + 0.4), new THREE.MeshLambertMaterial({ map: canvas(16, 128, (g, w, hh) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d81e2c' : '#f4f4f4'; g.fillRect(0, i * 16, w, 16); } }) }));
  arm.position.z = -(W + 0.4) / 2; pivot.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: col(0xff2a2a) })); lamp.position.set(-0.3, 2.4, W / 2 + 0.5); grp.add(lamp);
  return { group: grp, pivot, lamp };
}
function gantry(track) {
  const k = track.n - 12, p = pointAt(track, k, 0), W = track.width;
  const grp = new THREE.Group(); grp.position.set(p.x, p.y, p.z); grp.rotation.y = -track.h[k];
  const steel = new THREE.MeshLambertMaterial({ color: col(0x8b939c) });
  for (const z of [-W / 2 - 1.2, W / 2 + 1.2]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); c.position.set(0, 3.5, z); grp.add(c); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, W + 3), steel); beam.position.y = 7; grp.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.4), new THREE.MeshBasicMaterial({ map: canvas(1024, 144, (g, w, h) => { g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd400'; g.font = '800 96px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GANTRY  ·  BRIDGE TO GANTRY', w / 2, h / 2 + 4); }), side: THREE.DoubleSide }));
  sign.position.set(-0.75, 7, 0); sign.rotation.y = -Math.PI / 2; grp.add(sign);
  return grp;
}

// ---------- cars ----------
// Each car is drawn from a side view, as a designer would sketch it: the lower body's outline (bumpers, bonnet,
// beltline, boot) cut round the wheel arches, with the wings bulging over them, extruded across the car's width with
// rounded edges; on top a glasshouse that narrows toward the roof (the tumblehome), painted pillars and roof, then
// mirrors, bumpers, grille, lights, number plates, an exhaust, wheels with spoked rims, and a soft shadow underneath.
// Proportions come from each car's real length, width and height; the shape comes from its style.
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
let shadowTex = null, plateTex = null;

export function carMesh(body) {
  const st = STYLE[body.style] || STYLE.hatch, L = body.len, Wd = body.wid, H = body.hgt;
  const clear = 0.16, X = f => -L / 2 + f * L, Y = f => clear * 0.4 + f * (H - clear * 0.4);
  const grp = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: col(body.color), roughness: 0.32, metalness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: col(body.trim), roughness: 0.55, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: col(0x16181b), roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: col(0x6f8398), roughness: 0.08, metalness: 0.9 });
  const wr = Math.min(0.36, H * 0.235), arch = wr + 0.06, wx = st.wheels.map(X);

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
  const bev = 0.07;
  const lowerGeo = new THREE.ExtrudeGeometry(sh, { depth: Wd - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12 });
  lowerGeo.translate(0, 0, -(Wd - 2 * bev) / 2);
  const lower = new THREE.Mesh(lowerGeo, paint); lower.castShadow = true; grp.add(lower);

  // ---------- the glasshouse, pillars and roof ----------
  const paintBits = [], trimBits = [], blackBits = [];
  const tw = Wd * 0.84;
  if (st.cab) {
    const cab = st.cab.map(([f, h]) => [X(f), Y(h)]);
    const g = new THREE.Mesh(slab(cab, tw), glass); g.castShadow = true; grp.add(g);
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
    // door mirrors at the foot of the windscreen
    for (const s of [-1, 1]) paintBits.push(box(0.12, 0.1, 0.16, cab[3][0] - 0.12, cab[3][1] + 0.08, s * (Wd / 2 + 0.06)));
  } else {
    // a roadster: the windscreen in its frame, roll hoops, two seats and the driver
    const xs = X(0.6), ys = Y(0.68);
    const ws = [[xs - 0.02, ys], [xs, ys], [xs - 0.3, H], [xs - 0.33, H]];
    grp.add(new THREE.Mesh(slab(ws, Wd * 0.8), glass));
    trimBits.push(slab([[xs - 0.33, H - 0.03], [xs - 0.29, H - 0.03], [xs - 0.3, H], [xs - 0.33, H]], Wd * 0.82));
    for (const s of [-1, 1]) { blackBits.push(box(0.4, 0.38, 0.5, X(0.42), ys + 0.08, s * Wd * 0.22)); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshStandardMaterial({ color: col(0x2a2a2a), roughness: 0.4 })); head.position.set(X(0.4), ys + 0.42, Wd * 0.22); grp.add(head);
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

  for (const [bits, mat] of [[paintBits, paint], [trimBits, trim], [blackBits, black]]) if (bits.length) { const m = new THREE.Mesh(merge(bits), mat); m.castShadow = true; grp.add(m); }

  // ---------- wheels: tyre, a five-spoke rim, the hub ----------
  const tyreG = new THREE.CylinderGeometry(wr, wr, 0.24, 18).rotateX(Math.PI / 2);
  const rimG = merge([new THREE.CylinderGeometry(wr * 0.66, wr * 0.66, 0.02, 18).rotateX(Math.PI / 2).translate(0, 0, 0.115), ...[0, 1, 2, 3, 4].map(i => box(wr * 0.12, wr * 1.3, 0.03, 0, 0, 0.12).rotateZ(i * Math.PI * 2 / 5))]);
  const tyre = new THREE.MeshStandardMaterial({ color: col(0x141414), roughness: 0.9 }), rim = new THREE.MeshStandardMaterial({ color: col(0xc0c6cc), metalness: 0.8, roughness: 0.25 }), dark = new THREE.MeshStandardMaterial({ color: col(0x2a2e33), roughness: 0.6 });
  const hubG = new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.2, 14).rotateX(Math.PI / 2);
  grp.wheels = [];
  for (const [x, s] of [[wx[1], 1], [wx[1], -1], [wx[0], 1], [wx[0], -1]]) {
    const w = new THREE.Group(); w.position.set(x, wr, s * (Wd / 2 - 0.13));
    const r = new THREE.Mesh(rimG, rim); if (s < 0) r.rotation.y = Math.PI;
    w.add(new THREE.Mesh(tyreG, tyre), new THREE.Mesh(hubG, dark), r); grp.add(w); grp.wheels.push(w);
  }

  // ---------- a soft shadow, so the car sits on the road from any distance ----------
  if (!shadowTex) shadowTex = canvas(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.15, Wd * 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  blob.position.y = 0.04; blob.renderOrder = 1; grp.add(blob);
  return grp;
}
