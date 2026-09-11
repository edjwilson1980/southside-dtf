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

/**
 * Fit a finished gang sheet to the printable roll width.
 *
 * Only scale DOWN when the file is wider than 22.3 in. Never scale up — a sheet
 * that is already 22 × 36 in must stay ~36 in long. Stretching a narrower sheet
 * up to full width (e.g. 8.9 × 36 → 22.3 × 90) quietly inflates the order.
 */
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

  const scaleFactor = sourceWidthIn > SAFETY_WIDTH_IN ? SAFETY_WIDTH_IN / sourceWidthIn : 1
  const scaledWidthIn = sourceWidthIn * scaleFactor
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
