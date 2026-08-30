import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { mapRgbaThroughCmyk } from '@/lib/cmyk-map'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

export type SheetPiece = {
  previewUrl: string
  widthIn: number
  heightIn: number
}

export type PlacedSheetPiece = SheetPiece & {
  xIn: number
  yIn: number
}

export const SHEET_GUTTER_IN = 0.125

/** Preferred space between designs; tightened toward the minimum only when it would cost film. */
export const PREFERRED_GUTTER_IN = 0.25

/** Widest to narrowest spacing to try, given a minimum the caller will not go below. */
function gutterChoices(minGutterIn: number) {
  const preferred = Math.max(PREFERRED_GUTTER_IN, minGutterIn)
  return [preferred, (preferred + minGutterIn) / 2, minGutterIn]
}
export { FILM_WIDTH_IN, SHEET_WIDTH_IN } from '@/lib/sheet-size'
export const LABEL_PT = 72
export const PRINT_MARGIN_IN = 1.5
export const LABEL_MARGIN_IN = 0.75
const LABEL_HEIGHT_IN = LABEL_PT / 72
const LABEL_PAD_IN = 0.125
export const ART_INSET_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + PRINT_MARGIN_IN
/** Pre-cut sheets skip the extra 1.5 in print margin so the first crop marks sit near the leading edge. */
export const CUT_ART_START_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + LABEL_MARGIN_IN

export function pieceHeightInches(piece: {
  placement: string;
  size: string;
  customHeight: string;
  pixelWidth: number;
  pixelHeight: number;
  widthIn: number;
}) {
  if (piece.placement === 'Custom') {
    const height = Number(piece.customHeight)
    if (Number.isFinite(height) && height > 0) return Math.min(199, height)
  }
  const measurement = piece.size.split(' · ').pop() ?? piece.size
  const nums = [...measurement.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((match) => Number(match[0]))
  if (nums.length >= 2) return nums[1]
  if (piece.pixelWidth > 0 && piece.pixelHeight > 0) {
    return piece.widthIn * (piece.pixelHeight / piece.pixelWidth)
  }
  return piece.widthIn
}

export type PackItem = { widthIn: number; heightIn: number }

type FreeRect = { xIn: number; yIn: number; widthIn: number; heightIn: number }

const EPS = 1e-6

export type PackSheetOptions = {
  packWidthIn: number
  gutterIn?: number
  startYIn?: number
  sideInsetIn?: number
}

function splitFreeRect(free: FreeRect, used: FreeRect): FreeRect[] {
  const noOverlap =
    used.xIn >= free.xIn + free.widthIn - EPS ||
    used.xIn + used.widthIn <= free.xIn + EPS ||
    used.yIn >= free.yIn + free.heightIn - EPS ||
    used.yIn + used.heightIn <= free.yIn + EPS
  if (noOverlap) return [free]

  const parts: FreeRect[] = []
  if (used.yIn > free.yIn + EPS) {
    parts.push({ xIn: free.xIn, yIn: free.yIn, widthIn: free.widthIn, heightIn: used.yIn - free.yIn })
  }
  const usedBottom = used.yIn + used.heightIn
  if (usedBottom < free.yIn + free.heightIn - EPS) {
    parts.push({ xIn: free.xIn, yIn: usedBottom, widthIn: free.widthIn, heightIn: free.yIn + free.heightIn - usedBottom })
  }
  if (used.xIn > free.xIn + EPS) {
    parts.push({ xIn: free.xIn, yIn: free.yIn, widthIn: used.xIn - free.xIn, heightIn: free.heightIn })
  }
  const usedRight = used.xIn + used.widthIn
  if (usedRight < free.xIn + free.widthIn - EPS) {
    parts.push({ xIn: usedRight, yIn: free.yIn, widthIn: free.xIn + free.widthIn - usedRight, heightIn: free.heightIn })
  }
  return parts
}

function contains(outer: FreeRect, inner: FreeRect) {
  return (
    inner.xIn >= outer.xIn - EPS &&
    inner.yIn >= outer.yIn - EPS &&
    inner.xIn + inner.widthIn <= outer.xIn + outer.widthIn + EPS &&
    inner.yIn + inner.heightIn <= outer.yIn + outer.heightIn + EPS
  )
}

function pruneFreeRects(rects: FreeRect[]) {
  const kept: FreeRect[] = []
  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i]
    if (rect.widthIn <= EPS || rect.heightIn <= EPS) continue
    let covered = false
    for (let j = 0; j < rects.length; j += 1) {
      if (i === j) continue
      if (contains(rects[j], rect) && !(contains(rect, rects[j]) && j > i)) {
        covered = true
        break
      }
    }
    if (!covered) kept.push(rect)
  }
  return kept
}

