// Notre-Dame de Paris as a kit, nave, choir, west front, transept, spire and apse: every piece with its geometry, weight, bearing area and what it rests on,
// grouped in steps and bags in the order the masons built. Like the solver, it never touches the page: the page
// (main.js) draws the pieces, steps through them and reads the loads and force lines from here.
// Units: metres, kN. x runs across the nave (north negative), y up, z along the nave (the crossing at z = -30, west +30).
import * as THREE from './vendor/three.module.js?v=0.6';
import * as Solver from './solver.js?v=0.6';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const GAMMA = Solver.GAMMA, OAK = 7.5, LEAD = 111;   // unit weights, kN/m3: limestone, oak, lead

// ---------- The nave in section and in plan ----------
// Ten bays of 6 m (five six-part vaults), a 12 m nave and two aisles each side, the inner one with a gallery over it.
// One flying buttress at every bay line leaps both aisles in a single flight to a buttress pier outside the outer aisle.
const S = 12, T = 0.7, RIBW = 0.6, H0 = 24, WT = 1.2, L = 6;
const ARCH = Solver.build({ shape: 'pointed', span: S, thick: T, count: 11 });
const SOL = Solver.solve(ARCH);
const XI = ARCH.joints[0].A[0], XO = XI - WT, XW = (XI + XO) / 2;    // the nave wall: inner face, outer face, centre
const XM = XW - L, XA = XM - L, AWT = 12.5;                          // aisle piers, outer aisle wall (centre), its top
const SUP = Solver.supports(ARCH, SOL.state, { height: H0, width: WT, flyer: true, bdepth: 3.8, pinnacle: true, gap: XO - (XA + 0.5), bheight: 21 });
const FL = SUP.flyer;
// The nave and the choir's straight bays are built by the same code: SEGS lists the bay lines of each, and eachSeg(f)
// runs f once per stretch with ZS, NB, ND, Z0, pid and the name prefix TG switched to it. Outside eachSeg they are the nave's.
const SEGS = [{ TG: '', NM: 'nave', zs: Array.from({ length: 11 }, (_, i) => -30 + L * i), orig: 0, ends: [0, 10] },
  { TG: 'C', NM: 'choir', zs: Array.from({ length: 5 }, (_, i) => -66 + L * i), orig: 3, ends: [4] }];
const pidOf = (k, s, i, c) => `${k}-${s < 0 ? 'N' : 'S'}${i}${c != null ? '-' + c : ''}`;
let ZS, NB, ND, Z0, TG, NM, NMC, ORIGB, pid;
function useSeg(G) { ({ zs: ZS, TG, NM, orig: ORIGB } = G); NB = ZS.length - 1; ND = NB / 2; Z0 = ZS[0]; NMC = NM[0].toUpperCase() + NM.slice(1); pid = (k, s, i, c) => pidOf(TG + k, s, i, c); }
function eachSeg(f) { for (const G of SEGS) { useSeg(G); f(G); } useSeg(SEGS[0]); }
useSeg(SEGS[0]);
const ZC = b => ZS[b] + L / 2, HW = L / 2 - 0.7;
const SIDES = [-1, 1], SN = s => s < 0 ? 'north' : 'south', X = (s, x) => s < 0 ? x : -x;
const lr = (s, a, b) => s < 0 ? [a, b] : [-b, -a];                  // an x range on the north side, mirrored to the south
const LEV = [9.2, 14.6, 19.6, 24, 29.4, 34.8];                       // arcade, gallery, band, clerestory courses, cornice
export const KIT = { place: 'Notre-Dame de Paris', title: 'The whole cathedral', bays: NB, length: NB * L };

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
// (the solver draws each curved edge with 11 points; every other one is plenty on screen, and the weights come from the
// solver's exact areas, so thinning them changes nothing but the vertex count)
const thin = pts => pts.filter((_, i) => (i % 11) % 2 === 0);
function archShapes(B, sx = 1, withKey = true) {
  const out = [];
  B.blocks.forEach((b, j) => { const pts = thin(b.poly); out.push({ j, side: -1, A: b.A * sx, pts: pts.map(([x, y]) => [x * sx, y]) }); out.push({ j, side: 1, A: b.A * sx, pts: pts.map(([x, y]) => [-x * sx, y]) }); });
  if (withKey) out.push({ j: B.k, side: 0, key: true, A: B.key.A * 2 * sx, pts: thin(B.key.full).map(([x, y]) => [x * sx, y]) });
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

// ---------- Bag 1: Foundations ----------
bag(1, 'Foundations');
step('Footings under the nave piers', 'Every load in the building ends up here. Each of the 22 round piers of the nave gets a square footing, wider than the pier so the weight spreads into the ground.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => add(pid('F', s, i), 'footing', `Footing, ${SN(s)} ${NM} pier ${i + 1}`, boxG(X(s, XW) - 1.3, X(s, XW) + 1.3, 0, 0.6, z - 1.3, z + 1.3), { w: 2.6 * 2.6 * 0.6 * GAMMA, bear: 2.6 * 2.6 }));
});
step('Footings for the aisle piers', 'Notre-Dame has two aisles on each side of the nave. A second row of piers divides them, and each of those gets a footing too.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => add(pid('FM', s, i), 'footing', `Footing, ${SN(s)} aisle pier ${i + 1}`, boxG(X(s, XM) - 1.0, X(s, XM) + 1.0, 0, 0.6, z - 1.0, z + 1.0), { w: 2 * 2 * 0.6 * GAMMA, bear: 2 * 2 }));
});
step('Footings for the outer walls and buttresses', 'The buttress footings are the biggest in the building. They will take the vault\'s sideways push, so they spread wide to the outside.');
eachSeg(() => {
  for (const s of SIDES) {
    ZS.forEach((z, i) => add(pid('FB', s, i), 'footing', `Footing, ${SN(s)} buttress ${i + 1}`, boxG(...lr(s, FL.xbO - 0.4, FL.xbI + 0.3), 0, 0.6, z - 1.0, z + 1.0), { w: 4.5 * 2 * 0.6 * GAMMA, bear: 4.5 * 2 }));
    for (let b = 0; b < NB; b++) add(pid('FW', s, b), 'footing', `Footing, ${SN(s)} aisle wall ${b + 1}`, boxG(...lr(s, XA - 0.7, XA + 0.7), 0, 0.6, ZS[b] + 1.0, ZS[b + 1] - 1.0), { w: 1.4 * 4 * 0.6 * GAMMA, bear: 1.4 * 4 });
  }
});

// ---------- Bag 2: Piers ----------
bag(2, 'Piers');
step('Pier bases', 'Eight-sided plinths, set dead level, for the nave piers and the smaller aisle piers. Any tilt here would be multiplied thirty metres up.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => {
    add(pid('B', s, i), 'pier base', `Base, ${SN(s)} ${NM} pier ${i + 1}`, cylG(1.08, 1.0, 0.6, 1.2, X(s, XW), z, 8), { w: Math.PI * 1.04 * 1.04 * 0.6 * GAMMA, bear: Math.PI, sup: [[pid('F', s, i), 1]] });
    add(pid('BM', s, i), 'pier base', `Base, ${SN(s)} aisle pier ${i + 1}`, cylG(0.8, 0.74, 0.6, 1.2, X(s, XM), z, 8), { w: Math.PI * 0.6 * 0.6 * 0.6 * GAMMA, bear: Math.PI * 0.55, sup: [[pid('FM', s, i), 1]] });
  });
});
[[1.2, 3.6], [3.6, 6.0], [6.0, 8.4]].forEach(([y0, y1], c) => {
  step(`Pier drums, course ${c + 1} of 3`, c === 0 ? 'The nave stands on big round piers, each stacked from drums of limestone about 1.5 m across. The aisle piers are slimmer, 1.1 m.' : c === 1 ? 'Drums go on in level courses all the way around the building, so no pier gets ahead of its neighbours.' : 'The last drums. Each pier now carries nothing but itself: under a quarter of a megapascal at the base.');
  eachSeg(() => {
    for (const s of SIDES) ZS.forEach((z, i) => {
      add(pid('D', s, i, c), 'drum', `Drum ${c + 1}, ${SN(s)} ${NM} pier ${i + 1}`, cylG(0.75, 0.75, y0, y1, X(s, XW), z, 40), { w: Math.PI * 0.5625 * (y1 - y0) * GAMMA, bear: Math.PI * 0.5625, sup: [[c ? pid('D', s, i, c - 1) : pid('B', s, i), 1]] });
      add(pid('DM', s, i, c), 'drum', `Drum ${c + 1}, ${SN(s)} aisle pier ${i + 1}`, cylG(0.55, 0.55, y0, y1, X(s, XM), z, 32), { w: Math.PI * 0.3025 * (y1 - y0) * GAMMA, bear: Math.PI * 0.3025, sup: [[c ? pid('DM', s, i, c - 1) : pid('BM', s, i), 1]] });
    });
  });
});
step('Capitals and abacus blocks', 'The capital flares each round pier out to a square top, the abacus, wide enough for arches to land on from four directions.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => {
    add(pid('C', s, i), 'capital', `Capital, ${SN(s)} ${NM} pier ${i + 1}`, cylG(0.75, 1.02, 8.4, 8.9, X(s, XW), z, 40), { w: Math.PI * 0.8 * 0.5 * GAMMA, bear: Math.PI * 0.5625, sup: [[pid('D', s, i, 2), 1]] });
    add(pid('AB', s, i), 'abacus block', `Abacus, ${SN(s)} ${NM} pier ${i + 1}`, boxG(X(s, XW) - 0.85, X(s, XW) + 0.85, 8.9, 9.2, z - 0.85, z + 0.85), { w: 1.7 * 1.7 * 0.3 * GAMMA, bear: 1.7 * 1.7, sup: [[pid('C', s, i), 1]] });
    add(pid('CM', s, i), 'capital', `Capital, ${SN(s)} aisle pier ${i + 1}`, cylG(0.55, 0.74, 8.4, 8.9, X(s, XM), z, 32), { w: Math.PI * 0.42 * 0.5 * GAMMA, bear: Math.PI * 0.3025, sup: [[pid('DM', s, i, 2), 1]] });
    add(pid('AM', s, i), 'abacus block', `Abacus, ${SN(s)} aisle pier ${i + 1}`, boxG(X(s, XM) - 0.65, X(s, XM) + 0.65, 8.9, 9.2, z - 0.65, z + 0.65), { w: 1.3 * 1.3 * 0.3 * GAMMA, bear: 1.3 * 1.3, sup: [[pid('CM', s, i), 1]] });
  });
});

// ---------- Bag 3: Arcades ----------
bag(3, 'Arcades');
const ARC = Solver.build({ shape: 'pointed', span: L - 1.7, thick: 0.6, count: 9 });      // between nave piers
const ARM = Solver.build({ shape: 'pointed', span: L - 1.3, thick: 0.5, count: 9 });      // between aisle piers
step('Centering for the arcades', 'Before an arch can stand, it needs a timber frame to rest on. Carpenters build one under every opening between the piers, in both rows.');
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++) {
    placeCentering(pid('AC', s, b), ARC, { y0: 9.2, ox: X(s, XW), oz: ZC(b), dx: 0, dz: 1 });
    placeCentering(pid('MC', s, b), ARM, { y0: 9.2, ox: X(s, XM), oz: ZC(b), dx: 0, dz: 1 });
  }
});
const STEP_ARC_CEN = cur;
step('Nave arcade', 'Nine stones in each arch, laid from both piers at once and closed with a keystone. Until the keystone is in, the centering carries every stone.');
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++)
    placeArch(pid('A', s, b), ARC, { y0: 9.2, depth: WT, ox: X(s, XW), oz: ZC(b), dx: 0, dz: 1, springL: [[pid('AB', s, b), 1]], springR: [[pid('AB', s, b + 1), 1]], name: `${NMC} arcade, ${SN(s)} bay ${b + 1}` });
});
step('Aisle arcade', 'The same again on the row of piers between the two aisles. These arches will carry the outer wall of the gallery.');
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++)
    placeArch(pid('AR', s, b), ARM, { y0: 9.2, depth: 0.8, ox: X(s, XM), oz: ZC(b), dx: 0, dz: 1, springL: [[pid('AM', s, b), 1]], springR: [[pid('AM', s, b + 1), 1]], name: `Aisle arcade, ${SN(s)} bay ${b + 1}` });
});
step('Strike the arcade centering', 'Knock out the wedges and the frames drop away. The arches now carry themselves and push gently outward on the piers.');
removeAt(p => p.step === STEP_ARC_CEN);
step('Spandrels and wall piers', 'Solid masonry fills the corners above the arches, and square wall piers start up from each capital. This is the base of the upper walls.');
const spandrel = (B, x0, depth, b) => {
  const ext = B.extrados.map(([x, y]) => [x, y + 9.2]).filter(([x]) => x >= -HW);
  const pts = [[-HW, ext[0][1]], ...ext, ...ext.slice().reverse().map(([x, y]) => [-x, y]), [HW, ext[0][1]], [HW, LEV[1]], [-HW, LEV[1]]];
  return { g: extr(pts, [], depth, x0, ZC(b), 0, 1), w: extrVol(pts, [], depth) * GAMMA };
};
eachSeg(() => {
  for (const s of SIDES) {
    ZS.forEach((z, i) => {
      add(pid('P', s, i, 0), 'wall-pier stone', `Wall pier, ${SN(s)} line ${i + 1}, course 1`, boxG(X(s, XW) - WT / 2, X(s, XW) + WT / 2, LEV[0], LEV[1], z - 0.7, z + 0.7), { w: WT * 1.4 * (LEV[1] - LEV[0]) * GAMMA, bear: WT * 1.4, sup: [[pid('AB', s, i), 1]] });
      add(pid('PM', s, i, 0), 'wall-pier stone', `Gallery pier, ${SN(s)} line ${i + 1}, course 1`, boxG(X(s, XM) - 0.4, X(s, XM) + 0.4, LEV[0], LEV[1], z - 0.6, z + 0.6), { w: 0.8 * 1.2 * (LEV[1] - LEV[0]) * GAMMA, bear: 0.8 * 1.2, sup: [[pid('AM', s, i), 1]] });
    });
    for (let b = 0; b < NB; b++) {
      const a = spandrel(ARC, X(s, XW), WT, b), m = spandrel(ARM, X(s, XM), 0.8, b);
      add(pid('SP', s, b), 'spandrel', `Spandrel, ${SN(s)} nave arcade bay ${b + 1}`, a.g, { w: a.w, bear: 2 * HW * WT, sup: [[pid('A', s, b) + '-K', 1]] });
      add(pid('SM', s, b), 'spandrel', `Spandrel, ${SN(s)} aisle arcade bay ${b + 1}`, m.g, { w: m.w, bear: 2 * HW * 0.8, sup: [[pid('AR', s, b) + '-K', 1]] });
    }
  }
});

// ---------- Bag 4: Aisles ----------
bag(4, 'Aisles');
const BX0 = s => s < 0 ? FL.xbO : -FL.xbI, BX1 = s => s < 0 ? FL.xbI : -FL.xbO, BD = FL.wb;
step('Buttress piers, lower course', 'Outside the outer aisle, a deep pier rises at each bay line. For now it is just the aisle\'s outer support. Later it becomes the anchor for a flying buttress.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => add(pid('BU', s, i, 0), 'buttress stone', `Buttress, ${SN(s)} line ${i + 1}, course 1`, boxG(BX0(s), BX1(s), 0.6, LEV[0], z - 0.7, z + 0.7), { w: BD * 1.4 * (LEV[0] - 0.6) * GAMMA, bear: BD * 1.4, sup: [[pid('FB', s, i), 1]] }));
});
step('Outer aisle walls', 'The outside walls, each with a tall window. They are thin because they carry little: the buttresses do the work.');
const AWIN = lancet(0, 3.6, 1.8, 4.5);
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++) {
    const pts = [[-HW, 0.6], [HW, 0.6], [HW, AWT], [-HW, AWT]];
    add(pid('AW', s, b), 'wall stone', `Outer aisle wall, ${SN(s)} bay ${b + 1}`, extr(pts, [AWIN], 1.0, X(s, XA), ZC(b), 0, 1), { w: extrVol(pts, [AWIN], 1.0) * GAMMA, bear: 2 * HW, sup: [[pid('FW', s, b), 1]] });
  }
});
// arches across each aisle at every bay line: the inner aisle from nave pier to aisle pier, the outer from aisle pier to buttress
const AIL = Solver.build({ shape: 'pointed', span: (XW - 0.85) - (XM + 0.65), thick: 0.5, count: 7 }), AIX = ((XW - 0.85) + (XM + 0.65)) / 2;
const AOL = Solver.build({ shape: 'pointed', span: (XM - 0.65) - FL.xbI, thick: 0.5, count: 7 }), AOX = ((XM - 0.65) + FL.xbI) / 2;
step('Aisle arches', 'A pointed arch springs across each aisle at every bay line: from the nave pier to the aisle pier, and from the aisle pier to the buttress.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => {
    const nave = [[pid('AB', s, i), 1]], mid = [[pid('AM', s, i), 1]], but = [[pid('BU', s, i, 0), 1]];
    placeArch(pid('AI', s, i), AIL, { y0: 9.2, depth: 0.5, ox: X(s, AIX), oz: z, dx: 1, dz: 0, springL: s < 0 ? mid : nave, springR: s < 0 ? nave : mid, name: `Inner aisle arch, ${SN(s)} line ${i + 1}` });
    placeArch(pid('AO', s, i), AOL, { y0: 9.2, depth: 0.5, ox: X(s, AOX), oz: z, dx: 1, dz: 0, springL: s < 0 ? but : mid, springR: s < 0 ? mid : but, name: `Outer aisle arch, ${SN(s)} line ${i + 1}` });
  });
});
step('Aisle vaults', 'Between the arches, the masons lay curved courses of stone to close both aisle ceilings. The gallery floor will sit on the inner ones.');
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++) for (const [key, B, cx, sup] of [
    ['AVI', AIL, AIX, [[pid('AB', s, b), 0.25], [pid('AB', s, b + 1), 0.25], [pid('AM', s, b), 0.25], [pid('AM', s, b + 1), 0.25]]],
    ['AVO', AOL, AOX, [[pid('AM', s, b), 0.25], [pid('AM', s, b + 1), 0.25], [pid('BU', s, b, 0), 0.25], [pid('BU', s, b + 1, 0), 0.25]]]]) {
    const cl = B.c, k = u => { const p = cl.p(u), n = cl.n(u); return [p[0] + n[0] * 0.2, p[1] + n[1] * 0.2 + 9.2]; };
    for (const h of [-1, 1]) {
      const Apt = (q, z) => { const [x, y] = k(q * cl.uCrown); return V3(X(s, cx) + (h < 0 ? x : -x), y, z); };
      const r = ruled(q => Apt(q, ZS[b] + 0.25), q => Apt(q, ZS[b + 1] - 0.25), 0, 1, 10, 12);
      add(pid(key, s, b, h < 0 ? 'a' : 'b'), 'web panel', `${key === 'AVI' ? 'Inner' : 'Outer'} aisle vault, ${SN(s)} bay ${b + 1}`, r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup });
    }
  }
});

