// Runs the Advanced tab's ten-game batch and prints the reality-check table
// (sim per-game rate | team's real rate | ... for each club, plus league).
const { open } = require('./harness');
(async () => {
  const { browser, page, errors } = await open();
  await page.click('.tab[data-tab="advanced"]'); await page.click('#batch10');
  for (let i = 0; i < 180; i++) { await page.waitForTimeout(1000); const t = await page.$eval('#batchNote', e => e.textContent); if (/Average/.test(t)) break; }
  const table = await page.$$eval('#calib tr', rows => rows.map(r => Array.from(r.children).map(c => c.textContent.trim()).join(' | ')));
  console.log(table.join('\n')); console.log('ERRORS', errors);
  await browser.close();
})();
