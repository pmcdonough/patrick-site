// Gothic: a cathedral built from a description. aisled() takes the numbers for a stretch of bays (a nave, a choir, the
// arms of a transept) and builds it on the kit in the masons' order: footings, piers, arcades on centering, aisles,
// upper walls, buttresses and flying buttresses, a four-part vault on centering, roofs. Each stretch is drawn in its own
// frame (local x across, local z along, y up), so the same code builds a vessel running in any direction, and where two
// stretches meet (a crossing, an aisle that runs on into a transept) they share piers by name.
//
// This is the engine for building your own cathedral: a design is a description, and the solver checks it as it goes up.
// Units: metres, kN. Nothing here touches the page.
import * as THREE from './vendor/three.module.js?v=0.14';
import * as Solver from './solver.js?v=0.14';
import { V3, GAMMA, OAK, LEAD, boxG, cylG, extr, extrVol, lancet, rect, circle, ruled, archShapes } from './kit.js?v=0.14';

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
// Optional: shape ('pointed', the default, or 'round'), tiers of flyers (0, 1 or 2; default 1), the piers' drums (piers,
// aislePiers: { drums: joint heights from 1.2 m up to the capital }, default evenly spaced) and the storm's wind pressure
// (windQ, kN/m2, default 1).
export function section(o) {
  const ARCH = Solver.build({ shape: o.shape || 'pointed', span: o.span, thick: o.thick, count: 11 }), SOL = Solver.solve(ARCH);
  const XI = ARCH.joints[0].A[0], XO = XI - o.wall, XW = (XI + XO) / 2, XA1 = XW - o.aisle, XA2 = XA1 - o.aisle;
  const tiers = o.tiers ?? 1, corn = o.levels.cornice, even = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => +(a + (b - a) * i / n).toFixed(2));
  const r = Math.max(0.8, 0.55 * o.wall);
  const sec = { ...o, tiers, ARCH, SOL, XI, XO, XW, XA1, XA2, crown: o.springing + ARCH.rise + o.thick / 2,
    PIER: { drums: o.piers?.drums || even(1.2, o.levels.arcade - 1, 4), r, ab: r + 0.2 },
    APIER: { drums: o.aislePiers?.drums || even(1.2, o.aisleSpring - 0.6, 3), r: 0.55, ab: 0.65 } };
  // the roof: tie beams on the cornice, rafters at 55 degrees
  sec.RX = -XO + 0.4; sec.RY = corn + 0.4; sec.RIDGE = sec.RY + sec.RX * 1.43;
  // the upper flyer meets the wall 7 m above the springing, or lower when the wall stops sooner
  sec.yU = Math.min(o.springing + 7, (o.springing + corn) / 2 + 0.4 * (corn - (o.springing + corn) / 2));
  // a storm: the wind presses on the clerestory and the roof, everything above the aisle roofs, and the roof passes it on
  // to the leeward side; F per metre of the church, at the middle of that band
  sec.storm = { F: (o.windQ ?? 1) * (sec.RIDGE - o.aisleRoofTop), y: (sec.RIDGE + o.aisleRoofTop) / 2 };
  sec.outer = n => n === 1 ? XA1 : XA2;                       // the outer wall's centre line, with one aisle or two
  sec.xbI = n => sec.outer(n) - o.aisleWall / 2;            // the buttresses' inner face, against the outer wall
  sec.xbO = n => sec.xbI(n) - o.bdepth;
  sec.upperTier = n => tiers === 2 && n === 1;
  // the checks at one side's bay line: in calm air, or (storm) on the leeward side in a storm
  sec.supports = (n, storm = false) => Solver.supports(ARCH, SOL.state, { height: o.springing, width: o.wall, flyer: tiers > 0, bdepth: o.bdepth, pinnacle: true, gap: XO - sec.xbI(n), bheight: o.flyerLow,
    ...(storm ? { wind: sec.storm, upper: sec.upperTier(n) ? { yA: sec.yU, yB: o.flyerHigh } : null, btop: sec.upperTier(n) ? o.flyerHigh : undefined } : {}) });
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
  const T = text, step = (title, note, opts) => K.step(title, note, opts), tiers = sec.tiers;
  // T.after(key), if given, runs at the end of each step's work, so a caller can add its own pieces to that step (a
  // crossing's centering, ribs and webs go up with the vaults around it, and come down at the same strike)
  let lastKey = null;
  const stepT = (key, opts) => { if (lastKey && T.after) T.after(lastKey); lastKey = key; if (T.bag) T.bag(key); return step(T[key][0], T[key][1], opts); };
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
  const { PIER, APIER } = sec, PD = PIER.drums, AD = APIER.drums, sq = (PIER.r / 0.8) ** 2;
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
      add(r.mp('B', s, i), 'pier base', N(r, s, `Base, pier ${i + 1}`), F.cyl(PIER.r + 0.35, PIER.r + 0.25, 0.6, 1.2, X(s, XW), z, 8), { w: Math.PI * 1.2 * 0.6 * GAMMA * sq, bear: Math.PI * 1.2 * sq, sup: [[r.mp('F', s, i), 1]] });
      PD.slice(0, -1).forEach((y0, c) => { const y1 = PD[c + 1];
        add(r.mp('D', s, i, c), 'drum', N(r, s, `Drum ${c + 1}, pier ${i + 1}`), F.cyl(PIER.r, PIER.r, y0, y1, X(s, XW), z, 40), { w: Math.PI * PIER.r ** 2 * (y1 - y0) * GAMMA, bear: Math.PI * PIER.r ** 2, sup: [[c ? r.mp('D', s, i, c - 1) : r.mp('B', s, i), 1]] }); });
      add(r.mp('C', s, i), 'capital', N(r, s, `Capital, pier ${i + 1}`), F.cyl(PIER.r, PIER.r + 0.32, PD.at(-1), LV.arcade - 0.4, X(s, XW), z, 40), { w: Math.PI * 0.9 * (LV.arcade - 0.4 - PD.at(-1)) * GAMMA * sq, bear: Math.PI * PIER.r ** 2, sup: [[r.mp('D', s, i, PD.length - 2), 1]] });
      add(r.mp('AB', s, i), 'abacus block', N(r, s, `Abacus, pier ${i + 1}`), F.box(X(s, XW) - PIER.ab, X(s, XW) + PIER.ab, LV.arcade - 0.4, LV.arcade, z - PIER.ab, z + PIER.ab), { w: 4 * PIER.ab ** 2 * 0.4 * GAMMA, bear: 4 * PIER.ab ** 2, sup: [[r.mp('C', s, i), 1]] });
    }
    if (ownAisle(r, s, i)) {
      add(r.ap('B', s, i), 'pier base', N(r, s, `Base, aisle pier ${i + 1}`), F.cyl(0.8, 0.74, 0.6, 1.2, X(s, XA1), z, 8), { w: Math.PI * 0.6 * 0.6 * GAMMA, bear: Math.PI * 0.55, sup: [[r.ap('F', s, i), 1]] });
      AD.slice(0, -1).forEach((y0, c) => { const y1 = AD[c + 1];
        add(r.ap('D', s, i, c), 'drum', N(r, s, `Drum ${c + 1}, aisle pier ${i + 1}`), F.cyl(APIER.r, APIER.r, y0, y1, X(s, XA1), z, 32), { w: Math.PI * APIER.r ** 2 * (y1 - y0) * GAMMA, bear: Math.PI * APIER.r ** 2, sup: [[c ? r.ap('D', s, i, c - 1) : r.ap('B', s, i), 1]] }); });
      add(r.ap('C', s, i), 'capital', N(r, s, `Capital, aisle pier ${i + 1}`), F.cyl(APIER.r, 0.76, AD.at(-1), sec.aisleSpring - 0.2, X(s, XA1), z, 32), { w: Math.PI * 0.45 * (sec.aisleSpring - 0.2 - AD.at(-1)) * GAMMA, bear: Math.PI * APIER.r ** 2, sup: [[r.ap('D', s, i, AD.length - 2), 1]] });
      add(r.ap('AB', s, i), 'abacus block', N(r, s, `Abacus, aisle pier ${i + 1}`), F.box(X(s, XA1) - APIER.ab, X(s, XA1) + APIER.ab, sec.aisleSpring - 0.2, sec.aisleSpring, z - APIER.ab, z + APIER.ab), { w: 1.69 * 0.2 * GAMMA, bear: 1.69, sup: [[r.ap('C', s, i), 1]] });
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
  // the triforium's arches and the clerestory's windows fill their bands (shorter in a low church)
  const triH = w => Math.max(0.3, Math.min(2.4, H0 - LV.triforium - 1.2 - w * 0.7 * 0.866)), clH = cw => Math.max(0.3, corn - H0 - 2.2 - cw * 0.866);
  const spandrel = (L, zc) => { const B = arcadeOf(L), hw = L / 2 - 0.75, ext = B.extrados.map(([x, y]) => [x + zc, y + LV.arcade]).filter(([x]) => x >= zc - hw);
    return [[zc - hw, ext[0][1]], ...ext, ...ext.slice().reverse().map(([x, y]) => [2 * zc - x, y]), [zc + hw, ext[0][1]], [zc + hw, LV.triforium], [zc - hw, LV.triforium]]; };
  stepT('upperWalls');
  eachLine((r, s, i, z) => { LVU.slice(0, -1).forEach((y0, c) => { const y1 = LVU[c + 1];
    add(r.mp('P', s, i, c), 'wall-pier stone', N(r, s, `Wall pier ${i + 1}, course ${c + 1}`), r.F.box(X(s, XW) - WT / 2, X(s, XW) + WT / 2, y0, y1, z - 0.75, z + 0.75), { w: WT * 1.5 * (y1 - y0) * GAMMA, bear: WT * 1.5, sup: [[c ? r.mp('P', s, i, c - 1) : r.mp('AB', s, i), 1]] }); });
    [-0.4, 0, 0.4].forEach((dz, k) => add(r.pid('SH', s, i, k), 'shaft', N(r, s, `Vaulting shaft ${i + 1}`), r.F.cyl(0.16, 0.16, LV.arcade, H0, X(s, XI + 0.17), z + dz, 16), { w: Math.PI * 0.026 * (H0 - LV.arcade) * GAMMA, bear: 0.08, sup: [[r.mp('AB', s, i), 1]] })); }, (r, s, i) => ownMain(r, s, i));
  eachBay((r, s, b, zc, L) => { const hw = L / 2 - 0.75, ps = c => [[r.mp('P', s, b, c), 0.5], [r.mp('P', s, b + 1, c), 0.5]];
    const sp = spandrel(L, zc); add(r.pid('S', s, b), 'spandrel', N(r, s, `Spandrel, bay ${b + 1}`), r.F.along(sp, [], WT, X(s, XW)), { w: extrVol(sp, [], WT) * GAMMA, bear: 2 * hw * WT, sup: [[r.pid('A', s, b) + '-K', 1]] });
    const w = (2 * hw - 1.2) / 4, tri = [0, 1, 2, 3].map(k => lancet(zc - hw + 0.6 + w * (k + 0.5), LV.triforium + 0.6, w * 0.7, triH(w))), tp = rect(zc - hw, zc + hw, LV.triforium, H0);
    add(r.pid('TF', s, b), 'wall stone', N(r, s, `Triforium, bay ${b + 1}`), r.F.along(tp, tri, WT, X(s, XW)), { w: extrVol(tp, tri, WT) * GAMMA, bear: 2 * hw * WT * 0.7, sup: ps(1) });
    const cw = Math.min(5.2, 2 * hw * 0.78), cl = lancet(zc, H0 + 1, cw, clH(cw)), cp = rect(zc - hw, zc + hw, H0, corn);
    add(r.pid('CL', s, b), 'wall stone', N(r, s, `Clerestory, bay ${b + 1}`), r.F.along(cp, [cl], WT, X(s, XW)), { w: extrVol(cp, [cl], WT) * GAMMA, bear: 2 * hw * WT * 0.5, sup: ps(2) });
    add(r.pid('CO', s, b), 'cornice stone', N(r, s, `Cornice, bay ${b + 1}`), r.F.box(...lr(s, XO - 0.35, XI + 0.05), corn, corn + 0.4, zc - L / 2, zc + L / 2), { w: (WT + 0.4) * L * 0.4 * GAMMA, bear: (WT + 0.4) * L, sup: [[r.pid('CL', s, b), 1]] }); });

  // buttresses rise, then flyers: one flight over one aisle, two flights over two (with a pier between them), and over a
  // single aisle a second, upper tier that braces the top of the wall and the roof against the wind
  const low = sec.flyerLow, high = sec.flyerHigh, yA = H0 - 1, yU = sec.yU;
  const flightY = (n, x) => yA + (low - yA) * (x - XO) / (sec.xbI(n) - XO);
  if (tiers) stepT('buttresses');
  // with no flyers the buttresses stop at the aisle walls' top
  const bTop = n => !tiers ? wallTop : sec.upperTier(n) ? high : low, bLast = n => !tiers ? 1 : sec.upperTier(n) ? 3 : 2;
  eachLine((r, s, i, z) => { const n = r.sides[s].aisles, top = bTop(n);
    if (tiers) [[wallTop, low], ...(top > low ? [[low, high]] : [])].forEach(([y0, y1], k) => { const c = k + 2;
      add(r.pid('BU', s, i, c), 'buttress stone', N(r, s, `Buttress ${i + 1}, course ${c + 1}`), r.F.box(...lr(s, sec.xbO(n), sec.xbI(n)), y0, y1, z - 0.75, z + 0.75), { w: sec.bdepth * 1.5 * (y1 - y0) * GAMMA, bear: sec.bdepth * 1.5, sup: [[r.pid('BU', s, i, c - 1), 1]] }); });
    if (n === 2 && tiers) { const ym = flightY(2, XA1);
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
    return [[XO, xb, yA, low, [[r.pid('BU', s, i, 2), 1]], [[r.mp('P', s, i, 1), 1]], 7, 0.5, 0.7, 'L'], ...(sec.upperTier(1) ? [[XO, xb, yU, high, [[r.pid('BU', s, i, 3), 1]], [[r.mp('P', s, i, 3), 1]], 7, 0.4, 0.55, 'U']] : [])]; };
  if (tiers) {
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
  }
  const pinnacle = (id, nm, p, y0, sup) => { add(`${id}-0`, 'pinnacle stone', `${nm}, shaft`, boxG(p.x - 0.8, p.x + 0.8, y0, y0 + 3.2, p.z - 0.8, p.z + 0.8), { w: 1.6 * 1.6 * 3.2 * GAMMA, bear: 2.56, sup });
    const sp = new THREE.ConeGeometry(0.85, 7.5, 4); sp.rotateY(Math.PI / 4); sp.translate(p.x, y0 + 3.2 + 3.75, p.z); add(`${id}-1`, 'spire stone', `${nm}, spire`, sp, { w: 0.85 * 0.85 * 2 * 7.5 / 3 * GAMMA, bear: 1.4, sup: [[`${id}-0`, 1]] });
    const fin = new THREE.SphereGeometry(0.22, 16, 12); fin.translate(p.x, y0 + 10.9, p.z); add(`${id}-2`, 'finial', `${nm}, finial`, fin, { w: 1, sup: [[`${id}-1`, 1]] }); };
  stepT('pinnacles');
  eachLine((r, s, i, z) => { const n = r.sides[s].aisles;
    pinnacle(r.pid('PN', s, i), N(r, s, `Pinnacle ${i + 1}`), r.F.P(X(s, (sec.xbO(n) + sec.xbI(n)) / 2), 0, z), bTop(n), [[r.pid('BU', s, i, bLast(n)), 1]]);
    if (n === 2 && tiers) pinnacle(r.pid('PI', s, i), N(r, s, `Flyer pier pinnacle ${i + 1}`), r.F.P(X(s, XA1), 0, z), flightY(2, XA1) - 0.2, [[r.pid('BI', s, i), 1]]); },
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
  if (T.afterStrike) T.afterStrike();

  // roofs: an oak frame and lead over the main vessel, and lean-to roofs over the aisles under the flyers (left out when
  // the building stops at the strike: a vault that falls never gets its roof)
  const { RX, RY, RIDGE } = sec;
  if (!T.noRoofs) stepT('roofs');
  if (!T.noRoofs) for (const r of runs) {
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

  if (lastKey && T.after) T.after(lastKey);

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
        const cw = Math.min(5.2, 2 * hw * 0.78), cl = lancet(zc, H0 + 1, cw, clH(cw));
        add(r.pid('GLC', s, b), 'glass panel', 'Stained glass', r.F.along(cl, [], 0.05, X(s, XW)), { mat: 'glass', tint });
        if (r.glazedTriforium) { const w = (2 * hw - 1.2) / 4; [0, 1, 2, 3].forEach(k => add(r.pid('GLT', s, b, k), 'glass panel', 'Stained glass', r.F.along(lancet(zc - hw + 0.6 + w * (k + 0.5), LV.triforium + 0.6, w * 0.7, triH(w)), [], 0.05, X(s, XW)), { mat: 'glass', tint: (tint + k) % 3 })); }
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
          if (SUP.flyer) { lines.push({ pts: [w(XO, SUP.flyer.yA), w(SUP.flyer.xbI, SUP.flyer.yB)], r: 0.15 });
            lines.push({ pts: SUP.buttress.line.filter(p => isFinite(p[0])).map(([x, y]) => w(x, y)), r: 0.13 }); }
          for (const c of [SUP.wall, SUP.buttress]) if (c && isFinite(c.x0)) bases.push(w(c.x0, 0.2)); }
        out.push({ z: r.F.P(0, 0, z).z, end: false, at: r.F.P(0, 20, z), normal: r.F.normal, radial: r.F.normal.x !== 0, lines, bases });
      });
      return out;
    },
  };
}

