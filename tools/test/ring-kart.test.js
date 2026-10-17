// Ring Kart's road and driving, in Node: the lap builds to its real length scaled, and every car drives it to the
// gantry on the AI without getting stuck, in a sensible time, with the faster cars faster; the pro drives the best line
// clean; the driving modes keep a clumsy driver off the Armco without slowing a good one; reverse stops when you
// let go; the gearbox works through every gear; and DRS opens only where it should.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', 'public', 'ring-kart');
const T = JSON.parse(fs.readFileSync(path.join(root, 'data', 'track.json')));
const C = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cars.json')));
const { pathToFileURL } = require('url');
const load = async () => [await import(pathToFileURL(path.join(root, 'src', 'track.js')).href), await import(pathToFileURL(path.join(root, 'src', 'drive.js')).href), await import(pathToFileURL(path.join(root, 'src', 'line.js')).href)];

test('the lap is the real length at the game scale, with its corners in order', async () => {
  const [{ buildTrack }] = await load();
  const t = buildTrack(T);
  const want = T.build.realLength.value * T.build.lengthScale.value;
  assert.ok(Math.abs(t.L - want) < 1, `length ${t.L} m, want ${want}`);
  const at = n => t.marks.find(m => m.name === n).at;
  assert.ok(at('Hatzenbach') < at('Flugplatz') && at('Flugplatz') < at('Breidscheid') && at('Breidscheid') < at('Karussell') && at('Karussell') < at('Pflanzgarten') && at('Pflanzgarten') < at('Döttinger Höhe'));
  // Breidscheid is the bottom of the lap
  let lo = 0; for (let k = 1; k < t.n; k++) if (t.y[k] < t.y[lo]) lo = k;
  assert.ok(Math.abs(lo - at('Breidscheid')) < 120, `lowest point at sample ${lo}, Breidscheid at ${at('Breidscheid')}`);
});

test('each player car drives the whole lap on the AI, and the GT3 RS beats the Volvo', async () => {
  const [{ buildTrack }, { makeCar, step, driveAI }] = await load();
  const t = buildTrack(T), dt = 1 / 60, times = {};
  for (const spec of C.player) {
    const car = makeCar({ ...spec, pace: 0.8 }, t, t.gateAt, 0);
    let time = 0;
    while (car.k < t.n - 12 && time < 600) { driveAI(car, dt, t, [car]); step(car, dt, t, C.race, []); time += dt; }
    assert.ok(car.k >= t.n - 12, `${spec.name} stuck at sample ${car.k} of ${t.n}`);
    times[spec.id] = time;
    assert.ok(time > 120 && time < 330, `${spec.name}: ${time.toFixed(1)} s`);
  }
  assert.ok(times.gt3rs < times.gti && times.gti < times.v240, JSON.stringify(times));
});

test('the pro drives the best line in every player car: clean, on the line, and quicker than the AI', async () => {
  const [{ buildTrack }, { makeCar, step, driveAI }, { racingPath, lineFor, drivePro, PHASE }] = await load();
  const t = buildTrack(T), dt = 1 / 120, lat = racingPath(t), finish = t.n - 12;
  const half = t.width / 2;
  assert.ok(lat.every(l => Math.abs(l) < half), 'the line stays on the road');
  for (const spec of C.player) {
    const line = lineFor(t, lat, spec);
    // every phase appears, and the line is mostly gas
    const n = [0, 0, 0, 0]; for (let k = t.gateAt; k < finish; k++) n[line.phase[k]]++;
    assert.ok(n.every(x => x > 0) && n[PHASE.GAS] > n[PHASE.HARD], `${spec.name} phases ${n}`);
    const car = makeCar(spec, t, t.gateAt, 0);
    let time = 0, grass = 0, walls = 0, scraping = false, off = 0;
    while (car.k < finish && time < 600) {
      drivePro(car, dt, t, line); step(car, dt, t, C.race, []); time += dt;
      if (car.grass) grass += dt;
      if (car.scrape > 0.2 && !scraping) walls++; scraping = car.scrape > 0.2;
      off = Math.max(off, Math.abs(car.lat - lat[car.k]));
    }
    assert.ok(car.k >= finish, `${spec.name}: the pro is stuck at sample ${car.k}`);
    assert.ok(grass === 0 && walls === 0, `${spec.name}: ${grass.toFixed(1)} s on the grass, ${walls} hits on the Armco`);
    assert.ok(off < 6, `${spec.name}: ${off.toFixed(1)} m off the line at worst`);
    const ai = makeCar({ ...spec, pace: 0.8 }, t, t.gateAt, 0); let ta = 0;
    while (ai.k < finish && ta < 600) { driveAI(ai, dt, t, [ai]); step(ai, dt, t, C.race, []); ta += dt; }
    assert.ok(time < ta, `${spec.name}: the pro ${time.toFixed(1)} s, the AI ${ta.toFixed(1)} s`);
  }
});

