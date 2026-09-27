import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8765/index.html');
const data = await page.evaluate(async () => {
  const r = await fetch('assets/audio/soundtrack.mp3');
  const ab = await r.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 48000 * 60, 48000);
  const buf = await ctx.decodeAudioData(ab);
  const ch = buf.getChannelData(0).slice(0, 48000 * 10);
  return { sr: buf.sampleRate, len: buf.length, samples: Array.from(ch) };
});
fs.writeFileSync('/tmp/claude-0/-home-user-Schedule/ca36b032-0093-5167-8b68-08c5041b7e26/scratchpad/decoded.json', JSON.stringify(data));
console.log('decoded sr', data.sr, 'len', data.len, (data.len / data.sr).toFixed(4), 's');
await browser.close();
