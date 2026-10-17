// The road, built from the corner list in data/track.json. Pure functions, no page and no 3D, so the checks run it in Node.
//
// A smooth curve runs through the hand-traced points (centripetal Catmull-Rom), scaled to the real lap length and then
// shrunk to game size. Heights ease between the points, crests add a short sharp bump (the jumps), and banking eases
// between the points that have it.
//
// Coordinates: x east, z south, y up. Heading h: forward is (cos h, sin h) in x and z, so a right turn raises h.

const D2R = Math.PI / 180;

export function buildTrack(T) {
  const B = Object.fromEntries(Object.entries(T.build).map(([k, v]) => [k, v.value]));
  const P = T.points;
  // a centripetal Catmull-Rom curve through the points (x east, z south, in metres), with a phantom point at each end
  const C = P.map(p => [p.p[0] * 1000, -p.p[1] * 1000]);
  const ext = [[2 * C[0][0] - C[1][0], 2 * C[0][1] - C[1][1]], ...C, [2 * C.at(-1)[0] - C.at(-2)[0], 2 * C.at(-1)[1] - C.at(-2)[1]]];
  const dense = [], du = [];
  const STEPS = 40;
  for (let i = 0; i < C.length - 1; i++) {
    const [p0, p1, p2, p3] = [ext[i], ext[i + 1], ext[i + 2], ext[i + 3]];
    const td = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
    const t0 = 0, t1 = td(p0, p1), t2 = t1 + td(p1, p2), t3 = t2 + td(p2, p3);
    for (let j = 0; j < STEPS; j++) {
      const t = t1 + (t2 - t1) * j / STEPS;
      const L = (a, b, ta, tb) => [0, 1].map(c => ((tb - t) * a[c] + (t - ta) * b[c]) / (tb - ta));
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      dense.push(L(B1, B2, t1, t2)); du.push(i + j / STEPS);
    }
  }
  dense.push(C.at(-1)); du.push(C.length - 1);
  // arc length, scaled so the line is the real lap's length, then to game metres
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const scale = B.realLength / cum.at(-1) * B.lengthScale;
  const L = cum.at(-1) * scale;
  const n = Math.round(L / B.sample) + 1, ds = L / (n - 1);
  const x = new Float64Array(n), z = new Float64Array(n), u = new Float64Array(n);
  { let j = 0; for (let k = 0; k < n; k++) { const s = k * ds / scale; while (j < dense.length - 2 && cum[j + 1] < s) j++; const a = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1); x[k] = (dense[j][0] + (dense[j + 1][0] - dense[j][0]) * a) * scale; z[k] = (dense[j][1] + (dense[j + 1][1] - dense[j][1]) * a) * scale; u[k] = du[j] + (du[j + 1] - du[j]) * a; } }
  const h = new Float64Array(n), curv = new Float32Array(n);
  for (let k = 0; k < n; k++) { const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1); h[k] = Math.atan2(z[b] - z[a], x[b] - x[a]); }
  for (let k = 1; k < n; k++) { while (h[k] - h[k - 1] > Math.PI) h[k] -= 2 * Math.PI; while (h[k] - h[k - 1] < -Math.PI) h[k] += 2 * Math.PI; }
  for (let k = 0; k < n; k++) { const a = Math.max(0, k - 3), b = Math.min(n - 1, k + 3); curv[k] = (h[b] - h[a]) / ((b - a) * ds); }

  // heights: ease between the points' heights, smooth, then the crests; bank eases between points that have it
  const y = new Float64Array(n), bank = new Float32Array(n);
  const el0 = P[0].el;
  for (let k = 0; k < n; k++) {
    const i = Math.min(P.length - 2, Math.floor(u[k])), t = u[k] - i;
    y[k] = (P[i].el + (P[i + 1].el - P[i].el) * (1 - Math.cos(Math.PI * t)) / 2 - el0) * B.heightScale;
    bank[k] = ((P[i].bank || 0) * (1 - t) + (P[i + 1].bank || 0) * t) * D2R;
  }
  smooth(y, 8);
  const sOf = i => { let k = 0; while (k < n - 1 && u[k] < i) k++; return k; };
  P.forEach((p, i) => {
    if (!p.crest) return;
    const c = p.crest, k0 = sOf(i);
    for (let k = 0; k < n; k++) {
      const v = (k - k0) * ds / c.len;
      // up gently, down steeply: the back side falls away faster than gravity at speed, which is what makes a jump
      if (v > -1 && v < 0.5) y[k] += v < 0 ? c.h * (1 + Math.cos(Math.PI * v)) / 2 : c.h * (1 + Math.cos(Math.PI * v * 2)) / 2;
    }
  });

  const marks = [];
  P.forEach((p, i) => { if (p.name) marks.push({ name: p.name, at: sOf(i) }); });

  // the Armco: a verge of grass then the rail, pulled in on the inside of the tightest corners so it never folds over
  const wallL = new Float32Array(n), wallR = new Float32Array(n), base = B.width / 2 + B.verge;
  for (let k = 0; k < n; k++) {
    let c = 0; for (let j = Math.max(0, k - 4); j <= Math.min(n - 1, k + 4); j++) c = Math.abs(curv[j]) > Math.abs(c) ? curv[j] : c;
    const inside = c ? Math.max(B.width / 2 + 1.2, Math.min(base, 0.8 / Math.abs(c))) : base;
    wallR[k] = c > 0 ? inside : base; wallL[k] = c < 0 ? inside : base;
  }

  return { n, ds, L, x, z, y, h, curv, bank, marks, wallL, wallR, width: B.width, verge: B.verge, gateAt: Math.round(B.gateAt / ds), crests: P.filter(p => p.crest).length };
}

