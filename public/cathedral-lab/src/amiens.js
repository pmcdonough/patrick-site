// Amiens: the tallest complete cathedral in France, built from a description by the Gothic builder (gothic.js), plus
// the parts that are its own: the crossing, the apse and its chapels, the west front and its two half-towers, the spire
// and the labyrinth. The numbers are in docs/CATHEDRAL-LAB.md with their sources.
// Units: metres, kN. x across (north negative), y up, z along the church: the crossing at 0, the west front at +62.
import * as THREE from './vendor/three.module.js?v=0.12';
import * as Solver from './solver.js?v=0.12';
import { createKit, V3, GAMMA, OAK, LEAD, boxG, cylG, extr, extrVol, lancet, rect, circle, archShapes, ruled } from './kit.js?v=0.12';
import { frame, section, aisled, ribTop, pointed, beamG, tubeG, X, SIDES } from './gothic.js?v=0.12';

const K = createKit();
const { pieces, steps, step, add, removeAt, placeArch, placeCentering } = K;
let BAG = 0; const bag = name => K.bag(++BAG, name);

// ---------- The section ----------
// A 13.6 m vault 0.8 m deep springing at 30 m, so its crown is at 42.2 m (42.3 in the real nave); walls 1.4 m; aisles 8.6 m
// wide, vaulted at 13.5 to 20 m; buttresses 4 m deep; the lower flyer lands at 26 m, the upper at 33 m.
const SEC = section({ span: 13.6, thick: 0.8, springing: 30, wall: 1.4, aisle: 8.6, aisleWall: 1.2, aisleSpring: 13.5, aisleTop: 20.5, aisleRoofTop: 25.5,
  levels: { arcade: 18.6, triforium: 24.5, cornice: 42.6 }, bdepth: 4, flyerLow: 26, flyerHigh: 33, tiers: 2, chapelTop: 15,
  piers: { drums: [1.2, 5.4, 9.6, 13.5, 17.6] }, aislePiers: { drums: [1.2, 5.3, 9.4, 12.9] } });
const { ARCH, XI, XO, XW, XA1, XA2, springing: H0 } = SEC, CORN = SEC.levels.cornice;
const NL = [7.1, 15.7, 23.4, 31.1, 38.8, 46.5, 54.2, 61.9], TL = [7.1, 15.7, 24.3, 32.5], CL = [7.1, 15.7, 23.4, 31.1, 38.8];
const SN = s => s < 0 ? 'north' : 'south', NS = s => s < 0 ? 'A' : 'B';

// the three stretches, in local frames: the nave runs west (+z), each transept arm runs out (north -x, south +x) with its
// west side local x > 0, the choir runs east (-z)
const nave = { T: 'N', name: 'Nave', F: frame(0, 0, [1, 0], [0, 1]), lines: NL, sideName: SN };
const armN = { T: 'TN', name: 'North transept', F: frame(0, 0, [0, 1], [-1, 0]), lines: TL, sideName: s => s < 0 ? 'east' : 'west', nave: -1 };
const armS = { T: 'TS', name: 'South transept', F: frame(0, 0, [0, 1], [1, 0]), lines: TL, sideName: s => s < 0 ? 'east' : 'west', nave: 1 };
const choir = { T: 'C', name: 'Choir', F: frame(0, 0, [1, 0], [0, -1]), lines: CL, sideName: SN, glazedTriforium: true, aisleRoofTop: 23.2 };
const npid = (k, s, i, c) => `N${k}-${NS(s)}${i}${c != null ? '-' + c : ''}`, apid = (arm, k, s, i, c) => `${arm.T}${k}-${NS(s)}${i}${c != null ? '-' + c : ''}`;
nave.sides = Object.fromEntries(SIDES.map(s => [s, { aisles: 1, open: new Set([0]), noAisleArch: new Set([0]), chapels: new Set([1, 2, 3, 4, 5, 6]),
  line: i => i === 0 ? 'none' : i === 1 || i === 7 ? 'corner' : 'buttress' }]));
for (const arm of [armN, armS]) arm.sides = {
  1: { aisles: 1, open: new Set([0]), noAisleArch: new Set([0]), line: i => i === 0 ? 'none' : i === 1 ? { sup: [[npid('K', arm.nave, 1), 1]] } : i === 3 ? 'corner' : 'buttress',
    mainLink: i => i === 0 ? (k, c) => npid(k, arm.nave, 0, c) : null },
  [-1]: { aisles: 1, open: new Set([0, 1]), noAisleArch: new Set([0, 1]), line: i => i <= 1 ? 'none' : 'corner' },
};
const armOf = s => s < 0 ? armN : armS;
choir.sides = Object.fromEntries(SIDES.map(s => [s, { aisles: 2, open: new Set([0]), noAisleArch: new Set([0]),
  line: i => i === 0 ? 'none' : i === 1 ? { sup: [[apid(armOf(s), 'K', -1, 2), 1]] } : 'buttress',
  mainLink: i => i === 0 ? (k, c) => apid(armOf(s), k, -1, 0, c) : null,
  aisleLink: i => i === 0 ? (k, c) => k === 'AB' ? apid(armOf(s), 'D', -1, 1, 2) : apid(armOf(s), k, -1, 1, c) : null }]));
choir.ribLink = i => i === 0 ? 'XE' : null;

// ---------- The words for each part ----------
const words = (part, extra = {}) => ({
  footings: [`${part}: footings`, `Footings go down for the piers, the aisle walls and the buttresses of the ${part.toLowerCase()}.`],
  piers: [`${part}: piers`, `Round piers in drums, 1.6 m across and 18 m tall to their capitals: the arcade alone is half the height of the church.`],
  arcadeCentering: [`${part}: centering for the arcades`, 'Timber frames under every arch of the arcade.'],
  arcades: [`${part}: arcades`, 'Nine stones to each arch, laid from both piers at once and closed with a keystone.'],
  arcadeStrike: [`${part}: strike the arcade centering`, 'The arches carry themselves.'],
  aisleWalls: [`${part}: aisle walls and buttresses`, 'The outer walls go up with a big window in every bay, and the buttresses start up beside them.'],
  aisleVaults: [`${part}: aisle vaults`, 'Arches across the aisles at every bay line, and vaults between them, about 20 m up.'],
  upperWalls: [`${part}: triforium and clerestory`, 'Above the arcade, a band of small arches, the triforium, then the clerestory, where almost the whole wall is window.'],
  buttresses: [`${part}: buttresses rise`, 'The buttresses go up to 33 m, well above the aisle roofs, ready for the flyers.'],
  flyerCentering: [`${part}: centering for the flyers`, 'A long timber frame under every flyer.'],
  flyers: [`${part}: flying buttresses`, 'Two tiers of flyers at every buttress. The lower ones meet the wall where the vault pushes; the upper ones higher up, against the wind on the roof and the top of the wall.'],
  flyerStrike: [`${part}: strike the flyer centering`, 'The flyers stand on their own.'],
  pinnacles: [`${part}: pinnacles`, 'A tall pinnacle on every buttress.'],
  vaultCentering: [`${part}: centering for the vault`, 'The highest centering in France: timber frames under every rib, 30 m above the floor.'],
  ribs: [`${part}: ribs`, 'Transverse ribs across the vessel at every bay line, two diagonals in every bay meeting at a boss, and a wall rib along each side.'],
  webbing: [`${part}: webbing`, 'Thin courses of light stone close the four cells of every bay.'],
  vaultStrike: [`${part}: strike the centering`, 'The vault carries itself 42 m up and pushes out on the walls; the flyers catch the push and carry it to the buttresses.'],
  roofs: [`${part}: roofs`, 'The oak frame and the lead roof, and lean-to roofs over the aisles under the flyers.'],
  ...extra,
  bag: key => { const b = { footings: 'lower', aisleWalls: null, upperWalls: 'upper', vaultCentering: 'vault', roofs: null }[key]; if (b) bag(`${part}, ${b}`); },
});

// ---------- The nave, 1220 to 1236 ----------
const NAVE = aisled(K, SEC, [nave], words('Nave', {
  footings: ['Nave: footings', 'Amiens was begun at the west, with the nave, in 1220: Bishop Évrard de Fouilloy laid the first stone and Robert de Luzarches was the master mason. Footings go down for 16 piers, the aisle walls and the buttresses.'],
  vaultStrike: ['Nave: strike the centering', 'The moment of truth, 42 m up: the vault carries itself and pushes out on the walls with about 50 kN for every metre, a quarter more than at Notre-Dame. The flyers carry it to buttresses 4 m deep, and the resultant lands at 0.37 of their base, just inside the middle third (0.33). At 3.2 m deep the joint would open. The red line is the path.'],
}));

