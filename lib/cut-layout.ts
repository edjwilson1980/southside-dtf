import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

/** Cut contour is the printed image plus 2 mm on every side. */
export const CUT_MARGIN_MM = 2
export const CUT_MARGIN_IN = CUT_MARGIN_MM / 25.4
export const CUT_SECTION_IN = 30
/** Consecutive crop-mark rows are never more than 12 in apart. */
export const MAX_MARK_GAP_Y_IN = 12
/** Left and right crop marks are never more than 22.5 in apart. */
export const MAX_MARK_GAP_X_IN = 22.5
/** Each crop mark stays within 2.5 in of the artwork horizontally. */
export const MAX_MARK_TO_ART_X_IN = 2.5
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
export const MARK_PAD_IN = 2 / 25.4
export const MARK_INSET_IN = 2 / 25.4
export const MARK_CLEARANCE_IN = MARK_INSET_IN + MARK_PAD_IN * 2 + MARK_SIZE_IN + CUT_MARGIN_IN
/** Extra film after the last mark so the CCD can stop instead of running off the media. */
export const MARK_TRAIL_IN = 2
const PLT_UNITS_PER_IN = 1016

export type CutBox = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

export function cutBoxForPiece(piece: PlacedSheetPiece, sheetWidthIn: number, sheetHeightIn: number): CutBox {
  const widthIn = piece.widthIn + CUT_MARGIN_IN * 2
  const heightIn = piece.heightIn + CUT_MARGIN_IN * 2
  let xIn = piece.xIn - CUT_MARGIN_IN
  let yIn = piece.yIn - CUT_MARGIN_IN
  if (xIn < 0) xIn = 0
  else if (xIn + widthIn > sheetWidthIn) xIn = Math.max(0, sheetWidthIn - widthIn)
  if (yIn < 0) yIn = 0
  else if (yIn + heightIn > sheetHeightIn) yIn = Math.max(0, sheetHeightIn - heightIn)
  return { xIn, yIn, widthIn, heightIn }
}

export function cutPreviewBoxes(
  pieces: PlacedSheetPiece[],
  sheetWidthIn = SHEET_WIDTH_IN,
  sheetHeightIn: number,
) {
  return pieces.map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
}

export type PrintMark = CutBox & { color: string; shape: 'rect' | 'circle' }

function markStack(xIn: number, yIn: number): PrintMark[] {
  const pad = MARK_PAD_IN
  const size = MARK_SIZE_IN
  return [
    {
      xIn: xIn - pad,
      yIn: yIn - pad,
      widthIn: size + pad * 2,
      heightIn: size + pad * 2,
      color: '#ffffff',
      shape: 'circle',
    },
    {
      xIn,
      yIn,
      widthIn: size,
      heightIn: size,
      color: '#000000',
      shape: 'circle',
    },
  ]
}

function evenMarkYs(firstY: number, lastY: number, setCount: number) {
  if (setCount <= 1) return [firstY]
  const step = (lastY - firstY) / (setCount - 1)
  return Array.from({ length: setCount }, (_, index) => firstY + index * step)
}

function artBounds(pieces: PlacedSheetPiece[]) {
  return {
    left: Math.min(...pieces.map((piece) => piece.xIn)),
    right: Math.max(...pieces.map((piece) => piece.xIn + piece.widthIn)),
    top: Math.min(...pieces.map((piece) => piece.yIn)),
    bottom: Math.max(...pieces.map((piece) => piece.yIn + piece.heightIn)),
  }
}

function markYs(pieces: PlacedSheetPiece[], sheetHeightIn: number) {
  if (sheetHeightIn <= 0) return []
  const fallbackTop = MARK_INSET_IN + MARK_PAD_IN
  const fallbackBottom = Math.max(fallbackTop, sheetHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN)
  if (pieces.length === 0) {
    const span = fallbackBottom - fallbackTop
    const gaps = Math.max(1, Math.ceil(span / MAX_MARK_GAP_Y_IN - 1e-12))
    return evenMarkYs(fallbackTop, fallbackBottom, gaps + 1)
  }
  const bounds = artBounds(pieces)
  const first = bounds.top
  const last = Math.max(first, bounds.bottom - MARK_SIZE_IN)
  const span = last - first
  if (span <= 1e-9) return [first]
  const gaps = Math.max(1, Math.ceil(span / MAX_MARK_GAP_Y_IN - 1e-12))
  return evenMarkYs(first, last, gaps + 1)
}

