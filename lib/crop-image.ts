import { canvasToPngBlob, loadImage, loadImageData } from '@/lib/image-utils'

export type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeCrop(crop: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const x = Math.min(imageWidth - 1, Math.max(0, Math.round(Math.min(crop.x, crop.x + crop.width))))
  const y = Math.min(imageHeight - 1, Math.max(0, Math.round(Math.min(crop.y, crop.y + crop.height))))
  const width = Math.min(imageWidth - x, Math.max(1, Math.round(Math.abs(crop.width))))
  const height = Math.min(imageHeight - y, Math.max(1, Math.round(Math.abs(crop.height))))
  return { x, y, width, height }
}

export function defaultCrop(imageWidth: number, imageHeight: number): CropRect {
  const insetX = Math.round(imageWidth * 0.08)
  const insetY = Math.round(imageHeight * 0.08)
  return normalizeCrop({
    x: insetX,
    y: insetY,
    width: imageWidth - insetX * 2,
    height: imageHeight - insetY * 2,
  }, imageWidth, imageHeight)
}

export async function cropImage(sourceUrl: string, crop: CropRect) {
  const image = await loadImage(sourceUrl)
  const area = normalizeCrop(crop, image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not crop the image.')
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  return canvasToPngBlob(canvas)
}

const EMPTY_ALPHA = 12
const EMPTY_COLOR_MATCH = 34
const TRIM_PAD = 1

function hasTransparency(data: Uint8ClampedArray) {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) return true
  }
  return false
}

function sampleEdgeColor(data: Uint8ClampedArray, width: number, height: number) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ] as const
  const samples = points.flatMap(([x, y]) => {
    const index = (y * width + x) * 4
    if (data[index + 3] < 200) return []
    return [{ r: data[index], g: data[index + 1], b: data[index + 2] }]
  })
  if (samples.length < 3) return null
  const first = samples[0]
  const agreeing = samples.filter((sample) => (
    Math.hypot(sample.r - first.r, sample.g - first.g, sample.b - first.b) <= EMPTY_COLOR_MATCH
  )).length
  return agreeing >= 3 ? first : null
}

function pixelHasColor(
  data: Uint8ClampedArray,
  index: number,
  emptyColor: { r: number; g: number; b: number } | null,
) {
  if (data[index + 3] < EMPTY_ALPHA) return false
  if (!emptyColor) return true
  return Math.hypot(data[index] - emptyColor.r, data[index + 1] - emptyColor.g, data[index + 2] - emptyColor.b) > EMPTY_COLOR_MATCH
}

export function contentBounds(pixels: ImageData): CropRect | null {
  const { width, height, data } = pixels
  const emptyColor = hasTransparency(data) ? null : sampleEdgeColor(data, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pixelHasColor(data, (y * width + x) * 4, emptyColor)) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null
  return normalizeCrop({
    x: minX - TRIM_PAD,
    y: minY - TRIM_PAD,
    width: maxX - minX + 1 + TRIM_PAD * 2,
    height: maxY - minY + 1 + TRIM_PAD * 2,
  }, width, height)
}

export function cropImageData(pixels: ImageData, crop: CropRect) {
  const area = normalizeCrop(crop, pixels.width, pixels.height)
  if (area.x === 0 && area.y === 0 && area.width === pixels.width && area.height === pixels.height) {
    return pixels
  }
  const source = document.createElement('canvas')
  source.width = pixels.width
  source.height = pixels.height
  const sourceContext = source.getContext('2d')
  if (!sourceContext) throw new Error('Could not crop the image.')
  sourceContext.putImageData(pixels, 0, 0)
  return sourceContext.getImageData(area.x, area.y, area.width, area.height)
}

export function trimImageData(pixels: ImageData) {
  const bounds = contentBounds(pixels)
  if (!bounds) return pixels
  return cropImageData(pixels, bounds)
}

export async function trimEmptySpace(sourceUrl: string) {
  const loaded = await loadImageData(sourceUrl)
  const bounds = contentBounds(loaded.pixels)
  if (!bounds || (bounds.x === 0 && bounds.y === 0 && bounds.width === loaded.width && bounds.height === loaded.height)) {
    return { trimmed: false as const, width: loaded.width, height: loaded.height }
  }
  const blob = await cropImage(sourceUrl, bounds)
  return { trimmed: true as const, blob, width: bounds.width, height: bounds.height }
}
