// Keystone's masonry solver: rigid-block limit analysis (Heyman). Pure functions, no page, no drawing.
// Both Keystone pages import it, and the unit tests run it in Node (tools/test/keystone.test.js).
// Units: metres, kN, per metre depth. Arch springs at y = 0, centred on x = 0.
export const GAMMA = 22;          // limestone, kN/m3
export const FRICTION_DEG = 35;   // friction angle between dressed stones, degrees

function centerline(shape, S) {
  if (shape === 'round') {
    const R = S / 2;
    return { uCrown: Math.PI / 2, uMax: Math.PI / 2 + 0.7,
      p: u => [-R * Math.cos(u), R * Math.sin(u)],
      n: u => [-Math.cos(u), Math.sin(u)], rise: R };
  }
  if (shape === 'pointed') { // equilateral Gothic: each half centred on the opposite springing
    return { uCrown: Math.PI / 3, uMax: Math.PI / 3 + 0.7,
      p: u => [S / 2 - S * Math.cos(u), S * Math.sin(u)],
      n: u => [-Math.cos(u), Math.sin(u)], rise: S * Math.sin(Math.PI / 3) };
  }
  // catenary with the same rise as the pointed arch
  const f = S * Math.sin(Math.PI / 3);
  let lo = 0.01 * S, hi = 100 * S; // solve a(cosh(S/2a)-1) = f, decreasing in a
  for (let i = 0; i < 200; i++) { const a = (lo + hi) / 2; (a * (Math.cosh(S / (2 * a)) - 1) > f) ? lo = a : hi = a; }
  const a = (lo + hi) / 2;
  return { uCrown: S / 2, uMax: S / 2 + 0.4 * S,
    p: u => { const x = u - S / 2; return [x, f - a * (Math.cosh(x / a) - 1)]; },
    n: u => { const x = u - S / 2, d = -Math.sinh(x / a), m = Math.hypot(1, d); return [-d / m, 1 / m]; },
    rise: f };
}

function off(c, u, side, t) { const [px, py] = c.p(u), [nx, ny] = c.n(u); return [px + side * nx * t / 2, py + side * ny * t / 2]; }

function crossing(c, side, t) { // u where the offset curve reaches x = 0
  let lo = 0, hi = c.uMax;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; off(c, m, side, t)[0] < 0 ? lo = m : hi = m; }
  return (lo + hi) / 2;
}

function polyArea(P) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], k = x1 * y2 - x2 * y1;
    A += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
  }
  A /= 2; return { A: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) };
}

