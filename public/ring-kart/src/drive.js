// How a car drives, for you and for the AI: speed, steering on a grip limit, drifts and mini-turbos, slipstream, grass,
// the Armco, hills and jumps, and bumps between cars. Pure functions on plain objects, no page and no 3D, so the checks
// can drive a lap in Node.
//
// Arcade on purpose: the car goes where it points, and grip only limits how fast it can turn. A drift turns harder than
// grip allows and charges a mini-turbo, the kart-racing move. Hills slow you going up, and a crest taken fast enough
// throws the car into the air, where it flies on gravity until the road comes back up to meet it.
import { locate, pointAt } from './track.js?v=0.4';

const G = 9.81;

export function makeCar(spec, track, k, lat = 0) {
  const p = pointAt(track, k, lat);
  return {
    spec, x: p.x, z: p.z, y: p.y, vy: 0, h: p.h, v: 0, k, s: k * track.ds, lat, air: false, airT: 0,
    slide: 0, drift: null, boost: 0, slipT: 0, grass: false, scrape: 0, landed: 0, bump: 0,
    input: { steer: 0, gas: 0, brake: 0, drift: false }, slope: 0, yawRate: 0, pitch: 0, roll: 0, ground: p.y,
  };
}

// One step of dt seconds. R is the race block of cars.json; others are the other cars, for the slipstream.
export function step(car, dt, track, R, others = []) {
  const sp = car.spec, inp = car.input;
  const half = track.width / 2;
  const B = R.boost.value, S = R.slip.value;
  // ---------- along the road ----------
  let vmax = sp.vmax * (car.grass ? R.grass.value.vmax : 1);
  if (car.slipT > S.build) vmax *= 1 + S.gain;
  if (car.boost > 0) { vmax *= 1 + B.gain; car.boost -= dt; }
  let a = 0;
  if (!car.air) {
    if (inp.gas > 0 && car.v >= -0.5) a += inp.gas * sp.accel * Math.max(0, 1 - (car.v / vmax) ** 2) * (car.v > vmax ? 0 : 1);
    if (car.v > vmax) a -= (car.v - vmax) * 1.5;
    if (car.boost > 0) a += sp.accel * 1.4;
    if (inp.brake > 0) a -= car.v > 0.5 ? inp.brake * sp.brake : inp.brake * 4 * (car.v > -8 ? 1 : 0);
    a -= 0.25 + 0.00022 * car.v * Math.abs(car.v) + (inp.gas > 0 || car.boost > 0 ? 0 : 0.6);
    if (car.grass) a -= R.grass.value.drag * Math.max(0, car.v) * 0.25;
    // climbing costs speed and falling gives it back, at a fraction of real so the hills matter without stalling anyone
    a -= G * car.slope * 0.55;
    if (car.drift) a -= 1.2;
    if (Math.abs(car.v) < 0.3 && !inp.gas && !inp.brake) { car.v = 0; a = Math.max(0, a); }
  }
  car.v += a * dt;

  // ---------- turning ----------
  const v = Math.max(0.1, Math.abs(car.v));
  const lim = sp.grip * G / v;                     // the most yaw rate grip allows at this speed
  const geo = inp.steer * v / 5.2;                 // what the steering wheel asks for (a 5.2 m turning circle at full lock)
  let yaw;
  // a drift starts on the drift button with some steering and speed, and keeps its direction until you let go
  if (inp.drift && !car.drift && !car.air && Math.abs(inp.steer) > 0.25 && car.v > 12) car.drift = { dir: Math.sign(inp.steer), t: 0 };
  if (car.drift && (!inp.drift || car.v < 8)) {
    const t = car.drift.t;
    if (car.v >= 8) { if (t > B.t2) car.boost = B.b2; else if (t > B.t1) car.boost = B.b1; }
    car.drift = null;
  }
  if (car.drift) {
    const d = car.drift.dir, push = (inp.steer * d + 1) / 2;   // steer into the drift to tighten it, out to widen it
    yaw = d * lim * (sp.drift || 1) * (0.75 + 0.75 * push);
    car.drift.t += dt;
    car.slide += (d * 0.42 - car.slide) * Math.min(1, dt * 6);
  } else {
    yaw = Math.max(-lim, Math.min(lim, geo));
    // asking for more than grip gives understeer: the front scrubs speed
    const over = Math.abs(geo) - lim;
    if (over > 0 && !car.air) car.v -= Math.min(over * 3, 6) * dt;
    car.slide += (0 - car.slide) * Math.min(1, dt * 5);
  }
  if (car.v < 0) yaw = -yaw;
  car.yawRate = yaw;
  if (car.air) yaw *= 0.25;
  car.h += yaw * dt;
  car.x += Math.cos(car.h) * car.v * dt;
  car.z += Math.sin(car.h) * car.v * dt;

  // ---------- where on the road ----------
  let f = locate(track, car.x, car.z, car.k);
  const wallR = track.wallR[f.k], wallL = track.wallL[f.k];
  const r = sp.body.wid / 2;
  if (f.lat > wallR - r || f.lat < -(wallL - r)) {
    // the Armco: put the car back against it and turn it along the rail; a square hit costs more speed than a glance
    const side = f.lat > 0 ? 1 : -1, lim2 = (side > 0 ? wallR : wallL) - r;
    const back = (Math.abs(f.lat) - lim2) * side;
    car.x += Math.sin(f.heading) * back; car.z -= Math.cos(f.heading) * back;
    let rel = car.h - f.heading; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const into = Math.sin(rel) * side;            // positive when heading into this wall
    if (into > 0) {
      const square = Math.min(1, into * 2.2);
      car.v *= 1 - (1 - R.wall.value) * square;
      car.h -= Math.sign(rel) * Math.min(Math.abs(rel), 0.5 + into);
      car.scrape = 0.25; car.bump = Math.max(car.bump, square);
    }
    if (car.drift) car.drift = null;
    f = locate(track, car.x, car.z, f.k);
  }
  car.k = f.k; car.s = f.s; car.lat = f.lat;
  car.grass = Math.abs(f.lat) > half + 0.2;
  car.scrape = Math.max(0, car.scrape - dt);
  car.bump = Math.max(0, car.bump - dt * 2);

  // ---------- up and down: follow the road, or fly ----------
  const ground = f.ground;
  const prevGround = car.ground;
  car.ground = ground;
  car.slope = (ground - prevGround) / Math.max(0.05, Math.abs(car.v) * dt);
  car.slope = Math.max(-0.4, Math.min(0.4, car.slope || 0));
  const g = R.gravity.value;
  if (car.air) {
    car.vy -= g * dt; car.y += car.vy * dt; car.airT += dt;
    if (car.y <= ground) { car.landed = Math.min(1, -car.vy / 12); if (car.vy < -7) car.v *= 0.97; car.y = ground; car.vy = 0; car.air = false; }
  } else {
    const yb = car.y + car.vy * dt - 0.5 * g * dt * dt;
    if (ground < yb - 0.03 && car.v > 14) { car.air = true; car.airT = 0; car.y = yb; car.vy -= g * dt; if (car.drift) car.drift = null; }
    else { car.vy = (ground - car.y) / dt; car.vy = Math.max(-30, Math.min(30, car.vy)); car.y = ground; }
  }
  car.landed = Math.max(0, car.landed - dt * 3);

  // ---------- pose for drawing: pitch with the road, roll with the bank and the corner ----------
  const tgtPitch = car.air ? Math.atan2(car.vy, Math.max(1, car.v)) * 0.6 : Math.atan(car.slope);
  car.pitch += (tgtPitch - car.pitch) * Math.min(1, dt * 8);
  const tgtRoll = (car.air ? 0 : f.bank) + Math.max(-0.08, Math.min(0.08, -car.yawRate * car.v * 0.004));
  car.roll += (tgtRoll - car.roll) * Math.min(1, dt * 6);

  // ---------- slipstream: tucked in behind another car ----------
  let tow = false;
  for (const o of others) {
    if (o === car || o.hidden) continue;
    const ahead = o.s - car.s;
    if (ahead > 4 && ahead < S.dist && Math.abs(o.lat - car.lat) < S.lat && o.v > 15) { tow = true; break; }
  }
  car.slipT = tow ? car.slipT + dt : Math.max(0, car.slipT - dt * 2);
}