// ---------- Bag 5: Upper walls ----------
bag(5, 'Upper walls');
const wallPier = c => { for (const s of SIDES) ZS.forEach((z, i) => add(pid('P', s, i, c), 'wall-pier stone', `Wall pier, ${SN(s)} line ${i + 1}, course ${c + 1}`, boxG(X(s, XW) - WT / 2, X(s, XW) + WT / 2, LEV[c], LEV[c + 1], z - 0.7, z + 0.7), { w: WT * 1.4 * (LEV[c + 1] - LEV[c]) * GAMMA, bear: WT * 1.4, sup: [[pid('P', s, i, c - 1), 1]] })); };
const panel = (key, kind, nm, x0, depth, y0, y1, c, holes, bays = [...Array(NB).keys()], pier = 'P') => { for (const s of SIDES) for (const b of bays) {
  const pts = [[-HW, y0], [HW, y0], [HW, y1], [-HW, y1]];
  add(pid(key, s, b), kind, `${nm}, ${SN(s)} bay ${b + 1}`, extr(pts, holes, depth, X(s, x0), ZC(b), 0, 1), { w: extrVol(pts, holes, depth) * GAMMA, bear: 2 * HW * depth * 0.8, sup: [[pid(pier, s, b, c), 0.5], [pid(pier, s, b + 1, c), 0.5]] }); } };
const GOPEN = [lancet(-1.4, 15.0, 1.0, 2.4), lancet(0, 15.0, 1.0, 2.4), lancet(1.4, 15.0, 1.0, 2.4)];
const GWIN = [lancet(-1.1, 15.1, 1.2, 2.2), lancet(1.1, 15.1, 1.2, 2.2)];
step('Gallery', 'Above the inner aisle runs a gallery, open to the nave through triple arches. Its outer wall stands on the aisle arcade, with windows of its own.');
eachSeg(() => {
  wallPier(1);
});
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => add(pid('PM', s, i, 1), 'wall-pier stone', `Gallery pier, ${SN(s)} line ${i + 1}, course 2`, boxG(X(s, XM) - 0.4, X(s, XM) + 0.4, LEV[1], LEV[2], z - 0.6, z + 0.6), { w: 0.8 * 1.2 * (LEV[2] - LEV[1]) * GAMMA, bear: 0.8 * 1.2, sup: [[pid('PM', s, i, 0), 1]] }));
});
eachSeg(() => {
  panel('G', 'wall stone', 'Gallery arcade wall', XW, WT, LEV[1], LEV[2], 1, GOPEN);
});
eachSeg(() => {
  panel('GO', 'wall stone', 'Gallery outer wall', XM, 0.8, LEV[1], LEV[2], 1, GWIN, undefined, 'PM');
});
step('The band', 'Next to the crossing, a plain band of wall with a round opening in each bay, the way the nave was first built. Viollet-le-Duc restored them in the 1800s. Elsewhere, in the 1220s, the windows above were lengthened down over the band.');
eachSeg(() => {
  wallPier(2);
});
eachSeg(() => {
  panel('BD', 'wall stone', 'Band wall', XW, WT, LEV[2], LEV[3], 2, [circle(0, 21.8, 0.9)], [ORIGB]);
});
step('Vaulting shafts', 'Slender shafts run up the inside of each wall pier from the capitals to where the vault will begin, 24 m up. They will catch the vault\'s ribs.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => [-0.38, 0, 0.38].forEach((dz, k) => add(pid('SH', s, i, k), 'shaft', `Shaft, ${SN(s)} line ${i + 1}`, cylG(0.15, 0.15, 9.2, 24, X(s, XI + 0.16), z + dz, 16), { w: Math.PI * 0.0225 * 14.8 * GAMMA, bear: Math.PI * 0.0225, sup: [[pid('AB', s, i), 1]] })));
});
const CWIN = lancet(0, 24.5, 2.6, 2.0), CWIN_T = lancet(0, 20.6, 2.6, 5.9), late = () => [...Array(NB).keys()].filter(b => b !== ORIGB);
step('Clerestory', 'The top of the wall, pierced by a tall window in each bay. The higher and bigger the windows, the more light, and the more the walls depend on buttresses.');
eachSeg(() => {
  wallPier(3); wallPier(4);
});
eachSeg(() => {
  panel('CL', 'wall stone', 'Clerestory wall', XW, WT, LEV[3], LEV[5], 3, [CWIN], [ORIGB]);
});
eachSeg(() => {
  panel('CL', 'wall stone', 'Clerestory wall', XW, WT, LEV[2], LEV[5], 2, [CWIN_T], late());
});
step('Cornice', 'A projecting course of stone caps each wall. The roof timbers will sit on it.');
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++) add(pid('CO', s, b), 'cornice stone', `Cornice, ${SN(s)} bay ${b + 1}`, boxG(...lr(s, XO - 0.3, XI + 0.05), 34.8, 35.2, ZS[b], ZS[b + 1]), { w: 1.55 * 0.4 * L * GAMMA, bear: 1.55 * L, sup: [[pid('CL', s, b), 1]] });
});

// ---------- Bag 6: Flying buttresses ----------
bag(6, 'Flying buttresses');
step('Buttress piers, upper courses', `The outer piers rise to ${FL.hb} m, well above the aisle roofs. Their depth, ${BD} m, is what will hold the vault up: even with the vault's push, the resultant at their base stays inside the middle third.`);
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => {
    add(pid('BU', s, i, 1), 'buttress stone', `Buttress, ${SN(s)} line ${i + 1}, course 2`, boxG(BX0(s), BX1(s), LEV[0], LEV[1], z - 0.7, z + 0.7), { w: BD * 1.4 * (LEV[1] - LEV[0]) * GAMMA, bear: BD * 1.4, sup: [[pid('BU', s, i, 0), 1]] });
    add(pid('BU', s, i, 2), 'buttress stone', `Buttress, ${SN(s)} line ${i + 1}, course 3`, boxG(BX0(s), BX1(s), LEV[1], FL.hb, z - 0.7, z + 0.7), { w: BD * 1.4 * (FL.hb - LEV[1]) * GAMMA, bear: BD * 1.4, sup: [[pid('BU', s, i, 1), 1]] });
  });
});
const NFLY = 7, flyerPolys = () => { // straight top, arched underside, in NFLY stones
  const d = 0.6, x0 = XO, x1 = FL.xbI, top = x => FL.yA + (FL.yB - FL.yA) * (x - x0) / (x1 - x0) + d / 2, sag = x => 1.0 * Math.sin(Math.PI * (x - x1) / (x0 - x1));
  const bot = x => top(x) - d - sag(x), out = [];
  for (let i = 0; i < NFLY; i++) { const a = x0 + (x1 - x0) * i / NFLY, b = x0 + (x1 - x0) * (i + 1) / NFLY, pts = [];
    for (let k = 0; k <= 6; k++) { const x = a + (b - a) * k / 6; pts.push([x, top(x)]); }
    for (let k = 6; k >= 0; k--) { const x = a + (b - a) * k / 6; pts.push([x, bot(x)]); }
    out.push(pts); }
  return out;
};
step('Centering for the flyers', 'Each flyer is a half arch leaping over both aisles and the gallery roof. It gets its own long centering, propped on the gallery.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => {
    const xa = X(s, XO), xb = X(s, FL.xbI), ya = FL.yA - 1.8, yb = FL.yB - 1.0;
    const tube = new THREE.CylinderGeometry(0.12, 0.12, Math.hypot(xb - xa, yb - ya), 10); tube.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(xb - xa, yb - ya, 0).normalize()))); tube.translate((xa + xb) / 2, (ya + yb) / 2, z);
    add(pid('FC', s, i), 'centering timber', 'Flyer centering, rib', tube, { mat: 'timber' });
    [0.25, 0.5, 0.75].forEach((q, k) => { const x = xa + (xb - xa) * q, y = ya + (yb - ya) * q; add(pid('FC', s, i, k), 'centering timber', 'Flyer centering, prop', cylG(0.09, 0.09, LEV[1], y, x, z, 10), { mat: 'timber' }); });
  });
});
const STEP_FLY_CEN = cur;
step('Flying buttresses', `${NFLY} stones each, from the top of the nave wall down to the buttress pier, ${Math.round(FL.g)} m away, in a single flight over both aisles. They will carry the vault's sideways push out over the aisles, about ${Math.round(FL.C / 5) * 5} kN for every metre of vault.`);
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => flyerPolys().forEach((poly, k) => {
    const pts = poly.map(([x, y]) => [X(s, x), y]);
    add(pid('FY', s, i, k), 'flyer stone', `Flyer, ${SN(s)} line ${i + 1}, stone ${k + 1}`, extr(pts, [], 0.8, 0, z, 1, 0), { w: extrVol(pts, [], 0.8) * GAMMA, bear: 0.8 * 0.6, sup: [[pid('BU', s, i, 2), 0.5], [pid('P', s, i, 2), 0.5]] });
  }));
});
step('Strike the flyer centering', 'The flyers stand on their own. They are in place before the vault, so when the vault starts pushing there is already something to push against.');
removeAt(p => p.step === STEP_FLY_CEN);
step('Pinnacles', 'A pinnacle on each buttress. It adds weight right where the flyer\'s push arrives. Try it in the arch lab: the effect is real but small.');
eachSeg(() => {
  for (const s of SIDES) ZS.forEach((z, i) => {
    const cx = (BX0(s) + BX1(s)) / 2;
    add(pid('PN', s, i, 0), 'pinnacle stone', `Pinnacle shaft, ${SN(s)} line ${i + 1}`, boxG(cx - 0.95, cx + 0.95, FL.hb, FL.hb + 2.2, z - 0.6, z + 0.6), { w: 1.9 * 1.2 * 2.2 * GAMMA, bear: 1.9 * 1.2, sup: [[pid('BU', s, i, 2), 1]] });
    const sp = new THREE.ConeGeometry(1.05, 3.6, 4); sp.rotateY(Math.PI / 4); sp.translate(cx, FL.hb + 2.2 + 1.8, z);
    add(pid('PN', s, i, 1), 'spire stone', `Pinnacle spire, ${SN(s)} line ${i + 1}`, sp, { w: 1.3 * 3.6 / 3 * GAMMA, bear: 1.2, sup: [[pid('PN', s, i, 0), 1]] });
    const fin = new THREE.SphereGeometry(0.22, 16, 12); fin.translate(cx, FL.hb + 6.0, z);
    add(pid('PN', s, i, 2), 'finial', `Finial, ${SN(s)} line ${i + 1}`, fin, { w: 1, sup: [[pid('PN', s, i, 1), 1]] });
  });
});

// ---------- Bag 7: The vault ----------
// Six-part vaults: each covers two bays. Major transverse ribs at every other bay line, a lighter transverse rib at the
// line between, two diagonals corner to corner across the square, all meeting at one boss, and a wall rib in each bay.
bag(7, 'The vault');
const D = Math.hypot(S, 2 * L), D1 = [S / D, 2 * L / D], D2 = [S / D, -2 * L / D];
const FM = Solver.build({ shape: 'pointed', span: L - 0.6, thick: 0.35, count: 7 });
const P3 = (s, i) => [[pid('P', s, i, 2), 1]];
step('Centering for the ribs', 'The big one. A timber frame goes up under every rib, 24 m above the floor: across the nave at every bay line, and corner to corner across each pair of bays.');
eachSeg(() => {
  ZS.forEach((z, i) => placeCentering(`${TG}TC${i}`, ARCH, { y0: H0, ox: 0, oz: z, dx: 1, dz: 0 }));
});
eachSeg(() => {
  for (let d = 0; d < ND; d++) for (const [n, dir] of [['a', D1], ['b', D2]]) placeCentering(`${TG}DC${d}${n}`, ARCH, { sx: D / S, y0: H0, ox: 0, oz: ZS[2 * d + 1], dx: dir[0], dz: dir[1] });
});
const STEP_VAULT_CEN = cur;
step('Transverse ribs', 'Eleven stones across the nave at every bay line, the arch from the arch lab at full size. Every other one is a heavy rib between vaults, closed with a keystone; the lighter one between them runs to the boss.');
eachSeg(() => {
  ZS.forEach((z, i) => i % 2 === 0
    ? placeArch(`${TG}TR${i}`, ARCH, { y0: H0, depth: RIBW, ox: 0, oz: z, dx: 1, dz: 0, springL: P3(-1, i), springR: P3(1, i), name: `${NMC}, transverse rib ${i / 2 + 1}` })
    : placeArch(`${TG}TR${i}`, ARCH, { y0: H0, depth: RIBW * 0.75, ox: 0, oz: z, dx: 1, dz: 0, springL: P3(-1, i), springR: P3(1, i), name: `${NMC}, intermediate rib ${(i + 1) / 2}`, withKey: false }));
});
step('Diagonal ribs and bosses', 'Two ribs cross each pair of bays corner to corner, 17 m apart at their feet. Where they meet the intermediate rib at the top, a carved boss locks all six together.');
eachSeg(() => {
  for (let d = 0; d < ND; d++) {
    const z0 = 2 * d, z2 = 2 * d + 2, zc = ZS[2 * d + 1];
    placeArch(`${TG}DA${d}`, ARCH, { sx: D / S, y0: H0, depth: RIBW * 0.9, ox: 0, oz: zc, dx: D1[0], dz: D1[1], springL: P3(-1, z0), springR: P3(1, z2), name: `${NMC}, diagonal rib, vault ${d + 1}`, withKey: false });
    placeArch(`${TG}DB${d}`, ARCH, { sx: D / S, y0: H0, depth: RIBW * 0.9, ox: 0, oz: zc, dx: D2[0], dz: D2[1], springL: P3(-1, z2), springR: P3(1, z0), name: `${NMC}, diagonal rib, vault ${d + 1}`, withKey: false });
    const k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0, im = `${TG}TR${2 * d + 1}`;
    add(`${TG}BOSS${d}`, 'boss', `${NMC}, boss, vault ${d + 1}`, cylG(0.6, 0.6, top - 1.1, top + 0.05, 0, zc, 32), { w: Math.PI * 0.36 * 1.15 * GAMMA,
      sup: [[`${TG}DA${d}-L${k}`, 1 / 6], [`${TG}DA${d}-R${k}`, 1 / 6], [`${TG}DB${d}-L${k}`, 1 / 6], [`${TG}DB${d}-R${k}`, 1 / 6], [`${im}-L${k}`, 1 / 6], [`${im}-R${k}`, 1 / 6]] });
  }
});
step('Wall ribs', 'Smaller ribs run along each wall, one per bay, framing the clerestory window. They give the vault a clean edge to build against.');
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++) placeArch(pid('WR', s, b), FM, { y0: H0, depth: 0.35, ox: X(s, XI + 0.18), oz: ZC(b), dx: 0, dz: 1, springL: P3(s, b), springR: P3(s, b + 1), name: `Wall rib, ${SN(s)} bay ${b + 1}` });
});
// the six cells of each vault, each between two rib curves, as ruled surfaces from the springing (q = 0) to the crown
const ribTop = (B, sx) => q => { const u = q * B.c.uCrown, p = B.c.p(u), n = B.c.n(u), e = B.t / 2 - 0.1; return [(p[0] + n[0] * e) * sx, p[1] + n[1] * e + H0]; };
const trv = ribTop(ARCH, 1), dia = ribTop(ARCH, D / S), wal = ribTop(FM, 1);
const cells = d => {
  const z0 = ZS[2 * d], z1 = ZS[2 * d + 1], z2 = ZS[2 * d + 2], zm0 = (z0 + z1) / 2, zm1 = (z1 + z2) / 2;
  const Tz = (z, h) => q => { const [x, y] = trv(q); return V3(h < 0 ? x : -x, y, z); };
  const Dg = (dir, h) => q => { const [x, y] = dia(q); const s = h < 0 ? x : -x; return V3(s * dir[0], y, z1 + s * dir[1]); };
  const Wl = (side, h, zm) => q => { const [x, y] = wal(q); return V3(X(side, XI + 0.2), y, zm + (h < 0 ? x : -x)); };
  const T0 = `${TG}TR${2 * d}`, T1 = `${TG}TR${2 * d + 1}`, T2 = `${TG}TR${2 * d + 2}`, A = `${TG}DA${d}`, B = `${TG}DB${d}`, W = (s, b) => pid('WR', s, b);
  return [
    [Tz(z0, -1), Dg(D1, -1), T0, A], [Tz(z0, 1), Dg(D2, 1), T0, B], [Tz(z2, -1), Dg(D2, -1), T2, B], [Tz(z2, 1), Dg(D1, 1), T2, A],
    [Wl(-1, -1, zm0), Dg(D1, -1), W(-1, 2 * d), A], [Wl(-1, 1, zm0), Tz(z1, -1), W(-1, 2 * d), T1],
    [Wl(-1, -1, zm1), Tz(z1, -1), W(-1, 2 * d + 1), T1], [Wl(-1, 1, zm1), Dg(D2, -1), W(-1, 2 * d + 1), B],
    [Wl(1, -1, zm0), Dg(D2, 1), W(1, 2 * d), B], [Wl(1, 1, zm0), Tz(z1, 1), W(1, 2 * d), T1],
    [Wl(1, -1, zm1), Tz(z1, 1), W(1, 2 * d + 1), T1], [Wl(1, 1, zm1), Dg(D1, 1), W(1, 2 * d + 1), A],
  ];
};
const ribPieces = pre => pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
[['lower', 0, 0.38], ['middle', 0.38, 0.72], ['top', 0.72, 1]].forEach(([nm, q0, q1], c) => {
  step(`Webbing, ${nm} courses`, c === 0 ? 'Thin curved courses of light stone fill the six cells between the ribs of each vault. The masons start at the springing on all sides.' : c === 1 ? 'The webs are only about 30 cm thick. The ribs and their centering hold everything until the last course closes.' : 'The last courses close against the bosses. The vault is complete, but it is still sitting on its timber.');
  eachSeg(() => {
    for (let d = 0; d < ND; d++) cells(d).forEach(([A, B, r1, r2], k) => {
      const r = ruled(A, B, q0, q1, 6, 12), a = ribPieces(r1), b = ribPieces(r2);
      add(`${TG}WEB${d}-${k}-${c}`, 'web panel', `${NMC}, vault web, vault ${d + 1}`, r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...b.map(id => [id, 0.5 / b.length])] });
    });
  });
});
step('Strike the centering', 'The moment of truth. The timber comes out and the vault carries itself, pushing out on the walls. The flyers catch that push and carry it over the aisles to the buttresses. The red line is that path, the line of thrust, from the crown of the vault to the ground.', { focus: 'forces' });
removeAt(p => p.step === STEP_VAULT_CEN);
const STEP_STRUCK = cur;

