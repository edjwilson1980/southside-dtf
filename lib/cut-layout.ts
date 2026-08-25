import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

export const CUT_MARGIN_MM = 2
export const CUT_MARGIN_IN = CUT_MARGIN_MM / 25.4
export const CUT_SECTION_IN = 30
/** Sheets shorter than this get two mark pairs (four circles) instead of three. */
export const SHORT_SHEET_IN = 12
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
export const MARK_PAD_IN = 2 / 25.4
export const MARK_INSET_IN = 10 / 25.4
export const MARK_CLEARANCE_IN = MARK_INSET_IN + MARK_PAD_IN * 2 + MARK_SIZE_IN + CUT_MARGIN_IN
/** Extra film after the last mark so the CCD can read it before the media ends. */
export const MARK_TRAIL_IN = 1
const PLT_UNITS_PER_IN = 1016
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2

export type CutBox = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

export function cutBoxForPiece(piece: PlacedSheetPiece, sheetWidthIn: number, sheetHeightIn: number): CutBox {
  const xIn = Math.max(0, piece.xIn - CUT_MARGIN_IN)
  const yIn = Math.max(0, piece.yIn - CUT_MARGIN_IN)
  const right = Math.min(sheetWidthIn, piece.xIn + piece.widthIn + CUT_MARGIN_IN)
  const bottom = Math.min(sheetHeightIn, piece.yIn + piece.heightIn + CUT_MARGIN_IN)
  return {
    xIn,
    yIn,
    widthIn: Math.max(0, right - xIn),
    heightIn: Math.max(0, bottom - yIn),
  }
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

function contentSpanInSection(
  pieces: PlacedSheetPiece[] | undefined,
  sectionStart: number,
  sectionHeightIn: number,
) {
  const sectionEnd = sectionStart + sectionHeightIn
  const hits = (pieces ?? []).filter(
    (piece) => piece.yIn < sectionEnd - 1e-6 && piece.yIn + piece.heightIn > sectionStart + 1e-6,
  )
  if (hits.length === 0) {
    return {
      top: sectionStart + MARK_INSET_IN + MARK_PAD_IN,
      bottom: sectionStart + Math.max(MARK_SIZE_IN, sectionHeightIn - MARK_TRAIL_IN),
    }
  }
  return {
    top: Math.max(sectionStart, Math.min(...hits.map((piece) => piece.yIn))),
    bottom: Math.min(sectionEnd, Math.max(...hits.map((piece) => piece.yIn + piece.heightIn))),
  }
}

function sectionMarkYs(
  sectionStart: number,
  sectionHeightIn: number,
  pieces?: PlacedSheetPiece[],
) {
  if (sectionHeightIn <= 0) return []
  const span = contentSpanInSection(pieces, sectionStart, sectionHeightIn)
  const first = span.top
  const last = span.bottom - MARK_SIZE_IN
  if (last < first) {
    return [sectionStart + Math.max(0, (sectionHeightIn - MARK_SIZE_IN) / 2)]
  }
  const sets = span.bottom - span.top < SHORT_SHEET_IN ? 2 : 3
  const ys = evenMarkYs(first, last, sets)
  if (ys.length === 3 && (ys[1] - ys[0] < MARK_ROW_GAP_IN || ys[2] - ys[1] < MARK_ROW_GAP_IN)) {
    return [first, last]
  }
  return ys
}

export function registrationMarkBounds(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
  pieces: PlacedSheetPiece[] = [],
) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    const left = MARK_INSET_IN + MARK_PAD_IN
    const right = sheetWidthIn - MARK_INSET_IN - MARK_PAD_IN - MARK_SIZE_IN
    return sectionMarkYs(sectionStart, sectionHeightIn, pieces).flatMap((yIn, row) => [
      { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: index === 0 && row === 0 },
      { xIn: right, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: false },
    ])
  }).flat()
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
