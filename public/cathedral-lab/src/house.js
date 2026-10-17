// A house built by N. L. Mitton, Inc. in 1972, from its drawings: the foundation plan, both floor plans, the elevations
// and the typical framing section (footings, a girder on lally columns, 2x10 joists, 2x4 walls, 2x8 rafters). What the
// drawings leave out (the back of the house, the garage framing, heights the sheets do not mark) is filled in the usual
// way for a 1972 Colonial and said so where a visitor can see it. The last bag goes on from 1972 to the house as it is
// today, from photographs. No address, on purpose.
//
// The same exports as the cathedrals (pieces, steps, KIT, forceLines, computeLoads, live). Its load model is not the
// masonry one: each joist, rafter, stud, column and footing is checked by wood.js against today's design loads, with the
// loads that are on it at that step, and colored by the share of its allowable strength it uses.
// Units: the drawings' feet inside this file; the kit and the page get metres and kN. u runs east along the house from
// its west wall, v back from its front wall, y up from the ground; the street side is -x, the garage end +z.
import * as THREE from './vendor/three.module.js?v=0.14';
import { createKit, V3, boxG, cylG, extr } from './kit.js?v=0.14';
import * as Wood from './wood.js?v=0.14';

const F = 0.3048, KN = 0.004448;                    // a foot in metres, a pound in kN
const X = v => (v - 14) * F, Z = u => (u - 36) * F, Y = y => y * F;
const inch = n => n / 12;

// ---------- Levels ----------
// From the framing section: a 4x6 sill on the foundation, 2x10 joists with a subfloor, 2x4 walls (a plate, 92 5/8 inch
// studs, a double plate), the same again, then 2x8 ceiling joists and rafters. The foundation shows 8 inches above the
// ground, the cellar floor is 8 feet below the top of the wall.
const T = 0.5, SILL = T + inch(3.5), F1 = SILL + inch(9.25) + inch(0.75);
const WALL = inch(1.5 + 92.625 + 3), P1 = F1 + WALL, F2 = P1 + inch(9.25) + inch(0.75), P2 = F2 + WALL;
const CELLAR = -7.5, FTG = CELLAR - inch(10);
const MAIN = { u0: 0, u1: 33, v0: 0, v1: 28 }, WING = { u0: 33, u1: 54, v0: 2, v1: 28 };
const PITCH = 8 / 12, RIDGE = P2 + 14 * PITCH;      // the main roof: 8 in 12 both ways, the ridge over the middle
// the wing: 10.7 in 12 down to its one-storey front, 4 in 12 down to its two-storey back (the side elevation)
const WF = 10.7 / 12, WB = 4 / 12, WRV = (P2 + 28 * WB - P1 + 2 * WF) / (WF + WB), WRIDGE = P1 + (WRV - 2) * WF;
// the garage: 24 by 24, its front 15 1/2 feet back from the house's, 8 in 12 at the front and 4 in 12 behind
const GAR = { u0: 58, u1: 82, v0: 15.5, v1: 39.5 }, GSLAB = inch(4), GP = GSLAB + WALL, GRV = GAR.v0 + 8, GRIDGE = GP + 8 * PITCH;
const PORCH = { u0: 1, u1: 15, v0: 28, v1: 42, floor: 1.25, plate: 9.0 };
const COLS = [1, 2, 3, 4, 5, 6].map(k => inch(10) + k * (52 + 4 / 12) / 7);   // 7 equal spaces, 52'-4"
const CHIM = { u0: 12.5, u1: 16.5, v0: 14.4, v1: 17.4 }, FRCH = { u0: 41.4, u1: 45.5, v0: 26.6, v1: 30.6 };
const SNOW_IN = 27;                                 // the Blizzard of '78, Boston's total

// ---------- Geometry ----------
const bx = (u0, u1, v0, v1, y0, y1) => boxG(X(Math.min(v0, v1)), X(Math.max(v0, v1)), Y(Math.min(y0, y1)), Y(Math.max(y0, y1)), Z(Math.min(u0, u1)), Z(Math.max(u0, u1)));
// a profile drawn in (v, y), extruded from u0 to u1; and one drawn in (u, y), extruded from v0 to v1
const vy = (pts, u0, u1, holes = []) => extr(pts.map(([v, y]) => [X(v), Y(y)]), holes.map(h => h.map(([v, y]) => [X(v), Y(y)])), (u1 - u0) * F, 0, Z((u0 + u1) / 2), 1, 0);
const uy = (pts, v0, v1, holes = []) => extr(pts.map(([u, y]) => [Z(u), Y(y)]), holes.map(h => h.map(([u, y]) => [Z(u), Y(y)])), Math.abs(v1 - v0) * F, X((v0 + v1) / 2), 0, 0, 1);
const R = (a0, a1, y0, y1) => [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
// a flat shape on the ground, given in (u, v)
function flat(pts, y0, y1) {
  const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(X(v), -Z(u))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: (y1 - y0) * F, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, Y(y0), 0); g.computeVertexNormals(); return g;
}
// several shapes as one piece (a window's trim, a shutter's slats)
function merge(gs) {
  const parts = gs.map(g => g.index ? g.toNonIndexed() : g), n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// texture coordinates in metres, so siding and shingles repeat at their real size: walls by their face, roofs along the
// ridge and down the slope (alongX: a roof whose ridge runs across the house, the porch's)
function worldUV(g, slope = 1, alongX = false) {
  const p = g.attributes.position, nm = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nm.getX(i)), ay = Math.abs(nm.getY(i)), az = Math.abs(nm.getZ(i));
    let a, b;
    if (ay > 0.45 && ay >= Math.max(ax, az) * 0.5 && slope !== 1 || ay >= ax && ay >= az) [a, b] = alongX ? [p.getX(i), p.getZ(i) * slope] : [p.getZ(i), p.getX(i) * slope];
    else if (ax >= az) [a, b] = [p.getZ(i), p.getY(i)]; else [a, b] = [p.getX(i), p.getY(i)];
    uv[2 * i] = a; uv[2 * i + 1] = b;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// how tall a 2x8 rafter stands, measured plumb, at a pitch
const dv8 = p => inch(7.25) / Math.cos(Math.atan(p));
// evenly spaced positions from a to b, every step, and b itself
function stations(a, b, stepLen) { const out = []; for (let x = a; x < b - 0.2; x += stepLen) out.push(x); out.push(b); return out; }
// a sloped board in (v, y): its underside from (va, ya) to (vb, yb), plumb-cut both ends, depth d (inches, square to it)
function slopeBoard(va, ya, vb, yb, d) {
  const dv = inch(d) * Math.hypot(vb - va, yb - ya) / Math.abs(vb - va);
  return [[va, ya], [vb, yb], [vb, yb + dv], [va, ya + dv]];
}
// little random numbers, the same every time
let SEED = 7;
const rnd = () => { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; };

// ---------- Materials ----------
// Plain colors for the framing, so the load colors read; textures, drawn here, for what a visitor sees outside.
const lin = h => new THREE.Color(h).convertSRGBToLinear();
const std = (color, o = {}) => () => new THREE.MeshStandardMaterial({ color: lin(color), roughness: 0.85, ...o });
function texture(draw, metres) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); SEED = 11; draw(x, 512);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / metres, 1 / metres); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
// rows of shingles or tabs: exposure rows per tile, each row of pieces of random width, a dark line under each course
function courses(x, S, rows, base, { minW = 0.08, maxW = 0.2, line = 0.55, jitter = 0.12, offset = 0 }) {
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    let at = r % 2 ? offset * S : 0; const y = r * h;
    x.fillStyle = base; x.fillRect(0, y, S, h);
    while (at < S + S) { const w = S * (minW + rnd() * (maxW - minW)); x.fillStyle = shade(base, 1 - jitter + rnd() * jitter * 2); x.fillRect(at % S, y + 1, w - 2, h - 2); if (at % S + w > S) x.fillRect(at % S - S, y + 1, w - 2, h - 2); x.fillStyle = shade(base, line); x.fillRect((at + w - 2) % S, y, 2, h); at += w; if (at > S + S * 0.98) break; }
    x.fillStyle = shade(base, line); x.fillRect(0, y + h - 3, S, 3);
  }
}
const MATS = {
  lumber: std(0xe6c993), timber: std(0xb58a59), ply: std(0xd8b57c), form: std(0xb79a6a), concrete: std(0xbcb8b0, { roughness: 1 }),
  steel: std(0x5e6670, { metalness: 0.5, roughness: 0.5 }), tar: std(0x232325, { roughness: 0.6 }), earth: std(0x7d6549, { roughness: 1 }),
  trim: std(0xf1efe8, { roughness: 0.6 }), shutter: std(0x262a30, { roughness: 0.55 }), door: std(0xa2272b, { roughness: 0.45 }),
  glass: std(0x41566a, { roughness: 0.12, metalness: 0.35 }), snow: std(0xf5f8fc, { roughness: 0.9 }), oak: std(0xb98a55, { roughness: 0.6 }),
  leaf: std(0x51703a, { roughness: 0.95 }), pine: std(0x2e4a33, { roughness: 0.95 }), bark: std(0x5a4636), hydrangea: std(0x8f86c8, { roughness: 0.9 }),
  asphalt: std(0x2e3034, { roughness: 0.95 }), rubber: std(0x1a1a1a, { roughness: 0.8 }), chrome: std(0xd2d6d9, { metalness: 0.8, roughness: 0.3 }),
  gold: std(0xc9a24a, { roughness: 0.4 }), panel: std(0x7b4a24, { roughness: 0.6 }), red: std(0xb5372d, { roughness: 0.5 }), drum: std(0xddd8cc, { roughness: 0.6 }),
  tank: std(0x6c7058, { roughness: 0.7 }), hleaf: std(0x3b6531, { roughness: 0.95 }), boiler: std(0x9c8a72, { roughness: 0.7 }), string: std(0xfafafa), screen: () => new THREE.MeshStandardMaterial({ color: lin(0x1d2126), transparent: true, opacity: 0.45, roughness: 0.9, side: THREE.DoubleSide }),
  cedar: () => new THREE.MeshStandardMaterial({ roughness: 0.9, map: texture((x, S) => courses(x, S, 8, '#9b7652', { minW: 0.06, maxW: 0.16, line: 0.55 }), 1.0) }),
  clap: () => new THREE.MeshStandardMaterial({ roughness: 0.75, map: texture((x, S) => { const rows = 10, h = S / rows; for (let r = 0; r < rows; r++) { const g = x.createLinearGradient(0, r * h, 0, r * h + h); g.addColorStop(0, '#b9bec2'); g.addColorStop(1, '#d4d8db'); x.fillStyle = g; x.fillRect(0, r * h, S, h); x.fillStyle = '#9ba1a6'; x.fillRect(0, r * h + h - 3, S, 3); } }, 1.0) }),
  bnb72: () => new THREE.MeshStandardMaterial({ roughness: 0.9, map: texture((x, S) => { x.fillStyle = '#8f6c4a'; x.fillRect(0, 0, S, S); for (let i = 0; i < 4; i++) { x.fillStyle = '#7a5a3c'; x.fillRect(i * S / 4, 0, 12, S); x.fillStyle = '#a07d58'; x.fillRect(i * S / 4 + 12, 0, 4, S); } }, 1.2) }),
  bnb: () => new THREE.MeshStandardMaterial({ roughness: 0.75, map: texture((x, S) => { x.fillStyle = '#ccd0d3'; x.fillRect(0, 0, S, S); for (let i = 0; i < 4; i++) { x.fillStyle = '#b4b9bd'; x.fillRect(i * S / 4, 0, 14, S); x.fillStyle = '#e1e4e6'; x.fillRect(i * S / 4 + 14, 0, 4, S); } }, 1.2) }),
  roofing: () => new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, map: texture((x, S) => { courses(x, S, 8, '#5d6166', { minW: 0.25, maxW: 0.25, line: 0.6, jitter: 0.1, offset: 0.5 }); for (let i = 0; i < 9000; i++) { x.fillStyle = rnd() < 0.5 ? '#4b4f54' : '#70747a'; x.fillRect(rnd() * S, rnd() * S, 2, 2); } }, 1.0) }),
  brick: () => new THREE.MeshStandardMaterial({ roughness: 0.9, map: texture((x, S) => { x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, S, S); const rows = 12, h = S / rows, w = S / 4; for (let r = 0; r < rows; r++) for (let i = -1; i < 5; i++) { x.fillStyle = shade('#9a4632', 0.8 + rnd() * 0.4); x.fillRect(i * w + (r % 2) * w / 2 + 3, r * h + 3, w - 6, h - 6); } }, 0.8) }),
  fieldstone: () => new THREE.MeshStandardMaterial({ roughness: 1, map: texture((x, S) => { x.fillStyle = '#6f6a62'; x.fillRect(0, 0, S, S); for (let i = 0; i < 70; i++) { const cx = rnd() * S, cy = rnd() * S, r = 22 + rnd() * 30; x.fillStyle = shade(['#9d978c', '#8a8070', '#a9a49a', '#7f7a72'][i % 4], 0.85 + rnd() * 0.3); for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.beginPath(); x.ellipse(cx + dx, cy + dy, r, r * (0.6 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2); x.fill(); } } }, 1.2) }),
  pavers: () => new THREE.MeshStandardMaterial({ roughness: 0.95, map: texture((x, S) => { x.fillStyle = '#b9a593'; x.fillRect(0, 0, S, S); const n = 8, c = S / n; for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) { x.fillStyle = shade('#b0604a', 0.8 + rnd() * 0.35); if ((r + i) % 2) x.fillRect(i * c + 3, r * c + 3, c - 6, c / 2 - 5), x.fillRect(i * c + 3, r * c + c / 2 + 2, c - 6, c / 2 - 5); else x.fillRect(i * c + 3, r * c + 3, c / 2 - 5, c - 6), x.fillRect(i * c + c / 2 + 2, r * c + 3, c / 2 - 5, c - 6); } }, 1.6) }),
};
const TEXTURED = new Set(['cedar', 'clap', 'bnb72', 'bnb', 'roofing', 'brick', 'pavers', 'fieldstone']);

// ---------- The kit ----------
const K = createKit();
const { pieces, steps } = K;
let BAG = 0;
const bag = n => K.bag(++BAG, n), step = (t, n, o) => K.step(t, n, o);
let NID = 0;
// every piece: its kind and name, its geometry, its material; o.lb its weight in pounds, o.check how it carries load,
// o.lv the load it brings to the house (the floor, the roof, the snow), o.site for the trees and the lawn
function add(kind, name, geo, mat = 'lumber', o = {}) {
  if (TEXTURED.has(mat) || o.uv) worldUV(geo, o.slope || 1, o.alongX);
  const p = K.add(o.id || `${kind.replace(/[^a-z0-9]+/gi, '')}${++NID}`, kind, name, geo, { mat, w: (o.lb || 0) * KN, group: o.group });
  Object.assign(p, { lb: o.lb || 0, check: o.check || null, lv: o.lv || null, site: !!o.site, size: o.size || null, assumed: !!o.assumed });
  return p;
}
const until = (ps, s) => ps.forEach(p => { p.until = s; });
const LBFT3 = { lumber: 28, timber: 32, concrete: 150, brick: 120 };
const boardLb = (len, size) => { const [b, d] = Wood.SIZES[size]; return len * b * d / 144 * LBFT3.lumber; };

// ---------- The load model ----------
// What is on the house at a step: the floors, the ceilings and the roof once they are built, the snow in 1978. Each
// checked piece has a function of that which gives its check (wood.js); computeLoads runs them for the step shown.
const L = Wood.LOADS;
const ON = {};
const roofTop = on => on.snow ? { psf: L.roofDead + Wood.snowLoad(SNOW_IN), live: Wood.snowLoad(SNOW_IN), dur: 'snow' } : { psf: L.roofDead + L.roofLive, live: L.roofLive, dur: 'roof' };
// the load a long wall of the main block or the wing brings down, lb per foot, from what is above it
function wallLine(on, { roof = 0, ceiling = 0, floor2 = 0, walls2 = false, roofKey = 'roofM' }) {
  let w = 0;
  if (on[roofKey]) w += roof * roofTop(on).psf;
  if (on.ceil) w += ceiling * (L.ceilingDead + L.attic);
  if (on.deck2) w += floor2 * (L.floorDead + L.sleeping);
  if (walls2 && on.walls2) w += 8 * L.wallDead;
  return w;
}
const girderLine = on => (on.deck1 ? 14 * (L.floorDead + L.live) : 0) + (on.walls1 ? 8 * L.wallDead : 0) + (on.deck2 ? 14 * (L.floorDead + L.sleeping) : 0) + (on.walls2 ? 8 * L.wallDead : 0) + (on.ceil ? 14 * (L.ceilingDead + L.attic) : 0);
const SPAN_G = (52 + 4 / 12) / 7;

