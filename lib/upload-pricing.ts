/** Shared constants and size-matching for Upload Gangsheet (Woo-priced). */

export const UPLOAD_PRODUCT_ID = 115
export const UPLOAD_MAX_WIDTH_IN = 22.0
export const UPLOAD_WIDTH_TOLERANCE_IN = 0.1
export const UPLOAD_LENGTH_TOLERANCE_IN = 0
export const UPLOAD_MAX_LENGTH_IN = 200
export const UPLOAD_MIN_LENGTH_IN = 12
export const UPLOAD_LOW_DPI = 150

export type UploadSizeOption = {
  variation_id: number
  slug: string
  label: string
  length_in: number
  price: number
  price_html: string
}

/** Pull length from attribute slug — second number after an `x`. */
export function lengthFromSlug(slug: string): number | null {
  const match = String(slug).match(/x-?(\d+)/i)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Smallest variation whose length ≥ measured length (round up).
 * Under 12 in → 12 in tier. Over 200 in → null (caller rejects).
 */
export function pickUploadSize(
  lengthIn: number,
  sizes: UploadSizeOption[],
  lengthToleranceIn = UPLOAD_LENGTH_TOLERANCE_IN,
): UploadSizeOption | null {
  if (!(lengthIn > 0) || sizes.length === 0) return null
  const target = Math.max(UPLOAD_MIN_LENGTH_IN, lengthIn - lengthToleranceIn)
  if (target > UPLOAD_MAX_LENGTH_IN + 1e-9) return null
  const ordered = [...sizes].sort((a, b) => a.length_in - b.length_in)
  for (const size of ordered) {
    if (size.length_in + 1e-9 >= target) return size
  }
  return null
}

export function widthRejectMessage(widthIn: number) {
  return `Your file is ${widthIn.toFixed(2)} in wide. Gang sheets are 22 in wide max.`
}

export function lengthRejectMessage() {
  return 'Max sheet is 200 in (16 ft). Please split into two files.'
}