// ---------- Bag 8: Roof ----------
bag(8, 'Roof');
const RX = 7.3, RY = 35.2, RIDGE = 45.4, TSP = 1.5, truss = () => Array.from({ length: Math.round(NB * L / TSP) + 1 }, (_, i) => Z0 + i * TSP);
const bayOf = z => Math.min(NB - 1, Math.max(0, Math.floor((z - Z0) / L)));
const onCornice = z => [[pid('CO', -1, bayOf(z)), 0.5], [pid('CO', 1, bayOf(z)), 0.5]];
const beam = (a, b, r, id, kind, nm, sup) => { const d = b.clone().sub(a), g = new THREE.BoxGeometry(r, d.length(), r); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); add(id, kind, nm, g, { mat: 'oak', w: r * r * d.length() * OAK, sup, group: 'roof' }); };
step('Tie beams', `${SEGS.reduce((a, G) => a + Math.round((G.zs.length - 1) * L / TSP) + 1, 0)} oak beams span the nave and the choir, wall to wall, just above the vault. The oak frame of Notre-Dame was called the forest. It is what burned in 2019, while most of the stone vault below it held.`);
eachSeg(() => {
  truss().forEach((z, i) => beam(V3(-RX, RY + 0.18, z), V3(RX, RY + 0.18, z), 0.36, `${TG}TB${i}`, 'tie beam', `Tie beam ${i + 1}`, onCornice(z)));
});
step('Rafters and king posts', 'Steep rafters pair up over each tie beam, braced by a king post and struts. The roof is about 55° steep, to shed Paris rain and snow.');
eachSeg(() => {
  truss().forEach((z, i) => {
    beam(V3(-RX + 0.1, RY + 0.36, z), V3(0, RIDGE, z), 0.3, `${TG}RF${i}a`, 'rafter', `Rafter ${i + 1}, north`, [[`${TG}TB${i}`, 1]]);
    beam(V3(RX - 0.1, RY + 0.36, z), V3(0, RIDGE, z), 0.3, `${TG}RF${i}b`, 'rafter', `Rafter ${i + 1}, south`, [[`${TG}TB${i}`, 1]]);
    beam(V3(0, RY + 0.36, z), V3(0, RIDGE - 0.2, z), 0.26, `${TG}KP${i}`, 'king post', `King post ${i + 1}`, [[`${TG}TB${i}`, 1]]);
    for (const s of SIDES) beam(V3(0, RY + 3.2, z), V3(s * RX * 0.45, RY + 0.36 + (RIDGE - RY) * 0.55, z), 0.2, `${TG}BR${i}${s < 0 ? 'a' : 'b'}`, 'brace', 'Brace', [[`${TG}KP${i}`, 1]]);
  });
});
step('Purlins and ridge', 'Long timbers run the length of the roof, tying every truss to the next so the whole frame acts as one.');
eachSeg(() => {
  for (let d = 0; d < ND; d++) {
    const za = ZS[2 * d], zb = ZS[2 * d + 2], on = truss().map((z, i) => [z, i]).filter(([z]) => z >= za - 1e-6 && z <= zb + 1e-6).map(([, i]) => [`${TG}TB${i}`, 1]);
    on.forEach(x => x[1] = 1 / on.length);
    [0.33, 0.66].forEach((q, k) => SIDES.forEach(s => beam(V3(s * RX * (1 - q), RY + 0.36 + (RIDGE - RY - 0.36) * q + 0.2, za), V3(s * RX * (1 - q), RY + 0.36 + (RIDGE - RY - 0.36) * q + 0.2, zb), 0.24, `${TG}PU${d}${k}${s}`, 'purlin', 'Purlin', on)));
    beam(V3(0, RIDGE + 0.1, za), V3(0, RIDGE + 0.1, zb), 0.3, `${TG}RIDGE${d}`, 'ridge beam', 'Ridge beam', on);
  }
});
step('Lead roofs', 'Sheets of lead cover the frame. The gallery and the outer aisle get their own lower roofs, tucked under the flyers.');
const leadSheet = (x0, y0, x1, y1, z0, z1, id, nm, sup) => { const len = Math.hypot(x1 - x0, y1 - y0), g = new THREE.BoxGeometry(len, 0.08, z1 - z0); g.rotateZ(Math.atan2(y1 - y0, x1 - x0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(id, 'lead sheet', nm, g, { mat: 'lead', w: len * (z1 - z0) * 0.004 * LEAD, sup, group: 'roof' }); };
eachSeg(() => {
  for (const s of SIDES) for (let b = 0; b < NB; b++) {
    leadSheet(s * (RX + 0.25), RY + 0.2, 0, RIDGE + 0.42, ZS[b], ZS[b + 1], pid('LD', s, b), `Lead roof, ${SN(s)} bay ${b + 1}`, [[pid('CO', s, b), 1]]);
    leadSheet(X(s, XO - 0.1), LEV[2] + 1.5, X(s, XM - 0.45), LEV[2] + 0.3, ZS[b] + 0.6, ZS[b + 1] - 0.6, pid('LG', s, b), `Gallery roof, ${SN(s)} bay ${b + 1}`, [[pid('GO', s, b), 0.5], [pid('P', s, b, 1), 0.5]]);
    leadSheet(X(s, XM - 0.45), LEV[1] + 0.3, X(s, XA - 0.6), AWT + 0.2, ZS[b] + 0.7, ZS[b + 1] - 0.7, pid('LA', s, b), `Outer aisle roof, ${SN(s)} bay ${b + 1}`, [[pid('AW', s, b), 0.5], [pid('PM', s, b, 0), 0.5]]);
  }
});

// ---------- The west front ----------
// Two square towers 16 m on a side over the west ends of the aisles, flush with the nave's inner walls, and between them
// the central wall with the main portal and the rose. Four buttresses divide the front into three. Levels: the portals,
// the Gallery of Kings, the rose storey behind the Gallery of the Virgin, the grand gallery, the top band at 45 m, then
// the belfries alone to 69 m. Between the towers the last bay of the nave gets a four-part vault.
const TX0 = -21.75, TX1 = XI, TZ0 = 30.7, TZ1 = 46.8, TW = 2.6, TZC = (TZ0 + TZ1) / 2, PX = (TX0 + TX1) / 2, WB = 42;
const TL = [0.6, 14, 18, 31, 42, 45, 67.5], TOP = 69;
const SECTIONS = [[-19.15, -8.25], [TX1, -TX1], [8.25, 19.15]];          // the three parts of the front between buttresses
const rect = (a0, a1, y0, y1) => [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
const mirror = (s, pts) => pts.map(([x, y]) => [X(s, x), y]);
// a wall panel: a profile in (x, y) extruded along z (face 'x'), or in (z, y) extruded along x (face 'z')
function wall(id, kind, name, along, pts, holes, depth, at, sup, o = {}) {
  const [dx, dz, ox, oz] = along === 'x' ? [1, 0, 0, at] : [0, 1, at, 0];
  const xs = pts.map(p => p[0]), width = Math.max(...xs) - Math.min(...xs);
  return add(id, kind, name, extr(pts, holes, depth, ox, oz, dx, dz), { w: extrVol(pts, holes, depth) * GAMMA, bear: width * depth * 0.85, sup, ...o });
}
const TOWER = s => s < 0 ? 'north tower' : 'south tower';
const LEVEL = ['ground storey', 'kings storey', 'rose storey', 'gallery storey', 'top band', 'belfry'];
// each tower face's openings, by level: west (the front), east (toward the aisles), outer and inner (toward the last bay)
const FACE_HOLES = {
  west: [[lancet(PX, 0.6, 5.6, 6.4)], [], [lancet(PX - 2.6, 21, 2.6, 5), lancet(PX + 2.6, 21, 2.6, 5)], [-3.3, -1.1, 1.1, 3.3].map(d => lancet(PX + d, 32, 1.4, 6.5)), [], [lancet(PX - 3, 47, 2.6, 12), lancet(PX + 3, 47, 2.6, 12)]],
  east: [[lancet((XO + XM) / 2, 0.6, 3.6, 5.4), lancet((XM + XA) / 2, 0.6, 3.6, 5.4)], [], [lancet(PX - 2.6, 21, 2.6, 5), lancet(PX + 2.6, 21, 2.6, 5)], [lancet(PX - 2.5, 33, 2.2, 4.5), lancet(PX + 2.5, 33, 2.2, 4.5)], [], [lancet(PX - 3, 47, 2.6, 12), lancet(PX + 3, 47, 2.6, 12)]],
  outer: [[lancet(TZC, 3, 2, 5)], [], [lancet(TZC - 2.4, 21, 2.2, 5), lancet(TZC + 2.4, 21, 2.2, 5)], [lancet(TZC - 2.4, 33, 2.2, 4.5), lancet(TZC + 2.4, 33, 2.2, 4.5)], [], [lancet(TZC - 2.4, 47, 2.4, 12), lancet(TZC + 2.4, 47, 2.4, 12)]],
  inner: [[lancet(TZC - 2, 0.6, 5.6, 5)], [], [], [lancet(TZC - 2.4, 33, 2.2, 4.5), lancet(TZC + 2.4, 33, 2.2, 4.5)], [], [lancet(TZC - 2.4, 47, 2.4, 12), lancet(TZC + 2.4, 47, 2.4, 12)]],
};
const fid = (s, face, k) => `TW-${s < 0 ? 'N' : 'S'}-${face}-${k}`;
function towerLevel(k) {
  for (const s of SIDES) {
    const y0 = TL[k], y1 = TL[k + 1], below = f => k ? [[fid(s, f, k - 1), 1]] : [[`TF-${s < 0 ? 'N' : 'S'}`, 1]];
    const nm = f => `${TOWER(s)}, ${f} face, ${LEVEL[k]}`;
    wall(fid(s, 'west', k), 'tower wall', nm('west'), 'x', mirror(s, rect(TX0, TX1, y0, y1)), FACE_HOLES.west[k].map(h => mirror(s, h)), TW, TZ1 - TW / 2, below('west'));
    wall(fid(s, 'east', k), 'tower wall', nm('east'), 'x', mirror(s, rect(TX0, TX1, y0, y1)), FACE_HOLES.east[k].map(h => mirror(s, h)), TW, TZ0 + TW / 2, below('east'));
    wall(fid(s, 'outer', k), 'tower wall', nm(s < 0 ? 'north' : 'south'), 'z', rect(TZ0 + TW, TZ1 - TW, y0, y1), FACE_HOLES.outer[k], TW, X(s, TX0 + TW / 2), below('outer'));
    wall(fid(s, 'inner', k), 'tower wall', nm('inner'), 'z', rect(TZ0 + TW, TZ1 - TW, y0, y1), FACE_HOLES.inner[k], TW, X(s, TX1 - TW / 2), below('inner'));
  }
}
const CENTRE = [[0.6, 14, WB, TZ1, [lancet(0, 0.6, 6.4, 6.4)]], [14, 18, WB, TZ1, []], [18, 31, WB, TZ1, [circle(0, 24.6, 4.8, 64)]], [31, 42, TZ1 - 1.2, TZ1, [-3.3, -1.1, 1.1, 3.3].map(d => lancet(d, 32, 1.4, 6.5))], [42, 44, TZ1 - 1.2, TZ1, []]];
const centreLevel = k => { const [y0, y1, z0, z1, holes] = CENTRE[k];
  wall(`CW-${k}`, 'wall stone', `Central wall, ${LEVEL[k]}`, 'x', rect(TX1, -TX1, y0, y1), holes, z1 - z0, (z0 + z1) / 2, [[k ? `CW-${k - 1}` : 'CF', 1]]); };
const BUTX = [-20.45, -6.95, 6.95, 20.45];

bag(9, 'West front');
const STEP_WF = steps.length;
step('Footings for the west front', '');
for (const s of SIDES) add(`TF-${s < 0 ? 'N' : 'S'}`, 'footing', `Footing, ${TOWER(s)}`, boxG(...lr(s, TX0 - 1, TX1), -0.6, 0.65, TZ0, TZ1 + 2.2), { w: 17.1 * 18.3 * 1.25 * GAMMA, bear: 17.1 * 18.3 });
add('CF', 'footing', 'Footing, central wall', boxG(TX1, -TX1, -0.6, 0.65, WB - 0.5, TZ1 + 2.2), { w: 11.3 * 7.5 * 1.25 * GAMMA, bear: 11.3 * 7.5 });
step('The ground storey', 'The towers\' walls rise 2.6 m thick, with the three portals cut through them: the Virgin on the north, the Last Judgement in the middle, Saint Anne on the south. Four big buttresses divide the front into three.');
towerLevel(0); centreLevel(0);
const STEP_FRONT = cur;
BUTX.forEach((x, i) => add(`WBU-${i}-0`, 'buttress stone', `West buttress ${i + 1}, course 1`, boxG(x - 1.3, x + 1.3, 0.65, TL[1], TZ1, TZ1 + 2), { w: 2.6 * 2 * 13.35 * GAMMA, bear: 2.6 * 2, sup: [[x < 0 ? 'TF-N' : 'TF-S', 1]] }));
// the portals: three arches one inside the other, stepping out from the wall, each on its own pair of jamb columns
const PORTALS = [[-1, PX, 5.6, 'Portal of the Virgin'], [0, 0, 6.4, 'Portal of the Last Judgement'], [1, -PX, 5.6, 'Portal of Saint Anne']];
const RINGS = [0, 1, 2], ringZ = i => TZ1 + 0.3 + 0.6 * i, ringOf = (w, i) => Solver.build({ shape: 'pointed', span: w + 0.9 * i, thick: 0.45, count: 9 });
const wallBelow = sd => sd < 0 ? fid(-1, 'west', 0) : sd > 0 ? fid(1, 'west', 0) : 'CW-0';
PORTALS.forEach(([sd, cx, w, nm], p) => {
  for (const side of [-1, 1]) {
    add(`PJ-${p}-${side}`, 'jamb stone', `${nm}, jamb`, boxG(...(side < 0 ? [cx - w / 2 - 1.6, cx - w / 2] : [cx + w / 2, cx + w / 2 + 1.6]), 0.65, 7, TZ1, TZ1 + 1.8), { w: 1.6 * 1.8 * 6.35 * GAMMA, bear: 1.6 * 1.8, sup: [[sd < 0 ? 'TF-N' : sd > 0 ? 'TF-S' : 'CF', 1]] });
    RINGS.forEach(i => add(`PC-${p}-${side}-${i}`, 'jamb column', `${nm}, column`, cylG(0.22, 0.22, 0.65, 7, cx + side * ((w + 0.9 * i) / 2 + 0.225), ringZ(i), 16), { w: Math.PI * 0.05 * 6.35 * GAMMA, bear: Math.PI * 0.05, sup: [[`PJ-${p}-${side}`, 1]] }));
  }
});
step('Centering for the portals', 'Each portal is framed by three arches, each one a step further out than the last. Every ring gets its own centering.');
PORTALS.forEach(([, cx, w], p) => RINGS.forEach(i => placeCentering(`PCN-${p}-${i}`, ringOf(w, i), { y0: 7, ox: cx, oz: ringZ(i), dx: 1, dz: 0 })));
const STEP_PORTAL_CEN = cur;
step('Portal arches', 'Nine stones to each ring, springing from slender columns set into the jambs. A lintel spans each doorway, and over it sits the tympanum, the carved stone that fills the arch.');
PORTALS.forEach(([sd, cx, w, nm], p) => {
  RINGS.forEach(i => placeArch(`PR-${p}-${i}`, ringOf(w, i), { y0: 7, depth: 0.6, ox: cx, oz: ringZ(i), dx: 1, dz: 0, springL: [[`PC-${p}--1-${i}`, 1]], springR: [[`PC-${p}-1-${i}`, 1]], name: `${nm}, arch ${i + 1}`, kind: 'archivolt stone' }));
  add(`PL-${p}`, 'lintel', `${nm}, lintel`, boxG(cx - w / 2, cx + w / 2, 6.2, 6.6, TZ1 - 0.8, TZ1), { w: w * 0.4 * 0.8 * GAMMA, bear: 0.8 * 0.8, sup: [[`PJ-${p}--1`, 0.5], [`PJ-${p}-1`, 0.5]] });
  const head = lancet(cx, 6.6, w, 0.4);
  add(`PT-${p}`, 'tympanum', `${nm}, tympanum`, extr(head, [], 0.4, 0, TZ1 - 0.4, 1, 0), { w: extrVol(head, [], 0.4) * GAMMA, bear: w * 0.4, sup: [[`PL-${p}`, 1]] });
});
add('PTR', 'trumeau', 'Portal of the Last Judgement, central post', cylG(0.35, 0.35, 0.65, 6.2, 0, TZ1 - 0.6, 24), { w: Math.PI * 0.12 * 5.6 * GAMMA, bear: Math.PI * 0.12, sup: [['CF', 1]] });
step('Strike the portal centering', 'The portal arches stand on their columns. The weight of the wall above will rest on them from now on.');
removeAt(p => p.step === STEP_PORTAL_CEN);
const KING = new THREE.LatheGeometry([[0, 0], [0.4, 0], [0.38, 0.2], [0.34, 1.6], [0.38, 2.1], [0.16, 2.35], [0.14, 2.45], [0.27, 2.62], [0.25, 2.85], [0.22, 2.95], [0.26, 3.12], [0, 3.12]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
step('Gallery of Kings', 'The walls rise another 4 m, and across the front a row of 28 kings stands on a ledge: the kings of Judah, Christ\'s ancestors. In 1793 revolutionaries pulled them down, taking them for kings of France. The ones you see were carved in the 1800s; 21 of the old heads turned up in 1977.');
towerLevel(1); centreLevel(1);
SECTIONS.forEach(([x0, x1], i) => {
  const under = i === 1 ? 'CW-1' : fid(i ? 1 : -1, 'west', 1);
  add(`KL-${i}`, 'ledge stone', 'Kings\' ledge', boxG(x0, x1, TL[1], TL[1] + 0.4, TZ1, TZ1 + 1), { w: (x1 - x0) * 0.4 * GAMMA, bear: (x1 - x0), sup: [[under, 1]] });
  const n = i === 1 ? 10 : 9, gap = (x1 - x0) / n;
  for (let k = 0; k < n; k++) { const g = KING.clone(); g.translate(x0 + gap * (k + 0.5), TL[1] + 0.4, TZ1 + 0.55); add(`KG-${i}-${k}`, 'king', 'King of Judah', g, { w: 3.5 * 9.81, bear: 0.45, sup: [[`KL-${i}`, 1]] }); }
});

bag(10, 'The rose');
step('Gallery of the Virgin', 'Above the kings, a terrace with an open stone railing runs across the front: the Gallery of the Virgin. The buttresses carry on up, thinner now.');
const RAIL = (x0, x1, y0, h) => { const pts = rect(x0, x1, y0, y0 + h), holes = []; for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.8) holes.push(circle(x, y0 + h / 2, h * 0.3, 12)); return [pts, holes]; };
SECTIONS.forEach(([x0, x1], i) => {
  add(`VT-${i}`, 'terrace stone', 'Gallery of the Virgin, terrace', boxG(x0, x1, TL[2] - 0.4, TL[2], TZ1, TZ1 + 1), { w: (x1 - x0) * 0.4 * GAMMA, bear: (x1 - x0), sup: [[`KL-${i}`, 1]] });
  const [pts, holes] = RAIL(x0, x1, TL[2], 1);
  wall(`VR-${i}`, 'railing', 'Gallery of the Virgin, railing', 'x', pts, holes, 0.15, TZ1 + 0.92, [[`VT-${i}`, 1]]);
});
BUTX.forEach((x, i) => add(`WBU-${i}-1`, 'buttress stone', `West buttress ${i + 1}, course 2`, boxG(x - 1.1, x + 1.1, TL[1], TL[3], TZ1, TZ1 + 0.8), { w: 2.2 * 0.8 * 17 * GAMMA, bear: 2.2 * 0.8, sup: [[`WBU-${i}-0`, 1]] }));
step('The rose storey', 'The towers rise past 30 m, each face pierced by tall twin windows. In the middle, the wall is left with a great round opening, 9.6 m across.');
towerLevel(2); centreLevel(2);
step('Rose window tracery', 'Stone rings and spokes, like a wheel, fill the round opening. They have to hold the glass up and stand in the wind. The west rose was made around 1225.');
const RY0 = 24.6, RZ = TZ1 - 0.35, ring = (r0, r1, id, nm) => { const g = extr(circle(0, RY0, r1, 64), [circle(0, RY0, r0, 64)], 0.4, 0, RZ, 1, 0); add(id, 'rose tracery', nm, g, { w: Math.PI * (r1 * r1 - r0 * r0) * 0.4 * GAMMA, bear: 0.4 * (r1 - r0), sup: [['CW-2', 1]] }); };
ring(4.35, 4.8, 'RS-out', 'Rose, outer ring'); ring(2.35, 2.7, 'RS-mid', 'Rose, middle ring');
add('RS-hub', 'rose tracery', 'Rose, hub', extr(circle(0, RY0, 1, 32), [], 0.4, 0, RZ, 1, 0), { w: Math.PI * 0.4 * GAMMA, sup: [['RS-mid', 1]] });
const spoke = (r0, r1, a, id, sup) => { const g = new THREE.BoxGeometry(r1 - r0, 0.16, 0.3); g.translate((r0 + r1) / 2, 0, 0); g.rotateZ(a); g.translate(0, RY0, RZ); add(id, 'rose tracery', 'Rose, spoke', g, { w: (r1 - r0) * 0.05 * GAMMA, sup: [[sup, 1]] }); };
for (let k = 0; k < 12; k++) spoke(0.95, 2.4, Math.PI * 2 * k / 12, `RS-i${k}`, 'RS-mid');
for (let k = 0; k < 24; k++) spoke(2.65, 4.4, Math.PI * 2 * (k + 0.5) / 24, `RS-o${k}`, 'RS-out');
// the last bay of the nave, between the towers: a four-part vault 12 m square, its west rib against the front
const WRZ = WB - 0.3, P3W = s => [[fid(s, 'inner', 2), 1]], ZWC = 36;
step('Centering for the last bay', 'Between the towers, the last bay of the nave is vaulted now: a four-part vault, with two diagonals and a rib against the west front.');
placeCentering('WC', ARCH, { y0: H0, ox: 0, oz: WRZ, dx: 1, dz: 0 });
for (const [n, dir] of [['a', D1], ['b', D2]]) placeCentering(`WDC${n}`, ARCH, { sx: D / S, y0: H0, ox: 0, oz: ZWC, dx: dir[0], dz: dir[1] });
const STEP_WEST_CEN = cur;
step('The last vault', 'The rib against the front, the two diagonals and a boss where they meet, and a wall rib along each tower. The towers\' walls stand in for the flying buttresses here: they are thick enough to take the push.');
placeArch('TRW', ARCH, { y0: H0, depth: RIBW, ox: 0, oz: WRZ, dx: 1, dz: 0, springL: P3W(-1), springR: P3W(1), name: 'West rib' });
placeArch('DAW', ARCH, { sx: D / S, y0: H0, depth: RIBW * 0.9, ox: 0, oz: ZWC, dx: D1[0], dz: D1[1], springL: P3(-1, NB), springR: P3W(1), name: 'Diagonal rib, last bay', withKey: false });
placeArch('DBW', ARCH, { sx: D / S, y0: H0, depth: RIBW * 0.9, ox: 0, oz: ZWC, dx: D2[0], dz: D2[1], springL: P3W(-1), springR: P3(1, NB), name: 'Diagonal rib, last bay', withKey: false });
{ const k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0;
  add('BOSSW', 'boss', 'Boss, last bay', cylG(0.55, 0.55, top - 1.05, top + 0.05, 0, ZWC, 32), { w: Math.PI * 0.3 * 1.1 * GAMMA, sup: [[`DAW-L${k}`, 0.25], [`DAW-R${k}`, 0.25], [`DBW-L${k}`, 0.25], [`DBW-R${k}`, 0.25]] }); }
for (const s of SIDES) placeArch(pid('WRW', s, 0), ARCH, { y0: H0, depth: 0.35, ox: X(s, XI + 0.18), oz: ZWC, dx: 0, dz: 1, springL: P3(s, NB), springR: P3W(s), name: `Wall rib, ${TOWER(s)}`, kind: 'voussoir' });
step('Webbing for the last bay', 'Three rounds of thin courses close the four cells, from the springing to the boss.');
{
  const Tz = (z, h) => q => { const [x, y] = trv(q); return V3(h < 0 ? x : -x, y, z); };
  const Dg = (dir, h) => q => { const [x, y] = dia(q); const s = h < 0 ? x : -x; return V3(s * dir[0], y, ZWC + s * dir[1]); };
  const Wl = (side, h) => q => { const [x, y] = trv(q); return V3(X(side, XI + 0.2), y, ZWC + (h < 0 ? x : -x)); };
  const C = [[Tz(ZS[NB], -1), Dg(D1, -1), `TR${NB}`, 'DAW'], [Tz(ZS[NB], 1), Dg(D2, 1), `TR${NB}`, 'DBW'], [Tz(WRZ, -1), Dg(D2, -1), 'TRW', 'DBW'], [Tz(WRZ, 1), Dg(D1, 1), 'TRW', 'DAW'],
    [Wl(-1, -1), Dg(D1, -1), pid('WRW', -1, 0), 'DAW'], [Wl(-1, 1), Dg(D2, -1), pid('WRW', -1, 0), 'DBW'], [Wl(1, -1), Dg(D2, 1), pid('WRW', 1, 0), 'DBW'], [Wl(1, 1), Dg(D1, 1), pid('WRW', 1, 0), 'DAW']];
  [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => C.forEach(([A, B, r1, r2], k) => {
    const r = ruled(A, B, q0, q1, 6, 12), a = ribPieces(r1), b = ribPieces(r2);
    add(`WEBW-${k}-${c}`, 'web panel', 'Vault web, last bay', r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...b.map(id => [id, 0.5 / b.length])] });
  }));
}
step('Strike the centering of the last bay', 'The last vault carries itself. The nave is closed at the west.');
removeAt(p => p.step === STEP_WEST_CEN);

bag(11, 'Towers');
step('Grand gallery', 'An open arcade of tall, slim arches runs across the front at 31 m, the grand gallery. Viollet-le-Duc lined it with the chimeras in the 1800s.');
towerLevel(3); centreLevel(3);
step('Top of the front', 'The front closes at 45 m: a band of stone, and between the towers an open railing.');
towerLevel(4); centreLevel(4);
{ const [pts, holes] = RAIL(TX1, -TX1, 44, 1); wall('TR-rail', 'railing', 'Railing between the towers', 'x', pts, holes, 0.3, TZ1 - 0.6, [['CW-4', 1]]); }
step('Roof over the last bay', 'The oak frame and the lead roof carry on over the last bay, to the back of the front, between the towers.');
{
  const T = Array.from({ length: 8 }, (_, i) => ZS[NB] + 1.5 * (i + 1)), on = T.map((_, i) => [`TBW${i}`, 1 / T.length]);
  T.forEach((z, i) => {
    beam(V3(-RX, RY + 0.18, z), V3(RX, RY + 0.18, z), 0.36, `TBW${i}`, 'tie beam', 'Tie beam, last bay', [[fid(-1, 'inner', 3), 0.5], [fid(1, 'inner', 3), 0.5]]);
    beam(V3(-RX + 0.1, RY + 0.36, z), V3(0, RIDGE, z), 0.3, `RFW${i}a`, 'rafter', 'Rafter, last bay', [[`TBW${i}`, 1]]);
    beam(V3(RX - 0.1, RY + 0.36, z), V3(0, RIDGE, z), 0.3, `RFW${i}b`, 'rafter', 'Rafter, last bay', [[`TBW${i}`, 1]]);
    beam(V3(0, RY + 0.36, z), V3(0, RIDGE - 0.2, z), 0.26, `KPW${i}`, 'king post', 'King post, last bay', [[`TBW${i}`, 1]]);
  });
  beam(V3(0, RIDGE + 0.1, ZS[NB]), V3(0, RIDGE + 0.1, WB), 0.3, 'RIDGEW', 'ridge beam', 'Ridge beam, last bay', on);
  for (const s of SIDES) leadSheet(s * (RX + 0.25), RY + 0.2, 0, RIDGE + 0.42, ZS[NB], WB, pid('LDW', s, 0), `Lead roof, last bay, ${SN(s)}`, on);
}
step('Belfries', 'The towers go on alone, square, with two tall openings in every face so the bells can be heard across Paris.');
towerLevel(5);
for (const s of SIDES) [[TX0, TZ0], [TX0, TZ1], [TX1, TZ0], [TX1, TZ1]].forEach(([x, z], k) => {
  const cx = X(s, x), face = z === TZ1 ? 'west' : 'east';
  add(`TB-${s < 0 ? 'N' : 'S'}-${k}`, 'buttress stone', `${TOWER(s)}, corner buttress`, boxG(cx - 0.8, cx + 0.8, TL[5], TL[6] - 1.5, z - 0.8, z + 0.8), { w: 1.6 * 1.6 * 21 * GAMMA, bear: 1.6 * 1.6, sup: [[fid(s, face, 4), 1]] });
});
step('The bells', 'Emmanuel, the great bell, hangs in the south tower on a frame of oak. It weighs about 13 tonnes.');
{
  const bx = X(1, PX), by = 52, bz = TZC, post = (dx, dz, k) => add(`BF-${k}`, 'bell frame', 'Bell frame, post', boxG(bx + dx - 0.2, bx + dx + 0.2, TL[5], by + 3.4, bz + dz - 0.2, bz + dz + 0.2), { mat: 'oak', w: 0.16 * (by + 3.4 - TL[5]) * OAK, bear: 0.16, sup: [[fid(1, 'east', 4), 1]] });
  [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]].forEach(([dx, dz], k) => post(dx, dz, k));
  add('BF-beam', 'bell frame', 'Bell frame, beam', boxG(bx - 2.8, bx + 2.8, by + 3.4, by + 3.9, bz - 0.3, bz + 0.3), { mat: 'oak', w: 5.6 * 0.15 * OAK, bear: 0.3, sup: [0, 1, 2, 3].map(k => [`BF-${k}`, 0.25]) });
  const bell = new THREE.LatheGeometry([[0, 3.2], [0.55, 3.2], [0.75, 3.0], [0.85, 2.5], [0.95, 1.6], [1.15, 0.8], [1.45, 0.25], [1.55, 0], [1.4, 0], [1.3, 0.25], [1.0, 0.8], [0.82, 1.6], [0.72, 2.5], [0.6, 2.95], [0, 3.05]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
  bell.translate(bx, by, bz);
  add('BELL', 'bell', 'Emmanuel, the great bell', bell, { mat: 'bronze', w: 13 * 9.81, sup: [['BF-beam', 1]] });
}
step('Tower tops', 'A terrace covered in lead and an open railing finish each tower at 69 m. Spires were planned for the towers but never built.');
for (const s of SIDES) {
  const t = s < 0 ? 'N' : 'S';
  add(`TT-${t}`, 'lead sheet', `${TOWER(s)}, terrace`, boxG(...lr(s, TX0, TX1), TL[6], TL[6] + 0.3, TZ0, TZ1), { mat: 'lead', w: 16.1 * 16.1 * 0.3 * 0.5 * GAMMA, bear: 40, sup: ['west', 'east', 'outer', 'inner'].map(f => [fid(s, f, 5), 0.25]) });
  const [pw, hw] = RAIL(TX0, TX1, TL[6] + 0.3, 1.2), [pz, hz] = RAIL(TZ0, TZ1, TL[6] + 0.3, 1.2);
  wall(`TR-${t}-w`, 'railing', `${TOWER(s)}, railing`, 'x', mirror(s, pw), hw.map(h => mirror(s, h)), 0.3, TZ1 - 0.15, [[`TT-${t}`, 1]]);
  wall(`TR-${t}-e`, 'railing', `${TOWER(s)}, railing`, 'x', mirror(s, pw), hw.map(h => mirror(s, h)), 0.3, TZ0 + 0.15, [[`TT-${t}`, 1]]);
  wall(`TR-${t}-o`, 'railing', `${TOWER(s)}, railing`, 'z', pz, hz, 0.3, X(s, TX0 + 0.15), [[`TT-${t}`, 1]]);
  wall(`TR-${t}-i`, 'railing', `${TOWER(s)}, railing`, 'z', pz, hz, 0.3, X(s, TX1 - 0.15), [[`TT-${t}`, 1]]);
}

{ const t = pieces.filter(p => /^(TW|TB|TT|TR)-N/.test(p.id)).reduce((a, p) => a + p.w, 0) / 9.81;
  steps[STEP_WF].note = `The towers will weigh about ${Math.round(t / 1000) * 1000} tonnes each, so they get the biggest footings of all: a solid slab under the whole of each tower, wider than its walls.`; }

// ---------- The transept, the crossing and the spire ----------
// The transept crosses the nave at its east end, 48 m from end to end and 12 m wide (z from -42 to -30, centred on ZT).
// Each arm: a six-part vault over two bays from the crossing to the aisles' outer line, then a short four-part end bay,
// then the end wall with its portal and its rose, 13.1 m across. The crossing: a four-part vault on four piers (the nave's
// last two and two new ones to the east), and over it the spire, oak and lead, to 96 m. The arms' side walls are 3 m
// thick: with no flyers of their own, that is what the solver needs to keep the vault's push in the middle third.
const ZT = Z0 - 6, ZE = Z0 - 12, AW = 3, VEND = 22, VX = 6.25, VI = 12.25, VM = 18.25, VE = VEND - 0.3;
const ARMB = [[XO * -1, VI], [VI, VM], [VM, VEND]];                         // arm bays along the arm, from the nave wall out
const ARMSIDES = [['w', ZS[0] - 0.35, ZS[0] - 0.35 + AW], ['e', ZE + 0.35 - AW, ZE + 0.35]];   // the two side walls, z ranges
const LV = [0.6, 14.6, 24, 34.8], ARMN = s => s < 0 ? 'north arm' : 'south arm', N = s => s < 0 ? 'N' : 'S';
const XPL = [0.6, 9.2, 14.6, 19.6, 24, 29.4, 34.8];
const xp = (s, k) => pidOf('CP', s, 4, k - 1), aw = (s, side, b, k) => `TA-${N(s)}${side}-${b}-${k}`;
// what a rib lands on: a crossing pier near the crossing's corners, otherwise the arm's side wall at that point
function supAt(x, z) {
  const s = x < 0 ? -1 : 1, v = Math.abs(x), west = z > ZT;
  if (v < 6.6) return west ? [[pid('P', s, 0, 2), 1]] : [[xp(s, 3), 1]];       // the nave's and the choir's wall piers next to the crossing, to 24 m
  const b = v < VI ? 0 : v < VM ? 1 : 2;
  return [[aw(s, west ? 'w' : 'e', b, 1), 1]];
}
// a rib or its centering in a local frame: u across the span, v along the vault's axis; F maps (u, y, v) to the world
function ribIn(prefix, B, { F, cu = 0, cv, du, dv, sx = 1, depth, name, withKey = true }) {
  const c = F(cu, 0, cv), d = F(cu + du, 0, cv + dv).sub(c), h = B.S * sx / 2;
  const a = c.clone().addScaledVector(d, -h), b = c.clone().addScaledVector(d, h);
  return placeArch(prefix, B, { sx, y0: H0, depth, ox: c.x, oz: c.z, dx: d.x, dz: d.z, springL: supAt(a.x, a.z), springR: supAt(b.x, b.z), name, withKey });
}
function cenIn(prefix, B, { F, cu = 0, cv, du, dv, sx = 1 }) {
  const c = F(cu, 0, cv), d = F(cu + du, 0, cv + dv).sub(c);
  placeCentering(prefix, B, { sx, y0: H0, ox: c.x, oz: c.z, dx: d.x, dz: d.z });
}
const halfIn = (B, sx, F, cu, cv, du, dv, h) => { const top = ribTop(B, sx); return q => { const [x, y] = top(q); const t = h < 0 ? x : -x; return F(cu + du * t, y, cv + dv * t); }; };
const armF = s => (u, y, v) => V3(s * v, y, ZT + u), crossF = (u, y, v) => V3(u, y, v);
const DQ = Math.hypot(S, VE - VM), Q1 = [S / DQ, (VE - VM) / DQ], Q2 = [S / DQ, -(VE - VM) / DQ], VQ = (VM + VE) / 2;
const FQ = Solver.build({ shape: 'pointed', span: VE - VM - 0.6, thick: 0.3, count: 5 });
const DD = [S / D, 2 * L / D], DE = [S / D, -2 * L / D];

bag(12, 'Transept');
step('Footings for the transept', 'The transept crosses the church between the nave and the choir, 48 m from end to end. Its walls get footings first.');
for (const s of SIDES) {
  for (const [side, z0, z1] of ARMSIDES) ARMB.forEach(([v0, v1], b) => add(`TAF-${N(s)}${side}-${b}`, 'footing', `Footing, ${ARMN(s)} wall`, boxG(...lr(s, -v1, -v0), -0.6, 0.62, z0 - 0.5, z1 + 0.5), { w: (v1 - v0) * (AW + 1) * 1.22 * GAMMA, bear: (v1 - v0) * (AW + 1) }));
  add(`TEF-${N(s)}`, 'footing', `Footing, ${ARMN(s)} end wall`, boxG(...lr(s, -VEND - 3.5, -VEND), -0.6, 0.62, ZE - 5, ZS[0] + 5), { w: 3.5 * 22 * 1.22 * GAMMA, bear: 3.5 * 22 });
}
// the arm walls, per bay and storey: arches to the aisles at the bottom, the gallery opening and windows above
const ARMHOLES = [
  [[lancet(-(XO * -1 + VI) / 2, 0.6, 4, 8.6)], [lancet(-(VI + VM) / 2, 0.6, 4, 8.6)], [lancet(-(VM + VEND) / 2, 3, 1.6, 5)]],
  [[lancet(-(XO * -1 + VI) / 2, 15, 3, 2.6)], [lancet(-(VI + VM) / 2, 16, 1.8, 3)], []],
  [[lancet(-(XO * -1 + VI) / 2, 25.5, 2.4, 3.5)], [lancet(-(VI + VM) / 2, 25.5, 2.4, 3.5)], [lancet(-(VM + VEND) / 2, 25.5, 1.8, 3.5)]],
];
const armStorey = k => { for (const s of SIDES) for (const [side, z0, z1] of ARMSIDES) ARMB.forEach(([v0, v1], b) =>
  wall(aw(s, side, b, k), 'wall stone', `${ARMN(s)}, ${side === 'w' ? 'west' : 'east'} wall, ${['lower', 'middle', 'upper'][k]} storey`, 'x', mirror(s, rect(-v1, -v0, LV[k], LV[k + 1])), ARMHOLES[k][b].map(h => mirror(s, h)), AW, (z0 + z1) / 2,
    [[k ? aw(s, side, b, k - 1) : `TAF-${N(s)}${side}-${b}`, 1]])); };
step('Transept walls, lower storey', `The side walls of the arms, ${AW} m thick, open at the bottom where the aisles run through. The arms have no flying buttresses of their own: walls this thick hold the vault's push by themselves.`);
armStorey(0);
const STEP_TWALL = cur;
step('Transept walls, upper storeys', 'The walls rise to the cornice, with an opening onto the gallery and a window in every bay.');
armStorey(1); armStorey(2);
for (const s of SIDES) for (const [side, z0, z1] of ARMSIDES) add(`TAC-${N(s)}${side}`, 'cornice stone', `${ARMN(s)}, cornice`, boxG(...lr(s, -VEND, -XO * -1), 34.8, 35.2, z0 - 0.3, z1 + 0.3), { w: (VEND + XO) * 0.4 * (AW + 0.6) * GAMMA, bear: 10, sup: ARMB.map((_, b) => [aw(s, side, b, 2), 1 / 3]) });
// the ends of the arms: portal, a row of windows, the rose, the gable; corner buttresses with pinnacles
const EZ0 = ZE + 0.35 - AW, EZ1 = ZS[0] - 0.35 + AW, EX = VEND + 1, EL = [0.6, 13, 18.4, 32];
const endWall = (s, k, holes, nm) => wall(`TE-${N(s)}-${k}`, 'wall stone', `${ARMN(s)}, end wall, ${nm}`, 'z', rect(EZ0, EZ1, EL[k], EL[k + 1]), holes, 2, X(s, -EX), [[k ? `TE-${N(s)}-${k - 1}` : `TEF-${N(s)}`, 1]]);
const TPW = 5, TRING = [0, 1], tring = i => Solver.build({ shape: 'pointed', span: TPW + 0.9 * i, thick: 0.45, count: 9 }), tringX = (s, i) => X(s, -(VEND + 2 + 0.3 + 0.6 * i));
const TNAME = s => s < 0 ? 'Portal of the Cloister' : 'Portal of Saint Stephen';
step('Transept ends, ground storey', 'The end walls of the arms go up 2 m thick, each with a portal: the Cloister on the north, Saint Stephen on the south. Buttresses at the corners.');
for (const s of SIDES) {
  endWall(s, 0, [lancet(ZT, 0.6, TPW, 6.4)], 'ground storey');
  [EZ1 + 1, EZ0 - 1].forEach((z, k) => add(`TEB-${N(s)}-${k}-0`, 'buttress stone', `${ARMN(s)}, corner buttress, course 1`, boxG(...lr(s, -(EX + 3.5), -(VEND - 3)), 0.62, 18.4, z - 1, z + 1), { w: 6.5 * 2 * 17.8 * GAMMA, bear: 13, sup: [[`TEF-${N(s)}`, 1]] }));
  for (const side of [-1, 1]) {
    add(`TPJ-${N(s)}${side}`, 'jamb stone', `${TNAME(s)}, jamb`, boxG(...lr(s, -(VEND + 2 + 1.4), -(VEND + 2)), 0.62, 7, ...(side < 0 ? [ZT - TPW / 2 - 1.4, ZT - TPW / 2] : [ZT + TPW / 2, ZT + TPW / 2 + 1.4])), { w: 1.4 * 1.4 * 6.4 * GAMMA, bear: 1.96, sup: [[`TEF-${N(s)}`, 1]] });
    TRING.forEach(i => add(`TPC-${N(s)}${side}-${i}`, 'jamb column', `${TNAME(s)}, column`, cylG(0.22, 0.22, 0.62, 7, tringX(s, i), ZT + side * ((TPW + 0.9 * i) / 2 + 0.225), 16), { w: Math.PI * 0.05 * 6.4 * GAMMA, bear: Math.PI * 0.05, sup: [[`TPJ-${N(s)}${side}`, 1]] }));
  }
}
step('Centering for the transept portals', 'Two rings of arches frame each transept portal, each on its own centering.');
for (const s of SIDES) TRING.forEach(i => placeCentering(`TPN-${N(s)}-${i}`, tring(i), { y0: 7, ox: tringX(s, i), oz: ZT, dx: 0, dz: 1 }));
const STEP_TPORTAL_CEN = cur;
step('Transept portal arches', 'Nine stones to each ring, a lintel over the doorway and the tympanum above it.');
for (const s of SIDES) {
  TRING.forEach(i => placeArch(`TPR-${N(s)}-${i}`, tring(i), { y0: 7, depth: 0.6, ox: tringX(s, i), oz: ZT, dx: 0, dz: 1, springL: [[`TPC-${N(s)}-1-${i}`, 1]], springR: [[`TPC-${N(s)}1-${i}`, 1]], name: `${TNAME(s)}, arch ${i + 1}`, kind: 'archivolt stone' }));
  add(`TPL-${N(s)}`, 'lintel', `${TNAME(s)}, lintel`, boxG(...lr(s, -(VEND + 2), -(VEND + 1.2)), 6.2, 6.6, ZT - TPW / 2, ZT + TPW / 2), { w: TPW * 0.4 * 0.8 * GAMMA, bear: 0.64, sup: [[`TPJ-${N(s)}-1`, 0.5], [`TPJ-${N(s)}1`, 0.5]] });
  const head = lancet(ZT, 6.6, TPW, 0.4);
  add(`TPT-${N(s)}`, 'tympanum', `${TNAME(s)}, tympanum`, extr(head, [], 0.4, X(s, -(VEND + 1.8)), 0, 0, 1), { w: extrVol(head, [], 0.4) * GAMMA, bear: TPW * 0.4, sup: [[`TPL-${N(s)}`, 1]] });
}
step('Strike the transept portal centering', 'The portal arches stand on their columns.');
removeAt(p => p.step === STEP_TPORTAL_CEN);
const TRY0 = 25.2, TRR = 6.55, TCV = [-5, -3, -1, 1, 3, 5].map(d => lancet(ZT + d, 13.4, 1.4, 3.4));
step('The rose storeys', `Above each portal, a row of tall narrow windows, then a wall left with a round opening ${(2 * TRR).toFixed(1)} m across, almost the whole width of the arm. The buttresses carry on up.`);
for (const s of SIDES) {
  endWall(s, 1, TCV, 'window row');
  endWall(s, 2, [circle(ZT, TRY0, TRR, 72)], 'rose storey');
  [EZ1 + 1, EZ0 - 1].forEach((z, k) => add(`TEB-${N(s)}-${k}-1`, 'buttress stone', `${ARMN(s)}, corner buttress, course 2`, boxG(...lr(s, -(EX + 2.5), -(VEND - 2)), 18.4, 34, z - 0.9, z + 0.9), { w: 5.5 * 1.8 * 15.6 * GAMMA, bear: 9.9, sup: [[`TEB-${N(s)}-${k}-0`, 1]] }));
}
step('Rose tracery, north and south', 'Rings and spokes again, bigger and finer than the west rose. The north rose was made around 1250, the south a few years later; both survived the fire of 2019.');
for (const s of SIDES) {
  const t = N(s), rx = X(s, -(VEND + 1.6)), ringT = (r0, r1, id, nm) => add(id, 'rose tracery', nm, extr(circle(ZT, TRY0, r1, 72), [circle(ZT, TRY0, r0, 72)], 0.4, rx, 0, 0, 1), { w: Math.PI * (r1 * r1 - r0 * r0) * 0.4 * GAMMA, bear: 0.4 * (r1 - r0), sup: [[`TE-${t}-2`, 1]] });
  ringT(TRR - 0.45, TRR, `TRS-${t}-out`, `${ARMN(s)} rose, outer ring`); ringT(3.6, 3.95, `TRS-${t}-mid`, `${ARMN(s)} rose, middle ring`); ringT(1.2, 1.5, `TRS-${t}-in`, `${ARMN(s)} rose, inner ring`);
  const spokeT = (r0, r1, a, id, sup) => { const g = new THREE.BoxGeometry(0.3, 0.16, r1 - r0); g.translate(0, 0, (r0 + r1) / 2); g.rotateX(a); g.translate(rx, TRY0, ZT); add(id, 'rose tracery', `${ARMN(s)} rose, spoke`, g, { w: (r1 - r0) * 0.05 * GAMMA, sup: [[sup, 1]] }); };
  for (let k = 0; k < 16; k++) spokeT(1.45, 3.65, Math.PI * 2 * k / 16, `TRS-${t}-i${k}`, `TRS-${t}-mid`);
  for (let k = 0; k < 32; k++) spokeT(3.9, TRR - 0.4, Math.PI * 2 * (k + 0.5) / 32, `TRS-${t}-o${k}`, `TRS-${t}-out`);
}
step('Gables', 'A pointed gable closes the top of each end, with a small rose of its own, and the corner buttresses finish in pinnacles.');
for (const s of SIDES) {
  const t = N(s), pts = [[EZ0, 32], [EZ1, 32], [ZT, 46.5]];
  wall(`TE-${t}-3`, 'wall stone', `${ARMN(s)}, gable`, 'z', pts, [circle(ZT, 37.5, 1.6, 32)], 1.2, X(s, -EX), [[`TE-${t}-2`, 1]]);
  [EZ1 + 1, EZ0 - 1].forEach((z, k) => { const cx = X(s, -(VEND + 0.5)), sp = new THREE.ConeGeometry(1.1, 5, 4); sp.rotateY(Math.PI / 4); sp.translate(cx, 36.5, z);
    add(`TEB-${t}-${k}-2`, 'pinnacle stone', `${ARMN(s)}, pinnacle`, sp, { w: 1.5 * 5 / 3 * GAMMA, bear: 1.5, sup: [[`TEB-${t}-${k}-1`, 1]] }); });
}

bag(13, 'Crossing');
step('Centering for the crossing and the transept', 'Timber frames under every rib of the crossing and of both arms: the crossing arches, the six-part vault of each arm, and its short end bay.');
cenIn('XDaC', ARCH, { F: crossF, cv: ZT, du: DD[0], dv: DD[1], sx: D / S }); cenIn('XDbC', ARCH, { F: crossF, cv: ZT, du: DE[0], dv: DE[1], sx: D / S });
for (const s of SIDES) {
  const F = armF(s), t = N(s);
  [['X', VX], ['I', VI], ['M', VM], ['E', VE]].forEach(([n, v]) => cenIn(`TC${n}${t}`, ARCH, { F, cv: v, du: 1, dv: 0 }));
  cenIn(`TDaC${t}`, ARCH, { F, cv: VI, du: DD[0], dv: DD[1], sx: D / S }); cenIn(`TDbC${t}`, ARCH, { F, cv: VI, du: DE[0], dv: DE[1], sx: D / S });
  cenIn(`TQaC${t}`, ARCH, { F, cv: VQ, du: Q1[0], dv: Q1[1], sx: DQ / S }); cenIn(`TQbC${t}`, ARCH, { F, cv: VQ, du: Q2[0], dv: Q2[1], sx: DQ / S });
}
const STEP_X_CEN = cur;
step('Crossing arches', 'Four great arches frame the crossing: the nave\'s last transverse rib on the west, the choir\'s first on the east, and now one opening into each arm.');
for (const s of SIDES) ribIn(`TX${N(s)}`, ARCH, { F: armF(s), cv: VX, du: 1, dv: 0, depth: RIBW, name: `Crossing arch, ${ARMN(s)}` });
step('Transept ribs', 'In each arm: a heavy rib and a lighter one across, two diagonals meeting at a boss, the short end bay with its own diagonals, and a wall rib in every bay.');
for (const s of SIDES) {
  const F = armF(s), t = N(s), k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0;
  ribIn(`TI${t}`, ARCH, { F, cv: VI, du: 1, dv: 0, depth: RIBW * 0.75, name: `Intermediate rib, ${ARMN(s)}`, withKey: false });
  ribIn(`TM${t}`, ARCH, { F, cv: VM, du: 1, dv: 0, depth: RIBW, name: `Transverse rib, ${ARMN(s)}` });
  ribIn(`TE${t}R`, ARCH, { F, cv: VE, du: 1, dv: 0, depth: RIBW, name: `End rib, ${ARMN(s)}` });
  ribIn(`TDa${t}`, ARCH, { F, cv: VI, du: DD[0], dv: DD[1], sx: D / S, depth: RIBW * 0.9, name: `Diagonal rib, ${ARMN(s)}`, withKey: false });
  ribIn(`TDb${t}`, ARCH, { F, cv: VI, du: DE[0], dv: DE[1], sx: D / S, depth: RIBW * 0.9, name: `Diagonal rib, ${ARMN(s)}`, withKey: false });
  ribIn(`TQa${t}`, ARCH, { F, cv: VQ, du: Q1[0], dv: Q1[1], sx: DQ / S, depth: RIBW * 0.8, name: `Diagonal rib, ${ARMN(s)} end bay`, withKey: false });
  ribIn(`TQb${t}`, ARCH, { F, cv: VQ, du: Q2[0], dv: Q2[1], sx: DQ / S, depth: RIBW * 0.8, name: `Diagonal rib, ${ARMN(s)} end bay`, withKey: false });
  const bossAt = (id, v, ribs) => { const p = F(0, 0, v); add(id, 'boss', `Boss, ${ARMN(s)}`, cylG(0.6, 0.6, top - 1.1, top + 0.05, p.x, p.z, 32), { w: Math.PI * 0.36 * 1.15 * GAMMA, sup: ribs.flatMap(r => [[`${r}-L${k}`, 0.5 / ribs.length], [`${r}-R${k}`, 0.5 / ribs.length]]) }); };
  bossAt(`TBOSS${t}`, VI, [`TDa${t}`, `TDb${t}`, `TI${t}`]); bossAt(`TQBOSS${t}`, VQ, [`TQa${t}`, `TQb${t}`]);
  for (const side of [-1, 1]) {
    [[0, (VX + VI) / 2], [1, (VI + VM) / 2]].forEach(([b, vm]) => ribIn(`TW${t}${side}${b}`, FM, { F, cu: side * 5.47, cv: vm, du: 0, dv: 1, depth: 0.35, name: `Wall rib, ${ARMN(s)}` }));
    ribIn(`TWQ${t}${side}`, FQ, { F, cu: side * 5.47, cv: VQ, du: 0, dv: 1, depth: 0.3, name: `Wall rib, ${ARMN(s)} end bay` });
  }
}
step('Crossing vault ribs', 'Two diagonals cross the crossing corner to corner, 17 m apart at their feet, locked by a boss right under where the spire will stand.');
ribIn('XDa', ARCH, { F: crossF, cv: ZT, du: DD[0], dv: DD[1], sx: D / S, depth: RIBW * 0.9, name: 'Diagonal rib, crossing', withKey: false });
ribIn('XDb', ARCH, { F: crossF, cv: ZT, du: DE[0], dv: DE[1], sx: D / S, depth: RIBW * 0.9, name: 'Diagonal rib, crossing', withKey: false });
{ const k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0;
  add('XBOSS', 'boss', 'Boss, crossing', cylG(0.6, 0.6, top - 1.1, top + 0.05, 0, ZT, 32), { w: Math.PI * 0.36 * 1.15 * GAMMA, sup: ['XDa', 'XDb'].flatMap(r => [[`${r}-L${k}`, 0.25], [`${r}-R${k}`, 0.25]]) }); }
// the webs: the crossing's four cells, each arm's six-part vault (as in the nave) and its four-part end bay
const crossCells = () => {
  const F = crossF, T = (v, h) => halfIn(ARCH, 1, F, 0, v, 1, 0, h), G = (d, h) => halfIn(ARCH, D / S, F, 0, ZT, d[0], d[1], h), W = (side, h) => halfIn(ARCH, 1, F, side * 5.95, ZT, 0, 1, h);
  return [[T(ZE, -1), G(DD, -1), 'CTR4', 'XDa'], [T(ZE, 1), G(DE, 1), 'CTR4', 'XDb'], [T(ZS[0], -1), G(DE, -1), 'TR0', 'XDb'], [T(ZS[0], 1), G(DD, 1), 'TR0', 'XDa'],
    [W(-1, -1), G(DD, -1), 'TXN', 'XDa'], [W(-1, 1), G(DE, -1), 'TXN', 'XDb'], [W(1, -1), G(DE, 1), 'TXS', 'XDb'], [W(1, 1), G(DD, 1), 'TXS', 'XDa']];
};
const armCells = s => {
  const F = armF(s), t = N(s), T = (v, h) => halfIn(ARCH, 1, F, 0, v, 1, 0, h), G = (d, h) => halfIn(ARCH, D / S, F, 0, VI, d[0], d[1], h), Q = (d, h) => halfIn(ARCH, DQ / S, F, 0, VQ, d[0], d[1], h);
  const W = (side, h, vm) => halfIn(FM, 1, F, side * 5.45, vm, 0, 1, h), WQ = (side, h) => halfIn(FQ, 1, F, side * 5.45, VQ, 0, 1, h);
  const A = `TDa${t}`, B = `TDb${t}`, T0 = `TX${t}`, T1 = `TI${t}`, T2 = `TM${t}`, TE_ = `TE${t}R`, w = (side, b) => `TW${t}${side}${b}`, m0 = (VX + VI) / 2, m1 = (VI + VM) / 2;
  return [
    [T(VX, -1), G(DD, -1), T0, A], [T(VX, 1), G(DE, 1), T0, B], [T(VM, -1), G(DE, -1), T2, B], [T(VM, 1), G(DD, 1), T2, A],
    [W(-1, -1, m0), G(DD, -1), w(-1, 0), A], [W(-1, 1, m0), T(VI, -1), w(-1, 0), T1], [W(-1, -1, m1), T(VI, -1), w(-1, 1), T1], [W(-1, 1, m1), G(DE, -1), w(-1, 1), B],
    [W(1, -1, m0), G(DE, 1), w(1, 0), B], [W(1, 1, m0), T(VI, 1), w(1, 0), T1], [W(1, -1, m1), T(VI, 1), w(1, 1), T1], [W(1, 1, m1), G(DD, 1), w(1, 1), A],
    [T(VM, -1), Q(Q1, -1), T2, `TQa${t}`], [T(VM, 1), Q(Q2, 1), T2, `TQb${t}`], [T(VE, -1), Q(Q2, -1), TE_, `TQb${t}`], [T(VE, 1), Q(Q1, 1), TE_, `TQa${t}`],
    [WQ(-1, -1), Q(Q1, -1), `TWQ${t}-1`, `TQa${t}`], [WQ(-1, 1), Q(Q2, -1), `TWQ${t}-1`, `TQb${t}`], [WQ(1, -1), Q(Q2, 1), `TWQ${t}1`, `TQb${t}`], [WQ(1, 1), Q(Q1, 1), `TWQ${t}1`, `TQa${t}`],
  ];
};
const webs = (tag, cells, nm) => [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => cells.forEach(([A, B, r1, r2], k) => {
  const r = ruled(A, B, q0, q1, 6, 12), a = ribPieces(r1), b = ribPieces(r2);
  add(`WEB${tag}-${k}-${c}`, 'web panel', nm, r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...b.map(id => [id, 0.5 / b.length])] });
}));
step('Webbing of the crossing and the transept', 'Thin courses close every cell, from the springing up to the bosses, while the centering still holds the ribs.');
webs('X', crossCells(), 'Vault web, crossing');
for (const s of SIDES) webs(`T${N(s)}`, armCells(s), `Vault web, ${ARMN(s)}`);
step('Strike the centering', 'The crossing and both arms carry themselves. The vault you see over the crossing is the one the spire fell through in 2019; it was rebuilt.');
removeAt(p => p.step === STEP_X_CEN);
step('Roofs of the transept and the crossing', 'The oak frame and the lead run across the transept from end to end, and the roofs of the nave and the choir carry on to meet them over the crossing.');
{
  const vs = []; for (let v = 4.75; v <= VEND - 0.7; v += 1.5) vs.push(v);
  const tieSup = (s, v) => v < 6.85 ? [[pid('P', s, 0, 4), 0.5], [xp(s, 5), 0.5]] : (b => [[aw(s, 'w', b, 2), 0.5], [aw(s, 'e', b, 2), 0.5]])(v < VI ? 0 : v < VM ? 1 : 2);
  for (const s of SIDES) {
    const t = N(s), ids = [];
    vs.forEach((v, i) => { const x = s * v, id = `TTB${t}${i}`; ids.push(id);
      beam(V3(x, RY + 0.18, ZT - RX), V3(x, RY + 0.18, ZT + RX), 0.36, id, 'tie beam', `Tie beam, ${ARMN(s)}`, tieSup(s, v));
      beam(V3(x, RY + 0.36, ZT - RX + 0.1), V3(x, RIDGE, ZT), 0.3, `TRF${t}${i}a`, 'rafter', `Rafter, ${ARMN(s)}`, [[id, 1]]);
      beam(V3(x, RY + 0.36, ZT + RX - 0.1), V3(x, RIDGE, ZT), 0.3, `TRF${t}${i}b`, 'rafter', `Rafter, ${ARMN(s)}`, [[id, 1]]);
      beam(V3(x, RY + 0.36, ZT), V3(x, RIDGE - 0.2, ZT), 0.26, `TKP${t}${i}`, 'king post', `King post, ${ARMN(s)}`, [[id, 1]]); });
    const on = ids.map(id => [id, 1 / ids.length]);
    beam(V3(s * 4, RIDGE + 0.1, ZT), V3(s * VEND, RIDGE + 0.1, ZT), 0.3, `TRIDGE${t}`, 'ridge beam', `Ridge beam, ${ARMN(s)}`, on);
    for (const side of SIDES) { const lenX = VEND - 0, g = new THREE.BoxGeometry(lenX, 0.08, Math.hypot(RX + 0.25, RIDGE + 0.42 - RY - 0.2)); g.rotateX(side * Math.atan2(RIDGE + 0.42 - RY - 0.2, RX + 0.25)); g.translate(s * lenX / 2, (RY + 0.2 + RIDGE + 0.42) / 2, ZT + side * (RX + 0.25) / 2);
      add(`TLD${t}${side}`, 'lead sheet', `Lead roof, ${ARMN(s)}`, g, { mat: 'lead', w: lenX * 12.7 * 0.004 * LEAD, sup: on, group: 'roof' }); }
  }
  beam(V3(-RX, RY + 0.18, ZS[0] - 1.5), V3(RX, RY + 0.18, ZS[0] - 1.5), 0.36, 'NTBX', 'tie beam', 'Tie beam, over the crossing', [[pid('P', -1, 0, 4), 0.5], [pid('P', 1, 0, 4), 0.5]]);
  for (const s of SIDES) beam(V3(s * (RX - 0.1), RY + 0.36, ZS[0] - 1.5), V3(0, RIDGE, ZS[0] - 1.5), 0.3, `NRFX${N(s)}`, 'rafter', 'Rafter, over the crossing', [['NTBX', 1]]);
  for (const s of SIDES) leadSheet(s * (RX + 0.25), RY + 0.2, 0, RIDGE + 0.42, ZT, ZS[0], `NLDX${N(s)}`, 'Lead roof, over the crossing', [['NTBX', 1]]);
  beam(V3(-RX, RY + 0.18, ZE + 1.5), V3(RX, RY + 0.18, ZE + 1.5), 0.36, 'CTBX', 'tie beam', 'Tie beam, over the crossing', [[xp(-1, 5), 0.5], [xp(1, 5), 0.5]]);
  for (const s of SIDES) beam(V3(s * (RX - 0.1), RY + 0.36, ZE + 1.5), V3(0, RIDGE, ZE + 1.5), 0.3, `CRFX${N(s)}`, 'rafter', 'Rafter, over the crossing', [['CTBX', 1]]);
  for (const s of SIDES) leadSheet(s * (RX + 0.25), RY + 0.2, 0, RIDGE + 0.42, ZE, ZT, `CLDX${N(s)}`, 'Lead roof, over the crossing', [['CTBX', 1]]);
}

bag(14, 'Spire');
const SR = 3.3, SPIRE = (k, y) => V3(SR * Math.cos(Math.PI * 2 * k / 8 + Math.PI / 8), y, ZT + SR * Math.sin(Math.PI * 2 * k / 8 + Math.PI / 8));
step('Spire base', 'Over the crossing, four great oak beams lie on the tops of the crossing piers. Everything above rests on them, and through them on the four piers.');
[[V3(-6.25, 35.5, ZS[0]), V3(6.25, 35.5, ZS[0]), [pid('P', -1, 0, 4), pid('P', 1, 0, 4)]], [V3(-6.25, 35.5, ZE), V3(6.25, 35.5, ZE), [xp(-1, 5), xp(1, 5)]],
 [V3(-6.25, 36.1, ZS[0]), V3(-6.25, 36.1, ZE), [pid('P', -1, 0, 4), xp(-1, 5)]], [V3(6.25, 36.1, ZS[0]), V3(6.25, 36.1, ZE), [pid('P', 1, 0, 4), xp(1, 5)]]]
  .forEach(([a, b, sup], k) => beam(a, b, 0.6, `SPB${k}`, 'spire beam', 'Spire base beam', sup.map(id => [id, 0.5])));
step('Spire, lower stage', 'Eight oak posts rise from the base to 60 m, braced and clad in lead: an open eight-sided lantern above the roofs.');
const SB = [0, 1, 2, 3].map(k => [`SPB${k}`, 0.25]);
for (let k = 0; k < 8; k++) beam(SPIRE(k, 36.4), SPIRE(k, 60), 0.45, `SPP${k}`, 'spire post', 'Spire post', SB);
{ const g = new THREE.CylinderGeometry(SR + 0.25, SR + 0.25, 13, 8, 1, true); g.rotateY(Math.PI / 8); g.translate(0, 53.5, ZT);
  add('SPL0', 'lead sheet', 'Spire, lead cladding, lower stage', g, { mat: 'lead', w: 100 * 9.81, sup: [...Array(8).keys()].map(k => [`SPP${k}`, 1 / 8]), group: 'roof' });
  const c = new THREE.CylinderGeometry(SR + 0.6, SR + 0.6, 1.2, 8); c.rotateY(Math.PI / 8); c.translate(0, 60.6, ZT);
  add('SPL1', 'lead sheet', 'Spire, lead crown', c, { mat: 'lead', w: 10 * 9.81, sup: [...Array(8).keys()].map(k => [`SPP${k}`, 1 / 8]), group: 'roof' }); }
step('Spire, needle', 'From 60 m the needle tapers to a point 93 m up, eight oak ribs under a skin of lead. The lead on the whole spire weighed about 250 tonnes.');
for (let k = 0; k < 8; k++) beam(SPIRE(k, 61.2), V3(0, 93, ZT), 0.35, `SPR${k}`, 'spire rib', 'Spire rib', [[`SPP${k}`, 1]]);
{ const g = new THREE.ConeGeometry(SR + 0.25, 32, 8, 1, true); g.rotateY(Math.PI / 8); g.translate(0, 61.2 + 16, ZT);
  add('SPL2', 'lead sheet', 'Spire, lead cladding, needle', g, { mat: 'lead', w: 140 * 9.81, sup: [...Array(8).keys()].map(k => [`SPR${k}`, 1 / 8]), group: 'roof' }); }
step('Cross and rooster', 'A cross tops the spire at 96 m, with a copper rooster on it. The rooster was found, battered, in the rubble after the fire.');
add('SPX', 'cross', 'Cross', (() => { const g = new THREE.BoxGeometry(0.2, 3.2, 0.2); g.translate(0, 94.4, ZT); return g; })(), { mat: 'lead', w: 0.5 * 9.81, sup: [...Array(8).keys()].map(k => [`SPR${k}`, 1 / 8]), group: 'roof' });
add('SPX2', 'cross', 'Cross, arm', (() => { const g = new THREE.BoxGeometry(1.6, 0.2, 0.2); g.translate(0, 95, ZT); return g; })(), { mat: 'lead', w: 0.1 * 9.81, sup: [['SPX', 1]], group: 'roof' });
{ const g = new THREE.SphereGeometry(0.32, 16, 12); g.scale(1.2, 0.9, 0.6); g.translate(0, 96.2, ZT); add('SPRO', 'rooster', 'The rooster', g, { mat: 'copper', sup: [['SPX', 1]], group: 'roof' }); }

step('The twelve apostles', 'Twelve copper apostles stand in four groups of three at the foot of the spire, one group on each roof. Viollet-le-Duc gave Saint Thomas his own face. On 11 April 2019 a crane lifted them off for restoration, four days before the fire; all twelve survived.');
{ const APO = KING.clone(); APO.scale(1.1, 1.1, 1.1);
  [[0, 1], [0, -1], [-1, 0], [1, 0]].forEach(([dx, dz], g) => [5.8, 7.2, 8.6].forEach((r, j) => { const a = APO.clone(); a.translate(dx * r, RIDGE + 0.4, ZT + dz * r);
    add(`APO-${g}-${j}`, 'apostle', 'Copper apostle', a, { mat: 'copper', sup: [[`SPB${g}`, 1]], group: 'roof' }); })); }

// ---------- The apse and the chevet ----------
// The choir ends in a half-circle, the apse, centred on the choir's last bay line (z = -66). Its walls stand on five
// narrow arches between six piers on a circle 6.25 m out (the first and last are the choir's), the two ambulatories run
// round it on circles of piers at 12.25 m and an outer wall at 18.25 m, and at four lines between, flyers about 15 m long
// leap both ambulatories to buttress piers 21.85 m out. The vault: four half-ribs from the piers to the choir's last
// keystone, with five wedge-shaped cells between them.
const ZA = SEGS[1].zs[0], PHI = [0, 1, 2, 3, 4, 5].map(k => Math.PI * k / 5), MID = [1, 2, 3, 4];
const at = (phi, r, y = 0) => V3(Math.cos(phi) * r, y, ZA - Math.sin(phi) * r);
const R1 = -XW, R2 = -XM, R3 = -XA, RI = -XI, RO = -XO, RB = RO + 15, RBD = 3.8;
const SUPA = Solver.supports(ARCH, SOL.state, { height: H0, width: WT, flyer: true, bdepth: RBD, pinnacle: true, gap: RB - RO, bheight: 21 }), FLA = SUPA.flyer;
// a piece on a radial line: a box from radius r0 to r1, half as wide as hw either side
function rbox(phi, r0, r1, y0, y1, hw) { const g = new THREE.BoxGeometry(r1 - r0, y1 - y0, 2 * hw); g.translate((r0 + r1) / 2, (y0 + y1) / 2, 0); g.rotateY(phi); g.translate(0, 0, ZA); return g; }
// the chord between two radial lines at radius r: its middle and its direction
const chord = (k, r) => { const a = at(PHI[k], r), b = at(PHI[k + 1], r), t = b.clone().sub(a); const len = t.length(); return { m: a.clone().add(b).multiplyScalar(0.5), t: t.normalize(), len }; };
function cbox(k, r, y0, y1, depth, trim = 0) { const { m, t, len } = chord(k, r), g = new THREE.BoxGeometry(len - 2 * trim, y1 - y0, depth); g.rotateY(Math.atan2(-t.z, t.x)); g.translate(m.x, (y0 + y1) / 2, m.z); return g; }
// the apse's pieces on its six lines: the two end lines are the choir's last bay line, north and south
const apId = (kind, k, c) => k === 0 ? pidOf('C' + kind, 1, 0, c) : k === 5 ? pidOf('C' + kind, -1, 0, c) : `AP-${kind}-${k}${c != null ? '-' + c : ''}`;
const ARCA = Solver.build({ shape: 'pointed', span: chord(0, R1).len - 1.7, thick: 0.45, count: 7 }), ARMA = Solver.build({ shape: 'pointed', span: chord(0, R2).len - 1.3, thick: 0.5, count: 9 });
const tri = (pts, mat, id, kind, nm, w, sup, group) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return add(id, kind, nm, g, { mat, w, sup, group }); };
const quad = (a, b, c, d) => [a, b, c, a, c, d];
const AWINA = lancet(0, 3.6, 1.8, 4.5), CLA = lancet(0, 21, 1.6, 7), GLA = [lancet(-1.6, 15.6, 1.2, 2.0), lancet(1.6, 15.6, 1.2, 2.0)], GOA = lancet(0, 15.2, 1.1, 2.2);
const panelA = (id, kind, nm, k, r, y0, y1, depth, holes, trim, sup) => { const { m, t, len } = chord(k, r), pts = rect(-len / 2 + trim, len / 2 - trim, y0, y1);
  return add(id, kind, nm, extr(pts, holes, depth, m.x, m.z, t.x, t.z), { w: extrVol(pts, holes, depth) * GAMMA, bear: (len - 2 * trim) * depth * 0.8, sup }); };

