/** Blade clearance between transfers / edges for uploaded sheets (inches). */
export const UPLOAD_CUT_CLEARANCE_IN = 0.25
/** Dilate alpha before labelling so split parts of one design merge (inches). */
export const UPLOAD_DILATE_IN = 0.125
/** Ignore components smaller than this area (sq in). */
export const UPLOAD_MIN_AREA_IN2 = 0.25
/**
 * Soft / feathered edge ratio among ink-ish pixels (alpha 20–235).
 * Above this, pre-cut is not offered — no hard edge for the blade.
 */
export const UPLOAD_SOFT_EDGE_RATIO = 0.35
const ALPHA_INK = 10

export type TransferBox = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

/** Silent eligibility result — never shown as outlines or priced on. */
export type CutEligibility =
  | {
      ok: true
      cutEligible: boolean
      detectedCount: number
      reason?: string
    }
  | {
      ok: false
      cutEligible: false
      detectedCount: number
      reason: string
    }

function dilateMask(mask: Uint8Array, width: number, height: number, radiusPx: number) {
  if (radiusPx <= 0) return mask
  const out = new Uint8Array(mask.length)
  const r = Math.max(1, Math.round(radiusPx))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0
      for (let dy = -r; dy <= r && !hit; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          if (mask[yy * width + xx]) {
            hit = 1
            break
          }
        }
      }
      out[y * width + x] = hit
    }
  }
  return out
}

type Component = { minX: number; minY: number; maxX: number; maxY: number; area: number }

function labelComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const labels = new Int32Array(mask.length)
  const comps: Component[] = []
  let next = 1
  const stack: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!mask[i] || labels[i]) continue
      const id = next++
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let area = 0
      stack.length = 0
      stack.push(i)
      labels[i] = id
      while (stack.length) {
        const cur = stack.pop()!
        const cx = cur % width
        const cy = (cur / width) | 0
        area += 1
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        const neighbors = [cur - 1, cur + 1, cur - width, cur + width]
        for (const n of neighbors) {
          if (n < 0 || n >= labels.length) continue
          const nx = n % width
          const ny = (n / width) | 0
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue
          if (!mask[n] || labels[n]) continue
          labels[n] = id
          stack.push(n)
        }
      }
      comps.push({ minX, minY, maxX, maxY, area })
    }
  }
  return comps
}

function boxGapIn(a: TransferBox, b: TransferBox) {
  const gapX = Math.max(0, Math.max(a.xIn, b.xIn) - Math.min(a.xIn + a.widthIn, b.xIn + b.widthIn))
  const gapY = Math.max(0, Math.max(a.yIn, b.yIn) - Math.min(a.yIn + a.heightIn, b.yIn + b.heightIn))
  if (gapX > 0 && gapY > 0) return Math.hypot(gapX, gapY)
  return Math.max(gapX, gapY)
}

/**
 * Silent cut-eligibility pass for uploaded sheets.
 * Detection never prices the order — it only decides whether pre-cut can be offered.
 */
export async function assessUploadCutEligibility(options: {
  file: Blob
  sheetWidthIn: number
  sheetHeightIn: number
  resizeWidth?: number
}): Promise<CutEligibility> {
  const resizeWidth = options.resizeWidth ?? 2000
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(options.file, {
      resizeWidth,
      resizeQuality: 'high',
    })
  } catch {
    return {
      ok: false,
      cutEligible: false,
      detectedCount: 0,
      reason:
        'We could not check this file for cutting. Upload a transparent PNG or TIFF if you want pre-cut, or continue without cutting.',
    }
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      return {
        ok: false,
        cutEligible: false,
        detectedCount: 0,
        reason: 'Could not analyse this image in the browser.',
      }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    let opaque = 0
    let ink = 0
    let soft = 0
    const total = canvas.width * canvas.height
    const mask = new Uint8Array(total)
    for (let i = 0, p = 0; i < total; i++, p += 4) {
      const a = data[p + 3]
      if (a > ALPHA_INK) {
        mask[i] = 1
        ink += 1
      }
      if (a > 250) opaque += 1
      if (a >= 20 && a <= 235) soft += 1
    }

    if (ink === 0) {
      return {
        ok: false,
        cutEligible: false,
        detectedCount: 0,
        reason: 'No artwork found on a transparent background. Export a PNG/TIFF with transparency.',
      }
    }
    if (opaque / total > 0.92) {
      return {
        ok: false,
        cutEligible: false,
        detectedCount: 0,
        reason:
          'This file has a solid background. DTF prints white ink, so a white background prints as a white rectangle.',
      }
    }

    const softRatio = soft / Math.max(1, ink)
    if (softRatio > UPLOAD_SOFT_EDGE_RATIO) {
      return {
        ok: true,
        cutEligible: false,
        detectedCount: 0,
        reason:
          'This artwork has soft edges (glows, drop shadows, or feathering), so we cannot cut a clean outline. Flatten to hard edges and re-upload, or order without cutting.',
      }
    }

    const pxPerInX = canvas.width / options.sheetWidthIn
    const pxPerInY = canvas.height / options.sheetHeightIn
    const dilatePx = Math.max(1, Math.round(UPLOAD_DILATE_IN * Math.min(pxPerInX, pxPerInY)))
    const dilated = dilateMask(mask, canvas.width, canvas.height, dilatePx)
    const minAreaPx = UPLOAD_MIN_AREA_IN2 * pxPerInX * pxPerInY
    const comps = labelComponents(dilated, canvas.width, canvas.height).filter((c) => c.area >= minAreaPx)

    const boxes: TransferBox[] = comps.map((c) => ({
      xIn: c.minX / pxPerInX,
      yIn: c.minY / pxPerInY,
      widthIn: (c.maxX - c.minX + 1) / pxPerInX,
      heightIn: (c.maxY - c.minY + 1) / pxPerInY,
    }))

    if (boxes.length === 0) {
      return {
        ok: true,
        cutEligible: false,
        detectedCount: 0,
        reason:
          'We could not find clear separate transfers to cut. Space designs on transparency and re-upload, or order without cutting.',
      }
    }

    let minGapIn = Number.POSITIVE_INFINITY
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      const edgeGap = Math.min(
        box.xIn,
        box.yIn,
        options.sheetWidthIn - (box.xIn + box.widthIn),
        options.sheetHeightIn - (box.yIn + box.heightIn),
      )
      minGapIn = Math.min(minGapIn, edgeGap)
      for (let j = i + 1; j < boxes.length; j++) {
        minGapIn = Math.min(minGapIn, boxGapIn(box, boxes[j]))
      }
    }
    if (!Number.isFinite(minGapIn)) minGapIn = 0

    if (minGapIn + 1e-6 < UPLOAD_CUT_CLEARANCE_IN) {
      return {
        ok: true,
        cutEligible: false,
        detectedCount: boxes.length,
        reason: `Some transfers on this sheet are closer than ${UPLOAD_CUT_CLEARANCE_IN} in, so we can't get a blade between them. You can space them out and re-upload, or order without cutting.`,
      }
    }

    return {
      ok: true,
      cutEligible: true,
      detectedCount: boxes.length,
    }
  } finally {
    bitmap.close()
  }
}

/** @deprecated Use assessUploadCutEligibility — kept for internal tooling later. */
export const detectTransfersFromFile = assessUploadCutEligibility
