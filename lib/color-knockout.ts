import { canvasToPngBlob, loadImage } from '@/lib/image-utils'

export type RgbColor = { r: number; g: number; b: number }

export function colorFromHex(hex: string): RgbColor {
  const value = hex.replace('#', '')
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

export function hexFromRgb({ r, g, b }: RgbColor) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export type KnockoutSession = {
  pixels: ImageData
  distances: Float32Array
  originalAlpha: Uint8ClampedArray
}

export function knockoutThreshold(tolerance: number) {
  return Math.max(0, Math.min(100, tolerance)) * 2.55
}

export function createKnockoutSession(pixels: ImageData, color: RgbColor): KnockoutSession {
  const distances = new Float32Array(pixels.data.length / 4)
  const originalAlpha = new Uint8ClampedArray(distances.length)

  for (let index = 0, point = 0; index < pixels.data.length; index += 4, point += 1) {
    distances[point] = Math.hypot(
      pixels.data[index] - color.r,
      pixels.data[index + 1] - color.g,
      pixels.data[index + 2] - color.b,
    )
    originalAlpha[point] = pixels.data[index + 3]
  }

  return { pixels, distances, originalAlpha }
}

export function applyKnockoutTolerance(session: KnockoutSession, tolerance: number) {
  const maxDistance = knockoutThreshold(tolerance)
  const { pixels, distances, originalAlpha } = session

  for (let point = 0, index = 3; point < distances.length; point += 1, index += 4) {
    pixels.data[index] = distances[point] <= maxDistance ? 0 : originalAlpha[point]
  }

  return pixels
}

export function recolorKnockoutSession(base: ImageData, color: RgbColor) {
  const preview = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
  return createKnockoutSession(preview, color)
}

export async function loadLiveKnockout(sourceUrl: string, color: RgbColor) {
  const image = await loadImage(sourceUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not read the image for color knockout.')

  context.drawImage(image, 0, 0)
  const base = context.getImageData(0, 0, canvas.width, canvas.height)
  return {
    base,
    session: recolorKnockoutSession(base, color),
    width: canvas.width,
    height: canvas.height,
  }
}

export async function loadKnockoutSession(sourceUrl: string, color: RgbColor) {
  const image = await loadImage(sourceUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not read the image for color knockout.')

  context.drawImage(image, 0, 0)
  return createKnockoutSession(context.getImageData(0, 0, canvas.width, canvas.height), color)
}

export async function knockoutColor(sourceUrl: string, color: RgbColor, tolerance: number) {
  const session = await loadKnockoutSession(sourceUrl, color)
  applyKnockoutTolerance(session, tolerance)
  const canvas = document.createElement('canvas')
  canvas.width = session.pixels.width
  canvas.height = session.pixels.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not export the knockout preview.')
  context.putImageData(session.pixels, 0, 0)
  return canvasToPngBlob(canvas)
}