bag(15, 'Apse');
step('Footings for the apse', 'The choir ends in a half-circle, the apse. In the real cathedral this was where building started, in 1163; in the kit it comes last. Footings go down for its piers, the ambulatory piers and outer wall, and the buttresses.');
MID.forEach(k => { const p = PHI[k], a = at(p, R1), b = at(p, R2);
  add(apId('F', k), 'footing', `Footing, apse pier ${k}`, cylG(1.5, 1.5, 0, 0.6, a.x, a.z, 8), { w: Math.PI * 2.25 * 0.6 * GAMMA, bear: Math.PI * 2.25 });
  add(apId('FM', k), 'footing', `Footing, ambulatory pier ${k}`, cylG(1.1, 1.1, 0, 0.6, b.x, b.z, 8), { w: Math.PI * 1.21 * 0.6 * GAMMA, bear: Math.PI * 1.21 });
  add(apId('FB', k), 'footing', `Footing, apse buttress ${k}`, rbox(p, RB - 0.4, RB + RBD + 0.4, 0, 0.6, 1.0), { w: 4.6 * 2 * 0.6 * GAMMA, bear: 9.2 }); });
for (let k = 0; k < 5; k++) add(`APFW-${k}`, 'footing', `Footing, ambulatory wall ${k + 1}`, cbox(k, R3, 0, 0.6, 1.4, 0.3), { w: chord(k, R3).len * 1.4 * 0.6 * GAMMA, bear: chord(k, R3).len * 1.4 });
step('Apse and ambulatory piers', 'Round piers in drums, as in the nave: four for the apse, set close on a circle 12.5 m across, and four slimmer ones for the ambulatory behind them.');
MID.forEach(k => { const p = PHI[k], a = at(p, R1), b = at(p, R2);
  add(apId('B', k), 'pier base', `Base, apse pier ${k}`, cylG(1.08, 1.0, 0.6, 1.2, a.x, a.z, 8), { w: Math.PI * 1.04 * 1.04 * 0.6 * GAMMA, bear: Math.PI, sup: [[apId('F', k), 1]] });
  add(apId('BM', k), 'pier base', `Base, ambulatory pier ${k}`, cylG(0.8, 0.74, 0.6, 1.2, b.x, b.z, 8), { w: Math.PI * 0.6 * 0.6 * 0.6 * GAMMA, bear: Math.PI * 0.55, sup: [[apId('FM', k), 1]] });
  [[1.2, 3.6], [3.6, 6.0], [6.0, 8.4]].forEach(([y0, y1], c) => {
    add(apId('D', k, c), 'drum', `Drum ${c + 1}, apse pier ${k}`, cylG(0.75, 0.75, y0, y1, a.x, a.z, 40), { w: Math.PI * 0.5625 * (y1 - y0) * GAMMA, bear: Math.PI * 0.5625, sup: [[c ? apId('D', k, c - 1) : apId('B', k), 1]] });
    add(apId('DM', k, c), 'drum', `Drum ${c + 1}, ambulatory pier ${k}`, cylG(0.55, 0.55, y0, y1, b.x, b.z, 32), { w: Math.PI * 0.3025 * (y1 - y0) * GAMMA, bear: Math.PI * 0.3025, sup: [[c ? apId('DM', k, c - 1) : apId('BM', k), 1]] }); });
  add(apId('C', k), 'capital', `Capital, apse pier ${k}`, cylG(0.75, 1.02, 8.4, 8.9, a.x, a.z, 40), { w: Math.PI * 0.8 * 0.5 * GAMMA, bear: Math.PI * 0.5625, sup: [[apId('D', k, 2), 1]] });
  add(apId('AB', k), 'abacus block', `Abacus, apse pier ${k}`, rbox(p, R1 - 0.85, R1 + 0.85, 8.9, 9.2, 0.85), { w: 1.7 * 1.7 * 0.3 * GAMMA, bear: 2.89, sup: [[apId('C', k), 1]] });
  add(apId('CM', k), 'capital', `Capital, ambulatory pier ${k}`, cylG(0.55, 0.74, 8.4, 8.9, b.x, b.z, 32), { w: Math.PI * 0.42 * 0.5 * GAMMA, bear: Math.PI * 0.3025, sup: [[apId('DM', k, 2), 1]] });
  add(apId('AM', k), 'abacus block', `Abacus, ambulatory pier ${k}`, rbox(p, R2 - 0.65, R2 + 0.65, 8.9, 9.2, 0.65), { w: 1.3 * 1.3 * 0.3 * GAMMA, bear: 1.69, sup: [[apId('CM', k), 1]] });
});
step('Ambulatory wall and buttress piers', 'The outer wall of the ambulatory goes round in five straight runs, each with a window. Further out, four deep buttress piers start up on the lines between the apse piers.');
for (let k = 0; k < 5; k++) panelA(`APW-${k}`, 'wall stone', `Ambulatory wall ${k + 1}`, k, R3, 0.6, AWT, 1.0, [AWINA], 0.3, [[`APFW-${k}`, 1]]);
MID.forEach(k => add(`AP-BU-${k}-0`, 'buttress stone', `Apse buttress ${k}, course 1`, rbox(PHI[k], RB, RB + RBD, 0.6, LEV[0], 0.7), { w: RBD * 1.4 * 8.6 * GAMMA, bear: RBD * 1.4, sup: [[apId('FB', k), 1]] }));
step('Centering for the apse arcades', 'Timber frames for the five arches round the apse, narrow and steep because the piers stand so close, and for the wider arches of the ambulatory.');
for (let k = 0; k < 5; k++) { const a = chord(k, R1), b = chord(k, R2);
  placeCentering(`APAC-${k}`, ARCA, { y0: 9.2, ox: a.m.x, oz: a.m.z, dx: a.t.x, dz: a.t.z }); placeCentering(`APMC-${k}`, ARMA, { y0: 9.2, ox: b.m.x, oz: b.m.z, dx: b.t.x, dz: b.t.z }); }
