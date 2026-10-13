// Plays one full game and reports script errors, the score line and the play-by-play mix.
const { open } = require('./harness');
(async () => {
  const { browser, page, errors, file } = await open();
  const res = await page.evaluate(() => {
    const r = window.rinkSim; const t0 = performance.now();
    while (!r.game.over) r.tick(0.03);
    return { ms: Math.round(performance.now() - t0), teams: r.teams.map(t => ({ team: t.abbr, goals: t.score, sog: t.shots, attempts: t.attempts, pim: t.pim, takeaways: t.take })) };
  });
  const log = await page.$$eval('#log li', ls => ls.map(l => l.textContent));
  const counts = {}; log.forEach(l => { const k = l.replace(/^\S+ \d+:\d+/, '').trim().split(/[ ,]/)[0]; counts[k] = (counts[k] || 0) + 1; });
  console.log(file); console.log(res); console.log(log.length, 'log lines', counts);
  console.log('ERRORS:', errors);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
