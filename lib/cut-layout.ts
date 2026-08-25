import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

export const CUT_MARGIN_MM = 2
export const CUT_MARGIN_IN = CUT_MARGIN_MM / 25.4
export const CUT_SECTION_IN = 30
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
export const MARK_PAD_IN = 2 / 25.4
export const MARK_INSET_IN = 10 / 25.4
export const MARK_CLEARANCE_IN = MARK_INSET_IN + MARK_PAD_IN * 2 + MARK_SIZE_IN + CUT_MARGIN_IN
const PLT_UNITS_PER_IN = 1016

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
      shape: 'rect',
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

export function registrationMarkBounds(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    const left = MARK_INSET_IN + MARK_PAD_IN
    const right = sheetWidthIn - MARK_INSET_IN - MARK_PAD_IN - MARK_SIZE_IN
    const top = sectionStart + MARK_INSET_IN + MARK_PAD_IN
    const middle = sectionStart + sectionHeightIn / 2 - MARK_SIZE_IN / 2
    const bottom = sectionStart + sectionHeightIn - MARK_INSET_IN - MARK_PAD_IN - MARK_SIZE_IN
    return [top, middle, bottom].flatMap((yIn, row) => [
      { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: row === 0 },
      { xIn: right, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: false },
    ])
  }).flat()
}

export function registrationMarkRects(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
): PrintMark[] {
  return registrationMarkBounds(sheetHeightIn, sheetWidthIn).flatMap((mark) => markStack(mark.xIn, mark.yIn))
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
