// The kit: what every building in Cathedral Lab is made of. A building module calls createKit() and adds its pieces step
// by step; each piece has its geometry, its weight, the area it bears on and the pieces it rests on, so the kit can
// work out the load every piece carries. The geometry helpers below need no kit and are plain functions.
// Units: metres, kN. Nothing here touches the page.
import * as THREE from './vendor/three.module.js?v=0.15';
import * as Solver from './solver.js?v=0.15';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const GAMMA = Solver.GAMMA, OAK = 7.5, LEAD = 111;   // unit weights, kN/m3: limestone, oak, lead

// geometry helpers, all built in world coordinates
export function boxG(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
export function cylG(r0, r1, y0, y1, x, z, seg = 32) { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); return g; }
export function shapeOf(pts, holes = []) {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  holes.forEach(h => sh.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))))); return sh;
}
export function area2(pts) { return Math.abs(THREE.ShapeUtils.area(pts.map(([a, b]) => new THREE.Vector2(a, b)))); }
// extrude a vertical profile drawn in (s, y), s along direction (dx, dz) from (ox, oz), centered on the extrusion axis
export function extr(pts, holes, depth, ox, oz, dx, dz) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts, holes), { depth, bevelEnabled: false, curveSegments: 12 });
  const m = new THREE.Matrix4().set(dx, 0, -dz, ox + dz * depth / 2, 0, 1, 0, 0, dz, 0, dx, oz - dx * depth / 2, 0, 0, 0, 1);
  g.applyMatrix4(m); g.computeVertexNormals(); return g;
}
export function extrVol(pts, holes, depth) { return (area2(pts) - holes.reduce((a, h) => a + area2(h), 0)) * depth; }
export function lancet(cx, y0, w, hr) {
  const ys = y0 + hr, pts = [[cx - w / 2, y0], [cx + w / 2, y0]];
  for (let i = 0; i <= 16; i++) { const a = Math.PI / 3 * i / 16; pts.push([cx - w / 2 + w * Math.cos(a), ys + w * Math.sin(a)]); }
  for (let i = 16; i >= 0; i--) { const a = Math.PI / 3 * i / 16; pts.push([cx + w / 2 - w * Math.cos(a), ys + w * Math.sin(a)]); }
  return pts;
}
export const rect = (a0, a1, y0, y1) => [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
export function circle(cx, cy, r, n = 48) { const p = []; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
// voussoir outlines of an arch, both halves, optional keystone
// (the solver draws each curved edge with 11 points; every other one is plenty on screen, and the weights come from the
// solver's exact areas, so thinning them changes nothing but the vertex count)
export const thin = pts => pts.filter((_, i) => (i % 11) % 2 === 0);
export function archShapes(B, sx = 1, withKey = true) {
  const out = [];
  B.blocks.forEach((b, j) => { const pts = thin(b.poly); out.push({ j, side: -1, A: b.A * sx, pts: pts.map(([x, y]) => [x * sx, y]) }); out.push({ j, side: 1, A: b.A * sx, pts: pts.map(([x, y]) => [-x * sx, y]) }); });
  if (withKey) out.push({ j: B.k, side: 0, key: true, A: B.key.A * 2 * sx, pts: thin(B.key.full).map(([x, y]) => [x * sx, y]) });
  return out;
}
// ruled surface between two curves for vault webbing
export function ruled(A, B, q0, q1, nq = 8, nr = 10) {
  const pos = [], idx = []; let area = 0;
  for (let i = 0; i <= nq; i++) { const q = q0 + (q1 - q0) * i / nq, a = A(q), b = B(q); for (let j = 0; j <= nr; j++) { const v = a.clone().lerp(b, j / nr); pos.push(v.x, v.y, v.z); } }
  for (let i = 0; i < nq; i++) for (let j = 0; j < nr; j++) { const a = i * (nr + 1) + j, b = a + nr + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const P = i => V3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  for (let t = 0; t < idx.length; t += 3) area += P(idx[t + 1]).sub(P(idx[t])).cross(P(idx[t + 2]).sub(P(idx[t]))).length() / 2;
  return { g, area };
}

export function createKit() {
  const pieces = [], byId = {}, steps = [];
  let cur = -1, BAGNO = 0, BAGNAME = '';
  const bag = (n, name) => { BAGNO = n; BAGNAME = name; };
  const step = (title, note, opts = {}) => { steps.push({ bag: BAGNO, bagName: BAGNAME, title, note, focus: opts.focus || null }); cur = steps.length - 1; return cur; };
  const at = () => cur;                                     // the step being built
  function add(id, kind, name, geo, o = {}) {
    if (byId[id]) throw new Error(`two pieces called ${id}`);
    const p = { id, kind, name, geo, step: cur, until: null, mat: o.mat || 'stone', w: o.w || 0, bear: o.bear || 0, sup: o.sup || [], group: o.group || null, tint: o.tint };
    pieces.push(p); byId[id] = p; return p;
  }
  const removeAt = filter => pieces.filter(filter).forEach(p => p.until = cur);
  // place an arch as pieces with a load chain toward its springers
  function placeArch(prefix, B, { sx = 1, y0, depth, ox, oz, dx, dz, springL, springR, kind = 'voussoir', name, withKey = true, mat = 'stone' }) {
    const ids = [];
    for (const a of archShapes(B, sx, withKey)) {
      const pts = a.pts.map(([s, y]) => [s, y + y0]);
      const id = `${prefix}-${a.key ? 'K' : (a.side < 0 ? 'L' : 'R') + a.j}`;
      let sup;
      if (a.key) sup = [[`${prefix}-L${B.k - 1}`, 0.5], [`${prefix}-R${B.k - 1}`, 0.5]];
      else if (a.j > 0) sup = [[`${prefix}-${a.side < 0 ? 'L' : 'R'}${a.j - 1}`, 1]];
      else sup = a.side < 0 ? springL : springR;
      add(id, a.key ? 'keystone' : kind, a.key ? `${name}, keystone` : `${name}, ${kind} ${a.j + 1}`, extr(pts, [], depth, ox, oz, dx, dz),
        { w: a.A * depth * GAMMA * (mat === 'timber' ? OAK / GAMMA : 1), bear: B.t * depth, sup, mat });
      ids.push(id);
    }
    return ids;
  }
  // timber centering under an arch: a curved lagging rib, a tie and three posts
  function placeCentering(prefix, B, { sx = 1, y0, ox, oz, dx, dz, ground = 0 }) {
    const W = (s, y, e = 0) => V3(ox + s * dx - e * dz, y, oz + s * dz + e * dx);
    const half = B.intrados.map(([x, y]) => [x * sx, y]);
    const pts = [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])].map(([s, y]) => W(s, y + y0 - 0.14));
    const lag = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.13, 6, false);
    add(`${prefix}-lag`, 'centering timber', 'Centering, curved rib', lag, { mat: 'timber' });
    const xs = half[0][0], tie = y0 - 0.3;
    const beam = (a, b, r, id, nm) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 6, 1, true); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); add(id, 'centering timber', nm, g, { mat: 'timber' }); };
    beam(W(xs, tie), W(-xs, tie), 0.12, `${prefix}-tie`, 'Centering, tie beam');
    const yAt = s => { let best = half[0]; for (const p of [...half, ...half.map(([x, y]) => [-x, y])]) if (Math.abs(p[0] - s) < Math.abs(best[0] - s)) best = p; return best[1] + y0 - 0.2; };
    for (const [q, n] of [[0.5, 'a'], [0, 'b'], [-0.5, 'c']]) beam(W(xs * q, tie), W(xs * q, yAt(xs * q)), 0.09, `${prefix}-post${n}`, 'Centering, strut');
    for (const q of [0.5, -0.5]) beam(W(xs * q, ground), W(xs * q, tie), 0.1, `${prefix}-leg${q > 0 ? 'a' : 'b'}`, 'Centering, prop');
  }
  // the load model: each piece carries its own weight plus its share of everything resting on it, down to the ground.
  // Weight only; a building's sideways pushes are in its force lines. finish() links the pieces once all are added.
  const live = (p, n) => p.step < n && !(p.until != null && p.until < n);
  let dependents = null;
  function finish() {
    dependents = new Map();
    pieces.forEach(p => p.sup.forEach(([id, f]) => { if (!byId[id]) throw new Error(`missing support ${id} under ${p.id}`); if (!dependents.has(id)) dependents.set(id, []); dependents.get(id).push([p, f]); }));
  }
  function computeLoads(n) {
    const memo = new Map();
    const carried = p => { if (memo.has(p.id)) return memo.get(p.id); let w = p.w; for (const [q, f] of dependents.get(p.id) || []) if (live(q, n)) w += f * carried(q); memo.set(p.id, w); return w; };
    pieces.forEach(p => { p.load = live(p, n) ? carried(p) : 0; p.stress = p.bear ? p.load / p.bear / 1000 : 0; });
  }
  return { pieces, byId, steps, bag, step, at, add, removeAt, placeArch, placeCentering, finish, live, computeLoads };
}
