// Math the engine can trust to give the same bits everywhere.
//
// JavaScript fixes +, -, *, / and Math.sqrt to the exact IEEE 754 result, but leaves Math.sin, cos, atan2,
// exp, log and pow to each browser: Chromium 156 and Node 26 (V8 14.6) already disagree in the last bit for
// a fifth of all inputs, and Firefox and Safari use other libraries again. One differing bit early in a game
// is enough to change how it ends, so a seeded game would play differently in Node, in each browser and after
// a browser update. These are ports of fdlibm (the library V8 itself long used), built only from exact
// operations, so the same seed plays the same game in all of them. Each is within about one unit in the last
// place of the true value, which is as accurate as the built-ins.

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HI = LE ? 1 : 0, LO = LE ? 0 : 1;
const hiWord = x => { f64[0] = x; return u32[HI] | 0; };
const loWord = x => { f64[0] = x; return u32[LO] | 0; };
const withHi = (x, hi) => { f64[0] = x; u32[HI] = hi; return f64[0]; };
const fromWords = (hi, lo) => { u32[HI] = hi; u32[LO] = lo; return f64[0]; };
const pow2 = k => fromWords((k + 1023) << 20, 0);   // 2^k for -1022 <= k <= 1023

// ---------- sin and cos ----------
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
// sin and cos of x + y on [-pi/4, pi/4], where y is the tail of x
function kSin(x, y, iy) {
  if (Math.abs(x) < 3.725290298461914e-09) return x;   // 2^-28
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
function kCos(x, y) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1;   // |x| < 2^-27
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));   // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);   // x/4, rounded down
  const hz = 0.5 * z - qx, a = 1 - qx;
  return a - (hz - (z * r - x * y));
}
// x reduced to [-pi/4, pi/4]: returns the quadrant and sets RY0 + RY1, using pi/2 in four pieces
// (exact for the engine's angles, which stay far below 2^20 * pi/2)
const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_2 = 6.07710050630396597660e-11,
  pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;
let RY0 = 0, RY1 = 0;
function reduce(x) {
  const t = Math.abs(x), n = Math.floor(t * invpio2 + 0.5), fn = n;
  let r = t - fn * pio2_1, w = fn * pio2_2;
  let u = r; r = u - w; w = fn * pio2_2t - ((u - r) - w);
  u = r; w = fn * pio2_3; r = u - w; w = fn * pio2_3t - ((u - r) - w);
  const y0 = r - w, y1 = (r - y0) - w;
  if (x < 0) { RY0 = -y0; RY1 = -y1; return -n; }
  RY0 = y0; RY1 = y1; return n;
}
export function sin(x) {
  if (Math.abs(x) <= 0.7853981633974483) return kSin(x, 0, 0);
  if (!isFinite(x)) return NaN;
  const n = reduce(x) & 3;
  return n === 0 ? kSin(RY0, RY1, 1) : n === 1 ? kCos(RY0, RY1) : n === 2 ? -kSin(RY0, RY1, 1) : -kCos(RY0, RY1);
}
export function cos(x) {
  if (Math.abs(x) <= 0.7853981633974483) return kCos(x, 0);
  if (!isFinite(x)) return NaN;
  const n = reduce(x) & 3;
  return n === 0 ? kCos(RY0, RY1) : n === 1 ? -kSin(RY0, RY1, 1) : n === 2 ? -kCos(RY0, RY1) : kSin(RY0, RY1, 1);
}

