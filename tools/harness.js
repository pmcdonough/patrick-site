// Shared loader for the headless checks. Serves public/ from inside this process (tools/serve.js),
// opens the sim page over HTTP in headless Chromium the way a visitor loads it, pauses the
// animation, and returns a page whose window.rinkSim exposes { tick, teams, game, puck, DATA, cfg }
// for driving games far faster than real time.
//
//   npm install && npx playwright install chromium   (once, in tools/)
//   node tools/smoke.js
const { chromium } = require('playwright');
const { serve } = require('./serve');

const SIM = 'bruins-vs-canadiens/';

// Loads a page under public/ (default the sim) and waits for `ready` to be true in the page.
async function openPage(browser, srv, rel = SIM, ready = () => !!window.rinkSim, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, ...opts });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errors.push('request failed: ' + r.url()); });
  await page.goto(srv.url + rel, { waitUntil: 'domcontentloaded' });
  try { await page.waitForFunction(ready, null, { timeout: 15000 }); }
  catch (e) { throw new Error(`${rel || 'home page'} did not start within 15 s. Page errors: ${JSON.stringify(errors)}`); }
  return { page, errors };
}

// The sim, served and paused. close() shuts the browser and the server.
async function open(opts = {}) {
  const srv = await serve();
  const browser = await chromium.launch();
  const { page, errors } = await openPage(browser, srv, SIM, undefined, opts);
  await page.waitForTimeout(300);
  await page.click('#pause');
  const close = async () => { await browser.close(); await srv.close(); };
  return { browser, srv, page, errors, url: srv.url + SIM, close };
}

// Runs N full games inside the page and returns per-team totals. `setup` runs once before the games.
async function playGames(page, n, setup) {
  return page.evaluate(([n, setup]) => {
    const r = window.rinkSim; document.getElementById('log').prepend = () => {};
    if (setup) new Function('r', setup)(r);
    const keys = ['score', 'shots', 'attempts', 'blocked', 'missed', 'xg', 'pim', 'take', 'freezes', 'offsides', 'icings', 'changes'];
    const sums = r.teams.map(() => Object.fromEntries(keys.map(k => [k, 0])));
    const wins = [0, 0];
    for (let g = 0; g < n; g++) {
      document.getElementById('newgame').click(); let k = 0;
      while (!r.game.over && k++ < 300000) r.tick(0.03);
      r.teams.forEach((t, i) => keys.forEach(k => { sums[i][k] += t[k]; }));
      if (r.teams[0].score > r.teams[1].score) wins[0]++; else if (r.teams[1].score > r.teams[0].score) wins[1]++;
    }
    return { games: n, wins, perGame: sums.map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +(v / n).toFixed(2)]))), teams: r.teams.map(t => t.abbr) };
  }, [n, setup || '']);
}

module.exports = { open, openPage, playGames, SIM };
