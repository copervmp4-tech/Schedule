import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const flags = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', ...flags] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve('frames.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const t0 = Date.now();
let bytes = 0;
for (let i = 0; i < 20; i++) {
  const r = await page.evaluate((t) => window.grab(t, 0.92), 20 + i / 30);
  bytes += r.url.length;
}
console.log(flags.join(' ').slice(0, 40), 'per frame ms', (Date.now() - t0) / 20, 'avg KB', (bytes / 20 / 1024).toFixed(0));
await browser.close();
