// Design your own: a cathedral as a handful of choices, and what the solver says about them. The design page draws its
// section and checks it as you change it; yours.js builds it in 3D from the same section. Pure functions: no page, no
// drawing, no geometry (gothic.js's section() only solves), so the unit tests run it in Node.
// Units: metres, kN.
import * as Solver from './solver.js?v=0.14';
import { section } from './gothic.js?v=0.14';

// ---------- The choices ----------
// towers: 0 none, 1 two towers, 2 two towers with spires. tiers: flying buttresses, 0 none, 1 one tier, 2 two tiers (one
// aisle only: over two aisles the flyers already come in two flights). crown: the top of the vault inside. The plan: a
// transept (one aisle only, for now) with arms of `arms` bays and a choir of `choir` bays east of the crossing, a spire
// over the crossing; the east end flat (east 0) or an apse (east 1).
export const DEFAULT = { name: '', crown: 36, span: 12, thick: 0.7, shape: 'pointed', wall: 1.3, aisles: 1, tiers: 1, bdepth: 3.6, bays: 7, towers: 1, chapels: false, transept: false, arms: 2, choir: 3, east: 0, spire: false };
export const LIMITS = { crown: [16, 52, 0.5], span: [9, 17, 0.2], thick: [0.3, 1.2, 0.05], wall: [0.8, 3.5, 0.1], bdepth: [1.5, 7, 0.1], bays: [3, 12, 1], arms: [1, 3, 1], choir: [2, 6, 1] };
const rise = d => d.shape === 'round' ? d.span / 2 : d.span * Math.sin(Math.PI / 3);
// the lowest vault that leaves room for an arcade, a triforium and a clerestory under it: walls at least 14 m to the springing
export const minCrown = d => Math.ceil((rise(d) + d.thick / 2 + 14) * 2) / 2;
const snap = (v, [a, b, st]) => Math.min(b, Math.max(a, Math.round(v / st) * st));
export function clamp(d) {
  const o = { ...DEFAULT, ...d };
  for (const k of ['span', 'thick', 'wall', 'bdepth', 'bays', 'arms', 'choir']) o[k] = +snap(+o[k] || DEFAULT[k], LIMITS[k]).toFixed(2);
  o.shape = o.shape === 'round' ? 'round' : 'pointed';
  o.aisles = +o.aisles === 2 ? 2 : 1;
  o.tiers = [0, 1, 2].includes(+o.tiers) ? +o.tiers : 1; if (o.aisles === 2 && o.tiers === 2) o.tiers = 1;
  o.towers = [0, 1, 2].includes(+o.towers) ? +o.towers : 1;
  const yes = v => !!v && v !== '0' && v !== 'false';
  o.chapels = yes(o.chapels); o.transept = yes(o.transept) && o.aisles === 1; o.spire = yes(o.spire) && o.transept; o.east = +o.east === 1 ? 1 : 0;
  o.crown = +Math.min(LIMITS.crown[1], Math.max(minCrown(o), snap(+o.crown || DEFAULT.crown, LIMITS.crown))).toFixed(1);
  o.name = cleanName(o.name);
  return o;
}
// a name is letters, digits, spaces and a little punctuation, so it can go anywhere on the page as it is
export const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} '.,-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);

// ---------- The link ----------
// A design fits in the address: ?d=c36-s12-t0.7-pp-w1.3-a1-f1-b3.6-n7-T1-C0&name=Saint%20Anne
const KEYS = [['c', 'crown'], ['s', 'span'], ['t', 'thick'], ['p', 'shape'], ['w', 'wall'], ['a', 'aisles'], ['f', 'tiers'], ['b', 'bdepth'], ['n', 'bays'], ['T', 'towers'], ['C', 'chapels'],
  ['X', 'transept'], ['m', 'arms'], ['h', 'choir'], ['E', 'east'], ['S', 'spire']];
