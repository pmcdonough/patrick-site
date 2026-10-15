// Offsides and icings per game (both teams) at build defaults and at NHL-average multipliers, six seeded games each.
// NHL reference: about 3 offsides and 4 icings per team per game (see physics.json rulesBenchmarks).
const { load } = require('./engine');
(async () => {
  const E = await load();
  for (const [mode, nhl] of [['build defaults', false], ['nhl average', true]]) {
    const sim = E.create({ nhl }), ev = { Offside: 0, Icing: 0 };
    sim.on('log', t => { if (/Offside/.test(t)) ev.Offside++; if (/Icing/.test(t)) ev.Icing++; });
    const N = 6; for (let s = 1; s <= N; s++) E.play(sim, s);
    console.log(`${mode}: offsides/game ${(ev.Offside / N).toFixed(1)}, icings/game ${(ev.Icing / N).toFixed(1)} (both teams combined)`);
  }
})();
