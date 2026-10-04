// Usage:
//   node render.mjs reels/<name>.json            -> reels/out/<name>.mp4
//   node render.mjs reels/<name>.json --still 4.5 -> reels/out/<name>-4.5.png (cheap preview of one moment)
// Output goes to an out/ folder next to the JSON file.
import { readFileSync, mkdirSync, rmSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

const skillDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const [cfgArg, flag, val] = process.argv.slice(2);
if (!cfgArg) { console.error('usage: node render.mjs reels/<name>.json [--still <seconds>]'); process.exit(1); }
const cfgPath = path.resolve(cfgArg);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const name = path.basename(cfgArg, '.json');
const fps = cfg.fps || 30;

// Use the project's playwright if installed, otherwise the global one.
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(path.join(g, 'x'))('playwright')); }

const out = path.join(path.dirname(cfgPath), 'out'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.addInitScript(c => { window.REEL = c; }, cfg);
await page.goto('file://' + path.join(skillDir, 'template.html'));

if (flag === '--still') {
  await page.evaluate(t => seek(t), Number(val));
  const file = path.join(out, `${name}-${val}.png`);
  await page.screenshot({ path: file });
  console.log(file);
} else {
  const frames = path.join(out, `${name}-frames`);
  rmSync(frames, { recursive: true, force: true }); mkdirSync(frames);
  for (let f = 0; f < fps * cfg.duration; f++) {
    await page.evaluate(t => seek(t), f / fps);
    await page.screenshot({ path: path.join(frames, String(f).padStart(4, '0') + '.png') });
  }
  const file = path.join(out, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', file]);
  rmSync(frames, { recursive: true, force: true });
  console.log(file);
}
await browser.close();
