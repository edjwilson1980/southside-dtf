import { canvasToPngBlob, loadImageData } from '@/lib/image-utils'
import { trimImageData } from '@/lib/crop-image'

export type RemovalProgress = {
  label: string
  percent: number
}

const MATCH = 34
const FEATHER = 18

function colorDistance(data: Uint8ClampedArray, index: number, color: { r: number; g: number; b: number }) {
  return Math.hypot(data[index] - color.r, data[index + 1] - color.g, data[index + 2] - color.b)
}

function sampleBackdrop(data: Uint8ClampedArray, width: number, height: number) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ] as const

  const samples = points.flatMap(([x, y]) => {
    const index = (y * width + x) * 4
    if (data[index + 3] < 200) return []
    return [{ r: data[index], g: data[index + 1], b: data[index + 2] }]
  })

  if (samples.length === 0) return null

  let best = samples[0]
  let bestCount = 0
  for (const candidate of samples) {
    const count = samples.filter((sample) => (
      Math.hypot(sample.r - candidate.r, sample.g - candidate.g, sample.b - candidate.b) <= MATCH
    )).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }

  if (bestCount < 3) return null
  return best
}

function clearEdgeBackdrop(pixels: ImageData) {
  const { width, height, data } = pixels
  const backdrop = sampleBackdrop(data, width, height)
  if (!backdrop) return pixels

  const count = width * height
  const reached = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0

  const enqueue = (x: number, y: number) => {
    const point = y * width + x
    if (reached[point]) return
    const index = point * 4
    if (data[index + 3] < 8) return
    if (colorDistance(data, index, backdrop) > MATCH) return
    reached[point] = 1
    queue[tail] = point
    tail += 1
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  while (head < tail) {
    const point = queue[head]
    head += 1
    const x = point % width
    const y = (point - x) / width
    if (x > 0) enqueue(x - 1, y)
    if (x + 1 < width) enqueue(x + 1, y)
    if (y > 0) enqueue(x, y - 1)
    if (y + 1 < height) enqueue(x, y + 1)
  }

  for (let point = 0; point < count; point += 1) {
    const index = point * 4
    if (reached[point]) {
      data[index + 3] = 0
      continue
    }

    const x = point % width
    const y = (point - x) / width
    let nearClear = false
    for (let offsetY = -1; offsetY <= 1 && !nearClear; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const sampleX = x + offsetX
        const sampleY = y + offsetY
        if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue
        if (reached[sampleY * width + sampleX]) {
          nearClear = true
          break
        }
      }
    }
    if (!nearClear) continue

    const distance = colorDistance(data, index, backdrop)
    if (distance >= MATCH + FEATHER) continue
    const fade = (distance - MATCH) / FEATHER
    data[index + 3] = Math.round(data[index + 3] * Math.max(0, Math.min(1, fade)))
  }

  return pixels
}

export async function removeImageBackground(
  source: Blob,
  onProgress?: (progress: RemovalProgress) => void,
) {
  onProgress?.({ label: 'Removing background', percent: 20 })
  const url = URL.createObjectURL(source)
  try {
    const loaded = await loadImageData(url)
    onProgress?.({ label: 'Removing background', percent: 60 })
    const cleared = trimImageData(clearEdgeBackdrop(loaded.pixels))
    const canvas = document.createElement('canvas')
    canvas.width = cleared.width
    canvas.height = cleared.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not finish background removal.')
    context.putImageData(cleared, 0, 0)
    onProgress?.({ label: 'Removing background', percent: 100 })
    return canvasToPngBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}
