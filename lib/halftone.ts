/**
 * AM (amplitude-modulated) halftone screening for DTF film output.
 *
 * The screen is a rotated grid of cells. For every output pixel we work out
 * where it falls inside its cell, run that position through a spot function,
 * and compare the result against the ink level wanted at that point. Dots grow
 * from the cell centre as ink level rises, which is what a real RIP does and
 * what gives a soft-hand print its screen-printed look.
 *
 * Tone response is linearised per shape with a quantile table (see
 * buildSpotQuantiles), so 40% ink really does cover 40% of the film no matter
 * which dot shape is selected.
 */

/** halftone = screen only · knockout = erase a colour only · both = erase then screen. */
export type HalftoneMode = 'halftone' | 'knockout' | 'both'

export type RgbColor = { r: number; g: number; b: number }
export type DotShape = 'round' | 'ellipse' | 'square' | 'diamond' | 'line'

export type PixelBuffer = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type HalftoneSettings = {
  mode: HalftoneMode
  /** Dot frequency. 25-35 vintage, 35-45 standard, 45-55 photographic. */
  lpi: number
  /** Screen angle in degrees. 22.5 or 45 for a single colour. */
  angleDeg: number
  shape: DotShape
  /** Resolution the art is rendered at. 600+ keeps gradients from banding. */
  dpi: number
  /** -100..100 */
  brightness: number
  /** -100..100 */
  contrast: number
  /** 0.1..4. Below 1 lightens midtones, above 1 darkens them. */
  gamma: number
  /** Ink below this percentage is dropped — dots too small to hold powder. */
  minDotPct: number
  /** Ink ceiling. 90-95 for colour, 85-90 for white underbase. */
  maxDotPct: number
  /** Step 1: strip the backdrop before anything else runs. */
  removeBackground: boolean
  /** Sample the backdrop colour from the edges instead of using bgColor. */
  bgAuto: boolean
  bgColor: RgbColor
  /** 0-100 colour match window for the backdrop. */
  bgTolerance: number
  /** 0-100 feather beyond the match window, for a clean edge. */
  bgFeather: number
  /** Colour erased in knockout modes. */
  knockoutColor: RgbColor
  /** 0-100. Matches lib/color-knockout.ts: tolerance * 2.55 in RGB distance. */
  knockoutTolerance: number
  /** 0-100. Feathers the knockout edge instead of a hard cut. */
  knockoutSoftness: number
  /** Only erase colour connected to the outside edge; enclosed colour survives. */
  backgroundOnly: boolean
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
  removeBackground: false,
  bgAuto: true,
  bgColor: { r: 255, g: 255, b: 255 },
  bgTolerance: 13,
  bgFeather: 7,
  knockoutColor: { r: 255, g: 255, b: 255 },
  knockoutTolerance: 12,
  knockoutSoftness: 0,
  backgroundOnly: true,
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
 * Raw spot value for a position inside one cell. du and dv are -0.5..0.5.
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

/** Brightness, contrast and gamma applied to an ink level in 0..1. */
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

function colorDistance(r: number, g: number, b: number, color: RgbColor) {
  const dr = r - color.r
  const dg = g - color.g
  const db = b - color.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Erase a colour from the art. Matches lib/color-knockout.ts — tolerance maps to
 * an RGB distance of tolerance * 2.55 — so the design inspector and this tool
 * knock out identically. Softness feathers the edge instead of cutting hard,
 * which keeps screened edges from looking chewed.
 */
/**
 * Guess the backdrop by sampling the border and taking the most common colour.
 * Mirrors lib/remove-background.ts, but returns the colour instead of acting on
 * it so the UI can show what it found.
 */
export function detectBackdropColor(source: PixelBuffer): RgbColor | null {
  const { data, width, height } = source
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
    const index = (y * width + x) * 4
    if (data[index + 3] < 200) continue
    samples.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
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
  // Fewer than three agreeing corners means there is no consistent backdrop.
  return bestCount >= 3 ? best : null
}

/**
 * Step 1 — strip the backdrop. Floods in from the border through pixels that
 * match the backdrop colour, so only the surround is cleared and enclosed areas
 * of the same colour survive. Feathers the boundary so screened edges stay clean.
 *
 * Unlike lib/remove-background.ts this never trims the canvas: the art has to
 * keep its dimensions or its printed size changes.
 */
export function removeBackdrop(
  source: PixelBuffer,
  options: { color?: RgbColor | null; tolerancePct: number; featherPct: number; protectMask?: Uint8Array | null },
): { image: PixelBuffer; removed: number; color: RgbColor | null } {
  const { width, height } = source
  const color = options.color ?? detectBackdropColor(source)
  if (!color) return { image: source, removed: 0, color: null }

  const out = new Uint8ClampedArray(source.data)
  const cut = Math.max(0, Math.min(100, options.tolerancePct)) * 2.55
  const feather = Math.max(0, Math.min(100, options.featherPct)) * 2.55
  const protect = options.protectMask ?? null

  const reached = new Uint8Array(width * height)
  const queue: number[] = []
  const push = (point: number) => {
    if (reached[point]) return
    const index = point * 4
    if (source.data[index + 3] === 0) {
      reached[point] = 1
      queue.push(point)
      return
    }
    if (protect && protect[point] > 0) return
    if (colorDistance(source.data[index], source.data[index + 1], source.data[index + 2], color) > cut + feather) return
    reached[point] = 1
    queue.push(point)
  }

  for (let x = 0; x < width; x += 1) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (queue.length > 0) {
    const point = queue.pop() as number
    const x = point % width
    const y = (point - x) / width
    if (x > 0) push(point - 1)
    if (x < width - 1) push(point + 1)
    if (y > 0) push(point - width)
    if (y < height - 1) push(point + width)
  }

  let removedAlpha = 0
  let totalAlpha = 0
  for (let point = 0, index = 0; point < reached.length; point += 1, index += 4) {
    const a = source.data[index + 3]
    if (a === 0) continue
    totalAlpha += a / 255
    if (!reached[point]) continue
    if (protect && protect[point] > 0) continue

    const distance = colorDistance(source.data[index], source.data[index + 1], source.data[index + 2], color)
    let keep = 1
    if (distance <= cut) keep = 0
    else if (feather > 0 && distance < cut + feather) keep = (distance - cut) / feather

    removedAlpha += (a / 255) * (1 - keep)
    out[index + 3] = Math.round(a * keep)
  }

  return {
    image: { data: out, width, height },
    removed: totalAlpha > 0 ? removedAlpha / totalAlpha : 0,
    color,
  }
}

export type KnockoutGuards = {
  /**
   * Only erase colour that is connected to the outside edge. White inside a
   * design — eyes, highlights, counters in letters — is enclosed by artwork, so
   * it never reaches the border and survives. This alone fixes most cases of a
   * knockout eating parts of the design.
   */
  backgroundOnly?: boolean
  /** Per-pixel protection, 0 = erasable, 255 = never erase. Painted by the user. */
  protectMask?: Uint8Array | null
}

export function knockoutColorPixels(
  source: PixelBuffer,
  color: RgbColor,
  tolerancePct: number,
  softnessPct = 0,
  guards: KnockoutGuards = {},
): { image: PixelBuffer; removed: number; protectedPixels: number } {
  const { width, height } = source
  const out = new Uint8ClampedArray(source.data)
  const cut = Math.max(0, Math.min(100, tolerancePct)) * 2.55
  const feather = Math.max(0, Math.min(100, softnessPct)) * 2.55
  const protect = guards.protectMask ?? null

  // Pass 1: how much would each pixel be erased on colour alone.
  const keepByColor = new Float32Array(width * height)
  for (let point = 0, index = 0; point < keepByColor.length; point += 1, index += 4) {
    if (source.data[index + 3] === 0) {
      keepByColor[point] = 1
      continue
    }
    const distance = colorDistance(source.data[index], source.data[index + 1], source.data[index + 2], color)
    if (distance <= cut) keepByColor[point] = 0
    else if (feather > 0 && distance < cut + feather) keepByColor[point] = (distance - cut) / feather
    else keepByColor[point] = 1
  }

  // Pass 2: if background-only, flood from the border through matching pixels.
  // Anything the flood cannot reach is enclosed by artwork and is left alone.
  let reachable: Uint8Array | null = null
  if (guards.backgroundOnly) {
    reachable = new Uint8Array(width * height)
    const queue: number[] = []
    const traversable = (point: number) => keepByColor[point] < 1 || source.data[point * 4 + 3] === 0

    const push = (point: number) => {
      if (reachable![point] || !traversable(point)) return
      reachable![point] = 1
      queue.push(point)
    }
    for (let x = 0; x < width; x += 1) {
      push(x)
      push((height - 1) * width + x)
    }
    for (let y = 0; y < height; y += 1) {
      push(y * width)
      push(y * width + width - 1)
    }
    while (queue.length > 0) {
      const point = queue.pop() as number
      const x = point % width
      const y = (point - x) / width
      if (x > 0) push(point - 1)
      if (x < width - 1) push(point + 1)
      if (y > 0) push(point - width)
      if (y < height - 1) push(point + width)
    }
  }

  let removedAlpha = 0
  let totalAlpha = 0
  let protectedPixels = 0

  for (let point = 0, index = 0; point < keepByColor.length; point += 1, index += 4) {
    const a = source.data[index + 3]
    if (a === 0) continue

    let keep = keepByColor[point]
    if (reachable && !reachable[point]) keep = 1
    if (protect && protect[point] > 0) {
      const shield = protect[point] / 255
      if (keep < 1) protectedPixels += 1
      keep = Math.max(keep, shield)
    }

    totalAlpha += a / 255
    removedAlpha += (a / 255) * (1 - keep)
    out[index + 3] = Math.round(a * keep)
  }

  return {
    image: { data: out, width, height },
    removed: totalAlpha > 0 ? removedAlpha / totalAlpha : 0,
    protectedPixels,
  }
}

/**
 * Flood the region of similar colour under a point, for click-to-protect.
 * Returns a mask of the connected area so the user can shield an enclosed white
 * shape with one click instead of painting it.
 */
export function selectRegion(
  source: PixelBuffer,
  startX: number,
  startY: number,
  tolerancePct: number,
): Uint8Array {
  const { width, height } = source
  const mask = new Uint8Array(width * height)
  const x0 = Math.round(startX)
  const y0 = Math.round(startY)
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return mask

  const origin = (y0 * width + x0) * 4
  const target = { r: source.data[origin], g: source.data[origin + 1], b: source.data[origin + 2] }
  const limit = Math.max(0, Math.min(100, tolerancePct)) * 2.55
  const queue: number[] = [y0 * width + x0]
  mask[y0 * width + x0] = 255

  const push = (point: number) => {
    if (mask[point]) return
    const index = point * 4
    if (source.data[index + 3] === 0) return
    if (colorDistance(source.data[index], source.data[index + 1], source.data[index + 2], target) > limit) return
    mask[point] = 255
    queue.push(point)
  }

  while (queue.length > 0) {
    const point = queue.pop() as number
    const x = point % width
    const y = (point - x) / width
    if (x > 0) push(point - 1)
    if (x < width - 1) push(point + 1)
    if (y > 0) push(point - width)
    if (y < height - 1) push(point + width)
  }
  return mask
}

/**
 * Sample a rectangle out of a mask at a new resolution. The protect mask lives in
 * its own fixed space covering the crop, so a zoomed preview can pull just the
 * visible window out of it without the mask shifting when you zoom or pan.
 */
export function sampleMaskRegion(
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  region: { x: number; y: number; width: number; height: number },
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const out = new Uint8Array(outWidth * outHeight)
  for (let y = 0; y < outHeight; y += 1) {
    const sy = Math.min(
      maskHeight - 1,
      Math.max(0, Math.floor(region.y + ((y + 0.5) / outHeight) * region.height)),
    )
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.min(
        maskWidth - 1,
        Math.max(0, Math.floor(region.x + ((x + 0.5) / outWidth) * region.width)),
      )
      out[y * outWidth + x] = mask[sy * maskWidth + sx]
    }
  }
  return out
}

/** Nearest-neighbour resize, for reusing a preview-resolution mask at export size. */
export function scaleMask(
  mask: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  if (width === targetWidth && height === targetHeight) return mask
  const out = new Uint8Array(targetWidth * targetHeight)
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y * height) / targetHeight))
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / targetWidth))
      out[y * targetWidth + x] = mask[sy * width + sx]
    }
  }
  return out
}