// ---------- The west front ----------
// 48 m wide, built with the nave: three deep porches under gables between four big buttresses, the Gallery of Kings, the
// rose (13 m across), and between the towers the bell-ringers' gallery. The towers above are half-towers, standing on half
// of their square bases, finished much later.
const ZF = NL.at(-1) + 0.75, ZFF = 68, ZP = 74.5, FX = 24, TX0 = -8.4, TX1 = -17.6;
const FL = [0.6, 21, 27, 43];
const FN = s => s < 0 ? 'north' : 'south';
const towerTop = s => s < 0 ? 68 : 61.7;
bag('West front');
const STEP_FRONT = step('West front: footings and the lower walls', 'The west front goes up with the nave, in one campaign from 1220 to 1236. Its walls rise 2 m thick, with the three portals cut through them.');
add('WF-F', 'footing', 'Footing, west front', boxG(-FX - 1, FX + 1, -0.6, 0.62, ZF, ZP + 1), { w: 50 * (ZP + 1 - ZF) * 1.22 * GAMMA, bear: 50 * (ZP + 1 - ZF) });
const PORT = [[-15.6, 5.6, 'Portal of Saint Firmin'], [0, 7, 'Portal of the Last Judgement'], [15.6, 5.6, 'Portal of the Virgin']];
const frontWall = (k, holes) => { const pts = rect(-FX, FX, FL[k], FL[k + 1]), g = extr(pts, holes, 2, 0, ZFF - 1, 1, 0);
  return add(`WF-W${k}`, 'wall stone', `West front, ${['portal', 'kings', 'rose'][k]} level`, g, { w: extrVol(pts, holes, 2) * GAMMA, bear: 2 * FX * 2 * 0.7, sup: [[k ? `WF-W${k - 1}` : 'WF-F', 1]] }); };
