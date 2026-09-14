/**
 * AM (amplitude-modulated) half-tone screening for DTF film output.
 *
 * The screen is a rotated grid of cells. For every output pixel we work out
 * where it falls inside its cell, run that position through a spot function,
 * and compare the result against the ink level wanted at that point. Dots grow
 * from the cell centre as ink level rises — the same approach a RIP uses, and
 * what gives a soft-hand print its screen-printed look.
 *
 * Tone response is linearised per shape with a quantile table (see
 * buildSpotQuantiles), so 40% ink really does cover 40% of the film no matter
 * which dot shape is selected.
 */

export type HalftoneMode = 'halftone' | 'knockout'
export type DotShape = 'round' | 'ellipse' | 'square' | 'diamond' | 'line'

export type PixelBuffer = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type HalftoneSettings = {
  mode: HalftoneMode
  /** Dot frequency. 25–35 vintage, 35–45 standard, 45–55 photographic. */
  lpi: number
  /** Screen angle in degrees. 22.5 or 45 for a single colour. */
  angleDeg: number
  shape: DotShape
  /** Resolution the art is rendered at. 600+ keeps gradients from banding. */
  dpi: number
  /** −100…100 */
  brightness: number
  /** −100…100 */
  contrast: number
  /** 0.1…4. Below 1 lightens midtones, above 1 darkens them. */
  gamma: number
  /** Ink below this percentage is dropped — dots too small to hold powder. */
  minDotPct: number
  /** Ink ceiling. 90–95 for colour, 85–90 for white underbase. */
  maxDotPct: number
  /** Knockout only: how much of the art gets punched out when useImageTone is false. */
  knockoutAmountPct: number
  /** Knockout only: drive hole size from image tone instead of a flat amount. */
  useImageTone: boolean
  /** Keep the source colours. When false every dot is inkColor. */
  preserveColor: boolean
  inkColor: { r: number; g: number; b: number }
  /** Supersampling per axis. 2 = 4 samples per pixel, smooth dot edges. */
  samples: 1 | 2 | 3
  invert: boolean
}

export const DEFAULT_HALFTONE: HalftoneSettings = {
  mode: 'halftone',
  lpi: 40,
  angleDeg: 22.5,
  shape: 'round',
  dpi: 600,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  minDotPct: 3,
  maxDotPct: 92,
  knockoutAmountPct: 50,
  useImageTone: false,
  preserveColor: true,
  inkColor: { r: 0, g: 0, b: 0 },
  samples: 2,
  invert: false,
}

/** Style presets from DTF practice. Vintage is the soft, open, faded look. */
export const LPI_PRESETS = {
  vintage: { lpi: 30, minDotPct: 5, maxDotPct: 85 },
  standard: { lpi: 40, minDotPct: 3, maxDotPct: 92 },
  photo: { lpi: 50, minDotPct: 2, maxDotPct: 95 },
  whiteUnderbase: { lpi: 35, minDotPct: 4, maxDotPct: 88 },
} as const

/**
 * Raw spot value for a position inside one cell. du and dv are −0.5…0.5.
 * Lower value = closer to the centre of the dot = inked sooner.
 */
function spot(shape: DotShape, du: number, dv: number): number {
  switch (shape) {
    case 'round':
      return du * du + dv * dv
    case 'ellipse':
      // Elliptical dots join along one axis first, which softens the classic
      // tonal jump around 50%.
      return du * du * 1.6 + dv * dv * 0.65
    case 'square':
      return Math.max(Math.abs(du), Math.abs(dv))
    case 'diamond':
      return Math.abs(du) + Math.abs(dv)
    case 'line':
      return Math.abs(dv)
    default:
      return du * du + dv * dv
  }
}

const QUANTILE_STEPS = 1024
const QUANTILE_SAMPLES = 192

/**
 * Sample one cell densely, sort the spot values, and keep them at fixed
 * intervals. Thresholding against the t-th quantile then inks exactly t of the
 * cell — the tone response is linear for every shape.
 */
export function buildSpotQuantiles(shape: DotShape): Float32Array {
  const values = new Float32Array(QUANTILE_SAMPLES * QUANTILE_SAMPLES)
  let i = 0
  for (let y = 0; y < QUANTILE_SAMPLES; y += 1) {
    const dv = (y + 0.5) / QUANTILE_SAMPLES - 0.5
    for (let x = 0; x < QUANTILE_SAMPLES; x += 1) {
      const du = (x + 0.5) / QUANTILE_SAMPLES - 0.5
      values[i] = spot(shape, du, dv)
      i += 1
    }
  }
  values.sort()

  const table = new Float32Array(QUANTILE_STEPS + 1)
  for (let step = 0; step <= QUANTILE_STEPS; step += 1) {
    const index = Math.min(values.length - 1, Math.round((step / QUANTILE_STEPS) * (values.length - 1)))
    table[step] = values[index]
  }
  // Anything at or below table[0] would ink at zero coverage; push it below the
  // minimum so 0% ink is genuinely blank film.
  table[0] = values[0] - 1
  return table
}

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Brightness, contrast and gamma applied to an ink level in 0…1. */
function shapeTone(ink: number, settings: HalftoneSettings) {
  let t = ink

  if (settings.brightness !== 0) {
    // Brightness lightens the print, so it reduces ink.
    t -= settings.brightness / 100
  }

  if (settings.contrast !== 0) {
    const c = settings.contrast / 100
    const factor = c >= 0 ? 1 / Math.max(0.01, 1 - c) : 1 + c
    t = (t - 0.5) * factor + 0.5
  }

  t = clamp01(t)

  if (settings.gamma !== 1) {
    t = Math.pow(t, 1 / Math.max(0.1, settings.gamma))
  }

  return clamp01(t)
}

