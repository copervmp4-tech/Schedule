// Finds scenery sprites whose drawing touches the edge of their canvas (i.e. got clipped).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('file://' + path.resolve('frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const res = await page.evaluate(async () => {
  const S = await WP.world.build();
  const out = [];
  const check = (name, sp) => {
    const c = sp.img, g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const edge = (x0, y0, x1, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * c.width + x) * 4 + 3] > 30) n++; return n; };
    const r = { name, w: c.width, h: c.height, top: edge(0, 0, c.width, 2), left: edge(0, 0, 2, c.height), right: edge(c.width - 2, 0, c.width, c.height), bottom: edge(0, c.height - 2, c.width, c.height) };
    if (r.top || r.left || r.right || r.bottom) out.push(r);
  };
  for (const [k, v] of Object.entries(S)) {
    if (Array.isArray(v)) v.forEach((sp, i) => sp && sp.img && check(k + '[' + i + ']', sp));
    else if (v && v.img) check(k, v);
  }
  return out;
});
console.table(res);
await browser.close();
