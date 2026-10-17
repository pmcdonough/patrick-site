// Gothic: a cathedral built from a description. aisled() takes the numbers for a stretch of bays (a nave, a choir, the
// arms of a transept) and builds it on the kit in the masons' order: footings, piers, arcades on centering, aisles,
// upper walls, buttresses and flying buttresses, a four-part vault on centering, roofs. Each stretch is drawn in its own
// frame (local x across, local z along, y up), so the same code builds a vessel running in any direction, and where two
// stretches meet (a crossing, an aisle that runs on into a transept) they share piers by name.
//
// This is the engine for building your own cathedral: a design is a description, and the solver checks it as it goes up.
// Units: metres, kN. Nothing here touches the page.
import * as THREE from './vendor/three.module.js?v=0.9';
import * as Solver from './solver.js?v=0.9';
import { V3, GAMMA, OAK, LEAD, boxG, cylG, extr, extrVol, lancet, rect, circle, ruled } from './kit.js?v=0.9';

export const SIDES = [-1, 1];
export const X = (s, x) => s < 0 ? x : -x;                   // a position drawn on the negative side, mirrored to side s
const lr = (s, a, b) => s < 0 ? [a, b] : [-b, -a];
const rng = (a, b) => [Math.min(a, b), Math.max(a, b)];
// the top of a rib, from springing (q = 0) to crown (q = 1), as [x, y] with x on the negative half
export const ribTop = (B, sx, y0) => q => { const u = q * B.c.uCrown, p = B.c.p(u), n = B.c.n(u), e = B.t / 2 - 0.1; return [(p[0] + n[0] * e) * sx, p[1] + n[1] * e + y0]; };
const archCache = new Map();
export const pointed = (span, thick, count) => { const k = `${span.toFixed(3)}|${thick}|${count}`; if (!archCache.has(k)) archCache.set(k, Solver.build({ shape: 'pointed', span, thick, count })); return archCache.get(k); };

// ---------- Frames ----------
// origin (ox, oz) and two axis-aligned unit directions in plan: u for local x, v for local z
export function frame(ox, oz, u, v) {
  const P = (x, y, z) => V3(ox + u[0] * x + v[0] * z, y, oz + u[1] * x + v[1] * z);
  const box = (x0, x1, y0, y1, z0, z1) => { const a = P(x0, 0, z0), b = P(x1, 0, z1), [xa, xb] = rng(a.x, b.x), [za, zb] = rng(a.z, b.z); return boxG(xa, xb, y0, y1, za, zb); };
  const cyl = (r0, r1, y0, y1, x, z, seg) => { const p = P(x, 0, z); return cylG(r0, r1, y0, y1, p.x, p.z, seg); };
  const across = (pts, holes, depth, z) => { const o = P(0, 0, z); return extr(pts, holes, depth, o.x, o.z, u[0], u[1]); };   // profile in (local x, y)
  const along = (pts, holes, depth, x) => { const o = P(x, 0, 0); return extr(pts, holes, depth, o.x, o.z, v[0], v[1]); };   // profile in (local z, y)
  const dir = (du, dv) => V3(u[0] * du + v[0] * dv, 0, u[1] * du + v[1] * dv);
  const quad = (a, b, c, d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return g; };
  return { P, box, cyl, across, along, dir, quad, u, v, normal: V3(v[0], 0, v[1]) };
}
export function beamG(a, b, r) { const d = b.clone().sub(a), g = new THREE.BoxGeometry(r, d.length(), r); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g; }
export function tubeG(a, b, r) { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 8, 1, true); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g; }

// ---------- The section ----------
// The main vessel's cross-section, which the solver checks: the vault's span and thickness, the wall, the springing height,
// and the levels and sizes everything else hangs on. Positions are on the negative side; X() mirrors them.
export function section(o) {
  const ARCH = Solver.build({ shape: 'pointed', span: o.span, thick: o.thick, count: 11 }), SOL = Solver.solve(ARCH);
  const XI = ARCH.joints[0].A[0], XO = XI - o.wall, XW = (XI + XO) / 2, XA1 = XW - o.aisle, XA2 = XA1 - o.aisle;
  const sec = { ...o, ARCH, SOL, XI, XO, XW, XA1, XA2, crown: o.springing + ARCH.rise + o.thick / 2 };
  sec.outer = n => n === 1 ? XA1 : XA2;                       // the outer wall's centre line, with one aisle or two
  sec.xbI = n => sec.outer(n) - o.aisleWall / 2;            // the buttresses' inner face, against the outer wall
  sec.xbO = n => sec.xbI(n) - o.bdepth;
  sec.supports = n => Solver.supports(ARCH, SOL.state, { height: o.springing, width: o.wall, flyer: true, bdepth: o.bdepth, pinnacle: true, gap: XO - sec.xbI(n), bheight: o.flyerLow });
  return sec;
}

