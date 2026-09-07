import { SAFETY_WIDTH_IN } from '@/lib/sheet-pricing'

export type ScaledSheet = {
  sourceWidthIn: number
  sourceHeightIn: number
  scaledWidthIn: number
  scaledHeightIn: number
  scaleFactor: number
  effectiveDpi: number
  pixelWidth: number
  pixelHeight: number
}

/** Fit the measured sheet onto the 22.3in printable width (scale up or down). */
export function scaleToSafetyWidth(options: {
  widthIn: number
  heightIn: number
  pixelWidth: number
  pixelHeight: number
}): ScaledSheet {
  const sourceWidthIn = options.widthIn
  const sourceHeightIn = options.heightIn
  if (!(sourceWidthIn > 0) || !(sourceHeightIn > 0)) {
    throw new Error('Sheet size must be greater than zero.')
  }
  const scaleFactor = SAFETY_WIDTH_IN / sourceWidthIn
  const scaledWidthIn = SAFETY_WIDTH_IN
  const scaledHeightIn = sourceHeightIn * scaleFactor
  const effectiveDpi = options.pixelWidth / scaledWidthIn
  return {
    sourceWidthIn,
    sourceHeightIn,
    scaledWidthIn,
    scaledHeightIn,
    scaleFactor,
    effectiveDpi,
    pixelWidth: options.pixelWidth,
    pixelHeight: options.pixelHeight,
  }
}

export type ScaleGate =
  | { ok: true }
  | { ok: false; level: 'block' | 'warn'; message: string }

export function evaluateScaledSheet(scaled: ScaledSheet): ScaleGate {
  if (scaled.scaledHeightIn > 200 + 1e-6) {
    return {
      ok: false,
      level: 'block',
      message: `After fitting the roll, this sheet is ${scaled.scaledHeightIn.toFixed(1)} in long. Split the file into sheets of 200 in or less, then upload again.`,
    }
  }
  if (scaled.effectiveDpi < 100) {
    return {
      ok: false,
      level: 'block',
      message: `Effective print quality is about ${Math.round(scaled.effectiveDpi)} DPI after scaling — too soft to print. Export at a higher resolution or a smaller physical size.`,
    }
  }
  if (scaled.effectiveDpi < 150) {
    return {
      ok: true,
      // warn via separate helper
    }
  }
  return { ok: true }
}

export function softDpiWarning(scaled: ScaledSheet): string | null {
  if (scaled.effectiveDpi < 100) return null
  if (scaled.effectiveDpi < 150) {
    return `Effective print quality is about ${Math.round(scaled.effectiveDpi)} DPI after scaling — it may print soft. A higher-resolution export is safer.`
  }
  return null
}