const STEP_APC = cur;
step('Apse arcades', 'Seven stones to each arch round the apse, nine to each ambulatory arch, then arches across both ambulatories on every line.');
for (let k = 0; k < 5; k++) { const a = chord(k, R1), b = chord(k, R2);
  placeArch(`APA-${k}`, ARCA, { y0: 9.2, depth: WT, ox: a.m.x, oz: a.m.z, dx: a.t.x, dz: a.t.z, springL: [[apId('AB', k), 1]], springR: [[apId('AB', k + 1), 1]], name: `Apse arch ${k + 1}` });
  placeArch(`APM-${k}`, ARMA, { y0: 9.2, depth: 0.8, ox: b.m.x, oz: b.m.z, dx: b.t.x, dz: b.t.z, springL: [[apId('AM', k), 1]], springR: [[apId('AM', k + 1), 1]], name: `Ambulatory arcade ${k + 1}` }); }
MID.forEach(k => { const p = PHI[k], d = at(p, 1).sub(at(p, 0)), a = at(p, -AIX), b = at(p, -AOX);
  placeArch(`APAI-${k}`, AIL, { y0: 9.2, depth: 0.5, ox: a.x, oz: a.z, dx: d.x, dz: d.z, springL: [[apId('AB', k), 1]], springR: [[apId('AM', k), 1]], name: `Inner ambulatory arch ${k}` });
  placeArch(`APAO-${k}`, AOL, { y0: 9.2, depth: 0.5, ox: b.x, oz: b.z, dx: d.x, dz: d.z, springL: [[apId('AM', k), 1]], springR: [[`APW-${k - 1}`, 0.5], [`APW-${k}`, 0.5]], name: `Outer ambulatory arch ${k}` }); });
