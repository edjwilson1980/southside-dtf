import { canvasToPngBlob, loadImage } from '@/lib/image-utils'

const MAX_EDGE = 8000

function boxBlur(source: ImageData, width: number, height: number) {
  const output = new ImageData(width, height)
  const radius = 1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let count = 0

      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = Math.min(width - 1, Math.max(0, x + offsetX))
          const sampleY = Math.min(height - 1, Math.max(0, y + offsetY))
          const index = (sampleY * width + sampleX) * 4
          red += source.data[index]
          green += source.data[index + 1]
          blue += source.data[index + 2]
          alpha += source.data[index + 3]
          count += 1
        }
      }

      const index = (y * width + x) * 4
      output.data[index] = red / count
      output.data[index + 1] = green / count
      output.data[index + 2] = blue / count
      output.data[index + 3] = alpha / count
    }
  }

  return output
}

function sharpen(context: CanvasRenderingContext2D, width: number, height: number) {
  const original = context.getImageData(0, 0, width, height)
  const blurred = boxBlur(original, width, height)
  const amount = 0.65

  for (let index = 0; index < original.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = original.data[index + channel] + amount * (original.data[index + channel] - blurred.data[index + channel])
      original.data[index + channel] = Math.max(0, Math.min(255, value))
    }
  }

  context.putImageData(original, 0, 0)
}

export async function upscaleImage(sourceUrl: string, scale = 2) {
  const image = await loadImage(sourceUrl)
  const width = Math.round(image.naturalWidth * scale)
  const height = Math.round(image.naturalHeight * scale)

  if (width > MAX_EDGE || height > MAX_EDGE) {
    throw new Error(`This file is already large. Upscale is capped at ${MAX_EDGE}px.`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not upscale the image.')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  sharpen(context, width, height)
  return canvasToPngBlob(canvas)
}
