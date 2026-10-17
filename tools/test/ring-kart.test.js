// Ring Kart's road and driving, in Node: the lap builds to its real length scaled, and every car drives it to the
// gantry on the AI without getting stuck, in a sensible time, with the faster cars faster; the pro drives the best line
// clean; and the driving modes keep a clumsy driver off the Armco without slowing a good one.
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
  assert.ok(at('Hatzenbach') < at('Flugplatz') && at('Flugplatz') < at('Breidscheid') && at('Breidscheid') < at('Karussell') && at('Karussell') < at('Pflanzgarten') && at('Pflanzgarten') < at('Doettinger Hoehe'));
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
