// The engine's own math (detmath.js) and its expected-goal model, against independent references.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const ENGINE = path.join(__dirname, '..', '..', 'public', 'bruins-vs-canadiens', 'src', 'engine');
const imp = f => import(pathToFileURL(path.join(ENGINE, f)).href);

const f64 = new Float64Array(1), i64 = new BigInt64Array(f64.buffer);
const ord = x => { f64[0] = x; const v = i64[0]; return v < 0n ? -(v & 0x7fffffffffffffffn) : v; };
const ulps = (a, b) => Number(ord(a) - ord(b) < 0n ? ord(b) - ord(a) : ord(a) - ord(b));

test('detmath stays within one unit in the last place of the built-in functions', async () => {
  const D = await imp('detmath.js');
  let a = 99; const r = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const cases = { sin: [() => [r() * 10000 - 5000]], cos: [() => [r() * 10000 - 5000]], atan2: [() => [r() * 200 - 100, r() * 200 - 100]],
    exp: [() => [r() * 100 - 50]], log: [() => [r() * 1e6]], pow: [() => [0.9 + r() * 0.1, r() * 4]] };
  for (const [fn, [gen]] of Object.entries(cases)) {
    let worst = 0;
    for (let n = 0; n < 50000; n++) { const args = gen(); worst = Math.max(worst, ulps(D[fn](...args), Math[fn](...args))); }
    assert.ok(worst <= 1, `${fn} is ${worst} units off the built-in`);
  }
});

test('detmath gets the exact cases exactly', async () => {
  const D = await imp('detmath.js');
  assert.equal(D.sin(0), 0); assert.equal(D.cos(0), 1); assert.equal(D.exp(0), 1); assert.equal(D.log(1), 0);
  assert.equal(D.atan2(0, -1), Math.PI); assert.equal(D.atan2(1, 0), Math.PI / 2); assert.equal(D.pow(0.5, 0), 1); assert.equal(D.pow(4, 0.5), 2);
  assert.equal(D.hypot(3, 4), 5);
});

test('the engine scores a baseline shot as the fit script did, at every point of its grid', async () => {
  const { makeXg } = await imp('xg.js');
  const D = await imp('detmath.js');
  const XG = require('../../public/bruins-vs-canadiens/data/xg-model.json');
  const { xgModel } = makeXg(XG);
  let worst = 0, where = '';
  XG.grid.values.forEach((row, gx) => row.forEach((want, gy) => {
    const dist = D.hypot(gx, gy), ang = dist > 0 ? D.atan2(gy, gx) * 180 / Math.PI : 0;
    const err = Math.abs(xgModel(dist, ang, {}) - want);
    if (err > worst) { worst = err; where = `${gx} ft out, ${gy} ft across`; }
  }));
  assert.ok(worst <= 0.00005 + 1e-12, `largest difference ${worst} at ${where} (the grid keeps four decimals)`);
});
