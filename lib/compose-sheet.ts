import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { mapRgbaThroughCmyk } from '@/lib/cmyk-map'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

export type SheetPiece = {
  previewUrl: string
  widthIn: number
  heightIn: number
  /** Turned a quarter turn to nest better. widthIn/heightIn are already swapped. */
  rotated?: boolean
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

export type RotatePolicy = 'none' | 'auto' | 'all'

export type PackItem = {
  widthIn: number
  heightIn: number
  /** Set false to keep a design upright — otherwise the packer may turn it. */
  allowRotate?: boolean
}

type FreeRect = { xIn: number; yIn: number; widthIn: number; heightIn: number }

const EPS = 1e-6

/**
 * Fit artwork inside a box without distorting it.
 *
 * A placement preset such as "Medium · 10.5 x 12 in" is the space the design may
 * occupy, not the shape it must become. Forcing art into the box stretches it,
 * and reserves the whole box on the sheet even when the art is a thin bar — so
 * the customer gets a distorted print and pays for film nobody used.
 */
export function fitWithinBox(
  boxWidthIn: number,
  boxHeightIn: number,
  pixelWidth: number,
  pixelHeight: number,
): { widthIn: number; heightIn: number } {
  const width = Math.max(0, boxWidthIn)
  const height = Math.max(0, boxHeightIn)
  if (!(pixelWidth > 0) || !(pixelHeight > 0) || width <= 0 || height <= 0) {
    return { widthIn: width, heightIn: height }
  }
  const aspect = pixelHeight / pixelWidth
  const byWidth = { widthIn: width, heightIn: width * aspect }
  if (byWidth.heightIn <= height + EPS) return byWidth
  return { widthIn: height / aspect, heightIn: height }
}

export type PieceSizeInput = {
  placement: string
  size: string
  customWidth?: string
  customHeight: string
  pixelWidth: number
  pixelHeight: number
  /** Box width already parsed from the preset or the custom field. */
  widthIn: number
}

/** The box a design is allowed to fill, before the artwork is fitted into it. */
function pieceBoxInches(piece: PieceSizeInput): { widthIn: number; heightIn: number } {
  if (piece.placement === 'Custom') {
    const height = Number(piece.customHeight)
    return {
      widthIn: piece.widthIn,
      heightIn: Number.isFinite(height) && height > 0 ? Math.min(199, height) : piece.widthIn,
    }
  }
  const measurement = piece.size.split(' · ').pop() ?? piece.size
  const nums = [...measurement.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((match) => Number(match[0]))
  if (nums.length >= 2) return { widthIn: piece.widthIn, heightIn: nums[1] }
  return { widthIn: piece.widthIn, heightIn: piece.widthIn }
}

/**
 * The printed size of a design: its artwork fitted inside the chosen box.
 * Returns the box itself only when the artwork's pixel size is not known yet.
 */
export function piecePrintSize(piece: PieceSizeInput): { widthIn: number; heightIn: number } {
  const box = pieceBoxInches(piece)
  return fitWithinBox(box.widthIn, box.heightIn, piece.pixelWidth, piece.pixelHeight)
}

/** Height of a design once fitted into its box. */
export function pieceHeightInches(piece: PieceSizeInput) {
  return piecePrintSize(piece).heightIn
}

export type PackSheetOptions = {
  packWidthIn: number
  gutterIn?: number
  startYIn?: number
  sideInsetIn?: number
  /**
   * How hard to try turning designs a quarter turn.
   *
   *   none — everything stays upright
   *   auto — per design, whichever orientation drops into the tightest gap
   *   all  — turn every design that still fits the roll width
   *
   * 'all' exists because 'auto' is greedy and cannot see a whole-row win: three
   * 10.5 x 6 designs each drop into a tighter gap upright, so auto leaves them
   * 2-up over 12.1 in of film, while turning all three puts them 3-up in one
   * 10.5 in row. packSheetBestGutter runs every policy and keeps the shortest.
   * Individual items can still opt out with allowRotate: false.
   */
  rotatePolicy?: RotatePolicy
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
  pieces: Array<T & { xIn: number; yIn: number; rotated: boolean }>
  contentBottom: number
  contentEndY: number
  gutterIn: number
  rotatedCount: number
} {
  const gutterIn = opts.gutterIn ?? SHEET_GUTTER_IN
  const startYIn = opts.startYIn ?? ART_INSET_IN
  const sideInsetIn = opts.sideInsetIn ?? 0
  const policy: RotatePolicy = opts.rotatePolicy ?? 'auto'
  // Each design reserves a gutter on its right and below, so the strip is
  // one gutter wider than the usable width.
  const stripWidth = opts.packWidthIn + gutterIn
  const totalHeight = items.reduce((sum, item) => sum + item.heightIn + gutterIn, 0)
  const openHeight = totalHeight + startYIn + 1

  let free: FreeRect[] = [{ xIn: 0, yIn: startYIn, widthIn: stripWidth, heightIn: openHeight }]
  const placed: Array<T & { xIn: number; yIn: number; rotated: boolean }> = []

  const canTurn = (item: PackItem) =>
    policy !== 'none' &&
    item.allowRotate !== false &&
    Math.abs(item.widthIn - item.heightIn) > EPS &&
    item.heightIn <= opts.packWidthIn + EPS
  /** Longest edge first: with rotation in play, that orders better than height. */
  const orderKey = (item: T) => (canTurn(item) ? Math.max(item.widthIn, item.heightIn) : item.heightIn)

  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const keyDiff = orderKey(b.item) - orderKey(a.item)
      if (Math.abs(keyDiff) > EPS) return keyDiff
      const widthDiff = b.item.widthIn - a.item.widthIn
      if (Math.abs(widthDiff) > EPS) return widthDiff
      return a.index - b.index
    })

  let rotatedCount = 0

  for (const { item } of ordered) {
    const upright = { widthIn: item.widthIn, heightIn: item.heightIn, rotated: false }
    const turned = { widthIn: item.heightIn, heightIn: item.widthIn, rotated: true }
    // Upright first so it wins ties — only turn the design when it pays.
    const orientations: Array<{ widthIn: number; heightIn: number; rotated: boolean }> =
      policy === 'all' && canTurn(item) ? [turned] : canTurn(item) ? [upright, turned] : [upright]

    let bestRect: FreeRect | undefined
    let bestY = Infinity
    let bestX = Infinity
    let bestFit = Infinity
    let bestOrientation = orientations[0]

    for (const orientation of orientations) {
      const boxWidth = Math.min(orientation.widthIn, opts.packWidthIn) + gutterIn
      const boxHeight = orientation.heightIn + gutterIn

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
          bestOrientation = orientation
        }
      }
    }

    if (!bestRect) continue

    const boxWidth = Math.min(bestOrientation.widthIn, opts.packWidthIn) + gutterIn
    const boxHeight = bestOrientation.heightIn + gutterIn
    const used: FreeRect = { xIn: bestX, yIn: bestY, widthIn: boxWidth, heightIn: boxHeight }
    if (bestOrientation.rotated) rotatedCount += 1
    placed.push({
      ...item,
      widthIn: bestOrientation.widthIn,
      heightIn: bestOrientation.heightIn,
      rotated: bestOrientation.rotated,
      xIn: bestX + sideInsetIn,
      yIn: bestY,
    })
    free = pruneFreeRects(free.flatMap((rect) => splitFreeRect(rect, used)))
  }

  const contentBottom = placed.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn), startYIn)
  return { pieces: placed, contentBottom, contentEndY: contentBottom + gutterIn, gutterIn, rotatedCount }
}