// ---------- The ends ----------
// A flat end wall across a stretch at one of its end lines (i), on the side away from the bays (out = +1 or -1 in local
// z): the outline of the vessel and its aisles, with a gable up to the ridge. A west end has a portal into the vessel
// and one into each aisle and a rose; an east end three tall lancets and a rose. Towers, if any, stand on the aisle ends,
// square, with a belfry and (spires) a stone spire. text: { lower, rose, gable, towers, spires } as [title, note]; each
// is a step. Returns the end's z (local), and glaze() for its windows.
const clipBand = (poly, y0, y1) => {
  const cut = (P, keep, yc) => { const out = []; P.forEach((a, k) => { const b = P[(k + 1) % P.length], ia = keep(a[1]), ib = keep(b[1]);
    if (ia) out.push(a); if (ia !== ib) out.push([a[0] + (b[0] - a[0]) * (yc - a[1]) / (b[1] - a[1]), yc]); }); return out; };
  return cut(cut(poly, y => y >= y0, y0), y => y <= y1, y1);
};
export function front(K, sec, r, { i, out, west, towers = false, spires = false, text, id }) {
  const { add } = K, F = r.F, n = r.sides[-1].aisles, aw = sec.aisleWall, LV = sec.levels, corn = LV.cornice, H0 = sec.springing;
  const xm = -sec.XO, W = -(sec.outer(n) - aw / 2), T = west ? 2 : 1.6, z0 = r.lines[i] + out * 0.75, zc = z0 + out * T / 2;
  const RY = sec.RY, RIDGE = sec.RIDGE, top = sec.aisleTop + 0.5, lean = sec.aisleRoofTop + 0.5, nm = west ? 'West front' : 'East end';
  // the rose fills the clerestory's height across the vessel
  const rr = Math.max(1.6, Math.min(xm - 1.4, (corn - LV.triforium) / 2 - 0.4)), yr = corn - rr - 0.9;
  const pw = Math.min(0.42 * 2 * xm, 7), ph = Math.min(0.3 * H0, yr - rr - 2.5 - pw * 0.866), pTop = 0.6 + ph + pw * 0.866;
  const xa = (xm + W) / 2, aw2 = Math.min(4.2, (W - xm) * 0.5), aph = Math.min(ph * 0.75, top - 2.2 - aw2 * 0.866);
  const main = [[-xm, 0.6], [xm, 0.6], [xm, RY], [0, RIDGE + 0.6], [-xm, RY]];
  const whole = towers ? main : [[-W, 0.6], [W, 0.6], [W, top], [xm, lean], [xm, RY], [0, RIDGE + 0.6], [-xm, RY], [-xm, lean], [-W, top]];
  const lanc = west ? [] : [-1, 0, 1].map(k => { const w = Math.min(2.4, xm * 0.32), y0 = LV.arcade * 0.45; return lancet(k * w * 1.35, y0, w, Math.max(0.5, yr - rr - 1.6 - y0 - w * 0.866 - (k ? 1.5 : 0))); });
  const sideDoors = !towers ? SIDES.map(s => west ? lancet(s * xa, 0.6, aw2, aph) : lancet(s * xa, 3.5, Math.min(2.6, aw2), Math.max(0.5, top - 5.5 - Math.min(2.6, aw2) * 0.866))) : [];
  const holes1 = [...(west ? [lancet(0, 0.6, pw, ph)] : lanc), ...sideDoors];
  // three courses and the gable: the first holds the doors (or the lancets), the second rises to the rose, the third holds it
  const B1 = Math.max(pTop + 0.8, west ? 0 : yr - rr - 0.7), B2 = Math.max(B1 + 0.01, yr - rr - 0.7);
  const used1 = holes1.filter(h => Math.max(...h.map(p => p[1])) < B1);
  const courses = [[0.6, B1, used1], [B1, B2, []], [B2, RY, [circle(0, yr, rr, 72)]], [RY, RIDGE + 0.6, [circle(0, RY + (RIDGE - RY) * 0.3, Math.min(1.2, (RIDGE - RY) * 0.15), 32)]]].filter(([a, b]) => b - a > 0.05);
  const pid = k => `${id}-${k}`;
  K.step(...text.lower);
  add(pid('F'), 'footing', `${nm}, footing`, F.box(-W - 1, W + 1, 0, 0.6, z0 - out * 0.2, z0 + out * (T + (towers ? W - xm : 0) + 0.4)), { w: 2 * W * T * 0.6 * GAMMA, bear: 2 * W * T });
  let prev = pid('F'), k = 0;
  const course = ([y0, y1, holes], nmk) => { const pts = clipBand(whole, y0, y1); if (pts.length < 3) return;
    add(pid('W' + k), 'wall stone', `${nm}, ${nmk}`, F.across(pts, holes, T, zc), { w: extrVol(pts, holes, T) * GAMMA, bear: (pts.reduce((m, p) => Math.max(m, p[0]), 0) * 2) * T * 0.7, sup: [[prev, 1]] }); prev = pid('W' + k); k++; };
  course(courses[0], west ? 'portal level' : 'lower wall');
  if (courses.length > 3) course(courses[1], 'middle wall');
  // towers: square on the aisle ends, as deep as they are wide; a door through the lower stage, a belfry at the top
  const tw = W - xm, tz0 = z0, tz1 = z0 + out * tw, tzc = (tz0 + tz1) / 2, tTop = RIDGE + 10, tStages = [0.6, corn * 0.5, RY, tTop];
  const tx = s => [Math.min(X(s, -W), X(s, -xm)), Math.max(X(s, -W), X(s, -xm))];
  if (towers) for (const s of SIDES) { const [a, b] = tx(s), cx = (a + b) / 2;
    tStages.slice(0, 2).forEach((y0, j) => { const y1 = tStages[j + 1], pts = rect(a, b, y0, y1), holes = j === 0 && west ? [lancet(cx, 0.6, Math.min(4, tw * 0.45), Math.min(aph + 1, y1 - 3 - tw * 0.4))] : [];
      add(pid(`T${s < 0 ? 'A' : 'B'}${j}`), 'tower stone', `${nm}, ${s < 0 ? 'left' : 'right'} tower, stage ${j + 1}`, F.across(pts, holes, tw, tzc), { w: extrVol(pts, holes, tw) * GAMMA * 0.5, bear: tw * tw * 0.5, sup: [[j ? pid(`T${s < 0 ? 'A' : 'B'}${j - 1}`) : pid('F'), 1]] }); }); }
  K.step(...text.rose);
  course(courses.length > 3 ? courses[2] : courses[1], 'rose level');
  const ring = (r0, r1, key, sup) => add(pid(key), 'rose tracery', `${nm}, rose`, F.across(circle(0, yr, r1, 72), [circle(0, yr, r0, 72)], 0.4, zc + out * (T / 2 - 0.25)), { w: Math.PI * (r1 * r1 - r0 * r0) * 0.4 * GAMMA, bear: 0.4 * (r1 - r0), sup: [[sup, 1]] });
  ring(rr - 0.4, rr, 'RO', prev); ring(rr * 0.3, rr * 0.3 + 0.3, 'RI', pid('RO'));
  for (let j = 0; j < 12; j++) { const a = Math.PI * 2 * j / 12, g = new THREE.BoxGeometry(rr * 0.7 - 0.5, 0.16, 0.3);
    g.translate((rr * 0.3 + 0.3 + rr - 0.4) / 2, 0, 0); g.rotateZ(a); const o = F.P(0, yr, zc + out * (T / 2 - 0.25)); g.rotateY(Math.atan2(F.u[1], F.u[0]) * -1); g.translate(o.x, o.y, o.z);
    add(pid(`RS${j}`), 'rose tracery', `${nm}, rose`, g, { w: (rr * 0.7) * 0.05 * GAMMA, sup: [[pid('RO'), 1]] }); }
  K.step(...text.gable);
  course(courses.at(-1), 'gable');
  const apex = F.P(0, RIDGE + 0.6, zc), cross = new THREE.ConeGeometry(0.5, 2.4, 4); cross.rotateY(Math.PI / 4); cross.translate(apex.x, apex.y + 1.2, apex.z);
  add(pid('GP'), 'pinnacle stone', `${nm}, gable pinnacle`, cross, { w: 0.6 * GAMMA, bear: 0.3, sup: [[prev, 1]] });
  if (towers) {
    K.step(...text.towers);
    // the belfry: four walls 1.2 m thick, each with two tall openings, and a cap the spire stands on
    for (const s of SIDES) { const [a, b] = tx(s), cx = (a + b) / 2, y0 = tStages[2], y1 = tStages[3], bw = Math.min(1.8, tw * 0.22), t = 1.2, S = s < 0 ? 'A' : 'B';
      const open = c => [c - tw * 0.2, c + tw * 0.2].map(x => lancet(x, y0 + 2, bw, Math.max(1, y1 - y0 - 4 - bw * 0.866)));
      const faces = [['front', F.across(rect(a, b, y0, y1), open(cx), t, tz1 - out * t / 2)], ['back', F.across(rect(a, b, y0, y1), open(cx), t, tz0 + out * t / 2)],
        ...[a + t / 2, b - t / 2].map((x, k) => [k ? 'right side' : 'left side', F.along(rect(Math.min(tz0, tz1) + t, Math.max(tz0, tz1) - t, y0, y1), open(tzc), t, x)])];
      const wv = (extrVol(rect(a, b, y0, y1), open(cx), t) * 2 + extrVol(rect(0, tw - 2 * t, y0, y1), open((tw - 2 * t) / 2), t) * 2) * GAMMA;
      faces.forEach(([side, g], k) => add(pid(`T${S}2${k}`), 'tower stone', `${nm}, ${s < 0 ? 'left' : 'right'} tower, belfry, ${side}`, g, { w: wv / 4, bear: tw * t, sup: [[pid(`T${S}1`), 1]] }));
      add(pid(`T${S}2`), 'tower stone', `${nm}, ${s < 0 ? 'left' : 'right'} tower, top`, F.box(a, b, y1, y1 + 0.8, tz0, tz1), { w: tw * tw * 0.8 * GAMMA, bear: tw * tw, sup: [0, 1, 2, 3].map(k => [pid(`T${S}2${k}`), 0.25]) }); }
    if (spires) { K.step(...text.spires);
      for (const s of SIDES) { const [a, b] = tx(s), c = F.P((a + b) / 2, 0, tzc), rad = tw * 0.46, h = tTop * 0.75, g = new THREE.ConeGeometry(rad, h, 8); g.rotateY(Math.PI / 8); g.translate(c.x, tTop + 0.8 + h / 2, c.z);
        add(pid(`SP${s < 0 ? 'A' : 'B'}`), 'spire stone', `${nm}, ${s < 0 ? 'left' : 'right'} spire`, g, { w: Math.PI * rad * Math.hypot(rad, h) * 0.4 * GAMMA, bear: tw * tw * 0.3, sup: [[pid(`T${s < 0 ? 'A' : 'B'}2`), 1]] }); } }
  }
  return {
    z: z0 + out * T, towerTop: towers ? tTop + (spires ? tTop * 0.75 : 0) : 0,
    glaze() {
      const zg = zc + out * (T / 2 - 0.45);
      add(pid('GR'), 'glass panel', 'Stained glass', F.across(circle(0, yr, rr - 0.3, 72), [], 0.05, zg), { mat: 'glass', tint: 0 });
      (west ? [] : used1).forEach((h, j) => add(pid(`GL${j}`), 'glass panel', 'Stained glass', F.across(h, [], 0.05, zg), { mat: 'glass', tint: (j + 1) % 3 }));
      if (west) add(pid('DR'), 'door', `${nm}, doors`, F.across(lancet(0, 0.6, pw, ph), [], 0.15, z0 + out * T * 0.5), { mat: 'oak' });
    },
  };
}

