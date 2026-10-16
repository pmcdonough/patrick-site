// Three bays of Notre-Dame's nave as a kit: every piece with its geometry, weight, bearing area and what it rests on,
// grouped in steps and bags in the order the masons built. Like the solver, it never touches the page: the page
// (main.js) draws the pieces, steps through them and reads the loads and force lines from here.
// Units: metres, kN. x runs across the nave (north negative), y up, z along the nave.
import * as THREE from './vendor/three.module.js?v=0.1';
import * as Solver from './solver.js?v=0.1';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const GAMMA = Solver.GAMMA, OAK = 7.5, LEAD = 111;   // unit weights, kN/m3: limestone, oak, lead

// ---------- Geometry of the bay, from the solver ----------
const S = 12, T = 0.7, RIBW = 0.6, H0 = 24, WT = 1.2, L = 6.5, NB = 3;
const ARCH = Solver.build({ shape: 'pointed', span: S, thick: T, count: 11 });
const SOL = Solver.solve(ARCH);
const SUP = Solver.supports(ARCH, SOL.state, { height: H0, width: WT, flyer: true, bdepth: 3.8, pinnacle: true });
const XI = ARCH.joints[0].A[0], XO = XI - WT, XW = (XI + XO) / 2, FL = SUP.flyer;
const ZS = [0, 1, 2, 3].map(i => -9.75 + L * i), ZC = b => ZS[b] + L / 2;
const SIDES = [-1, 1], SN = s => s < 0 ? 'north' : 'south', X = (s, x) => s < 0 ? x : -x;
const LEV = [9.2, 14.6, 19.6, 24, 29.4, 34.8];

// ---------- Pieces and steps ----------
const pieces = [], byId = {}, steps = [];
let cur = -1;
function bag(n, name) { BAGNO = n; BAGNAME = name; }
let BAGNO = 0, BAGNAME = '';
function step(title, note, opts = {}) { steps.push({ bag: BAGNO, bagName: BAGNAME, title, note, focus: opts.focus || null }); cur = steps.length - 1; }
function add(id, kind, name, geo, o = {}) {
  const p = { id, kind, name, geo, step: cur, until: null, mat: o.mat || 'stone', w: o.w || 0, bear: o.bear || 0, sup: o.sup || [], group: o.group || null, tint: o.tint };
  pieces.push(p); byId[id] = p; return p;
}
function removeAt(filter) { pieces.filter(filter).forEach(p => p.until = cur); }