// Bumps: cars are circles about as wide as the car; heavier cars push lighter ones, and both lose a little speed.
export function collide(cars) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i]; if (a.hidden) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j]; if (b.hidden) continue;
      if (Math.abs(a.s - b.s) > 8 || Math.abs(a.y - b.y) > 2.5) continue;
      // two circles along each car, front and back, catch side-by-side and nose-to-tail contacts
      for (const ca of circles(a)) for (const cb of circles(b)) {
        const dx = cb[0] - ca[0], dz = cb[1] - ca[1], d = Math.hypot(dx, dz), min = ca[2] + cb[2];
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, over = min - d;
        const ma = a.spec.mass || 1, mb = b.spec.mass || 1, wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.x -= nx * over * wa; a.z -= nz * over * wa; b.x += nx * over * wb; b.z += nz * over * wb;
        const vax = Math.cos(a.h) * a.v, vaz = Math.sin(a.h) * a.v, vbx = Math.cos(b.h) * b.v, vbz = Math.sin(b.h) * b.v;
        const rel = (vbx - vax) * nx + (vbz - vaz) * nz;
        if (rel < 0) {
          const jimp = -(1.3) * rel / (1 / ma + 1 / mb);
          const nvax = vax - jimp / ma * nx, nvaz = vaz - jimp / ma * nz, nvbx = vbx + jimp / mb * nx, nvbz = vbz + jimp / mb * nz;
          a.v = nvax * Math.cos(a.h) + nvaz * Math.sin(a.h); b.v = nvbx * Math.cos(b.h) + nvbz * Math.sin(b.h);
          a.h += (-nvax * Math.sin(a.h) + nvaz * Math.cos(a.h)) * 0.02; b.h += (-nvbx * Math.sin(b.h) + nvbz * Math.cos(b.h)) * 0.02;
          const hit = Math.min(1, -rel / 10); a.bump = Math.max(a.bump, hit); b.bump = Math.max(b.bump, hit);
        }
      }
    }
  }
}
function circles(c) {
  const L = c.spec.body.len, r = c.spec.body.wid * 0.5, o = L / 2 - r;
  const fx = Math.cos(c.h), fz = Math.sin(c.h);
  return [[c.x + fx * o, c.z + fz * o, r], [c.x - fx * o, c.z - fz * o, r]];
}