function markXs(pieces: PlacedSheetPiece[], sheetWidthIn: number) {
  const minLeft = MARK_INSET_IN + MARK_PAD_IN
  const maxRight = sheetWidthIn - MARK_INSET_IN - MARK_PAD_IN - MARK_SIZE_IN
  let left = minLeft
  let right = Math.min(maxRight, left + MAX_MARK_GAP_X_IN - MARK_SIZE_IN)
  if (pieces.length > 0) {
    const bounds = artBounds(pieces)
    const outside = CUT_MARGIN_IN + MARK_PAD_IN
    left = bounds.left - outside - MARK_SIZE_IN
    right = bounds.right + outside
    left = Math.max(left, bounds.left - MAX_MARK_TO_ART_X_IN)
    right = Math.min(right, bounds.right + MAX_MARK_TO_ART_X_IN - MARK_SIZE_IN)
  }
  left = Math.min(maxRight, Math.max(minLeft, left))
  right = Math.min(maxRight, Math.max(minLeft, right))
  if (right - left > MAX_MARK_GAP_X_IN) {
    const extra = (right - left - MAX_MARK_GAP_X_IN) / 2
    left += extra
    right -= extra
  }
  if (right < left) right = left
  return { left, right }
}

export function registrationMarkBounds(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
  pieces: PlacedSheetPiece[] = [],
) {
  const { left, right } = markXs(pieces, sheetWidthIn)
  return markYs(pieces, sheetHeightIn).flatMap((yIn, row) => [
    { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: row === 0 },
    { xIn: right, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: false },
  ])
}

export function registrationMarkRects(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
  pieces: PlacedSheetPiece[] = [],
): PrintMark[] {
  return registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces).flatMap((mark) => markStack(mark.xIn, mark.yIn))
}

export function sheetHeightWithMarkTrail(
  sheetHeightIn: number,
  marks: Array<{ yIn: number; heightIn: number }>,
) {
  const lastMark = marks.reduce((max, mark) => Math.max(max, mark.yIn + mark.heightIn), 0)
  return Math.max(sheetHeightIn, lastMark + MARK_TRAIL_IN)
}

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1: number, y1: number, x2: number, y2: number) {
  return `U${x2},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};`
}

export function buildTenethPlt(
  boxes: CutBox[],
  sectionWidthIn: number,
  sectionHeightIn: number,
) {
  const width = toUnits(sectionWidthIn)
  const height = toUnits(sectionHeightIn)
  const paths = boxes.map((box) => {
    const x1 = toUnits(box.xIn)
    const x2 = toUnits(box.xIn + box.widthIn)
    const yTop = toUnits(sectionHeightIn - box.yIn)
    const yBottom = toUnits(sectionHeightIn - (box.yIn + box.heightIn))
    return rectanglePath(x1, yBottom, x2, yTop)
  }).join('')
  return `TB26,0,${width},${height};CT1;;:H A L0 ECN U SP1;;${paths}U${width},0;PG;`
}

export function cutPltSections(
  pieces: PlacedSheetPiece[],
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    const boxes = pieces
      .map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
      .filter((box) => box.yIn + box.heightIn > sectionStart + 1e-6 && box.yIn < sectionStart + sectionHeightIn - 1e-6)
      .map((box) => {
        const yIn = Math.max(0, box.yIn - sectionStart)
        const bottom = Math.min(sectionHeightIn, box.yIn + box.heightIn - sectionStart)
        return {
          xIn: box.xIn,
          yIn,
          widthIn: box.widthIn,
          heightIn: Math.max(0, bottom - yIn),
        }
      })
      .filter((box) => box.widthIn > 0 && box.heightIn > 0)
    return {
      index,
      sectionCount,
      sectionHeightIn,
      plt: boxes.length > 0 ? buildTenethPlt(boxes, sheetWidthIn, sectionHeightIn) : '',
    }
  }).filter((section) => section.plt)
}