// geometry helpers, all built in world coordinates
function boxG(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function cylG(r0, r1, y0, y1, x, z, seg = 32) { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); return g; }
function shapeOf(pts, holes = []) {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  holes.forEach(h => sh.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))))); return sh;
}
function area2(pts) { return Math.abs(THREE.ShapeUtils.area(pts.map(([a, b]) => new THREE.Vector2(a, b)))); }
// extrude a vertical profile drawn in (s, y), s along direction (dx, dz) from (ox, oz), centered on the extrusion axis
function extr(pts, holes, depth, ox, oz, dx, dz) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts, holes), { depth, bevelEnabled: false, curveSegments: 12 });
  const m = new THREE.Matrix4().set(dx, 0, -dz, ox + dz * depth / 2, 0, 1, 0, 0, dz, 0, dx, oz - dx * depth / 2, 0, 0, 0, 1);
  g.applyMatrix4(m); g.computeVertexNormals(); return g;
}
function extrVol(pts, holes, depth) { return (area2(pts) - holes.reduce((a, h) => a + area2(h), 0)) * depth; }
function lancet(cx, y0, w, hr) {
  const ys = y0 + hr, pts = [[cx - w / 2, y0], [cx + w / 2, y0]];
  for (let i = 0; i <= 16; i++) { const a = Math.PI / 3 * i / 16; pts.push([cx - w / 2 + w * Math.cos(a), ys + w * Math.sin(a)]); }
  for (let i = 16; i >= 0; i--) { const a = Math.PI / 3 * i / 16; pts.push([cx + w / 2 - w * Math.cos(a), ys + w * Math.sin(a)]); }
  return pts;
}
function circle(cx, cy, r, n = 48) { const p = []; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
// voussoir outlines of an arch, both halves, optional keystone
function archShapes(B, sx = 1, withKey = true) {
  const out = [];
  B.blocks.forEach((b, j) => { out.push({ j, side: -1, pts: b.poly.map(([x, y]) => [x * sx, y]) }); out.push({ j, side: 1, pts: b.poly.map(([x, y]) => [-x * sx, y]) }); });
  if (withKey) out.push({ j: B.k, side: 0, key: true, pts: B.key.full.map(([x, y]) => [x * sx, y]) });
  return out;
}
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
      { w: extrVol(pts, [], depth) * GAMMA * (mat === 'timber' ? OAK / GAMMA : 1), bear: B.t * depth, sup, mat });
    ids.push(id);
  }
  return ids;
}
// timber centering under an arch: a curved lagging rib, a tie and three posts
function placeCentering(prefix, B, { sx = 1, y0, ox, oz, dx, dz, ground = 0 }) {
  const W = (s, y, e = 0) => V3(ox + s * dx - e * dz, y, oz + s * dz + e * dx);
  const half = B.intrados.map(([x, y]) => [x * sx, y]);
  const pts = [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])].map(([s, y]) => W(s, y + y0 - 0.14));
  const lag = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.13, 10, false);
  add(`${prefix}-lag`, 'centering timber', 'Centering, curved rib', lag, { mat: 'timber' });
  const xs = half[0][0], tie = y0 - 0.3;
  const beam = (a, b, r, id, nm) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 10); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); add(id, 'centering timber', nm, g, { mat: 'timber' }); };
  beam(W(xs, tie), W(-xs, tie), 0.12, `${prefix}-tie`, 'Centering, tie beam');
  const yAt = s => { let best = half[0]; for (const p of [...half, ...half.map(([x, y]) => [-x, y])]) if (Math.abs(p[0] - s) < Math.abs(best[0] - s)) best = p; return best[1] + y0 - 0.2; };
  for (const [q, n] of [[0.5, 'a'], [0, 'b'], [-0.5, 'c']]) beam(W(xs * q, tie), W(xs * q, yAt(xs * q)), 0.09, `${prefix}-post${n}`, 'Centering, strut');
  for (const q of [0.5, -0.5]) beam(W(xs * q, ground), W(xs * q, tie), 0.1, `${prefix}-leg${q > 0 ? 'a' : 'b'}`, 'Centering, prop');
}
// ruled surface between two curves for vault webbing
function ruled(A, B, q0, q1, nq = 8, nr = 10) {
  const pos = [], idx = []; let area = 0;
  for (let i = 0; i <= nq; i++) { const q = q0 + (q1 - q0) * i / nq, a = A(q), b = B(q); for (let j = 0; j <= nr; j++) { const v = a.clone().lerp(b, j / nr); pos.push(v.x, v.y, v.z); } }
  for (let i = 0; i < nq; i++) for (let j = 0; j < nr; j++) { const a = i * (nr + 1) + j, b = a + nr + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const P = i => V3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  for (let t = 0; t < idx.length; t += 3) area += P(idx[t + 1]).sub(P(idx[t])).cross(P(idx[t + 2]).sub(P(idx[t]))).length() / 2;
  return { g, area };
}
const pid = (k, s, i, c) => `${k}-${s < 0 ? 'N' : 'S'}${i}${c != null ? '-' + c : ''}`;

// ---------- Bag 1: FOUNDATIONS ----------
bag(1, 'Foundations');
step('Footings under the nave piers', 'Every load in the building ends up here. Each round pier gets a square footing, wider than the pier so the weight spreads into the ground.');
for (const s of SIDES) ZS.forEach((z, i) => add(pid('F', s, i), 'footing', `Footing, ${SN(s)} pier ${i + 1}`, boxG(X(s, XW) - 1.3, X(s, XW) + 1.3, 0, 0.6, z - 1.3, z + 1.3), { w: 2.6 * 2.6 * 0.6 * GAMMA, bear: 2.6 * 2.6 }));
step('Footings for the outer walls and buttresses', 'The buttress footings are the biggest in the building. They will take the vault\'s sideways push, so they spread wide to the outside.');
for (const s of SIDES) {
  ZS.forEach((z, i) => add(pid('FB', s, i), 'footing', `Footing, ${SN(s)} buttress ${i + 1}`, boxG(...(s < 0 ? [FL.xbO - 0.4, FL.xbI + 0.3] : [-FL.xbI - 0.3, -FL.xbO + 0.4]), 0, 0.6, z - 1.0, z + 1.0), { w: 4.5 * 2 * 0.6 * GAMMA, bear: 4.5 * 2 }));
  for (let b = 0; b < NB; b++) add(pid('FW', s, b), 'footing', `Footing, ${SN(s)} aisle wall ${b + 1}`, boxG(...(s < 0 ? [FL.xbI - 1.2, FL.xbI + 0.2] : [-FL.xbI - 0.2, -FL.xbI + 1.2]), 0, 0.6, ZS[b] + 1.0, ZS[b + 1] - 1.0), { w: 1.4 * 4.5 * 0.6 * GAMMA, bear: 1.4 * 4.5 });
}

// ---------- Bag 2: PIERS ----------
bag(2, 'Nave piers');
step('Pier bases', 'Eight-sided plinths, set dead level. Any tilt here would be multiplied thirty metres up.');
for (const s of SIDES) ZS.forEach((z, i) => add(pid('B', s, i), 'pier base', `Base, ${SN(s)} pier ${i + 1}`, cylG(1.08, 1.0, 0.6, 1.2, X(s, XW), z, 8), { w: Math.PI * 1.04 * 1.04 * 0.6 * GAMMA, bear: Math.PI, sup: [[pid('F', s, i), 1]] }));
[[1.2, 3.6], [3.6, 6.0], [6.0, 8.4]].forEach(([y0, y1], c) => {
  step(`Pier drums, course ${c + 1} of 3`, c === 0 ? 'Notre-Dame\'s nave stands on big round piers. Each is stacked from drums of limestone, about 1.5 m across.' : c === 1 ? 'Drums go on in level courses all the way around the building, so no pier gets ahead of its neighbours.' : 'The last drums. Each pier now carries nothing but itself: under a quarter of a megapascal at the base.');
  for (const s of SIDES) ZS.forEach((z, i) => add(pid('D', s, i, c), 'drum', `Drum ${c + 1}, ${SN(s)} pier ${i + 1}`, cylG(0.75, 0.75, y0, y1, X(s, XW), z, 48), { w: Math.PI * 0.5625 * (y1 - y0) * GAMMA, bear: Math.PI * 0.5625, sup: [[c ? pid('D', s, i, c - 1) : pid('B', s, i), 1]] }));
});
step('Capitals and abacus blocks', 'The capital flares the round pier out to a square top, the abacus, wide enough for arches to land on from four directions.');
for (const s of SIDES) ZS.forEach((z, i) => {
  add(pid('C', s, i), 'capital', `Capital, ${SN(s)} pier ${i + 1}`, cylG(0.75, 1.02, 8.4, 8.9, X(s, XW), z, 48), { w: Math.PI * 0.8 * 0.5 * GAMMA, bear: Math.PI * 0.5625, sup: [[pid('D', s, i, 2), 1]] });
  add(pid('AB', s, i), 'abacus block', `Abacus, ${SN(s)} pier ${i + 1}`, boxG(X(s, XW) - 0.85, X(s, XW) + 0.85, 8.9, 9.2, z - 0.85, z + 0.85), { w: 1.7 * 1.7 * 0.3 * GAMMA, bear: 1.7 * 1.7, sup: [[pid('C', s, i), 1]] });
});

// ---------- Bag 3: ARCADE ----------
bag(3, 'Arcade');
const ARC = Solver.build({ shape: 'pointed', span: 5.4, thick: 0.6, count: 9 });
step('Centering for the arcade', 'Before an arch can stand, it needs a timber frame to rest on. Carpenters build one under each opening between the piers.');
for (const s of SIDES) for (let b = 0; b < NB; b++) placeCentering(pid('AC', s, b), ARC, { y0: 9.2, ox: X(s, XW), oz: ZC(b), dx: 0, dz: 1, ground: 0 });
const STEP_ARC_CEN = cur;
step('Arcade arches', 'Nine stones in each arch, laid from both piers at once and closed with a keystone. Until the keystone is in, the centering carries every stone.');
for (const s of SIDES) for (let b = 0; b < NB; b++)
  placeArch(pid('A', s, b), ARC, { y0: 9.2, depth: WT, ox: X(s, XW), oz: ZC(b), dx: 0, dz: 1, springL: [[pid('AB', s, b), 1]], springR: [[pid('AB', s, b + 1), 1]], name: `Arcade arch, ${SN(s)} bay ${b + 1}` });
step('Strike the arcade centering', 'Knock out the wedges and the frames drop away. The arches now carry themselves and push gently outward on the piers.');
removeAt(p => p.step === STEP_ARC_CEN);
step('Spandrels and wall piers', 'Solid masonry fills the corners above the arches, and square wall piers start up from each capital. This is the base of the upper walls.');
for (const s of SIDES) {
  ZS.forEach((z, i) => add(pid('P', s, i, 0), 'wall-pier stone', `Wall pier, ${SN(s)} line ${i + 1}, course 1`, boxG(X(s, XW) - WT / 2, X(s, XW) + WT / 2, LEV[0], LEV[1], z - 0.7, z + 0.7), { w: WT * 1.4 * (LEV[1] - LEV[0]) * GAMMA, bear: WT * 1.4, sup: [[pid('AB', s, i), 1]] }));
  for (let b = 0; b < NB; b++) {
    const ext = ARC.extrados.map(([x, y]) => [x, y + 9.2]).filter(([x]) => x >= -2.55);
    const pts = [[-2.55, ext[0][1]], ...ext, ...ext.slice().reverse().map(([x, y]) => [-x, y]), [2.55, ext[0][1]], [2.55, LEV[1]], [-2.55, LEV[1]]];
    add(pid('SP', s, b), 'spandrel', `Spandrel, ${SN(s)} bay ${b + 1}`, extr(pts, [], WT, X(s, XW), ZC(b), 0, 1), { w: extrVol(pts, [], WT) * GAMMA, bear: 5.1 * WT, sup: [[pid('A', s, b) + '-K', 1]] });
  }
}

// ---------- Bag 4: AISLES ----------
bag(4, 'Aisles');
const BX0 = s => s < 0 ? FL.xbO : -FL.xbI, BX1 = s => s < 0 ? FL.xbI : -FL.xbO;
step('Buttress piers, lower course', 'Outside the aisle, a deep pier rises at each bay line. For now it is just the aisle\'s outer support. Later it becomes the anchor for a flying buttress.');
for (const s of SIDES) ZS.forEach((z, i) => add(pid('BU', s, i, 0), 'buttress stone', `Buttress, ${SN(s)} line ${i + 1}, course 1`, boxG(BX0(s), BX1(s), 0.6, 8, z - 0.7, z + 0.7), { w: 3.8 * 1.4 * 7.4 * GAMMA, bear: 3.8 * 1.4, sup: [[pid('FB', s, i), 1]] }));
step('Aisle walls', 'The outer walls of the aisles, each with a tall window. They are thin because they carry little: the buttresses do the work.');
for (const s of SIDES) for (let b = 0; b < NB; b++) {
  const pts = [[-2.55, 0.6], [2.55, 0.6], [2.55, 14.6], [-2.55, 14.6]], hole = lancet(0, 3.6, 1.8, 4.0);
  const ox = s < 0 ? FL.xbI - 0.5 : -FL.xbI + 0.5;
  add(pid('AW', s, b), 'wall stone', `Aisle wall, ${SN(s)} bay ${b + 1}`, extr(pts, [hole], 1.0, ox, ZC(b), 0, 1), { w: extrVol(pts, [hole], 1.0) * GAMMA, bear: 5.1, sup: [[pid('FW', s, b), 1]], group: 'aislewin' });
}
const AA = Solver.build({ shape: 'pointed', span: 5.05, thick: 0.5, count: 7 });
const AAX = s => s < 0 ? -9.375 : 9.375;
step('Aisle arches', 'A pointed arch springs across the aisle at every bay line, from the nave pier to the buttress.');
for (const s of SIDES) ZS.forEach((z, i) => {
  const toPier = [[pid('AB', s, i), 1]], toBut = [[pid('BU', s, i, 0), 1]];
  placeArch(pid('AA', s, i), AA, { y0: 9.2, depth: 0.5, ox: AAX(s), oz: z, dx: 1, dz: 0, springL: s < 0 ? toBut : toPier, springR: s < 0 ? toPier : toBut, name: `Aisle arch, ${SN(s)} line ${i + 1}` });
});
step('Aisle vaults', 'Between the arches, the masons lay curved courses of rubble stone to close the aisle ceiling.');
for (const s of SIDES) for (let b = 0; b < NB; b++) {
  const cl = AA.c, k = u => { const p = cl.p(u), n = cl.n(u); return [p[0] + n[0] * 0.2, p[1] + n[1] * 0.2 + 9.2]; };
  for (const h of [-1, 1]) {
    const Apt = (q, z) => { const [x, y] = k(q * cl.uCrown); return V3(AAX(s) + (h < 0 ? x : -x), y, z); };
    const r = ruled(q => Apt(q, ZS[b] + 0.25), q => Apt(q, ZS[b + 1] - 0.25), 0, 1, 10, 12);
    add(pid('AV', s, b, h < 0 ? 'a' : 'b'), 'web panel', `Aisle vault, ${SN(s)} bay ${b + 1}`, r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup: [[pid('AB', s, b), 0.25], [pid('AB', s, b + 1), 0.25], [pid('BU', s, b, 0), 0.25], [pid('BU', s, b + 1, 0), 0.25]] });
  }
}

