// Plays one full game and reports script errors, the score line and the play-by-play mix. Then loads
// the home page, Play Review, both Cathedral Lab pages and the old Keystone address, so a data file or module that fails to load fails the
// check, and checks every version stamp on the pages and their imports against each project's version.
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
  function checkStamps(project, version, pages = ['']) {
    const root = path.join(pub, project), bad = [];
    const files = pages.flatMap(pg => ['index.html', ...fs.readdirSync(path.join(root, pg, 'src'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('src', f))].map(f => path.join(pg, f)));
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      const refs = f.endsWith('.html') ? [...text.matchAll(/(?:href|src)="([^"]+\.(?:js|css)[^"]*)"/g)].map(m => m[1]) : [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);
      for (const ref of refs) {
        if (/^https?:/.test(ref)) continue;
        const want = ref.includes('bruins-vs-canadiens/') && project !== 'bruins-vs-canadiens' ? simVersion : version, got = (ref.match(/\?v=([0-9.]+)$/) || [])[1];
        if (got !== want) bad.push(`${project}/${f}: ${ref} (want ?v=${want})`);
      }
    }
    if (bad.length) errors.push('version stamps: ' + bad.join(', ')); else console.log(`Version stamps in ${project} match (${version}${project === 'play-review' ? `, sim ${simVersion}` : ''}).`);
  }
  checkStamps('bruins-vs-canadiens', simVersion);
  const pr = await openPage(browser, srv, 'play-review/', () => !!window.playReview).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  if (pr.page) checkStamps('play-review', (await pr.page.textContent('#version')).replace(/^Play review v/, ''));
  // Cathedral Lab: the 3D build has to start its 3D graphics and draw the model, and both pages show the same version
  const ks = await openPage(browser, srv, 'cathedral-lab/', () => !!window.cathedralLab).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  if (ks.page) {
    const v = await ks.page.evaluate(() => window.cathedralLab.VERSION);
    checkStamps('cathedral-lab', v, ['', 'arch-lab']);
    const shown = await ks.page.evaluate(() => ({ nogl: !!document.querySelector('.nogl'), pieces: window.cathedralLab.pieces.length, steps: window.cathedralLab.steps.length }));
    if (shown.nogl) errors.push('cathedral-lab/: the 3D graphics did not start');
    else console.log(`cathedral-lab/ draws ${shown.pieces} pieces in ${shown.steps} steps (Cathedral Lab ${v}).`);
    const al = await openPage(browser, srv, 'cathedral-lab/arch-lab/', () => !!window.archLab).catch(e => ({ errors: [e.message.split('\n')[0]] }));
    if (al.page && await al.page.evaluate(() => window.archLab.VERSION) !== v) errors.push('cathedral-lab/arch-lab/: its VERSION differs from the 3D page');
    // close pages when done: an open 3D page keeps the CPU busy on a machine with no graphics card, and slows the next one
    await ks.page.close(); if (al.page) await al.page.close();
  }
  // the old Keystone addresses forward to Cathedral Lab, so they too have to end up on a working page
  for (const [rel, ready] of [['', () => document.readyState === 'complete'], ['play-review/', () => !!window.playReview], ['cathedral-lab/', () => !!window.cathedralLab], ['cathedral-lab/arch-lab/', () => !!window.archLab && document.readyState === 'complete'], ['keystone/', () => !!window.cathedralLab], ['keystone/arch-lab/', () => !!window.archLab]]) {
    const p = await openPage(browser, srv, rel, ready).catch(e => ({ errors: [`${rel || 'home page'} did not finish loading: ${e.message.split('\n')[0]}`] }));
    errors.push(...p.errors.map(e => `${rel || 'home page'}: ${e}`));
    if (!p.errors.length) console.log(`${rel || 'home page'} loads cleanly.`);
    if (p.page) await p.page.close();
  }
  console.log('ERRORS:', errors);
  await close();
  process.exit(errors.length ? 1 : 0);
})();
