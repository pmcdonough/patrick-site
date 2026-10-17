// The best line round the lap, the speed a car can carry along it, and the pro who drives it. Pure, like track.js and
// drive.js, so the checks can drive a pro lap in Node.
//
// The line is the one with the least curvature that stays on the road: start on the centre line and, again and
// again, pull each point toward the middle of its neighbours a few metres either side, keeping it a car's width
// inside the edge. Done at a long reach first and then shorter ones, that settles into the classic shape: out wide
// before a corner, clip the apex, run out wide again. The speeds come from the car's own figures and the same
// physics `step` uses: through a corner as fast as grip allows, a forward pass for how fast it can accelerate out,
// and a backward pass for where it must start braking. Every point on the line then has a phase, what your feet
// should be doing there: gas, coast, brake or hard brake. The pro drives exactly that line at exactly those speeds,
// so the line you are shown is the line the pro takes.
import { pointAt } from './track.js?v=0.14';
import { drs } from './drive.js?v=0.14';

const G = 9.81;
export const PHASE = { GAS: 0, COAST: 1, BRAKE: 2, HARD: 3 };

// The path: a sideways offset for every sample, in metres, positive to the right. The same for every car.
export function racingPath(track, margin = 1.2) {
  const { n } = track, half = track.width / 2 - margin;
  const cx = new Float32Array(n), cz = new Float32Array(n), rx = new Float32Array(n), rz = new Float32Array(n);
  for (let k = 0; k < n; k++) { const a = pointAt(track, k, 0), b = pointAt(track, k, 1); cx[k] = a.x; cz[k] = a.z; rx[k] = b.x - a.x; rz[k] = b.z - a.z; }
  const lat = new Float32Array(n);
  // the queue and the run up to the barrier stay in the middle of the road, and the line eases away after it
  const free = k => Math.min(1, Math.max(0, (k - track.gateAt - 10) / 40));
  for (const [reach, rounds] of [[30, 120], [16, 120], [8, 80], [4, 60]]) {
    for (let r = 0; r < rounds; r++) {
      for (let k = reach; k < n - reach; k++) {
        const a = k - reach, b = k + reach;
        const mx = (cx[a] + rx[a] * lat[a] + cx[b] + rx[b] * lat[b]) / 2, mz = (cz[a] + rz[a] * lat[a] + cz[b] + rz[b] * lat[b]) / 2;
        const want = (mx - cx[k]) * rx[k] + (mz - cz[k]) * rz[k];
        lat[k] = Math.max(-half, Math.min(half, lat[k] + 0.6 * (want - lat[k]))) * free(k);
      }
    }
  }
  // Pulling toward the neighbours' midpoint is curve shortening: round a hairpin it hugs the inside all the way, the
  // shortest path and a slow one. So finish with passes that lower the line's bending itself (its fourth difference,
  // the gradient of the summed squared curvature): through a hairpin that swings the line wide, clips the apex and
  // runs wide again, the way a driver uses the whole road.
  const P = (k, o) => [cx[k] + rx[k] * lat[k], cz[k] + rz[k] * lat[k]][o];
  for (const [reach, rounds] of [[10, 160], [5, 120]]) {
    for (let r = 0; r < rounds; r++) {
      for (let k = 2 * reach; k < n - 2 * reach; k++) {
        const d = o => P(k - 2 * reach, o) - 4 * P(k - reach, o) + 6 * P(k, o) - 4 * P(k + reach, o) + P(k + 2 * reach, o);
        lat[k] = Math.max(-half, Math.min(half, lat[k] - 0.05 * (d(0) * rx[k] + d(1) * rz[k]))) * free(k);
      }
    }
  }
  return lat;
}