// The fastest a car can be going now and still make every corner within braking reach, using `pace` of its grip:
// what the AI drives to, and what the page's pace notes call BRAKE against.
export function cornerSpeed(car, track, pace) {
  const sp = car.spec, n = track.n;
  let vt = sp.vmax;
  const reach = Math.min(n - 1, car.k + Math.ceil((car.v * car.v / (2 * sp.brake * 0.7) + 30) / track.ds));
  for (let j = car.k + 1; j <= reach; j += 2) {
    const c = Math.abs(track.curv[j]);
    if (c < 1e-4) continue;
    const bankBonus = 1 + Math.abs(track.bank[j]) * 1.2;
    const vc = Math.sqrt(pace * sp.grip * G * bankBonus / c);
    const dist = (j - car.k) * track.ds;
    vt = Math.min(vt, Math.sqrt(vc * vc + 2 * sp.brake * 0.7 * dist));
  }
  return vt;
}

// The next corner worth a note, as a rally co-driver reads it: which way, how tight on a scale of 1 (a hairpin) to 6
// (barely a bend), how far away it starts, and whether it tightens. Bends gentler than a 6 are left out.
export function nextCorner(track, k, ahead = 260) {
  const n = track.n, on = 1 / 140, end = Math.min(n - 1, k + Math.round(ahead / track.ds));
  let j = k + 1; while (j < end && Math.abs(track.curv[j]) < on) j++;
  if (j >= end) return null;
  const dir = Math.sign(track.curv[j]);
  let a = j, peak = 0, peakAt = j;
  while (j < n - 1 && track.curv[j] * dir > on * 0.6) { const c = Math.abs(track.curv[j]); if (c > peak) { peak = c; peakAt = j; } j++; }
  const R = 1 / peak, grade = R < 16 ? 1 : R < 26 ? 2 : R < 40 ? 3 : R < 60 ? 4 : R < 95 ? 5 : 6;
  return { dir: dir > 0 ? 'right' : 'left', grade, dist: (a - k) * track.ds, len: (j - a) * track.ds, tightens: peakAt > a + (j - a) * 0.6, at: a };
}