/**
 * Full pipeline for the Shop Tools generator.
 *
 *   knockout  -> erase the chosen colour, no screening
 *   halftone  -> screen the art as-is
 *   both      -> erase the colour first, then screen what is left
 */
export function processArtwork(
  source: PixelBuffer,
  input: Partial<HalftoneSettings> = {},
  guards: KnockoutGuards = {},
): HalftoneResult & {
  stats: HalftoneStats & { knockedOut: number; backgroundRemoved: number; backdrop: RgbColor | null }
} {
  const settings: HalftoneSettings = { ...DEFAULT_HALFTONE, ...input }

  let working = source
  let knockedOut = 0
  let backgroundRemoved = 0
  let backdrop: RgbColor | null = null

  // Step 1 runs in every mode — it is a cleanup pass, not a print effect.
  if (settings.removeBackground) {
    const stripped = removeBackdrop(working, {
      color: settings.bgAuto ? null : settings.bgColor,
      tolerancePct: settings.bgTolerance,
      featherPct: settings.bgFeather,
      protectMask: guards.protectMask,
    })
    working = stripped.image
    backgroundRemoved = stripped.removed
    backdrop = stripped.color
  }

  if (settings.mode === 'knockout' || settings.mode === 'both') {
    const result = knockoutColorPixels(
      working,
      settings.knockoutColor,
      settings.knockoutTolerance,
      settings.knockoutSoftness,
      { backgroundOnly: settings.backgroundOnly, ...guards },
    )
    working = result.image
    knockedOut = result.removed
  }

  if (settings.mode === 'knockout') {
    // No screen — report what survived as fully inked.
    let inked = 0
    let total = 0
    for (let index = 3; index < working.data.length; index += 4) {
      total += 1
      inked += working.data[index] / 255
    }
    return {
      image: working,
      stats: {
        coverage: total > 0 ? inked / total : 0,
        cellPx: settings.dpi / Math.max(1, settings.lpi),
        grayLevels: grayLevels(settings.dpi, settings.lpi),
        knockedOut,
        backgroundRemoved,
        backdrop,
      },
    }
  }

  const screened = halftoneImage(working, settings)

  // A protected pixel is left exactly as the artist drew it — not knocked out and
  // not screened. Without this, white art that survived the knockout would still
  // vanish, because white carries no ink in a halftone.
  const protect = guards.protectMask
  if (protect) {
    const out = screened.image.data
    for (let point = 0, index = 0; point < protect.length; point += 1, index += 4) {
      if (protect[point] === 0) continue
      const shield = protect[point] / 255
      out[index] = Math.round(out[index] * (1 - shield) + source.data[index] * shield)
      out[index + 1] = Math.round(out[index + 1] * (1 - shield) + source.data[index + 1] * shield)
      out[index + 2] = Math.round(out[index + 2] * (1 - shield) + source.data[index + 2] * shield)
      out[index + 3] = Math.round(out[index + 3] * (1 - shield) + source.data[index + 3] * shield)
    }
  }

  return { image: screened.image, stats: { ...screened.stats, knockedOut, backgroundRemoved, backdrop } }
}