/**
 * Space designs generously, but never at the cost of a longer sheet.
 *
 * Pre-cut sheets pass a minimum wide enough that neighbouring cut boxes
 * cannot overlap, since a cut box that reaches into the next design would
 * put the knife straight through it. Compared on content bottom rather than
 * sheet end, since a wider gutter always adds its own trailing space.
 *
 * Rotation should never make a sheet longer, so every policy is tried and the
 * shortest layout wins. 'all' catches whole-row wins that greedy 'auto' misses.
 */
export function packSheetBestGutter<T extends PackItem>(
  items: T[],
  opts: Omit<PackSheetOptions, 'gutterIn'> & { minGutterIn?: number },
) {
  const gutters = gutterChoices(opts.minGutterIn ?? SHEET_GUTTER_IN)
  const policies: RotatePolicy[] =
    opts.rotatePolicy === 'none' ? ['none'] : ['none', 'auto', 'all']

  let best: ReturnType<typeof packSheetPieces<T>> | undefined
  for (const rotatePolicy of policies) {
    for (const gutterIn of gutters) {
      const candidate = packSheetPieces(items, { ...opts, gutterIn, rotatePolicy })
      if (!best) {
        best = candidate
        continue
      }
      if (candidate.contentBottom < best.contentBottom - EPS) best = candidate
      // Same length: prefer the layout that turned fewer designs.
      else if (
        Math.abs(candidate.contentBottom - best.contentBottom) <= EPS &&
        candidate.rotatedCount < best.rotatedCount
      ) {
        best = candidate
      }
    }
  }
  return best as ReturnType<typeof packSheetPieces<T>>
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
    const x = piece.xIn * opts.pxPerIn
    const y = piece.yIn * opts.pxPerIn
    const w = piece.widthIn * opts.pxPerIn
    const h = piece.heightIn * opts.pxPerIn

    // Safety net: contain the art in its rect rather than stretching it, and
    // centre whatever slack is left. With piecePrintSize feeding the packer the
    // slack is zero, but a mismatch must never distort a customer's print.
    const naturalW = image.naturalWidth || w
    const naturalH = image.naturalHeight || h
    // A turned piece is drawn in local space where the long edge runs along h.
    const boxW = piece.rotated ? h : w
    const boxH = piece.rotated ? w : h
    const scale = Math.min(boxW / Math.max(1, naturalW), boxH / Math.max(1, naturalH))
    const drawW = naturalW * scale
    const drawH = naturalH * scale
    const offsetX = (boxW - drawW) / 2
    const offsetY = (boxH - drawH) / 2

    if (piece.rotated) {
      context.save()
      context.translate(x, y)
      context.rotate(Math.PI / 2)
      context.drawImage(image, offsetX, -w + offsetY, drawW, drawH)
      context.restore()
      continue
    }

    context.drawImage(image, x + offsetX, y + offsetY, drawW, drawH)
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