test('the driving modes: a clumsy driver stays off the Armco on Beginner, mostly on Intermediate, and a good one is not slowed', async () => {
  const [{ buildTrack, pointAt }, { makeCar, step, assist, driveAI }] = await load();
  const t = buildTrack(T), dt = 1 / 120, finish = t.n - 12, M = C.race.modes.value;
  // flat out and never braking, aiming late at the middle of the road with all-or-nothing keys on an eased wheel
  const clumsy = car => {
    const p = pointAt(t, Math.min(t.n - 1, car.k + Math.round(14 / t.ds)), 0);
    let ang = Math.atan2(p.z - car.z, p.x - car.x) - car.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    const want = Math.abs(ang) > 0.04 ? Math.sign(ang) : 0;
    car.wheel = (car.wheel || 0) + Math.max(-6 * dt, Math.min(6 * dt, want - (car.wheel || 0)));
    car.input = { steer: car.wheel, gas: 1, brake: 0, drift: false };
  };
  const lap = (spec, mode, drive) => {
    const car = makeCar(spec, t, t.gateAt, 0); car.mode = M[mode];
    let time = 0, walls = 0, scraping = false;
    while (car.k < finish && time < 900) {
      drive(car); if (mode !== 'expert') assist(car, t, M[mode]); step(car, dt, t, C.race, []); time += dt;
      if (car.scrape > 0.2 && !scraping) walls++; scraping = car.scrape > 0.2;
    }
    assert.ok(car.k >= finish, `${spec.name} on ${mode}: stuck at sample ${car.k}`);
    return { time, walls };
  };
  for (const spec of C.player) {
    const [e, i, b] = ['expert', 'intermediate', 'beginner'].map(m => lap(spec, m, clumsy));
    assert.ok(e.walls >= 15, `${spec.name}: the clumsy driver should struggle on Expert, ${e.walls} hits`);
    assert.ok(i.walls * 3 <= e.walls, `${spec.name}: Intermediate ${i.walls} hits, Expert ${e.walls}`);
    assert.ok(b.walls === 0, `${spec.name}: Beginner ${b.walls} hits`);
    const good = { ...spec, pace: 0.8 }, ai = car => driveAI(car, dt, t, [car]);
    const ge = lap(good, 'expert', ai), gb = lap(good, 'beginner', ai);
    assert.ok(gb.time < ge.time * 1.02, `${spec.name}: the AI ${ge.time.toFixed(1)} s bare, ${gb.time.toFixed(1)} s with Beginner's help`);
  }
});

test('reverse: letting go stops the car, and the gas takes it forward again', async () => {
  const [{ buildTrack }, { makeCar, step }] = await load();
  const t = buildTrack(T), dt = 1 / 120;
  const drive = (car, inp, secs) => { for (let i = 0; i < secs / dt; i++) { car.input = { steer: 0, drift: false, gas: 0, brake: 0, ...inp }; step(car, dt, t, C.race, []); } };
  for (const spec of C.player) {
    const car = makeCar(spec, t, t.gateAt - 20, 0);
    drive(car, { brake: 1 }, 2); assert.ok(car.v < -5, `${spec.name} backs up: ${car.v.toFixed(2)}`);
    drive(car, {}, 3); assert.ok(car.v === 0, `${spec.name} still rolling ${car.v.toFixed(2)} m/s 3 s after letting go of reverse`);
    drive(car, { brake: 1 }, 2); drive(car, { gas: 1 }, 1.5); assert.ok(car.v > 0.5, `${spec.name}: the gas after reversing leaves it at ${car.v.toFixed(2)} m/s`);
  }
});