// ---------- The crossing ----------
// Where a nave (west), a choir (east) and two transept arms meet, all on the same section, in frames sharing the origin:
// their first transverse ribs are the crossing's four arches, the nave and the choir own the four crossing piers, and the
// crossing adds a four-part vault on diagonals between them. Call centering(), ribs() and webs() from the matching steps
// (aisled()'s after hook), so the crossing is struck with the rest. roof() covers the square where the roofs meet.
export function crossing(K, sec, { nave, choir, armN, armS, id = 'X' }) {
  const { add, placeArch, placeCentering } = K, { ARCH, springing: H0 } = sec, F = nave.F, c = -sec.XW, L = 2 * c;
  const D = Math.hypot(sec.span, L), Q1 = [sec.span / D, L / D], Q2 = [sec.span / D, -L / D];
  const P3 = (r, s) => [[r.mp('P', s, 0, 1), 1]];
  const diag = (q, pre, fn) => { const d = F.dir(q[0], q[1]), o = F.P(0, 0, 0); fn(pre, ARCH, { sx: D / sec.span, y0: H0, ox: o.x, oz: o.z, dx: d.x, dz: d.z }); };
  const rp = pre => K.pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
  return {
    centering() { diag(Q1, `${id}DCa`, placeCentering); diag(Q2, `${id}DCb`, placeCentering); },
    ribs() {
      // line 0 of the choir is the east side (z = -c), line 0 of the nave the west (z = +c)
      diag(Q1, `${id}DA`, (pre, B, o) => placeArch(pre, B, { ...o, depth: 0.6, withKey: false, name: 'Crossing, diagonal rib', springL: P3(choir, -1), springR: P3(nave, 1) }));
      diag(Q2, `${id}DB`, (pre, B, o) => placeArch(pre, B, { ...o, depth: 0.6, withKey: false, name: 'Crossing, diagonal rib', springL: P3(nave, -1), springR: P3(choir, 1) }));
      const k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0, o = F.P(0, 0, 0);
      add(`${id}BOSS`, 'boss', 'Crossing, boss', cylG(0.7, 0.7, top - 1.2, top + 0.05, o.x, o.z, 32), { w: Math.PI * 0.49 * 1.25 * GAMMA, sup: [`${id}DA`, `${id}DB`].flatMap(r => [[`${r}-L${k}`, 0.25], [`${r}-R${k}`, 0.25]]) });
    },
    webs() {
      const half = (sx, cu, cv, du, dv, h) => { const t = ribTop(ARCH, sx, H0); return q => { const [x, y] = t(q), u = h < 0 ? x : -x; return F.P(cu + du * u, y, cv + dv * u); }; };
      const Tz = (z, h) => half(1, 0, z, 1, 0, h), G = (d, h) => half(D / sec.span, 0, 0, d[0], d[1], h), Wx = (x, h) => half(1, x, 0, 0, 1, h);
      const cells = [[Tz(-c, -1), G(Q1, -1), `${choir.T}TR0`, `${id}DA`], [Tz(-c, 1), G(Q2, 1), `${choir.T}TR0`, `${id}DB`], [Tz(c, -1), G(Q2, -1), `${nave.T}TR0`, `${id}DB`], [Tz(c, 1), G(Q1, 1), `${nave.T}TR0`, `${id}DA`],
        [Wx(-c, -1), G(Q1, -1), `${armN.T}TR0`, `${id}DA`], [Wx(-c, 1), G(Q2, -1), `${armN.T}TR0`, `${id}DB`], [Wx(c, -1), G(Q2, 1), `${armS.T}TR0`, `${id}DB`], [Wx(c, 1), G(Q1, 1), `${armS.T}TR0`, `${id}DA`]];
      [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], j) => cells.forEach(([A, B, r1, r2], i) => { const g = ruled(A, B, q0, q1, 6, 12), a = rp(r1), b = rp(r2);
        add(`${id}WEB${i}-${j}`, 'web panel', 'Crossing, vault web', g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(x => [x, 0.5 / a.length]), ...b.map(x => [x, 0.5 / b.length])] }); }));
    },
    // the roofs of the four arms meet over the square in a groin: each quarter is two triangles down from the ridges
    roof() {
      const k = (sec.RIDGE - sec.RY) / sec.RX, Y = sec.RIDGE + 0.42, sup = [nave, choir].flatMap(r => SIDES.map(s => [r.mp('P', s, 0, 3), 0.25]));
      const tri = (a, b, cc) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, cc].flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return g; };
      let j = 0;
      for (const sx of SIDES) for (const sz of SIDES) { const C = F.P(0, Y, 0), Q = F.P(sx * c, Y - k * c, sz * c);
        add(`${id}LD${j++}`, 'lead sheet', 'Crossing roof', tri(C, F.P(0, Y, sz * c), Q), { mat: 'lead', w: c * c * 0.6 * 0.004 * LEAD, sup, group: 'roof' });
        add(`${id}LD${j++}`, 'lead sheet', 'Crossing roof', tri(C, F.P(sx * c, Y, 0), Q), { mat: 'lead', w: c * c * 0.6 * 0.004 * LEAD, sup, group: 'roof' }); }
    },
    // a spire of oak and lead over the crossing, on the four crossing piers, as tall again as the ridge
    spire() {
      const o = F.P(0, 0, 0), h = sec.RIDGE, rad = 0.42 * c, y0 = sec.RIDGE - 1, sup = [nave, choir].flatMap(r => SIDES.map(s => [r.mp('P', s, 0, 3), 0.25]));
      const base = new THREE.CylinderGeometry(rad, rad, 6, 8); base.rotateY(Math.PI / 8); base.translate(o.x, y0 + 3, o.z);
      add(`${id}SP0`, 'spire timber', 'Crossing spire, base', base, { mat: 'lead', w: Math.PI * 2 * rad * 6 * (0.004 * LEAD + 0.06 * OAK), bear: 4 * rad * rad, sup });
      const cone = new THREE.ConeGeometry(rad, h, 8); cone.rotateY(Math.PI / 8); cone.translate(o.x, y0 + 6 + h / 2, o.z);
      add(`${id}SP1`, 'spire timber', 'Crossing spire', cone, { mat: 'lead', w: Math.PI * rad * Math.hypot(rad, h) * (0.004 * LEAD + 0.05 * OAK), bear: 4 * rad * rad, sup: [[`${id}SP0`, 1]] });
      const ball = new THREE.SphereGeometry(0.5, 16, 12); ball.translate(o.x, y0 + 6 + h + 0.3, o.z);
      add(`${id}SP2`, 'finial', 'Crossing spire, cross', ball, { mat: 'gilt', w: 2, sup: [[`${id}SP1`, 1]] });
      return y0 + 6 + h;
    },
  };
}

