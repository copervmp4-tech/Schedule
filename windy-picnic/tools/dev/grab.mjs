// usage: node grab.mjs out_prefix t1 t2 ...   -> writes out_prefix_<t>.jpg, prints render ms
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
const [,, prefix, ...times] = process.argv;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => console.log('console:', m.text()));
page.on('pageerror', e => console.log('pageerror:', e.message, e.stack));
const url = 'file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'frames.html');
await page.goto(url);
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
console.log('init ms', await page.evaluate(() => window.initMs));
for (const t of times) {
  const r = await page.evaluate((t) => window.grab(+t), t);
  fs.writeFileSync(`${prefix}_${String(t).padStart(5, '0')}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
  console.log('t', t, 'ms', r.ms.toFixed(1));
}
await browser.close();
