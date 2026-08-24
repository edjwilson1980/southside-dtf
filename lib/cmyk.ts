import sharp from 'sharp';

import { sheetFileName, sheetStamp } from '@/lib/sheet-name';

export { sheetStamp as stampForExport } from '@/lib/sheet-name';

function extractAlpha(rgba: Buffer, hasAlpha: boolean) {
  const alpha = Buffer.alloc(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    if (hasAlpha) {
      alpha[p] = rgba[i + 3];
      continue;
    }
    const nearWhite = rgba[i] > 250 && rgba[i + 1] > 250 && rgba[i + 2] > 250;
    alpha[p] = nearWhite ? 0 : 255;
  }
  return alpha;
}

/**
 * Export a transparent PNG whose colors have been converted through CMYK.
 * PNG cannot store CMYK natively, so color goes RGB → CMYK → sRGB and the
 * alpha is written back onto every pixel.
 */
export async function toCmykPng(
  input: Buffer,
  filename: string,
  customerName = 'Customer',
  stamp = sheetStamp(),
  copy = 1,
  sheetLengthIn = 12,
) {
  const meta = await sharp(input).metadata();
  const { data: rgba, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const alpha = extractAlpha(rgba, meta.hasAlpha === true || rgba.some((_, i) => i % 4 === 3 && rgba[i] < 255));

  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, r = 0; i < rgba.length; i += 4, r += 3) {
    rgb[r] = rgba[i];
    rgb[r + 1] = rgba[i + 1];
    rgb[r + 2] = rgba[i + 2];
  }

  const cmykTiff = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .toColorspace('cmyk')
    .tiff({ compression: 'lzw' })
    .toBuffer();

  const { data: rgbFromCmyk, info: rgbInfo } = await sharp(cmykTiff)
    .toColorspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (rgbInfo.width !== width || rgbInfo.height !== height) {
    throw new Error('CMYK conversion changed the image size.');
  }

  const outRgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0, a = 0; i < rgbFromCmyk.length; i += 3, p += 4, a += 1) {
    outRgba[p] = rgbFromCmyk[i];
    outRgba[p + 1] = rgbFromCmyk[i + 1];
    outRgba[p + 2] = rgbFromCmyk[i + 2];
    outRgba[p + 3] = alpha[a];
  }

  const buffer = await sharp(outRgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const out = await sharp(buffer).metadata();
  if (out.format !== 'png' || !out.hasAlpha) {
    throw new Error('CMYK PNG export lost the transparent background.');
  }

  return {
    name: sheetFileName(customerName, sheetLengthIn, stamp, copy),
    mimeType: 'image/png',
    buffer,
  };
}
