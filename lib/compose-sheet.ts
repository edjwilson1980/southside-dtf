import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { mapRgbaThroughCmyk } from '@/lib/cmyk-map'

export type PackItem = { widthIn: number; heightIn: number; allowRotate?: boolean }

export type SheetPiece = PackItem & {
  previewUrl: string
  rotated?: boolean
}

export type PlacedSheetPiece = SheetPiece & {
  xIn: number
  yIn: number
}

export type OrientPolicy = 'none' | 'fitWidth' | 'landscape' | 'portrait'
export type PackSort = keyof typeof SORTS

export type PackSheetOptions = {
  packWidthIn: number
  gutterIn?: number
  startYIn?: number
  startXIn?: number
  sort?: PackSort
  sectionLengthIn?: number
  boxMarginIn?: number
}

export type PackSheetResult<T extends PackItem> = {
  pieces: Array<T & { xIn: number; yIn: number; rotated?: boolean }>
  unplaced: T[]
  contentBottom: number
  contentEndY: number
  policy?: OrientPolicy
  sort?: PackSort
  gutterIn?: number
}

export const SHEET_GUTTER_IN = 0.125
export const PREFERRED_GUTTER_IN = 0.25
export const SHEET_WIDTH_IN = 22
export const LABEL_PT = 72
export const PRINT_MARGIN_IN = 1.5
export const LABEL_MARGIN_IN = 0.75
const LABEL_HEIGHT_IN = LABEL_PT / 72
const LABEL_PAD_IN = 0.125
export const ART_INSET_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + PRINT_MARGIN_IN
const EPS = 1e-6

type FreeRect = { xIn: number; yIn: number; widthIn: number; heightIn: number }
type Indexed<T> = { item: T; index: number }

const SORTS = {
  tallest: <T extends PackItem>(a: Indexed<T>, b: Indexed<T>) =>
    (b.item.heightIn - a.item.heightIn) || (b.item.widthIn - a.item.widthIn) || (a.index - b.index),
  widest: <T extends PackItem>(a: Indexed<T>, b: Indexed<T>) =>
    (b.item.widthIn - a.item.widthIn) || (b.item.heightIn - a.item.heightIn) || (a.index - b.index),
  area: <T extends PackItem>(a: Indexed<T>, b: Indexed<T>) =>
    (b.item.widthIn * b.item.heightIn - a.item.widthIn * a.item.heightIn) || (a.index - b.index),
}

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

function splitFreeRect(free: FreeRect, used: FreeRect) {
  const noOverlap =
    used.xIn >= free.xIn + free.widthIn - EPS || used.xIn + used.widthIn <= free.xIn + EPS ||
    used.yIn >= free.yIn + free.heightIn - EPS || used.yIn + used.heightIn <= free.yIn + EPS
  if (noOverlap) return [free]
  const out: FreeRect[] = []
  if (used.yIn > free.yIn + EPS) {
    out.push({ xIn: free.xIn, yIn: free.yIn, widthIn: free.widthIn, heightIn: used.yIn - free.yIn })
  }
  if (used.yIn + used.heightIn < free.yIn + free.heightIn - EPS) {
    out.push({
      xIn: free.xIn,
      yIn: used.yIn + used.heightIn,
      widthIn: free.widthIn,
      heightIn: free.yIn + free.heightIn - (used.yIn + used.heightIn),
    })
  }
  if (used.xIn > free.xIn + EPS) {
    out.push({ xIn: free.xIn, yIn: free.yIn, widthIn: used.xIn - free.xIn, heightIn: free.heightIn })
  }
  if (used.xIn + used.widthIn < free.xIn + free.widthIn - EPS) {
    out.push({
      xIn: used.xIn + used.widthIn,
      yIn: free.yIn,
      widthIn: free.xIn + free.widthIn - (used.xIn + used.widthIn),
      heightIn: free.heightIn,
    })
  }
  return out
}

const contains = (outer: FreeRect, inner: FreeRect) =>
  inner.xIn >= outer.xIn - EPS && inner.yIn >= outer.yIn - EPS &&
  inner.xIn + inner.widthIn <= outer.xIn + outer.widthIn + EPS &&
  inner.yIn + inner.heightIn <= outer.yIn + outer.heightIn + EPS

function pruneFreeRects(rects: FreeRect[]) {
  const kept: FreeRect[] = []
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].widthIn <= EPS || rects[i].heightIn <= EPS) continue
    let covered = false
    for (let j = 0; j < rects.length; j++) {
      if (i !== j && contains(rects[j], rects[i]) && !(contains(rects[i], rects[j]) && j > i)) {
        covered = true
        break
      }
    }
    if (!covered) kept.push(rects[i])
  }
  return kept
}

