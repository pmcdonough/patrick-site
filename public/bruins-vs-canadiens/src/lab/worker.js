// Test a strategy's background worker: plays one seeded game per job and posts the row back.
// It runs the page's own module (src/main.js) behind a stand-in for the page: every element
// access returns a harmless stub, so the sim starts with no screen and only its engine does
// anything. A game seeded with s plays exactly as tools/lab.js plays seed s.
self.__RINK_WORKER = true; self.window = self;
const stub = (() => { const f = function () { return p; }; const p = new Proxy(f, { get(t, k) { if (k === Symbol.toPrimitive) return h => (h === 'number' ? 0 : ''); if (k === Symbol.iterator) return function* () {}; if (k === 'length') return 0; if (k === 'then') return undefined; return p; }, set() { return true; }, apply() { return p; }, construct() { return p; } }); return p; })();
self.document = stub; self.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; self.requestAnimationFrame = () => 0; self.matchMedia = () => ({ matches: false }); self.getComputedStyle = () => stub;

// Imported after the stand-in is in place, with this file's version stamp so both come from the same deploy.
const sim = import('../main.js' + self.location.search);

// Messages are handled in the order they arrive: each waits on the same import, so 'init' always runs before the first job.
self.onmessage = async e => {
  const { startSim } = await sim; const m = e.data;
  if (m.type === 'init') { startSim(m.DATA); self.postMessage({ type: 'ready' }); return; }
  const r = self.rinkSim; Object.assign(r.cfg, m.cfg); r.teams[0].tac = m.tacs[0]; r.teams[1].tac = m.tacs[1];
  let a = m.seed * 2654435761; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.newGame(); let k = 0; while (!r.game.over && k++ < 300000) r.tick(0.03);
  self.postMessage({ type: 'row', id: m.id, row: { end: r.game.shootout ? 'SO' : r.game.overtime ? 'OT' : 'REG', teams: r.teams.map(t => ({ goals: t.score, xg: t.xg, sog: t.shots, sample: r.teamSample(t) })) } });
};