const FLAGS = ['chapels', 'transept', 'spire'];
export function encode(d) {
  return KEYS.map(([k, f]) => k + (f === 'shape' ? (d.shape === 'round' ? 'r' : 'p') : FLAGS.includes(f) ? (d[f] ? 1 : 0) : d[f])).join('-');
}
export function decode(str, name) {
  const o = { name };
  for (const part of String(str || '').split('-')) { const kv = KEYS.find(([k]) => part.startsWith(k) && part.length > k.length); if (!kv) continue;
    const v = part.slice(kv[0].length); o[kv[1]] = kv[1] === 'shape' ? (v === 'r' ? 'round' : 'pointed') : v; }
  return clamp(o);
}
export const query = d => `d=${encode(d)}${d.name ? '&name=' + encodeURIComponent(d.name) : ''}`;

// ---------- The section ----------
// Everything else follows from the choices, in Amiens' proportions (its levels divided by its 30 m springing): the arcade at
// 0.62 of the springing, the aisle walls at 0.68, the aisle roofs at 0.85, the lower flyers landing at 0.87. In a low or
// narrow church the arcade comes down so its arches fit under the triforium. Aisles are 0.63 of the span, bays 0.57.
export function sectionOf(d) {
  const H0 = d.crown - rise(d) - d.thick / 2, r = Math.max(0.8, 0.55 * d.wall), ab = r + 0.2;
  const L = +Math.max(0.566 * d.span, 2 * ab + 3.2).toFixed(2), arcRise = 0.866 * (L - 2 * ab) + 0.45;
  const arcade = Math.min(0.62 * H0, H0 - 3 - arcRise - 0.5), triforium = Math.max(0.817 * H0, arcade + arcRise + 0.5);
  const aisle = 0.63 * d.span, aisleTop = 0.683 * H0, ailRise = 0.866 * (aisle - r - 0.6) + 0.25;
  const o = { shape: d.shape, span: d.span, thick: d.thick, springing: H0, wall: d.wall, aisle, aisleWall: 1.2,
    aisleSpring: Math.max(4, aisleTop - ailRise - 0.5), aisleTop, aisleRoofTop: 0.85 * H0,
    levels: { arcade, triforium, cornice: d.crown + 0.4 }, bdepth: d.bdepth, flyerLow: 0.867 * H0, flyerHigh: H0 + 3, tiers: d.tiers, chapelTop: 0.5 * H0 };
  return { o, L, sec: section(o) };
}

// ---------- The plan ----------
// Where every stretch goes, in frames that share the origin (o, u: local x across, v: local z along, as gothic.js's
// frame()), with its bay lines. Without a transept the nave runs alone, centred on the origin, west to +z. With one, the
// crossing is at the origin: piers at plus and minus c (the main piers' line) each way; the nave runs west and the choir
// east, each starting with a bay as wide as an aisle (the transept's aisle crossing it), and the arms run north and south
// the same way. The 3D build and the design page's plan both read this.
export function layoutOf(d, sec, L) {
  const c = -sec.XW, a = sec.aisle, bays = k => [c, c + a, ...Array.from({ length: k }, (_, j) => c + a + (j + 1) * L)].map(z => +z.toFixed(3));
  if (!d.transept) { const z0 = -d.bays * L / 2;
    return { c, a, runs: [{ key: 'nave', T: 'N', u: [1, 0], v: [0, 1], lines: Array.from({ length: d.bays + 1 }, (_, i) => +(z0 + i * L).toFixed(3)) }], west: { run: 'nave', last: true, out: 1 }, east: { run: 'nave', last: false, out: -1 } }; }
  return { c, a, runs: [
    { key: 'nave', T: 'N', u: [1, 0], v: [0, 1], lines: bays(d.bays) },
    { key: 'choir', T: 'C', u: [1, 0], v: [0, -1], lines: bays(d.choir) },
    { key: 'armN', T: 'TN', u: [0, 1], v: [-1, 0], lines: bays(d.arms) },
    { key: 'armS', T: 'TS', u: [0, 1], v: [1, 0], lines: bays(d.arms) },
  ], west: { run: 'nave', last: true, out: 1 }, east: { run: 'choir', last: true, out: 1 } };
}
// the apse's sides: five on a narrow church, seven on a wide one
export const apseSides = d => d.span >= 13 ? 7 : 5;