function sectionAdjustedY(yIn: number, heightIn: number, opts: PackSheetOptions) {
  const sectionLengthIn = opts.sectionLengthIn
  if (!sectionLengthIn || sectionLengthIn <= 0) return yIn
  const boxMarginIn = opts.boxMarginIn ?? 0
  const section = Math.floor(Math.max(0, yIn - boxMarginIn) / sectionLengthIn)
  const sectionEnd = (section + 1) * sectionLengthIn
  if (yIn + heightIn + boxMarginIn > sectionEnd + EPS) return sectionEnd + boxMarginIn
  return yIn
}

function orient<T extends PackItem>(items: T[], policy: OrientPolicy, packWidthIn: number): T[] {
  return items.map((item) => {
    if (policy === 'none' || item.allowRotate === false) return item
    if (item.heightIn > packWidthIn + EPS) return item
    const { widthIn: w, heightIn: h } = item
    const turn =
      (policy === 'landscape' && h > w) ||
      (policy === 'portrait' && w > h) ||
      (policy === 'fitWidth' && w > packWidthIn + EPS)
    return turn ? { ...item, widthIn: h, heightIn: w, rotated: true } : item
  })
}

export function gutterChoices(min = SHEET_GUTTER_IN) {
  const preferred = Math.max(PREFERRED_GUTTER_IN, min)
  return [preferred, (preferred + min) / 2, min]
}

export function packSheetPieces<T extends PackItem>(items: T[], opts: PackSheetOptions): PackSheetResult<T> {
  const gutterIn = opts.gutterIn ?? SHEET_GUTTER_IN
  const startYIn = opts.startYIn ?? ART_INSET_IN
  const startXIn = opts.startXIn ?? 0
  const sort = opts.sort ?? 'tallest'
  if (items.length === 0) {
    return { pieces: [], unplaced: [], contentBottom: startYIn, contentEndY: startYIn, sort, gutterIn }
  }

  const stripWidth = opts.packWidthIn + gutterIn
  const totalHeight = items.reduce((sum, item) => sum + item.heightIn + gutterIn, 0)
  const sectionSlack = opts.sectionLengthIn ? items.length * opts.sectionLengthIn : 0
  let free: FreeRect[] = [{
    xIn: startXIn,
    yIn: startYIn,
    widthIn: stripWidth,
    heightIn: totalHeight + startYIn + sectionSlack + 1,
  }]
  const placed: PackSheetResult<T>['pieces'] = []
  const unplaced: T[] = []
  const ordered = items.map((item, index) => ({ item, index })).sort(SORTS[sort])

  for (const { item } of ordered) {
    if (item.widthIn > opts.packWidthIn + EPS) {
      unplaced.push(item)
      continue
    }
    const boxWidth = item.widthIn + gutterIn
    const boxHeight = item.heightIn + gutterIn
    let found = false
    let bestY = Infinity
    let bestX = Infinity
    let bestFit = Infinity
    for (const rect of free) {
      if (rect.widthIn + EPS < boxWidth) continue
      const placeY = sectionAdjustedY(rect.yIn, item.heightIn, opts)
      if (placeY < rect.yIn - EPS) continue
      if (placeY + boxHeight > rect.yIn + rect.heightIn + EPS) continue
      const fit = Math.min(rect.widthIn - boxWidth, rect.yIn + rect.heightIn - placeY - boxHeight)
      if (
        placeY < bestY - EPS ||
        (Math.abs(placeY - bestY) <= EPS && fit < bestFit - EPS) ||
        (Math.abs(placeY - bestY) <= EPS && Math.abs(fit - bestFit) <= EPS && rect.xIn < bestX - EPS)
      ) {
        found = true
        bestY = placeY
        bestX = rect.xIn
        bestFit = fit
      }
    }
    if (!found) {
      unplaced.push(item)
      continue
    }
    free = pruneFreeRects(free.flatMap((rect) => splitFreeRect(rect, {
      xIn: bestX,
      yIn: bestY,
      widthIn: boxWidth,
      heightIn: boxHeight,
    })))
    placed.push({ ...item, xIn: bestX, yIn: bestY })
  }

  const contentBottom = placed.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn), startYIn)
  return { pieces: placed, unplaced, contentBottom, contentEndY: contentBottom + gutterIn, sort, gutterIn }
}

