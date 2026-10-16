// Keystone's masonry solver (public/keystone/src/solver.js) against known results: node --test tools/test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const imp = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'keystone', 'src', 'solver.js')).href);

test('a semicircular arch needs stone 0.1075 of its radius deep (Milankovitch)', async () => {
  const S = await imp();
  for (const count of [41, 81]) {
    const ratio = S.minThickness({ shape: 'round', span: 10, thick: 1, count }) / 5;
    assert.ok(Math.abs(ratio - 0.1075) < 0.0005, `${count} stones: t/R = ${ratio.toFixed(4)}`);
  }
});

test('a pointed arch needs less depth than a round one, and a catenary far less', async () => {
  const S = await imp();
  const t = shape => S.minThickness({ shape, span: 12, thick: 0.8, count: 11 });
  const round = t('round'), pointed = t('pointed'), catenary = t('catenary');
  assert.ok(pointed < round, `pointed ${pointed.toFixed(3)} vs round ${round.toFixed(3)}`);
  assert.ok(catenary < pointed / 5, `catenary ${catenary.toFixed(3)} vs pointed ${pointed.toFixed(3)}`);
});

test('a thrust line found by the solver stays inside the stone at every joint', async () => {
  const S = await imp();
  for (const shape of ['round', 'pointed', 'catenary']) {
    const r = S.solve(S.build({ shape, span: 12, thick: 0.8, count: 11 }));
    assert.ok(r.ok, shape);
    for (const s of r.state.sg) assert.ok(s >= -1e-6 && s <= 1 + 1e-6, `${shape}: joint at ${s}`);
  }
});

test('a round arch too thin for its shape has no thrust line inside it', async () => {
  const S = await imp();
  const r = S.solve(S.build({ shape: 'round', span: 12, thick: 0.5, count: 11 }));
  assert.equal(r.ok, false);
  assert.ok(r.best.margin < 0);
});

test('a thin tall wall tips under a pointed vault, and a flying buttress saves it', async () => {
  const S = await imp();
  const a = S.build({ shape: 'pointed', span: 12, thick: 0.8, count: 11 }), st = S.solve(a).state;
  const alone = S.supports(a, st, { height: 20, width: 1.2, flyer: false });
  const braced = S.supports(a, st, { height: 20, width: 1.2, flyer: true, bdepth: 3.8, pinnacle: true });
  assert.equal(alone.wall.verdict, 'overturns');
  assert.equal(braced.wall.verdict, 'solid');
  assert.notEqual(braced.buttress.verdict, 'overturns');
  // the flyer carries the vault's whole horizontal thrust, along its own slope
  assert.ok(Math.abs(braced.flyer.C - st.H * Math.hypot(1, braced.flyer.slope)) < 1e-9);
});

test('a flyer leaping two aisles to a tall buttress still holds a nave wall up', async () => {
  const S = await imp();
  const a = S.build({ shape: 'pointed', span: 12, thick: 0.7, count: 11 }), st = S.solve(a).state;
  const s = S.supports(a, st, { height: 24, width: 1.2, flyer: true, bdepth: 3.8, pinnacle: true, gap: 10.9, bheight: 21 });
  assert.ok(Math.abs(s.flyer.g - 10.9) < 1e-12 && s.flyer.hb === 21);
  assert.equal(s.wall.verdict, 'solid');
  assert.equal(s.buttress.verdict, 'solid');
  // the defaults are unchanged: one aisle, a buttress at 0.8 of the wall
  const d = S.supports(a, st, { height: 24, width: 1.2, flyer: true, bdepth: 3.8, pinnacle: true });
  assert.ok(Math.abs(d.flyer.g - 4.8) < 1e-12 && Math.abs(d.flyer.hb - 19.2) < 1e-12);
});

test('a pier with no load but its own weight stands with its resultant at the middle', async () => {
  const S = await imp();
  const c = S.pierCheck(0, 2, 10, []);
  assert.ok(Math.abs(c.e - 0.5) < 1e-12);
  assert.equal(c.verdict, 'solid');
});