step('Strike the apse centering', 'The frames come out. The arches round the apse carry themselves.');
removeAt(p => p.step === STEP_APC);
step('Ambulatory vaults', 'Between the arches, wedge-shaped vaults close both ambulatories, wider on the outside than the inside as they turn round the apse.');
for (let k = 0; k < 5; k++) for (const [key, B, rc, sup] of [
  ['APVI', AIL, -AIX, [[apId('AB', k), 0.25], [apId('AB', k + 1), 0.25], [apId('AM', k), 0.25], [apId('AM', k + 1), 0.25]]],
  ['APVO', AOL, -AOX, [[apId('AM', k), 0.25], [apId('AM', k + 1), 0.25], [`APW-${k}`, 0.5]]]]) {
  const cl = B.c, kk = u => { const p = cl.p(u), n = cl.n(u); return [p[0] + n[0] * 0.2, p[1] + n[1] * 0.2 + 9.2]; };
  for (const h of [-1, 1]) {
    const Apt = (q, phi) => { const [x, y] = kk(q * cl.uCrown); return at(phi, rc + (h < 0 ? x : -x), y); };
    const r = ruled(q => Apt(q, PHI[k] + 0.012), q => Apt(q, PHI[k + 1] - 0.012), 0, 1, 10, 12);
    add(`${key}-${k}-${h < 0 ? 'a' : 'b'}`, 'web panel', `${key === 'APVI' ? 'Inner' : 'Outer'} ambulatory vault ${k + 1}`, r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup });
  }
}
step('Apse walls', 'The walls rise on the apse arches in five narrow panels: a gallery opening, then a tall window in each. The gallery\'s outer wall goes up on the ambulatory arcade.');
MID.forEach(k => { for (let c = 0; c < 5; c++) add(apId('P', k, c), 'wall-pier stone', `Apse wall pier ${k}, course ${c + 1}`, rbox(PHI[k], RI, RO, LEV[c], LEV[c + 1], 0.5), { w: WT * 1.0 * (LEV[c + 1] - LEV[c]) * GAMMA, bear: WT, sup: [[c ? apId('P', k, c - 1) : apId('AB', k), 1]] });
  for (let c = 0; c < 2; c++) add(apId('PM', k, c), 'wall-pier stone', `Apse gallery pier ${k}, course ${c + 1}`, rbox(PHI[k], R2 - 0.4, R2 + 0.4, LEV[c], LEV[c + 1], 0.5), { w: 0.8 * (LEV[c + 1] - LEV[c]) * GAMMA, bear: 0.8, sup: [[c ? apId('PM', k, c - 1) : apId('AM', k), 1]] }); });
