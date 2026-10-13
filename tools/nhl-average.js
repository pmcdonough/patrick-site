// Six games with every engine multiplier at 1.0 (the NHL-calibrated tick on each slider),
// which is the setting the engine is balanced against. Build defaults deliberately run hotter.
const { open, playGames } = require('./harness');
(async () => {
  const { browser, page, errors } = await open();
  const res = await playGames(page, 6, "for (const k of Object.keys(r.cfg)) r.cfg[k] = 1;");
  console.log(JSON.stringify(res, null, 1)); console.log('ERRORS', errors);
  await browser.close();
})();