// ---------- Bag 1: the lot ----------
bag('The lot');
const S_LOT = step('A wooded lot', 'Spring 1972. A lot at the head of a new cul-de-sac, oak and white pine, the woods running back to a marsh. N. L. Mitton, Inc. has the drawings: a two-storey Colonial with a wing and a two-car garage, nine sheets in all.');
// the woods: thick behind and to the sides, a few trees where the house and the lawn will be (they come down next)
const TREES = [];
function tree(u, v, h, pine, siteOnly = true) {
  const r = h * 0.018, g = [], top = [];
  g.push(cylG(Y(r), Y(r * 0.7), 0, Y(h * (pine ? 0.45 : 0.55)), X(v), Z(u), 7));
  if (pine) for (let k = 0; k < 3; k++) { const c = new THREE.ConeGeometry(Y(h * (0.22 - k * 0.05)), Y(h * 0.34), 8); c.translate(X(v), Y(h * (0.36 + k * 0.2)), Z(u)); top.push(c); }
  else for (let k = 0; k < 3; k++) { const c = new THREE.IcosahedronGeometry(Y(h * (0.2 - k * 0.03)), 0); c.scale(1, 0.85, 1); c.translate(X(v + (rnd() - 0.5) * h * 0.15), Y(h * (0.62 + k * 0.12)), Z(u + (rnd() - 0.5) * h * 0.15)); top.push(c); }
  const a = add('tree', pine ? 'White pine' : 'Oak', merge(g), 'bark', { site: siteOnly });
  const b = add('tree', pine ? 'White pine' : 'Oak', merge(top), pine ? 'pine' : 'leaf', { site: siteOnly });
  return [a, b];
}
SEED = 3;
const CLEAR = [];
for (let i = 0; i < 90; i++) {
  // the woods behind and to the sides, as in the aerial photographs; the front lawn and the street side stay open
  const u = -110 + rnd() * 300, v = -30 + rnd() * 220;
  if (v < 70 && u > -50 && u < 140) continue;
  if (v < 10) continue;
  TREES.push(...tree(u, v, 45 + rnd() * 35, rnd() < 0.35));
}
for (const [u, v] of [[8, 6], [24, 22], [44, 10], [60, 26], [72, 4], [-8, 30], [30, 40], [50, 36], [16, 52], [66, 50]]) CLEAR.push(...tree(u + rnd() * 4, v + rnd() * 4, 40 + rnd() * 30, rnd() < 0.4));

const S_STAKE = step('Clear it and stake it out', 'The trees where the house goes come down. Batter boards at the corners hold strings on the lines of the foundation, so the corners can be found again at the bottom of the hole.');
until(CLEAR, S_STAKE);
const BATTER = [];
for (const [u, v, su, sv] of [[0, 0, -1, -1], [54, 2, 1, -1], [0, 28, -1, 1], [54, 28, 1, 1], [33, 0, 1, -1]]) {
  const g = [];
  for (const [du, dv] of [[su * 4, sv * 1], [su * 1, sv * 4], [su * 4, sv * 4]]) g.push(bx(u + du - 0.08, u + du + 0.08, v + dv - 0.08, v + dv + 0.08, 0, 2.6));
  g.push(bx(u + su * 1, u + su * 4.1, v + sv * 4 - 0.04, v + sv * 4 + 0.04, 2.0, 2.45), bx(u + su * 4 - 0.04, u + su * 4 + 0.04, v + sv * 1, v + sv * 4.1, 2.0, 2.45));
  BATTER.push(add('batter board', 'Batter board', merge(g), 'lumber'));
}
const S = 0.015;
for (const [u0, u1, v0, v1] of [[-4, 58, 0, 0], [-4, 58, 28, 28], [0, 0, -4, 32], [54, 54, -2, 32], [33, 58, 2, 2]]) BATTER.push(add('string line', 'String on the foundation line', bx(Math.min(u0, u1) - S, Math.max(u0, u1) + S, Math.min(v0, v1) - S, Math.max(v0, v1) + S, 2.45, 2.48), 'string'));

const S_DIG = step('Dig the cellar hole', 'An excavator takes out the cellar, about nine feet deep and two feet wider than the foundation all round, so men can work outside the walls. New England soil is full of glacier stones, and the big ones go to a wall at the back of the lot.');

// ---------- Bag 2: the foundation ----------
bag('Foundation');
// the foundation walls, 10 inches thick, their outside faces on the house's lines: the main block's front, the 2 foot
// jog, the wing's front, the east end, the back and the west end
const FW = inch(10);
const FWALLS = [
  { n: 'west', u0: 0, u1: FW, v0: 0, v1: 28 }, { n: 'front', u0: FW, u1: 33 - FW, v0: 0, v1: FW }, { n: 'jog', u0: 33 - FW, u1: 33, v0: 0, v1: 2 + FW },
  { n: 'wing front', u0: 33, u1: 54 - FW, v0: 2, v1: 2 + FW }, { n: 'east', u0: 54 - FW, u1: 54, v0: 2, v1: 28 }, { n: 'back', u0: FW, u1: 54 - FW, v0: 28 - FW, v1: 28 },
];
const runs = W => W.v1 - W.v0 > W.u1 - W.u0 ? 'u' : 'v';     // which way a wall runs
step('Footings', 'Concrete footings, 10 inches thick and 22 wide, on undisturbed soil below the frost: a continuous one under every wall, a 2 foot square pad under each of the six columns to come, and slabs for the two fireplaces.', {});
const FOOT = {};
for (const W of FWALLS) {
  const along = runs(W), e = inch(6);
  const g = along === 'u' ? bx(W.u0 - e, W.u1 + e, W.v0, W.v1, FTG, CELLAR) : bx(W.u0, W.u1, W.v0 - e, W.v1 + e, FTG, CELLAR);
  const len = along === 'u' ? W.v1 - W.v0 : W.u1 - W.u0;
  FOOT[W.n] = add('footing', `Footing, ${W.n} wall`, g, 'concrete', { lb: len * (22 / 12) * (10 / 12) * 150 });
}
const COLFOOT = COLS.map((u, k) => add('column footing', `Column footing ${k + 1}, 2 by 2 feet`, bx(u - 1, u + 1, 13, 15, FTG, CELLAR), 'concrete', { lb: 4 * (10 / 12) * 150 }));
add('footing', 'Fireplace slab', bx(CHIM.u0 - 0.5, CHIM.u1 + 0.5, CHIM.v0 - 0.3, CHIM.v1 + 0.5, FTG, CELLAR), 'concrete', { lb: 20 * 150 * 0.83 });

const S_FORMS = step('Set the forms', 'Plywood form panels stand on the footings, two walls of them 10 inches apart, tied through and braced, with the girder pockets and the bolts for the sill set in.');
const FORMS = [];
for (const W of FWALLS) {
  const along = runs(W), len = along === 'u' ? W.v1 - W.v0 : W.u1 - W.u0, n = Math.max(1, Math.round(len / 8));
  for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
    const a0 = (along === 'u' ? W.v0 : W.u0) + len * i / n, a1 = a0 + len / n - 0.05, t = 0.06;
    const g = along === 'u'
      ? (side < 0 ? bx(W.u0 - t - 0.02, W.u0 - 0.02, a0, a1, CELLAR, T + 0.15) : bx(W.u1 + 0.02, W.u1 + t + 0.02, a0, a1, CELLAR, T + 0.15))
      : (side < 0 ? bx(a0, a1, W.v0 - t - 0.02, W.v0 - 0.02, CELLAR, T + 0.15) : bx(a0, a1, W.v1 + 0.02, W.v1 + t + 0.02, CELLAR, T + 0.15));
    FORMS.push(add('form panel', 'Form panel', g, 'form'));
  }
}
const S_POUR = step('Pour the walls', 'The ready-mix truck backs up and the walls are poured in one day, worked down into the forms so there are no voids. Eight feet of wet concrete pushes hard on a form, about 1,000 pounds on every square foot at the bottom.');
const FDN = {};
for (const W of FWALLS) {
  const len = runs(W) === 'u' ? W.v1 - W.v0 : W.u1 - W.u0;
  FDN[W.n] = add('foundation wall', `Foundation wall, ${W.n}`, bx(W.u0, W.u1, W.v0, W.v1, CELLAR, T), 'concrete', { lb: len * FW * (T - CELLAR) * 150 });
}
// the truck: a cab, a frame, the drum and its wheels, parked on the street side
function truck(u, v) {
  const body = [bx(u - 3.5, u + 3.5, v - 3, v - 1, 1.2, 3.0), bx(u - 3.5, u + 3.5, v - 1, v + 18, 1.5, 2.6), bx(u - 3.4, u + 3.4, v - 3.6, v - 0.6, 3.0, 8.4)];
  // the drum lies along the truck, its open end tipped up toward the back
  const drum = new THREE.CylinderGeometry(Y(2.4), Y(3.4), Y(12), 18); drum.rotateZ(Math.PI / 2 - 0.22); drum.translate(X(v + 10), Y(6.2), Z(u));
  const w = [];
  for (const vv of [v - 1.5, v + 11, v + 15]) for (const s of [-1, 1]) { const c = new THREE.CylinderGeometry(Y(1.6), Y(1.6), Y(1), 14); c.rotateX(Math.PI / 2); c.translate(X(vv), Y(1.6), Z(u + s * 3.3)); w.push(c); }
  return [add('truck', 'Ready-mix truck', merge(body), 'red', { site: true }), add('truck', 'Ready-mix truck, drum', drum, 'drum', { site: true }), add('truck', 'Ready-mix truck, wheels', merge(w), 'rubber', { site: true })];
}
const TRUCK = truck(45, -22);

const S_STRIP = step('Strip the forms', 'A day or two later the forms come off and go on to the next house. The walls keep curing for weeks, getting stronger the whole time.');
until(FORMS, S_STRIP); until(TRUCK, S_STRIP);

step('Garage and breezeway', 'The garage and the breezeway have no cellar: 8 inch frost walls go down four feet, below where the ground freezes, and their floors will be slabs on the ground.');
const GW = inch(8);
for (const [n, u0, u1, v0, v1] of [['garage front', GAR.u0, GAR.u1, GAR.v0, GAR.v0 + GW], ['garage back', GAR.u0, GAR.u1, GAR.v1 - GW, GAR.v1], ['garage east', GAR.u1 - GW, GAR.u1, GAR.v0, GAR.v1], ['garage west', GAR.u0, GAR.u0 + GW, GAR.v0, GAR.v1], ['breezeway front', 54, GAR.u0, GAR.v0, GAR.v0 + GW], ['breezeway back', 54, GAR.u0, 28 - GW, 28]])
  add('frost wall', `Frost wall, ${n}`, bx(u0, u1, v0, v1, -4, GSLAB), 'concrete', { lb: Math.max(u1 - u0, v1 - v0) * 0.67 * 4.3 * 150 });

const S_FILL = step('Damp-proof, drain and backfill', 'The outside of the walls gets a coat of tar against the wet, a drain pipe goes round the footings in crushed stone, and the hole is filled back in against the walls.');
until(BATTER, S_FILL);
const TAR = [];
for (const W of FWALLS) {
  if (W.n === 'jog') { TAR.push(add('damp-proofing', 'Tar, jog', bx(33, 33.04, 0, 2, CELLAR, 0), 'tar')); continue; }
  const e = 0.04;
  const g = W.n === 'west' ? bx(-e, 0, 0, 28, CELLAR, 0) : W.n === 'east' ? bx(54, 54 + e, 2, 28, CELLAR, 0) : W.n === 'back' ? bx(0, 54, 28, 28 + e, CELLAR, 0) : W.n === 'front' ? bx(0, 33, -e, 0, CELLAR, 0) : bx(33, 54, 2 - e, 2, CELLAR, 0);
  TAR.push(add('damp-proofing', `Tar, ${W.n} wall`, g, 'tar'));
}
const pipe = (a, b) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(Y(0.17), Y(0.17), d.length(), 8); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()))); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g; };
const P = (u, v, y) => V3(X(v), Y(y), Z(u));
add('drain pipe', 'Footing drain', merge([pipe(P(-0.9, -0.9, CELLAR + 0.2), P(33.9, -0.9, CELLAR + 0.2)), pipe(P(33.9, -0.9, CELLAR + 0.2), P(33.9, 1.1, CELLAR + 0.2)), pipe(P(33.9, 1.1, CELLAR + 0.2), P(54.9, 1.1, CELLAR + 0.2)), pipe(P(54.9, 1.1, CELLAR + 0.2), P(54.9, 28.9, CELLAR + 0.2)), pipe(P(54.9, 28.9, CELLAR + 0.2), P(-0.9, 28.9, CELLAR + 0.2)), pipe(P(-0.9, 28.9, CELLAR + 0.2), P(-0.9, -0.9, CELLAR + 0.2))]), 'tar');
const PIT = { u0: -2.5, u1: 56.5, v0: -2.5, v1: 30.5 };
for (const [n, u0, u1, v0, v1] of [['front', PIT.u0, 33, PIT.v0, 0], ['wing front', 33, PIT.u1, PIT.v0, 2], ['back', PIT.u0, PIT.u1, 28, PIT.v1], ['west', PIT.u0, 0, 0, 28], ['east', 54, PIT.u1, 2, 28]])
  add('backfill', `Backfill, ${n}`, bx(u0, u1, v0, v1, FTG - 0.6, -0.02), 'earth', { site: true });

const S_GIRDER = step('Columns and the girder', 'Six steel lally columns, 3 1/2 inch pipe filled with concrete, stand on the pads in 7 equal spaces. On them, and in pockets in the end walls, an 8x10 timber girder runs the length of the house down the middle. Half of every floor will rest on it.');
const COL = COLS.map((u, k) => add('lally column', `Lally column ${k + 1}`, cylG(Y(1.75 / 12), Y(1.75 / 12), Y(CELLAR), Y(SILL - inch(9.5)), X(14), Z(u), 14), 'steel',
  { lb: 7.5 * 9 + 7.5 * 0.06 * 150, size: '3 1/2 inch steel pipe', check: on => Wood.steelColumn({ height: 7.5, P: girderLine(on) * SPAN_G }) }));
COL.forEach((c, k) => { COLFOOT[k].check = on => Wood.footing({ P: girderLine(on) * SPAN_G + c.lb + COLFOOT[k].lb, area: 4 }); COLFOOT[k].size = '2 by 2 feet, 10 inches thick'; });
const GIRDER = [[inch(4), COLS[1]], [COLS[1], COLS[3]], [COLS[3], COLS[5]], [COLS[5], 54 - inch(4)]].map(([u0, u1], k) =>
  add('girder', `Girder, 8x10 timber, piece ${k + 1}`, bx(u0, u1, 14 - inch(3.75), 14 + inch(3.75), SILL - inch(9.5), SILL), 'timber',
    { lb: (u1 - u0) * 7.5 * 9.5 / 144 * 32, size: '8x10 timber', check: on => Wood.beam({ size: '8x10', grade: 'dfl1', span: SPAN_G, w: girderLine(on), wLive: girderLine(on) * 0.75, rep: false }) }));

