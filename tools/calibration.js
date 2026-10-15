// Runs a ten-game matchup in the Lab tab and prints the record and the reality-check table
// (sim per-game rate | team's real rate | ... for each club, plus league).
const { open } = require('./harness');
(async () => {
  const { browser, page, errors } = await open();
  await page.click('[data-view="test"]'); await page.selectOption('#labN', '10'); await page.click('#labRun');
  for (let i = 0; i < 180; i++) { await page.waitForTimeout(1000); const t = await page.$eval('#labNote', e => e.textContent); if (/^\d+ games/.test(t)) break; }
  const dump = async sel => (await page.$$eval(sel, rows => rows.map(r => Array.from(r.children).map(c => c.textContent.trim()).join(' | ')))).join('\n');
  console.log(await dump('#labResult tr')); console.log(''); console.log(await dump('#calib tr')); console.log('ERRORS', errors);
  await browser.close();
})();
