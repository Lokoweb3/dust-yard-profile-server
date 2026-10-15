// Screenshot the yard in a solo waves match, for checking visual changes.
// Usage: node scripts/screenshot-game.mjs <outPrefix>   (writes <outPrefix>-menu/play.png)
import { chromium } from 'playwright';
import { startServer } from '../tests/helpers.mjs';

const prefix = process.argv[2] || 'shot';
const s = await startServer(8793);
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  localStorage.setItem('dy-tut', '1');
  localStorage.setItem('dy-age', 'adult');
  localStorage.setItem('dustyard-settings', JSON.stringify({ quality: 'high', auto: false }));
});
const page = await ctx.newPage();
page.on('pageerror', e => console.error('PAGEERROR:', e.message));
await page.goto(s.base + '/', { waitUntil: 'load', timeout: 120000 });
await page.waitForSelector('#deployBtn', { state: 'visible', timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-menu.png` });
await page.evaluate(() => document.querySelector('[data-g="waves"]').click());
await page.evaluate(() => document.querySelector('#deployBtn').click());
await page.waitForFunction(() => !document.getElementById('hud').hidden, null, { timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${prefix}-play.png` });
console.log('screenshots written with prefix', prefix);
await browser.close();
await s.stop();
process.exit(0);