// ---------- The verdict ----------
// Calm air first, the moment the vault's centering is struck: the vault must hold its own line of thrust, and on each side
// the wall and (with flyers) the buttress must keep the resultant inside their bases. Then the first big storm, the wind on
// the roof and clerestory pushing the leeward side. Outside the middle third a joint opens (cracks); outside the base the
// pier tips (falls).
export function assess(d) {
  d = clamp(d);
  const { o, L, sec } = sectionOf(d), n = d.aisles, tmin = Solver.minThickness({ shape: d.shape, span: d.span, count: 11 });
  const a = { d, o, L, sec, tmin, crown: sec.crown, H: sec.SOL.state.H, F: sec.storm.F, ok: sec.SOL.ok };
  a.calm = sec.supports(n); a.storm = sec.supports(n, true);
  const fails = c => c.buttress && c.buttress.verdict === 'overturns' ? 'buttress' : c.wall.verdict === 'overturns' ? 'wall' : null;
  a.falls = !a.ok ? { when: 'strike', what: 'vault' } : fails(a.calm) ? { when: 'strike', what: fails(a.calm) } : fails(a.storm) ? { when: 'storm', what: fails(a.storm) } : null;
  a.cracks = [];
  if (!a.falls) for (const when of ['calm', 'storm']) for (const what of ['wall', 'buttress']) if (a[when][what] && a[when][what].verdict === 'cracks') a.cracks.push({ when, what });
  a.verdict = a.falls ? 'falls' : a.cracks.length ? 'cracks' : 'stands';
  return a;
}