// ---------- Bag 3: the first floor deck ----------
bag('First floor');
step('Sills', 'A 4x6 sill goes down flat on the top of the wall, bolted to it, flush with the outside. Everything made of wood stands on it, and it keeps the framing up off the concrete.');
const SILLS = [[0, 33, 0, inch(5.5)], [33 - inch(5.5), 33, 0, 2 + inch(5.5)], [33, 54, 2, 2 + inch(5.5)], [54 - inch(5.5), 54, 2, 28], [0, 54, 28 - inch(5.5), 28], [0, inch(5.5), 0, 28]].map(([u0, u1, v0, v1], k) =>
  add('sill', 'Sill, 4x6', bx(u0, u1, v0, v1, T, SILL), 'lumber', { lb: Math.max(u1 - u0, v1 - v0) * 3.5 * 5.5 / 144 * 28, size: '4x6' }));

// Joists across the house, front half and back half, lapped side by side over the girder and the bearing wall,
// headed off round the chimney and the stair. y0: where they sit. holes: openings in the floor, as {u0,u1,v0,v1}.
function joists({ y0, size, oc, u0, u1, spans, holes = [], name, kind = 'joist', mat = 'lumber', check, lv, at = 1, group }) {
  const d = inch(Wood.SIZES[size][1]), t = inch(1.5), out = [];
  for (const u of stations(u0 + t / 2, u1 - t / 2, oc)) {
    // each span: where the joist starts and ends, whether it laps its neighbour, and the span it bridges between supports
    spans.forEach(([va, vb, lap, bridge], si) => {
      const du = lap ? (si % 2 ? t / 2 : -t / 2) : 0, uc = Math.max(u0 + t / 2, Math.min(u1 - t / 2, u + du));
      let segs = [[va, vb]];
      for (const h of holes) if (uc > h.u0 && uc < h.u1) segs = segs.flatMap(([a, b]) => b <= h.v0 || a >= h.v1 ? [[a, b]] : [[a, h.v0], [h.v1, b]].filter(([x, y]) => y - x > 0.5));
      for (const [a, b] of segs) {
        const span = bridge ?? Math.abs(vb - va);
        out.push(add(kind, name, bx(uc - t / 2, uc + t / 2, a, b, y0, y0 + d), mat, { lb: boardLb(b - a, size), size: `${size}, ${Math.round(oc * 12)} in. apart`, check: check ? on => check(on, span) : null, lv, group }));
      }
    });
  }
  for (const h of holes) for (const vv of [h.v0, h.v1]) if (spans.some(([a, b]) => vv > Math.min(a, b) && vv < Math.max(a, b)))
    out.push(add('header', `${name}, doubled header`, bx(h.u0, h.u1, vv - (vv === h.v0 ? t * 2 : 0), vv + (vv === h.v1 ? t * 2 : 0), y0, y0 + d), mat, { lb: boardLb(h.u1 - h.u0, size) * 2, size: `two ${size}`, lv, group }));
  return out;
}
const STAIR = { u0: 24.3, u1: 33, v0: 9.2, v1: 15.2 }, CHIMH = { u0: CHIM.u0 - 0.25, u1: CHIM.u1 + 0.25, v0: CHIM.v0 - 0.25, v1: CHIM.v1 + 0.25 };
const joist1 = (on, span) => Wood.beam({ size: '2x10', span, w: L.floorDead + L.live, wLive: L.live });
step('Floor joists', 'Two by tens, 12 inches apart, from the sill to the girder and from the girder to the back, lapped where they meet. A rim joist closes the ends. Each one carries a strip of floor a foot wide and 14 feet long.');
for (const [u0, u1, v0] of [[0, 54, 0], [0, 54, 28 - inch(1.5)]]) add('rim joist', 'Rim joist, 2x10', bx(u0 + (v0 === 0 ? 0 : 0), v0 === 0 ? 33 : u1, v0, v0 + inch(1.5), SILL, SILL + inch(9.25)), 'lumber', { lb: boardLb(33, '2x10'), size: '2x10' });
add('rim joist', 'Rim joist, 2x10', bx(33, 54, 2, 2 + inch(1.5), SILL, SILL + inch(9.25)), 'lumber', { lb: boardLb(21, '2x10'), size: '2x10' });
const J1 = [
  ...joists({ y0: SILL, size: '2x10', oc: 1, u0: 0, u1: 33, spans: [[inch(1.5), 14 + inch(4), true, 14], [14 - inch(4), 28 - inch(1.5), true, 14]], holes: [CHIMH], name: 'Floor joist, 2x10', check: joist1, lv: 'deck1' }),
  ...joists({ y0: SILL, size: '2x10', oc: 1, u0: 33, u1: 54, spans: [[2 + inch(1.5), 14 + inch(4), true, 12], [14 - inch(4), 28 - inch(1.5), true, 14]], name: 'Floor joist, 2x10', check: joist1, lv: 'deck1' }),
];
// sheets of plywood, 4 by 8, long side across the joists, staggered, cut at the edges and round the openings
function deck({ y, areas, holes = [], name, lv, mat = 'ply', t = inch(0.75) }) {
  const out = [];
  for (const A of areas) for (let v = A.v0, r = 0; v < A.v1 - 0.01; v += 4, r++) for (let u = A.u0 - (r % 2 ? 4 : 0); u < A.u1 - 0.01; u += 8) {
    const a0 = Math.max(u, A.u0), a1 = Math.min(u + 8, A.u1), b0 = v, b1 = Math.min(v + 4, A.v1);
    if (a1 - a0 < 0.3) continue;
    const c = [(a0 + a1) / 2, (b0 + b1) / 2];
    if (holes.some(h => c[0] > h.u0 && c[0] < h.u1 && c[1] > h.v0 && c[1] < h.v1)) continue;
    out.push(add('plywood sheet', name, bx(a0 + 0.01, a1 - 0.01, b0 + 0.01, b1 - 0.01, y, y + t), mat, { lb: (a1 - a0) * (b1 - b0) * 2.2, lv }));
  }
  return out;
}
step('Subfloor', 'Plywood sheets, nailed down across the joists. Now there is a floor to stand on, and the cellar is in the dark.');
deck({ y: SILL + inch(9.25), areas: [{ u0: 0, u1: 33, v0: 0, v1: 28 }, { u0: 33, u1: 54, v0: 2, v1: 28 }], holes: [CHIMH], name: 'Subfloor, plywood', lv: 'deck1' });
// a pile of lumber and two sawhorses: the framing crew's yard, from now until the move-in
const YARD = [];
{
  const g = []; for (let i = 0; i < 6; i++) for (let k = 0; k < 9; k++) g.push(bx(64 + k * 0.48, 64 + k * 0.48 + 0.42, -14, -2, 0.3 + i * 0.32, 0.3 + i * 0.32 + 0.12));
  g.push(bx(63.6, 68.6, -12, -11.6, 0, 0.3), bx(63.6, 68.6, -4.4, -4, 0, 0.3));
  YARD.push(add('lumber pile', 'A delivery of lumber', merge(g), 'lumber', { site: true }));
  const h = []; for (const u of [70.5, 75.5]) { h.push(bx(u - 0.1, u + 0.1, -9, -1, 2.3, 2.6)); for (const [dv, du] of [[-8.6, -0.5], [-8.6, 0.5], [-1.4, -0.5], [-1.4, 0.5]]) h.push(bx(u + du - 0.06, u + du + 0.06, dv - 0.06, dv + 0.06, 0, 2.3)); }
  h.push(bx(69.8, 76.2, -5.6, -4.6, 2.6, 2.75));
  YARD.push(add('sawhorse', 'Sawhorses and a plank', merge(h), 'lumber', { site: true }));
}

step('Cellar floor', 'With the deck on, the cellar floor is poured: 4 inches of concrete on gravel, round the columns, troweled smooth. The cellar is dry, closed and a little under 7 1/2 feet high under the girder.');
add('cellar floor', 'Cellar floor, 4 inch slab', bx(FW, 54 - FW, FW, 28 - FW, CELLAR, CELLAR + inch(4)), 'concrete', { lb: 52 * 26 * 0.33 * 150 });
add('cellar floor', 'Cellar floor, 4 inch slab', bx(33, 54 - FW, 2 + FW, FW + 2, CELLAR, CELLAR + inch(4)), 'concrete', { lb: 10 });

// ---------- Walls ----------
// A framed wall on a floor: plates, studs every 16 inches, a doubled header over each opening with short cripple
// studs above and below. axis 'u' runs along the house (front and back walls), 'v' across it (the ends). at: the
// wall's outside line; inward: +1 or -1 toward the inside. top: a height, or a function of the position along the
// wall, for a gable. openings: {a0, a1, y0, y1} in the wall's own position and height.
function wall({ axis, at, inward, a0, a1, y0, top, openings = [], name, studCheck, lv, thick = 3.5, header = true }) {
  const t = inch(thick), out = [], P = inch(1.5), topAt = typeof top === 'function' ? top : () => top;
  const B = (s0, s1, y_0, y_1) => axis === 'u' ? bx(s0, s1, at, at + inward * t, y_0, y_1) : bx(at, at + inward * t, s0, s1, y_0, y_1);
  const flatTop = typeof top !== 'function';
  // plates
  const gaps = openings.filter(o => o.y0 <= y0 + 0.2).map(o => [o.a0, o.a1]).sort((a, b) => a[0] - b[0]);
  let s = a0; for (const [g0, g1] of [...gaps, [a1, a1]]) { if (g0 - s > 0.2) out.push(add('plate', `${name}, bottom plate`, B(s, g0, y0, y0 + P), 'lumber', { lb: boardLb(g0 - s, '2x4'), size: '2x4', lv })); s = g1; }
  if (flatTop) out.push(add('plate', `${name}, double top plate`, B(a0, a1, top - 2 * P, top), 'lumber', { lb: boardLb(a1 - a0, '2x4') * 2, size: 'two 2x4', lv }));
  // studs, with king and jack studs beside each opening
  const posts = new Set(), studs = [];
  for (let x = a0; x < a1 - P / 2; x += 16 / 12) studs.push(x);
  studs.push(a1 - P);
  for (const o of openings) { studs.push(o.a0 - 2 * P, o.a0 - P, o.a1, o.a1 + P); }
  const ok = x => x >= a0 - 1e-6 && x <= a1 - P + 1e-6;
  for (const x of [...new Set(studs.map(x => Math.round(x * 1000) / 1000))].filter(ok).sort((a, b) => a - b)) {
    const top0 = flatTop ? top - 2 * P : Math.min(topAt(x), topAt(x + P));
    const o = openings.find(o => x + P > o.a0 + 1e-6 && x < o.a1 - 1e-6);
    const tall = top0 - (y0 + P);
    if (!o) {
      const jack = openings.find(o => Math.abs(x - (o.a0 - P)) < 1e-3 || Math.abs(x - o.a1) < 1e-3);
      const yTop = jack ? jack.y1 : top0;
      if (yTop - y0 - P > 0.2) out.push(add('stud', jack ? `${name}, jack stud` : `${name}, stud`, B(x, x + P, y0 + P, yTop), 'lumber', { lb: boardLb(yTop - y0, '2x4'), size: '2x4, 16 in. apart', lv,
        check: studCheck && !jack ? on => Wood.post({ size: '2x4', height: tall, P: studCheck(on) * 16 / 12, duration: on.deck2 || on.deck1 ? 'floor' : roofTop(on).dur }) : null }));
      posts.add(x);
    } else {
      if (o.y0 > y0 + 0.4) out.push(add('stud', `${name}, cripple stud`, B(x, x + P, y0 + P, o.y0 - P), 'lumber', { lb: boardLb(o.y0 - y0, '2x4'), size: '2x4', lv }));
      const hy = o.y1 + inch(header ? 9.25 : 3.5);
      if (top0 - hy > 0.15) out.push(add('stud', `${name}, cripple stud`, B(x, x + P, hy, top0), 'lumber', { lb: boardLb(top0 - hy, '2x4'), size: '2x4', lv }));
    }
  }
  for (const o of openings) {
    out.push(add('header', `${name}, header over an opening`, B(o.a0 - P, o.a1 + P, o.y1, o.y1 + inch(header ? 9.25 : 3.5)), 'lumber', { lb: boardLb(o.a1 - o.a0 + 2 * P, '2x10') * 2, size: header ? 'two 2x10 on edge' : '2x4', lv }));
    if (o.y0 > y0 + 0.4) out.push(add('plate', `${name}, rough sill`, B(o.a0, o.a1, o.y0 - P, o.y0), 'lumber', { lb: boardLb(o.a1 - o.a0, '2x4'), size: '2x4', lv }));
  }
  return out;
}

// ---------- Windows and doors, from the plans and the elevations ----------
// double-hung windows, 2'-9" by 4'-4", heads 6'-10" above the floor; a = the window's middle along its wall
const WIN = (a, f, o = {}) => ({ a, w: o.w || 2.75, y0: f + (o.sill || 2.5), y1: f + (o.head || 6.83), lights: o.lights || [3, 2], kind: o.kind || 'window', name: o.name || 'Window' });
const FACES = {
  front1: { axis: 'u', at: 0, inward: 1, items: [WIN(6.25, F1), WIN(12.25, F1), WIN(18.25, F1), { a: 27.25, w: 4.7, y0: F1, y1: F1 + 6.83, kind: 'front door', name: 'Front door' }] },
  front2: { axis: 'u', at: 0, inward: 1, items: [WIN(6.25, F2), WIN(12.25, F2), WIN(18.25, F2), WIN(27.25, F2)] },
  wingfront: { axis: 'u', at: 2, inward: 1, items: [WIN(38, F1, { w: 2, sill: 3.5, lights: [2, 2], name: 'Lavatory window' }), WIN(45.8, F1, { name: 'Den window' }), WIN(48.7, F1, { name: 'Den window' })] },
  // the back, from the plans and from photographs of the back: a wide two-pane window over the sink and another in the
  // dinette, a back door with a full-glass storm door, double-hung windows either side of the family room chimney
  back1: { axis: 'u', at: 28, inward: -1, items: [{ a: 7.6, w: 5, y0: F1, y1: F1 + 6.83, kind: 'french doors', name: 'French doors to the porch' }, WIN(20.1, F1, { w: 5, sill: 3.4, kind: 'slider', name: 'Window over the sink' }), { a: 27.5, w: 3, y0: F1, y1: F1 + 6.83, kind: 'storm door', name: 'Back door' }, WIN(31.8, F1, { w: 4, sill: 2.4, kind: 'slider', name: 'Dinette window' }), WIN(38.2, F1, { name: 'Family room window' }), WIN(48.4, F1, { name: 'Family room window' })] },
  back2: { axis: 'u', at: 28, inward: -1, items: [WIN(4.2, F2), WIN(13.1, F2), WIN(23.7, F2, { w: 2.4, sill: 3.2, name: 'Bathroom window' }), WIN(30.3, F2, { w: 2.4, sill: 3.2, name: 'Bathroom window' }), WIN(38.2, F2), WIN(48.4, F2)] },
  west1: { axis: 'v', at: 0, inward: 1, items: [WIN(7.3, F1), WIN(22.8, F1)] },
  west2: { axis: 'v', at: 0, inward: 1, items: [WIN(8.3, F2), WIN(21.2, F2)] },
  east1: { axis: 'v', at: 54, inward: -1, items: [WIN(6.5, F1, { name: 'Den window' }), { a: 21.5, w: 2.67, y0: F1, y1: F1 + 6.67, kind: 'door', name: 'Door to the breezeway' }] },
  east2: { axis: 'v', at: 54, inward: -1, items: [WIN(19.7, F2)] },
};
const open = f => FACES[f].items.map(i => ({ a0: i.a - i.w / 2 - 0.08, a1: i.a + i.w / 2 + 0.08, y0: i.y0 - 0.05, y1: i.y1 + 0.05 }));

