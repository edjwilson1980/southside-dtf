import sharp from 'sharp'
import { contentBounds } from '@/lib/crop-image'

/**
 * Server version of trimEmptySpace (lib/crop-image.ts): crop empty margins with
 * the same rules (contentBounds), so the chosen print size applies to the art.
 */
export async function trimArt(input: Buffer): Promise<{ png: Buffer; width: number; height: number; trimmed: boolean }> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) }
  const bounds = contentBounds(pixels as unknown as ImageData)
  if (!bounds || (bounds.x === 0 && bounds.y === 0 && bounds.width === info.width && bounds.height === info.height)) {
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
    return { png, width: info.width, height: info.height, trimmed: false }
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height })
    .png()
    .toBuffer()
  return { png, width: bounds.width, height: bounds.height, trimmed: true }
}