// ---------- The apse ----------
// A half-polygon of nap sides closing a stretch at its end line i (out: the side away from the bays), on the same section:
// slimmer piers on the half-circle through the stretch's piers, the aisles turning round it as an ambulatory, the outer
// wall (and, with chapels, radiating chapels beyond it), buttresses and flyers on the radial lines, the wall rising to the
// cornice, half-ribs from the wall to the keystone of the stretch's last transverse rib, and a half-cone of lead. Its own
// steps (text: { footings, piers, arches, ambulatory, walls, buttresses, flyers, centering, vault, strike, roofs }).
export function apse(K, sec, r, { i, out, nap = 5, chapels = false, id = 'AP', text }) {
  const { add, removeAt, placeArch, placeCentering } = K, F = r.F, n = r.sides[-1].aisles, tiers = sec.tiers, LV = sec.levels, H0 = sec.springing, corn = LV.cornice, aw = sec.aisleWall, WT = sec.wall;
  const ze = r.lines[i], at = (phi, R, y = 0) => F.P(-R * Math.cos(phi), y, ze + out * R * Math.sin(phi)), C0 = at(0, 0);
  const PHI = [...Array(nap + 1).keys()].map(k => Math.PI * k / nap), MID = PHI.slice(1, -1).map((_, j) => j + 1);
  const R1 = -sec.XW, R2 = -sec.XA1, RO = -sec.XO, RI = -sec.XI, Ro = -sec.outer(n), Rb = -sec.xbI(n), Rbo = Rb + sec.bdepth;
  const radial = phi => at(phi, 1).sub(C0);
  const step = key => K.step(...text[key]);
  // the stretch's own piers at the two ends of the half-circle, the apse's in between
  const pP = (kind, k, c) => k === 0 || k === nap ? r.mp(kind, k === 0 ? -1 : 1, i, c) : `${id}${kind}-${k}${c != null ? '-' + c : ''}`;
  const pA = (kind, k, c) => k === 0 || k === nap ? r.ap(kind, k === 0 ? -1 : 1, i, c) : `${id}M${kind}-${k}${c != null ? '-' + c : ''}`;
  const rbox = (phi, r0, r1, y0, y1, hw) => { const d = radial(phi), g = new THREE.BoxGeometry(r1 - r0, y1 - y0, 2 * hw); g.translate((r0 + r1) / 2, (y0 + y1) / 2, 0); g.rotateY(Math.atan2(-d.z, d.x)); g.translate(C0.x, 0, C0.z); return g; };
  const chord = (k, R) => { const a = at(PHI[k], R), b = at(PHI[k + 1], R), t = b.clone().sub(a), len = t.length(); return { m: a.clone().add(b).multiplyScalar(0.5), t: t.normalize(), len }; };
  const panel = (pid, kind, nm, k, R, y0, y1, depth, holes, trim, sup) => { const { m, t, len } = chord(k, R), pts = rect(-len / 2 + trim, len / 2 - trim, y0, y1);
    return add(pid, kind, nm, extr(pts, holes, depth, m.x, m.z, t.x, t.z), { w: extrVol(pts, holes, depth) * GAMMA, bear: (len - 2 * trim) * depth * 0.8, sup }); };
  const flat = (k, R, y, hw, hh) => { const { m, t, len } = chord(k, R), g = new THREE.BoxGeometry(len, hh, hw); g.rotateY(Math.atan2(-t.z, t.x)); g.translate(m.x, y, m.z); return g; };
  const tri = (a, b, c) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c].flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return g; };
  const quad = (a, b, c, d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return g; };
  const rp = sec.PIER.r * 0.75, PD = sec.PIER.drums, AD = sec.APIER.drums, ar = sec.APIER.r;

  step('footings');
  MID.forEach(k => { const p = PHI[k], a = at(p, R1);
    add(pP('F', k), 'footing', `Footing, apse pier ${k}`, cylG(rp + 0.8, rp + 0.8, 0, 0.6, a.x, a.z, 8), { w: Math.PI * (rp + 0.8) ** 2 * 0.6 * GAMMA, bear: Math.PI * (rp + 0.8) ** 2 });
    if (n === 2) { const b = at(p, R2); add(pA('F', k), 'footing', `Footing, ambulatory pier ${k}`, cylG(1.1, 1.1, 0, 0.6, b.x, b.z, 8), { w: 3.8 * 0.6 * GAMMA, bear: 3.8 }); }
    add(`${id}FB-${k}`, 'footing', `Footing, apse buttress ${k}`, rbox(p, Rb - 0.4, Rbo + 0.4, 0, 0.6, 1.1), { w: (sec.bdepth + 0.8) * 2.2 * 0.6 * GAMMA, bear: (sec.bdepth + 0.8) * 2.2 }); });
  for (let k = 0; k < nap; k++) panel(`${id}FW-${k}`, 'footing', `Footing, apse outer wall ${k + 1}`, k, Ro, 0, 0.6, 1.6, [], 0.9, []);

  step('piers');
  MID.forEach(k => { const p = PHI[k], a = at(p, R1);
    add(pP('B', k), 'pier base', `Base, apse pier ${k}`, cylG(rp + 0.3, rp + 0.2, 0.6, 1.2, a.x, a.z, 8), { w: Math.PI * (rp + 0.25) ** 2 * 0.6 * GAMMA, bear: Math.PI * rp * rp, sup: [[pP('F', k), 1]] });
    PD.slice(0, -1).forEach((y0, c) => add(pP('D', k, c), 'drum', `Drum ${c + 1}, apse pier ${k}`, cylG(rp, rp, y0, PD[c + 1], a.x, a.z, 32), { w: Math.PI * rp * rp * (PD[c + 1] - y0) * GAMMA, bear: Math.PI * rp * rp, sup: [[c ? pP('D', k, c - 1) : pP('B', k), 1]] }));
    add(pP('C', k), 'capital', `Capital, apse pier ${k}`, cylG(rp, rp + 0.25, PD.at(-1), LV.arcade - 0.4, a.x, a.z, 32), { w: Math.PI * rp * rp * (LV.arcade - 0.4 - PD.at(-1)) * GAMMA, bear: Math.PI * rp * rp, sup: [[pP('D', k, PD.length - 2), 1]] });
    add(pP('AB', k), 'abacus block', `Abacus, apse pier ${k}`, rbox(p, R1 - 0.6, R1 + 0.6, LV.arcade - 0.4, LV.arcade, 0.6), { w: 1.44 * 0.4 * GAMMA, bear: 1.44, sup: [[pP('C', k), 1]] });
    if (n === 2) { const b = at(p, R2);
      add(pA('B', k), 'pier base', `Base, ambulatory pier ${k}`, cylG(ar + 0.25, ar + 0.19, 0.6, 1.2, b.x, b.z, 8), { w: 0.68 * 0.6 * GAMMA, bear: Math.PI * ar * ar, sup: [[pA('F', k), 1]] });
      AD.slice(0, -1).forEach((y0, c) => add(pA('D', k, c), 'drum', `Drum ${c + 1}, ambulatory pier ${k}`, cylG(ar, ar, y0, AD[c + 1], b.x, b.z, 32), { w: Math.PI * ar * ar * (AD[c + 1] - y0) * GAMMA, bear: Math.PI * ar * ar, sup: [[c ? pA('D', k, c - 1) : pA('B', k), 1]] }));
      add(pA('C', k), 'capital', `Capital, ambulatory pier ${k}`, cylG(ar, ar + 0.21, AD.at(-1), sec.aisleSpring - 0.2, b.x, b.z, 32), { w: 0.3 * GAMMA, bear: Math.PI * ar * ar, sup: [[pA('D', k, AD.length - 2), 1]] });
      add(pA('AB', k), 'abacus block', `Abacus, ambulatory pier ${k}`, rbox(p, R2 - 0.65, R2 + 0.65, sec.aisleSpring - 0.2, sec.aisleSpring, 0.65), { w: 1.69 * 0.2 * GAMMA, bear: 1.69, sup: [[pA('C', k), 1]] }); } });
  // the outer wall goes up with the piers, and the buttresses' lower courses beside it
  for (let k = 0; k < nap; k++) { const { len } = chord(k, Ro), win = lancet(0, 3, Math.min(3.2, len - 2.4), Math.max(1, sec.aisleTop - 5 - Math.min(3.2, len - 2.4) * 0.866));
    panel(`${id}W-${k}`, 'wall stone', `Apse outer wall ${k + 1}`, k, Ro, 0.6, sec.aisleTop, aw, [win], 0.9, [[`${id}FW-${k}`, 1]]); }
  MID.forEach(k => [[0.6, sec.aisleSpring], [sec.aisleSpring, sec.aisleTop]].forEach(([y0, y1], c) =>
    add(`${id}BU-${k}-${c}`, 'buttress stone', `Apse buttress ${k}, course ${c + 1}`, rbox(PHI[k], Rb, Rbo, y0, y1, 0.75), { w: sec.bdepth * 1.5 * (y1 - y0) * GAMMA, bear: sec.bdepth * 1.5, sup: [[c ? `${id}BU-${k}-0` : `${id}FB-${k}`, 1]] })));

  // arches round the apse (and round the ambulatory with two aisles), on centering, and across the ambulatory
  const ARCA = pointed(Math.max(1, chord(0, R1).len - 1.2), 0.5, 7), ARMA = n === 2 ? pointed(Math.max(1, chord(0, R2).len - 1.3), 0.5, 9) : null;
  const ailIn = R1 + rp, ailOut = n === 2 ? R2 - ar : Ro - aw / 2, AIL = pointed(ailOut - ailIn, 0.5, 7), AIX = (ailIn + ailOut) / 2;
  const aolIn = R2 + ar, aolOut = Ro - aw / 2, AOL = n === 2 ? pointed(aolOut - aolIn, 0.5, 7) : null, AOX = (aolIn + aolOut) / 2;
  step('arches');
  for (let k = 0; k < nap; k++) { const a = chord(k, R1); placeCentering(`${id}AC-${k}`, ARCA, { y0: LV.arcade, ox: a.m.x, oz: a.m.z, dx: a.t.x, dz: a.t.z });
    if (n === 2) { const b = chord(k, R2); placeCentering(`${id}MC-${k}`, ARMA, { y0: sec.aisleSpring, ox: b.m.x, oz: b.m.z, dx: b.t.x, dz: b.t.z }); } }
  const STEP_AC = K.at();
  for (let k = 0; k < nap; k++) { const a = chord(k, R1);
    placeArch(`${id}A-${k}`, ARCA, { y0: LV.arcade, depth: WT, ox: a.m.x, oz: a.m.z, dx: a.t.x, dz: a.t.z, springL: [[pP('AB', k), 1]], springR: [[pP('AB', k + 1), 1]], name: `Apse arch ${k + 1}` });
    if (n === 2) { const b = chord(k, R2); placeArch(`${id}M-${k}`, ARMA, { y0: sec.aisleSpring, depth: 0.8, ox: b.m.x, oz: b.m.z, dx: b.t.x, dz: b.t.z, springL: [[pA('AB', k), 1]], springR: [[pA('AB', k + 1), 1]], name: `Ambulatory arch ${k + 1}` }); } }
  MID.forEach(k => { const d = radial(PHI[k]), a = at(PHI[k], AIX);
    placeArch(`${id}AI-${k}`, AIL, { y0: sec.aisleSpring, depth: 0.5, ox: a.x, oz: a.z, dx: d.x, dz: d.z, springL: [[pP('D', k, 2), 1]], springR: n === 2 ? [[pA('AB', k), 1]] : [[`${id}BU-${k}-0`, 1]], name: `Ambulatory cross arch ${k}` });
    if (n === 2) { const b = at(PHI[k], AOX); placeArch(`${id}AO-${k}`, AOL, { y0: sec.aisleSpring, depth: 0.5, ox: b.x, oz: b.z, dx: d.x, dz: d.z, springL: [[pA('AB', k), 1]], springR: [[`${id}BU-${k}-0`, 1]], name: `Outer ambulatory arch ${k}` }); } });

  step('ambulatory');
  removeAt(p => p.step === STEP_AC && p.mat === 'timber');
  // the ambulatory's vaults: wedges between the arches across it, following their curve
  const ring = (B, X0, key, sup) => { const cl = B.c, kk = u => { const p = cl.p(u), m = cl.n(u); return [p[0] + m[0] * 0.2, p[1] + m[1] * 0.2 + sec.aisleSpring]; };
    for (let k = 0; k < nap; k++) for (const h of [-1, 1]) { const A = (q, phi) => { const [x, y] = kk(q * cl.uCrown); return at(phi, X0 - (h < 0 ? x : -x), y); };
      const g = ruled(q => A(q, PHI[k] + 0.012), q => A(q, PHI[k + 1] - 0.012), 0, 1, 10, 12);
      add(`${id}${key}-${k}-${h < 0 ? 'a' : 'b'}`, 'web panel', `Ambulatory vault ${k + 1}`, g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: sup(k) }); } };
  ring(AIL, AIX, 'VI', k => [[pP('D', k, 2), 0.25], [pP('D', k + 1, 2), 0.25], ...(n === 2 ? [[pA('AB', k), 0.25], [pA('AB', k + 1), 0.25]] : [[`${id}W-${k}`, 0.5]])]);
  if (n === 2) ring(AOL, AOX, 'VO', k => [[pA('AB', k), 0.25], [pA('AB', k + 1), 0.25], [`${id}W-${k}`, 0.5]]);
  const CHH = sec.chapelTop, Rch = Rbo - 0.45;
  if (chapels) for (let k = 0; k < nap; k++) { const { len } = chord(k, Rch), win = lancet(0, 3.4, Math.min(3, len - 3), 7);
    panel(`${id}CHF-${k}`, 'footing', `Footing, radiating chapel ${k + 1}`, k, Rch, 0, 0.6, 1.7, [], 0.6, []);
    panel(`${id}CH-${k}`, 'wall stone', `Radiating chapel ${k + 1}`, k, Rch, 0.6, CHH, 0.9, [win], 0.6, [[`${id}CHF-${k}`, 1]]);
    add(`${id}CHT-${k}`, 'lead sheet', `Radiating chapel roof ${k + 1}`, quad(at(PHI[k] + 0.02, Ro + aw / 2, CHH + 0.6), at(PHI[k + 1] - 0.02, Ro + aw / 2, CHH + 0.6), at(PHI[k + 1] - 0.02, Rch + 0.5, CHH), at(PHI[k] + 0.02, Rch + 0.5, CHH)), { mat: 'lead', w: len * (Rch - Ro) * 0.004 * LEAD, sup: [[`${id}CH-${k}`, 0.5], [`${id}W-${k}`, 0.5]], group: 'roof' }); }

  step('walls');
  const LVU = [LV.arcade, LV.triforium, H0, (H0 + corn) / 2, corn];
  MID.forEach(k => LVU.slice(0, -1).forEach((y0, c) => add(pP('P', k, c), 'wall-pier stone', `Apse wall pier ${k}, course ${c + 1}`, rbox(PHI[k], RI, RO, y0, LVU[c + 1], 0.55), { w: WT * 1.1 * (LVU[c + 1] - y0) * GAMMA, bear: WT * 1.1, sup: [[c ? pP('P', k, c - 1) : pP('AB', k), 1]] })));
  const archTop = LV.arcade + ARCA.extrados.at(-1)[1] + 0.05, triH = Math.max(0.3, Math.min(2.4, H0 - LV.triforium - 1.6)), clW = Math.min(2.2, chord(0, R1).len - 2.2), clH = Math.max(0.3, corn - H0 - 2.2 - clW * 0.866);
  const TRI = [lancet(-0.45, LV.triforium + 0.6, 0.6, triH), lancet(0.45, LV.triforium + 0.6, 0.6, triH)], CLW = lancet(0, H0 + 1, clW, clH);
  for (let k = 0; k < nap; k++) { const ps = c => [[pP('P', k, c), 0.5], [pP('P', k + 1, c), 0.5]];
    panel(`${id}WS-${k}`, 'spandrel', `Apse spandrel ${k + 1}`, k, R1, Math.min(archTop, LV.triforium - 0.2), LV.triforium, WT, [], 0.55, [[`${id}A-${k}-K`, 1]]);
    panel(`${id}WT-${k}`, 'wall stone', `Apse triforium ${k + 1}`, k, R1, LV.triforium, H0, WT, TRI, 0.55, ps(1));
    panel(`${id}WC-${k}`, 'wall stone', `Apse clerestory ${k + 1}`, k, R1, H0, corn, WT, [CLW], 0.55, ps(2));
    add(`${id}CO-${k}`, 'cornice stone', `Apse cornice ${k + 1}`, flat(k, R1, corn + 0.2, WT + 0.4, 0.4), { w: (WT + 0.4) * chord(k, R1).len * 0.4 * GAMMA, bear: (WT + 0.4) * chord(k, R1).len, sup: [[`${id}WC-${k}`, 1]] }); }

  // buttresses and flyers on the radial lines, as on the stretch
  const low = sec.flyerLow, high = sec.flyerHigh, upper = sec.upperTier(n), bTop = !tiers ? sec.aisleTop : upper ? high : low;
  const ym = H0 - 1 + (low - (H0 - 1)) * (R2 - RO) / (Rb - RO);
  step('buttresses');
  MID.forEach(k => { const p = PHI[k];
    if (tiers) [[sec.aisleTop, low], ...(upper ? [[low, high]] : [])].forEach(([y0, y1], j) => add(`${id}BU-${k}-${j + 2}`, 'buttress stone', `Apse buttress ${k}, course ${j + 3}`, rbox(p, Rb, Rbo, y0, y1, 0.75), { w: sec.bdepth * 1.5 * (y1 - y0) * GAMMA, bear: sec.bdepth * 1.5, sup: [[`${id}BU-${k}-${j + 1}`, 1]] }));
    if (tiers && n === 2) add(`${id}BI-${k}`, 'buttress stone', `Apse flyer pier ${k}`, rbox(p, R2 - 0.6, R2 + 0.6, sec.aisleSpring, ym - 0.2, 0.7), { w: 1.2 * 1.4 * (ym - sec.aisleSpring) * GAMMA, bear: 1.68, sup: [[pA('AB', k), 1]] });
    const pin = (pid, nm, c, y0, sup) => { add(`${pid}-0`, 'pinnacle stone', `${nm}, shaft`, boxG(c.x - 0.8, c.x + 0.8, y0, y0 + 3.2, c.z - 0.8, c.z + 0.8), { w: 8.2 * GAMMA, bear: 2.56, sup });
      const sp = new THREE.ConeGeometry(0.85, 7.5, 4); sp.rotateY(Math.PI / 4); sp.translate(c.x, y0 + 6.95, c.z); add(`${pid}-1`, 'spire stone', `${nm}, spire`, sp, { w: 3.6 * GAMMA, bear: 1.4, sup: [[`${pid}-0`, 1]] }); };
    pin(`${id}PN-${k}`, `Apse pinnacle ${k}`, at(p, (Rb + Rbo) / 2), bTop, [[`${id}BU-${k}-${!tiers ? 1 : upper ? 3 : 2}`, 1]]);
    if (tiers && n === 2) pin(`${id}PI-${k}`, `Apse flyer pier pinnacle ${k}`, at(p, R2), ym - 0.2, [[`${id}BI-${k}`, 1]]); });
  if (tiers) { step('flyers');
    MID.forEach(k => { const p = PHI[k], d = radial(p);
      const fl = (x0, x1, y0, y1, nst, dd, sag, tag, land, wall) => { const top = x => y0 + (y1 - y0) * (x - x0) / (x1 - x0) + dd / 2;
        for (let j = 0; j < nst; j++) { const a = x0 + (x1 - x0) * j / nst, b = x0 + (x1 - x0) * (j + 1) / nst, pts = [];
          for (let q = 0; q <= 6; q++) { const x = a + (b - a) * q / 6; pts.push([x, top(x)]); }
          for (let q = 6; q >= 0; q--) { const x = a + (b - a) * q / 6; pts.push([x, top(x) - dd - sag * Math.sin(Math.PI * (x - x0) / (x1 - x0))]); }
          add(`${id}FY${tag}-${k}-${j}`, 'flyer stone', `Apse flyer ${k}, stone ${j + 1}`, extr(pts, [], 0.8, C0.x, C0.z, d.x, d.z), { w: extrVol(pts, [], 0.8) * GAMMA, bear: 0.8 * dd, sup: [[land, 0.5], [wall, 0.5]] }); } };
      if (n === 2) { fl(RO, R2 - 0.6, H0 - 1, ym, 5, 0.45, 0.5, 'L', `${id}BI-${k}`, pP('P', k, 1)); fl(R2 + 0.6, Rb, ym, low, 5, 0.45, 0.5, 'O', `${id}BU-${k}-2`, `${id}BI-${k}`); }
      else fl(RO, Rb, H0 - 1, low, 7, 0.5, 0.7, 'L', `${id}BU-${k}-2`, pP('P', k, 1));
      if (upper) fl(RO, Rb, sec.yU, high, 7, 0.4, 0.55, 'U', `${id}BU-${k}-3`, pP('P', k, 3)); }); }

  // the vault: a half-rib from the wall at every radial line to the crown of the stretch's last transverse rib
  const { ARCH } = sec;
  step('centering');
  MID.forEach(k => { const half = ARCH.intrados.map(([x, y]) => at(PHI[k], -x, y + H0 - 0.14));
    add(`${id}VC-${k}`, 'centering timber', 'Apse centering, curved rib', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(half), 32, 0.13, 6, false), { mat: 'timber' });
    [0.4, 0.75].forEach((q, j) => { const c = at(PHI[k], R1 * q); add(`${id}VC-${k}-${j}`, 'centering timber', 'Apse centering, prop', cylG(0.1, 0.1, 0, H0 + ARCH.rise * (1 - q * q) * 0.9, c.x, c.z, 8), { mat: 'timber' }); }); });
  const STEP_VC = K.at();
  step('vault');
  MID.forEach(k => { const d = radial(PHI[k]), rid = j => `${id}R${k}-L${j}`;
    archShapes(ARCH).filter(a => a.side < 0).forEach(a => { const pts = a.pts.map(([s, y]) => [s, y + H0]);
      add(rid(a.j), 'voussoir', `Apse rib ${k}, voussoir ${a.j + 1}`, extr(pts, [], 0.5, C0.x, C0.z, -d.x, -d.z), { w: a.A * 0.5 * GAMMA, bear: ARCH.t * 0.5, sup: a.j ? [[rid(a.j - 1), 1]] : [[pP('P', k, 1), 1]] }); }); });
  { const trv = ribTop(ARCH, 1, H0), curve = phi => q => { const [x, y] = trv(q); return at(phi, -x, y); }, ribOf = k => k === 0 || k === nap ? `${r.T}TR${i}` : `${id}R${k}`;
    const rps = pre => K.pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
    [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => { for (let k = 0; k < nap; k++) {
      const g = ruled(curve(PHI[k]), curve(PHI[k + 1]), q0, q1, 6, 10), a = rps(ribOf(k)), b = rps(ribOf(k + 1));
      add(`${id}WEB-${k}-${c}`, 'web panel', 'Apse, vault web', g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(x => [x, 0.5 / a.length]), ...b.map(x => [x, 0.5 / b.length])] }); } }); }
  step('strike', { focus: 'forces' });
  removeAt(p => p.step === STEP_VC);
  const STEP_STRUCK = K.at();

  step('roofs');
  { const apex = at(0, 0, sec.RIDGE);
    MID.forEach((k, j) => add(`${id}RF${j}`, 'rafter', 'Apse rafter', beamG(at(PHI[k], sec.RX - 0.1, sec.RY + 0.36), apex, 0.3), { mat: 'oak', w: 1.2 * OAK, sup: [[`${id}CO-${Math.min(nap - 1, k)}`, 1]], group: 'roof' }));
    for (let k = 0; k < nap; k++) {
      add(`${id}LD-${k}`, 'lead sheet', 'Apse roof', tri(at(0, 0, sec.RIDGE + 0.42), at(PHI[k], sec.RX + 0.25, sec.RY + 0.2), at(PHI[k + 1], sec.RX + 0.25, sec.RY + 0.2)), { mat: 'lead', w: sec.RX * chord(k, sec.RX).len * 0.6 * 0.004 * LEAD, sup: [[`${id}CO-${k}`, 1]], group: 'roof' });
      add(`${id}LA-${k}`, 'lead sheet', 'Ambulatory roof', quad(at(PHI[k], RO + 0.1, sec.aisleRoofTop), at(PHI[k + 1], RO + 0.1, sec.aisleRoofTop), at(PHI[k + 1], Ro + aw / 2 + 0.1, sec.aisleTop + 0.3), at(PHI[k], Ro + aw / 2 + 0.1, sec.aisleTop + 0.3)), { mat: 'lead', w: (Ro - RO) * chord(k, Ro).len * 0.004 * LEAD, sup: [[`${id}WS-${k}`, 0.5], [`${id}W-${k}`, 0.5]], group: 'roof' }); } }

  return {
    STEP_STRUCK,
    glaze() {
      for (let k = 0; k < nap; k++) { const { len } = chord(k, Ro);
        const cm = chord(k, R1), g1 = extr(CLW, [], 0.05, cm.m.x, cm.m.z, cm.t.x, cm.t.z); add(`${id}GLC-${k}`, 'glass panel', 'Stained glass', g1, { mat: 'glass', tint: k % 3 });
        const om = chord(k, Ro), w = Math.min(3.2, len - 2.4), g2 = extr(lancet(0, 3, w, Math.max(1, sec.aisleTop - 5 - w * 0.866)), [], 0.05, om.m.x, om.m.z, om.t.x, om.t.z); add(`${id}GLW-${k}`, 'glass panel', 'Stained glass', g2, { mat: 'glass', tint: (k + 1) % 3 });
        if (chapels) { const ch = chord(k, Rch), wc = Math.min(3, ch.len - 3), g3 = extr(lancet(0, 3.4, wc, 7), [], 0.05, ch.m.x, ch.m.z, ch.t.x, ch.t.z); add(`${id}GLH-${k}`, 'glass panel', 'Stained glass', g3, { mat: 'glass', tint: (k + 2) % 3 }); } }
    },
    pave() { for (let k = 0; k < nap; k++) add(`${id}PV-${k}`, 'paving slab', 'Paving, apse', tri(at(0, 0, 0.08), at(PHI[k], Ro - aw / 2, 0.08), at(PHI[k + 1], Ro - aw / 2, 0.08)), { mat: 'pave' }); },
    forceLines() {
      const SUP = sec.supports(n), tp = Solver.thrustPoints(ARCH, sec.SOL.state);
      return MID.map(k => { const p = PHI[k], w = (x, y) => at(p, -x, y);
        const lines = [{ pts: tp.map(([x, y]) => w(x, y + H0)), r: 0.16 }, { pts: SUP.wall.line.filter(q => isFinite(q[0])).map(([x, y]) => w(x, y)), r: 0.13 }];
        if (SUP.flyer) lines.push({ pts: [w(sec.XO, SUP.flyer.yA), w(SUP.flyer.xbI, SUP.flyer.yB)], r: 0.15 }, { pts: SUP.buttress.line.filter(q => isFinite(q[0])).map(([x, y]) => w(x, y)), r: 0.13 });
        const a = at(p, R1 * 2, 20), d = radial(p);
        return { z: a.z, end: false, radial: true, at: a, normal: V3(-d.z, 0, d.x).normalize(), lines, bases: [SUP.wall, SUP.buttress].filter(c => c && isFinite(c.x0)).map(c => w(c.x0, 0.2)) }; });
    },
  };
}
