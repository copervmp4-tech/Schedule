// Plays the page on an emulated phone (upright, then sideways, then full screen) and saves
// screenshots: node tools/dev/mobile_test.mjs <shot-prefix>
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const shots = process.argv[2] || '/tmp/mobile';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=user-gesture-required'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.PLAYER && window.PLAYER.state.ready, null, { timeout: 180000 });
const T0 = Date.now();
const S = () => page.evaluate((w) => { const s = PLAYER.state; return { wall: w, t: +PLAYER.Sound.time().toFixed(2), playing: s.playing, narrow: s.narrow, immersive: s.immersive, pseudoFull: s.pseudoFull, idle: document.getElementById('room').classList.contains('idle'), lowMem: WP.lowMem, lite: PLAYER.perf.lite, caption: document.getElementById('captions').textContent }; }, ((Date.now() - T0) / 1000).toFixed(1));
console.log('ready after', Date.now() - t0, 'ms', JSON.stringify(await S()));
await page.screenshot({ path: shots + '_1_cover.png' });
await page.tap('#begin');
await page.waitForTimeout(1500);
await page.evaluate(() => { PLAYER.pause(); PLAYER.seek(15.7); });
await page.waitForTimeout(300);
console.log('upright', JSON.stringify(await S()));
await page.screenshot({ path: shots + '_2_upright.png' });
// tap on the picture plays / pauses when held upright
await page.tap('#stage', { position: { x: 150, y: 100 } });
await page.waitForTimeout(400);
console.log('after tap', JSON.stringify(await S()));
// turn sideways
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(600);
console.log('sideways', JSON.stringify(await S()));
await page.screenshot({ path: shots + '_3_sideways.png' });
await page.waitForTimeout(3500);
console.log('sideways idle', JSON.stringify(await S()));
await page.screenshot({ path: shots + '_4_sideways_idle.png' });
await page.tap('#stage', { position: { x: 400, y: 150 } });
await page.waitForTimeout(300);
console.log('tap shows controls', JSON.stringify(await S()));
// back upright, full screen
await page.setViewportSize({ width: 390, height: 664 });
await page.waitForTimeout(400);
await page.tap('#full');
await page.waitForTimeout(800);
console.log('full screen', JSON.stringify(await S()));
await page.screenshot({ path: shots + '_5_full.png' });
await page.tap('#full');
await page.waitForTimeout(500);
console.log('left full screen', JSON.stringify(await S()));
console.log('errors:', JSON.stringify(errors));
await browser.close();
