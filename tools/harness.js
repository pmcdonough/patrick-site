// Shared loader for the checks that need the page itself (smoke, calibration, review, lab --pool). Serves
// public/ from inside this process (tools/serve.js), opens a page over HTTP in headless Chromium the way a
// visitor loads it, and for the sim pauses the animation and returns a page whose window.rinkSim exposes
// the engine and the page's test hooks. Checks of the engine alone run it in Node instead (tools/engine.js).
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

module.exports = { open, openPage, SIM };
