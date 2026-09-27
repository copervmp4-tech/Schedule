import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('file://' + path.resolve('frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const r = await page.evaluate(() => {
  const out = []; WP.film.PROF.flush = true;
  for (const t of [8, 16, 23.4, 29, 34.7, 42, 47, 55]) {
    window.renderAt(t);
    const ms = window.renderAt(t + 0.01);
    out.push({ t, ms: ms.toFixed(1), ...Object.fromEntries(Object.entries(WP.film.PROF).filter(([k,v])=>typeof v==="number").map(([k, v]) => [k, v.toFixed(1)])) });
  }
  return out;
});
console.table(r);
await browser.close();