// ---------- the AI driver ----------
// Looks ahead along the road for the slowest corner it can still brake for, picks a line (the inside of what is
// coming for racers, the right-hand side for traffic, as on the real Ring), steers at a point down that line, and
// moves over to pass on the left when a slower car is in the way.
export function driveAI(car, dt, track, cars, opts = {}) {
  const sp = car.spec, ai = car.ai || (car.ai = { lane: 0 });
  const half = track.width / 2;
  const n = track.n;
  const pace = (sp.pace || 0.8) * (opts.paceScale || 1);
  // speed target: the slowest corner within braking reach
  let vt = cornerSpeed(car, track, pace);
  // jumps: racers lift before a big crest so they do not land in the trees
  if (opts.cap) vt = Math.min(vt, opts.cap);
  // line
  let lane;
  if (car.traffic) lane = half * (car.yieldT > 0 ? 0.72 : 0.42);   // a honk sends them over to the verge
  else {
    let cAhead = 0; for (let j = car.k + 8; j < Math.min(n, car.k + 40); j += 4) cAhead += track.curv[j];
    lane = -Math.sign(cAhead) * Math.min(half * 0.55, Math.abs(cAhead) * 40);
  }
  // traffic in the way: slow car ahead in our lane, pass on the left if there is room
  let blocked = null;
  for (const o of cars) {
    if (o === car || o.hidden) continue;
    const ahead = o.s - car.s;
    if (ahead > 0 && ahead < 14 + car.v * 0.9 && Math.abs(o.lat - (ai.lane ?? lane)) < 3.4 && o.v < car.v + 0.5) { if (!blocked || ahead < blocked.s - car.s) blocked = o; }
  }
  if (blocked) {
    const left = blocked.lat - 4.6, right = blocked.lat + 4.6;
    lane = left > -half + 1.5 ? left : right < half - 1.5 && !car.traffic ? right : lane;
    if (Math.abs(lane - blocked.lat) < 3) vt = Math.min(vt, blocked.v);
  }
  if (car.yieldT > 0) { car.yieldT -= dt; vt = Math.min(vt, sp.vmax * 0.5); }
  ai.lane += (lane - ai.lane) * Math.min(1, dt * 1.5);
  // steer at a point down the line
  const look = Math.max(5, Math.round((6 + car.v * 0.55) / track.ds));
  const p = pointAt(track, Math.min(n - 1, car.k + look), ai.lane);
  let ang = Math.atan2(p.z - car.z, p.x - car.x) - car.h;
  ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  car.input.steer = Math.max(-1, Math.min(1, ang * 3.2));
  car.input.gas = car.v < vt - 0.6 ? 1 : car.v < vt ? 0.4 : 0;
  car.input.brake = car.v > vt + 1.2 ? Math.min(1, (car.v - vt) / 6) : 0;
  car.input.drift = false;
}

// The gearbox the sound and the dials share: six gears spread over the top speed, and the revs in that gear, from
// 2,600 when it drops into a gear to 6,800 at the change, a little more flat out in top. At a standstill the throttle
// just revs it. Returns the gear (0 for neutral, -1 for reverse) and the revs it wants; the page eases toward them.
export const REDLINE = 7200;
export function revs(car) {
  const v = Math.abs(car.v), band = car.spec.vmax / 6.2, gas = car.input.gas || car.boost > 0 ? 1 : 0;
  if (car.v < -0.5) return { gear: -1, rpm: 2600 + Math.min(1, v / 8) * 2400 };
  if (v < 1.5) return { gear: 0, rpm: gas ? 6400 : 900 };
  const g = Math.min(5, Math.floor(v / band)), inGear = Math.min(1.3, (v - g * band) / band);
  let rpm = 2600 + Math.min(1, inGear) * 4200 + (g === 5 ? Math.max(0, v - 6 * band) / band * 1200 : 0);
  if (car.air && gas) rpm += 900;
  return { gear: g + 1, rpm: Math.min(REDLINE + 600, rpm) };
}
