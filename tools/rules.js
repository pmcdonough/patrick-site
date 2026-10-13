// Offsides and icings per game (both teams) at build defaults and at NHL-average multipliers.
// NHL reference: about 3 offsides and 4 icings per team per game (see physics.json rulesBenchmarks).
const { open } = require('./harness');
(async () => {
  const { browser, page, errors } = await open();
  for (const mode of ['build defaults', 'nhl average']) {
    const res = await page.evaluate((mode) => {
      const r = window.rinkSim; if (mode === 'nhl average') document.getElementById('adminFactory').click(); else document.getElementById('adminReset').click();
      const ev = { Offside: 0, Icing: 0 }; document.getElementById('log').prepend = n => { const t = n.textContent; if (/^.*Offside/.test(t)) ev.Offside++; if (/Icing/.test(t)) ev.Icing++; };
      const N = 6; for (let g = 0; g < N; g++) { document.getElementById('newgame').click(); let n = 0; while (!r.game.over && n++ < 300000) r.tick(0.03); }
      return mode + ': offsides/game ' + (ev.Offside / N).toFixed(1) + ', icings/game ' + (ev.Icing / N).toFixed(1) + ' (both teams combined)';
    }, mode);
    console.log(res);
  }
  console.log('ERRORS', errors);
  await browser.close();
})();