frontWall(0, PORT.map(([x, w]) => lancet(x, 0.6, w, 11)));
const BUTF = [-22.5, -8.6, 8.6, 22.5];
BUTF.forEach((x, i) => add(`WF-B${i}-0`, 'buttress stone', `West front buttress ${i + 1}, course 1`, boxG(x - 1, x + 1, 0.62, 21, ZFF, ZP), { w: 2 * (ZP - ZFF) * 20.4 * GAMMA, bear: 2 * (ZP - ZFF), sup: [['WF-F', 1]] }));
// the porches: three arches stepping out between the buttresses, on jamb columns, under a gable
const prRing = (w, i) => pointed(w + 0.9 * i, 0.45, 9), prZ = i => ZFF + 0.4 + 1.3 * i, PR = [0, 1, 2, 3];
step('West front: porch columns', 'The porches are deep: four arches each, every one a step further out, on slender columns.');
PORT.forEach(([cx, w, nm], p) => { for (const side of [-1, 1]) PR.forEach(i => add(`WF-PC${p}${side}${i}`, 'jamb column', `${nm}, column`, cylG(0.22, 0.22, 0.62, 11.6, cx + side * ((w + 0.9 * i) / 2 + 0.225), prZ(i), 16), { w: Math.PI * 0.05 * 11 * GAMMA, bear: 0.15, sup: [['WF-F', 1]] })); });
step('West front: centering for the porches', 'A timber frame under every ring of the porch arches.');
PORT.forEach(([cx, w], p) => PR.forEach(i => placeCentering(`WF-PN${p}${i}`, prRing(w, i), { y0: 11.6, ox: cx, oz: prZ(i), dx: 1, dz: 0 })));
const STEP_PN = K.at();
step('West front: porch arches and gables', 'Nine stones to each ring, a carved tympanum under the inner one, and over each porch a gable. The central portal has the Last Judgement, Saint Firmin is on the left and the Virgin on the right.');
PORT.forEach(([cx, w, nm], p) => {
  PR.forEach(i => placeArch(`WF-PR${p}${i}`, prRing(w, i), { y0: 11.6, depth: 1.2, ox: cx, oz: prZ(i), dx: 1, dz: 0, springL: [[`WF-PC${p}-1${i}`, 1]], springR: [[`WF-PC${p}1${i}`, 1]], name: `${nm}, arch ${i + 1}`, kind: 'archivolt stone' }));
  const head = lancet(cx, 11.2, w, 0.4); add(`WF-T${p}`, 'tympanum', `${nm}, tympanum`, extr(head, [], 0.4, 0, ZFF + 0.2, 1, 0), { w: extrVol(head, [], 0.4) * GAMMA, bear: w * 0.4, sup: [['WF-W0', 1]] });
  const gw = w / 2 + 3.4, top = p === 1 ? 26 : 23.5, g = [[cx - gw, 17.5], [cx + gw, 17.5], [cx, top]];
  add(`WF-G${p}`, 'wall stone', `${nm}, gable`, extr(g, [circle(cx, 19.6, 1.1, 24)], 0.8, 0, ZP - 0.4, 1, 0), { w: extrVol(g, [], 0.8) * GAMMA, bear: 2 * gw * 0.8, sup: [[`WF-PR${p}3-K`, 1]] });
});
step('West front: strike the porch centering', 'The porch arches stand.');
removeAt(p => p.step === STEP_PN);
const KING = new THREE.LatheGeometry([[0, 0], [0.42, 0], [0.4, 0.2], [0.36, 1.7], [0.4, 2.2], [0.17, 2.45], [0.15, 2.55], [0.28, 2.72], [0.26, 2.95], [0.23, 3.05], [0.27, 3.22], [0, 3.22]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
step('West front: Gallery of Kings', 'The wall rises another 6 m, and 22 kings stand across the whole front. Nearly all are Viollet-le-Duc\'s, from his restoration in the 1800s.');
frontWall(1, []);
add('WF-KL', 'ledge stone', 'Kings\' ledge', boxG(-FX, FX, FL[1], FL[1] + 0.4, ZFF, ZFF + 1.1), { w: 2 * FX * 0.44 * GAMMA, bear: 2 * FX * 1.1, sup: [['WF-W1', 1]] });
for (let k = 0; k < 22; k++) { const g = KING.clone(); g.translate(-21 + 2 * k, FL[1] + 0.4, ZFF + 0.6); add(`WF-K${k}`, 'king', 'King', g, { w: 3.6 * 9.81, bear: 0.5, sup: [['WF-KL', 1]] }); }
BUTF.forEach((x, i) => add(`WF-B${i}-1`, 'buttress stone', `West front buttress ${i + 1}, course 2`, boxG(x - 0.8, x + 0.8, 21, FL[3], ZFF, ZFF + 1.6), { w: 1.6 * 1.6 * 22 * GAMMA, bear: 2.56, sup: [[`WF-B${i}-0`, 1]] }));
const RZ = ZFF - 0.3, RY0 = 35, RR = 6.5;
step('West front: the rose', `The middle of the front is left with a round opening ${(2 * RR).toFixed(0)} m across, the width of the nave. Its stone tracery is a flame-like pattern from the 1500s; here, rings and spokes.`);
frontWall(2, [circle(0, RY0, RR, 72), ...[-1, 1].flatMap(s => [lancet(s * 15.8, 28.5, 2.2, 8), lancet(s * 12.6, 28.5, 2.2, 8)])]);
{ const ring = (r0, r1, id, nm) => add(id, 'rose tracery', nm, extr(circle(0, RY0, r1, 72), [circle(0, RY0, r0, 72)], 0.4, 0, RZ, 1, 0), { w: Math.PI * (r1 * r1 - r0 * r0) * 0.4 * GAMMA, bear: 0.4 * (r1 - r0), sup: [['WF-W2', 1]] });
  ring(RR - 0.45, RR, 'WF-RS-o', 'Rose, outer ring'); ring(3.4, 3.75, 'WF-RS-m', 'Rose, middle ring'); ring(1, 1.3, 'WF-RS-i', 'Rose, inner ring');
  const spoke = (r0, r1, a, id, sup) => { const g = new THREE.BoxGeometry(r1 - r0, 0.16, 0.3); g.translate((r0 + r1) / 2, 0, 0); g.rotateZ(a); g.translate(0, RY0, RZ); add(id, 'rose tracery', 'Rose, spoke', g, { w: (r1 - r0) * 0.05 * GAMMA, sup: [[sup, 1]] }); };
  for (let k = 0; k < 12; k++) spoke(1.25, 3.45, Math.PI * 2 * k / 12, `WF-RS-a${k}`, 'WF-RS-m');
  for (let k = 0; k < 24; k++) spoke(3.7, RR - 0.4, Math.PI * 2 * (k + 0.5) / 24, `WF-RS-b${k}`, 'WF-RS-o'); }
step('West front: the bell-ringers\' gallery', 'Between the towers, an open gallery of tall arches, and behind it the gable of the nave roof.');
{ const pts = rect(TX0, -TX0, FL[3], 47), holes = [-6, -3.6, -1.2, 1.2, 3.6, 6].map(x => lancet(x, 43.6, 1.6, 2.2));
  add('WF-GAL', 'wall stone', 'Bell-ringers\' gallery', extr(pts, holes, 1.2, 0, ZFF - 0.6, 1, 0), { w: extrVol(pts, holes, 1.2) * GAMMA, bear: 16.8 * 1.2, sup: [['WF-W2', 1]] });
  for (const s of SIDES) add(`WF-TL${NS(s)}`, 'wall stone', `${FN(s)} tower, lower stage`, boxG(...[TX0, TX1, -TX1, -TX0].slice(s < 0 ? 0 : 2, s < 0 ? 2 : 4).sort((a, b) => a - b), FL[3], 47, ZF + 1.2, ZFF), { w: 9.2 * 4 * (ZFF - ZF - 1.2) * GAMMA * 0.55, bear: 9.2 * (ZFF - ZF - 1.2) * 0.55, sup: [['WF-W2', 1]] }); }

// ---------- The transept and the crossing ----------
const TRANS = aisled(K, SEC, [armN, armS], words('Transept', {
  footings: ['Transept: footings', 'The transept crosses the church 70 m from end to end, with an aisle on each side of each arm. Where its aisles meet the nave\'s and the choir\'s, they share a bay. Its crossing piers go down first.'],
  flyers: ['Transept: flying buttresses', 'Two tiers of flyers on the west side of each arm. On the east side the arms lean on the choir\'s aisles.'],
  vaultStrike: ['Transept: strike the centering', 'Both arms carry their vaults.'],
}));
// the crossing: the nave's last transverse rib on the west, a new arch on the east, the arms' first ribs north and south
bag('Crossing');
const cF = frame(0, 0, [1, 0], [0, 1]), cp = (s, side) => side === 'w' ? [[npid('P', s, 0, 1), 1]] : [[apid(armOf(s), 'P', -1, 0, 1), 1]];
const DX = Math.hypot(SEC.span, 14.2), Q1 = [SEC.span / DX, 14.2 / DX], Q2 = [SEC.span / DX, -14.2 / DX];
step('Crossing: centering', 'A frame under the east arch of the crossing and under its two diagonals.');
placeCentering('XEC', ARCH, { y0: H0, ox: 0, oz: -7.1, dx: 1, dz: 0 });
for (const [n, q] of [['a', Q1], ['b', Q2]]) placeCentering(`XDC${n}`, ARCH, { sx: DX / SEC.span, y0: H0, ox: 0, oz: 0, dx: q[0], dz: q[1] });
const STEP_XC = K.at();
step('Crossing: arch, ribs and vault', 'The east arch, the diagonals and the webs close the crossing, 42 m up, on four great piers. Amiens has a star vault here with extra ribs; this one has the main ribs only.');
placeArch('XE', ARCH, { y0: H0, depth: 0.65, ox: 0, oz: -7.1, dx: 1, dz: 0, springL: cp(-1, 'e'), springR: cp(1, 'e'), name: 'East crossing arch' });
placeArch('XDa', ARCH, { sx: DX / SEC.span, y0: H0, depth: 0.6, ox: 0, oz: 0, dx: Q1[0], dz: Q1[1], springL: cp(-1, 'e'), springR: cp(1, 'w'), name: 'Crossing, diagonal rib', withKey: false });
placeArch('XDb', ARCH, { sx: DX / SEC.span, y0: H0, depth: 0.6, ox: 0, oz: 0, dx: Q2[0], dz: Q2[1], springL: cp(-1, 'w'), springR: cp(1, 'e'), name: 'Crossing, diagonal rib', withKey: false });
{ const k = ARCH.k - 1, top = ARCH.extrados.at(-1)[1] + H0;
  add('XBOSS', 'boss', 'Crossing, boss', cylG(0.7, 0.7, top - 1.2, top + 0.05, 0, 0, 32), { w: Math.PI * 0.49 * 1.25 * GAMMA, sup: ['XDa', 'XDb'].flatMap(r => [[`${r}-L${k}`, 0.25], [`${r}-R${k}`, 0.25]]) });
  const half = (B, sx, cu, cv, du, dv, h) => { const t = ribTop(B, sx, H0); return q => { const [x, y] = t(q), u = h < 0 ? x : -x; return cF.P(cu + du * u, y, cv + dv * u); }; };
  const Tz = (z, h) => half(ARCH, 1, 0, z, 1, 0, h), G = (d, h) => half(ARCH, DX / SEC.span, 0, 0, d[0], d[1], h), W = (s, h) => half(ARCH, 1, s * 6.8, 0, 0, 1, h);
  const rp = pre => pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
  const cells = [[Tz(-7.1, -1), G(Q1, -1), 'XE', 'XDa'], [Tz(-7.1, 1), G(Q2, 1), 'XE', 'XDb'], [Tz(7.1, -1), G(Q2, -1), 'NTR0', 'XDb'], [Tz(7.1, 1), G(Q1, 1), 'NTR0', 'XDa'],
    [W(-1, -1), G(Q1, -1), 'TNTR0', 'XDa'], [W(-1, 1), G(Q2, -1), 'TNTR0', 'XDb'], [W(1, -1), G(Q2, 1), 'TSTR0', 'XDb'], [W(1, 1), G(Q1, 1), 'TSTR0', 'XDa']];
  [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => cells.forEach(([A, B, r1, r2], i) => { const g = ruled(A, B, q0, q1, 6, 12), a = rp(r1), b = rp(r2);
    add(`XWEB${i}-${c}`, 'web panel', 'Crossing, vault web', g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...b.map(id => [id, 0.5 / b.length])] }); })); }
