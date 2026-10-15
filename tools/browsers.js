// Every browser plays a seed the same way: the same seeded games at the NHL tick, in Node and in the strategy test's
// background workers in Chromium, Firefox and WebKit (Safari's engine). Browsers that are not installed are skipped;
// install them with  cd tools && npx playwright install firefox webkit
//
//   node tools/browsers.js [games]   (default 6)
const pw = require('playwright');
const { serve } = require('./serve');
const { openPage } = require('./harness');
const { load } = require('./engine');

(async () => {
  const n = +process.argv[2] || 6, seeds = Array.from({ length: n }, (_, i) => i + 1);
  const E = await load(), sim = E.create({ nhl: true });
  const key = teams => teams.map(t => `${t.goals} ${(+t.xg).toFixed(9)} ${t.sog}`).join(' / ');
  const node = seeds.map(s => key(E.play(sim, s).teams));
  const jobs = seeds.map(s => ({ id: s, seed: s, tacs: sim.teams.map(t => t.tac), cfg: { ...sim.cfg } }));
  const srv = await serve(); let failed = false, ran = 0;
  try {
    for (const name of ['chromium', 'firefox', 'webkit']) {
      let browser;
      try { browser = await pw[name].launch(); } catch (e) { console.log(`${name}: not installed, skipped`); continue; }
      try {
        const { page, errors } = await openPage(browser, srv);
        const res = await page.evaluate(async jobs => { const r = window.rinkSim; const rows = await r.runJobs(jobs, () => {}); return { workers: !r.TEST.poolFailed, rows: jobs.map(j => rows.get(j.id).teams) }; }, jobs);
        const differ = seeds.filter((s, i) => key(res.rows[i]) !== node[i]);
        const ok = res.workers && !differ.length && !errors.length; failed = failed || !ok; ran++;
        console.log(`${name} ${browser.version()}: ${differ.length ? `seeds ${differ.join(', ')} differ from Node` : `all ${n} games identical to Node`}${res.workers ? '' : ' (FAILED: workers did not start)'}${errors.length ? ` ERRORS ${JSON.stringify(errors)}` : ''}`);
      } finally { await browser.close(); }
    }
  } finally { await srv.close(); }
  if (!ran) { console.log('No browser could be launched.'); failed = true; }
  process.exitCode = failed ? 1 : 0;
})();