// ---------- Bag 4: first floor walls ----------
bag('First floor walls');
step('Outside walls', 'The walls are framed flat on the deck, studs 16 inches apart, a doubled 2x10 header over every window and door, then stood up, plumbed and braced. The long walls will carry half the roof and half the second floor.');
const studFront1 = on => wallLine(on, { roof: 15, ceiling: 7, floor2: 7, walls2: true });
const studWing1 = on => wallLine(on, { roof: 14, roofKey: 'roofW' });
const studWingBack1 = on => wallLine(on, { roof: 14, ceiling: 8, floor2: 7, walls2: true, roofKey: 'roofW' });
const W1 = [
  ...wall({ axis: 'u', at: 0, inward: 1, a0: 0, a1: 33, y0: F1, top: P1, openings: open('front1'), name: 'Front wall', studCheck: studFront1, lv: 'walls1' }),
  ...wall({ axis: 'v', at: 33, inward: -1, a0: 0, a1: 2 + inch(3.5), y0: F1, top: P1, name: 'Wall at the jog', lv: 'walls1' }),
  ...wall({ axis: 'u', at: 2, inward: 1, a0: 33, a1: 54, y0: F1, top: P1, openings: open('wingfront'), name: 'Wing front wall', studCheck: studWing1, lv: 'walls1' }),
  ...wall({ axis: 'u', at: 28, inward: -1, a0: 0, a1: 54, y0: F1, top: P1, openings: [...open('back1'), { a0: FRCH.u0, a1: FRCH.u1, y0: F1, y1: F1 + 5 }], name: 'Back wall', studCheck: studWingBack1, lv: 'walls1' }),
  ...wall({ axis: 'v', at: 0, inward: 1, a0: inch(3.5), a1: 28 - inch(3.5), y0: F1, top: P1, openings: open('west1'), name: 'West wall', studCheck: () => 0, lv: 'walls1' }),
  ...wall({ axis: 'v', at: 54, inward: -1, a0: 2 + inch(3.5), a1: 28 - inch(3.5), y0: F1, top: P1, openings: open('east1'), name: 'East wall', studCheck: () => 0, lv: 'walls1' }),
];
step('The bearing wall and the rooms', 'Down the middle, over the girder, runs the bearing wall that will hold up the second floor. Then the partitions: living room, dining room, kitchen and dinette, family room, the den, the foyer and the lavatory.');
const studMid1 = on => wallLine(on, { ceiling: 14, floor2: 14, walls2: true });
const PART1 = [
  [0.3, 12.2, 'v', 14, [[3, 6]]], [16.8, 53.7, 'v', 14, [[25.4, 28.4], [36.8, 39.6], [45, 47.8]]],
  [0.3, 13.8, 'u', 24, [[5, 9.5]]], [14.2, 27.7, 'u', 14, [[20, 23]]], [14.2, 27.7, 'u', 36, [[16.5, 19.5]]],
  [2.3, 13.8, 'u', 33, [[10, 12.6]]], [2.3, 13.8, 'u', 41.8, [[10.8, 13.4]]], [33.2, 41.6, 'v', 8.5, [[36, 38.6]]],
];
for (const [a0, a1, ax, at, doors] of PART1) {
  const bearing = ax === 'v' && at === 14;
  wall({ axis: ax === 'v' ? 'u' : 'v', at: at - inch(1.75), inward: 1, a0, a1, y0: F1, top: P1, openings: doors.map(([d0, d1]) => ({ a0: d0, a1: d1, y0: F1, y1: F1 + 6.83 })), name: bearing ? 'Bearing wall' : 'Partition', studCheck: bearing ? studMid1 : null, lv: 'walls1', header: bearing });
}
// sheathing and, later, siding: one panel per face, with the openings cut out
function panel(face, kind, name, mat, { a0, a1, y0, y1, profile, off = 0, t = inch(0.5), holes = true, extra = [] }) {
  const F_ = FACES[face] || { axis: face[0], at: face[1], inward: face[2], items: [] }, pts = profile || R(a0, a1, y0, y1);
  const hs = holes ? [...F_.items.filter(i => i.y0 < Math.max(...pts.map(p => p[1])) && i.y1 > Math.min(...pts.map(p => p[1])) && i.a > Math.min(...pts.map(p => p[0])) && i.a < Math.max(...pts.map(p => p[0]))).map(i => R(i.a - i.w / 2, i.a + i.w / 2, i.y0, i.y1).reverse()), ...extra] : extra;
  const o0 = F_.at - F_.inward * off, o1 = o0 - F_.inward * t;
  const geo = F_.axis === 'u' ? uy(pts, Math.min(o0, o1), Math.max(o0, o1), hs) : vy(pts, Math.min(o0, o1), Math.max(o0, o1), hs);
  return add(kind, name, geo, mat, { uv: true });
}
step('Sheathing', 'Plywood sheathing over the studs ties each wall into one stiff panel that will not rack, and the window and door holes are cut out with a saw.');
const SH1 = [
  panel('front1', 'sheathing', 'Sheathing, front', 'ply', { a0: 0, a1: 33, y0: T, y1: P1 }), panel('wingfront', 'sheathing', 'Sheathing, wing front', 'ply', { a0: 33, a1: 54, y0: T, y1: P1 }),
  panel('back1', 'sheathing', 'Sheathing, back', 'ply', { a0: 0, a1: 54, y0: T, y1: P1, extra: [R(FRCH.u0, FRCH.u1, F1, F1 + 5).reverse()] }),
  panel('west1', 'sheathing', 'Sheathing, west', 'ply', { a0: 0, a1: 28, y0: T, y1: P1 }), panel('east1', 'sheathing', 'Sheathing, east', 'ply', { a0: 2, a1: 28, y0: T, y1: P1 }),
  panel(['v', 33, 1], 'sheathing', 'Sheathing, jog', 'ply', { a0: 0, a1: 2, y0: T, y1: P1, holes: false }),
];

// ---------- Bag 5: second floor ----------
bag('Second floor');
const joist2 = (on, span) => Wood.beam({ size: '2x10', span, w: L.floorDead + L.sleeping, wLive: L.sleeping });
step('Second floor joists', 'Two by tens again, 12 inches apart, from the outside walls to the bearing wall, with an opening framed for the stair and another for the chimney. Bedrooms are designed for 30 pounds on every square foot, living rooms for 40.');
add('rim joist', 'Rim joist, 2x10', bx(0, 33, 0, inch(1.5), P1, P1 + inch(9.25)), 'lumber', { lb: boardLb(33, '2x10'), lv: 'deck2' });
add('rim joist', 'Rim joist, 2x10', bx(0, 54, 28 - inch(1.5), 28, P1, P1 + inch(9.25)), 'lumber', { lb: boardLb(54, '2x10'), lv: 'deck2' });
add('rim joist', 'Rim joist, 2x10', bx(33, 54, 2, 2 + inch(1.5), P1, P1 + inch(9.25)), 'lumber', { lb: boardLb(21, '2x10'), lv: 'deck2' });
joists({ y0: P1, size: '2x10', oc: 1, u0: 0, u1: 33, spans: [[inch(1.5), 14 + inch(4), true, 14], [14 - inch(4), 28 - inch(1.5), true, 14]], holes: [CHIMH, STAIR], name: 'Floor joist, 2x10', check: joist2, lv: 'deck2' });
joists({ y0: P1, size: '2x10', oc: 1, u0: 33, u1: 54, spans: [[2 + inch(1.5), 14 + inch(4), true, 12], [14 - inch(4), 28 - inch(1.5), true, 14]], name: 'Floor joist, 2x10', check: joist2, lv: 'deck2' });
step('Second floor deck', 'Plywood again, and now the second floor is a platform to frame the upper walls on.');
deck({ y: P1 + inch(9.25), areas: [{ u0: 0, u1: 33, v0: 0, v1: 28 }, { u0: 33, u1: 54, v0: 2, v1: 28 }], holes: [CHIMH, STAIR], name: 'Subfloor, plywood', lv: 'deck2' });

step('Upper walls', 'The main block gets a full second storey. The wing does not: its front roof comes down to the first floor, so its bedroom has a short knee wall at the front and a full wall only at the back.');
const studFront2 = on => wallLine(on, { roof: 15, ceiling: 7 });
const wingRoofY = v => v <= WRV ? P1 + (v - 2) * WF : P2 + (28 - v) * WB;   // the underside of the wing's rafters at its walls
const KNEE = 8.75;
wall({ axis: 'u', at: 0, inward: 1, a0: 0, a1: 33, y0: F2, top: P2, openings: open('front2'), name: 'Front wall, upstairs', studCheck: studFront2, lv: 'walls2' });
wall({ axis: 'u', at: 28, inward: -1, a0: 0, a1: 54, y0: F2, top: P2, openings: open('back2'), name: 'Back wall, upstairs', studCheck: on => wallLine(on, { roof: 15, ceiling: 7, roofKey: 'roofM' }), lv: 'walls2' });
wall({ axis: 'v', at: 0, inward: 1, a0: inch(3.5), a1: 28 - inch(3.5), y0: F2, top: P2, openings: open('west2'), name: 'West wall, upstairs', studCheck: () => 0, lv: 'walls2' });
wall({ axis: 'v', at: 33, inward: -1, a0: inch(3.5), a1: 28 - inch(3.5), y0: F2, top: P2, name: 'East wall of the main block, upstairs', lv: 'walls2' });
wall({ axis: 'u', at: KNEE, inward: 1, a0: 33 + inch(3.5), a1: 54 - inch(3.5), y0: F2, top: wingRoofY(KNEE) - 0.05, name: 'Knee wall', lv: 'walls2' });
wall({ axis: 'v', at: 54, inward: -1, a0: 2.95, a1: 28 - inch(3.5), y0: F2, top: v => wingRoofY(v) - 0.02, openings: open('east2'), name: 'Wing end wall, upstairs', lv: 'walls2' });
step('Bedrooms and baths', 'Four bedrooms, two baths and the hall, with the bearing wall again down the middle of the main block.');
const studMid2 = on => wallLine(on, { ceiling: 14 });
for (const [a0, a1, ax, at, doors] of [[0.3, 16.6, 'v', 14, []], [0.3, 27.7, 'u', 16.8, [[10.5, 13.1], [15.2, 17.8]]], [17, 24.2, 'v', 9, [[20.4, 23]]], [17, 32.8, 'v', 19, [[19.6, 22.2], [28.4, 31]]], [19.2, 27.7, 'u', 27, []], [9.3, 27.7, 'u', 33.2, [[16, 18.6]]]]) {
  const bearing = ax === 'v' && at === 14;
  wall({ axis: ax === 'v' ? 'u' : 'v', at: at - inch(1.75), inward: 1, a0, a1, y0: F2, top: P2, openings: doors.map(([d0, d1]) => ({ a0: d0, a1: d1, y0: F2, y1: F2 + 6.83 })), name: bearing ? 'Bearing wall, upstairs' : 'Partition', studCheck: bearing ? studMid2 : null, lv: 'walls2', header: bearing });
}
// the stair: up from the foyer to a landing, and back to the upstairs hall; the cellar stair under it
step('Stairs', 'A U-shaped stair from the foyer: seven risers up to a landing at the back, six more to the hall. The cellar stair runs down underneath it.');
{
  const rise = (F2 - F1) / 13, run = inch(10), g = [], tr = inch(1);
  for (let i = 0; i < 6; i++) { const u = STAIR.u0 + 0.3 + i * run; g.push(bx(u, u + run + 0.08, 9.4, 12.2, F1 + (i + 1) * rise - tr, F1 + (i + 1) * rise)); }
  g.push(bx(STAIR.u0 + 0.3 + 6 * run, 32.7, 9.4, 15, F1 + 7 * rise - tr, F1 + 7 * rise));
  for (let i = 0; i < 6; i++) { const u = STAIR.u0 + 0.3 + 6 * run - (i + 1) * run; g.push(bx(u, u + run + 0.08, 12.4, 15, F1 + (8 + i) * rise - tr, F1 + (8 + i) * rise)); }
  add('stair', 'Stair treads, foyer to the hall', merge(g), 'oak', { lb: 400 });
  const str = (v0, uA, yA, uB, yB) => uy(slopeBoard(uA, yA, uB, yB, 9.25), v0, v0 + inch(1.5));
  add('stringer', 'Stair stringers', merge([str(9.4, STAIR.u0 + 0.3, F1 - 0.6, STAIR.u0 + 0.3 + 6 * run, F1 + 7 * rise - 0.6), str(12.05, STAIR.u0 + 0.3, F1 - 0.6, STAIR.u0 + 0.3 + 6 * run, F1 + 7 * rise - 0.6), str(12.4, STAIR.u0 + 0.3, F2 - 0.6, STAIR.u0 + 0.3 + 6 * run, F1 + 7 * rise - 0.6), str(14.85, STAIR.u0 + 0.3, F2 - 0.6, STAIR.u0 + 0.3 + 6 * run, F1 + 7 * rise - 0.6)]), 'lumber', { lb: 160 });
  const cr = (F1 - CELLAR) / 11, cg = [];
  for (let i = 0; i < 11; i++) { const u = 31 - (i + 1) * run; cg.push(bx(u, u + run + 0.05, 12.4, 15, F1 - (i + 1) * cr - tr, F1 - (i + 1) * cr)); }
  add('stair', 'Cellar stair', merge(cg), 'lumber', { lb: 200 });
}
step('Sheathing upstairs', 'The upper walls are sheathed the same way, and the house is a box with a floor on top.');
panel('front2', 'sheathing', 'Sheathing, front, upstairs', 'ply', { a0: 0, a1: 33, y0: P1, y1: P2 });
panel('back2', 'sheathing', 'Sheathing, back, upstairs', 'ply', { a0: 0, a1: 54, y0: P1, y1: P2 });
panel('west2', 'sheathing', 'Sheathing, west, upstairs', 'ply', { a0: 0, a1: 28, y0: P1, y1: P2 });
panel('east2', 'sheathing', 'Sheathing, wing end, upstairs', 'ply', { profile: [[2, P1], [28, P1], [28, P2], [WRV, WRIDGE], [2, P1 + 0.05]] });

// ---------- Bag 6: the roof ----------
bag('Roof');
const ceilJ = (on, span) => Wood.beam({ size: '2x8', span, w: (L.ceilingDead + L.attic) * 16 / 12, wLive: L.attic * 16 / 12, limit: 240 });
step('Ceiling joists', 'Two by eights, 16 inches apart, across the tops of the upstairs walls. They hold the ceilings, and they also tie the bottoms of the rafters together so the roof cannot spread the walls apart.');
joists({ y0: P2, size: '2x8', oc: 16 / 12, u0: inch(1.5), u1: 33 - inch(1.5), spans: [[0.05, 14 + inch(4), true, 14], [14 - inch(4), 27.95, true, 14]], holes: [CHIMH], name: 'Ceiling joist, 2x8', check: ceilJ, lv: 'ceil', group: 'roof' });
joists({ y0: P2, size: '2x8', oc: 16 / 12, u0: 33 + inch(1.5), u1: 54 - inch(1.5), spans: [[12, 28.3, false, 16]], name: 'Ceiling joist, 2x8', check: ceilJ, lv: 'ceil', group: 'roof' });

