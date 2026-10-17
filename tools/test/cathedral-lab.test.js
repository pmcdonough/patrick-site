// Cathedral Lab's masonry solver (public/cathedral-lab/src/solver.js) against known results: node --test tools/test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const imp = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'cathedral-lab', 'src', 'solver.js')).href);

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

// The buildings: every piece has a unique name and rests on pieces that exist (the kit refuses anything else), and the
// Gothic builder's section for Amiens checks out the way the page says.
const lab = f => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'cathedral-lab', 'src', f)).href);

test('both cathedrals build: unique names, every support exists, loads come out positive', async () => {
  for (const f of ['notre-dame.js', 'amiens.js']) {
    const M = await lab(f);
    assert.ok(M.pieces.length > 4000, `${f}: ${M.pieces.length} pieces`);
    assert.equal(new Set(M.pieces.map(p => p.id)).size, M.pieces.length, `${f}: duplicate piece names`);
    M.computeLoads(M.steps.length);
    for (const p of M.pieces) if (p.until == null) assert.ok(p.load >= p.w - 1e-9, `${f}: ${p.id} carries less than its own weight`);
    assert.ok(M.forceLines().length > 0, `${f}: no force lines`);
  }
});

test('Amiens: a taller vault pushes harder, and its buttresses are just deep enough', async () => {
  const { section } = await lab('gothic.js');
  const A = section({ span: 13.6, thick: 0.8, springing: 30, wall: 1.4, aisle: 8.6, aisleWall: 1.2, aisleSpring: 13.5, aisleTop: 20.5, aisleRoofTop: 25.5,
    levels: { arcade: 18.6, triforium: 24.5, cornice: 42.6 }, bdepth: 4, flyerLow: 26, flyerHigh: 33, tiers: 2, chapelTop: 15 });
  assert.ok(Math.abs(A.crown - 42.2) < 0.1, `crown at ${A.crown}`);
  assert.ok(A.SOL.state.H > 45 && A.SOL.state.H < 55, `push ${A.SOL.state.H}`);
  const s = A.supports(1);
  assert.equal(s.wall.verdict, 'solid'); assert.equal(s.buttress.verdict, 'solid');
  assert.ok(s.buttress.e > 1 / 3 && s.buttress.e < 0.4, `buttress resultant at ${s.buttress.e}`);
  const thin = section({ ...A, bdepth: 3.2 }).supports(1);
  assert.equal(thin.buttress.verdict, 'cracks');
});

// Design your own: the storm in the solver, the verdicts, the link, and that any design builds
test('a storm on the roof: no wind changes nothing, wind pushes the lee side out, an upper tier of flyers takes it', async () => {
  const S = await imp(), A = S.build({ shape: 'pointed', span: 13.6, thick: 0.8, count: 11 }), st = S.solve(A).state;
  const base = { height: 30, width: 1.4, flyer: true, bdepth: 4, pinnacle: true, gap: 8, bheight: 26 };
  assert.deepEqual(S.supports(A, st, { ...base, wind: { F: 0, y: 40 } }).wall.e, S.supports(A, st, base).wall.e);
  const calm = S.supports(A, st, base), one = S.supports(A, st, { ...base, wind: { F: 30, y: 40 } }), two = S.supports(A, st, { ...base, wind: { F: 30, y: 40 }, upper: { yA: 37, yB: 33 }, btop: 33 });
  assert.ok(one.wall.e < calm.wall.e && one.buttress.e < calm.buttress.e, 'the wind moves both resultants outward');
  assert.ok(two.wall.e > one.wall.e + 0.1, `the upper tier keeps the wall's resultant in: ${two.wall.e.toFixed(2)} against ${one.wall.e.toFixed(2)}`);
  assert.equal(two.wall.verdict, 'solid');
});