const ps = (k, c) => [[apId('P', k, c), 0.5], [apId('P', k + 1, c), 0.5]];
for (let k = 0; k < 5; k++) {
  panelA(`APS-${k}`, 'spandrel', `Apse spandrel ${k + 1}`, k, R1, 11.6, LEV[1], WT, [], 0.5, [[`APA-${k}-K`, 1]]);
  panelA(`APG-${k}`, 'wall stone', `Apse gallery wall ${k + 1}`, k, R1, LEV[1], LEV[2], WT, [GOA], 0.5, ps(k, 1));
  panelA(`APC-${k}`, 'wall stone', `Apse clerestory wall ${k + 1}`, k, R1, LEV[2], LEV[5], WT, [CLA], 0.5, ps(k, 2));
  panelA(`APGO-${k}`, 'wall stone', `Apse gallery, outer wall ${k + 1}`, k, R2, 15.2, LEV[2], 0.8, GLA, 0.4, [[apId('PM', k, 1), 0.5], [apId('PM', k + 1, 1), 0.5]]);
  add(`APCO-${k}`, 'cornice stone', `Apse cornice ${k + 1}`, cbox(k, R1, 34.8, 35.2, 1.6), { w: chord(k, R1).len * 1.6 * 0.4 * GAMMA, bear: chord(k, R1).len * 1.6, sup: [[`APC-${k}`, 1]] });
}

bag(16, 'Chevet');
step('Apse buttresses, upper courses', `The four apse buttresses rise to ${FLA.hb} m, standing alone ${Math.round(RB)} m from the centre of the apse, beyond both ambulatories.`);
MID.forEach(k => { add(`AP-BU-${k}-1`, 'buttress stone', `Apse buttress ${k}, course 2`, rbox(PHI[k], RB, RB + RBD, LEV[0], LEV[1], 0.7), { w: RBD * 1.4 * 5.4 * GAMMA, bear: RBD * 1.4, sup: [[`AP-BU-${k}-0`, 1]] });
  add(`AP-BU-${k}-2`, 'buttress stone', `Apse buttress ${k}, course 3`, rbox(PHI[k], RB, RB + RBD, LEV[1], FLA.hb, 0.7), { w: RBD * 1.4 * (FLA.hb - LEV[1]) * GAMMA, bear: RBD * 1.4, sup: [[`AP-BU-${k}-1`, 1]] }); });