// rafters: the underside of each sits on the outside edge of a wall plate and climbs at the roof's pitch to the ridge
const rafterCheck = (size, span) => on => { const r = roofTop(on), oc = 16 / 12; return Wood.beam({ size, span, w: r.psf * oc, wLive: r.live * oc, duration: r.dur, limit: 180 }); };
function rafters({ u0, u1, oc = 16 / 12, front, back, ridge, name, size = '2x8', lv, assumed = false, group = 'roof', ridgeSize = '2x10' }) {
  // front, back: [vWall, yWall, pitch, overhang]
  const out = [], t = inch(1.5), [rv, ry] = ridge, d = inch(Wood.SIZES[size][1]);
  for (const u of stations(u0 + t / 2, u1 - t / 2, oc)) {
    for (const [side, [vw, yw, p, oh, sz = size]] of [[-1, front], [1, back]]) {
      const sgn = vw < rv ? 1 : -1, va = vw - sgn * oh, ya = yw - oh * p, vb = rv - sgn * t / 2, yb = yw + Math.abs(vb - vw) * p;
      const pts = sgn > 0 ? slopeBoard(va, ya, vb, yb, Wood.SIZES[sz][1]) : slopeBoard(vb, yb, va, ya, Wood.SIZES[sz][1]);
      const span = Math.abs(rv - vw);
      out.push(add('rafter', `${name}, ${sz}`, vy(pts, u - t / 2, u + t / 2), 'lumber', { lb: boardLb(Math.hypot(va - vb, ya - yb), sz), size: `${sz}, 16 in. apart${assumed ? ' (assumed)' : ''}`, assumed, check: rafterCheck(sz, span), lv, group }));
    }
  }
  const dv = inch(Wood.SIZES[size][1]) / Math.cos(Math.atan(front[2]));
  out.push(add('ridge board', `Ridge board, ${ridgeSize}`, bx(u0, u1, rv - t / 2, rv + t / 2, ry + dv - inch(Wood.SIZES[ridgeSize][1]), ry + dv), 'lumber', { lb: boardLb(u1 - u0, ridgeSize), size: ridgeSize, lv, group }));
  return out;
}
const S_RAFT = step('Ridge and rafters', 'A 2x10 ridge board goes up on temporary posts, and the rafters are cut to a pattern: a notch where they sit on the wall, a plumb cut at the ridge. Two by eights, 16 inches apart, 8 in 12, a foot of overhang at the eaves.');
const MAINR = rafters({ u0: -0.35, u1: 33.15, front: [0, P2, PITCH, 1], back: [28, P2, PITCH, 1], ridge: [14, RIDGE], name: 'Rafter', lv: 'roofM' });
step('Collar ties and gables', 'A 2x6 collar tie joins every pair of rafters high up, and the gable ends are framed with studs cut to the slope, with a louvered vent near the top of each for the attic.');
const roofY = v => v <= 14 ? P2 + v * PITCH : P2 + (28 - v) * PITCH;
// a collar tie runs from the top edge of one rafter to the other's, just under the sheathing
const tieAcross = (y, vFront, pF, yF, vBack, pB, yB) => [vFront + (y + inch(5.5) - yF - dv8(pF)) / pF + 0.05, vBack - (y + inch(5.5) - yB - dv8(pB)) / pB - 0.05];
{ const y = RIDGE - 3.2, [a, b] = tieAcross(y, 0, PITCH, P2, 28, PITCH, P2);
  for (let u = 0.6; u < 33; u += 32 / 12) add('collar tie', 'Collar tie, 2x6', bx(u, u + inch(1.5), a, b, y, y + inch(5.5)), 'lumber', { lb: boardLb(b - a, '2x6'), size: '2x6', group: 'roof', lv: 'roofM' }); }
const VENT = 2.6;
for (const [n, at, inward] of [['West gable', 0, 1], ['East gable', 33, -1]])
  wall({ axis: 'v', at, inward, a0: 0.2, a1: 27.8, y0: P2, top: v => roofY(v) - 0.05, openings: [{ a0: 14 - 1.1, a1: 14 + 1.1, y0: RIDGE - 4.6, y1: RIDGE - 4.6 + VENT }], name: n, lv: 'roofM', header: false });
step('The wing\'s roof', 'The wing\'s roof is lopsided: steep, 10.7 in 12, down to the one-storey front, and shallow, 4 in 12, down to the two-storey back. So its ridge sits a foot and a half behind the middle, and the front reads as a Cape from the street.');
const WINGR = rafters({ u0: 33.1, u1: 54.35, front: [2, P1, WF, 1], back: [28, P2, WB, 1], ridge: [WRV, WRIDGE], name: 'Wing rafter', lv: 'roofW' });
{ const y = WRIDGE - 2.5, [a, b] = tieAcross(y, 2, WF, P1, 28, WB, P2);
  for (let u = 34; u < 54; u += 32 / 12) add('collar tie', 'Collar tie, 2x6', bx(u, u + inch(1.5), a, b, y, y + inch(5.5)), 'lumber', { lb: boardLb(b - a, '2x6'), size: '2x6', group: 'roof', lv: 'roofW' }); }
// the main block's east wall shows above the wing's roof: a gable over its front corner and its upper storey

// ---------- Bag 7: the garage ----------
bag('Garage');
step('Garage slab and walls', 'A 4 inch slab inside the frost walls, then 2x4 walls: two 9 by 7 foot openings for overhead doors in front, a window at the far end, and the breezeway between the garage and the house, with a door to the front and one to the back.');
add('slab', 'Garage floor, 4 inch slab', bx(GAR.u0 + GW, GAR.u1 - GW, GAR.v0 + GW, GAR.v1 - GW, 0, GSLAB), 'concrete', { lb: 22.7 * 22.7 * 0.33 * 150 });
add('slab', 'Breezeway floor', bx(54, GAR.u0, GAR.v0 + GW, 28 - GW, 0, GSLAB), 'concrete', { lb: 4 * 11 * 0.33 * 150 });
FACES.garfront = { axis: 'u', at: GAR.v0, inward: 1, items: [{ a: 54 + 1.75, w: 2.67, y0: GSLAB, y1: GSLAB + 6.67, kind: 'door', name: 'Breezeway door' }, { a: GAR.u0 + 2 + 4.5, w: 9, y0: GSLAB, y1: GSLAB + 7, kind: 'garage door', name: 'Overhead door' }, { a: GAR.u0 + 13 + 4.5, w: 9, y0: GSLAB, y1: GSLAB + 7, kind: 'garage door', name: 'Overhead door' }] };
FACES.garback = { axis: 'u', at: 28, inward: -1, items: [{ a: 54 + 1.9, w: 2.67, y0: GSLAB, y1: GSLAB + 6.67, kind: 'door', name: 'Breezeway back door', red: true }] };
FACES.gareast = { axis: 'v', at: GAR.u1, inward: -1, items: [WIN(27.5, GSLAB + 0.6, { name: 'Garage window' })] };
const garRoof = on => wallLine(on, { roof: 13, roofKey: 'roofG' });
wall({ axis: 'u', at: GAR.v0, inward: 1, a0: 54.1, a1: GAR.u1, y0: GSLAB, top: GP, openings: open('garfront'), name: 'Garage front wall', lv: 'wallsG' });
wall({ axis: 'u', at: GAR.v1, inward: -1, a0: GAR.u0, a1: GAR.u1, y0: GSLAB, top: GP, name: 'Garage back wall', studCheck: garRoof, lv: 'wallsG' });
wall({ axis: 'v', at: GAR.u1, inward: -1, a0: GAR.v0 + inch(3.5), a1: GAR.v1 - inch(3.5), y0: GSLAB, top: GP, openings: open('gareast'), name: 'Garage end wall', lv: 'wallsG' });
wall({ axis: 'v', at: GAR.u0, inward: 1, a0: GAR.v0 + inch(3.5), a1: GAR.v1 - inch(3.5), y0: GSLAB, top: GP, openings: [{ a0: 20, a1: 22.7, y0: GSLAB, y1: GSLAB + 6.67 }], name: 'Wall between the garage and the breezeway', lv: 'wallsG' });
wall({ axis: 'u', at: 28, inward: -1, a0: 54, a1: GAR.u0, y0: GSLAB, top: GP, openings: open('garback'), name: 'Breezeway back wall', lv: 'wallsG' });
// a post and a beam carry the roof's back edge across the open corner behind the breezeway
add('post', 'Post, 6x6, painted', bx(54.15, 54.6, GAR.v1 - 0.55, GAR.v1 - 0.1, GSLAB, GP - inch(9.25)), 'trim', { lb: 60, size: '6x6' });
add('beam', 'Beam, two 2x10', bx(54, GAR.u0 + 0.3, GAR.v1 - 0.4, GAR.v1 - 0.1, GP - inch(9.25), GP), 'lumber', { lb: 60, size: 'two 2x10' });
step('Garage roof', 'The garage roof is lopsided too, 8 in 12 in front and 4 in 12 behind, and it runs on over the breezeway to the house. Rafter ties every four feet keep its walls from spreading. The drawings do not size the garage\'s rafters: 2x8 in front and 2x10 for the long back slope are the usual choice, shown here.');
rafters({ u0: 54.1, u1: GAR.u1 + 0.35, front: [GAR.v0, GP, PITCH, 1], back: [GAR.v1, GP, WB, 1, '2x10'], ridge: [GRV, GRIDGE], name: 'Garage rafter', size: '2x8', lv: 'roofG', assumed: true });
for (let u = 58.5; u < GAR.u1; u += 4) add('rafter tie', 'Rafter tie, 2x6', bx(u, u + inch(1.5), GAR.v0, GAR.v1, GP, GP + inch(5.5)), 'lumber', { lb: boardLb(24, '2x6'), size: '2x6', group: 'roof' });

// ---------- Bag 8: close it in ----------
bag('Close it in');
// roof planes, each a slab on top of its rafters: sheathing first, shingles on it, snow on those in 1978
function plane({ v0, y0, v1, y1, u0, u1, lift, t, pitch }) {
  const c = Math.cos(Math.atan(pitch)), up = lift / c, dt = t / c;
  return [[v0, y0 + up], [v1, y1 + up], [v1, y1 + up + dt], [v0, y0 + up + dt]];
}
const ROOFS = [];   // every roof plane: its outline and its rafters' depth, for the sheathing, the shingles and the snow
ROOFS.push({ n: 'Main roof, front', u0: -0.5, u1: 33.3, va: -1, ya: P2 - PITCH + dv8(PITCH), vb: 14, yb: RIDGE + dv8(PITCH), pitch: PITCH, lv: 'roofM' });
ROOFS.push({ n: 'Main roof, back', u0: -0.5, u1: 33.3, va: 29, ya: P2 - PITCH + dv8(PITCH), vb: 14, yb: RIDGE + dv8(PITCH), pitch: PITCH, lv: 'roofM' });
ROOFS.push({ n: 'Wing roof, front', u0: 33.1, u1: 54.5, va: 1, ya: P1 - WF + dv8(WF), vb: WRV, yb: WRIDGE + dv8(WF), pitch: WF, lv: 'roofW' });
ROOFS.push({ n: 'Wing roof, back', u0: 33.1, u1: 54.5, va: 29, ya: P2 - WB + inch(7.25) / Math.cos(Math.atan(WB)), vb: WRV, yb: WRIDGE + dv8(WF), pitch: WB, lv: 'roofW' });
ROOFS.push({ n: 'Garage roof, front', u0: 54.1, u1: GAR.u1 + 0.5, va: GAR.v0 - 1, ya: GP - PITCH + dv8(PITCH), vb: GRV, yb: GRIDGE + dv8(PITCH), pitch: PITCH, lv: 'roofG' });
ROOFS.push({ n: 'Garage roof, back', u0: 54.1, u1: GAR.u1 + 0.5, va: GAR.v1 + 1, ya: GP - WB + inch(9.25) / Math.cos(Math.atan(WB)), vb: GRV, yb: GRIDGE + dv8(PITCH), pitch: WB, lv: 'roofG' });
const roofSlab = (Rf, lift, t, u0 = Rf.u0, u1 = Rf.u1, f0 = 0, f1 = 1) => {
  const va = Rf.va + (Rf.vb - Rf.va) * f0, vb = Rf.va + (Rf.vb - Rf.va) * f1, ya = Rf.ya + (Rf.yb - Rf.ya) * f0, yb = Rf.ya + (Rf.yb - Rf.ya) * f1;
  return vy(plane({ v0: va, y0: ya, v1: vb, y1: yb, lift, t, pitch: Rf.pitch }), u0, u1);
};
step('Roof sheathing', 'Plywood on the rafters, row by row from the eaves up, with a gap at each joint for the wood to swell.');
for (const Rf of ROOFS) {
  const len = Math.hypot(Rf.vb - Rf.va, Rf.yb - Rf.ya), rows = Math.ceil(len / 4);
  for (let r = 0; r < rows; r++) for (let u = Rf.u0 - (r % 2 ? 4 : 0); u < Rf.u1 - 0.05; u += 8) {
    const a0 = Math.max(u, Rf.u0), a1 = Math.min(u + 8, Rf.u1); if (a1 - a0 < 0.3) continue;
    add('plywood sheet', `Roof sheathing, ${Rf.n.toLowerCase()}`, roofSlab(Rf, 0, inch(0.5), a0 + 0.01, a1 - 0.01, r / rows, Math.min(1, (r + 1) / rows) - 0.003), 'ply', { lb: (a1 - a0) * 4 * 1.5, group: 'roof', lv: Rf.lv });
  }
}
step('Shingles', 'Felt paper, then asphalt shingles, three tabs to a strip, five inches to the weather, nailed from the eaves to the ridge, with a cap over the ridge.');
for (const Rf of ROOFS) add('roofing', `Shingles, ${Rf.n.toLowerCase()}`, roofSlab(Rf, inch(0.5), inch(0.4)), 'roofing', { lb: (Rf.u1 - Rf.u0) * Math.hypot(Rf.vb - Rf.va, Rf.yb - Rf.ya) * 2.3, group: 'roof', slope: 1 / Math.cos(Math.atan(Rf.pitch)), uv: true, lv: Rf.lv });

// chimneys: brick, built up in lifts from the cellar slab and the fireplace slab, a fireplace in each
step('Chimneys', 'The masons build the chimneys: one up through the middle of the house from the cellar, for the living room fireplace and the furnace, and one on the outside of the back wall for the family room. Each top stands well above the roof near it.');
const CTOP = RIDGE + 3.4;
for (let y = CELLAR, k = 0; y < CTOP - 0.01; y += 3.2, k++) add('chimney', `Chimney, lift ${k + 1}`, bx(CHIM.u0, CHIM.u1, CHIM.v0, CHIM.v1, y, Math.min(CTOP, y + 3.2)), 'brick', { lb: 3.2 * 12 * 120 * 0.8 });
add('chimney', 'Chimney cap', bx(CHIM.u0 - 0.25, CHIM.u1 + 0.25, CHIM.v0 - 0.25, CHIM.v1 + 0.25, CTOP, CTOP + 0.35), 'concrete', { lb: 200 });
add('fireplace', 'Living room fireplace', merge([bx(CHIM.u0 + 0.9, CHIM.u1 - 0.9, CHIM.v0 - 0.04, CHIM.v0, F1 + 0.1, F1 + 2.6)]), 'tar');
add('hearth', 'Living room hearth', bx(CHIM.u0 + 0.2, CHIM.u1 - 0.2, CHIM.v0 - 1.6, CHIM.v0, F1, F1 + 0.12), 'brick', { lb: 300 });
const FTOP = WRIDGE + 1.2;
// the firebox's part is wide; above the first floor's window heads it steps in to a narrower flue, as in the photographs
const SHOULDER = F1 + 7.2, NU0 = FRCH.u0 + 0.75, NU1 = FRCH.u1 - 0.65;
for (let y = -0.2, k = 0; y < FTOP - 0.01; y += 3.2, k++) {
  const y1 = Math.min(FTOP, y + 3.2, y < SHOULDER ? SHOULDER : Infinity), wide = y < SHOULDER;
  add('chimney', `Family room chimney, lift ${k + 1}`, bx(wide ? FRCH.u0 : NU0, wide ? FRCH.u1 : NU1, y < F1 + 5 ? FRCH.v0 : 28.15, wide ? FRCH.v1 : FRCH.v1 - 0.4, y, y1), 'brick', { lb: 3.2 * 10 * 120 * 0.8 });
  if (wide && y1 === SHOULDER) { y = SHOULDER - 3.2; }
}
// the sloped brick where it steps in
add('chimney', 'Family room chimney, shoulder', merge([uy([[FRCH.u0, SHOULDER], [NU0, SHOULDER + 1.2], [NU0, SHOULDER]], 28.15, FRCH.v1), uy([[FRCH.u1, SHOULDER], [NU1, SHOULDER], [NU1, SHOULDER + 1.2]], 28.15, FRCH.v1), vy([[FRCH.v1, SHOULDER], [FRCH.v1 - 0.4, SHOULDER + 0.8], [FRCH.v1 - 0.4, SHOULDER]], FRCH.u0, FRCH.u1)]), 'brick', { lb: 300 });
add('chimney', 'Chimney cap', bx(NU0 - 0.15, NU1 + 0.15, 28.0, FRCH.v1 - 0.25, FTOP, FTOP + 0.3), 'concrete', { lb: 120 });
add('fireplace', 'Family room fireplace', bx(FRCH.u0 + 0.9, FRCH.u1 - 0.9, FRCH.v0 - 0.04, FRCH.v0, F1 + 0.1, F1 + 2.6), 'tar');