/**
 * Bottom-left MaxRects packing for a fixed-width, open-ended roll.
 *
 * Designs used to be placed in upload order, one row at a time, so a single
 * tall design set a tall row and every short design after it wasted that
 * height. That is what turned a 72 in job into a 200 in sheet. Packing in
 * two dimensions lets short designs stack in the space beside a tall one.
 */
export function packSheetPieces<T extends PackItem>(
  items: T[],
  opts: PackSheetOptions,
): {
  pieces: Array<T & { xIn: number; yIn: number }>
  contentBottom: number
  contentEndY: number
  gutterIn: number
} {
  const gutterIn = opts.gutterIn ?? SHEET_GUTTER_IN
  const startYIn = opts.startYIn ?? ART_INSET_IN
  const sideInsetIn = opts.sideInsetIn ?? 0
  // Each design reserves a gutter on its right and below, so the strip is
  // one gutter wider than the usable width.
  const stripWidth = opts.packWidthIn + gutterIn
  const totalHeight = items.reduce((sum, item) => sum + item.heightIn + gutterIn, 0)
  const openHeight = totalHeight + startYIn + 1

  let free: FreeRect[] = [{ xIn: 0, yIn: startYIn, widthIn: stripWidth, heightIn: openHeight }]
  const placed: Array<T & { xIn: number; yIn: number }> = []

  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const heightDiff = b.item.heightIn - a.item.heightIn
      if (Math.abs(heightDiff) > EPS) return heightDiff
      const widthDiff = b.item.widthIn - a.item.widthIn
      if (Math.abs(widthDiff) > EPS) return widthDiff
      return a.index - b.index
    })

  for (const { item } of ordered) {
    const boxWidth = Math.min(item.widthIn, opts.packWidthIn) + gutterIn
    const boxHeight = item.heightIn + gutterIn

    let bestRect: FreeRect | undefined
    let bestY = Infinity
    let bestX = Infinity
    let bestFit = Infinity

    for (const rect of free) {
      if (rect.widthIn + EPS < boxWidth || rect.heightIn + EPS < boxHeight) continue
      const fit = Math.min(rect.widthIn - boxWidth, rect.heightIn - boxHeight)
      if (
        rect.yIn < bestY - EPS ||
        (Math.abs(rect.yIn - bestY) <= EPS && fit < bestFit - EPS) ||
        (Math.abs(rect.yIn - bestY) <= EPS && Math.abs(fit - bestFit) <= EPS && rect.xIn < bestX - EPS)
      ) {
        bestRect = rect
        bestY = rect.yIn
        bestX = rect.xIn
        bestFit = fit
      }
    }

    if (!bestRect) continue

    const used: FreeRect = { xIn: bestX, yIn: bestY, widthIn: boxWidth, heightIn: boxHeight }
    placed.push({ ...item, xIn: bestX + sideInsetIn, yIn: bestY })
    free = pruneFreeRects(free.flatMap((rect) => splitFreeRect(rect, used)))
  }

  const contentBottom = placed.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn), startYIn)
  return { pieces: placed, contentBottom, contentEndY: contentBottom + gutterIn, gutterIn }
}

/**
 * Space designs generously, but never at the cost of a longer sheet.
 *
 * Pre-cut sheets pass a minimum wide enough that neighbouring cut boxes
 * cannot overlap, since a cut box that reaches into the next design would
 * put the knife straight through it. Compared on content bottom rather than
 * sheet end, since a wider gutter always adds its own trailing space.
 */
export function packSheetBestGutter<T extends PackItem>(
  items: T[],
  opts: Omit<PackSheetOptions, 'gutterIn'> & { minGutterIn?: number },
) {
  const [first, ...rest] = gutterChoices(opts.minGutterIn ?? SHEET_GUTTER_IN)
  let best = packSheetPieces(items, { ...opts, gutterIn: first })
  for (const gutterIn of rest) {
    const candidate = packSheetPieces(items, { ...opts, gutterIn })
    if (candidate.contentBottom < best.contentBottom - EPS) best = candidate
  }
  return best
}