step('Crossing: strike the centering', 'The crossing vault carries itself.');
removeAt(p => p.step === STEP_XC);
// the ends of the arms: a wall with a portal, a rose and a gable
const TEX = TL.at(-1), TEW = 2.5, RXG = TRANS.RX + 0.25;
step('Transept: the ends', 'Each arm ends in a wall 2.5 m thick with a portal, a rose and a gable. The north rose is from the 1300s, the south rose\'s tracery from the 1500s.');
for (const arm of [armN, armS]) { const s = arm.nave, t = arm.T, ax = X(s, -(TEX + TEW / 2)), z0 = -16.3, z1 = 16.3;
  const lev = [[0.6, 18.6, [lancet(0, 0.6, 5, 9)]], [18.6, H0 + 13, [circle(0, 34, 5.6, 72)]]];
  lev.forEach(([y0, y1, holes], k) => { const pts = rect(z0, z1, y0, y1); add(`${t}E${k}`, 'wall stone', `${arm.name}, end wall`, extr(pts, holes, TEW, ax, 0, 0, 1), { w: extrVol(pts, holes, TEW) * GAMMA, bear: (z1 - z0) * TEW * 0.8, sup: [[k ? `${t}E${k - 1}` : `${t}EF`, 1]] }); });
  add(`${t}EF`, 'footing', `Footing, ${arm.name} end wall`, boxG(...[X(s, -(TEX - 0.4)), X(s, -(TEX + TEW + 1))].sort((a, b) => a - b), -0.6, 0.62, z0 - 1, z1 + 1), { w: (TEW + 1.4) * 34.6 * 1.22 * GAMMA, bear: (TEW + 1.4) * 34.6 });
  const g = [[-RXG, TRANS.RY], [RXG, TRANS.RY], [0, TRANS.RIDGE + 1]]; add(`${t}EG`, 'wall stone', `${arm.name}, gable`, extr(g, [circle(0, 47.5, 1.4, 32)], 1.2, ax, 0, 0, 1), { w: extrVol(g, [], 1.2) * GAMMA, bear: 2 * RXG * 1.2, sup: [[`${t}E1`, 1]] });
  const ring = (r0, r1, id) => add(id, 'rose tracery', `${arm.name} rose`, extr(circle(0, 34, r1, 72), [circle(0, 34, r0, 72)], 0.4, X(s, -(TEX + TEW - 0.3)), 0, 0, 1), { w: Math.PI * (r1 * r1 - r0 * r0) * 0.4 * GAMMA, sup: [[`${t}E1`, 1]] });
  ring(5.15, 5.6, `${t}RS-o`); ring(2.6, 2.95, `${t}RS-m`);
  for (let k = 0; k < 16; k++) { const gg = new THREE.BoxGeometry(0.3, 0.16, 2.3); gg.translate(0, 0, 3.9); gg.rotateX(Math.PI * 2 * (k + 0.5) / 16); gg.translate(X(s, -(TEX + TEW - 0.3)), 34, 0); add(`${t}RS-s${k}`, 'rose tracery', `${arm.name} rose, spoke`, gg, { w: 0.15 * GAMMA, sup: [[`${t}RS-o`, 1]] }); }
}
// ---------- The choir and the apse ----------
const CHOIR = aisled(K, SEC, [choir], words('Choir', {
  footings: ['Choir: footings', 'East of the crossing, the choir: four bays with two aisles on each side. It was finished around 1269 by Thomas and then Renaud de Cormont.'],
  upperWalls: ['Choir: triforium and clerestory', 'In the choir the triforium is glazed too: its aisle roofs are kept low, so light comes in all the way from the arcade to the vault.'],
  buttresses: ['Choir: buttresses and flyer piers', 'Over two aisles, each flyer gets a pier half way, rising from the pier between the aisles.'],
  flyers: ['Choir: flying buttresses', 'Each flyer crosses both aisles in two flights, landing on the pier between them and then on the outer buttress.'],
  vaultStrike: ['Choir: strike the centering', 'The choir vault carries itself.'],
}));
// the apse: seven sides on a half-circle centred on the choir's last bay line; an ambulatory round it; seven chapels
// beyond, the middle one deeper (the Lady Chapel); six buttresses on the lines between, with flyers in two flights
const ZA = -CL.at(-1), NAP = 7, PHI = [...Array(NAP + 1).keys()].map(k => Math.PI * k / NAP), MID = PHI.slice(1, -1).map((_, i) => i + 1);
const at = (phi, r, y = 0) => V3(Math.cos(phi) * r, y, ZA - Math.sin(phi) * r);
const R1 = -XW, R2 = -XA1, RO = -XO, RI = -XI, RB = -SEC.xbI(2), RBD = SEC.bdepth, CHR = k => k === 3 ? 30 : RB;
const apId = (kind, k, c) => k === 0 ? choir.mp(kind, 1, CL.length - 1, c) : k === NAP ? choir.mp(kind, -1, CL.length - 1, c) : `AP${kind}-${k}${c != null ? '-' + c : ''}`;
const amId = (kind, k, c) => k === 0 ? choir.ap(kind, 1, CL.length - 1, c) : k === NAP ? choir.ap(kind, -1, CL.length - 1, c) : `APM${kind}-${k}${c != null ? '-' + c : ''}`;
function rbox(phi, r0, r1, y0, y1, hw) { const g = new THREE.BoxGeometry(r1 - r0, y1 - y0, 2 * hw); g.translate((r0 + r1) / 2, (y0 + y1) / 2, 0); g.rotateY(phi); g.translate(0, 0, ZA); return g; }
const chord = (k, r) => { const a = at(PHI[k], r), b = at(PHI[k + 1], r), t = b.clone().sub(a); const len = t.length(); return { m: a.clone().add(b).multiplyScalar(0.5), t: t.normalize(), len }; };
const panelA = (id, kind, nm, k, r, y0, y1, depth, holes, trim, sup) => { const { m, t, len } = chord(k, r), pts = rect(-len / 2 + trim, len / 2 - trim, y0, y1);
  return add(id, kind, nm, extr(pts, holes, depth, m.x, m.z, t.x, t.z), { w: extrVol(pts, holes, depth) * GAMMA, bear: (len - 2 * trim) * depth * 0.8, sup }); };
const quadG = (a, b, c, d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return g; };
const triG = (a, b, c) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c].flatMap(p => [p.x, p.y, p.z]), 3)); g.computeVertexNormals(); return g; };
const ARCA = pointed(chord(0, R1).len - 1.2, 0.5, 7), ARMA = pointed(chord(0, R2).len - 1.3, 0.5, 9);
const AIL2 = pointed((XW - 0.8) - (XA1 + 0.55), 0.5, 7), AIX2 = -((XW - 0.8) + (XA1 + 0.55)) / 2;
const SUPA = SEC.supports(2), FLA = SUPA.flyer, YM = H0 - 1 + (SEC.flyerLow - (H0 - 1)) * (R2 - RO) / (RB - RO);

bag('Apse, lower');
step('Apse: footings', `The choir ends in a half-circle of seven sides with an ambulatory round it and seven chapels beyond, the middle one, the Lady Chapel, deeper than the rest.`);
MID.forEach(k => { const p = PHI[k], a = at(p, R1), b = at(p, R2);
  add(apId('F', k), 'footing', `Footing, apse pier ${k}`, cylG(1.5, 1.5, 0, 0.6, a.x, a.z, 8), { w: 7 * 0.6 * GAMMA, bear: 7 });
  add(amId('F', k), 'footing', `Footing, ambulatory pier ${k}`, cylG(1.1, 1.1, 0, 0.6, b.x, b.z, 8), { w: 3.8 * 0.6 * GAMMA, bear: 3.8 });
  add(`APFB-${k}`, 'footing', `Footing, apse buttress ${k}`, rbox(p, RB - 0.4, RB + RBD + 0.4, 0, 0.6, 1.1), { w: 4.8 * 2.2 * 0.6 * GAMMA, bear: 10.6 }); });
step('Apse: piers', 'Six slim piers set close on the half-circle, and six more for the ambulatory behind them.');
MID.forEach(k => { const p = PHI[k], a = at(p, R1), b = at(p, R2);
  add(apId('B', k), 'pier base', `Base, apse pier ${k}`, cylG(0.95, 0.85, 0.6, 1.2, a.x, a.z, 8), { w: 0.8 * GAMMA, bear: 2.5, sup: [[apId('F', k), 1]] });
  [1.2, 5.4, 9.6, 13.5, 17.6].slice(0, -1).forEach((y0, c, arr) => { const y1 = [1.2, 5.4, 9.6, 13.5, 17.6][c + 1];
    add(apId('D', k, c), 'drum', `Drum ${c + 1}, apse pier ${k}`, cylG(0.6, 0.6, y0, y1, a.x, a.z, 32), { w: Math.PI * 0.36 * (y1 - y0) * GAMMA, bear: 1.13, sup: [[c ? apId('D', k, c - 1) : apId('B', k), 1]] }); });
  add(apId('C', k), 'capital', `Capital, apse pier ${k}`, cylG(0.6, 0.85, 17.6, 18.2, a.x, a.z, 32), { w: 0.6 * GAMMA, bear: 1.13, sup: [[apId('D', k, 3), 1]] });
  add(apId('AB', k), 'abacus block', `Abacus, apse pier ${k}`, rbox(p, R1 - 0.6, R1 + 0.6, 18.2, 18.6, 0.6), { w: 1.44 * 0.4 * GAMMA, bear: 1.44, sup: [[apId('C', k), 1]] });
  add(amId('B', k), 'pier base', `Base, ambulatory pier ${k}`, cylG(0.8, 0.74, 0.6, 1.2, b.x, b.z, 8), { w: 0.68 * 0.6 * GAMMA, bear: 1.7, sup: [[amId('F', k), 1]] });
  [1.2, 5.3, 9.4, 12.9].slice(0, -1).forEach((y0, c) => { const y1 = [1.2, 5.3, 9.4, 12.9][c + 1];
    add(amId('D', k, c), 'drum', `Drum ${c + 1}, ambulatory pier ${k}`, cylG(0.55, 0.55, y0, y1, b.x, b.z, 32), { w: Math.PI * 0.3 * (y1 - y0) * GAMMA, bear: 0.95, sup: [[c ? amId('D', k, c - 1) : amId('B', k), 1]] }); });
  add(amId('C', k), 'capital', `Capital, ambulatory pier ${k}`, cylG(0.55, 0.76, 12.9, 13.3, b.x, b.z, 32), { w: 0.3 * GAMMA, bear: 0.95, sup: [[amId('D', k, 2), 1]] });
  add(amId('AB', k), 'abacus block', `Abacus, ambulatory pier ${k}`, rbox(p, R2 - 0.65, R2 + 0.65, 13.3, 13.5, 0.65), { w: 1.69 * 0.2 * GAMMA, bear: 1.69, sup: [[amId('C', k), 1]] }); });