// ---------- Bag 5: UPPER WALLS ----------
bag(5, 'Upper walls');
const wallPier = (c, note) => { for (const s of SIDES) ZS.forEach((z, i) => add(pid('P', s, i, c), 'wall-pier stone', `Wall pier, ${SN(s)} line ${i + 1}, course ${c + 1}`, boxG(X(s, XW) - WT / 2, X(s, XW) + WT / 2, LEV[c], LEV[c + 1], z - 0.7, z + 0.7), { w: WT * 1.4 * (LEV[c + 1] - LEV[c]) * GAMMA, bear: WT * 1.4, sup: [[pid('P', s, i, c - 1), 1]] })); };
const panel = (key, kind, nm, c, holes, glass) => { for (const s of SIDES) for (let b = 0; b < NB; b++) {
  const pts = [[-2.55, LEV[c]], [2.55, LEV[c]], [2.55, LEV[c + 1] + (c === 3 ? 5.4 : 0)], [-2.55, LEV[c + 1] + (c === 3 ? 5.4 : 0)]];
  add(pid(key, s, b), kind, `${nm}, ${SN(s)} bay ${b + 1}`, extr(pts, holes, WT, X(s, XW), ZC(b), 0, 1), { w: extrVol(pts, holes, WT) * GAMMA, bear: 5.1 * WT * 0.8, sup: [[pid('P', s, b, c), 0.5], [pid('P', s, b + 1, c), 0.5]], group: glass }); } };