// ---------- A stretch of bays ----------
// runs: [{ T (id prefix), F (frame), lines (bay lines, local z), name, sideName(s), sides: { [-1|1]: side } }], built
// together step by step. A side: { aisles: 1 | 2, open: bays with no outer wall (they open into a neighbour), line(i):
// 'buttress' | 'corner' | 'none' | { sup } (what stands on the outer wall line at line i), noAisleArch: lines,
// chapels: bays, mainLink(i) / aisleLink(i): another stretch's pier to use at line i }, plus ribLink(i) on the run.
export function aisled(K, sec, runs, text) {
  const { add, removeAt, placeArch, placeCentering } = K;
  const { ARCH, XI, XO, XW, XA1, wall: WT, springing: H0 } = sec, LV = sec.levels;
  const T = text, step = (title, note, opts) => K.step(title, note, opts);
  const stepT = (key, opts) => { if (T.bag) T.bag(key); return step(T[key][0], T[key][1], opts); };
  for (const r of runs) {
    r.nb = r.lines.length - 1; r.ZC = b => (r.lines[b] + r.lines[b + 1]) / 2; r.Lb = b => r.lines[b + 1] - r.lines[b];
    r.pid = (k, s, i, c) => `${r.T}${k}-${s < 0 ? 'A' : 'B'}${i}${c != null ? '-' + c : ''}`;
    for (const s of SIDES) { const d = r.sides[s]; d.open ??= new Set(); d.noAisleArch ??= new Set(); d.chapels ??= new Set(); d.line ??= () => 'buttress'; d.mainLink ??= () => null; d.aisleLink ??= () => null; }
    r.mp = (k, s, i, c) => { const l = r.sides[s].mainLink(i); return l ? l(k, c) : r.pid(k, s, i, c); };
    r.ap = (k, s, i, c) => { const l = r.sides[s].aisleLink(i); return l ? l(k, c) : r.pid('M' + k, s, i, c); };
    r.mode = (s, i) => r.sides[s].line(i);
    r.outerSup = (s, i, course = 0) => { const m = r.mode(s, i); return m === 'buttress' ? [[r.pid('BU', s, i, course), 1]] : m === 'corner' ? [[r.pid('K', s, i), 1]] : m.sup ? m.sup : null; };
    r.ribAt = i => (r.ribLink && r.ribLink(i)) || `${r.T}TR${i}`;
  }
  const eachLine = (f, filter = () => true) => { for (const r of runs) for (const s of SIDES) r.lines.forEach((z, i) => { if (filter(r, s, i)) f(r, s, i, z); }); };
  const eachBay = (f, filter = () => true) => { for (const r of runs) for (const s of SIDES) for (let b = 0; b < r.nb; b++) if (filter(r, s, b)) f(r, s, b, r.ZC(b), r.Lb(b)); };
  const ownMain = (r, s, i) => !r.sides[s].mainLink(i), ownAisle = (r, s, i) => r.sides[s].aisles === 2 && !r.sides[s].aisleLink(i);
  const N = (r, s, what) => `${what} (${r.name.toLowerCase()}, ${r.sideName(s)})`;
  const PIER = { drums: [1.2, 5.4, 9.6, 13.5, 17.6], r: 0.8, ab: 1.0 }, APIER = { drums: [1.2, 5.3, 9.4, 12.9], r: 0.55, ab: 0.65 };
  const wallTop = sec.aisleTop, corn = LV.cornice, aw = sec.aisleWall;

  stepT('footings');
  eachLine((r, s, i, z) => {
    const F = r.F, n = r.sides[s].aisles, m = r.mode(s, i);
    if (ownMain(r, s, i)) add(r.mp('F', s, i), 'footing', N(r, s, `Footing, pier ${i + 1}`), F.box(X(s, XW) - 1.5, X(s, XW) + 1.5, 0, 0.6, z - 1.5, z + 1.5), { w: 9 * 0.6 * GAMMA, bear: 9 });
    if (ownAisle(r, s, i)) add(r.ap('F', s, i), 'footing', N(r, s, `Footing, aisle pier ${i + 1}`), F.box(X(s, XA1) - 1.0, X(s, XA1) + 1.0, 0, 0.6, z - 1.0, z + 1.0), { w: 4 * 0.6 * GAMMA, bear: 4 });
    if (m === 'buttress') add(r.pid('FB', s, i), 'footing', N(r, s, `Footing, buttress ${i + 1}`), F.box(...lr(s, sec.xbO(n) - 0.4, sec.xbI(n) + 0.3), 0, 0.6, z - 1.1, z + 1.1), { w: (sec.bdepth + 0.7) * 2.2 * 0.6 * GAMMA, bear: (sec.bdepth + 0.7) * 2.2 });
    if (m === 'corner') add(r.pid('FK', s, i), 'footing', N(r, s, `Footing, corner pier ${i + 1}`), F.box(X(s, sec.outer(n)) - 1.2, X(s, sec.outer(n)) + 1.2, 0, 0.6, z - 1.2, z + 1.2), { w: 5.8 * 0.6 * GAMMA, bear: 5.8 });
  });
  eachBay((r, s, b, zc, L) => { const n = r.sides[s].aisles, x = sec.outer(n);
    add(r.pid('FW', s, b), 'footing', N(r, s, `Footing, outer wall ${b + 1}`), r.F.box(X(s, x) - 0.8, X(s, x) + 0.8, 0, 0.6, zc - L / 2 + 1.1, zc + L / 2 - 1.1), { w: 1.6 * (L - 2.2) * 0.6 * GAMMA, bear: 1.6 * (L - 2.2) }); }, (r, s, b) => !r.sides[s].open.has(b));

  stepT('piers');
  eachLine((r, s, i, z) => {
    const F = r.F;
    if (ownMain(r, s, i)) {
      add(r.mp('B', s, i), 'pier base', N(r, s, `Base, pier ${i + 1}`), F.cyl(1.15, 1.05, 0.6, 1.2, X(s, XW), z, 8), { w: Math.PI * 1.2 * 0.6 * GAMMA, bear: Math.PI * 1.2, sup: [[r.mp('F', s, i), 1]] });
      PIER.drums.slice(0, -1).forEach((y0, c) => { const y1 = PIER.drums[c + 1];
        add(r.mp('D', s, i, c), 'drum', N(r, s, `Drum ${c + 1}, pier ${i + 1}`), F.cyl(PIER.r, PIER.r, y0, y1, X(s, XW), z, 40), { w: Math.PI * PIER.r ** 2 * (y1 - y0) * GAMMA, bear: Math.PI * PIER.r ** 2, sup: [[c ? r.mp('D', s, i, c - 1) : r.mp('B', s, i), 1]] }); });
      add(r.mp('C', s, i), 'capital', N(r, s, `Capital, pier ${i + 1}`), F.cyl(PIER.r, 1.12, 17.6, 18.2, X(s, XW), z, 40), { w: Math.PI * 0.9 * 0.6 * GAMMA, bear: Math.PI * PIER.r ** 2, sup: [[r.mp('D', s, i, 3), 1]] });
      add(r.mp('AB', s, i), 'abacus block', N(r, s, `Abacus, pier ${i + 1}`), F.box(X(s, XW) - PIER.ab, X(s, XW) + PIER.ab, 18.2, LV.arcade, z - PIER.ab, z + PIER.ab), { w: 4 * 0.4 * GAMMA, bear: 4, sup: [[r.mp('C', s, i), 1]] });
    }
    if (ownAisle(r, s, i)) {
      add(r.ap('B', s, i), 'pier base', N(r, s, `Base, aisle pier ${i + 1}`), F.cyl(0.8, 0.74, 0.6, 1.2, X(s, XA1), z, 8), { w: Math.PI * 0.6 * 0.6 * GAMMA, bear: Math.PI * 0.55, sup: [[r.ap('F', s, i), 1]] });
      APIER.drums.slice(0, -1).forEach((y0, c) => { const y1 = APIER.drums[c + 1];
        add(r.ap('D', s, i, c), 'drum', N(r, s, `Drum ${c + 1}, aisle pier ${i + 1}`), F.cyl(APIER.r, APIER.r, y0, y1, X(s, XA1), z, 32), { w: Math.PI * APIER.r ** 2 * (y1 - y0) * GAMMA, bear: Math.PI * APIER.r ** 2, sup: [[c ? r.ap('D', s, i, c - 1) : r.ap('B', s, i), 1]] }); });
      add(r.ap('C', s, i), 'capital', N(r, s, `Capital, aisle pier ${i + 1}`), F.cyl(APIER.r, 0.76, 12.9, 13.3, X(s, XA1), z, 32), { w: Math.PI * 0.45 * 0.4 * GAMMA, bear: Math.PI * APIER.r ** 2, sup: [[r.ap('D', s, i, 2), 1]] });
      add(r.ap('AB', s, i), 'abacus block', N(r, s, `Abacus, aisle pier ${i + 1}`), F.box(X(s, XA1) - APIER.ab, X(s, XA1) + APIER.ab, 13.3, sec.aisleSpring, z - APIER.ab, z + APIER.ab), { w: 1.69 * 0.2 * GAMMA, bear: 1.69, sup: [[r.ap('C', s, i), 1]] });
    }
  });

  // the arcades: along the vessel between the main piers, and with two aisles between the aisle piers
  const arcadeOf = L => pointed(L - 2 * PIER.ab, 0.7, 9), aisleArcadeOf = L => pointed(L - 2 * APIER.ab, 0.5, 9);
  stepT('arcadeCentering');
  eachBay((r, s, b, zc, L) => { const o = r.F.P(X(s, XW), 0, zc), d = r.F.dir(0, 1); placeCentering(r.pid('AC', s, b), arcadeOf(L), { y0: LV.arcade, ox: o.x, oz: o.z, dx: d.x, dz: d.z });
    if (r.sides[s].aisles === 2) { const a = r.F.P(X(s, XA1), 0, zc); placeCentering(r.pid('MC', s, b), aisleArcadeOf(L), { y0: sec.aisleSpring, ox: a.x, oz: a.z, dx: d.x, dz: d.z }); } });
  const STEP_AC = K.at();
  stepT('arcades');
  eachBay((r, s, b, zc, L) => { const o = r.F.P(X(s, XW), 0, zc), d = r.F.dir(0, 1);
    placeArch(r.pid('A', s, b), arcadeOf(L), { y0: LV.arcade, depth: WT, ox: o.x, oz: o.z, dx: d.x, dz: d.z, springL: [[r.mp('AB', s, b), 1]], springR: [[r.mp('AB', s, b + 1), 1]], name: N(r, s, `Arcade, bay ${b + 1}`) });
    if (r.sides[s].aisles === 2) { const a = r.F.P(X(s, XA1), 0, zc); placeArch(r.pid('AR', s, b), aisleArcadeOf(L), { y0: sec.aisleSpring, depth: 0.8, ox: a.x, oz: a.z, dx: d.x, dz: d.z, springL: [[r.ap('AB', s, b), 1]], springR: [[r.ap('AB', s, b + 1), 1]], name: N(r, s, `Aisle arcade, bay ${b + 1}`) }); } });
  stepT('arcadeStrike');
  removeAt(p => p.step === STEP_AC);

  // the aisles: outer walls, the buttresses' lower courses, the arches across each aisle and its vaults
  stepT('aisleWalls');
  eachBay((r, s, b, zc, L) => { const n = r.sides[s].aisles, x = sec.outer(n), hw = L / 2 - 0.75, win = lancet(zc, 4, Math.min(4.2, 2 * hw - 1.4), 8.5), pts = rect(zc - hw, zc + hw, 0.6, wallTop);
    add(r.pid('W', s, b), 'wall stone', N(r, s, `Outer wall, bay ${b + 1}`), r.F.along(pts, [win], aw, X(s, x)), { w: extrVol(pts, [win], aw) * GAMMA, bear: 2 * hw * aw, sup: [[r.pid('FW', s, b), 1]] }); }, (r, s, b) => !r.sides[s].open.has(b));
  eachLine((r, s, i, z) => { const n = r.sides[s].aisles, m = r.mode(s, i);
    if (m === 'buttress') [[0.6, sec.aisleSpring], [sec.aisleSpring, wallTop]].forEach(([y0, y1], c) => add(r.pid('BU', s, i, c), 'buttress stone', N(r, s, `Buttress ${i + 1}, course ${c + 1}`), r.F.box(...lr(s, sec.xbO(n), sec.xbI(n)), y0, y1, z - 0.75, z + 0.75), { w: sec.bdepth * 1.5 * (y1 - y0) * GAMMA, bear: sec.bdepth * 1.5, sup: [[c ? r.pid('BU', s, i, c - 1) : r.pid('FB', s, i), 1]] }));
    if (m === 'corner') add(r.pid('K', s, i), 'pier stone', N(r, s, `Corner pier ${i + 1}`), r.F.box(X(s, sec.outer(n)) - 0.85, X(s, sec.outer(n)) + 0.85, 0.6, wallTop, z - 0.85, z + 0.85), { w: 2.9 * (wallTop - 0.6) * GAMMA, bear: 2.9, sup: [[r.pid('FK', s, i), 1]] }); });
  const ail = n => pointed((XW - PIER.r) - (n === 2 ? XA1 + APIER.r : XA1 + aw / 2), 0.5, 7), ailX = n => ((XW - PIER.r) + (n === 2 ? XA1 + APIER.r : XA1 + aw / 2)) / 2;
  const aol = pointed((XA1 - APIER.r) - (sec.XA2 + aw / 2), 0.5, 7), aolX = ((XA1 - APIER.r) + (sec.XA2 + aw / 2)) / 2;
  stepT('aisleVaults');
  eachLine((r, s, i, z) => { const n = r.sides[s].aisles, d = r.F.dir(1, 0), inner = [[r.mp('D', s, i, 2), 1]];
    if (r.sides[s].noAisleArch.has(i)) return;
    const mid = n === 2 ? [[r.ap('AB', s, i), 1]] : r.outerSup(s, i);
    if (!mid) throw new Error(`nothing to carry the aisle arch at ${r.T} line ${i}`);
    const a = r.F.P(X(s, ailX(n)), 0, z);
    placeArch(r.pid('AI', s, i), ail(n), { y0: sec.aisleSpring, depth: 0.5, ox: a.x, oz: a.z, dx: d.x, dz: d.z, springL: s < 0 ? mid : inner, springR: s < 0 ? inner : mid, name: N(r, s, `Aisle arch ${i + 1}`) });
    if (n === 2) { const out = r.outerSup(s, i); if (!out) throw new Error(`nothing to carry the outer aisle arch at ${r.T} line ${i}`);
      const o = r.F.P(X(s, aolX), 0, z); placeArch(r.pid('AO', s, i), aol, { y0: sec.aisleSpring, depth: 0.5, ox: o.x, oz: o.z, dx: d.x, dz: d.z, springL: s < 0 ? out : mid, springR: s < 0 ? mid : out, name: N(r, s, `Outer aisle arch ${i + 1}`) }); } });
  eachBay((r, s, b, zc, L) => { const n = r.sides[s].aisles;
    for (const [key, B, cx, sup] of [['VI', ail(n), ailX(n), [[r.mp('AB', s, b), 0.25], [r.mp('AB', s, b + 1), 0.25], ...(n === 2 ? [[r.ap('AB', s, b), 0.25], [r.ap('AB', s, b + 1), 0.25]] : [[r.mp('D', s, b, 2), 0.25], [r.mp('D', s, b + 1, 2), 0.25]])]],
      ...(n === 2 ? [['VO', aol, aolX, [[r.ap('AB', s, b), 0.5], [r.ap('AB', s, b + 1), 0.5]]]] : [])]) {
      const cl = B.c, k = u => { const p = cl.p(u), m = cl.n(u); return [p[0] + m[0] * 0.2, p[1] + m[1] * 0.2 + sec.aisleSpring]; };
      for (const h of [-1, 1]) {
        const at = (q, z) => { const [x, y] = k(q * cl.uCrown); return r.F.P(X(s, cx) + (h < 0 ? x : -x), y, z); };
        const g = ruled(q => at(q, r.lines[b] + 0.25), q => at(q, r.lines[b + 1] - 0.25), 0, 1, 10, 12);
        add(r.pid(key, s, b, h < 0 ? 'a' : 'b'), 'web panel', N(r, s, `Aisle vault, bay ${b + 1}`), g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup });
      }
    } });

  // the upper walls: wall piers over the main piers, the spandrels over the arcade, the triforium and the clerestory
  const LVU = [LV.arcade, LV.triforium, H0, (H0 + corn) / 2, corn];
  const spandrel = (L, zc) => { const B = arcadeOf(L), hw = L / 2 - 0.75, ext = B.extrados.map(([x, y]) => [x + zc, y + LV.arcade]).filter(([x]) => x >= zc - hw);
    return [[zc - hw, ext[0][1]], ...ext, ...ext.slice().reverse().map(([x, y]) => [2 * zc - x, y]), [zc + hw, ext[0][1]], [zc + hw, LV.triforium], [zc - hw, LV.triforium]]; };
  stepT('upperWalls');
  eachLine((r, s, i, z) => { LVU.slice(0, -1).forEach((y0, c) => { const y1 = LVU[c + 1];
    add(r.mp('P', s, i, c), 'wall-pier stone', N(r, s, `Wall pier ${i + 1}, course ${c + 1}`), r.F.box(X(s, XW) - WT / 2, X(s, XW) + WT / 2, y0, y1, z - 0.75, z + 0.75), { w: WT * 1.5 * (y1 - y0) * GAMMA, bear: WT * 1.5, sup: [[c ? r.mp('P', s, i, c - 1) : r.mp('AB', s, i), 1]] }); });
    [-0.4, 0, 0.4].forEach((dz, k) => add(r.pid('SH', s, i, k), 'shaft', N(r, s, `Vaulting shaft ${i + 1}`), r.F.cyl(0.16, 0.16, LV.arcade, H0, X(s, XI + 0.17), z + dz, 16), { w: Math.PI * 0.026 * (H0 - LV.arcade) * GAMMA, bear: 0.08, sup: [[r.mp('AB', s, i), 1]] })); }, (r, s, i) => ownMain(r, s, i));
  eachBay((r, s, b, zc, L) => { const hw = L / 2 - 0.75, ps = c => [[r.mp('P', s, b, c), 0.5], [r.mp('P', s, b + 1, c), 0.5]];
    const sp = spandrel(L, zc); add(r.pid('S', s, b), 'spandrel', N(r, s, `Spandrel, bay ${b + 1}`), r.F.along(sp, [], WT, X(s, XW)), { w: extrVol(sp, [], WT) * GAMMA, bear: 2 * hw * WT, sup: [[r.pid('A', s, b) + '-K', 1]] });
    const w = (2 * hw - 1.2) / 4, tri = [0, 1, 2, 3].map(k => lancet(zc - hw + 0.6 + w * (k + 0.5), LV.triforium + 0.6, w * 0.7, 2.4)), tp = rect(zc - hw, zc + hw, LV.triforium, H0);
    add(r.pid('TF', s, b), 'wall stone', N(r, s, `Triforium, bay ${b + 1}`), r.F.along(tp, tri, WT, X(s, XW)), { w: extrVol(tp, tri, WT) * GAMMA, bear: 2 * hw * WT * 0.7, sup: ps(1) });
    const cw = Math.min(5.2, 2 * hw * 0.78), cl = lancet(zc, H0 + 1, cw, corn - H0 - 2.2 - cw * 0.866), cp = rect(zc - hw, zc + hw, H0, corn);
    add(r.pid('CL', s, b), 'wall stone', N(r, s, `Clerestory, bay ${b + 1}`), r.F.along(cp, [cl], WT, X(s, XW)), { w: extrVol(cp, [cl], WT) * GAMMA, bear: 2 * hw * WT * 0.5, sup: ps(2) });
    add(r.pid('CO', s, b), 'cornice stone', N(r, s, `Cornice, bay ${b + 1}`), r.F.box(...lr(s, XO - 0.35, XI + 0.05), corn, corn + 0.4, zc - L / 2, zc + L / 2), { w: (WT + 0.4) * L * 0.4 * GAMMA, bear: (WT + 0.4) * L, sup: [[r.pid('CL', s, b), 1]] }); });

  // buttresses rise, then flyers: one flight over one aisle, two flights over two (with a pier between them), and over a
  // single aisle a second, upper tier that braces the top of the wall and the roof against the wind
  const low = sec.flyerLow, high = sec.flyerHigh, yA = H0 - 1, yU = H0 + 7;
  const flightY = (n, x) => yA + (low - yA) * (x - XO) / (sec.xbI(n) - XO);
  stepT('buttresses');
  eachLine((r, s, i, z) => { const n = r.sides[s].aisles, top = n === 1 && sec.tiers === 2 ? high : low;
    [[wallTop, low], ...(top > low ? [[low, high]] : [])].forEach(([y0, y1], k) => { const c = k + 2;
      add(r.pid('BU', s, i, c), 'buttress stone', N(r, s, `Buttress ${i + 1}, course ${c + 1}`), r.F.box(...lr(s, sec.xbO(n), sec.xbI(n)), y0, y1, z - 0.75, z + 0.75), { w: sec.bdepth * 1.5 * (y1 - y0) * GAMMA, bear: sec.bdepth * 1.5, sup: [[r.pid('BU', s, i, c - 1), 1]] }); });
    if (n === 2) { const ym = flightY(2, XA1);
      add(r.pid('BI', s, i), 'buttress stone', N(r, s, `Flyer pier ${i + 1}`), r.F.box(X(s, XA1) - 0.6, X(s, XA1) + 0.6, sec.aisleSpring, ym - 0.2, z - 0.7, z + 0.7), { w: 1.2 * 1.4 * (ym - sec.aisleSpring) * GAMMA, bear: 1.68, sup: [[r.ap('AB', s, i), 1]] }); } },
  (r, s, i) => r.mode(s, i) === 'buttress');
  const flyerStones = (x0, x1, y0, y1, nst, d, sag) => { const top = x => y0 + (y1 - y0) * (x - x0) / (x1 - x0) + d / 2, out = [];
    for (let k = 0; k < nst; k++) { const a = x0 + (x1 - x0) * k / nst, b = x0 + (x1 - x0) * (k + 1) / nst, pts = [];
      for (let j = 0; j <= 6; j++) { const x = a + (b - a) * j / 6; pts.push([x, top(x)]); }
      for (let j = 6; j >= 0; j--) { const x = a + (b - a) * j / 6; pts.push([x, top(x) - d - sag * Math.sin(Math.PI * (x - x0) / (x1 - x0))]); }
      out.push(pts); }
    return out; };
  // every flight on a line: [x0, x1, y0, y1, landing support, wall support, stones, depth, sag, tag]
  const flights = (r, s, i) => { const n = r.sides[s].aisles, xb = sec.xbI(n);
    if (n === 2) { const ym = flightY(2, XA1);
      return [[XO, XA1 + 0.6, yA, ym, [[r.pid('BI', s, i), 1]], [[r.mp('P', s, i, 1), 1]], 5, 0.45, 0.5, 'L'], [XA1 - 0.6, xb, ym, low, [[r.pid('BU', s, i, 2), 1]], [[r.pid('BI', s, i), 1]], 5, 0.45, 0.5, 'O']]; }
    return [[XO, xb, yA, low, [[r.pid('BU', s, i, 2), 1]], [[r.mp('P', s, i, 1), 1]], 7, 0.5, 0.7, 'L'], ...(sec.tiers === 2 ? [[XO, xb, yU, high, [[r.pid('BU', s, i, 3), 1]], [[r.mp('P', s, i, 3), 1]], 7, 0.4, 0.55, 'U']] : [])]; };
  stepT('flyerCentering');
  eachLine((r, s, i, z) => flights(r, s, i).forEach(([x0, x1, y0, y1, , , , , , tag]) => {
    const a = r.F.P(X(s, x0), y0 - 1.6, z), b = r.F.P(X(s, x1), y1 - 1.0, z);
    add(r.pid('FC' + tag, s, i), 'centering timber', 'Flyer centering, rib', tubeG(a, b, 0.12), { mat: 'timber' });
    [0.3, 0.7].forEach((q, k) => { const c = a.clone().lerp(b, q); add(r.pid('FC' + tag, s, i, k), 'centering timber', 'Flyer centering, prop', cylG(0.09, 0.09, wallTop, c.y, c.x, c.z, 8), { mat: 'timber' }); }); }),
  (r, s, i) => r.mode(s, i) === 'buttress');
  const STEP_FC = K.at();
  stepT('flyers');
  eachLine((r, s, i, z) => flights(r, s, i).forEach(([x0, x1, y0, y1, land, wallSup, nst, d, sag, tag]) =>
    flyerStones(x0, x1, y0, y1, nst, d, sag).forEach((poly, k) => { const pts = poly.map(([x, y]) => [X(s, x), y]);
      add(r.pid('FY' + tag, s, i, k), 'flyer stone', N(r, s, `${tag === 'U' ? 'Upper flyer' : tag === 'O' ? 'Outer flight' : 'Flyer'} ${i + 1}, stone ${k + 1}`), r.F.across(pts, [], 0.8, z), { w: extrVol(pts, [], 0.8) * GAMMA, bear: 0.8 * d, sup: [...land.map(([id]) => [id, 0.5]), ...wallSup.map(([id]) => [id, 0.5])] }); })),
  (r, s, i) => r.mode(s, i) === 'buttress');
  stepT('flyerStrike');
  removeAt(p => p.step === STEP_FC);
  const pinnacle = (id, nm, p, y0, sup) => { add(`${id}-0`, 'pinnacle stone', `${nm}, shaft`, boxG(p.x - 0.8, p.x + 0.8, y0, y0 + 3.2, p.z - 0.8, p.z + 0.8), { w: 1.6 * 1.6 * 3.2 * GAMMA, bear: 2.56, sup });
    const sp = new THREE.ConeGeometry(0.85, 7.5, 4); sp.rotateY(Math.PI / 4); sp.translate(p.x, y0 + 3.2 + 3.75, p.z); add(`${id}-1`, 'spire stone', `${nm}, spire`, sp, { w: 0.85 * 0.85 * 2 * 7.5 / 3 * GAMMA, bear: 1.4, sup: [[`${id}-0`, 1]] });
    const fin = new THREE.SphereGeometry(0.22, 16, 12); fin.translate(p.x, y0 + 10.9, p.z); add(`${id}-2`, 'finial', `${nm}, finial`, fin, { w: 1, sup: [[`${id}-1`, 1]] }); };
  stepT('pinnacles');
  eachLine((r, s, i, z) => { const n = r.sides[s].aisles, top = n === 1 && sec.tiers === 2 ? high : low;
    pinnacle(r.pid('PN', s, i), N(r, s, `Pinnacle ${i + 1}`), r.F.P(X(s, (sec.xbO(n) + sec.xbI(n)) / 2), 0, z), top, [[r.pid('BU', s, i, top > low ? 3 : 2), 1]]);
    if (n === 2) pinnacle(r.pid('PI', s, i), N(r, s, `Flyer pier pinnacle ${i + 1}`), r.F.P(X(s, XA1), 0, z), flightY(2, XA1) - 0.2, [[r.pid('BI', s, i), 1]]); },
  (r, s, i) => r.mode(s, i) === 'buttress');

  // the vault: a four-part vault in every bay, on centering; transverse ribs on the bay lines, diagonals, wall ribs
  const P3 = (r, s, i) => [[r.mp('P', s, i, 1), 1]];
  const wallRib = L => pointed(L - 0.75, 0.35, 7);
  const ribIn = (r, prefix, B, { cu = 0, cv, du, dv, sx = 1, depth, name, withKey = true, springL, springR }) => {
    const c = r.F.P(cu * 1, 0, cv), d = r.F.dir(du, dv);
    return placeArch(prefix, B, { sx, y0: H0, depth, ox: c.x, oz: c.z, dx: d.x, dz: d.z, springL, springR, name, withKey }); };
  const cenIn = (r, prefix, B, { cu = 0, cv, du, dv, sx = 1 }) => { const c = r.F.P(cu, 0, cv), d = r.F.dir(du, dv); placeCentering(prefix, B, { sx, y0: H0, ox: c.x, oz: c.z, dx: d.x, dz: d.z }); };
  const diag = L => { const D = Math.hypot(sec.span, L); return { D, Q1: [sec.span / D, L / D], Q2: [sec.span / D, -L / D] }; };
  stepT('vaultCentering');
  for (const r of runs) {
    r.lines.forEach((z, i) => { if (!(r.ribLink && r.ribLink(i))) cenIn(r, `${r.T}TC${i}`, ARCH, { cv: z, du: 1, dv: 0 }); });
    for (let b = 0; b < r.nb; b++) { const { D, Q1, Q2 } = diag(r.Lb(b)); cenIn(r, `${r.T}DC${b}a`, ARCH, { cv: r.ZC(b), du: Q1[0], dv: Q1[1], sx: D / sec.span }); cenIn(r, `${r.T}DC${b}b`, ARCH, { cv: r.ZC(b), du: Q2[0], dv: Q2[1], sx: D / sec.span }); }
  }
  const STEP_VC = K.at();
  stepT('ribs');
  for (const r of runs) {
    // the sides: s = -1 is local x negative; a rib running along +u has its left springer there
    r.lines.forEach((z, i) => { if (!(r.ribLink && r.ribLink(i))) ribIn(r, `${r.T}TR${i}`, ARCH, { cv: z, du: 1, dv: 0, depth: 0.65, name: `${r.name}, transverse rib ${i + 1}`, springL: P3(r, -1, i), springR: P3(r, 1, i) }); });
    for (let b = 0; b < r.nb; b++) {
      const { D, Q1, Q2 } = diag(r.Lb(b)), k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0;
      ribIn(r, `${r.T}DA${b}`, ARCH, { cv: r.ZC(b), du: Q1[0], dv: Q1[1], sx: D / sec.span, depth: 0.55, name: `${r.name}, diagonal rib, bay ${b + 1}`, withKey: false, springL: P3(r, -1, b), springR: P3(r, 1, b + 1) });
      ribIn(r, `${r.T}DB${b}`, ARCH, { cv: r.ZC(b), du: Q2[0], dv: Q2[1], sx: D / sec.span, depth: 0.55, name: `${r.name}, diagonal rib, bay ${b + 1}`, withKey: false, springL: P3(r, -1, b + 1), springR: P3(r, 1, b) });
      const c = r.F.P(0, 0, r.ZC(b)); add(`${r.T}BOSS${b}`, 'boss', `${r.name}, boss, bay ${b + 1}`, cylG(0.6, 0.6, top - 1.1, top + 0.05, c.x, c.z, 32), { w: Math.PI * 0.36 * 1.15 * GAMMA, sup: [[`${r.T}DA${b}-L${k}`, 0.25], [`${r.T}DA${b}-R${k}`, 0.25], [`${r.T}DB${b}-L${k}`, 0.25], [`${r.T}DB${b}-R${k}`, 0.25]] });
      for (const s of SIDES) ribIn(r, `${r.T}WR${s < 0 ? 'A' : 'B'}${b}`, wallRib(r.Lb(b)), { cu: X(s, XI + 0.18), cv: r.ZC(b), du: 0, dv: 1, depth: 0.35, name: N(r, s, `Wall rib, bay ${b + 1}`), springL: P3(r, s, b), springR: P3(r, s, b + 1) });
    }
  }
  const half = (r, B, sx, cu, cv, du, dv, h) => { const top = ribTop(B, sx, H0); return q => { const [x, y] = top(q); const t = h < 0 ? x : -x; return r.F.P(cu + du * t, y, cv + dv * t); }; };
  const ribPieces = pre => K.pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
  stepT('webbing');
  for (const r of runs) for (let b = 0; b < r.nb; b++) {
    const { D, Q1, Q2 } = diag(r.Lb(b)), z0 = r.lines[b], z1 = r.lines[b + 1], zc = r.ZC(b), WR = wallRib(r.Lb(b));
    const Tr = (z, h) => half(r, ARCH, 1, 0, z, 1, 0, h), G = (d, h) => half(r, ARCH, D / sec.span, 0, zc, d[0], d[1], h), W = (s, h) => half(r, WR, 1, X(s, XI + 0.2), zc, 0, 1, h);
    const A = `${r.T}DA${b}`, B2 = `${r.T}DB${b}`, w = s => `${r.T}WR${s < 0 ? 'A' : 'B'}${b}`;
    const cells = [[Tr(z0, -1), G(Q1, -1), r.ribAt(b), A], [Tr(z0, 1), G(Q2, 1), r.ribAt(b), B2], [Tr(z1, -1), G(Q2, -1), r.ribAt(b + 1), B2], [Tr(z1, 1), G(Q1, 1), r.ribAt(b + 1), A],
      [W(-1, -1), G(Q1, -1), w(-1), A], [W(-1, 1), G(Q2, -1), w(-1), B2], [W(1, -1), G(Q2, 1), w(1), B2], [W(1, 1), G(Q1, 1), w(1), A]];
    [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => cells.forEach(([P1, P2, r1, r2], k) => {
      const g = ruled(P1, P2, q0, q1, 6, 12), a = ribPieces(r1), bb = ribPieces(r2);
      add(`${r.T}WEB${b}-${k}-${c}`, 'web panel', `${r.name}, vault web, bay ${b + 1}`, g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...bb.map(id => [id, 0.5 / bb.length])] }); }));
  }
  stepT('vaultStrike', { focus: 'forces' });
  removeAt(p => p.step === STEP_VC);
  const STEP_STRUCK = K.at();

  // roofs: an oak frame and lead over the main vessel, and lean-to roofs over the aisles under the flyers
  const RX = -XO + 0.4, RY = corn + 0.4, RIDGE = RY + RX * 1.43;
  stepT('roofs');
  for (const r of runs) {
    const z0 = r.lines[0], z1 = r.lines.at(-1), trusses = [];
    for (let z = z0 + 0.75; z < z1; z += 1.5) trusses.push(z);
    const bayOf = z => { let b = 0; while (b < r.nb - 1 && z > r.lines[b + 1]) b++; return b; };
    trusses.forEach((z, i) => { const b = bayOf(z), id = `${r.T}RT${i}`;
      add(id, 'tie beam', `${r.name}, tie beam`, beamG(r.F.P(-RX, RY + 0.18, z), r.F.P(RX, RY + 0.18, z), 0.36), { mat: 'oak', w: 0.13 * 2 * RX * OAK, sup: [[r.pid('CO', -1, b), 0.5], [r.pid('CO', 1, b), 0.5]], group: 'roof' });
      for (const s of SIDES) add(`${r.T}RR${i}${s < 0 ? 'a' : 'b'}`, 'rafter', `${r.name}, rafter`, beamG(r.F.P(X(s, -RX + 0.1), RY + 0.36, z), r.F.P(0, RIDGE, z), 0.3), { mat: 'oak', w: 0.09 * 13 * OAK, sup: [[id, 1]], group: 'roof' });
      add(`${r.T}RK${i}`, 'king post', `${r.name}, king post`, beamG(r.F.P(0, RY + 0.36, z), r.F.P(0, RIDGE - 0.2, z), 0.26), { mat: 'oak', w: 0.07 * (RIDGE - RY) * OAK, sup: [[id, 1]], group: 'roof' }); });
    const on = trusses.map((_, i) => [`${r.T}RT${i}`, 1 / trusses.length]);
    for (let b = 0; b < r.nb; b++) { const za = r.lines[b], zb = r.lines[b + 1];
      for (const s of SIDES) {
        add(r.pid('LD', s, b), 'lead sheet', N(r, s, `Lead roof, bay ${b + 1}`), r.F.quad(r.F.P(X(s, -RX - 0.25), RY + 0.2, za), r.F.P(0, RIDGE + 0.42, za), r.F.P(0, RIDGE + 0.42, zb), r.F.P(X(s, -RX - 0.25), RY + 0.2, zb)), { mat: 'lead', w: (zb - za) * 14 * 0.004 * LEAD, sup: on, group: 'roof' });
        const n = r.sides[s].aisles, xo = sec.outer(n) - aw / 2 - 0.1;
        add(r.pid('LA', s, b), 'lead sheet', N(r, s, `Aisle roof, bay ${b + 1}`), r.F.quad(r.F.P(X(s, XO - 0.1), r.aisleRoofTop ?? sec.aisleRoofTop, za + 0.3), r.F.P(X(s, xo), wallTop + 0.3, za + 0.3), r.F.P(X(s, xo), wallTop + 0.3, zb - 0.3), r.F.P(X(s, XO - 0.1), r.aisleRoofTop ?? sec.aisleRoofTop, zb - 0.3)), { mat: 'lead', w: (zb - za) * 9 * 0.004 * LEAD, sup: [[r.mp('P', s, b, 1), 0.5], [r.mp('P', s, b + 1, 1), 0.5]], group: 'roof' });
      }
      add(`${r.T}RG${b}`, 'ridge beam', `${r.name}, ridge beam`, beamG(r.F.P(0, RIDGE + 0.1, za), r.F.P(0, RIDGE + 0.1, zb), 0.3), { mat: 'oak', w: 0.09 * (zb - za) * OAK, sup: on, group: 'roof' });
    }
  }

  // what the caller builds later: chapels between the buttresses, glass, paving, and the force lines
  const CHH = sec.chapelTop, CHG = CHH + 4, CHWIN = (zc, w) => lancet(zc, 3.4, w, 7);
  return {
    STEP_STRUCK, RIDGE, RX, RY,
    chapels() {
      eachBay((r, s, b, zc, L) => { const n = r.sides[s].aisles, x0 = sec.xbO(n), x1 = x0 + 0.9, hw = L / 2 - 0.75, pts = rect(zc - hw, zc + hw, 0.6, CHH), win = CHWIN(zc, Math.min(3.2, 2 * hw - 1.6));
        add(r.pid('CHF', s, b), 'footing', N(r, s, `Footing, chapel ${b + 1}`), r.F.box(...lr(s, x0 - 0.4, x1 + 0.4), 0, 0.6, zc - hw, zc + hw), { w: 1.7 * 2 * hw * 0.6 * GAMMA, bear: 3.4 * hw });
        add(r.pid('CH', s, b), 'wall stone', N(r, s, `Chapel, bay ${b + 1}`), r.F.along(pts, [win], 0.9, X(s, (x0 + x1) / 2)), { w: extrVol(pts, [win], 0.9) * GAMMA, bear: 2 * hw * 0.9, sup: [[r.pid('CHF', s, b), 1]] });
        const gp = [[zc - hw, CHH], [zc + hw, CHH], [zc, CHG]], oc = [circle(zc, CHH + 1.4, 0.6, 20)];
        add(r.pid('CHG', s, b), 'wall stone', N(r, s, `Chapel gable, bay ${b + 1}`), r.F.along(gp, oc, 0.9, X(s, (x0 + x1) / 2)), { w: extrVol(gp, oc, 0.9) * GAMMA, bear: 2 * hw * 0.9, sup: [[r.pid('CH', s, b), 1]] });
        const p = r.F.P(X(s, (x0 + x1) / 2), 0, zc), cone = new THREE.ConeGeometry(0.35, 2.2, 4); cone.rotateY(Math.PI / 4); cone.translate(p.x, CHG + 0.7, p.z);
        add(r.pid('CHP', s, b), 'pinnacle stone', N(r, s, `Chapel pinnacle, bay ${b + 1}`), cone, { w: 0.4 * GAMMA, bear: 0.3, sup: [[r.pid('CHG', s, b), 1]] });
        const xo = sec.outer(n) - aw / 2;
        add(r.pid('CHT', s, b), 'lead sheet', N(r, s, `Chapel roof, bay ${b + 1}`), r.F.box(...lr(s, x1, xo), CHH - 0.1, CHH + 0.05, zc - hw, zc + hw), { mat: 'lead', w: 2 * hw * (xo - x1) * 0.004 * LEAD, sup: [[r.pid('CH', s, b), 0.5], [r.pid('W', s, b), 0.5]], group: 'roof' }); },
      (r, s, b) => r.sides[s].chapels.has(b) && r.mode(s, b) === 'buttress' && r.mode(s, b + 1) === 'buttress' && !r.sides[s].open.has(b));
    },
    glaze() {
      eachBay((r, s, b, zc, L) => { const hw = L / 2 - 0.75, tint = (b + (s > 0 ? 1 : 0)) % 3;
        const cw = Math.min(5.2, 2 * hw * 0.78), cl = lancet(zc, H0 + 1, cw, corn - H0 - 2.2 - cw * 0.866);
        add(r.pid('GLC', s, b), 'glass panel', 'Stained glass', r.F.along(cl, [], 0.05, X(s, XW)), { mat: 'glass', tint });
        if (r.glazedTriforium) { const w = (2 * hw - 1.2) / 4; [0, 1, 2, 3].forEach(k => add(r.pid('GLT', s, b, k), 'glass panel', 'Stained glass', r.F.along(lancet(zc - hw + 0.6 + w * (k + 0.5), LV.triforium + 0.6, w * 0.7, 2.4), [], 0.05, X(s, XW)), { mat: 'glass', tint: (tint + k) % 3 })); }
        if (!r.sides[s].open.has(b)) add(r.pid('GLW', s, b), 'glass panel', 'Stained glass', r.F.along(lancet(zc, 4, Math.min(4.2, 2 * hw - 1.4), 8.5), [], 0.05, X(s, sec.outer(r.sides[s].aisles))), { mat: 'glass', tint: (tint + 1) % 3 });
        if (r.sides[s].chapels.has(b) && r.mode(s, b) === 'buttress' && r.mode(s, b + 1) === 'buttress' && !r.sides[s].open.has(b)) add(r.pid('GLH', s, b), 'glass panel', 'Stained glass', r.F.along(CHWIN(zc, Math.min(3.2, 2 * hw - 1.6)), [], 0.05, X(s, sec.xbO(r.sides[s].aisles) + 0.45)), { mat: 'glass', tint: (tint + 2) % 3 }); });
    },
    pave() {
      for (const r of runs) for (let b = 0; b < r.nb; b++) { const za = r.lines[b], zb = r.lines[b + 1];
        add(`${r.T}PV${b}`, 'paving slab', `${r.name}, paving, bay ${b + 1}`, r.F.box(XI, -XI, 0, 0.08, za, zb), { mat: 'pave' });
        for (const s of SIDES) add(r.pid('PVA', s, b), 'paving slab', N(r, s, `Aisle paving, bay ${b + 1}`), r.F.box(...lr(s, sec.outer(r.sides[s].aisles) + aw / 2, XO), 0, 0.08, za, zb), { mat: 'pave' }); }
    },
    forceLines() {
      const out = [], tp = Solver.thrustPoints(ARCH, sec.SOL.state);
      for (const r of runs) r.lines.forEach((z, i) => {
        const both = SIDES.every(s => r.mode(s, i) === 'buttress');
        if (!both) return;
        const lines = [{ pts: [...tp.slice().reverse(), ...tp.slice(1).map(([x, y]) => [-x, y])].map(([x, y]) => r.F.P(x, y + H0, z)), r: 0.16 }], bases = [];
        for (const s of SIDES) { const SUP = sec.supports(r.sides[s].aisles), w = (x, y) => r.F.P(X(s, x), y, z);
          lines.push({ pts: SUP.wall.line.filter(p => isFinite(p[0])).map(([x, y]) => w(x, y)), r: 0.13 });
          lines.push({ pts: [w(XO, SUP.flyer.yA), w(SUP.flyer.xbI, SUP.flyer.yB)], r: 0.15 });
          lines.push({ pts: SUP.buttress.line.filter(p => isFinite(p[0])).map(([x, y]) => w(x, y)), r: 0.13 });
          for (const c of [SUP.wall, SUP.buttress]) bases.push(w(c.x0, 0.2)); }
        out.push({ z: r.F.P(0, 0, z).z, end: false, at: r.F.P(0, 20, z), normal: r.F.normal, radial: r.F.normal.x !== 0, lines, bases });
      });
      return out;
    },
  };
}
