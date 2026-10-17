// How a wood-framed house carries its load: the lumber, the loads today's rules design for, and a check for each kind of
// member (a joist or rafter bending, a stud or steel post squeezed, a footing pressing on the soil). Plain functions:
// the house's 3D page and the unit tests both run them. Units are the framer's: inches for lumber, feet for spans,
// pounds for loads, as the 1972 drawings give them.
//
// Each check returns util, the share of its allowable strength the member uses: 1 means it is at today's allowable value,
// which already keeps a margin (a wood beam typically breaks at two to three times it).

// nominal size: actual width and depth in inches (a 2x10 is 1.5 by 9.25 since the 1960s)
export const SIZES = { '2x4': [1.5, 3.5], '2x6': [1.5, 5.5], '2x8': [1.5, 7.25], '2x10': [1.5, 9.25], '2x12': [1.5, 11.25], '4x6': [3.5, 5.5], '8x10': [7.5, 9.5] };
export function section(size, ply = 1) {
  const [b0, d] = SIZES[size], b = b0 * ply;
  return { b, d, A: b * d, S: b * d * d / 6, I: b * d * d * d / 12 };
}
// design values, psi, from today's tables (the NDS supplement): No. 2 spruce-pine-fir for the 2x framing, No. 1 Douglas
// fir-larch for the big timber. The size factor CF raises a smaller piece's bending and crushing values.
export const GRADES = {
  spf2: { name: 'No. 2 spruce-pine-fir', Fb: 875, Fv: 135, Fc: 1150, E: 1.4e6, Emin: 510000,
    CFb: { '2x4': 1.5, '2x6': 1.3, '2x8': 1.2, '2x10': 1.1, '2x12': 1.0 }, CFc: { '2x4': 1.15, '2x6': 1.1, '2x8': 1.05, '2x10': 1.0, '2x12': 1.0 } },
  dfl1: { name: 'No. 1 Douglas fir-larch timber', Fb: 1200, Fv: 170, Fc: 1000, E: 1.6e6, Emin: 580000, CFb: {}, CFc: {} },
};
// how long a load lasts changes what wood takes: people and furniture for ten years, snow for two months, a roofer for a week
export const DURATION = { floor: 1.0, snow: 1.15, roof: 1.25 };
// the loads, lb per square foot: today's design loads for a house (the IRC) and the weights of the parts
export const LOADS = {
  live: 40,          // living rooms, kitchen, halls
  sleeping: 30,      // bedrooms
  attic: 10,         // an attic with no floor for storage
  roofLive: 20,      // a roofer and his bundles
  floorDead: 10,     // joists, subfloor, oak floor, the ceiling below
  ceilingDead: 10,   // ceiling joists, plaster board, insulation
  roofDead: 12,      // rafters, sheathing and shingles, per square foot of plan
  wallDead: 8,       // a framed wall with its sheathing, siding and plaster board, per square foot of wall
  concrete: 150,     // lb per cubic foot
};
// what the soil takes, psf: sandy gravel, an assumption (the lot's soil was never tested for this page)
export const SOIL = 3000;
// settled snow weighs about 15 lb per cubic foot; fresh powder a third of that
export const snowLoad = (inches, density = 15) => inches / 12 * density;

// A joist, rafter, header or girder on a simple span. span: feet, measured level; w: the whole load on it, lb per foot of
// its length (measured level); wLive: the part that counts for sag. ply: pieces side by side. rep: one of many at 12 to
// 24 inches, which share a load (+15%). limit: allowed sag, span over 360 for a floor, 240 for a ceiling, 180 for a roof.
export function beam({ size, grade = 'spf2', ply = 1, span, w, wLive = w, duration = 'floor', rep = true, limit = 360 }) {
  const s = section(size, ply), g = GRADES[grade], L = span * 12, wi = w / 12, CD = DURATION[duration];
  const M = wi * L * L / 8, V = wi * L / 2;
  const Fb = g.Fb * CD * (g.CFb[size] ?? 1) * (rep ? 1.15 : 1), Fv = g.Fv * CD;
  const fb = M / s.S, fv = 1.5 * V / s.A;
  const sag = 5 * (wLive / 12) * L * L * L * L / (384 * g.E * s.I), sagLimit = L / limit;
  const bend = fb / Fb, shear = fv / Fv, deflect = sag / sagLimit;
  return { kind: 'beam', M, V, fb, Fb, fv, Fv, sag, sagLimit, bend, shear, deflect, util: Math.max(bend, shear, deflect), span, total: w * span };
}

// A stud or post squeezed end to end (the column formula of today's wood rules). height: feet; P: lb; braced: true when
// sheathing holds it sideways, so it can only bow across its depth.
export function post({ size, grade = 'spf2', height, P, duration = 'floor', braced = true }) {
  const s = section(size), g = GRADES[grade], CD = DURATION[duration];
  const le = height * 12, dd = braced ? s.d : Math.min(s.b, s.d);
  const Fcs = g.Fc * CD * (g.CFc[size] ?? 1), FcE = 0.822 * g.Emin / ((le / dd) * (le / dd)), a = FcE / Fcs, c = 0.8;
  const Cp = (1 + a) / (2 * c) - Math.sqrt(((1 + a) / (2 * c)) * ((1 + a) / (2 * c)) - a / c);
  const cap = Fcs * Cp * s.A;
  return { kind: 'post', P, cap, Cp, util: P / cap };
}

// A steel column (the drawings' 3 1/2 inch lally column: steel pipe, filled with concrete). Counted on the steel alone,
// with today's steel rules (AISC, allowable strength), so the concrete is spare. od, t: inches; height: feet.
export function steelColumn({ od = 3.5, t = 0.216, height, P, Fy = 35000, E = 29e6 }) {
  const id = od - 2 * t, A = Math.PI / 4 * (od * od - id * id), I = Math.PI / 64 * (od * od * od * od - id * id * id * id);
  const r = Math.sqrt(I / A), KLr = height * 12 / r, Fe = Math.PI * Math.PI * E / (KLr * KLr);
  const Fcr = Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;
  const cap = Fcr * A / 1.67;
  return { kind: 'steel', P, cap, KLr, util: P / cap };
}

// A footing on the soil: P in lb on an area in square feet, or w in lb per foot along a wall footing width feet wide.
export function footing({ P, area, w, width, soil = SOIL }) {
  const q = P != null ? P / area : w / width;
  return { kind: 'footing', q, soil, util: q / soil };
}
