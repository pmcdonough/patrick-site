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
      // static imports, and dynamic ones (Cathedral Lab loads its buildings with import())
      const refs = f.endsWith('.html') ? [...text.matchAll(/(?:href|src)="([^"]+\.(?:js|css)[^"]*)"/g)].map(m => m[1]) : [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
      for (const ref of refs) {
        if (/^https?:/.test(ref)) continue;
        // imports from another project carry that project's version: Play Review's from the sim, Ring Kart's Three.js from Cathedral Lab
        const want = ref.includes('bruins-vs-canadiens/') && project !== 'bruins-vs-canadiens' ? simVersion : ref.includes('cathedral-lab/') && project !== 'cathedral-lab' ? cathVersion : version, got = (ref.match(/\?v=([0-9.]+)$/) || [])[1];
        if (got !== want) bad.push(`${project}/${f}: ${ref} (want ?v=${want})`);
      }
    }
    if (bad.length) errors.push('version stamps: ' + bad.join(', ')); else console.log(`Version stamps in ${project} match (${version}${project === 'play-review' ? `, sim ${simVersion}` : ''}).`);
  }
  const cathVersion = (fs.readFileSync(path.join(pub, 'cathedral-lab', 'src', 'main.js'), 'utf8').match(/const VERSION = '([0-9.]+)';/) || [])[1];
  checkStamps('bruins-vs-canadiens', simVersion);
  const pr = await openPage(browser, srv, 'play-review/', () => !!window.playReview).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  if (pr.page) checkStamps('play-review', (await pr.page.textContent('#version')).replace(/^Play review v/, ''));
  // Cathedral Lab: the 3D build has to start its 3D graphics and draw the model, and both pages show the same version
  const ks = await openPage(browser, srv, 'cathedral-lab/', () => !!window.cathedralLab).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  if (ks.page) {
    const v = await ks.page.evaluate(() => window.cathedralLab.VERSION);
    checkStamps('cathedral-lab', v, ['', 'arch-lab', 'design']);
    const shown = await ks.page.evaluate(() => ({ nogl: !!document.querySelector('.nogl'), pieces: window.cathedralLab.pieces.length, steps: window.cathedralLab.steps.length }));
    if (shown.nogl) errors.push('cathedral-lab/: the 3D graphics did not start');
    else console.log(`cathedral-lab/ draws ${shown.pieces} pieces in ${shown.steps} steps (Cathedral Lab ${v}).`);
    // each line of thrust waits for its own vault: Notre-Dame's apse lines come long after the nave's
    const ready = await ks.page.evaluate(() => { const r = window.cathedralLab.bayLines.map(g => g.userData.ready); return [Math.min(...r), Math.max(...r)]; });
    if (ready[1] <= ready[0]) errors.push('cathedral-lab/: every line of thrust appears at the same step, even where the building is not yet up');
    const al = await openPage(browser, srv, 'cathedral-lab/arch-lab/', () => !!window.archLab).catch(e => ({ errors: [e.message.split('\n')[0]] }));
    if (al.page && await al.page.evaluate(() => window.archLab.VERSION) !== v) errors.push('cathedral-lab/arch-lab/: its VERSION differs from the 3D page');
    // close pages when done: an open 3D page keeps the CPU busy on a machine with no graphics card, and slows the next one
    await ks.page.close(); if (al.page) await al.page.close();
    // Design your own: a preset gets its verdict, and a design that falls is built in 3D and falls without an error
    const dp = await openPage(browser, srv, 'cathedral-lab/design/', () => !!window.designLab).catch(e => ({ errors: [e.message.split('\n')[0]] }));
    errors.push(...dp.errors.map(e => `cathedral-lab/design/: ${e}`));
    if (dp.page) {
      if (await dp.page.evaluate(() => window.designLab.VERSION) !== v) errors.push('cathedral-lab/design/: its VERSION differs from the 3D page');
      const verdict = await dp.page.evaluate(() => { window.designLab.set({ crown: 36, span: 12, thick: 0.3 }); return window.designLab.assessment.verdict; });
      if (verdict !== 'falls') errors.push(`cathedral-lab/design/: a vault 0.3 m deep ${verdict}`);
      const href = await dp.page.getAttribute('#build', 'href'); await dp.page.close();
      const yp = await openPage(browser, srv, 'cathedral-lab/' + href.replace(/^\.\.\//, ''), () => !!window.cathedralLab && window.cathedralLab.building === 'yours').catch(e => ({ errors: [e.message.split('\n')[0]] }));
      errors.push(...yp.errors.map(e => `cathedral-lab/?b=yours: ${e}`));
      if (yp.page) {
        const f = await yp.page.evaluate(() => { const L = window.cathedralLab; L.go(L.falls, false); L.go(L.falls + 1, true); return { falls: L.falls, pieces: L.pieces.length }; });
        await yp.page.waitForTimeout(2500);
        if (f.falls == null) errors.push('cathedral-lab/?b=yours: the design that falls did not fall');
        else console.log(`cathedral-lab/?b=yours builds a design in ${f.pieces} pieces and it falls at step ${f.falls + 1}, as the design page said.`);
        errors.push(...yp.errors.map(e => `cathedral-lab/?b=yours: ${e}`));
        await yp.page.close();
      }
    }
  }
  // the old Keystone addresses forward to Cathedral Lab, so they too have to end up on a working page
  // Ring Kart: the 3D has to start, the queue has to move, and a car through the gate has to get down the road
  const rk = await openPage(browser, srv, 'ring-kart/', () => !!window.ringKart).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  errors.push(...rk.errors.map(e => `ring-kart/: ${e}`));
  if (rk.page) {
    const v = await rk.page.evaluate(() => window.ringKart.VERSION);
    checkStamps('ring-kart', v);
    const r = await rk.page.evaluate(() => {
      const k = window.ringKart; if (document.querySelector('.nogl')) return { nogl: true };
      k.start(); k.keys.add('arrowup'); let n = 0;
      while (k.S.queue[0] !== k.player && n++ < 60) k.run(1);
      k.run(2); k.keys.delete('arrowup'); k.ticket(); k.autopilot(true); k.run(20);
      return { mode: k.S.mode, metres: Math.round(k.player.s - k.track.gateAt * k.track.ds), km: (k.track.L / 1000).toFixed(1), cars: k.cars.length };
    });
    if (r.nogl) errors.push('ring-kart/: the 3D graphics did not start');
    else if (r.mode !== 'race' || r.metres < 300) errors.push(`ring-kart/: 20 s after the gate the car is ${r.metres} m down the road (${r.mode})`);
    else console.log(`ring-kart/ builds a ${r.km} km lap with ${r.cars} cars; 20 s after the gate you are ${r.metres} m down the road (Ring Kart ${v}).`);
    await rk.page.close();
  }
  for (const [rel, ready] of [['', () => document.readyState === 'complete'], ['play-review/', () => !!window.playReview], ['cathedral-lab/', () => !!window.cathedralLab], ['cathedral-lab/?b=amiens', () => !!window.cathedralLab && window.cathedralLab.building === 'amiens'], ['cathedral-lab/arch-lab/', () => !!window.archLab && document.readyState === 'complete'], ['cathedral-lab/design/', () => !!window.designLab], ['cathedral-lab/?b=yours', () => !!window.cathedralLab && window.cathedralLab.building === 'yours'], ['keystone/', () => !!window.cathedralLab], ['keystone/arch-lab/', () => !!window.archLab], ['ring-kart/', () => !!window.ringKart]]) {
    const p = await openPage(browser, srv, rel, ready).catch(e => ({ errors: [`${rel || 'home page'} did not finish loading: ${e.message.split('\n')[0]}`] }));
    errors.push(...p.errors.map(e => `${rel || 'home page'}: ${e}`));
    if (!p.errors.length) console.log(`${rel || 'home page'} loads cleanly.`);
    if (p.page) await p.page.close();
  }
  // Ring Kart's pro lap last, on a page of its own: the pro drives the best line from the barrier to the gantry,
  // clean. It is the heaviest thing the check does, so nothing else loads after it in this browser.
  const pp = await openPage(browser, srv, 'ring-kart/', () => !!window.ringKart).catch(e => ({ errors: [e.message.split('\n')[0]] }));
  errors.push(...pp.errors.map(e => `ring-kart/ (pro lap): ${e}`));
  if (pp.page) {
    const pro = await pp.page.evaluate(() => {
      const k = window.ringKart; k.watch(); let n = 0, grass = 0;
      while (k.S.mode === 'pro' && n++ < 100) { k.run(4); if (k.player.grass) grass++; }
      return { mode: k.S.mode, time: k.player.time, grass, car: k.player.spec.name };
    });
    if (pro.mode !== 'proDone' || pro.grass) errors.push(`ring-kart/: the pro lap did not finish clean (${pro.mode}, ${pro.grass} checks on the grass)`);
    else console.log(`ring-kart/ the pro laps the ${pro.car} in ${pro.time.toFixed(1)} s on the best line.`);
    await pp.page.close();
  }
  console.log('ERRORS:', errors);
  await close();
  process.exit(errors.length ? 1 : 0);
})();