// windows: glass in white sash with muntins, a casing round it, louvered shutters beside it
function windows(face, off, stepShutters) {
  const F_ = FACES[face], out = { win: [], shut: [] }, sgn = -F_.inward;
  const at = (d) => F_.at + sgn * d;     // a depth out from the wall line
  for (const it of F_.items) {
    const a0 = it.a - it.w / 2, a1 = it.a + it.w / 2, B = (s0, s1, y0, y1, d0, d1) => F_.axis === 'u' ? bx(s0, s1, at(d0), at(d1), y0, y1) : bx(at(d0), at(d1), s0, s1, y0, y1);
    const trim = [], glass = [], cw = 0.33;
    if (it.kind === 'garage door') {
      const g = [B(a0, a1, it.y0, it.y1, off - 0.15, off - 0.05)];
      for (let k = 1; k < 4; k++) g.push(B(a0, a1, it.y0 + k * (it.y1 - it.y0) / 4 - 0.03, it.y0 + k * (it.y1 - it.y0) / 4 + 0.03, off - 0.05, off - 0.02));
      out.win.push(add('overhead door', it.name, merge(g), 'trim', { lb: 150 }));
      trim.push(B(a0 - cw, a0, it.y0, it.y1 + cw, off, off + 0.08), B(a1, a1 + cw, it.y0, it.y1 + cw, off, off + 0.08), B(a0 - cw, a1 + cw, it.y1, it.y1 + cw, off, off + 0.08));
      out.win.push(add('trim', `${it.name}, casing`, merge(trim), 'trim', { lb: 20 }));
      continue;
    }
    if (it.kind === 'slider') {
      // two big panes side by side in a white frame, no muntins
      glass.push(B(a0, a1, it.y0, it.y1, off - 0.12, off - 0.1));
      trim.push(B(a0, a0 + 0.15, it.y0, it.y1, off - 0.1, off - 0.02), B(a1 - 0.15, a1, it.y0, it.y1, off - 0.1, off - 0.02), B(a0, a1, it.y0, it.y0 + 0.15, off - 0.1, off - 0.02), B(a0, a1, it.y1 - 0.15, it.y1, off - 0.1, off - 0.02), B(it.a - 0.08, it.a + 0.08, it.y0, it.y1, off - 0.1, off - 0.02));
      trim.push(B(a0 - cw, a0, it.y0 - 0.12, it.y1 + cw, off, off + 0.08), B(a1, a1 + cw, it.y0 - 0.12, it.y1 + cw, off, off + 0.08), B(a0 - cw, a1 + cw, it.y1, it.y1 + cw, off, off + 0.08), B(a0 - cw, a1 + cw, it.y0 - 0.12, it.y0, off, off + 0.16));
      out.win.push(add('window', it.name, merge(trim), 'trim', { lb: 60 }), add('glass', `${it.name}, glass`, merge(glass), 'glass', { lb: 30 }));
      continue;
    }
    if (it.kind === 'storm door') {
      // a white storm door, glass nearly to the floor, over the back door
      trim.push(B(a0, a0 + 0.3, it.y0, it.y1, off - 0.06, off + 0.04), B(a1 - 0.3, a1, it.y0, it.y1, off - 0.06, off + 0.04), B(a0, a1, it.y1 - 0.3, it.y1, off - 0.06, off + 0.04), B(a0, a1, it.y0, it.y0 + 0.6, off - 0.06, off + 0.04));
      trim.push(B(a0 - cw, a0, it.y0, it.y1 + cw, off, off + 0.08), B(a1, a1 + cw, it.y0, it.y1 + cw, off, off + 0.08), B(a0 - cw, a1 + cw, it.y1, it.y1 + cw + 0.05, off, off + 0.1));
      glass.push(B(a0 + 0.3, a1 - 0.3, it.y0 + 0.6, it.y1 - 0.3, off - 0.05, off - 0.03));
      out.win.push(add('door', it.name, merge(trim), 'trim', { lb: 90 }), add('glass', `${it.name}, glass`, merge(glass), 'glass', { lb: 30 }));
      continue;
    }
    if (it.kind === 'front door' || it.kind === 'door' || it.kind === 'french doors') {
      const leaves = it.kind === 'french doors' ? 2 : 1, lw = it.kind === 'front door' ? 3 : it.w / leaves;
      for (let k = 0; k < leaves; k++) {
        const s0 = (it.kind === 'front door' ? it.a - 1.5 : a0) + k * lw, s1 = s0 + lw, d = [];
        d.push(B(s0, s1, it.y0, it.y1, off - 0.15, off - 0.05));
        if (it.kind !== 'front door') glass.push(B(s0 + 0.35, s1 - 0.35, it.y0 + (it.kind === 'french doors' ? 0.8 : 3.4), it.y1 - 0.35, off - 0.04, off - 0.02));
        else for (const [p0, p1, q0, q1] of [[0.3, 0.45, 0.3, 0.47], [0.55, 0.7, 0.3, 0.47], [0.3, 0.45, 0.55, 0.92], [0.55, 0.7, 0.55, 0.92]]) d.push(B(s0 + lw * p0 / 1, s0 + lw * (p1 + 0.25) / 1, it.y0 + (it.y1 - it.y0) * q0, it.y0 + (it.y1 - it.y0) * q1, off - 0.05, off - 0.02));
        out.win.push(add('door', it.name, merge(d), it.kind === 'front door' || it.red ? 'door' : 'trim', { lb: 70 }));
      }
      if (glass.length) out.win.push(add('glass', `${it.name}, glass`, merge(glass), 'glass', { lb: 30 }));
      if (it.kind !== 'front door') { trim.push(B(a0 - cw, a0, it.y0, it.y1 + cw, off, off + 0.08), B(a1, a1 + cw, it.y0, it.y1 + cw, off, off + 0.08), B(a0 - cw, a1 + cw, it.y1, it.y1 + cw + 0.05, off, off + 0.1)); out.win.push(add('trim', `${it.name}, casing`, merge(trim), 'trim', { lb: 15 })); }
      continue;
    }
    // a double-hung window: two sashes, each with its grid of lights
    const [nx, ny] = it.lights, mid = (it.y0 + it.y1) / 2;
    glass.push(B(a0, a1, it.y0, it.y1, off - 0.12, off - 0.1));
    const fr = 0.12, bars = [B(a0, a0 + fr, it.y0, it.y1, off - 0.1, off - 0.02), B(a1 - fr, a1, it.y0, it.y1, off - 0.1, off - 0.02), B(a0, a1, it.y0, it.y0 + fr, off - 0.1, off - 0.02), B(a0, a1, it.y1 - fr, it.y1, off - 0.1, off - 0.02), B(a0, a1, mid - 0.06, mid + 0.06, off - 0.1, off - 0.02)];
    for (const [y0, y1] of [[it.y0, mid], [mid, it.y1]]) {
      for (let k = 1; k < nx; k++) { const s = a0 + (a1 - a0) * k / nx; bars.push(B(s - 0.03, s + 0.03, y0, y1, off - 0.1, off - 0.05)); }
      for (let k = 1; k < ny; k++) { const y = y0 + (y1 - y0) * k / ny; bars.push(B(a0, a1, y - 0.03, y + 0.03, off - 0.1, off - 0.05)); }
    }
    trim.push(...bars, B(a0 - cw, a0, it.y0, it.y1 + cw, off, off + 0.08), B(a1, a1 + cw, it.y0, it.y1 + cw, off, off + 0.08), B(a0 - cw - 0.08, a1 + cw + 0.08, it.y1 + cw - 0.02, it.y1 + cw + 0.14, off, off + 0.14), B(a0 - cw, a1 + cw, it.y0 - 0.12, it.y0, off, off + 0.16));
    out.win.push(add('window', it.name, merge(trim), 'trim', { lb: 45 }), add('glass', `${it.name}, glass`, merge(glass), 'glass', { lb: 20 }));
    if (stepShutters && it.w >= 2.6 && !it.noShutter) {
      const sh = [], h = it.y1 - it.y0 + 0.1, w = it.w / 2 + 0.1;
      for (const [s0, s1] of [[a0 - cw - w - 0.05, a0 - cw - 0.05], [a1 + cw + 0.05, a1 + cw + w + 0.05]]) {
        sh.push(B(s0, s1, it.y0 - 0.05, it.y0 - 0.05 + h, off + 0.02, off + 0.08));
        for (let k = 0; k < 18; k++) { const y = it.y0 + 0.15 + k * (h - 0.4) / 18; sh.push(B(s0 + 0.08, s1 - 0.08, y, y + 0.08, off + 0.08, off + 0.12)); }
      }
      out.shut.push(sh);
    }
  }
  return out;
}
step('Windows and doors', 'Double-hung windows, six lights over six, go into the rough openings, plumbed and nailed through their casings; the doors are hung; the front door gets its sidelights and pilasters.');
const SID = inch(0.5) + 0.06;               // where the siding's face is
const SHUTTERS = [];
// shutters on the front and the ends; the back has none, in the photographs
for (const f of ['front1', 'front2', 'wingfront', 'back1', 'back2', 'west1', 'west2', 'east1', 'east2', 'garfront', 'garback', 'gareast']) { const r = windows(f, SID, !f.startsWith('back')); SHUTTERS.push(...r.shut); }
// the front entrance: sidelights and pilasters, a frieze and a pediment (the entrance detail sheet)
{
  const a = 27.25, g = [], gl = [], d = SID, B = (s0, s1, y0, y1, d0, d1) => bx(s0, s1, -d1, -d0, y0, y1);
  for (const s of [-1, 1]) { g.push(B(a + s * 1.5, a + s * (1.5 + 0.83), F1, F1 + 6.83, d - 0.05, d), B(a + s * (2.33), a + s * (2.33 + 0.8), F1 - 0.2, F1 + 7.1, d, d + 0.2)); gl.push(B(a + s * 1.62, a + s * 2.21, F1 + 1.3, F1 + 6.6, d - 0.06, d - 0.03)); }
  g.push(B(a - 3.25, a + 3.25, F1 + 7.1, F1 + 7.9, d, d + 0.3), B(a - 3.45, a + 3.45, F1 + 7.9, F1 + 8.15, d, d + 0.55));
  g.push(uy([[a - 3.45, F1 + 8.15], [a + 3.45, F1 + 8.15], [a, F1 + 10.0]], -d - 0.55, -d));
  add('entrance', 'Front entrance, pilasters and pediment', merge(g), 'trim', { lb: 180 });
  add('glass', 'Sidelights', merge(gl), 'glass', { lb: 20 });
}
step('Trim', 'White trim: corner boards, a frieze under the eaves, fascia and rake boards on the roof edges, all of pine, painted.');
{
  const g = [], cb = 0.42, d = SID;
  for (const [u, v, su, sv, y1] of [[0, 0, 1, 1, P2], [33, 0, -1, 1, P2], [0, 28, 1, -1, P2], [54, 28, -1, -1, P2], [54, 2, -1, 1, P1]]) {
    g.push(bx(u - su * d, u - su * d + su * cb, v - sv * d - sv * 0.08, v - sv * d, T, y1), bx(u - su * d - su * 0.08, u - su * d, v - sv * d, v - sv * d + sv * cb, T, y1));
  }
  // eave fascia and soffit along the long walls; rake boards up the gables
  for (const [u0, u1, v, y] of [[-0.5, 33.3, -1, P2 - PITCH], [-0.5, 54.5, 29, P2 - PITCH], [33.1, 54.5, 1, P1 - WF]]) g.push(bx(u0, u1, v - 0.07, v + 0.07, y - 0.1, y + 0.75));
  g.push(bx(-0.5, 33.3, -1, -d, P2 - 0.6, P2 - 0.5), bx(-0.5, 54.5, 28 + d, 29, P2 - 0.6, P2 - 0.5));
  // rake boards: deep enough to cover the end rafter and the roof's edge
  const rake = (va, ya, vb, yb, u) => g.push(vy(slopeBoard(va, ya - 0.12, vb, yb - 0.12, 12.5), u - 0.07, u + 0.07));
  for (const u of [-0.5, 33.25]) { rake(-1, P2 - PITCH, 14, RIDGE, u); rake(29, P2 - PITCH, 14, RIDGE, u); }
  rake(1, P1 - WF, WRV, WRIDGE, 54.5); rake(29, P2 - WB, WRV, WRIDGE, 54.5);
  rake(GAR.v0 - 1, GP - PITCH, GRV, GRIDGE, GAR.u1 + 0.5); rake(GAR.v1 + 1, GP - WB, GRV, GRIDGE, GAR.u1 + 0.5);
  for (const [v, y] of [[GAR.v0 - 1, GP - PITCH], [GAR.v1 + 1, GP - WB]]) g.push(bx(54.1, GAR.u1 + 0.5, v - 0.07, v + 0.07, y - 0.1, y + 0.75));
  add('trim', 'Corner boards, fascia and rake boards', merge(g), 'trim', { lb: 600 });
}
// siding: the drawings' wood shingles on the house, boards and battens on the garage; replaced, years later, by the
// clapboards in today's photographs. Both are made here; the second goes on in the last bag.
const SIDE72 = [], SIDE_NOW = [];
function sidingAll(house, garage) {
  const out = [], o = { off: inch(0.5), t: 0.06 };
  const both = (f1, f2) => ({ axis: FACES[f1].axis, at: FACES[f1].at, inward: FACES[f1].inward, items: [...FACES[f1].items, ...(f2 ? FACES[f2].items : [])] });
  FACES._front = both('front1', 'front2'); FACES._back = both('back1', 'back2'); FACES._west = both('west1', 'west2'); FACES._east = both('east1', 'east2');
  out.push(panel('_front', 'siding', 'Siding, front', house, { ...o, profile: R(0, 33, T - 0.1, P2 + 0.05) }));
  out.push(panel('wingfront', 'siding', 'Siding, wing front', house, { ...o, profile: R(33, 54, T - 0.1, P1 + 0.05) }));
  out.push(panel('_back', 'siding', 'Siding, back', house, { ...o, profile: R(0, 54, T - 0.1, P2 + 0.05), extra: [R(FRCH.u0, FRCH.u1, T, P2 + 0.04).reverse()] }));
  out.push(panel('_west', 'siding', 'Siding, west end and gable', house, { ...o, profile: [[0, T - 0.1], [28, T - 0.1], [28, P2], [14, RIDGE + 0.3], [0, P2]], extra: [R(14 - 1.1, 14 + 1.1, RIDGE - 4.6, RIDGE - 4.6 + VENT).reverse()] }));
  out.push(panel('_east', 'siding', 'Siding, wing end and gable', house, { ...o, profile: [[2, T - 0.1], [28, T - 0.1], [28, P2], [WRV, WRIDGE + 0.3], [2, P1]], extra: [R(WRV - 1.1, WRV + 1.1, WRIDGE - 3.6, WRIDGE - 3.6 + 2.2).reverse()] }));
  out.push(panel(['v', 33, -1], 'siding', 'Siding, the main block above the wing', house, { ...o, holes: false, profile: [[0, T - 0.1], [2, T - 0.1], [2, P1], [WRV, WRIDGE + 0.2], [28, P2], [14, RIDGE + 0.3], [0, P2]], extra: [R(14 - 1.1, 14 + 1.1, RIDGE - 4.6, RIDGE - 4.6 + VENT).reverse()] }));
  out.push(panel('garfront', 'siding', 'Boards and battens, garage front', garage, { ...o, profile: R(54, GAR.u1, GSLAB, GP + 0.05) }));
  out.push(panel('garback', 'siding', 'Boards and battens, breezeway back', garage, { ...o, profile: R(54, GAR.u0, GSLAB, GP + 0.05) }));
  out.push(panel(['u', GAR.v1, -1], 'siding', 'Boards and battens, garage back', garage, { ...o, holes: false, profile: R(GAR.u0, GAR.u1, GSLAB, GP + 0.05) }));
  out.push(panel(['v', GAR.u0, 1], 'siding', 'Boards and battens, beside the covered entry', garage, { ...o, holes: false, profile: R(28, GAR.v1, GSLAB, GP + 0.05) }));
  out.push(panel('gareast', 'siding', 'Boards and battens, garage end and gable', garage, { ...o, profile: [[GAR.v0, GSLAB], [GAR.v1, GSLAB], [GAR.v1, GP], [GRV, GRIDGE + 0.3], [GAR.v0, GP]] }));
  return out;
}
// the covered corner behind the breezeway: a ceiling under its rafters, the garage wall there sided
add('trim', 'Ceiling of the covered entry', bx(54.1, GAR.u0, 28.05, GAR.v1, GP - 0.05, GP + 0.02), 'trim', { lb: 120 });
step('Cedar shingles', 'The drawings call for wood shingles on the house, red cedar, five inches to the weather, and boards and battens on the garage. New cedar is a warm brown; in a few winters it weathers to silver.');
SIDE72.push(...sidingAll('cedar', 'bnb72'));
// vents in the gables
for (const [u, v, y, along] of [[0, 14, RIDGE - 4.6, 'v'], [33, 14, RIDGE - 4.6, 'v'], [54, WRV, WRIDGE - 3.6, 'v']]) {
  const g = [], d = SID, s = u === 0 ? -1 : 1, h = u === 54 ? 2.2 : VENT;
  g.push(bx(u + s * d, u + s * (d + 0.1), v - 1.25, v + 1.25, y - 0.15, y + h + 0.15));
  for (let k = 0; k < 8; k++) g.push(bx(u + s * (d - 0.05), u + s * (d + 0.06), v - 1.1, v + 1.1, y + 0.1 + k * (h - 0.2) / 8, y + 0.1 + k * (h - 0.2) / 8 + 0.1));
  add('vent', 'Gable vent', merge(g), 'trim', { lb: 15 });
}
const S_SHUT = step('Shutters', 'Louvered shutters, painted black, either side of every full-size window. They are for looks; on this house they never closed.');
SHUTTERS.forEach((g, k) => add('shutter', 'Shutters', merge(g), 'shutter', { lb: 30 }));