// The speeds and phases along a path for one car. `pace` is the share of its grip the pro uses.
export function lineFor(track, lat, spec, pace = 1.0) {
  const { n, ds } = track, gate = track.gateAt;
  const px = new Float32Array(n), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) { const p = pointAt(track, k, lat[k]); px[k] = p.x; pz[k] = p.z; }
  // curvature of the line, from the circle through three points 24 m apart (shorter spans read the tracing's small
  // wiggles as corners), then the worst within 8 m
  const raw = new Float32Array(n), kap = new Float32Array(n), ks = new Float32Array(n), s = 12;
  for (let k = s; k < n - s; k++) {
    const ax = px[k] - px[k - s], az = pz[k] - pz[k - s], bx = px[k + s] - px[k], bz = pz[k + s] - pz[k], cx = px[k + s] - px[k - s], cz = pz[k + s] - pz[k - s];
    const cross = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(cx, cz);
    ks[k] = 2 * cross / Math.max(1e-6, la * lb * lc); raw[k] = Math.abs(ks[k]);
  }
  // in a hairpin the long span averages the tightest part away, and in a quick S it averages the left and the right
  // into a straight, so a short span counts too: inside a corner the long span already sees, and wherever it reads a
  // tight corner for 6 m either way (one sample alone is a wiggle, not a corner)
  const short = new Float32Array(n), tight = new Float32Array(n), s2 = 4;
  for (let k = s2; k < n - s2; k++) {
    const ax = px[k] - px[k - s2], az = pz[k] - pz[k - s2], bx = px[k + s2] - px[k], bz = pz[k + s2] - pz[k], cx = px[k + s2] - px[k - s2], cz = pz[k + s2] - pz[k - s2];
    short[k] = 2 * Math.abs(ax * bz - az * bx) / Math.max(1e-6, Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(cx, cz));
  }
  for (let k = 3; k < n - 3; k++) { let m = Infinity; for (let j = k - 3; j <= k + 3; j++) m = Math.min(m, short[j]); tight[k] = (short[k] > 1 / 22 && raw[k] > 1 / 40) || m > 1 / 16 ? short[k] : 0; }
  // a floor from the road itself: through a tight corner no line can be wider than the centre's radius plus the
  // half-road it may use, however the offset points measure (hugging the inside of a hairpin they bunch up and read
  // nearly straight)
  const room = track.width / 2;
  for (let k = 0; k < n; k++) {
    let m = 0, c = 0;
    for (let j = Math.max(0, k - 4); j <= Math.min(n - 1, k + 4); j++) { m = Math.max(m, raw[j], tight[j]); c = Math.max(c, Math.abs(track.curv[j])); }
    kap[k] = c > 1 / 25 ? Math.max(m, 1 / (1 / c + room)) : m;
    // and a ceiling the other way: hugging the inside, no line is tighter than the centre's radius less the half-road
    // (a kink in the offset points can read as a 6 m radius on a 28 m corner)
    if (c > 0) kap[k] = Math.min(kap[k], 1 / Math.max(3, 1 / c - room));
  }
  // the most the car can carry through each point, then the passes for accelerating out and braking in
  const vc = new Float32Array(n), v = new Float32Array(n);
  // the top speed at each point: higher on the straights for a car with DRS, which the pro opens there
  const vmaxAt = k => spec.vmax * (spec.drs && track.drsZone && track.drsZone[k] ? 1 + spec.drs.vmax : 1), drag = k => spec.drs && track.drsZone && track.drsZone[k] ? 1 - spec.drs.drag : 1;
  for (let k = 0; k < n; k++) vc[k] = Math.min(vmaxAt(k), Math.sqrt(pace * spec.grip * G / Math.max(kap[k], 1e-5)));
  // from a standstill at the start of the road (the queue and the pro both start behind the barrier)
  for (let k = 0; k < n; k++) v[k] = k ? vc[k] : 0;
  for (let k = 0; k < n - 1; k++) {
    const slope = Math.max(-0.4, Math.min(0.4, (track.y[k + 1] - track.y[k]) / ds));
    const a = spec.accel * Math.max(0, 1 - (v[k] / vmaxAt(k)) ** 2) - 0.25 - 0.00022 * drag(k) * v[k] * v[k] - G * slope * 0.55;
    v[k + 1] = Math.min(v[k + 1], Math.sqrt(Math.max(0, v[k] * v[k] + 2 * a * ds)));
  }
  const brake = spec.brake * 0.95;
  for (let k = n - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] * v[k + 1] + 2 * brake * ds));
  // what the feet do. A braking zone is a run where the speed must fall faster than lifting off would manage; it is
  // graded by how much speed it sheds: a big drop is hard braking, a small one braking, a tiny one just a lift. Where
  // the corner itself holds the speed down, coast; everywhere else, gas.
  const phase = new Uint8Array(n);
  for (let k = 0; k < n - 1; k++) phase[k] = v[k] > 4 && v[k] >= vc[k] * 0.97 && v[k] < vmaxAt(k) * 0.97 ? PHASE.COAST : PHASE.GAS;
  for (let k = gate; k < n - 1;) {
    const decel = k2 => (v[k2] * v[k2] - v[k2 + 1] * v[k2 + 1]) / (2 * ds);
    if (decel(k) <= 1.4) { k++; continue; }
    let e = k; while (e < n - 1 && decel(e) > 1.4) e++;
    const drop = v[k] - v[e], grade = drop > Math.max(9, v[k] * 0.28) ? PHASE.HARD : drop > 3 ? PHASE.BRAKE : PHASE.COAST;
    for (let j = k; j < e; j++) phase[j] = grade;
    k = e;
  }
  // a single sample of one phase inside another is noise: smooth it out so the line reads in clean stretches
  for (let k = 2; k < n - 2; k++) if (phase[k - 1] === phase[k + 1] && phase[k] !== phase[k - 1]) phase[k] = phase[k - 1];
  // the line's heading, for the pro's steering
  const hd = new Float32Array(n);
  for (let k = 0; k < n; k++) { const a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2); hd[k] = Math.atan2(pz[b] - pz[a], px[b] - px[a]); }
  return { lat, v, vc, phase, kap, ks, hd, x: px, z: pz };
}

// The pro: steers for the line's own curvature (a car turns on a 5.2 m circle at full lock, so that much lock), then
// corrects for how far it is off the line and how far its nose points off it; works the pedals to hold the line's
// speed a moment ahead, so it brakes where the line says brake.
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export function drivePro(car, dt, track, line) {
  const n = track.n, k = car.k, v = car.v;
  const vt = line.v[Math.min(n - 1, k + 1 + Math.round(v * 0.12 / track.ds))];
  const err = vt - v;
  car.input.gas = err > 0.25 ? 1 : err > -0.15 ? 0.4 : 0;
  // never below walking pace: a brake pedal at a standstill is reverse
  car.input.brake = err < -0.6 && v > 1 ? Math.min(1, -err / 3) : 0;
  const lead = Math.min(n - 1, k + 1 + Math.round(v * 0.06 / track.ds));
  const steer = line.ks[lead] * 5.2 - 0.3 * (car.lat - line.lat[k]) + 1.8 * wrap(line.hd[lead] - car.h);
  car.input.steer = Math.max(-1, Math.min(1, steer));
  car.input.drift = false;
  // DRS wherever the straight allows it, as a pro would
  if (car.spec.drs) drs(car, track, car.input.gas === 1);
}
