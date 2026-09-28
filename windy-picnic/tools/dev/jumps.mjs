// Scans the film's state at 60 fps and lists sudden jumps (pops) in any animated value.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const out = await page.evaluate(() => {
  const F = WP.film, fps = 60, N = 60 * fps;
  const snap = (t) => {
    const o = {};
    const add = (pre, obj) => { for (const [k, v] of Object.entries(obj)) if (typeof v === 'number') o[pre + k] = v; };
    const p = F.pooh(t), g = F.piglet(t), q = F.pot(t, p), c = F.camera(t);
    add('pooh.', { x: p.x, z: p.z, facing: p.facing }); add('pooh.', p.pose);
    o['pooh.hold'] = p.hold === 'pot' ? 1 : p.hold === 'bundle' ? 2 : 0;
    add('piglet.', { x: g.x, z: g.z, facing: g.facing, rise: g.rise || 0 }); add('piglet.', g.pose);
    o['pot.held'] = q.held ? 1 : 0;
    { const [x, y] = F.potWorld(t); if (t < 45 || t > 45.02) { o['potW.x'] = x; o['potW.y'] = y; } }
    add('cam.', { x: c.x, y: c.y, z: c.z * 100 });
    const G = WP.cloth.state(t); if (G) { const m = G[Math.floor(G.length / 2)]; add('cloth.', { x: m[0], y: m[1], z: m[2] }); }
    return o;
  };
  const skip = ['t', 'blink', 'eye', 'earWind', 'mouth', 'lookX', 'lookY', 'brow', 'blush'];
  const lim = (k) => {
    if (/\.(x|z|y|rise)$/.test(k)) return 14;          // px per frame
    if (/bob|legNLift|legFLift|headX|headY/.test(k)) return 5;
    if (/facing|hold|held/.test(k)) return 0.5;
    return 0.09;                                        // radians / unitless per frame
  };
  const res = [];
  const zeroDefault = /\.(legN|legF|legNLift|legFLift|bob|sit|lean|head|headX|headY|rise|squash)$/;
  const S = [];
  for (let i = 0; i <= N; i++) S.push(snap(i / fps));
  const keys = new Set(); S.forEach((o) => Object.keys(o).forEach((k) => keys.add(k)));
  for (const k of keys) {
    if (skip.some((s) => k.endsWith('.' + s))) continue;
    const val = (i) => { const v = S[i][k]; if (v !== undefined) return v; if (/squash$/.test(k)) return 1; if (zeroDefault.test(k)) return 0; return undefined; };
    for (let i = 2; i < N - 1; i++) {
      const a0 = val(i - 2), a1 = val(i - 1), a2 = val(i), a3 = val(i + 1);
      if ([a0, a1, a2, a3].some((v) => v === undefined)) {
        if ((a1 === undefined) !== (a2 === undefined)) res.push({ t: +(i / fps).toFixed(3), k, from: a1 ?? 'none', to: a2 ?? 'none', kind: 'appears/vanishes' });
        continue;
      }
      const dPrev = Math.abs(a1 - a0), d = Math.abs(a2 - a1), dNext = Math.abs(a3 - a2);
      if (d > lim(k) * 0.5 && d > 3 * Math.max(dPrev, dNext, 1e-6)) res.push({ t: +(i / fps).toFixed(3), k, from: +a1.toFixed(3), to: +a2.toFixed(3), kind: 'pop' });
    }
  }
  return res;
});
// collapse consecutive frames of the same key
const groups = [];
for (const r of out) {
  const g = groups.find((g) => g.k === r.k && Math.abs(g.t1 - r.t) < 0.05);
  if (g) { g.t1 = r.t; g.n++; g.to = r.to; } else groups.push({ k: r.k, t0: r.t, t1: r.t, n: 1, from: r.from, to: r.to, kind: r.kind });
}
groups.sort((a, b) => a.t0 - b.t0);
for (const g of groups) console.log(`${g.t0.toFixed(3)}${g.n > 1 ? '-' + g.t1.toFixed(3) : '      '}  ${g.k.padEnd(20)} ${String(g.from).padStart(9)} -> ${String(g.to).padEnd(9)} (${g.n} fr) ${g.kind}`);
await browser.close();