// ---------- Bag 9: move in ----------
bag('Move in');
step('The porch', 'A porch off the dining room, 14 feet square, on a brick floor, with wood posts and a roof of its own, gable end to the back yard.');
{
  const p = PORCH, g = [], br = [];
  br.push(bx(p.u0, p.u1, p.v0, p.v1, 0, p.floor));
  add('porch floor', 'Porch floor, brick on a slab', merge(br), 'brick', { lb: 14 * 14 * 1.25 * 120 });
  for (const [u, v] of [[p.u0 + 0.2, p.v1 - 0.2], [p.u1 - 0.2, p.v1 - 0.2], [p.u0 + 0.2, (p.v0 + p.v1) / 2], [p.u1 - 0.2, (p.v0 + p.v1) / 2], [p.u0 + 0.2, p.v0 + 0.4], [p.u1 - 0.2, p.v0 + 0.4]]) g.push(bx(u - 0.25, u + 0.25, v - 0.25, v + 0.25, p.floor, p.plate));
  add('post', 'Porch posts, wood', merge(g), 'trim', { lb: 250 });
  add('beam', 'Porch beams', merge([bx(p.u0, p.u0 + 0.5, p.v0, p.v1, p.plate, p.plate + 0.8), bx(p.u1 - 0.5, p.u1, p.v0, p.v1, p.plate, p.plate + 0.8), bx(p.u0, p.u1, p.v1 - 0.5, p.v1, p.plate, p.plate + 0.8)]), 'trim', { lb: 300 });
  const pp = 6 / 12, mid = (p.u0 + p.u1) / 2, top = p.plate + 0.8 + 7 * pp;
  // its rafters run across the porch, from the side beams to a ridge along its middle
  const rg = [];
  for (let v = p.v0 + 0.3; v < p.v1 + 0.6; v += 16 / 12) for (const s of [-1, 1]) rg.push(uy(slopeBoard(mid + s * 7.8, p.plate + 0.8 - 0.8 * pp, mid + s * 0.06, top, 5.5).map(([a, y]) => [a, y]), v, v + inch(1.5)));
  add('rafter', 'Porch rafters, 2x6', merge(rg), 'lumber', { lb: 400, group: 'roof' });
  const sl = [], c = Math.cos(Math.atan(pp));
  for (const s of [-1, 1]) sl.push(uy([[mid + s * 8, p.plate + 0.8 - 1.0 * pp + inch(5.5) / c], [mid, top + inch(5.5) / c], [mid, top + inch(5.5) / c + 0.12], [mid + s * 8, p.plate + 0.8 - 1.0 * pp + inch(5.5) / c + 0.12]], 28.3, p.v1 + 0.8));
  add('roofing', 'Porch roof, shingles', worldUV(merge(sl), 1 / c, true), 'roofing', { lb: 900, group: 'roof' });
  add('trim', 'Porch gable', uy([[p.u0 - 0.2, p.plate + 0.8], [p.u1 + 0.2, p.plate + 0.8], [mid, top + 0.2]], p.v1 - 0.1, p.v1), 'trim', { lb: 60 });
}
step('Steps, drive and lawn', 'Brick steps to the front door, an asphalt drive up to the garage, loam and grass seed, and a row of shrubs along the front.');
{
  add('steps', 'Front steps, brick', merge([bx(24.6, 29.9, -3.4, 0, 0, F1 / 2), bx(24.6, 29.9, -1.8, 0, F1 / 2, F1 - 0.05)]), 'brick', { lb: 2400 });
  // the back: a brick stoop and steps down to the yard with black iron railings, and a steel bulkhead over the
  // outside stair to the cellar, beside it under the dinette window
  const st = [bx(25.2, 29.8, 28, 31.2, 0, F1 - 0.05)], n = 3, rh = (F1 - 0.05) / (n + 1);
  for (let i = 0; i < n; i++) st.push(bx(25.2, 29.8, 31.2 + i * 0.95, 31.2 + (i + 1) * 0.95, 0, (n - i) * rh));
  add('steps', 'Back steps, brick', merge(st), 'brick', { lb: 3000 });
  const rl = [];
  for (const u of [25.3, 29.7]) {
    rl.push(vy(slopeBoard(28.2, F1 + 2.9, 31.2, F1 + 2.9, 1.2), u - 0.04, u + 0.04), vy(slopeBoard(31.2, F1 + 2.9, 31.2 + n * 0.95, rh + 2.9, 1.2), u - 0.04, u + 0.04));
    for (let k = 0; k <= 7; k++) { const v = 28.4 + k * (n * 0.95 + 2.8) / 7, yb = v < 31.2 ? F1 - 0.05 : Math.max(rh, (n - Math.floor((v - 31.2) / 0.95)) * rh), yt = v < 31.2 ? F1 + 2.9 : F1 + 2.9 - (v - 31.2) * (F1 - rh) / (n * 0.95); rl.push(bx(u - 0.04, u + 0.04, v - 0.04, v + 0.04, yb, yt)); }
  }
  add('railing', 'Back step railings, iron', merge(rl), 'shutter', { lb: 80 });
  add('bulkhead', 'Bulkhead over the cellar stair', vy([[28, 0], [33.4, 0], [33.4, 0.5], [28, 1.9]], 30.2, 34.4), 'trim', { lb: 200 });
  add('driveway', 'Driveway, asphalt', flat([[56, 15.3], [GAR.u1 + 1, 15.3], [GAR.u1 + 3, -6], [78, -40], [74, -70], [50, -70], [54, -40], [52, -6]], 0, 0.12), 'asphalt', { site: true, lb: 0 });
  const sh = [];
  for (const [u, v, r] of [[3, -2.2, 1.6], [8.8, -2.4, 1.4], [15.5, -2.4, 1.6], [21.3, -2.2, 1.4], [32, -2.3, 1.5], [36, 0.0, 1.5], [42, -0.2, 1.8], [51, 0, 1.6]]) { const c = new THREE.IcosahedronGeometry(Y(r), 1); c.scale(1, 0.75, 1); c.translate(X(v), Y(r * 0.65), Z(u)); sh.push(c); }
  add('shrub', 'Shrubs along the front', merge(sh), 'leaf', { site: true });
}
step('Oil burner and tank', 'Down cellar, a 275 gallon oil tank and an oil burner for the hot water baseboard heat, piped into a flue in the chimney, and an electric water heater. Most New England houses of 1972 heated this way.');
{
  const t = new THREE.CylinderGeometry(Y(1.15), Y(1.15), Y(5), 20); t.rotateZ(Math.PI / 2); t.rotateY(Math.PI / 2); t.scale(1, 1.4, 1); t.translate(X(24.5), Y(CELLAR + 2.4), Z(48));
  add('oil tank', 'Oil tank, 275 gallons', merge([t, bx(46, 46.2, 24, 24.2, CELLAR, CELLAR + 1), bx(49.8, 50, 24, 24.2, CELLAR, CELLAR + 1)]), 'tank', { lb: 300 });
  add('boiler', 'Oil burner and boiler', bx(38, 40.6, 22.5, 25.5, CELLAR + 0.33, CELLAR + 5), 'boiler', { lb: 500 });
  add('water heater', 'Water heater', cylG(Y(0.9), Y(0.9), Y(CELLAR + 0.33), Y(CELLAR + 5), X(24.5), Z(36.4), 16), 'boiler', { lb: 150 });
}
// the family car in 1972: a station wagon, harvest gold, with wood-grain sides
const WAGON = [];
function wagon(u, v) {
  const g = [], w = [], gl = [], wood = [], ch = [];
  const B = (a0, a1, b0, b1, y0, y1) => bx(u + a0, u + a1, v + b0, v + b1, y0, y1);
  g.push(B(-3.2, 3.2, 0, 18.2, 1.1, 3.0), B(-3.0, 3.0, 4.6, 17.2, 3.0, 4.6));
  gl.push(B(-3.02, 3.02, 5.0, 16.8, 3.2, 4.4), B(-2.9, 2.9, 4.4, 4.6, 3.1, 4.5));
  wood.push(B(-3.24, -3.18, 4.2, 17.4, 1.5, 2.8), B(3.18, 3.24, 4.2, 17.4, 1.5, 2.8));
  ch.push(B(-3.3, 3.3, -0.2, 0.2, 1.1, 1.7), B(-3.3, 3.3, 18.1, 18.5, 1.1, 1.7));
  for (const b of [3.2, 14.6]) for (const s of [-1, 1]) { const c = new THREE.CylinderGeometry(Y(1.15), Y(1.15), Y(0.75), 16); c.rotateZ(Math.PI / 2); c.rotateY(Math.PI / 2); c.translate(X(v + b), Y(1.15), Z(u + s * 2.95)); w.push(c); }
  WAGON.push(add('car', 'Station wagon, 1972', merge(g), 'gold', { site: true }), add('car', 'Station wagon, windows', merge(gl), 'glass', { site: true }), add('car', 'Station wagon, wood-grain sides', merge(wood), 'panel', { site: true }), add('car', 'Station wagon, bumpers', merge(ch), 'chrome', { site: true }), add('car', 'Station wagon, wheels', merge(w), 'rubber', { site: true }));
}
const S_MOVE = step('Move in', 'Fall 1972. The crew\'s lumber pile and sawhorses go, a station wagon pulls into the garage, and the house is a home. Nine sheets of drawings, about 25,000 pieces of lumber and nails, and one season.');
until(YARD, S_MOVE);
wagon(GAR.u0 + 6.5, GAR.v0 + 2.5);