/**
 * Unsharp mask. Resampling art above its native resolution softens it; a light
 * unsharp puts the edge back so dots land on a crisp shape instead of a blur.
 * Same box-blur-and-add approach as lib/upscale-image.ts, kept pure here.
 */
export function unsharpBuffer(source: PixelBuffer, amount = 0.65): PixelBuffer {
  const { width, height, data } = source
  const out = new Uint8ClampedArray(data)
  if (amount <= 0) return { data: out, width, height }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          const sy = Math.min(height - 1, Math.max(0, y + dy))
          for (let dx = -1; dx <= 1; dx += 1) {
            const sx = Math.min(width - 1, Math.max(0, x + dx))
            sum += data[(sy * width + sx) * 4 + channel]
            count += 1
          }
        }
        const blurred = sum / count
        out[index + channel] = data[index + channel] + amount * (data[index + channel] - blurred)
      }
    }
  }
  return { data: out, width, height }
}

/** Source pixels available per printed inch. Under 150 prints soft. */
export function effectiveDpi(sourcePixels: number, printInches: number) {
  if (!(printInches > 0)) return 0
  return Math.round(sourcePixels / printInches)
}

/** Alpha channel as a visible matte: white is ink on film, black is bare film. */
export function alphaMatte(source: PixelBuffer): PixelBuffer {
  const out = new Uint8ClampedArray(source.data.length)
  for (let index = 0; index < source.data.length; index += 4) {
    const a = source.data[index + 3]
    out[index] = a
    out[index + 1] = a
    out[index + 2] = a
    out[index + 3] = 255
  }
  return { data: out, width: source.width, height: source.height }
}

/**
 * Screen an image. Returns a new buffer the same size as the source; alpha is
 * always preserved so the film stays transparent where the art was.
 */
export function halftoneImage(source: PixelBuffer, input: Partial<HalftoneSettings> = {}): HalftoneResult {
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

      const tone = clipTone(shapeTone(ink, settings), settings)

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

      const alphaFactor = coverage

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
