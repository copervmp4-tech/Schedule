import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.PLAYER && window.PLAYER.state.ready, null, { timeout: 120000 });
await page.click('#begin');
await page.waitForTimeout(1000);
const r = await page.evaluate(() => new Promise((res) => {
  const ts = []; const s = performance.now();
  (function f() { ts.push([performance.now(), PLAYER.Sound.time()]); if (performance.now() - s < 3000) requestAnimationFrame(f); else res(ts); })();
}));
const dT = [], dW = [];
for (let i = 1; i < r.length; i++) { dT.push((r[i][1] - r[i - 1][1]) * 1000); dW.push(r[i][0] - r[i - 1][0]); }
const err = dT.map((v, i) => v - dW[i]);
const sd = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length - (a.reduce((s, v) => s + v, 0) / a.length) ** 2);
console.log('frames', dT.length, 'film-time step ms: mean', (dT.reduce((a, b) => a + b) / dT.length).toFixed(2), 'sd', sd(dT).toFixed(2), '| step minus wall step sd', sd(err).toFixed(2), '| backwards steps', dT.filter((v) => v < 0).length, '| zero steps', dT.filter((v) => v === 0).length);
await browser.close();