step('Gallery', 'Above the aisles runs a gallery, open to the nave through pairs of pointed openings.');
wallPier(1); panel('G', 'wall stone', 'Gallery wall', 1, [lancet(-1.2, 15.0, 1.3, 2.6), lancet(1.2, 15.0, 1.3, 2.6)], 'gallery');
step('The band and its round windows', 'A plain band of wall with a small round opening in each bay. Viollet-le-Duc restored round openings like these near the crossing in the 1800s.');
wallPier(2); panel('BD', 'wall stone', 'Band wall', 2, [circle(0, 21.8, 0.9)], 'oculus');
step('Vaulting shafts', 'Slender shafts run up the inside of each wall pier from the capitals to where the vault will begin, 24 m up. They will catch the vault\'s ribs.');
for (const s of SIDES) ZS.forEach((z, i) => [-0.38, 0, 0.38].forEach((dz, k) => add(pid('SH', s, i, k), 'shaft', `Shaft, ${SN(s)} line ${i + 1}`, cylG(0.15, 0.15, 9.2, 24, X(s, XI + 0.16), z + dz, 16), { w: Math.PI * 0.0225 * 14.8 * GAMMA, bear: Math.PI * 0.0225, sup: [[pid('AB', s, i), 1]] })));
step('Clerestory', 'The top of the wall, pierced by a tall lancet window in each bay. The higher the windows, the more light, and the more the walls depend on buttresses.');
wallPier(3); wallPier(4);
panel('CL', 'wall stone', 'Clerestory wall', 3, [lancet(0, 24.5, 2.6, 2.0)], 'clere');
step('Cornice', 'A projecting course of stone caps each wall. The roof timbers will sit on it.');
for (const s of SIDES) for (let b = 0; b < NB; b++) add(pid('CO', s, b), 'cornice stone', `Cornice, ${SN(s)} bay ${b + 1}`, boxG(...(s < 0 ? [XO - 0.3, XI + 0.05] : [-XI - 0.05, -XO + 0.3]), 34.8, 35.2, ZS[b], ZS[b + 1]), { w: 1.55 * 0.4 * L * GAMMA, bear: 1.55 * L, sup: [[pid('CL', s, b), 1]] });

