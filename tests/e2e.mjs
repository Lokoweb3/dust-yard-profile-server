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
const assets = [], matchCalls = [];
async function player(tag, init){
  const ctx = await browser.newContext({ viewport:{ width:960, height:560 } });
  await ctx.addInitScript(() => { localStorage.setItem('dy-tut', '1'); if (!localStorage.getItem('dy-age') && !window.__ageTest) localStorage.setItem('dy-age', 'adult'); });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  page.on('response', r => { if (r.url().includes('/assets/')) assets.push([r.url().split('/assets/')[1], r.status()]); if (r.url().includes('/api/match/')) matchCalls.push([tag, r.url().split('/api/match/')[1], r.status()]); });
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
  // the solo player wears the HD wolf head in third person, which loads that model on demand
  const solo = await player('solo', () => {
    localStorage.setItem('dy-op', JSON.stringify({ k:'animal', f:'wolfhd', w:'none', a:'sand', s:'olive', c:'red', v:'smoke', m:'none', h:'none', b:'none' }));
    localStorage.setItem('dustyard-settings', JSON.stringify({ view:'tp' }));
  });
  await click(solo, '[data-g="waves"]'); await click(solo, '#deployBtn');
  await solo.waitForFunction(() => !document.getElementById('hud').hidden, null, { timeout:60000 });
  await solo.waitForTimeout(4000);
  await solo.screenshot({ path:`${SHOTS}/solo.png` });
  assert(errors.length === 0, 'Errors during a solo match:\n' + errors.join('\n'));
  const bad = assets.filter(([, s]) => s !== 200);
  assert(!bad.length, 'Some models or textures failed to load: ' + JSON.stringify(bad));
  for (const id of ['soldierGlb', 'soldierDiff', 'soldierNorm', 'hdWolf']) assert(assets.some(([n]) => n.startsWith(id + '.')), `${id} was never loaded`);
  assert(matchCalls.some(([t, k, st]) => t === 'solo' && k === 'start' && st === 200), 'the server should have started checking the solo match: ' + JSON.stringify(matchCalls));
  await solo.context().close();
  console.log('Solo match (checked by the server): OK');

  // ---- age check ----
  for (const [year, band] of [[new Date().getFullYear() - 9, 'u13'], [new Date().getFullYear() - 15, 'teen'], [1990, 'adult']]){
    const ctx = await browser.newContext({ viewport:{ width:960, height:560 } });
    await ctx.addInitScript(() => { window.__ageTest = true; localStorage.setItem('dy-tut', '1'); });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`age ${band}: ${e.message}`));
    await page.goto(s.base + '/', { waitUntil:'load', timeout:120000 });
    await page.waitForSelector('#ageGate', { state:'visible', timeout:60000 });
    await page.fill('#agMonth', '1'); await page.fill('#agYear', String(year)); await page.click('#agGo');
    await page.waitForTimeout(500);
    const got = await page.evaluate(() => [localStorage.getItem('dy-age'), !document.getElementById('ageGate').hidden, document.getElementById('agMsg').textContent]);
    assert(got[0] === band, `born ${year}: expected ${band}, got ${got[0]}`);
    assert(got[1] === (band === 'u13'), `born ${year}: age screen should ${band === 'u13' ? 'stay' : 'close'}`);
    await ctx.close();
  }
  assert(errors.length === 0, 'Errors during the age check:\n' + errors.join('\n'));
  console.log('Age check: under 13 blocked, 13-17 and 18+ let in. OK');

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
  await browser.close();
  if (failed){ console.error('--- server log ---\n' + s.log()); process.exitCode = 1; }
  await s.stop();
}
