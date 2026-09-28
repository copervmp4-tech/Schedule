// node strip.mjs out.jpg t0 t1 step [cropX cropY cropW cropH] [cols]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
const VERT = !!process.env.VERT; // VERT=1 node strip.mjs ... renders the 9:16 film
const [,, out, t0, t1, step, cx = 0, cy = 0, cw = VERT ? 1080 : 1920, ch = VERT ? 1920 : 1080, cols = 6] = process.argv;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'frames.html') + (VERT ? '?vertical' : ''));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const times = [];
for (let t = +t0; t <= +t1 + 1e-6; t += +step) times.push(+t.toFixed(3));
const data = await page.evaluate(({ times, cx, cy, cw, ch, cols }) => {
  const c = document.getElementById('c');
  const tw = Math.round((cw >= ch ? 1920 : 1800) / cols), th = Math.round(tw * ch / cw);
  const sheet = document.createElement('canvas');
  const rows = Math.ceil(times.length / cols);
  sheet.width = tw * cols; sheet.height = (th + 18) * rows;
  const g = sheet.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, sheet.width, sheet.height);
  times.forEach((t, i) => {
    window.renderAt(t);
    const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + 18);
    g.drawImage(c, cx, cy, cw, ch, x, y + 18, tw, th);
    g.fillStyle = '#ff0'; g.font = '14px sans-serif'; g.fillText(t.toFixed(2), x + 4, y + 14);
  });
  return sheet.toDataURL('image/jpeg', 0.85);
}, { times, cx: +cx, cy: +cy, cw: +cw, ch: +ch, cols: +cols });
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
