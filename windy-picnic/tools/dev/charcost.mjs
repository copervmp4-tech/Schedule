import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file://' + path.resolve('frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const r = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1; c.height = 1; const g = c.getContext('2d');
  const time = (fn, n) => { const ts = []; for (let i = 0; i < n; i++) { const s = performance.now(); fn(i); ts.push(performance.now() - s); } ts.sort((a, b) => a - b); return { avg: (ts.reduce((a, b) => a + b) / n).toFixed(2), p95: ts[Math.floor(n * 0.95)].toFixed(2), max: ts[n - 1].toFixed(2) }; };
  return {
    pooh: time((i) => WP.chars.drawPooh(g, WP.film.pooh(27 + i / 60).pose), 300),
    piglet: time((i) => WP.chars.drawPiglet(g, WP.film.piglet(27 + i / 60).pose), 300),
    pot: time(() => WP.props.drawPot(g, {}), 300),
    cloth: time((i) => WP.cloth.draw(g, WP.cloth.state(24 + i / 60)), 300),
  };
});
console.table(r);
await browser.close();
