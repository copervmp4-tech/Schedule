// Finds moments where Pooh and Piglet overlap on screen (pixels covered by both), which
// usually means one bumps into the other. node overlap.mjs [t0 t1 step]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const [,, t0 = 12.3, t1 = 57, step = 1 / 30] = process.argv;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const out = await page.evaluate(({ t0, t1, step }) => {
  const F = WP.film, C = WP.chars, W = 480, H = 270, k = W / 1920;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d', { willReadFrequently: true }); };
  const A = mk(), B = mk();
  const place = (g, s, t) => {
    const cam = F.camera(t);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.setTransform(k * cam.z, 0, 0, k * cam.z, k * (960 - cam.x * cam.z), k * (540 - cam.y * cam.z));
    g.translate(s.x + s.z * 0.18, -s.z * 0.36 + (s.rise || 0));
    const sc = 1 - s.z * 0.0006, f = s.facing;
    g.scale(sc * (Math.abs(f) < 0.04 ? Math.sign(f || 1) * 0.04 : f), sc);
  };
  const res = [];
  for (let t = +t0; t <= +t1; t += +step) {
    if (t >= F.T.cut2 && t < F.T.cut2 + 0.7) continue;
    const p = F.pooh(t), q = F.piglet(t);
    if (t < F.T.pigletPop) continue;
    place(A, p, t); C.drawPooh(A, p.pose);
    place(B, q, t); C.drawPiglet(B, q.pose);
    const a = A.getImageData(0, 0, W, H).data, b = B.getImageData(0, 0, W, H).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] > 128 && b[i] > 128) { n++; const j = (i - 3) / 4; sx += j % W; sy += (j / W) | 0; }
    if (n) res.push([+t.toFixed(3), n, Math.round(sx / n * 4), Math.round(sy / n * 4)]);
  }
  return res;
}, { t0, t1, step });
let run = null;
const flush = () => { if (run) console.log(`${run.a.toFixed(2)}-${run.b.toFixed(2)}  max ${run.max} px (at ${run.tm.toFixed(2)}, screen ~${run.x},${run.y})`); };
for (const [t, n, x, y] of out) {
  if (run && t - run.b < 0.1) { run.b = t; if (n > run.max) Object.assign(run, { max: n, tm: t, x, y }); }
  else { flush(); run = { a: t, b: t, max: n, tm: t, x, y }; }
}
flush();
await browser.close();
