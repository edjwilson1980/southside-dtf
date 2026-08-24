import sharp from 'sharp';
import { toCmykPng } from '../lib/cmyk.ts';

const width = 40;
const height = 40;
const rgba = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const inside = x >= 10 && x < 30 && y >= 10 && y < 30;
    rgba[i] = inside ? 207 : 0;
    rgba[i + 1] = inside ? 32 : 0;
    rgba[i + 2] = inside ? 45 : 0;
    rgba[i + 3] = inside ? 255 : 0;
  }
}

const src = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
const out = await toCmykPng(src, 'mark.png');
const meta = await sharp(out.buffer).metadata();
const { data } = await sharp(out.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let transparent = 0;
let opaque = 0;
for (let i = 3; i < data.length; i += 4) {
  if (data[i] < 10) transparent += 1;
  if (data[i] > 245) opaque += 1;
}

console.log(
  JSON.stringify({
    name: out.name,
    format: meta.format,
    hasAlpha: meta.hasAlpha,
    space: meta.space,
    transparent,
    opaque,
  }),
);

if (out.name !== 'mark-CMYK.png' || meta.format !== 'png' || !meta.hasAlpha || transparent < 200 || opaque < 50) {
  process.exit(2);
}
