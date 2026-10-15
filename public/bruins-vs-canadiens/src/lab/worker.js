// The Game plan lab's background worker: plays one seeded game per job and posts the row back.
// It imports the engine directly (it never touches the page), with this file's version stamp so both come
// from the same deploy. A game seeded with s plays exactly as tools/lab.js plays seed s.
const engine = import('../engine/sim.js' + self.location.search);
let sim = null;

// Messages are handled in the order they arrive: each waits on the same import, so 'init' always runs before the first job.
self.onmessage = async e => {
  const { createSim } = await engine; const m = e.data;
  if (m.type === 'init') { sim = createSim(m.DATA); self.postMessage({ type: 'ready' }); return; }
  Object.assign(sim.cfg, m.cfg); sim.setTactics(0, m.tacs[0]); sim.setTactics(1, m.tacs[1]);
  sim.newGame(m.seed); let k = 0; while (!sim.game.over && k++ < 300000) sim.tick(0.03);
  self.postMessage({ type: 'row', id: m.id, row: { end: sim.game.shootout ? 'SO' : sim.game.overtime ? 'OT' : 'REG', teams: sim.teams.map(t => ({ goals: t.score, xg: t.xg, sog: t.shots, sample: sim.teamSample(t) })) } });
};
