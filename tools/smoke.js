// Plays one full game and reports script errors, the score line and the play-by-play mix. Then loads
// the home page and Play Review, so a data file that fails to load or parse fails the check, and
// checks every version stamp on the pages and their imports against each project's version.
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
  // Version stamps: each project's page and its own imports carry its version; imports from the sim's engine (Play
  // Review uses its expected goals and rink) carry the sim's. A module imported without a stamp would be cached forever.
  const simVersion = (await page.textContent('#version')).replace(/^v/, '');
  const fs = require('fs'), path = require('path'), pub = path.join(__dirname, '..', 'public');
  function checkStamps(project, version) {
    const root = path.join(pub, project), bad = [];
    const files = ['index.html', ...fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('src', f))];
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      const refs = f.endsWith('.html') ? [...text.matchAll(/(?:href|src)="([^"]+\.(?:js|css)[^"]*)"/g)].map(m => m[1]) : [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);
      for (const ref of refs) {
        if (/^https?:/.test(ref)) continue;
        const want = ref.includes('bruins-vs-canadiens/') && project !== 'bruins-vs-canadiens' ? simVersion : version, got = (ref.match(/\?v=([0-9.]+)$/) || [])[1];
        if (got !== want) bad.push(`${project}/${f}: ${ref} (want ?v=${want})`);
      }
    }
    if (bad.length) errors.push('version stamps: ' + bad.join(', ')); else console.log(`Version stamps in ${project} match (${version}${project === 'bruins-vs-canadiens' ? '' : `, sim ${simVersion}`}).`);
  }
  checkStamps('bruins-vs-canadiens', simVersion);
  const pr = await openPage(browser, srv, 'play-review/', () => !!window.playReview).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  if (pr.page) checkStamps('play-review', (await pr.page.textContent('#version')).replace(/^Play review v/, ''));
  for (const [rel, ready] of [['', () => document.readyState === 'complete'], ['play-review/', () => !!window.playReview]]) {
    const p = await openPage(browser, srv, rel, ready).catch(e => ({ errors: [`${rel || 'home page'} did not finish loading: ${e.message.split('\n')[0]}`] }));
    errors.push(...p.errors.map(e => `${rel || 'home page'}: ${e}`));
    if (!p.errors.length) console.log(`${rel || 'home page'} loads cleanly.`);
  }
  console.log('ERRORS:', errors);
  await close();
  process.exit(errors.length ? 1 : 0);
})();