export function packSheetBestGutter<T extends PackItem>(
  items: T[],
  opts: Omit<PackSheetOptions, 'gutterIn' | 'sort'> & { minGutterIn?: number },
  policies: OrientPolicy[] = ['none', 'fitWidth', 'landscape', 'portrait'],
): PackSheetResult<T> {
  const gutters = gutterChoices(opts.minGutterIn ?? SHEET_GUTTER_IN)
  let best: PackSheetResult<T> | undefined

  for (const policy of policies) {
    const oriented = orient(items, policy, opts.packWidthIn)
    for (const sort of Object.keys(SORTS) as PackSort[]) {
      for (const gutterIn of gutters) {
        const candidate = packSheetPieces(oriented, { ...opts, gutterIn, sort })
        if (
          !best ||
          candidate.unplaced.length < best.unplaced.length ||
          (candidate.unplaced.length === best.unplaced.length && candidate.contentBottom < best.contentBottom - EPS)
        ) {
          best = { ...candidate, policy }
        }
      }
    }
  }
  return best!
}

export function layoutSheetRows(
  rows: SheetPiece[][],
  opts?: { sectionLengthIn?: number; boxMarginIn?: number; sideInsetIn?: number },
) {
  const sectionLengthIn = opts?.sectionLengthIn
  const boxMarginIn = opts?.boxMarginIn ?? 0
  const sideInsetIn = opts?.sideInsetIn ?? 0
  let yIn = ART_INSET_IN
  const pieces: PlacedSheetPiece[] = []

  for (const row of rows) {
    const rowHeight = Math.max(...row.map((piece) => piece.heightIn), 0)
    const rowWidth = row.reduce((sum, piece, index) => sum + piece.widthIn + (index > 0 ? SHEET_GUTTER_IN : 0), 0)
    const rowInset = rowWidth > SHEET_WIDTH_IN - sideInsetIn * 2 ? 0 : sideInsetIn
    if (sectionLengthIn && sectionLengthIn > 0) {
      const section = Math.floor(Math.max(0, yIn - boxMarginIn) / sectionLengthIn)
      const sectionEnd = (section + 1) * sectionLengthIn
      if (yIn + rowHeight + boxMarginIn > sectionEnd) {
        yIn = sectionEnd + boxMarginIn
      }
    }
    let xIn = rowInset
    for (const piece of row) {
      pieces.push({ ...piece, xIn, yIn })
      xIn += piece.widthIn + SHEET_GUTTER_IN
    }
    yIn += rowHeight + SHEET_GUTTER_IN
  }

  return { pieces, contentEndY: yIn }
}

function drawSheetPiece(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  piece: PlacedSheetPiece,
  pxPerIn: number,
) {
  const x = piece.xIn * pxPerIn
  const y = piece.yIn * pxPerIn
  const wPx = piece.widthIn * pxPerIn
  const hPx = piece.heightIn * pxPerIn
  if (piece.rotated) {
    context.save()
    context.translate(x + wPx, y)
    context.rotate(Math.PI / 2)
    context.drawImage(image, 0, 0, hPx, wPx)
    context.restore()
    return
  }
  context.drawImage(image, x, y, wPx, hPx)
}

export async function composeGangSheet(opts: {
  pieces: PlacedSheetPiece[]
  sheetLengthIn: number
  pxPerIn: number
  label?: string
  mapCmyk?: boolean
  marks?: Array<{ xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string }>
}) {
  const width = Math.max(1, Math.round(SHEET_WIDTH_IN * opts.pxPerIn))
  const height = Math.max(1, Math.round(opts.sheetLengthIn * opts.pxPerIn))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: Boolean(opts.mapCmyk) })
  if (!context) throw new Error('Could not build the gang sheet preview.')

  context.clearRect(0, 0, width, height)

  for (const piece of opts.pieces) {
    if (!piece.previewUrl) continue
    const image = await loadImage(piece.previewUrl)
    drawSheetPiece(context, image, piece, opts.pxPerIn)
  }

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

  if (opts.mapCmyk) {
    const pixels = context.getImageData(0, 0, width, height)
    mapRgbaThroughCmyk(pixels.data)
    context.putImageData(pixels, 0, 0)
  }

  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  for (const mark of opts.marks ?? []) {
    context.fillStyle = mark.color || '#000000'
    context.fillRect(
      Math.round(mark.xIn * opts.pxPerIn),
      Math.round(mark.yIn * opts.pxPerIn),
      Math.max(2, Math.round(mark.widthIn * opts.pxPerIn)),
      Math.max(2, Math.round(mark.heightIn * opts.pxPerIn)),
    )
  }

  return canvasToPngBlob(canvas, width / SHEET_WIDTH_IN)
}
