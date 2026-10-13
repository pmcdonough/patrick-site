// Shared loader for the headless checks. Opens the sim page in headless Chromium with the
// embedded data, pauses the animation, and returns a page whose window.rinkSim exposes
// { tick, teams, game, puck, DATA, cfg } for driving games far faster than real time.
//
//   npm install playwright && npx playwright install chromium   (once)
//   node tools/smoke.js [path/to/index.html]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEFAULT_PAGE = path.join(__dirname, '..', 'public', 'bruins-vs-canadiens', 'index.html');

async function open(opts = {}) {
  const file = process.argv[2] || DEFAULT_PAGE;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, ...opts });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let html = fs.readFileSync(file, 'utf8');
  if (!/^<!doctype/i.test(html.trim())) html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>';
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.click('#pause');
  return { browser, page, errors, file };
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

module.exports = { open, playGames };