step('Apse: centering for the arches', 'Timber frames under the narrow arches between the apse piers, and under the ambulatory arches.');
for (let k = 0; k < NAP; k++) { const a = chord(k, R1), b = chord(k, R2);
  placeCentering(`APAC-${k}`, ARCA, { y0: 18.6, ox: a.m.x, oz: a.m.z, dx: a.t.x, dz: a.t.z }); placeCentering(`APMC-${k}`, ARMA, { y0: 13.5, ox: b.m.x, oz: b.m.z, dx: b.t.x, dz: b.t.z }); }
const STEP_APC = K.at();
step('Apse: arches', 'Seven narrow, steep arches round the apse, seven wider ones round the ambulatory opening into the chapels, and arches across the ambulatory on every line.');
for (let k = 0; k < NAP; k++) { const a = chord(k, R1), b = chord(k, R2);
  placeArch(`APA-${k}`, ARCA, { y0: 18.6, depth: 1.2, ox: a.m.x, oz: a.m.z, dx: a.t.x, dz: a.t.z, springL: [[apId('AB', k), 1]], springR: [[apId('AB', k + 1), 1]], name: `Apse arch ${k + 1}` });
  placeArch(`APM-${k}`, ARMA, { y0: 13.5, depth: 0.8, ox: b.m.x, oz: b.m.z, dx: b.t.x, dz: b.t.z, springL: [[amId('AB', k), 1]], springR: [[amId('AB', k + 1), 1]], name: `Ambulatory arch ${k + 1}` }); }
MID.forEach(k => { const p = PHI[k], d = at(p, 1).sub(at(p, 0)), a = at(p, AIX2);
  placeArch(`APAI-${k}`, AIL2, { y0: 13.5, depth: 0.5, ox: a.x, oz: a.z, dx: d.x, dz: d.z, springL: [[apId('D', k, 2), 1]], springR: [[amId('AB', k), 1]], name: `Ambulatory cross arch ${k}` }); });
step('Apse: strike the centering', 'The arches round the apse carry themselves.');
removeAt(p => p.step === STEP_APC);
step('Apse: ambulatory vaults and chapels', 'Wedge-shaped vaults close the ambulatory, and the seven chapels go up beyond it, each with two tall windows.');
for (let k = 0; k < NAP; k++) {
  const cl = AIL2.c, kk = u => { const p = cl.p(u), n = cl.n(u); return [p[0] + n[0] * 0.2, p[1] + n[1] * 0.2 + 13.5]; };
  for (const h of [-1, 1]) { const A = (q, phi) => { const [x, y] = kk(q * cl.uCrown); return at(phi, AIX2 - (h < 0 ? x : -x), y); };
    const g = ruled(q => A(q, PHI[k] + 0.01), q => A(q, PHI[k + 1] - 0.01), 0, 1, 10, 12);
    add(`APV-${k}-${h < 0 ? 'a' : 'b'}`, 'web panel', `Ambulatory vault ${k + 1}`, g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: [[apId('D', k, 2), 0.25], [apId('D', k + 1, 2), 0.25], [amId('AB', k), 0.25], [amId('AB', k + 1), 0.25]] }); }
  const ro = CHR(k), a = at(PHI[k], ro), b = at(PHI[k + 1], ro), t = b.clone().sub(a), len = t.length(), m = a.clone().add(b).multiplyScalar(0.5); t.normalize();
  const pts = rect(-len / 2 + 0.6, len / 2 - 0.6, 0.6, 15), wins = [-1, 1].map(j => lancet(j * len / 4, 3.6, Math.min(2.4, len / 4), 7));
  add(`APCHF-${k}`, 'footing', `Footing, chapel ${k + 1}`, (() => { const g = new THREE.BoxGeometry(len, 0.6, 1.6); g.rotateY(Math.atan2(-t.z, t.x)); g.translate(m.x, 0.3, m.z); return g; })(), { w: len * 1.6 * 0.6 * GAMMA, bear: len * 1.6 });
  add(`APCH-${k}`, 'wall stone', `${k === 3 ? 'Lady Chapel' : 'Apse chapel ' + (k + 1)}, outer wall`, extr(pts, wins, 0.9, m.x, m.z, t.x, t.z), { w: extrVol(pts, wins, 0.9) * GAMMA, bear: len * 0.9, sup: [[`APCHF-${k}`, 1]] });
  tri0(k, ro);
}
function tri0(k, ro) { add(`APCHR-${k}`, 'lead sheet', `Chapel roof ${k + 1}`, quadG(at(PHI[k], R2 + 0.6, 15.6), at(PHI[k + 1], R2 + 0.6, 15.6), at(PHI[k + 1], ro, 15.1), at(PHI[k], ro, 15.1)), { mat: 'lead', w: (ro - R2) * 8 * 0.004 * LEAD, sup: [[`APCH-${k}`, 1]], group: 'roof' }); }
MID.forEach(k => add(`APCS-${k}`, 'wall stone', `Chapel wall ${k}`, rbox(PHI[k], R2 + 0.6, Math.max(CHR(k - 1), CHR(k)), 0.6, 15, 0.4), { w: (RB - R2) * 0.8 * 14.4 * GAMMA, bear: (RB - R2) * 0.8, sup: [[`APFB-${k}`, 1]] }));
bag('Apse, upper');
step('Apse: walls', 'The apse walls rise on the narrow arches in seven panels: a glazed triforium and a tall window in each.');
const LVU = [18.6, 24.5, H0, (H0 + CORN) / 2, CORN];
MID.forEach(k => LVU.slice(0, -1).forEach((y0, c) => add(apId('P', k, c), 'wall-pier stone', `Apse wall pier ${k}, course ${c + 1}`, rbox(PHI[k], RI, RO, y0, LVU[c + 1], 0.55), { w: 1.4 * 1.1 * (LVU[c + 1] - y0) * GAMMA, bear: 1.54, sup: [[c ? apId('P', k, c - 1) : apId('AB', k), 1]] })));
const APTRI = [lancet(-0.45, 25.1, 0.6, 2.4), lancet(0.45, 25.1, 0.6, 2.4)], APCL = lancet(0, H0 + 1, 1.5, CORN - H0 - 2.2 - 1.3);
for (let k = 0; k < NAP; k++) { const ps = c => [[apId('P', k, c), 0.5], [apId('P', k + 1, c), 0.5]];
  panelA(`APWS-${k}`, 'spandrel', `Apse spandrel ${k + 1}`, k, R1, 20.9, 24.5, 1.4, [], 0.55, [[`APA-${k}-K`, 1]]);
  panelA(`APWT-${k}`, 'wall stone', `Apse triforium ${k + 1}`, k, R1, 24.5, H0, 1.4, APTRI, 0.55, ps(1));
  panelA(`APWC-${k}`, 'wall stone', `Apse clerestory ${k + 1}`, k, R1, H0, CORN, 1.4, [APCL], 0.55, ps(2));
  add(`APCO-${k}`, 'cornice stone', `Apse cornice ${k + 1}`, (() => { const { m, t, len } = chord(k, R1), g = new THREE.BoxGeometry(len, 0.4, 1.8); g.rotateY(Math.atan2(-t.z, t.x)); g.translate(m.x, CORN + 0.2, m.z); return g; })(), { w: 3.2 * 1.8 * 0.4 * GAMMA, bear: 5.7, sup: [[`APWC-${k}`, 1]] }); }