test('design your own: the verdicts, the link, and every challenge can be met', async () => {
  const D = await lab('design.js');
  assert.equal(D.assess(D.DEFAULT).falls, null);
  assert.deepEqual(D.assess({ ...D.DEFAULT, thick: 0.3 }).falls, { when: 'strike', what: 'vault' });
  assert.deepEqual(D.assess({ ...D.DEFAULT, tiers: 0, wall: 0.9 }).falls, { when: 'strike', what: 'wall' });
  assert.equal(D.assess({ ...D.DEFAULT, bdepth: 2 }).falls.when, 'storm');
  const d = D.clamp({ ...D.DEFAULT, crown: 44.5, shape: 'round', aisles: 2, tiers: 0, towers: 2, chapels: true, name: 'Saint <b>Anne</b>' });
  assert.equal(d.name, 'Saint bAnneb', 'the name keeps letters, digits and a little punctuation');
  assert.ok(!/[<>]/.test(d.name));
  assert.deepEqual(D.decode(D.encode(d), d.name), d);
  assert.equal(D.clamp({ ...D.DEFAULT, aisles: 2, tiers: 2 }).tiers, 1, 'two tiers need a single aisle');
  assert.ok(D.clamp({ ...D.DEFAULT, span: 17, crown: 16 }).crown >= D.minCrown({ ...D.DEFAULT, span: 17 }));
  const met = { stand: { crown: 22, span: 9, thick: 0.35, wall: 0.8, tiers: 2, bdepth: 3 }, nocrack: { crown: 34, span: 9, thick: 0.35, wall: 0.8, tiers: 2, bdepth: 3 },
    amiens: { crown: 43, span: 13.6, thick: 0.5, wall: 0.8, tiers: 2, bdepth: 3 }, beauvais: { crown: 48, span: 15, thick: 0.8, wall: 1.5, tiers: 1, bdepth: 6 },
    roman: { crown: 26.5, span: 13.6, thick: 0.5, wall: 2.5, tiers: 0, bdepth: 1.5 }, round: { crown: 30, span: 9, thick: 0.5, shape: 'round', wall: 0.8, tiers: 1, bdepth: 3 } };
  for (const [id, x] of Object.entries(met)) assert.ok(D.CHALLENGES.find(c => c.id === id).test(D.assess({ ...D.DEFAULT, aisles: 1, ...x })), id);
});

test('design your own: designs at the ends of every slider build, and one that falls says which pieces fall', async () => {
  const { make } = await lab('yours.js');
  for (const d of [{ crown: 16, span: 9, thick: 0.3, shape: 'round', wall: 3.5, aisles: 2, tiers: 0, bdepth: 7, bays: 3, towers: 2, chapels: true },
    { crown: 52, span: 17, thick: 1.2, shape: 'pointed', wall: 0.8, aisles: 2, tiers: 1, bdepth: 7, bays: 12, towers: 2, chapels: true },
    { crown: 52, span: 17, thick: 1.2, shape: 'round', wall: 3.5, aisles: 1, tiers: 2, bdepth: 1.5, bays: 12, towers: 1, chapels: true },
    { crown: 36, span: 12, thick: 0.7, shape: 'pointed', wall: 1.3, aisles: 1, tiers: 1, bdepth: 3.6, bays: 7, towers: 0, chapels: false }]) {
    const B = make(d);
    assert.equal(new Set(B.pieces.map(p => p.id)).size, B.pieces.length);
    for (const p of B.pieces) assert.ok(p.geo.attributes.position.array.every(Number.isFinite), `${p.id}: a vertex that is not a number`);
    B.computeLoads(B.steps.length);
    if (B.KIT.falls) { assert.ok(Object.keys(B.KIT.falls.motions).length > 50); assert.equal(B.KIT.falls.step, B.steps.length - 1); }
  }
});

test('design your own: a transept, a crossing and an apse build, alone or together, and fall when they should', async () => {
  const { make } = await lab('yours.js'), D = await lab('design.js');
  assert.equal(D.clamp({ ...D.DEFAULT, aisles: 2, transept: true }).transept, false, 'a transept needs one aisle');
  assert.deepEqual(D.decode(D.encode(D.clamp({ ...D.DEFAULT, transept: true, arms: 3, choir: 5, east: 1, spire: true })), ''), D.clamp({ ...D.DEFAULT, transept: true, arms: 3, choir: 5, east: 1, spire: true }));
  for (const d of [{ east: 1 }, { east: 1, aisles: 2, chapels: true }, { transept: true }, { transept: true, east: 1, spire: true, chapels: true, tiers: 2, towers: 2 },
    { transept: true, east: 1, tiers: 0, wall: 2.8, crown: 26 }, { transept: true, east: 1, arms: 1, choir: 2, span: 9, crown: 20, shape: 'round', wall: 3.5, tiers: 0 }, { transept: true, east: 1, span: 17, crown: 52, arms: 3, choir: 6 }]) {
    const B = make({ ...D.DEFAULT, ...d }), ids = B.pieces.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length, JSON.stringify(d));
    if (d.east) assert.ok(ids.some(i => i.startsWith('APR')), 'the apse has its half-ribs');
    if (d.transept) assert.ok(ids.includes('XBOSS') && ids.some(i => i.startsWith('TNE-')) && ids.some(i => i.startsWith('TSE-')), 'the crossing and both transept ends');
    for (const p of B.pieces) assert.ok(p.geo.attributes.position.array.every(Number.isFinite), `${p.id}: a vertex that is not a number`);
    B.computeLoads(B.steps.length);
    assert.ok(B.forceLines().length > 3);
  }
  const fall = make({ ...D.DEFAULT, transept: true, east: 1, bdepth: 2 });
  assert.equal(fall.KIT.falls.step, fall.steps.length - 1);
  assert.ok(Object.keys(fall.KIT.falls.motions).some(i => i.startsWith('AP')), 'the apse falls with the lee side');
  assert.ok(!Object.keys(fall.KIT.falls.motions).some(i => /^T[NS]/.test(i)), 'the transept arms stand in the storm');
});