// Build the left half: joints from springing (0) to k, half-keystone, blocks.
export function build({ shape, span: S, thick: t, count: n }) {
  const c = centerline(shape, S), k = (n - 1) / 2;
  const N = 1500, us = [], ss = [0];
  for (let i = 0; i <= N; i++) us.push(c.uCrown * i / N);
  for (let i = 1; i <= N; i++) { const a = c.p(us[i - 1]), b = c.p(us[i]); ss.push(ss[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = ss[N], l = 2 * L / n;
  const uAt = s => { let i = 1; while (i < N && ss[i] < s) i++; const f = (s - ss[i - 1]) / (ss[i] - ss[i - 1] || 1); return us[i - 1] + f * (us[i] - us[i - 1]); };
  const ju = []; for (let j = 0; j <= k; j++) ju.push(uAt(j * l));
  const joints = ju.map(u => { const A = off(c, u, -1, t), B = off(c, u, 1, t), nn = c.n(u);
    return { u, A, B, incl: Math.atan2(nn[1], -nn[0]) * 180 / Math.PI }; });
  const uI = crossing(c, -1, t), uE = crossing(c, 1, t);
  const arc = (u0, u1, side, m = 10) => { const r = []; for (let i = 0; i <= m; i++) r.push(off(c, u0 + (u1 - u0) * i / m, side, t)); return r; };
  const blocks = [];
  for (let j = 0; j < k; j++) {
    const poly = [...arc(ju[j], ju[j + 1], 1), ...arc(ju[j], ju[j + 1], -1).reverse()];
    blocks.push({ poly, ...polyArea(poly) });
  }
  const keyHalf = [...arc(ju[k], uE, 1), [0, off(c, uE, 1, t)[1]], [0, off(c, uI, -1, t)[1]], ...arc(ju[k], uI, -1).reverse()];
  const key = { poly: keyHalf, ...polyArea(keyHalf) };
  const lE = arc(ju[k], uE, 1), lI = arc(ju[k], uI, -1), mir = p => [-p[0], p[1]];
  key.full = [...lE, ...lE.map(mir).reverse(), ...lI.map(mir), ...lI.slice().reverse()];
  const intrados = arc(0, uI, -1, 60), extrados = arc(0, uE, 1, 60);
  const crown = { yI: off(c, uI, -1, t)[1], yE: off(c, uE, 1, t)[1] };
  // cumulative loads from crown down to each joint
  const cum = []; let W = key.A * GAMMA, Mx = key.A * GAMMA * key.cx;
  cum[k] = { W, xc: Mx / W };
  for (let j = k - 1; j >= 0; j--) { const b = blocks[j]; W += b.A * GAMMA; Mx += b.A * GAMMA * b.cx; cum[j] = { W, xc: Mx / W }; }
  return { shape, S, t, n, k, c, joints, blocks, key, crown, cum, Wh: W, rise: c.rise, intrados, extrados };
}

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export function sigmas(arch, H, y0) {
  return arch.joints.map((J, j) => {
    const { W, xc } = arch.cum[j], d = [-H, -W], e = [J.B[0] - J.A[0], J.B[1] - J.A[1]];
    return cross([xc - J.A[0], y0 - J.A[1]], d) / cross(e, d);
  });
}

const marginOf = sg => { let m = Infinity; for (const s of sg) m = Math.min(m, s, 1 - s); return m; };

// For a crown height y0, every joint's sigma is a ratio of two linear functions of H,
// so the H values where it hits 0, 1 or a pole split the line into intervals of constant
// pass/fail. Test each interval and return the smallest feasible H (or null).
function minFeasibleH(arch, y0) {
  const crit = [];
  arch.joints.forEach((J, j) => {
    const { W, xc } = arch.cum[j], px = xc - J.A[0], py = y0 - J.A[1], ex = J.B[0] - J.A[0], ey = J.B[1] - J.A[1];
    if (Math.abs(py) > 1e-12) crit.push(px * W / py);
    if (Math.abs(py - ey) > 1e-12) crit.push((px - ex) * W / (py - ey));
    if (Math.abs(ey) > 1e-12) crit.push(ex * W / ey);
  });
  const pts = [...new Set(crit.filter(h => h > 0 && isFinite(h)))].sort((a, b) => a - b);
  const lo = arch.Wh * 1e-4, hi = arch.Wh * 1e4, edges = [lo, ...pts.filter(h => h > lo && h < hi), hi];
  const tol = 1e-9;
  for (let i = 0; i < edges.length; i++) {
    // test the critical point itself (touching is allowed), then the open interval after it
    for (const H of [edges[i], i + 1 < edges.length ? (edges[i] + edges[i + 1]) / 2 : null]) {
      if (H == null) continue;
      if (marginOf(sigmas(arch, H, y0)) >= -tol) return H;
    }
  }
  return null;
}

// Minimum-thrust state over all crown heights, plus the most comfortable state (max margin).
export function solve(arch, opts = {}) {
  const ny = opts.ny || 61, { yI, yE } = arch.crown;
  let minH = null;
  for (let a = 0; a < ny; a++) {
    const y0 = yI + (yE - yI) * a / (ny - 1), H = minFeasibleH(arch, y0);
    if (H != null && (!minH || H < minH.H)) minH = { H, y0 };
  }
  let best = null;
  if (!opts.fast) {
    for (let a = 0; a < 31; a++) {
      const y0 = yI + (yE - yI) * a / 30;
      for (let b = 0; b < 240; b++) {
        const H = arch.Wh * 0.01 * Math.pow(3000, b / 239), sg = sigmas(arch, H, y0), m = marginOf(sg);
        if (!best || m > best.margin) best = { H, y0, sg, margin: m };
      }
    }
  }
  if (minH) { minH.sg = sigmas(arch, minH.H, minH.y0); minH.margin = marginOf(minH.sg); }
  return { ok: !!minH, state: minH || best, best };
}

export function minThickness(p) {
  let lo = 0.002 * p.span, hi = 0.5 * p.span;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    solve(build({ ...p, thick: m }), { fast: true }).ok ? hi = m : lo = m;
  }
  return hi;
}

// Thrust-line points at each joint, left half, crown first.
export function thrustPoints(arch, st) {
  const pts = [[0, st.y0]];
  for (let j = arch.k; j >= 0; j--) { const J = arch.joints[j], s = st.sg[j]; pts.push([J.A[0] + s * (J.B[0] - J.A[0]), J.A[1] + s * (J.B[1] - J.A[1])]); }
  return pts;
}

// A rectangular pier on the LEFT side: outer toe at xo, width w, height h, plus point loads
// {x, y, Fx, Fy} applied at or below its top. Returns the line of the resultant through it.
export function pierCheck(xo, w, h, loads) {
  const xc = xo + w / 2;
  const at = y => {
    let Fy = -GAMMA * w * (h - y), M = Fy * xc;
    for (const L of loads) if (L.y >= y - 1e-9) { Fy += L.Fy; M += L.x * L.Fy - (L.y - y) * L.Fx; }
    return Fy < 0 ? M / Fy : NaN;
  };
  const line = []; for (let i = 0; i <= 40; i++) { const y = h - h * i / 40; line.push([at(y), y]); }
  const x0 = at(0), e = (x0 - xo) / w; // 0 = outer toe, 1 = inner face
  const verdict = !(e >= 0 && e <= 1) ? 'overturns' : (e < 1 / 3 || e > 2 / 3) ? 'cracks' : 'solid';
  return { xo, w, h, x0, e, verdict, line };
}

// Wall under the left springing, optionally with a flying buttress to an outer buttress pier.
export function supports(arch, st, { height: h, width: w, flyer, bdepth: wb, pinnacle }) {
  const J0 = arch.joints[0], xi = J0.A[0], xo = xi - w;
  const xs = J0.A[0] + st.sg[0] * (J0.B[0] - J0.A[0]), H = st.H;
  const wallLoads = [{ x: xs, y: h, Fx: -H, Fy: -arch.Wh }];
  const out = { xi, xo, h, w, xs, H, V: arch.Wh };
  if (flyer) {
    const g = 0.4 * arch.S, hb = 0.8 * h, xbI = xo - g, xbO = xbI - wb;
    const yA = h - Math.min(1, 0.08 * h), yB = hb, s = (yA - yB) / g;
    wallLoads.push({ x: xo, y: yA, Fx: H, Fy: H * s });
    const pw = wb * 0.5, ph = pinnacle ? Math.max(3, 0.3 * hb) : 0, Wpin = pinnacle ? GAMMA * pw * ph * 0.6 : 0;
    const bLoads = [{ x: xbI, y: yB, Fx: -H, Fy: -H * s }];
    if (pinnacle) bLoads.push({ x: xbO + wb / 2, y: hb, Fx: 0, Fy: -Wpin });
    out.flyer = { g, hb, xbI, xbO, wb, yA, yB, slope: s, C: H * Math.hypot(1, s), pw, ph, Wpin };
    out.buttress = pierCheck(xbO, wb, hb, bLoads);
  }
  out.wall = pierCheck(xo, w, h, wallLoads);
  return out;
}