test('the gearbox: every player car changes up through all its gears and back down, on the pro lap', async () => {
  const [{ buildTrack }, { makeCar, step, gearbox }, { racingPath, lineFor, drivePro }] = await load();
  const t = buildTrack(T), P = racingPath(t), dt = 1 / 120;
  for (const spec of C.player) {
    const L = lineFor(t, P, spec), car = makeCar(spec, t, t.gateAt - 3, 0);
    let time = 0, top = 0, over = 0, low = 0;
    while (car.s < t.L - 60 && time < 400) {
      drivePro(car, dt, t, L); step(car, dt, t, C.race, []); const g = gearbox(car, dt); time += dt; top = Math.max(top, g.gear);
      if (g.rpm > car.engine.redline * 1.01) over++;
      if (g.gear > 1 && g.shiftT <= 0 && car.input.gas && g.rpm < car.engine.redline * 0.35) low++;
    }
    const n = car.engine.gears.length;
    assert.ok(top >= n - 1, `${spec.name}: top gear reached ${top} of ${n}`);
    if (car.engine.shift) assert.ok(car.gb.maxUp > car.engine.shift - 150 && car.gb.maxUp < car.engine.shift + 250, `${spec.name}: changes up at ${car.gb.maxUp.toFixed(0)} rpm, wants ${car.engine.shift}`);
    assert.ok(car.gb.ups > 15 && car.gb.downs > 15, `${spec.name}: ${car.gb.ups} up, ${car.gb.downs} down`);
    assert.ok(over === 0, `${spec.name}: over the redline for ${over} steps`);
    assert.ok(low < 120, `${spec.name}: lugging in too high a gear on the gas for ${(low * dt).toFixed(1)} s`);
  }
});

test('DRS: the GT3 RS opens its flap only on a straight, it shuts on the brakes and in corners, and it is faster', async () => {
  const [{ buildTrack }, { makeCar, step, drs }] = await load();
  const t = buildTrack(T), dt = 1 / 120, spec = C.player.find(s => s.id === 'gt3rs'), gti = C.player.find(s => s.id === 'gti');
  const zone = t.drsZone.indexOf(1), corner = Array.from(t.curv).findIndex((c, k) => k > t.gateAt && Math.abs(c) > 1 / 30);
  const car = makeCar(spec, t, zone + 2, 0); car.v = 40; car.input = { steer: 0, gas: 1, brake: 0, drift: false };
  assert.strictEqual(drs(car, t, true), 'open');
  car.input.brake = 1; assert.strictEqual(drs(car, t, false), 'ready', 'shuts on the brakes'); car.input.brake = 0;
  assert.ok(drs(makeCar(gti, t, zone + 2, 0), t, true) === '', 'a car without DRS has none');
  const bend = makeCar(spec, t, corner, 0); bend.input = { steer: 0, gas: 1, brake: 0, drift: false };
  assert.strictEqual(drs(bend, t, true), '', 'no DRS in a corner');
  // flat out down the longest zone, with and without
  let best = 0, at = 0; for (let k = 1, run = 0; k < t.n; k++) { run = t.drsZone[k] ? run + 1 : 0; if (run > best) { best = run; at = k - run + 1; } }
  const top = open => { const c = makeCar(spec, t, at, 0); c.v = 50; for (let i = 0; i < best * t.ds / 60 / dt && c.k < at + best - 2; i++) { c.input = { steer: 0, gas: 1, brake: 0, drift: false }; if (open) drs(c, t, true); step(c, dt, t, C.race, []); } return c.v; };
  assert.ok(top(true) > top(false) + 0.3, `DRS ${top(true).toFixed(2)} m/s, shut ${top(false).toFixed(2)}`);
});
