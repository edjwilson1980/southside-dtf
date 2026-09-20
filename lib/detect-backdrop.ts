export type RgbColor = { r: number; g: number; b: number }

type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number }

function colorDistance(r: number, g: number, b: number, color: RgbColor) {
  const dr = r - color.r
  const dg = g - color.g
  const db = b - color.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function samplePoint(source: PixelBuffer, x: number, y: number): RgbColor | null {
  const index = (y * source.width + x) * 4
  if (source.data[index + 3] < 200) return null
  return { r: source.data[index], g: source.data[index + 1], b: source.data[index + 2] }
}

/**
 * Corner/edge sample used by the half-tone knockout path. Returns a colour when
 * at least three of the eight sample points agree within a small distance.
 */
export function detectBackdropColor(source: PixelBuffer): RgbColor | null {
  const { width, height } = source
  const points: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ]
  const samples: RgbColor[] = []
  for (const [x, y] of points) {
    const sample = samplePoint(source, x, y)
    if (sample) samples.push(sample)
  }
  if (samples.length === 0) return null

  let best = samples[0]
  let bestCount = 0
  for (const candidate of samples) {
    let count = 0
    for (const sample of samples) {
      if (colorDistance(sample.r, sample.g, sample.b, candidate) <= 34) count += 1
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return bestCount >= 3 ? best : null
}

function describeBackdrop(color: RgbColor) {
  const { r, g, b } = color
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max > 230 && min > 210) return 'white'
  if (max < 40) return 'black'
  if (max - min < 18) return 'solid grey'
  return 'solid'
}

/**
 * Intake helper: if ≥ 85% of the border ring is one opaque colour and the image
 * has no meaningful alpha, suggest knocking that backdrop out on our side.
 */
export function suggestBackgroundKnockout(source: PixelBuffer): {
  color: RgbColor
  label: string
} | null {
  const { data, width, height } = source
  if (width < 4 || height < 4) return null

  let transparentish = 0
  const sampleStep = Math.max(1, Math.floor((width * height) / 4000))
  for (let i = 3; i < data.length; i += 4 * sampleStep) {
    if (data[i] < 250) transparentish += 1
  }
  const sampled = Math.ceil(data.length / (4 * sampleStep))
  if (transparentish / Math.max(1, sampled) > 0.04) return null

  const ring: RgbColor[] = []
  const push = (x: number, y: number) => {
    const sample = samplePoint(source, x, y)
    if (sample) ring.push(sample)
  }
  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y)
    push(width - 1, y)
  }
  if (ring.length < 20) return null

  const seed = detectBackdropColor(source)
  if (!seed) return null

  let matches = 0
  for (const sample of ring) {
    if (colorDistance(sample.r, sample.g, sample.b, seed) <= 34) matches += 1
  }
  if (matches / ring.length < 0.85) return null
  return { color: seed, label: describeBackdrop(seed) }
}
