import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + path.resolve('frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const r = await page.evaluate(() => {
  const g = document.getElementById('c').getContext('2d'); const out = {};
  for (const lite of [false, true]) { WP.film.PROF.flush = true; let s = 0; for (const t of [16, 29, 47]) { const a = performance.now(); WP.film.render(g, t, { lite, cues: CUES.subtitles }); g.getImageData(0,0,1,1); s += performance.now() - a; } out[lite ? 'lite' : 'full'] = (s / 3).toFixed(0) + ' ms'; }
  return out;
});
console.log('software-raster frame time', r, 'errors', errs);
await browser.close();