function fillMarkCircle(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  diameter: number,
) {
  const radius = Math.max(1, diameter / 2)
  context.beginPath()
  context.arc(cx, cy, radius, 0, Math.PI * 2)
  context.closePath()
  context.fill()
}

function fillRegistrationMark(
  context: CanvasRenderingContext2D,
  mark: { xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string },
  pxPerIn: number,
) {
  const cx = (mark.xIn + mark.widthIn / 2) * pxPerIn
  const cy = (mark.yIn + mark.heightIn / 2) * pxPerIn
  const diameter = Math.max(2, Math.min(mark.widthIn, mark.heightIn) * pxPerIn)
  context.imageSmoothingEnabled = true
  context.fillStyle = mark.color || '#000000'
  fillMarkCircle(context, cx, cy, diameter)
}

function fillPolygon(
  context: CanvasRenderingContext2D,
  points: Array<{ xIn: number; yIn: number }>,
  pxPerIn: number,
) {
  if (points.length < 3) return
  context.beginPath()
  points.forEach((point, index) => {
    const x = point.xIn * pxPerIn
    const y = point.yIn * pxPerIn
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.fill()
}

function fillStartArrow(
  context: CanvasRenderingContext2D,
  points: Array<{ xIn: number; yIn: number }>,
  pxPerIn: number,
) {
  const cx = points.reduce((sum, point) => sum + point.xIn, 0) / points.length
  const cy = points.reduce((sum, point) => sum + point.yIn, 0) / points.length
  const halo = points.map((point) => ({
    xIn: cx + (point.xIn - cx) * 1.9,
    yIn: cy + (point.yIn - cy) * 1.9,
  }))
  context.imageSmoothingEnabled = true
  context.fillStyle = '#ffffff'
  fillPolygon(context, halo, pxPerIn)
  context.fillStyle = '#000000'
  fillPolygon(context, points, pxPerIn)
}

export async function composeGangSheet(opts: {
  pieces: PlacedSheetPiece[]
  sheetLengthIn: number
  pxPerIn: number
  label?: string
  mapCmyk?: boolean
  marks?: Array<{ xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string }>
  startArrow?: Array<{ xIn: number; yIn: number }>
}) {
  const width = Math.max(1, Math.round(SHEET_WIDTH_IN * opts.pxPerIn))
  const height = Math.max(1, Math.round(opts.sheetLengthIn * opts.pxPerIn))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: Boolean(opts.mapCmyk) || Boolean(opts.marks?.length) })
  if (!context) throw new Error('Could not build the gang sheet preview.')

  context.clearRect(0, 0, width, height)

  if (opts.label) {
    const fontPx = Math.max(1, (LABEL_PT * opts.pxPerIn) / 72)
    context.font = `700 ${fontPx}px Arial, Helvetica, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#111111'
    const x = width / 2
    const labelY = (LABEL_MARGIN_IN + LABEL_HEIGHT_IN / 2) * opts.pxPerIn
    context.fillText(opts.label, x, labelY)
    context.fillText(opts.label, x, height - labelY)
  }

  for (const piece of opts.pieces) {
    if (!piece.previewUrl) continue
    const image = await loadImage(piece.previewUrl)
    context.drawImage(
      image,
      piece.xIn * opts.pxPerIn,
      piece.yIn * opts.pxPerIn,
      piece.widthIn * opts.pxPerIn,
      piece.heightIn * opts.pxPerIn,
    )
  }

  if (opts.mapCmyk) {
    const pixels = context.getImageData(0, 0, width, height)
    mapRgbaThroughCmyk(pixels.data)
    context.putImageData(pixels, 0, 0)
  }

  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  for (const mark of opts.marks ?? []) {
    fillRegistrationMark(context, mark, opts.pxPerIn)
  }
  if (opts.startArrow && opts.startArrow.length >= 3) {
    fillStartArrow(context, opts.startArrow, opts.pxPerIn)
  }

  return canvasToPngBlob(canvas, width / SHEET_WIDTH_IN)
}
