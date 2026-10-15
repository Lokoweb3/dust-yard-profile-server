// Visual regression + performance budget.
// Boots a throwaway server, deploys into a solo wave match at pinned High quality with seeded
// randomness, screenshots the yard and compares it with the committed golden. Raiders and smoke
// still move between runs, so the comparison is a coarse net: it catches a black screen, missing
// textures or a broken pass, not one-pixel shifts. Also asserts a frame-rate floor (software GL)
// and the built page's size.
//
//   npm run test:visual     compare against tests/goldens/
//   npm run goldens         rewrite the goldens after an intended visual change
import { chromium } from 'playwright';
import { startServer, assert } from './helpers.mjs';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const UPDATE = process.argv.includes('--update');
const GOLDENS = 'tests/goldens', RESULTS = 'test-results';
const DIFF_BUDGET = 0.06;          // fraction of pixels allowed to differ
const FPS_FLOOR = 3;               // swiftshader software rendering is slow; this catches a collapse, not jitter
const PAGE_BUDGET = 1_700_000;     // bytes for public/index.html
mkdirSync(GOLDENS, { recursive:true }); mkdirSync(RESULTS, { recursive:true });

const pageBytes = statSync('public/index.html').size;
assert(pageBytes <= PAGE_BUDGET, `public/index.html is ${pageBytes} bytes, over the ${PAGE_BUDGET} budget`);

const s = await startServer(8793);
const browser = await chromium.launch({
  args:['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
});
let failed = false;
try {
  const ctx = await browser.newContext({ viewport:{ width:1280, height:720 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('dy-tut', '1');
    localStorage.setItem('dy-age', 'adult');
    localStorage.setItem('dustyard-settings', JSON.stringify({ quality:'high', auto:false }));
    // seeded randomness so textures and map scatter come out the same every run
    let st = 0x9e3779b9;
    Math.random = () => { st |= 0; st = st + 0x6d2b79f5 | 0; let t = Math.imul(st ^ st >>> 15, 1 | st); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(s.base + '/', { waitUntil:'load', timeout:120000 });
  await page.waitForSelector('#deployBtn', { state:'visible', timeout:120000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('[data-g="waves"]').click());
  await page.evaluate(() => document.querySelector('#deployBtn').click());
  await page.waitForFunction(() => !document.getElementById('hud').hidden, null, { timeout:60000 });
  await page.waitForTimeout(4000);

  // frame rate over two seconds, measured with the page's own clock
  const fps = await page.evaluate(() => new Promise(res => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : res(frames/((performance.now() - t0)/1000)); };
    requestAnimationFrame(tick);
  }));
  console.log(`page ${(pageBytes/1024).toFixed(0)} KB, ${fps.toFixed(1)} fps under software GL`);
  assert(fps >= FPS_FLOOR, `frame rate ${fps.toFixed(1)} fps is below the floor of ${FPS_FLOOR}`);
  assert(errors.length === 0, 'Page errors:\n' + errors.join('\n'));

  const shot = PNG.sync.read(await page.screenshot());
  const goldenPath = `${GOLDENS}/play.png`;
  if (UPDATE || !existsSync(goldenPath)){
    writeFileSync(goldenPath, PNG.sync.write(shot));
    console.log(`${UPDATE ? 'updated' : 'created'} ${goldenPath}`);
  } else {
    const golden = PNG.sync.read(readFileSync(goldenPath));
    assert(golden.width === shot.width && golden.height === shot.height, 'screenshot size changed; run npm run goldens');
    const diff = new PNG({ width:shot.width, height:shot.height });
    const bad = pixelmatch(golden.data, shot.data, diff.data, shot.width, shot.height, { threshold:0.18 });
    const frac = bad/(shot.width*shot.height);
    writeFileSync(`${RESULTS}/visual-play.png`, PNG.sync.write(shot));
    writeFileSync(`${RESULTS}/visual-diff.png`, PNG.sync.write(diff));
    console.log(`visual diff: ${(frac*100).toFixed(2)}% of pixels (budget ${(DIFF_BUDGET*100).toFixed(0)}%)`);
    assert(frac <= DIFF_BUDGET, `the yard looks different from the golden (${(frac*100).toFixed(2)}% of pixels); ` +
      'if the change is intended, run npm run goldens and commit tests/goldens/');
  }
  await ctx.close();
  console.log('Visual check: OK');
} catch(e){ failed = true; console.error(e.message); }
await browser.close();
await s.stop();
process.exit(failed ? 1 : 0);
