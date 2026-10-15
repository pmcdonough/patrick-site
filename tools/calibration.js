// Runs a ten-game baseline in the Game plan lab through the page's own controls (both plans as the lab starts) and
// prints the record and the comparison with the real 2025-26 teams (sim | real for each club, plus the league).
const { open } = require('./harness');
(async () => {
  const { page, errors, close } = await open();
  await page.click('[data-view="lab"]'); await page.selectOption('#labN', '10'); await page.click('#labRun');
  await page.waitForFunction(() => window.rinkSim.LAB.base && !window.rinkSim.TEST.running, null, { timeout: 180000 });
  const dump = async sel => (await page.$$eval(sel, rows => rows.map(r => Array.from(r.children).map(c => c.textContent.trim()).join(' | ')))).join('\n');
  console.log(await page.textContent('#baseHeadline')); console.log(await dump('#baseRecord tr')); console.log('');
  console.log(await page.textContent('#realScore')); console.log(await dump('#calib tr')); console.log('ERRORS', errors);
  await close();
})();