// ---------- Bag 6: BUTTRESSES ----------
bag(6, 'Flying buttresses');
step('Buttress piers, upper courses', 'The outer piers rise to 19 m. Their depth, 3.8 m, is what will hold the vault up. Even with the vault\'s push, the resultant at their base stays inside the middle third.');
for (const s of SIDES) ZS.forEach((z, i) => {
  add(pid('BU', s, i, 1), 'buttress stone', `Buttress, ${SN(s)} line ${i + 1}, course 2`, boxG(BX0(s), BX1(s), 8, 14, z - 0.7, z + 0.7), { w: 3.8 * 1.4 * 6 * GAMMA, bear: 3.8 * 1.4, sup: [[pid('BU', s, i, 0), 1]] });
  add(pid('BU', s, i, 2), 'buttress stone', `Buttress, ${SN(s)} line ${i + 1}, course 3`, boxG(BX0(s), BX1(s), 14, FL.hb, z - 0.7, z + 0.7), { w: 3.8 * 1.4 * (FL.hb - 14) * GAMMA, bear: 3.8 * 1.4, sup: [[pid('BU', s, i, 1), 1]] });
});
const flyerPolys = () => { // five stones along the strut, straight top, arched underside
  const n = 5, d = 0.6, x0 = XO, x1 = FL.xbI, top = x => FL.yA + (FL.yB - FL.yA) * (x - x0) / (x1 - x0) + d / 2, sag = x => { const q = (x - x1) / (x0 - x1); return 0.9 * Math.sin(Math.PI * q); };
  const bot = x => top(x) - d - sag(x), out = [];
  for (let i = 0; i < n; i++) { const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n, pts = [];
    for (let k = 0; k <= 6; k++) { const x = a + (b - a) * k / 6; pts.push([x, top(x)]); }
    for (let k = 6; k >= 0; k--) { const x = a + (b - a) * k / 6; pts.push([x, bot(x)]); }
    out.push(pts); }
  return out;
};
step('Centering for the flyers', 'Each flyer is a half arch leaping over the aisle roof. It gets its own small centering.');
for (const s of SIDES) ZS.forEach((z, i) => {
  const xa = X(s, XO), xb = X(s, FL.xbI), ya = FL.yA - 1.6, yb = FL.yB - 0.8;
  const tube = new THREE.CylinderGeometry(0.12, 0.12, Math.hypot(xb - xa, yb - ya), 10); tube.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(xb - xa, yb - ya, 0).normalize()))); tube.translate((xa + xb) / 2, (ya + yb) / 2, z);
  add(pid('FC', s, i), 'centering timber', 'Flyer centering, rib', tube, { mat: 'timber' });
  [0.3, 0.7].forEach((q, k) => { const x = xa + (xb - xa) * q, y = ya + (yb - ya) * q; add(pid('FC', s, i, k), 'centering timber', 'Flyer centering, prop', cylG(0.09, 0.09, 14.6, y, x, z, 10), { mat: 'timber' }); });
});
const STEP_FLY_CEN = cur;
step('Flying buttresses', 'Five stones each, from the top of the nave wall down to the buttress pier. They will carry the vault\'s sideways push out over the aisle, about 50 kN for every metre of vault.');
for (const s of SIDES) ZS.forEach((z, i) => flyerPolys().forEach((poly, k) => {
  const pts = poly.map(([x, y]) => [X(s, x), y]);
  add(pid('FY', s, i, k), 'flyer stone', `Flyer, ${SN(s)} line ${i + 1}, stone ${k + 1}`, extr(pts, [], 0.8, 0, z, 1, 0), { w: extrVol(pts, [], 0.8) * GAMMA, bear: 0.8 * 0.6, sup: [[pid('BU', s, i, 2), 0.5], [pid('P', s, i, 2), 0.5]] });
}));
step('Strike the flyer centering', 'The flyers stand on their own. They are in place before the vault, so when the vault starts pushing there is already something to push against.');
removeAt(p => p.step === STEP_FLY_CEN);
step('Pinnacles', 'A pinnacle on each buttress. It adds weight right where the flyer\'s push arrives. Try it in the arch lab: the effect is real but small.');
for (const s of SIDES) ZS.forEach((z, i) => {
  const cx = (BX0(s) + BX1(s)) / 2;
  add(pid('PN', s, i, 0), 'pinnacle stone', `Pinnacle shaft, ${SN(s)} line ${i + 1}`, boxG(cx - 0.95, cx + 0.95, FL.hb, FL.hb + 2.2, z - 0.6, z + 0.6), { w: 1.9 * 1.2 * 2.2 * GAMMA, bear: 1.9 * 1.2, sup: [[pid('BU', s, i, 2), 1]] });
  const sp = new THREE.ConeGeometry(1.05, 3.6, 4); sp.rotateY(Math.PI / 4); sp.translate(cx, FL.hb + 2.2 + 1.8, z);
  add(pid('PN', s, i, 1), 'spire stone', `Pinnacle spire, ${SN(s)} line ${i + 1}`, sp, { w: 1.3 * 3.6 / 3 * GAMMA, bear: 1.2, sup: [[pid('PN', s, i, 0), 1]] });
  const fin = new THREE.SphereGeometry(0.22, 16, 12); fin.translate(cx, FL.hb + 6.0, z);
  add(pid('PN', s, i, 2), 'finial', `Finial, ${SN(s)} line ${i + 1}`, fin, { w: 1, sup: [[pid('PN', s, i, 1), 1]] });
});