step('Apse: buttresses and flyers', `Six buttresses stand between the chapels, ${Math.round(RB)} m from the centre, with a pier half way on the ambulatory's outer piers. Each flyer crosses the ambulatory and the chapels in two flights.`);
MID.forEach(k => { const p = PHI[k];
  [[0.6, 13.5], [13.5, 20.5], [20.5, SEC.flyerLow]].forEach(([y0, y1], c) => add(`APBU-${k}-${c}`, 'buttress stone', `Apse buttress ${k}, course ${c + 1}`, rbox(p, RB, RB + RBD, y0, y1, 0.75), { w: RBD * 1.5 * (y1 - y0) * GAMMA, bear: RBD * 1.5, sup: [[c ? `APBU-${k}-${c - 1}` : `APFB-${k}`, 1]] }));
  add(`APBI-${k}`, 'buttress stone', `Apse flyer pier ${k}`, rbox(p, R2 - 0.6, R2 + 0.6, 13.5, YM - 0.2, 0.7), { w: 1.2 * 1.4 * (YM - 13.7) * GAMMA, bear: 1.68, sup: [[amId('AB', k), 1]] });
  const fl = (x0, x1, y0, y1, nst, tag, land, wall) => { const d = 0.45, sag = 0.5, top = x => y0 + (y1 - y0) * (x - x0) / (x1 - x0) + d / 2;
    for (let j = 0; j < nst; j++) { const a = x0 + (x1 - x0) * j / nst, b = x0 + (x1 - x0) * (j + 1) / nst, pts = [];
      for (let i = 0; i <= 6; i++) { const x = a + (b - a) * i / 6; pts.push([x, top(x)]); }
      for (let i = 6; i >= 0; i--) { const x = a + (b - a) * i / 6; pts.push([x, top(x) - d - sag * Math.sin(Math.PI * (x - x0) / (x1 - x0))]); }
      const dd = at(p, 1).sub(at(p, 0));
      add(`APFY${tag}-${k}-${j}`, 'flyer stone', `Apse flyer ${k}, stone ${j + 1}`, extr(pts, [], 0.8, 0, ZA, dd.x, dd.z), { w: extrVol(pts, [], 0.8) * GAMMA, bear: 0.36, sup: [[land, 0.5], [wall, 0.5]] }); } };
  fl(RO, R2 - 0.6, H0 - 1, YM, 5, 'L', `APBI-${k}`, apId('P', k, 1)); fl(R2 + 0.6, RB, YM, SEC.flyerLow, 5, 'O', `APBU-${k}-2`, `APBI-${k}`); });
step('Apse: pinnacles', 'Pinnacles on the buttresses and on the flyer piers.');
const pin = (id, nm, p, y0, sup) => { add(`${id}-0`, 'pinnacle stone', `${nm}, shaft`, boxG(p.x - 0.8, p.x + 0.8, y0, y0 + 3.2, p.z - 0.8, p.z + 0.8), { w: 8.2 * GAMMA, bear: 2.56, sup });
  const sp = new THREE.ConeGeometry(0.85, 7.5, 4); sp.rotateY(Math.PI / 4); sp.translate(p.x, y0 + 6.95, p.z); add(`${id}-1`, 'spire stone', `${nm}, spire`, sp, { w: 3.6 * GAMMA, bear: 1.4, sup: [[`${id}-0`, 1]] }); };
MID.forEach(k => { pin(`APPN-${k}`, `Apse pinnacle ${k}`, at(PHI[k], RB + RBD / 2), SEC.flyerLow, [[`APBU-${k}-2`, 1]]); pin(`APPI-${k}`, `Apse flyer pier pinnacle ${k}`, at(PHI[k], R2), YM - 0.2, [[`APBI-${k}`, 1]]); });
step('Apse: centering for the vault', 'A half-frame under each of the six apse ribs, from the wall to the centre.');
MID.forEach(k => { const half = ARCH.intrados.map(([x, y]) => at(PHI[k], -x, y + H0 - 0.14));
  add(`APVC-${k}`, 'centering timber', 'Apse centering, curved rib', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(half), 32, 0.13, 6, false), { mat: 'timber' });
  [0.4, 0.75].forEach((q, j) => { const c = at(PHI[k], R1 * q); add(`APVC-${k}-${j}`, 'centering timber', 'Apse centering, prop', cylG(0.1, 0.1, 0, H0 + ARCH.rise * (1 - q * q) * 0.9, c.x, c.z, 8), { mat: 'timber' }); }); });
const STEP_APV = K.at();
step('Apse: ribs and webbing', 'Six half-ribs climb from the apse wall to the keystone of the choir\'s last transverse rib, and thin webs close the seven wedges between them.');
MID.forEach(k => { const d = at(PHI[k], 1).sub(at(PHI[k], 0)), id = j => `APR${k}-L${j}`;
  archShapes(ARCH).filter(a => a.side < 0).forEach(a => { const pts = a.pts.map(([s, y]) => [s, y + H0]);
    add(id(a.j), 'voussoir', `Apse rib ${k}, voussoir ${a.j + 1}`, extr(pts, [], 0.5, 0, ZA, -d.x, -d.z), { w: a.A * 0.5 * GAMMA, bear: ARCH.t * 0.5, sup: a.j ? [[id(a.j - 1), 1]] : [[apId('P', k, 1), 1]] }); }); });
{ const trv = ribTop(ARCH, 1, H0), curve = phi => q => { const [x, y] = trv(q); return at(phi, -x, y); }, ribOf = k => k === 0 || k === NAP ? `CTR${CL.length - 1}` : `APR${k}`;
  const rp = pre => pieces.filter(p => p.id.startsWith(pre + '-')).map(p => p.id);
  [[0, 0.38], [0.38, 0.72], [0.72, 1]].forEach(([q0, q1], c) => { for (let k = 0; k < NAP; k++) {
    const g = ruled(curve(PHI[k]), curve(PHI[k + 1]), q0, q1, 6, 10), a = rp(ribOf(k)), b = rp(ribOf(k + 1));
    add(`APWEB-${k}-${c}`, 'web panel', 'Apse, vault web', g.g, { w: g.area * 0.3 * GAMMA, mat: 'web', sup: [...a.map(id => [id, 0.5 / a.length]), ...b.map(id => [id, 0.5 / b.length])] }); } }); }
step('Apse: strike the centering', 'The apse vault carries itself; the flyers take its push out over the ambulatory and the chapels.');
removeAt(p => p.step === STEP_APV);
step('Apse: roofs', 'A half-cone of lead over the apse, and a lead roof round the ambulatory.');
{ const apex = V3(0, CHOIR.RIDGE, ZA);
  [1, 2, 3, 4, 5, 6].map(k => Math.PI * k / 7).forEach((phi, i) => add(`APRF${i}`, 'rafter', 'Apse rafter', beamG(at(phi, CHOIR.RX - 0.1, CHOIR.RY + 0.36), apex, 0.3), { mat: 'oak', w: 1.2 * OAK, sup: [[`APCO-${Math.min(NAP - 1, i)}`, 1]], group: 'roof' }));
  for (let k = 0; k < NAP; k++) {
    add(`APLD-${k}`, 'lead sheet', 'Apse roof', triG(V3(0, CHOIR.RIDGE + 0.42, ZA), at(PHI[k], CHOIR.RX + 0.25, CHOIR.RY + 0.2), at(PHI[k + 1], CHOIR.RX + 0.25, CHOIR.RY + 0.2)), { mat: 'lead', w: 20 * 0.004 * LEAD, sup: [[`APCO-${k}`, 1]], group: 'roof' });
    add(`APLA-${k}`, 'lead sheet', 'Ambulatory roof', quadG(at(PHI[k], RO + 0.1, 23.2), at(PHI[k + 1], RO + 0.1, 23.2), at(PHI[k + 1], R2 + 0.6, 20.9), at(PHI[k], R2 + 0.6, 20.9)), { mat: 'lead', w: 30 * 0.004 * LEAD, sup: [[`APWS-${k}`, 1]], group: 'roof' }); } }

