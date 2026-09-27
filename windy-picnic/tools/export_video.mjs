// Render the film frame by frame in headless Chromium and encode an MP4 with the soundtrack.
//
//   node tools/export_video.mjs [--fps 60] [--workers 4] [--out export/the-windy-picnic.mp4]
//
// Every frame is drawn by the same renderer the player uses (WP.film.render), at an exact
// time t = i / fps, so picture and sound line up sample-for-frame. Needs Playwright's
// Chromium and an ffmpeg with libx264 on PATH.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const FPS = +(args.fps || 60);
const WORKERS = +(args.workers || 4);
const OUT = path.resolve(ROOT, args.out || 'export/the-windy-picnic.mp4');
const FRAMES = path.join(ROOT, 'build', 'frames');
const DUR = 60;
const N = Math.round(DUR * FPS);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}

fs.mkdirSync(FRAMES, { recursive: true });
for (const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES, f));
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const page = `file://${path.join(ROOT, 'tools', 'dev', 'frames.html')}`;
const t0 = Date.now();

async function worker(w) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error(`[w${w}] pageerror`, e.message));
  await p.goto(page);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  for (let i = w; i < N; i += WORKERS) {
    const url = await p.evaluate((t) => window.grab(t, 0.95).url, i / FPS);
    fs.writeFileSync(path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    if (w === 0 && i % (FPS * 5) < WORKERS) {
      const done = i / N;
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${(done * 100).toFixed(0)}%  ${el.toFixed(0)} s elapsed, ~${(el / Math.max(done, 0.01) - el).toFixed(0)} s to go`);
    }
  }
  await browser.close();
}

console.log(`rendering ${N} frames at ${FPS} fps with ${WORKERS} workers…`);
await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const master = path.join(ROOT, 'build', 'soundtrack_master.wav');
const audio = fs.existsSync(master) ? master : path.join(ROOT, 'assets', 'audio', 'soundtrack.mp3');
const r = spawnSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'),
  '-i', audio,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 25), '-tune', 'animation', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-level', '4.2', '-g', String(FPS * 2),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', '-shortest',
  '-metadata', 'title=The Windy Picnic',
  '-metadata', 'comment=An original short after Winnie-the-Pooh by A. A. Milne, with decorations by E. H. Shepard (1926)',
  OUT,
], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log('wrote', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1), 'MB');