// ---------- Bag 7: THE VAULT ----------
bag(7, 'The vault');
const D = Math.hypot(S, L), D1 = [S / D, L / D], D2 = [S / D, -L / D];
const FM = Solver.build({ shape: 'pointed', span: 5.9, thick: 0.35, count: 7 });
step('Centering for the ribs', 'The big one. A timber frame goes up under every rib, 24 m above the floor, standing on the gallery and the floor of the nave.');
ZS.forEach((z, i) => placeCentering(`TC${i}`, ARCH, { y0: H0, ox: 0, oz: z, dx: 1, dz: 0, ground: 0 }));
for (let b = 0; b < NB; b++) { placeCentering(`DC${b}a`, ARCH, { sx: D / S, y0: H0, ox: 0, oz: ZC(b), dx: D1[0], dz: D1[1], ground: 0 }); placeCentering(`DC${b}b`, ARCH, { sx: D / S, y0: H0, ox: 0, oz: ZC(b), dx: D2[0], dz: D2[1], ground: 0 }); }
const STEP_VAULT_CEN = cur;
step('Transverse ribs', 'Eleven stones across the nave at each bay line, closed by a keystone. This is the arch from the arch lab, at full size.');
const P3 = (s, i) => [[pid('P', s, i, 2), 1]];
ZS.forEach((z, i) => placeArch(`TR${i}`, ARCH, { y0: H0, depth: RIBW, ox: 0, oz: z, dx: 1, dz: 0, springL: P3(-1, i), springR: P3(1, i), name: `Transverse rib ${i + 1}` }));
step('Diagonal ribs and bosses', 'Two ribs cross each bay corner to corner. Where they meet at the top, a carved boss locks them together.');
for (let b = 0; b < NB; b++) {
  placeArch(`DA${b}`, ARCH, { sx: D / S, y0: H0, depth: RIBW * 0.9, ox: 0, oz: ZC(b), dx: D1[0], dz: D1[1], springL: P3(-1, b), springR: P3(1, b + 1), name: `Diagonal rib, bay ${b + 1}`, withKey: false });
  placeArch(`DB${b}`, ARCH, { sx: D / S, y0: H0, depth: RIBW * 0.9, ox: 0, oz: ZC(b), dx: D2[0], dz: D2[1], springL: P3(-1, b + 1), springR: P3(1, b), name: `Diagonal rib, bay ${b + 1}`, withKey: false });
  const k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0;
  add(`BOSS${b}`, 'boss', `Boss, bay ${b + 1}`, cylG(0.55, 0.55, top - 1.05, top + 0.05, 0, ZC(b), 32), { w: Math.PI * 0.3 * 1.1 * GAMMA, sup: [[`DA${b}-L${k}`, 0.25], [`DA${b}-R${k}`, 0.25], [`DB${b}-L${k}`, 0.25], [`DB${b}-R${k}`, 0.25]] });
}
step('Wall ribs', 'Smaller ribs run along each wall, framing the clerestory window. They give the vault a clean edge to build against.');
for (const s of SIDES) for (let b = 0; b < NB; b++) placeArch(pid('WR', s, b), FM, { y0: H0, depth: 0.35, ox: X(s, XI + 0.18), oz: ZC(b), dx: 0, dz: 1, springL: P3(s, b), springR: P3(s, b + 1), name: `Wall rib, ${SN(s)} bay ${b + 1}` });
// the vault cells between the ribs
const ribTop = (B, sx) => q => { const u = q * B.c.uCrown, p = B.c.p(u), n = B.c.n(u), e = B.t / 2 - 0.1; return [(p[0] + n[0] * e) * sx, p[1] + n[1] * e + H0]; };
const trv = ribTop(ARCH, 1), dia = ribTop(ARCH, D / S), wal = ribTop(FM, 1);
const curves = b => {
  const z0 = ZS[b], z1 = ZS[b + 1], zc = ZC(b);
  const Tz = (z, h) => q => { const [x, y] = trv(q); return V3(h < 0 ? x : -x, y, z); };
  const Dg = (d, h) => q => { const [x, y] = dia(q); const s = h < 0 ? x : -x; return V3(s * d[0], y, zc + s * d[1]); };
  const Wl = (side, h) => q => { const [x, y] = wal(q); return V3(X(side, XI + 0.2), y, zc + (h < 0 ? x : -x)); };
  return [
    ['transverse', Tz(z0, -1), Dg(D1, -1), `TR${b}`, `DA${b}`], ['transverse', Tz(z0, 1), Dg(D2, 1), `TR${b}`, `DB${b}`],
    ['transverse', Tz(z1, -1), Dg(D2, -1), `TR${b + 1}`, `DB${b}`], ['transverse', Tz(z1, 1), Dg(D1, 1), `TR${b + 1}`, `DA${b}`],
    ['side', Wl(-1, -1), Dg(D1, -1), pid('WR', -1, b), `DA${b}`], ['side', Wl(-1, 1), Dg(D2, -1), pid('WR', -1, b), `DB${b}`],
    ['side', Wl(1, -1), Dg(D2, 1), pid('WR', 1, b), `DB${b}`], ['side', Wl(1, 1), Dg(D1, 1), pid('WR', 1, b), `DA${b}`],
  ];
};
const ribPieces = pre => pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
[['lower', 0, 0.38], ['middle', 0.38, 0.72], ['top', 0.72, 1]].forEach(([nm, q0, q1], c) => {
  step(`Webbing, ${nm} courses`, c === 0 ? 'Thin curved courses of light stone fill the spaces between the ribs. The masons start at the springing on all sides.' : c === 1 ? 'The webs are only about 30 cm thick. The ribs and their centering hold everything until the last course closes.' : 'The last courses close against the bosses. The vault is complete, but it is still sitting on its timber.');
  for (let b = 0; b < NB; b++) curves(b).forEach(([, A, B, r1, r2], k) => {
    const r = ruled(A, B, q0, q1, 6, 12), a = ribPieces(r1), d = ribPieces(r2);
    add(`WEB${b}-${k}-${c}`, 'web panel', `Vault web, bay ${b + 1}`, r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...d.map(id => [id, 0.5 / d.length])] });
  });
});
step('Strike the centering', 'The moment of truth. The timber comes out and the vault carries itself, pushing out on the walls. The flyers catch that push and carry it to the buttresses. Turn on Show forces to see the path.', { focus: 'forces' });
removeAt(p => p.step === STEP_VAULT_CEN);
const STEP_STRUCK = cur;