/**
 * Highlight and shadow clipping. Ink under minDot cannot hold powder on film,
 * so it is dropped rather than printed as specks; ink over maxDot is capped so
 * shadows stay open instead of filling in solid.
 */
function clipTone(t: number, settings: HalftoneSettings) {
  const min = settings.minDotPct / 100
  const max = settings.maxDotPct / 100
  if (t <= 0) return 0
  if (t < min) return 0
  if (t > max) return max
  return t
}

export type HalftoneStats = {
  /** Fraction of the opaque area that ended up inked. */
  coverage: number
  cellPx: number
  /** Gray levels this dpi/lpi pair can actually resolve. */
  grayLevels: number
}

export type HalftoneResult = {
  image: PixelBuffer
  stats: HalftoneStats
}

/**
 * Screen an image. Returns a new buffer the same size as the source; alpha is
 * always preserved so the film stays transparent where the art was.
 */
export function halfToneImage(source: PixelBuffer, input: Partial<HalftoneSettings> = {}): HalftoneResult {
  const settings: HalftoneSettings = { ...DEFAULT_HALFTONE, ...input }
  const { width, height } = source
  const out = new Uint8ClampedArray(width * height * 4)

  const cellPx = Math.max(2, settings.dpi / Math.max(1, settings.lpi))
  const quantiles = buildSpotQuantiles(settings.shape)
  const angle = (settings.angleDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const step = settings.samples
  const sampleWeight = 1 / (step * step)

  let inkedArea = 0
  let opaqueArea = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const r = source.data[index]
      const g = source.data[index + 1]
      const b = source.data[index + 2]
      const a = source.data[index + 3]

      if (a === 0) {
        out[index + 3] = 0
        continue
      }

      // Rec. 601 luma; ink is the inverse of lightness.
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      let ink = 1 - luma
      if (settings.invert) ink = 1 - ink

      let tone: number
      if (settings.mode === 'knockout' && !settings.useImageTone) {
        // Flat distress: the hole pattern does not follow the artwork.
        tone = clipTone(clamp01(settings.knockoutAmountPct / 100), settings)
      } else {
        tone = clipTone(shapeTone(ink, settings), settings)
      }

      let coverage = 0
      if (tone > 0) {
        const threshold = quantiles[Math.round(clamp01(tone) * QUANTILE_STEPS)]
        for (let sy = 0; sy < step; sy += 1) {
          const py = y + (sy + 0.5) / step
          for (let sx = 0; sx < step; sx += 1) {
            const px = x + (sx + 0.5) / step
            const u = (px * cos + py * sin) / cellPx
            const v = (-px * sin + py * cos) / cellPx
            const du = u - Math.floor(u) - 0.5
            const dv = v - Math.floor(v) - 0.5
            if (spot(settings.shape, du, dv) <= threshold) coverage += sampleWeight
          }
        }
      }

      // Halftone inks the dots. Knockout punches them out of solid art.
      const alphaFactor = settings.mode === 'knockout' ? 1 - coverage : coverage

      opaqueArea += a / 255
      inkedArea += (a / 255) * alphaFactor

      if (settings.preserveColor) {
        out[index] = r
        out[index + 1] = g
        out[index + 2] = b
      } else {
        out[index] = settings.inkColor.r
        out[index + 1] = settings.inkColor.g
        out[index + 2] = settings.inkColor.b
      }
      out[index + 3] = Math.round(a * alphaFactor)
    }
  }

  const ratio = settings.dpi / Math.max(1, settings.lpi)
  return {
    image: { data: out, width, height },
    stats: {
      coverage: opaqueArea > 0 ? inkedArea / opaqueArea : 0,
      cellPx,
      grayLevels: Math.round(ratio * ratio + 1),
    },
  }
}

/** Diameter in microns of the smallest dot that will be printed. */
export function minDotMicrons(settings: Pick<HalftoneSettings, 'lpi' | 'minDotPct'>) {
  const cellInches = 1 / Math.max(1, settings.lpi)
  const area = (settings.minDotPct / 100) * cellInches * cellInches
  const diameterInches = Math.sqrt((4 * area) / Math.PI)
  return Math.round(diameterInches * 25400)
}

/**
 * Gray levels available. Under about 100 you will see banding in gradients,
 * which is the argument for rendering at 600 dpi rather than 300.
 */
export function grayLevels(dpi: number, lpi: number) {
  const ratio = dpi / Math.max(1, lpi)
  return Math.round(ratio * ratio + 1)
}