const NFA = 9, flyerA = () => { const d = 0.6, x0 = RO, x1 = RB, top = r => FLA.yA + (FLA.yB - FLA.yA) * (r - x0) / (x1 - x0) + d / 2, sag = r => 1.3 * Math.sin(Math.PI * (r - x0) / (x1 - x0)), out = [];
  for (let i = 0; i < NFA; i++) { const a = x0 + (x1 - x0) * i / NFA, b = x0 + (x1 - x0) * (i + 1) / NFA, pts = [];
    for (let k = 0; k <= 6; k++) { const r = a + (b - a) * k / 6; pts.push([r, top(r)]); }
    for (let k = 6; k >= 0; k--) { const r = a + (b - a) * k / 6; pts.push([r, top(r) - d - sag(r)]); }
    out.push(pts); }
  return out; };
step('Centering for the chevet flyers', 'The flyers round the apse are the longest in the building, about 15 m in a single flight over both ambulatories. Each gets a long centering.');
MID.forEach(k => { const p = PHI[k], a = at(p, RO, FLA.yA - 1.8), b = at(p, RB, FLA.yB - 1.0), d = b.clone().sub(a);
  const tube = new THREE.CylinderGeometry(0.12, 0.12, d.length(), 10); tube.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); tube.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  add(`APFC-${k}`, 'centering timber', 'Flyer centering, rib', tube, { mat: 'timber' });
  [0.25, 0.5, 0.75].forEach((q, j) => { const c = a.clone().lerp(b, q); add(`APFC-${k}-${j}`, 'centering timber', 'Flyer centering, prop', cylG(0.09, 0.09, 13, c.y, c.x, c.z, 10), { mat: 'timber' }); }); });
const STEP_APF_CEN = cur;
step('Chevet flyers', `${NFA} stones each, from the top of the apse wall down to the buttress ${Math.round(RB - RO)} m away. Jean Ravy built flyers like these round the apse in the 1300s. To the solver a flyer is a strut, so its length does not change the answer: the walls and buttresses stand as in the nave. What a long flyer makes harder is carrying its own weight.`);
MID.forEach(k => { const p = PHI[k], d = at(p, 1).sub(at(p, 0));
  flyerA().forEach((poly, j) => add(`APFY-${k}-${j}`, 'flyer stone', `Chevet flyer ${k}, stone ${j + 1}`, extr(poly, [], 0.8, 0, ZA, d.x, d.z), { w: extrVol(poly, [], 0.8) * GAMMA, bear: 0.48, sup: [[`AP-BU-${k}-2`, 0.5], [apId('P', k, 2), 0.5]] })); });
step('Strike the flyer centering', 'The chevet flyers stand on their own, waiting for the apse vault to push against them.');
removeAt(p => p.step === STEP_APF_CEN);
step('Pinnacles round the apse', 'A pinnacle on each apse buttress, where the flyer\'s push arrives.');
MID.forEach(k => { const c = at(PHI[k], RB + RBD / 2);
  add(`APPN-${k}-0`, 'pinnacle stone', `Apse pinnacle ${k}, shaft`, rbox(PHI[k], RB + RBD / 2 - 0.95, RB + RBD / 2 + 0.95, FLA.hb, FLA.hb + 2.2, 0.6), { w: 1.9 * 1.2 * 2.2 * GAMMA, bear: 2.28, sup: [[`AP-BU-${k}-2`, 1]] });
  const sp = new THREE.ConeGeometry(1.05, 3.6, 4); sp.rotateY(Math.PI / 4 + PHI[k]); sp.translate(c.x, FLA.hb + 4, c.z);
  add(`APPN-${k}-1`, 'spire stone', `Apse pinnacle ${k}, spire`, sp, { w: 1.3 * 3.6 / 3 * GAMMA, bear: 1.2, sup: [[`APPN-${k}-0`, 1]] }); });
// the apse vault: a half-rib on each of the four lines, from its wall pier to the choir's last keystone
step('Centering for the apse vault', 'A half-frame of timber under each of the four apse ribs, from the wall to the centre.');
MID.forEach(k => { const p = PHI[k], half = ARCH.intrados.map(([x, y]) => at(p, -x, y + H0 - 0.14));
  add(`APVC-${k}`, 'centering timber', 'Apse centering, curved rib', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(half), 48, 0.13, 10, false), { mat: 'timber' });
  [0.4, 0.75].forEach((q, j) => { const c = at(p, R1 * q, 0); add(`APVC-${k}-${j}`, 'centering timber', 'Apse centering, prop', cylG(0.1, 0.1, 0, H0 + ARCH.rise * (1 - q * q) * 0.9, c.x, c.z, 10), { mat: 'timber' }); }); });
const STEP_APV_CEN = cur;
step('Apse ribs', 'Four half-ribs climb from the apse wall to the keystone of the choir\'s last transverse rib, so the apse vault is a half-umbrella round it.');
MID.forEach(k => { const d = at(PHI[k], 1).sub(at(PHI[k], 0)), id = j => `APR${k}-L${j}`;
  archShapes(ARCH).filter(a => a.side < 0).forEach(a => { const pts = a.pts.map(([s, y]) => [s, y + H0]);
    add(id(a.j), 'voussoir', `Apse rib ${k}, voussoir ${a.j + 1}`, extr(pts, [], RIBW * 0.8, 0, ZA, -d.x, -d.z), { w: a.A * RIBW * 0.8 * GAMMA, bear: ARCH.t * RIBW * 0.8, sup: a.j ? [[id(a.j - 1), 1]] : [[apId('P', k, 2), 1]] }); }); });
step('Apse webbing', 'Thin courses fill the five wedges between the ribs, from the springing up to the keystone.');
{ const curve = phi => q => { const [x, y] = trv(q); return at(phi, -x, y); }, ribOf = k => k === 0 || k === 5 ? 'CTR0' : `APR${k}`;
  [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => { for (let k = 0; k < 5; k++) {
    const r = ruled(curve(PHI[k]), curve(PHI[k + 1]), q0, q1, 6, 14), a = ribPieces(ribOf(k)), b = ribPieces(ribOf(k + 1));
    add(`WEBA-${k}-${c}`, 'web panel', 'Vault web, apse', r.g, { w: r.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...b.map(id => [id, 0.5 / b.length])] }); } }); }
step('Strike the apse centering', 'The apse vault carries itself, and the chevet flyers take its push out over the ambulatories.');
removeAt(p => p.step === STEP_APV_CEN);
step('Apse roofs', 'Oak rafters fan out from the end of the choir\'s ridge, and lead covers the half-cone of the apse roof and the roofs of the gallery and ambulatory below.');
{ const apex = V3(0, RIDGE, ZA), eave = (phi, y) => at(phi, RX + 0.25, y), rs = [1, 2, 3, 4, 5].map(k => Math.PI * k / 6);
  rs.forEach((phi, i) => beam(at(phi, RX - 0.1, RY + 0.36), apex, 0.3, `APRF${i}`, 'rafter', 'Apse rafter', [[`APCO-${Math.min(4, Math.floor(phi / (Math.PI / 5)))}`, 1]]));
  const on = rs.map((_, i) => [`APRF${i}`, 1 / rs.length]);
  for (let k = 0; k < 5; k++) {
    tri([V3(0, RIDGE + 0.42, ZA), eave(PHI[k], RY + 0.2), eave(PHI[k + 1], RY + 0.2)], 'lead', `APLD-${k}`, 'lead sheet', 'Apse roof', chord(k, RX).len * 11 / 2 * 0.004 * LEAD, on, 'roof');
    tri(quad(at(PHI[k], RO + 0.1, LEV[2] + 1.5), at(PHI[k + 1], RO + 0.1, LEV[2] + 1.5), at(PHI[k + 1], R2 + 0.45, LEV[2] + 0.3), at(PHI[k], R2 + 0.45, LEV[2] + 0.3)), 'lead', `APLG-${k}`, 'lead sheet', 'Apse gallery roof', 8 * 0.004 * LEAD, [[`APGO-${k}`, 0.5], [apId('P', k, 1), 0.5]], 'roof');
    tri(quad(at(PHI[k], R2 + 0.45, LEV[1] + 0.3), at(PHI[k + 1], R2 + 0.45, LEV[1] + 0.3), at(PHI[k + 1], R3 + 0.6, AWT + 0.2), at(PHI[k], R3 + 0.6, AWT + 0.2)), 'lead', `APLA-${k}`, 'lead sheet', 'Ambulatory roof', 12 * 0.004 * LEAD, [[`APW-${k}`, 0.5], [`APGO-${k}`, 0.5]], 'roof');
  } }

// ---------- Bag 17: Finishing ----------
bag(17, 'Finishing');
step('Glazing', 'Glass in every window: the outer aisles, the gallery, the round band windows by the crossing, the clerestory, the transept, the apse, and the three roses.');
for (let k = 0; k < 5; k++) {
  const a = chord(k, R1), b = chord(k, R3), c = chord(k, R2);
  add(`GL-APC-${k}`, 'glass panel', 'Stained glass', extr(CLA, [], 0.05, a.m.x, a.m.z, a.t.x, a.t.z), { mat: 'glass', tint: k % 3 });
  add(`GL-APW-${k}`, 'glass panel', 'Stained glass', extr(AWINA, [], 0.05, b.m.x, b.m.z, b.t.x, b.t.z), { mat: 'glass', tint: (k + 1) % 3 });
  GLA.forEach((h, j) => add(`GL-APG-${k}${j}`, 'glass panel', 'Stained glass', extr(h, [], 0.05, c.m.x, c.m.z, c.t.x, c.t.z), { mat: 'glass', tint: (k + j) % 3 }));
}
eachSeg(() => {
  const ALL = [...Array(NB).keys()];
  const GLASS = [['aislewin', XA, [AWIN], ALL], ['gallery', XM, GWIN, ALL], ['oculus', XW, [circle(0, 21.8, 0.9)], [ORIGB]], ['clere', XW, [CWIN], [ORIGB]], ['clereT', XW, [CWIN_T], late()]];
  GLASS.forEach(([g, x0, shapes, bays]) => { for (const s of SIDES) for (const b of bays) shapes.forEach((pts, k) => add(`GL-${TG}${g}-${s}${b}${k}`, 'glass panel', 'Stained glass', extr(pts, [], 0.05, X(s, x0), ZC(b), 0, 1), { mat: 'glass', tint: (b + k + (s > 0 ? 1 : 0)) % 3 })); });
});
add('GL-rose-in', 'glass panel', 'Rose window glass', extr(circle(0, RY0, 2.7, 64), [], 0.05, 0, RZ - 0.3, 1, 0), { mat: 'glass', tint: 0 });
add('GL-rose-out', 'glass panel', 'Rose window glass', extr(circle(0, RY0, 4.8, 64), [circle(0, RY0, 2.7, 64)], 0.05, 0, RZ - 0.3, 1, 0), { mat: 'glass', tint: 1 });
for (const s of SIDES) {
  for (const [, z0, z1] of ARMSIDES) ARMB.forEach((_, b) => ARMHOLES[2][b].forEach((h, k) => add(`GL-TA-${N(s)}${z0}-${b}${k}`, 'glass panel', 'Stained glass', extr(mirror(s, h), [], 0.05, 0, (z0 + z1) / 2, 1, 0), { mat: 'glass', tint: (b + k) % 3 })));
  TCV.forEach((h, k) => add(`GL-TCV-${N(s)}${k}`, 'glass panel', 'Stained glass', extr(h, [], 0.05, X(s, -EX), 0, 0, 1), { mat: 'glass', tint: k % 3 }));
  const gx = X(s, -(VEND + 1.2));
  add(`GL-TR-${N(s)}-in`, 'glass panel', `${ARMN(s)} rose glass`, extr(circle(ZT, TRY0, 3.95, 72), [], 0.05, gx, 0, 0, 1), { mat: 'glass', tint: s < 0 ? 1 : 0 });
  add(`GL-TR-${N(s)}-out`, 'glass panel', `${ARMN(s)} rose glass`, extr(circle(ZT, TRY0, TRR, 72), [circle(ZT, TRY0, 3.95, 72)], 0.05, gx, 0, 0, 1), { mat: 'glass', tint: s < 0 ? 0 : 1 });
  add(`GL-TG-${N(s)}`, 'glass panel', 'Stained glass', extr(circle(ZT, 37.5, 1.6, 32), [], 0.05, X(s, -EX), 0, 0, 1), { mat: 'glass', tint: 1 });
}
step('Doors', 'Oak doors for the five portals, two leaves each, hung behind the lintels.');
for (const s of SIDES) [-1, 1].forEach(side => add(`DR-T${N(s)}${side}`, 'door leaf', `${TNAME(s)}, door`, boxG(...lr(s, -(VEND + 1.0), -(VEND + 0.85)), 0.62, 6.2, ...(side < 0 ? [ZT - TPW / 2 + 0.05, ZT - 0.04] : [ZT + 0.04, ZT + TPW / 2 - 0.05])), { mat: 'oak', w: (TPW / 2) * 5.6 * 0.15 * OAK }));
PORTALS.forEach(([, cx, w, nm], p) => [-1, 1].forEach(side => add(`DR-${p}-${side}`, 'door leaf', `${nm}, door`, boxG(...(side < 0 ? [cx - w / 2 + 0.05, cx - 0.04] : [cx + 0.04, cx + w / 2 - 0.05]), 0.65, 6.2, TZ1 - 1.4, TZ1 - 1.25), { mat: 'oak', w: (w / 2) * 5.5 * 0.15 * OAK })));
step('Paving', 'Stone paving everywhere: the nave and choir and their aisles, the last bay between the towers, the crossing, the transept and the apse. Notre-Dame, finished.');
for (let k = 0; k < 5; k++) tri([at(0, 0, 0.08), at(PHI[k], R3 - 0.5, 0.08), at(PHI[k + 1], R3 - 0.5, 0.08)], 'pave', `PV-AP${k}`, 'paving slab', 'Paving, apse', 0, []);
add('PV-W', 'paving slab', 'Paving, last bay', boxG(XI, -XI, 0, 0.08, ZS[NB], WB), { mat: 'pave' });
add('PV-X', 'paving slab', 'Paving, crossing', boxG(XI, -XI, 0, 0.08, ZE + 0.35, ZS[0] - 0.35), { mat: 'pave' });
for (const s of SIDES) add(`PV-T${N(s)}`, 'paving slab', `Paving, ${ARMN(s)}`, boxG(...lr(s, -VEND, XI), 0, 0.08, ZE + 0.35, ZS[0] - 0.35), { mat: 'pave' });
eachSeg(() => { for (let b = 0; b < NB; b++) {
  add(`PV-${TG}N${b}`, 'paving slab', `${NMC} paving, bay ${b + 1}`, boxG(XI, -XI, 0, 0.08, ZS[b], ZS[b + 1]), { mat: 'pave' });
  for (const s of SIDES) {
    add(pid('PVI', s, b), 'paving slab', `Inner aisle paving, ${SN(s)} bay ${b + 1}`, boxG(...lr(s, XM, XO), 0, 0.08, ZS[b], ZS[b + 1]), { mat: 'pave' });
    add(pid('PVO', s, b), 'paving slab', `Outer aisle paving, ${SN(s)} bay ${b + 1}`, boxG(...lr(s, XA + 0.5, XM), 0, 0.08, ZS[b], ZS[b + 1]), { mat: 'pave' });
  }
} });

// ---------- Force lines ----------
// The line of thrust at each bay line: through the transverse rib, down both walls, along both flyers and through both
// buttress piers, as lists of points, plus the points where each base resultant meets the ground. One entry per bay line,
// so the page can show one whole path at a time.
export function forceLines() {
  const tp = Solver.thrustPoints(ARCH, SOL.state);
  return SEGS.flatMap(G => G.zs.map((z, i) => [z, G.ends.includes(i)])).map(([z, end]) => {
    const lines = [{ pts: [...tp.slice().reverse(), ...tp.slice(1).map(([x, y]) => [-x, y])].map(([x, y]) => V3(x, y + H0, z)), r: 0.14 }], bases = [];
    for (const s of SIDES) {
      lines.push({ pts: SUP.wall.line.filter(p => isFinite(p[0])).map(([x, y]) => V3(X(s, x), y, z)), r: 0.12 });
      lines.push({ pts: [V3(X(s, XO), FL.yA, z), V3(X(s, FL.xbI), FL.yB, z)], r: 0.14 });
      lines.push({ pts: SUP.buttress.line.filter(p => isFinite(p[0])).map(([x, y]) => V3(s < 0 ? x : -x, y, z)), r: 0.12 });
      for (const c of [SUP.wall, SUP.buttress]) bases.push(V3(X(s, c.x0), 0.2, z));
    }
    return { z, end, at: V3(0, 20, z), normal: V3(0, 0, 1), lines, bases };
  }).concat(MID.map(k => {
    const p = PHI[k], w = (x, y) => at(p, -x, y);
    const lines = [{ pts: tp.map(([x, y]) => w(x, y + H0)), r: 0.14 }, { pts: SUPA.wall.line.filter(q => isFinite(q[0])).map(([x, y]) => w(x, y)), r: 0.12 },
      { pts: [w(XO, FLA.yA), w(FLA.xbI, FLA.yB)], r: 0.14 }, { pts: SUPA.buttress.line.filter(q => isFinite(q[0])).map(([x, y]) => w(x, y)), r: 0.12 }];
    const a = at(p, 12, 20);
    return { z: a.z, end: false, radial: true, at: a, normal: V3(Math.sin(p), 0, Math.cos(p)), lines, bases: [SUPA.wall, SUPA.buttress].map(c => w(c.x0, 0.2)) };
  }));
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

// what hides the line of thrust once it is built: the west front, from the west (from the east, the apse's own lines show)
export const HIDERS = [{ step: STEP_FRONT, west: TZ0, msg: 'From the west, the front hides the vault.' }];
export { pieces, steps, STEP_STRUCK };
