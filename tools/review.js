// Play Review fingerprint: every shot the page scores, with the expected goals of the real shot,
// of each pass option and of the drive, compared with the reference saved in tools/baselines.json.
// "Identical" means the page scores every shot exactly as before.
//
//   node tools/review.js          compare with the reference
//   node tools/review.js --save   make this the reference (only for an intended change; say so in the commit)
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { serve, writeBaselines } = require('./serve');
const { openPage } = require('./harness');

const BASELINE_FILE = path.join(__dirname, 'baselines.json');
const r9 = v => v == null ? null : +v.toFixed(9);

(async () => {
  const save = process.argv.includes('--save');
  const srv = await serve();
  const browser = await chromium.launch();
  let errors = [];
  try {
    const opened = await openPage(browser, srv, 'play-review/', () => !!window.playReview);
    errors = opened.errors;
    const shots = await opened.page.evaluate(() => window.playReview.scored.map(x => ({
      i: x.s.i, team: x.s.team, shot: x.shotXg,
      options: x.options.map(o => [o.m.id, o.recXg, o.value]),
      drive: x.drive ? x.drive.value : null,
    })));
    const rows = shots.map(x => [x.i, x.team, r9(x.shot), r9(x.options[0] ? x.options[0][2] : null), r9(x.drive),
      crypto.createHash('sha1').update(JSON.stringify(x.options.map(([id, a, b]) => [id, r9(a), r9(b)]))).digest('hex').slice(0, 10)]);
    const B = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
    const ref = B.playReview;
    console.log(`${rows.length} shots scored. Columns per shot: id, club, shot xG, best pass value, drive value, hash of every pass option.`);
    if (ref) {
      const key = r => JSON.stringify(r), old = new Map(ref.shots.map(r => [r[0], key(r)]));
      const differ = rows.filter(r => old.get(r[0]) !== key(r)).map(r => r[0]);
      const gone = ref.shots.filter(r => !rows.some(x => x[0] === r[0])).map(r => r[0]);
      if (!differ.length && !gone.length) console.log(`Identical to the reference saved ${ref.saved}: every shot scored exactly as before.`);
      else { console.log(`CHANGED from the reference saved ${ref.saved}: ${differ.length} shot(s) scored differently (${differ.slice(0, 12).join(', ')}${differ.length > 12 ? ', ...' : ''}), ${gone.length} missing. If intended, re-run with --save.`); process.exitCode = 1; }
    } else console.log('No reference saved; run with --save.');
    if (save) {
      B.playReview = { saved: new Date().toISOString().slice(0, 10), shots: rows };
      writeBaselines(BASELINE_FILE, B);
      console.log('Saved the Play Review reference to tools/baselines.json.');
    }
  } finally {
    console.log('ERRORS:', JSON.stringify(errors));
    if (errors.length) process.exitCode = 1;
    await browser.close(); await srv.close();
  }
})();