// ---------- atan and atan2 ----------
const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
export function atan(x) {
  if (x !== x) return x;
  let ax = Math.abs(x), id;
  if (ax >= 7.378697629483821e+19) return x > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3];   // 2^66
  if (ax < 0.4375) { if (ax < 1.862645149230957e-09) return x; id = -1; }   // 2^-29
  else if (ax < 1.1875) { if (ax < 0.6875) { id = 0; ax = (2 * ax - 1) / (2 + ax); } else { id = 1; ax = (ax - 1) / (ax + 1); } }
  else if (ax < 2.4375) { id = 2; ax = (ax - 1.5) / (1 + 1.5 * ax); }
  else { id = 3; ax = -1 / ax; }
  const z = ax * ax, w = z * z;
  const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = atanhi[id] - ((ax * (s1 + s2) - atanlo[id]) - ax);
  return x < 0 ? -r : r;
}
const PI = 3.1415926535897931160E+00, PI_LO = 1.2246467991473531772E-16, PI_O_2 = 1.5707963267948965580E+00;
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const yNeg = y < 0 || Object.is(y, -0), xNeg = x < 0 || Object.is(x, -0);
  if (y === 0) return !xNeg ? y : yNeg ? -PI : PI;
  if (x === 0) return yNeg ? -PI_O_2 : PI_O_2;
  if (!isFinite(x)) {
    if (!isFinite(y)) return (x > 0 ? PI / 4 : 3 * PI / 4) * (yNeg ? -1 : 1);
    return x > 0 ? (yNeg ? -0 : 0) : yNeg ? -PI : PI;
  }
  if (!isFinite(y)) return yNeg ? -PI_O_2 : PI_O_2;
  const k = ((hiWord(y) >> 20) & 0x7ff) - ((hiWord(x) >> 20) & 0x7ff);
  const z = k > 60 ? PI_O_2 + 0.5 * PI_LO : x < 0 && k < -60 ? 0 : atan(Math.abs(y / x));
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? (z - PI_LO) - PI : PI - (z - PI_LO);
}

// ---------- exp, log, pow ----------
const ln2HI = 6.93147180369123816490e-01, ln2LO = 1.90821492927058770002e-10, invln2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
export function exp(x) {
  if (x !== x) return x;
  if (x > 7.09782712893383973096e+02) return Infinity;
  if (x < -7.45133219101941108420e+02) return 0;
  const ax = Math.abs(x), neg = x < 0;
  let hi = 0, lo = 0, k = 0;
  if (ax > 0.34657359027997264) {   // 0.5 ln2
    if (ax < 1.0397207708399179) { hi = x - (neg ? -ln2HI : ln2HI); lo = neg ? -ln2LO : ln2LO; k = neg ? -1 : 1; }   // 1.5 ln2
    else { k = Math.trunc(invln2 * x + (neg ? -0.5 : 0.5)); hi = x - k * ln2HI; lo = k * ln2LO; }
    x = hi - lo;
  } else if (ax < 3.725290298461914e-09) return 1 + x;   // 2^-28
  const t = x * x, c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - ((lo - (x * c) / (2 - c)) - hi);
  if (k >= -1021) return k === 1024 ? y * 2 * pow2(1023) : y * pow2(k);
  return y * pow2(k + 1000) * pow2(-1000);
}
const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10, two54 = 1.80143985094819840000e+16;
const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
  Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;
export function log(x) {
  let hx = hiWord(x), k = 0;
  const lx = loWord(x);
  if (hx < 0x00100000) {   // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= two54; hx = hiWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000));   // x or x/2, near 1
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {   // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : k * ln2_hi + k * ln2_lo;
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - R : k * ln2_hi - ((R - k * ln2_lo) - f);
  }
  const s = f / (2 + f), dk = k, z = s * s, w = z * z;
  i = hx - 0x6147a; const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7))), R = t2 + t1;
  if ((i | j) > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + R)) : dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}
// x^y for x >= 0, the only case the engine needs (a quality to a power, a friction factor to a time).
// Not fdlibm's pow: exp(y log x) loses a few bits when y log x is large, which is far below anything the
// engine can feel, and it is still the same in every browser.
export function pow(x, y) {
  if (y === 0) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x === 1) return 1;
  if (x < 0 || x !== x || y !== y) return NaN;
  return exp(y * log(x));
}
// sqrt(x^2 + y^2) with exact operations only (the engine's distances never come near overflow)
export const hypot = (x, y) => Math.sqrt(x * x + y * y);
