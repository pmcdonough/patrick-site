// Six seeded games with every engine multiplier at 1.0 (the NHL-calibrated tick on each slider),
// which is the setting the engine is balanced against. Build defaults deliberately run hotter.
const { load } = require('./engine');
(async () => {
  const E = await load(), sim = E.create({ nhl: true }), n = 6;
  const keys = ['score', 'shots', 'attempts', 'blocked', 'missed', 'xg', 'pim', 'take', 'freezes', 'offsides', 'icings', 'changes'];
  const sums = sim.teams.map(() => Object.fromEntries(keys.map(k => [k, 0]))), wins = [0, 0];
  for (let s = 1; s <= n; s++) {
    E.play(sim, s);
    sim.teams.forEach((t, i) => keys.forEach(k => { sums[i][k] += t[k]; }));
    if (sim.teams[0].score > sim.teams[1].score) wins[0]++; else if (sim.teams[1].score > sim.teams[0].score) wins[1]++;
  }
  console.log(JSON.stringify({ games: n, wins, perGame: sums.map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +(v / n).toFixed(2)]))), teams: sim.teams.map(t => t.abbr) }, null, 1));
})();
