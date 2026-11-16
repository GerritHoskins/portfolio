// Regenerates the raster icons from favicon.svg: node scripts/icons.mjs
// favicon.ico holds 16/32/48 px PNG frames; apple-touch-icon.png is 180 px.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'favicon.svg'), 'utf8');

const browser = await chromium.launch();
async function render(size, { inset = 0, background = 'transparent' } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = size - inset * 2;
  await page.setContent(`<body style="margin:0;background:${background}">
    <img style="display:block;margin:${inset}px;width:${inner}px;height:${inner}px"
      src="data:image/svg+xml,${encodeURIComponent(svg)}"></body>`);
  const png = await page.screenshot({ omitBackground: background === 'transparent' });
  await page.close();
  return png;
}

const frames = [];
for (const size of [16, 32, 48]) frames.push({ size, png: await render(size) });
// iOS applies its own mask and dislikes transparency, so fill the corners.
fs.writeFileSync(path.join(root, 'apple-touch-icon.png'), await render(180, { background: '#213448' }));
await browser.close();

const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = 6 + frames.length * 16;
const entries = frames.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});
fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.concat([header, ...entries, ...frames.map(f => f.png)]));
console.log('Wrote favicon.ico and apple-touch-icon.png from favicon.svg.');