// ---------- In words ----------
// where the push lands on a base, as a share of its width from the outer face
export const lands = c => c.verdict === 'overturns' ? 'outside the base' : `at ${Math.round(c.e * 100)}% of the base, ${c.verdict === 'solid' ? 'inside the middle third' : 'outside the middle third'}`;
// what would save a design that falls
export function advise(a) {
  const f = a.falls, d = a.d, upper = f && f.when === 'storm' && d.tiers === 1 && d.aisles === 1;
  if (!f) return '';
  if (f.what === 'vault') return `A vault at least ${a.tmin.toFixed(2)} m deep would hold${d.shape === 'round' ? ', or a pointed one, which needs less' : ''}.`;
  if (f.what === 'buttress') return `Deeper buttresses would hold it${upper ? ', or an upper tier of flyers to take the wind' : ''}.`;
  if (!d.tiers) return 'Thicker walls would hold it, or flying buttresses.';
  return upper ? 'An upper tier of flyers would take the wind on the roof, or thicker walls.' : 'Thicker walls would hold it.';
}
// the verdict as the design page shows it: [tone, label, sentence]
export function summary(a) {
  const f = a.falls;
  if (f && f.what === 'vault') return ['bad', 'Falls when struck', `No line of thrust fits inside a vault ${a.d.thick.toFixed(2)} m deep: this shape needs ${a.tmin.toFixed(2)} m. The joints open into hinges and the vault folds.`];
  if (f) return ['bad', f.when === 'storm' ? 'Falls in the storm' : 'Falls when struck', `${f.when === 'storm' ? `The storm's wind on the roof adds ${Math.round(a.F)} kN per metre on the lee side, and the` : 'When the centering comes out, the'} push lands outside the base of the ${f.what}: it tips. ${advise(a)}`];
  if (a.cracks.length) return ['warn', 'Stands, cracked', `It stands, but the push lands outside the middle third of the ${[...new Set(a.cracks.map(c => c.what))].join(' and the ')}'s base ${a.cracks.every(c => c.when === 'storm') ? 'in the storm' : a.cracks.every(c => c.when === 'calm') ? 'in calm air' : 'in calm air and in the storm'}, so a joint there opens on the inside.`];
  return ['good', 'Stands', 'Every base presses down along its whole width, in calm air and in a 40 m/s storm.'];
}

// ---------- To compare with ----------
// Vault heights inside, to the crown: Notre-Dame de Paris 33 m, Chartres 37, Reims 38, Amiens 42.3, Beauvais 48 (its
// choir, 1272; the vault fell in 1284 and was rebuilt with extra piers).
export const REFS = [['Notre-Dame', 33], ['Chartres', 37], ['Reims', 38], ['Amiens', 42.3], ['Beauvais', 48]];

export const CHALLENGES = [
  { id: 'stand', title: 'Make it stand', note: 'Any design that survives the strike and the storm.', test: a => !a.falls },
  { id: 'paris', title: 'Higher than Notre-Dame', note: 'A vault above 33 m that stands.', test: a => !a.falls && a.crown > 33 },
  { id: 'nocrack', title: 'Not one crack', note: 'Over 33 m, every base in its middle third, even in the storm.', test: a => a.verdict === 'stands' && a.crown > 33 },
  { id: 'amiens', title: 'Higher than Amiens', note: 'Above 42.3 m and at least as wide, 13.6 m.', test: a => !a.falls && a.crown > 42.3 && a.d.span >= 13.6 },
  { id: 'beauvais', title: 'Where Beauvais fell', note: '48 m up and 15 m wide, and no cracks.', test: a => a.verdict === 'stands' && a.crown >= 48 && a.d.span >= 15 },
  { id: 'roman', title: 'No flying buttresses', note: 'A vault 25 m up on walls alone.', test: a => !a.falls && a.d.tiers === 0 && a.crown >= 25 },
  { id: 'round', title: 'Round arches, 30 m up', note: 'The Romanesque shape, carried high.', test: a => !a.falls && a.d.shape === 'round' && a.crown >= 30 },
  { id: 'shell', title: 'A shell of stone', note: 'A vault 0.5 m deep or less that stands.', test: a => !a.falls && a.d.thick <= 0.5 },
];

// ---------- Places to start ----------
export const PRESETS = [
  { id: 'paris', title: 'Like Notre-Dame', note: '33 m, two aisles, one long flyer over both, an apse.', d: { crown: 33, span: 12, thick: 0.7, shape: 'pointed', wall: 1.2, aisles: 2, tiers: 1, bdepth: 3.8, bays: 10, towers: 1, chapels: true, transept: false, east: 1, spire: false } },
  { id: 'amiens', title: 'Like Amiens', note: '42 m, two tiers of flyers, a transept, an apse and a spire.', d: { crown: 42.2, span: 13.6, thick: 0.8, shape: 'pointed', wall: 1.4, aisles: 1, tiers: 2, bdepth: 4, bays: 6, towers: 1, chapels: true, transept: true, arms: 2, choir: 3, east: 1, spire: true } },
  { id: 'beauvais', title: 'Like Beauvais', note: '48 m, the highest ever tried: a choir and an apse.', d: { crown: 48, span: 15, thick: 0.8, shape: 'pointed', wall: 1.4, aisles: 2, tiers: 1, bdepth: 4, bays: 4, towers: 0, chapels: true, transept: false, east: 1, spire: false } },
  { id: 'roman', title: 'Romanesque', note: 'Round arches on thick walls, no flyers, a cross plan.', d: { crown: 22, span: 10, thick: 0.7, shape: 'round', wall: 2.6, aisles: 1, tiers: 0, bdepth: 2, bays: 6, towers: 2, chapels: false, transept: true, arms: 1, choir: 2, east: 1, spire: false } },
];