// ---------- Bag 8: ROOF ----------
bag(8, 'Roof');
const RX = 7.3, RY = 35.2, RIDGE = 45.4, TRUSS = Array.from({ length: 13 }, (_, i) => -9.75 + i * 1.625);
const bayOf = z => Math.min(NB - 1, Math.max(0, Math.floor((z + 9.75) / L)));
const onCornice = z => [[pid('CO', -1, bayOf(z)), 0.5], [pid('CO', 1, bayOf(z)), 0.5]];
const beam = (a, b, r, id, kind, nm, sup) => { const d = b.clone().sub(a), g = new THREE.BoxGeometry(r, d.length(), r); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); add(id, kind, nm, g, { mat: 'oak', w: r * r * d.length() * OAK, sup, group: 'roof' }); };
step('Tie beams', 'Oak beams span the nave, wall to wall, just above the vault. The oak frame of Notre-Dame was called the forest. It is what burned in 2019, while most of the stone vault below it held.');
TRUSS.forEach((z, i) => beam(V3(-RX, RY + 0.18, z), V3(RX, RY + 0.18, z), 0.36, `TB${i}`, 'tie beam', `Tie beam ${i + 1}`, onCornice(z)));
step('Rafters and king posts', 'Steep rafters pair up over each tie beam, braced by a king post and struts. The roof is about 55° steep, to shed Paris rain and snow.');
TRUSS.forEach((z, i) => {
  beam(V3(-RX + 0.1, RY + 0.36, z), V3(0, RIDGE, z), 0.3, `RF${i}a`, 'rafter', `Rafter ${i + 1}, north`, [[`TB${i}`, 1]]);
  beam(V3(RX - 0.1, RY + 0.36, z), V3(0, RIDGE, z), 0.3, `RF${i}b`, 'rafter', `Rafter ${i + 1}, south`, [[`TB${i}`, 1]]);
  beam(V3(0, RY + 0.36, z), V3(0, RIDGE - 0.2, z), 0.26, `KP${i}`, 'king post', `King post ${i + 1}`, [[`TB${i}`, 1]]);
  for (const s of SIDES) beam(V3(0, RY + 3.2, z), V3(s * RX * 0.45, RY + 0.36 + (RIDGE - RY) * 0.55, z), 0.2, `BR${i}${s < 0 ? 'a' : 'b'}`, 'brace', 'Brace', [[`KP${i}`, 1]]);
});
step('Purlins and ridge', 'Long timbers run the length of the roof, tying every truss to the next so the whole frame acts as one.');
[0.33, 0.66].forEach((q, k) => SIDES.forEach(s => beam(V3(s * RX * (1 - q), RY + 0.36 + (RIDGE - RY - 0.36) * q + 0.2, -9.75), V3(s * RX * (1 - q), RY + 0.36 + (RIDGE - RY - 0.36) * q + 0.2, 9.75), 0.24, `PU${k}${s}`, 'purlin', 'Purlin', TRUSS.map((_, i) => [`TB${i}`, 1 / 13]))));
beam(V3(0, RIDGE + 0.1, -9.75), V3(0, RIDGE + 0.1, 9.75), 0.3, 'RIDGE', 'ridge beam', 'Ridge beam', TRUSS.map((_, i) => [`TB${i}`, 1 / 13]));
step('Lead roof and aisle roofs', 'Sheets of lead cover the frame. The aisles get their own lean-to roofs, tucked under the flyers.');
const leadSheet = (x0, y0, x1, y1, z0, z1, id, nm, sup) => { const len = Math.hypot(x1 - x0, y1 - y0), g = new THREE.BoxGeometry(len, 0.08, z1 - z0); g.rotateZ(Math.atan2(y1 - y0, x1 - x0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(id, 'lead sheet', nm, g, { mat: 'lead', w: len * (z1 - z0) * 0.004 * LEAD, sup, group: 'roof' }); };
for (const s of SIDES) for (let b = 0; b < NB; b++) {
  leadSheet(s * (RX + 0.25), RY + 0.2, 0, RIDGE + 0.42, ZS[b], ZS[b + 1], pid('LD', s, b), `Lead roof, ${SN(s)} bay ${b + 1}`, [[pid('CO', s, b), 1]]);
  const xa = X(s, XO - 0.1), xb = s < 0 ? FL.xbI - 1.3 : -FL.xbI + 1.3;
  leadSheet(xa, 19.4, xb, 14.6, ZS[b] + 0.7, ZS[b + 1] - 0.7, pid('LA', s, b), `Aisle roof, ${SN(s)} bay ${b + 1}`, [[pid('AW', s, b), 0.5], [pid('P', s, b, 1), 0.5]]);
}

// ---------- Bag 9: FINISHING ----------
bag(9, 'Finishing');
step('Glazing', 'Glass in every opening: aisle windows, gallery, the round band windows, and the tall clerestory lancets.');
const GLASS = [['aislewin', s => s < 0 ? FL.xbI - 0.5 : -FL.xbI + 0.5, [lancet(0, 3.6, 1.8, 4.0)]], ['gallery', s => X(s, XW), [lancet(-1.2, 15.0, 1.3, 2.6), lancet(1.2, 15.0, 1.3, 2.6)]], ['oculus', s => X(s, XW), [circle(0, 21.8, 0.9)]], ['clere', s => X(s, XW), [lancet(0, 24.5, 2.6, 2.0)]]];
GLASS.forEach(([g, xf, shapes]) => { for (const s of SIDES) for (let b = 0; b < NB; b++) shapes.forEach((pts, k) => add(`GL-${g}-${s}${b}${k}`, 'glass panel', 'Stained glass', extr(pts, [], 0.05, xf(s), ZC(b), 0, 1), { mat: 'glass', tint: (b + k + (s > 0 ? 1 : 0)) % 3 })); });
step('Paving', 'Stone paving for the nave and aisle floors. Three bays of Notre-Dame\'s nave, finished.');
for (let b = 0; b < NB; b++) {
  add(`PV-N${b}`, 'paving slab', `Nave paving, bay ${b + 1}`, boxG(XI, -XI, 0, 0.08, ZS[b], ZS[b + 1]), { mat: 'pave' });
  for (const s of SIDES) add(pid('PVA', s, b), 'paving slab', `Aisle paving, ${SN(s)} bay ${b + 1}`, boxG(...(s < 0 ? [FL.xbI, XO] : [-XO, -FL.xbI]), 0, 0.08, ZS[b], ZS[b + 1]), { mat: 'pave' });
}

// ---------- Force lines ----------
// The line of thrust through each transverse rib, down each wall, along each flyer and through each buttress pier,
// at every bay line, both sides: lists of points, plus the point where each base resultant meets the ground.
export function forceLines() {
  const lines = [], bases = [];
  const tp = Solver.thrustPoints(ARCH, SOL.state);
  ZS.forEach(z => {
    lines.push({ pts: [...tp.slice().reverse(), ...tp.slice(1).map(([x, y]) => [-x, y])].map(([x, y]) => V3(x, y + H0, z + RIBW / 2 + 0.02)), r: 0.12 });
    for (const s of SIDES) {
      lines.push({ pts: SUP.wall.line.filter(p => isFinite(p[0])).map(([x, y]) => V3(X(s, x), y, z)), r: 0.1 });
      lines.push({ pts: [V3(X(s, XO), FL.yA, z), V3(X(s, FL.xbI), FL.yB, z)], r: 0.12 });
      lines.push({ pts: SUP.buttress.line.filter(p => isFinite(p[0])).map(([x, y]) => V3(s < 0 ? x : -x, y, z)), r: 0.1 });
      for (const c of [SUP.wall, SUP.buttress]) bases.push(V3(X(s, c.x0), 0.2, z));
    }
  });
  return { lines, bases };
}

// ---------- Load model ----------
// Each piece carries its own weight plus its share of everything resting on it, down to the ground. Weight only:
// the vault's sideways push is in the force lines, not here.
const dependents = new Map();
pieces.forEach(p => p.sup.forEach(([id, f]) => { if (!byId[id]) throw new Error(`missing support ${id} under ${p.id}`); if (!dependents.has(id)) dependents.set(id, []); dependents.get(id).push([p, f]); }));
export const live = (p, n) => p.step < n && !(p.until != null && p.until < n);
export function computeLoads(n) {
  const memo = new Map();
  const carried = p => { if (memo.has(p.id)) return memo.get(p.id); let w = p.w; for (const [q, f] of dependents.get(p.id) || []) if (live(q, n)) w += f * carried(q); memo.set(p.id, w); return w; };
  pieces.forEach(p => { p.load = live(p, n) ? carried(p) : 0; p.stress = p.bear ? p.load / p.bear / 1000 : 0; });
}

export { pieces, steps, STEP_STRUCK };
