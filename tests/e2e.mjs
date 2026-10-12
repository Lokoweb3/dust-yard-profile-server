// End-to-end: real browsers play the game against a throwaway server.
// 1. a solo wave match starts with no errors
// 2. two players form a co-op squad and start a match together
import { chromium } from 'playwright';
import { startServer, assert } from './helpers.mjs';
import { mkdirSync } from 'node:fs';

const SHOTS = 'test-results'; mkdirSync(SHOTS, { recursive:true });
const s = await startServer(8792);
const browser = await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH || undefined,
  args:['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
});
const errors = [];
async function player(tag){
  const ctx = await browser.newContext({ viewport:{ width:960, height:560 } });
  await ctx.addInitScript(() => { localStorage.setItem('dy-tut', '1'); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  await page.goto(s.base + '/', { waitUntil:'load', timeout:120000 });
  await page.waitForSelector('#deployBtn', { state:'visible', timeout:120000 });
  await page.waitForTimeout(2500);
  return page;
}
const click = (page, sel) => page.evaluate(q => document.querySelector(q).click(), sel);
const clickText = (page, scope, text) => page.evaluate(([q, t]) => [...document.querySelectorAll(q + ' button')].find(b => b.textContent.trim() === t).click(), [scope, text]);
const hudShown = page => page.evaluate(() => !document.getElementById('hud').hidden);

let failed = false;
try {
  // ---- solo ----
  const solo = await player('solo');
  await click(solo, '[data-g="waves"]'); await click(solo, '#deployBtn');
  await solo.waitForFunction(() => !document.getElementById('hud').hidden, null, { timeout:60000 });
  await solo.waitForTimeout(4000);
  await solo.screenshot({ path:`${SHOTS}/solo.png` });
  assert(errors.length === 0, 'Errors during a solo match:\n' + errors.join('\n'));
  await solo.context().close();
  console.log('Solo match: OK');

  // ---- co-op ----
  const A = await player('host'), B = await player('guest');
  for (const p of [A, B]){ await click(p, '[data-g="coop"]'); await click(p, '#deployBtn'); await p.waitForSelector('#coopPanel', { state:'visible' }); }
  await clickText(A, '#coopBody', 'Host a squad');
  await A.waitForFunction(() => /Squad code:/.test(document.getElementById('coopBody').textContent), null, { timeout:30000 });
  const code = (await A.evaluate(() => document.querySelector('#coopBody .lgName').textContent.match(/Squad code: ([A-Z0-9]+)/)[1])).toLowerCase();
  await B.fill('#coopCode', code); await clickText(B, '#coopBody', 'Join');
  await A.waitForFunction(() => document.querySelectorAll('#coopBody .acctList div').length === 2, null, { timeout:30000 });
  await clickText(A, '#coopBody', 'Start match');
  await A.waitForFunction(() => !document.getElementById('hud').hidden, null, { timeout:60000 });
  await B.waitForFunction(() => !document.getElementById('hud').hidden, null, { timeout:60000 });
  // each player's status line lists the other one
  await A.waitForFunction(() => document.getElementById('coopStatus').textContent.split('·').length >= 2, null, { timeout:60000 });
  await B.waitForFunction(() => document.getElementById('coopStatus').textContent.split('·').length >= 2, null, { timeout:60000 });
  await A.waitForTimeout(3000);
  await A.screenshot({ path:`${SHOTS}/coop-host.png` }); await B.screenshot({ path:`${SHOTS}/coop-guest.png` });
  assert(errors.length === 0, 'Errors during co-op:\n' + errors.join('\n'));
  console.log(`Co-op squad ${code}: both players in the match. OK`);
} catch (e){
  failed = true; console.error('E2E failed: ' + e.message); if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
} finally {
  await browser.close(); s.stop();
  if (failed){ console.error('--- server log ---\n' + s.log()); process.exitCode = 1; }
}
