// Plays one full game and reports script errors, the score line and the play-by-play mix. Then loads
// the home page and Play Review, so a data file that fails to load or parse fails the check, and
// checks that the sim's version stamps (style.css?v=, src/main.js?v=) match its version.
const { open, openPage } = require('./harness');
(async () => {
  const { browser, srv, page, errors, url, close } = await open();
  const res = await page.evaluate(() => {
    const r = window.rinkSim; const t0 = performance.now();
    while (!r.game.over) r.tick(0.03);
    return { ms: Math.round(performance.now() - t0), teams: r.teams.map(t => ({ team: t.abbr, goals: t.score, sog: t.shots, attempts: t.attempts, pim: t.pim, takeaways: t.take })) };
  });
  const log = await page.$$eval('#log li', ls => ls.map(l => l.textContent));
  const counts = {}; log.forEach(l => { const k = l.replace(/^\S+ \d+:\d+/, '').trim().split(/[ ,]/)[0]; counts[k] = (counts[k] || 0) + 1; });
  console.log(url); console.log(res); console.log(log.length, 'log lines', counts);
  const stamps = await page.evaluate(() => ({ version: document.getElementById('version').textContent.replace(/^v/, ''),
    stamps: [...document.querySelectorAll('link[rel=stylesheet][href^="style.css"], script[type=module]')].map(e => (e.getAttribute('href') || e.getAttribute('src')).split('?v=')[1]) }));
  if (stamps.stamps.length !== 2 || stamps.stamps.some(v => v !== stamps.version)) errors.push(`version stamps ${JSON.stringify(stamps.stamps)} do not match the sim version ${stamps.version}`);
  else console.log(`Version stamps match the sim version ${stamps.version}.`);
  for (const [rel, ready] of [['', () => document.readyState === 'complete'], ['play-review/', () => !!window.playReview]]) {
    const p = await openPage(browser, srv, rel, ready).catch(e => ({ errors: [`${rel || 'home page'} did not finish loading: ${e.message.split('\n')[0]}`] }));
    errors.push(...p.errors.map(e => `${rel || 'home page'}: ${e}`));
    if (!p.errors.length) console.log(`${rel || 'home page'} loads cleanly.`);
  }
  console.log('ERRORS:', errors);
  await close();
  process.exit(errors.length ? 1 : 0);
})();