function smooth(a, r) {
  const b = Float64Array.from(a);
  for (let k = 0; k < a.length; k++) { let s = 0, w = 0; for (let j = -r; j <= r; j++) { const i = k + j; if (i < 0 || i >= a.length) continue; const ww = r + 1 - Math.abs(j); s += b[i] * ww; w += ww; } a[k] = s / w; }
}

// Where a point is relative to the road, searching near a hint sample (cars move a few samples a frame).
// Returns the sample index, distance along (s), signed lateral offset (positive right), and the road height there.
export function locate(track, px, pz, hint = 0, span = 40) {
  const { n, x, z } = track;
  let best = -1, bd = Infinity;
  const lo = Math.max(0, hint - span), hi = Math.min(n - 1, hint + span);
  for (let k = lo; k <= hi; k++) { const dx = px - x[k], dz = pz - z[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = k; } }
  return frameAt(track, best, px, pz);
}

export function locateGlobal(track, px, pz) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < track.n; k += 4) { const dx = px - track.x[k], dz = pz - track.z[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = k; } }
  return locate(track, px, pz, best, 6);
}

function frameAt(track, k, px, pz) {
  const { x, z, h, y, bank, ds, n } = track;
  // refine between k and its neighbour along the line
  const hk = h[k], fx = Math.cos(hk), fz = Math.sin(hk);
  const dx = px - x[k], dz = pz - z[k];
  const along = dx * fx + dz * fz, lat = -dx * fz + dz * fx;
  const t = Math.max(-1, Math.min(1, along / ds));
  const k2 = Math.max(0, Math.min(n - 1, k + Math.sign(t)));
  const a = Math.abs(t);
  const yc = y[k] + (y[k2] - y[k]) * a;
  const bk = bank[k] + (bank[k2] - bank[k]) * a;
  // banking: the outside of the turn is higher; bank angle is signed so lat * tan gives the rise
  return { k, s: k * ds + along, lat, heading: hk + (h[k2] - hk) * a, ground: yc - lat * Math.tan(bk), bank: bk };
}

// A point on the road at sample k, offset sideways by lat (positive right).
export function pointAt(track, k, lat = 0) {
  k = Math.max(0, Math.min(track.n - 1, Math.round(k)));
  const hk = track.h[k];
  return { x: track.x[k] - Math.sin(hk) * lat, z: track.z[k] + Math.cos(hk) * lat, y: track.y[k] - lat * Math.tan(track.bank[k]), h: hk };
}

// The corner a sample belongs to: the last named mark at or before it.
export function cornerAt(track, k) {
  let name = track.marks[0].name;
  for (const m of track.marks) { if (m.at <= k) name = m.name; else break; }
  return name;
}