// ---------- Bag 10: since then ----------
bag('Since 1972');
const S_SNOW = step('The Blizzard of \'78', 'February 6 and 7, 1978: over two feet of snow across eastern Massachusetts, 27 inches in Boston, drifts far deeper. Settled snow that deep weighs about 34 pounds a square foot, close to 15 tons on the main roof alone. Turn on Color by load: the rafters are near their limit by today\'s rules, and they held.', { focus: 'forces' });
const SNOW = [];
for (const Rf of ROOFS) SNOW.push(add('snow', `Snow on the ${Rf.n.toLowerCase()}`, roofSlab(Rf, inch(0.9), SNOW_IN / 12 * 0.9), 'snow', { lb: (Rf.u1 - Rf.u0) * Math.abs(Rf.vb - Rf.va) * Wood.snowLoad(SNOW_IN), lv: 'snow', group: 'roof' }));
SNOW.push(add('snow', 'Snow on the ground', flat([[-160, -150], [240, -150], [240, 200], [-160, 200]], 0.02, 0.4), 'snow', { site: true }));
{
  const dr = []; for (const [u, v, r] of [[16, -3, 4], [44, -1, 5], [70, 13, 6], [-3, 14, 5], [30, 31, 5]]) { const c = new THREE.SphereGeometry(Y(r), 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); c.scale(1.6, 0.5, 1); c.translate(X(v), 0, Z(u)); dr.push(c); }
  SNOW.push(add('snow', 'Drifts', merge(dr), 'snow', { site: true }));
}
const S_THAW = step('Spring', 'The snow goes in a week of thaw. The house took the storm with no damage beyond some shingles.');
until(SNOW, S_THAW);
const S_SIDING = step('New siding', 'Years on, the cedar shingles come off and gray clapboards go on, as the house is today. The garage\'s boards and battens are painted to match.');
until(SIDE72, S_SIDING);
SIDE_NOW.push(...sidingAll('clap', 'bnb'));
const S_SCREEN = step('The porch screened in', 'The open porch becomes a screened porch: screens between the posts, a railing of crossed boards, white trim. It is the best room in the house from June to September.');
{
  const p = PORCH, g = [], sc = [];
  for (const [a0, a1, side] of [[p.v0 + 0.6, p.v1 - 0.4, 'w'], [p.v0 + 0.6, p.v1 - 0.4, 'e'], [p.u0 + 0.4, p.u1 - 0.4, 'n']]) {
    const along = side === 'n' ? 'u' : 'v', at = side === 'w' ? p.u0 + 0.2 : side === 'e' ? p.u1 - 0.2 : p.v1 - 0.2;
    const B = (s0, s1, y0, y1) => along === 'v' ? bx(at - 0.08, at + 0.08, s0, s1, y0, y1) : bx(s0, s1, at - 0.08, at + 0.08, y0, y1);
    const n = Math.round((a1 - a0) / 3.3);
    for (let k = 0; k < n; k++) {
      const s0 = a0 + (a1 - a0) * k / n, s1 = a0 + (a1 - a0) * (k + 1) / n, rail = p.floor + 2.6;
      g.push(B(s0, s0 + 0.2, p.floor, p.plate), B(s0, s1, rail - 0.15, rail), B(s0, s1, p.floor, p.floor + 0.2));
      // crossed boards below the rail
      const L2 = Math.hypot(s1 - s0, rail - p.floor), ang = Math.atan2(rail - p.floor, s1 - s0);
      for (const sg of [1, -1]) { const mid = (s0 + s1) / 2, ym = (rail + p.floor) / 2;
        // a board along the side, tipped up one way or the other
        if (along === 'v') { const b = new THREE.BoxGeometry(Y(L2 - 0.3), Y(0.25), Y(0.25)); b.rotateZ(sg * ang); b.translate(X(mid), Y(ym), Z(at)); g.push(b); }
        else { const b = new THREE.BoxGeometry(Y(0.25), Y(0.25), Y(L2 - 0.3)); b.rotateX(sg * ang); b.translate(X(at), Y(ym), Z(mid)); g.push(b); } }
      sc.push(B(s0 + 0.2, s1, rail, p.plate));
    }
  }
  add('trim', 'Screened porch frames and railings', merge(g), 'trim', { lb: 500 });
  add('screen', 'Porch screens', merge(sc), 'screen', { lb: 60 });
}
const S_NOW = step('Today', 'Arched trim over the garage doors, a second chimney at the west end (it is not on the 1972 drawings), and out back a brick patio with a fieldstone wall, hydrangeas round the chimney and hostas along the wall. The station wagon is long gone. This is the house in the photographs.');
until(WAGON, S_NOW);
{
  const g = [];
  for (const it of FACES.garfront.items.filter(i => i.kind === 'garage door')) {
    // the arch: spandrels filling the top corners of each opening, under a white curved casing
    const a0 = it.a - it.w / 2, a1 = it.a + it.w / 2, yb = it.y1 - 1.6, n = 16, pts = [], d = SID;
    for (let i = 0; i <= n; i++) { const t = Math.PI * i / n; pts.push([it.a - Math.cos(t) * it.w / 2, yb + Math.sin(t) * 1.6]); }
    const sp = [[a0, yb], ...pts, [a1, yb], [a1, it.y1], [a0, it.y1]];
    g.push(uy(sp, GAR.v0 - d - 0.1, GAR.v0 - d + 0.04));
  }
  add('trim', 'Arches over the garage doors', merge(g), 'bnb', { lb: 60 });
  const wc = RIDGE + 3.0;
  add('chimney', 'West chimney', bx(2.0, 4.6, 16.2, 18.4, RIDGE - 3.0, wc), 'brick', { lb: 3000 });
  add('chimney', 'West chimney, cap', bx(1.8, 4.8, 16.0, 18.6, wc, wc + 0.3), 'concrete', { lb: 150 });
  // the back yard as in the photographs: a brick patio from the porch past the back steps, a bed of hydrangeas round
  // the family room chimney and hostas along the wall, a fieldstone wall and pillars at its far edge, a grill, and a
  // table under a red umbrella
  add('patio', 'Brick patio', flat([[15.4, 28.6], [24.8, 28.6], [24.8, 34.4], [30.2, 34.4], [30.2, 33.6], [35, 33.6], [46, 34.5], [49, 44], [44, 54], [15.4, 54]], 0.0, 0.15), 'pavers', { site: true });
  const bush = (list, sy = 0.8) => merge(list.map(([u, v, r]) => { const c = new THREE.IcosahedronGeometry(Y(r), 1); c.scale(1, sy, 1); c.translate(X(v), Y(r * sy * 0.9), Z(u)); return c; }));
  add('shrub', 'Hydrangeas', bush([[35.8, 30.6, 1.9], [37.4, 30.9, 2.2], [40.2, 31.8, 2.1], [46.6, 31.6, 2.2], [49.4, 30.6, 2.0], [52.2, 30.2, 1.7]], 0.85), 'hleaf', { site: true });
  add('shrub', 'Hydrangea flowers', bush([[36.2, 29.8, 0.45], [37.8, 32.8, 0.5], [40.6, 33.4, 0.45], [47.4, 33.3, 0.5], [49.2, 32.4, 0.45], [38.6, 29.6, 0.4]].map(([u, v, r]) => [u, v, r]), 1).translate(0, Y(2.4), 0), 'hydrangea', { site: true });
  add('shrub', 'Hostas', bush([[15.8 + 1.2, 29.8, 1.4], [19.5, 29.6, 1.5], [23.2, 29.7, 1.3]], 0.45), 'hleaf', { site: true });
  add('wall', 'Fieldstone wall and pillars', merge([bx(15.4, 41.2, 54.2, 55.6, 0, 2.0), bx(41.2, 43.6, 53.6, 56, 0, 3.4), bx(47.2, 49.6, 42.4, 44.8, 0, 3.4)]), 'fieldstone', { site: true });
  add('wall', 'Pillar caps', merge([bx(41, 43.8, 53.4, 56.2, 3.4, 3.65), bx(47, 49.8, 42.2, 45, 3.4, 3.65)]), 'concrete', { site: true });
  add('grill', 'Gas grill', merge([bx(30.8, 33.6, 35.6, 37.4, 1.0, 3.6), bx(30.6, 33.8, 35.5, 37.5, 3.6, 4.1), bx(29.4, 35, 35.6, 37.4, 3.0, 3.1), cylG(Y(0.25), Y(0.25), 0, Y(0.5), X(36.5), Z(31.1), 10), cylG(Y(0.25), Y(0.25), 0, Y(0.5), X(36.5), Z(33.3), 10)]), 'shutter', { site: true });
  const T0 = { u: 22, v: 44 }, tb = [cylG(Y(2.4), Y(2.4), Y(2.3), Y(2.4), X(T0.v), Z(T0.u), 24), cylG(Y(0.12), Y(0.12), 0, Y(2.3), X(T0.v), Z(T0.u), 8)], ch = [];
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, cu = T0.u + Math.cos(a) * 3.2, cv = T0.v + Math.sin(a) * 3.2; tb.push(bx(cu - 0.8, cu + 0.8, cv - 0.8, cv + 0.8, 1.45, 1.55), bx(cu - 0.8, cu + 0.8, cv - 0.8, cv + 0.8, 0.05, 0.1)); ch.push(bx(cu - 0.75, cu + 0.75, cv - 0.75, cv + 0.75, 1.55, 1.75)); }
  add('furniture', 'Patio table and chairs', merge(tb), 'shutter', { site: true });
  add('furniture', 'Chair cushions', merge(ch), 'red', { site: true });
  const um = new THREE.ConeGeometry(Y(1.1), Y(5.2), 8); um.translate(X(T0.v), Y(7.0), Z(T0.u));
  add('furniture', 'Umbrella, red, furled', merge([um, cylG(Y(0.07), Y(0.07), Y(2.4), Y(9.8), X(T0.v), Z(T0.u), 6)]), 'red', { site: true });
}
K.finish();

// ---------- Loads ----------
// the load sources present at a step: a source counts once any of its pieces is in place
const LV = {};
for (const p of pieces) if (p.lv) (LV[p.lv] ||= []).push(p);
export function computeLoads(n) {
  K.computeLoads(n);
  const on = {};
  for (const [k, ps] of Object.entries(LV)) on[k] = ps.some(p => K.live(p, n));
  for (const p of pieces) {
    if (!p.check || !K.live(p, n)) { p.util = null; p.res = null; continue; }
    p.res = p.check(on); p.util = p.res.util;
  }
}
export const live = K.live;
export { pieces, steps };
export const STEP_STRUCK = S_RAFT;
export const HIDERS = [];

// ---------- Load paths ----------
// At a slice across the house: the roof's weight down the rafters to the long walls, down the studs to the sill and the
// foundation wall and into the footing; and the floors' weight to the bearing wall, the girder, a column and its pad.
export function forceLines() {
  const out = [];
  for (const u of [3.5, 9.5, 20.5, 29.5, 39.5, 47.5]) {
    const wing = u > 33, fv = wing ? 2 : 0, rv = wing ? WRV : 14, ry = (wing ? WRIDGE : RIDGE) + 0.3, fy = wing ? P1 : P2;
    const col = COLS.reduce((a, c) => Math.abs(c - u) < Math.abs(a - u) ? c : a);
    const p = (uu, v, y) => V3(X(v), Y(y), Z(uu));
    const lines = [
      { pts: [p(u, rv, ry), p(u, fv + 0.2, fy + 0.2), p(u, fv + 0.2, T), p(u, fv + 0.4, FTG + 0.3)], r: 0.07 },
      { pts: [p(u, rv, ry), p(u, 27.8, P2 + 0.2), p(u, 27.8, T), p(u, 27.6, FTG + 0.3)], r: 0.07 },
      { pts: [p(u, 7, F2), p(u, 14, F2), p(u, 14, F1), p(u, 14, 0.2), p(col, 14, 0.2), p(col, 14, FTG + 0.3)], r: 0.07 },
      { pts: [p(u, 21, F1 + 0.1), p(u, 14, F1 + 0.1)], r: 0.05 },
    ];
    out.push({ z: Z(u), end: false, radial: false, at: p(u, 14, 10), normal: V3(0, 0, 1), lines, bases: [p(u, fv + 0.4, FTG + 0.3), p(u, 27.6, FTG + 0.3), p(col, 14, FTG + 0.3)] });
  }
  return out;
}

// ---------- The page's words ----------
const ftin = ft => { const i = Math.round(ft * 12); return `${Math.floor(i / 12)} ft ${i % 12 ? `${i % 12} in` : ''}`.trim(); };
const lbs = x => `${Math.round(x).toLocaleString('en-US')} lb`;
const GOV = { bend: 'bending', shear: 'shear', deflect: 'sag' };
export const KIT = {
  id: 'house', name: 'A 1972 house', place: 'Massachusetts, 1972', title: 'A house built by N. L. Mitton, Inc.',
  matchup: 'A 1972 Colonial, from its drawings', aria: '3D model of a 1972 house under construction',
  lede: 'A real house, built from its 1972 drawings stick by stick: footings, a girder on steel columns, 2x10 joists, 2x4 walls, 2x8 rafters, cedar shingles. Every joist, rafter, stud, column and footing is checked against the load on it. Then on through the Blizzard of \'78 to the house as it stands today.',
  about: [
    'A two-storey Colonial with a one-and-a-half-storey wing, a breezeway and a two-car garage, built in 1972 by N. L. Mitton, Inc. from nine sheets of drawings: the foundation, both floors, the front and side elevations, a typical framing section and the front entrance.',
    'What the drawings give is used as drawn: the 54 by 28 foot foundation with its 2 foot jog, the six lally columns in seven equal spaces, the 8x10 girder, 2x10 joists 12 inches apart, 2x4 studs and 2x8 rafters 16 inches apart, the 8 in 12 main roof and the wing\'s 10.7 and 4 in 12, every room and every window. Heights the sheets do not mark, the back of the house and the garage\'s framing are the usual ones for 1972, and today\'s look comes from photographs.',
    'The house\'s place and address are left out on purpose.',
  ],
  start: { title: 'An empty lot, 1972', note: 'Spring 1972. The lot is still woods. Step through the build, or open a bag below.' },
  intro: `${steps.length} steps in 10 bags, from the woods to the house today. Every footing, joist, stud, rafter and sheet goes in on its own, in the order a framing crew would.`,
  cards: [
    { h: 'How it carries its load', ps: ['Load paths shows where the weight goes at the slice facing you: the roof down the rafters to the long walls, down the studs to the foundation and its footing; the floors to the bearing wall down the middle, the girder, a steel column and its pad in the cellar.', 'Color by load checks each joist, rafter, stud, column and footing against today\'s design loads: 40 pounds a square foot for living rooms, 30 for bedrooms, 20 for a roofer on the roof, and the snow in 1978, plus the weight of the house itself. Blue is lightly loaded; orange is at the allowable value, which already keeps a margin of two or more before anything breaks. Tap a piece to see its numbers.'] },
    { h: 'What the numbers say', ps: ['The 2x10 floor joists use about 60% of what they are allowed, the 2x8 rafters about 60% under a roofer and nearly all of it under the 1978 snow. The 8x10 girder and the 2 foot square pads under its columns come out at or a little over today\'s limits when every room is loaded at once, which no room ever is, and the pads\' number rests on a guess at the soil. They are estimates, with the assumptions shown when you tap a piece, not an engineer\'s inspection.'] },
  ],
  forces: { label: 'Load paths', off: true, note: 'Where the weight goes at the slice facing you: down the rafters to the long walls and into the footings, and from the floors to the bearing wall, the girder and a column.' },
  load: { xray: ['cedar', 'clap', 'bnb72', 'bnb', 'roofing', 'ply', 'trim', 'shutter', 'glass', 'door', 'snow', 'screen'], legend: '<b>Share of allowable strength</b><div class="ramp"></div><div class="ticks"><span>0</span><span>50%</span><span>100%</span><span>125%</span></div><span>Today\'s design loads; tap a piece for its numbers</span>' },
  inspect(p, n) {
    const rows = [];
    if (p.size) rows.push(['Size', p.size]);
    if (p.res) {
      const r = p.res;
      if (r.kind === 'beam') rows.push(['Span', ftin(r.span)], ['Carries, including itself', lbs(r.total)]);
      if (r.kind === 'post' || r.kind === 'steel') rows.push(['Carries', lbs(r.P)], ['Can take', lbs(r.cap)]);
      if (r.kind === 'footing') rows.push(['Presses on the soil', `${Math.round(r.q).toLocaleString('en-US')} lb/sq ft`], ['Sandy gravel takes', `${r.soil.toLocaleString('en-US')} lb/sq ft`]);
      const gov = r.kind === 'beam' ? GOV[['bend', 'shear', 'deflect'].reduce((a, k) => r[k] > r[a] ? k : a, 'bend')] : r.kind === 'footing' ? 'soil pressure' : 'buckling';
      rows.push(['Uses', `${Math.round(r.util * 100)}% of its allowable ${gov}`]);
    }
    if (p.lb) rows.push(['Weight', lbs(p.lb)]);
    rows.push(['Placed in', `step ${p.step + 1}`]);
    return rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  },
  cut: { min: Z(-1), max: Z(GAR.u1 + 1), value: Z(10) }, cutView: { y: 4, from: [-2, 6, 24] },
  camera: [-34, 12, 26], near: 8, whole: true, person: false, ground: 0x6f8f4e,
  shadow: { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 400 },
  // inside: places to stand, and the rooms from the plans, so the page can say where you are
  views: [
    ['Front door, in the foyer', 27, 3, F1, 27, 20, F1 + 5],
    ['In the cellar, by the columns', 18, 10, CELLAR, 40, 14, CELLAR + 4],
    ['Living room', 4, 3, F1, 20, 11, F1 + 3],
    ['Kitchen', 20, 18, F1, 32, 26, F1 + 3],
    ['Family room, by the fireplace', 48, 18, F1, 42, 28, F1 + 3],
    ['Upstairs hall, at the top of the stair', 21, 16.5, F2, 30, 11, F2 + 1],
    ['The big bedroom in the wing', 50, 18, F2, 36, 6, F2 + 3],
    ['In the attic, on the joists', 20, 12, P2 + 0.6, 4, 14, RIDGE - 2],
    ['In the garage', 76, 34, GSLAB, 64, 15.5, 4],
    ['On the porch', 8, 38, PORCH.floor, 8, 26, F1 + 4],
  ].map(([name, u, v, y, lu, lv, ly]) => ({ name, at: [X(v), Y(y), Z(u)], look: [X(lv), Y(ly), Z(lu)] })),
  rooms: [
    ['Cellar', 0, 54, 0, 28, FTG - 2, 0], ['Living room', 0, 24, 0, 14, F1 - 1, F2 - 0.5], ['Dining room', 0, 14, 14, 28, F1 - 1, F2 - 0.5], ['Kitchen', 14, 25, 14, 28, F1 - 1, F2 - 0.5],
    ['Dinette', 25, 36, 14, 28, F1 - 1, F2 - 0.5], ['Family room', 36, 54, 14, 28, F1 - 1, F2 - 0.5], ['Foyer', 24, 33, 0, 14, F1 - 1, F2 - 0.5], ['Lavatory', 33, 41.8, 2, 8.5, F1 - 1, F2 - 0.5],
    ['Den', 41.8, 54, 2, 14, F1 - 1, F2 - 0.5], ['Front hall', 33, 41.8, 8.5, 14, F1 - 1, F2 - 0.5],
    ['Bedroom 3', 0, 16.8, 0, 14, F2 - 0.5, P2], ['Bedroom 2', 0, 16.8, 14, 28, F2 - 0.5, P2], ['Bedroom 4', 16.8, 33, 0, 9, F2 - 0.5, P2], ['Upstairs hall', 16.8, 33, 9, 19, F2 - 0.5, P2],
    ['Bathrooms', 16.8, 33, 19, 28, F2 - 0.5, P2], ['Bedroom 1, in the wing', 33, 54, 2, 28, F2 - 0.5, P2], ['Attic', 0, 54, 0, 28, P2, RIDGE + 2],
    ['Garage', GAR.u0, GAR.u1, GAR.v0, GAR.v1, -1, GP], ['Breezeway', 54, GAR.u0, GAR.v0, 28, -1, GP], ['Porch', PORCH.u0, PORCH.u1, PORCH.v0, PORCH.v1, -1, PORCH.plate],
  ].map(([name, u0, u1, v0, v1, y0, y1]) => ({ name, x0: X(v0), x1: X(v1), z0: Z(u0), z1: Z(u1), y0: Y(y0), y1: Y(y1) })),
  insideName: 'Outside',
  pit: { x0: X(PIT.v0), x1: X(PIT.v1), z0: Z(PIT.u0), z1: Z(PIT.u1), depth: Y(-FTG + 0.6), step: S_DIG },
  mats: MATS,
};
