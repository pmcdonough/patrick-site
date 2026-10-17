// Ring Kart's road and driving, in Node: the lap builds to its real length scaled, and every car drives it to the
// gantry on the AI without getting stuck, in a sensible time, with the faster cars faster.
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