// ---------- The towers, 1366 and 1406 ----------
bag('Towers');
step('Towers', 'The towers were finished long after the rest: the south one in 1366, the north one, taller, in 1406. They are half-towers, standing on only half of their square bases, so they look narrow from the side. The north tower reaches 68 m, the south 61.7.');
for (const s of SIDES) { const t = NS(s), [xa, xb] = [X(s, TX0), X(s, TX1)].sort((a, b) => a - b), z0 = ZF + 1.2, z1 = ZFF, top = towerTop(s), st = s < 0 ? [47, 58, 66.5] : [47, 56, 60.2];
  const face = (id, nm, y0, y1, holes, alongX, at0, sup) => { const pts = alongX ? rect(xa, xb, y0, y1) : rect(z0, z1, y0, y1);
    return add(id, 'tower wall', nm, alongX ? extr(pts, holes, 1.6, 0, at0, 1, 0) : extr(pts, holes, 1.6, at0, 0, 0, 1), { w: extrVol(pts, holes, 1.6) * GAMMA, bear: (alongX ? xb - xa : z1 - z0) * 1.6 * 0.8, sup }); };
  const cx = (xa + xb) / 2;
  [[st[0], st[1], 'belfry'], [st[1], st[2], 'upper stage']].forEach(([y0, y1, nm], k) => {
    const wh = [lancet(cx - 2.1, y0 + 1, 2, y1 - y0 - 4.2), lancet(cx + 2.1, y0 + 1, 2, y1 - y0 - 4.2)], sh = [lancet((z0 + z1) / 2, y0 + 1, 1.3, y1 - y0 - 3.4)];
    const below = f => k ? [[`WF-T${t}${f}${k - 1}`, 1]] : [[`WF-TL${t}`, 1]];
    face(`WF-T${t}w${k}`, `${FN(s)} tower, ${nm}, west face`, y0, y1, wh, true, z1 - 0.8, below('w'));
    face(`WF-T${t}e${k}`, `${FN(s)} tower, ${nm}, east face`, y0, y1, wh, true, z0 + 0.8, below('e'));
    face(`WF-T${t}o${k}`, `${FN(s)} tower, ${nm}, outer face`, y0, y1, sh, false, X(s, TX1) + (s < 0 ? 0.8 : -0.8), below('o'));
    face(`WF-T${t}i${k}`, `${FN(s)} tower, ${nm}, inner face`, y0, y1, sh, false, X(s, TX0) + (s < 0 ? -0.8 : 0.8), below('i')); });
  const rail = rect(xa, xb, st[2], top), holes = []; for (let x = xa + 0.7; x < xb - 0.5; x += 0.9) holes.push(circle(x, (st[2] + top) / 2, 0.4, 12));
  add(`WF-T${t}rail`, 'railing', `${FN(s)} tower, railing`, extr(rail, holes, 0.4, 0, z1 - 0.2, 1, 0), { w: extrVol(rail, holes, 0.4) * GAMMA, sup: [[`WF-T${t}w1`, 1]] });
  add(`WF-T${t}top`, 'lead sheet', `${FN(s)} tower, terrace`, boxG(xa, xb, st[2], st[2] + 0.3, z0, z1), { mat: 'lead', w: 9.2 * 4.2 * 0.3 * 0.5 * GAMMA, sup: ['w', 'e', 'o', 'i'].map(f => [`WF-T${t}${f}1`, 0.25]), group: 'roof' }); }
step('West front: the nave\'s gable', 'Behind the bell-ringers\' gallery, the gable that closes the end of the nave roof.');
{ const g = [[XO - 0.4, CORN], [-XO + 0.4, CORN], [0, NAVE.RIDGE + 1]]; add('WF-NG', 'wall stone', 'Nave gable', extr(g, [circle(0, CORN + 4, 1.4, 32)], 1, 0, ZF + 0.5, 1, 0), { w: extrVol(g, [], 1) * GAMMA, bear: 18, sup: [['WF-GAL', 1]] }); }

// ---------- The chapels between the nave's buttresses, 1290s to 1375 ----------
bag('Chapels');
step('Chapels between the nave buttresses', 'From the 1290s chapels were built between the buttresses of the nave, their outer walls flush with the buttresses\' faces, each with a window and a gable.');
NAVE.chapels();

// ---------- The spire, 1533 ----------
bag('Spire');
const SPR = 3.2, oct = (k, y) => V3(SPR * Math.cos(Math.PI * k / 4 + Math.PI / 8), y, SPR * Math.sin(Math.PI * k / 4 + Math.PI / 8));
const XP = [npid('P', -1, 0, 3), npid('P', 1, 0, 3), apid(armN, 'P', -1, 0, 3), apid(armS, 'P', -1, 0, 3)];
step('Roofs over the crossing', 'The roofs of the nave, the choir and both arms meet over the crossing.');
{ const RX = NAVE.RX, RY = NAVE.RY, RIDGE = NAVE.RIDGE;
  for (const [id, ax] of [['x', [1, 0]], ['z', [0, 1]]]) { const F = frame(0, 0, ax[0] ? [1, 0] : [0, 1], ax[0] ? [0, 1] : [1, 0]);
    for (const s of SIDES) add(`XLD${id}${s < 0 ? 'a' : 'b'}`, 'lead sheet', 'Lead roof, over the crossing', quadG(F.P(X(s, -RX - 0.25), RY + 0.2, -7.1), F.P(0, RIDGE + 0.42, -7.1), F.P(0, RIDGE + 0.42, 7.1), F.P(X(s, -RX - 0.25), RY + 0.2, 7.1)), { mat: 'lead', w: 14.2 * 14 * 0.004 * LEAD, sup: XP.map(p => [p, 0.25]), group: 'roof' }); } }
step('Spire: base and lower stage', 'The first spire burned after lightning struck it in 1528. The one you see was built in 1533 of oak covered with lead, some of it gilded: eight posts on four beams across the crossing.');
[[V3(-7.1, CORN + 0.6, 7.1), V3(7.1, CORN + 0.6, 7.1), [XP[0], XP[1]]], [V3(-7.1, CORN + 0.6, -7.1), V3(7.1, CORN + 0.6, -7.1), [XP[2], XP[3]]], [V3(-7.1, CORN + 1.2, 7.1), V3(-7.1, CORN + 1.2, -7.1), [XP[0], XP[2]]], [V3(7.1, CORN + 1.2, 7.1), V3(7.1, CORN + 1.2, -7.1), [XP[1], XP[3]]]]
  .forEach(([a, b, sup], k) => add(`SPB${k}`, 'spire beam', 'Spire base beam', beamG(a, b, 0.6), { mat: 'oak', w: 0.36 * 14.2 * OAK, sup: sup.map(id => [id, 0.5]), group: 'roof' }));
const SB = [0, 1, 2, 3].map(k => [`SPB${k}`, 0.25]);
for (let k = 0; k < 8; k++) add(`SPP${k}`, 'spire post', 'Spire post', beamG(oct(k, CORN + 1.5), oct(k, 68), 0.45), { mat: 'oak', w: 0.2 * 26 * OAK, sup: SB, group: 'roof' });
{ const g = new THREE.CylinderGeometry(SPR + 0.25, SPR + 0.25, 12, 8, 1, true); g.rotateY(Math.PI / 8); g.translate(0, 61.5, 0); add('SPL0', 'lead sheet', 'Spire, lead cladding, lower stage', g, { mat: 'lead', w: 60 * 9.81, sup: [...Array(8).keys()].map(k => [`SPP${k}`, 1 / 8]), group: 'roof' });
  const c = new THREE.CylinderGeometry(SPR + 0.6, SPR + 0.6, 1.2, 8); c.rotateY(Math.PI / 8); c.translate(0, 68.6, 0); add('SPL1', 'lead sheet', 'Spire, gilded crown', c, { mat: 'gilt', w: 8 * 9.81, sup: [...Array(8).keys()].map(k => [`SPP${k}`, 1 / 8]), group: 'roof' }); }
step('Spire: needle, cross and cockerel', 'The needle tapers from 69 m to 109, and the cross and its cockerel top it at 112.7 m.');
for (let k = 0; k < 8; k++) add(`SPR${k}`, 'spire rib', 'Spire rib', beamG(oct(k, 69.2), V3(0, 109, 0), 0.35), { mat: 'oak', w: 0.12 * 41 * OAK, sup: [[`SPP${k}`, 1]], group: 'roof' });
{ const g = new THREE.ConeGeometry(SPR + 0.25, 39.8, 8, 1, true); g.rotateY(Math.PI / 8); g.translate(0, 69.2 + 19.9, 0); add('SPL2', 'lead sheet', 'Spire, lead cladding, needle', g, { mat: 'lead', w: 90 * 9.81, sup: [...Array(8).keys()].map(k => [`SPR${k}`, 1 / 8]), group: 'roof' });
  const x = new THREE.BoxGeometry(0.2, 3.2, 0.2); x.translate(0, 110.6, 0); add('SPX', 'cross', 'Cross', x, { mat: 'gilt', w: 0.5 * 9.81, sup: [...Array(8).keys()].map(k => [`SPR${k}`, 1 / 8]), group: 'roof' });
  const xa = new THREE.BoxGeometry(1.6, 0.2, 0.2); xa.translate(0, 111.2, 0); add('SPX2', 'cross', 'Cross, arm', xa, { mat: 'gilt', w: 0.1 * 9.81, sup: [['SPX', 1]], group: 'roof' });
  const ck = new THREE.SphereGeometry(0.32, 16, 12); ck.scale(1.2, 0.9, 0.6); ck.translate(0, 112.4, 0); add('SPCK', 'cockerel', 'The cockerel', ck, { mat: 'gilt', sup: [['SPX', 1]], group: 'roof' }); }

// ---------- Finishing ----------
bag('Finishing');
step('Glazing', 'Glass in every window: the aisles and chapels, the clerestories, the choir\'s glazed triforium, the apse, and the roses of the front and the transept.');
NAVE.glaze(); TRANS.glaze(); CHOIR.glaze();
add('GL-WR', 'glass panel', 'West rose glass', extr(circle(0, RY0, RR, 72), [], 0.05, 0, RZ - 0.3, 1, 0), { mat: 'glass', tint: 0 });
for (const arm of [armN, armS]) add(`GL-${arm.T}R`, 'glass panel', `${arm.name} rose glass`, extr(circle(0, 34, 5.6, 72), [], 0.05, X(arm.nave, -(TEX + TEW - 0.8)), 0, 0, 1), { mat: 'glass', tint: arm.nave < 0 ? 0 : 1 });
for (let k = 0; k < NAP; k++) { const a = chord(k, R1); add(`GL-APC-${k}`, 'glass panel', 'Stained glass', extr(APCL, [], 0.05, a.m.x, a.m.z, a.t.x, a.t.z), { mat: 'glass', tint: k % 3 });
  APTRI.forEach((h, j) => add(`GL-APT-${k}${j}`, 'glass panel', 'Stained glass', extr(h, [], 0.05, a.m.x, a.m.z, a.t.x, a.t.z), { mat: 'glass', tint: (k + j) % 3 }));
  const ro = CHR(k), p = at(PHI[k], ro), q = at(PHI[k + 1], ro), t = q.clone().sub(p), len = t.length(), m = p.clone().add(q).multiplyScalar(0.5); t.normalize();
  [-1, 1].forEach(j => add(`GL-APCH-${k}${j}`, 'glass panel', 'Stained glass', extr(lancet(j * len / 4, 3.6, Math.min(2.4, len / 4), 7), [], 0.05, m.x, m.z, t.x, t.z), { mat: 'glass', tint: (k + 2) % 3 })); }
step('Doors', 'Oak doors in the three west portals.');
PORT.forEach(([cx, w, nm], p) => [-1, 1].forEach(side => add(`DR-${p}${side}`, 'door leaf', `${nm}, door`, boxG(...(side < 0 ? [cx - w / 2 + 0.05, cx - 0.04] : [cx + 0.04, cx + w / 2 - 0.05]), 0.62, 11.2, ZFF - 1.3, ZFF - 1.15), { mat: 'oak', w: (w / 2) * 10.6 * 0.15 * OAK })));
step('Paving and the labyrinth', 'Stone paving everywhere, and in the nave the labyrinth, laid in 1288 by Renaud de Cormont: a path 240 m long, which people walked on their knees as a pilgrimage. Here it is drawn as rings, not its real path.');
NAVE.pave(); TRANS.pave(); CHOIR.pave();
add('PV-X', 'paving slab', 'Paving, crossing', boxG(XI, -XI, 0, 0.08, -7.1, 7.1), { mat: 'pave' });
for (let k = 0; k < NAP; k++) add(`PV-AP${k}`, 'paving slab', 'Paving, apse', triG(at(0, 0, 0.08), at(PHI[k], R2, 0.08), at(PHI[k + 1], R2, 0.08)), { mat: 'pave' });
{ const LZ = 35, ring = (r0, r1, id, mat) => { const o = (r, a = 0) => [...Array(8).keys()].map(k => [r * Math.cos(Math.PI * k / 4 + Math.PI / 8 + a), LZ + r * Math.sin(Math.PI * k / 4 + Math.PI / 8 + a)]);
    const sh = new THREE.Shape(o(r1).map(([a, b]) => new THREE.Vector2(a, b)));
    if (r0 > 0) sh.holes.push(new THREE.Path(o(r0).map(([a, b]) => new THREE.Vector2(a, b))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
    g.rotateX(Math.PI / 2); g.translate(0, 0.11, 0); add(id, 'labyrinth stone', 'Labyrinth', g, { mat }); };
  for (let k = 0; k < 6; k++) ring(1.2 + k, 1.7 + k, `LAB${k}`, 'dark');
  ring(0, 0.9, 'LABC', 'dark'); }

// ---------- What the page needs ----------
export const forceLines = () => [...NAVE.forceLines(), ...TRANS.forceLines(), ...CHOIR.forceLines(), ...MID.map(k => {
  const p = PHI[k], w = (x, y) => at(p, -x, y), tp = Solver.thrustPoints(ARCH, SEC.SOL.state);
  const lines = [{ pts: tp.map(([x, y]) => w(x, y + H0)), r: 0.16 }, { pts: SUPA.wall.line.filter(q => isFinite(q[0])).map(([x, y]) => w(x, y)), r: 0.13 },
    { pts: [w(XO, FLA.yA), w(FLA.xbI, FLA.yB)], r: 0.15 }, { pts: SUPA.buttress.line.filter(q => isFinite(q[0])).map(([x, y]) => w(x, y)), r: 0.13 }];
  const a = at(p, 14, 20);
  return { z: a.z, end: false, radial: true, at: a, normal: V3(Math.sin(p), 0, Math.cos(p)), lines, bases: [SUPA.wall, SUPA.buttress].map(c => w(c.x0, 0.2)) }; })];
export const STEP_STRUCK = NAVE.STEP_STRUCK;
export const HIDERS = [{ step: STEP_FRONT, west: ZF, msg: 'From the west, the front hides the vault.' }];
K.finish();
export const { live, computeLoads } = K;
export { pieces, steps };
export const KIT = { id: 'amiens', start: { title: 'An empty site in Amiens', note: 'Bishop Évrard de Fouilloy laid the first stone in 1220, after the old cathedral burned. Press Next step to set the first footing.' }, name: 'Amiens', cut: { min: -76, max: 70, value: 27 }, place: 'Notre-Dame d\'Amiens', title: 'The whole cathedral', matchup: 'Amiens, the tallest in France',
  lede: 'Amiens, built from 1220, the tallest complete cathedral in France: a vault 42 m up on piers 18 m tall, walls that are mostly glass, flyers in two tiers, a choir with double aisles and seven chapels round its apse, two unequal towers and a spire of oak and lead 112.7 m high. Every piece is a separate stone or timber, and every one carries real load.',
  about: [
    'The nave first, as the masons did from 1220: seven bays with an aisle on each side, four-part vaults 42 m up, an arcade half the height of the church, a triforium and a clerestory that is almost all glass. Its flyers come in two tiers at every buttress.',
    'The west front, 48 m wide: three deep porches under gables, the Gallery of Kings with 22 statues, a rose 13 m across, the bell-ringers\' gallery, and two half-towers finished in 1366 and 1406, the north one 68 m, the south 61.7.',
    'The transept, 70 m from end to end, with an aisle on each side of each arm, and a crossing on four great piers. Then the choir, four bays with double aisles and a glazed triforium, ending in a seven-sided apse with an ambulatory and seven chapels; its flyers cross two aisles in two flights, with a pier half way.',
    'Then the chapels between the nave buttresses, from the 1290s, the spire of 1533, and in the nave floor the labyrinth of 1288.',
    'The physics: the vault pushes out with about 50 kN for every metre, a quarter more than Notre-Dame\'s, and the buttresses take it with their base resultant at 0.37, just inside the middle third. This is about as far as Gothic went: Beauvais tried for 48 m and its vault fell in 1284.',
    'Simplified: the crossing has a plain four-part vault where Amiens has a star vault; the aisle vaults are drawn as plain curved webs; the rose tracery is rings and spokes; the half-towers are boxes with openings; the labyrinth is rings, not its real path; the upper flyers are drawn but carry nothing in the solver.'] };
