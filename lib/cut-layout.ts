import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

/** Cut contour is the printed image plus 2 mm on every side. */
export const CUT_MARGIN_MM = 2
export const CUT_MARGIN_IN = CUT_MARGIN_MM / 25.4
export const CUT_SECTION_IN = 30
/** Sheets shorter than this get two mark pairs; 12–30 in sheets get three. */
export const SHORT_SHEET_IN = 12
/** Left and right crop marks are 21.5 in apart. */
export const MARK_GAP_X_IN = 21.5
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
export const MARK_PAD_IN = 2 / 25.4
export const MARK_INSET_IN = 2 / 25.4
export const MARK_CLEARANCE_IN = MARK_INSET_IN + MARK_PAD_IN * 2 + MARK_SIZE_IN + CUT_MARGIN_IN
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2
/** First crop-mark row, measured from the leading edge of the film. */
export const MARK_LEAD_IN = 10 / 25.4
/** Film after the last mark — enough for the camera, not another 10 in search. */
export const MARK_TRAIL_IN = 0.75
/** Small printed arrow at the leading-left circle so the camera start is obvious. */
export const START_ARROW_LENGTH_IN = 8 / 25.4
export const START_ARROW_WIDTH_IN = 6 / 25.4
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

function sectionMarkYs(sectionStart: number, sectionHeightIn: number) {
  if (sectionHeightIn <= 0) return []
  const top = sectionStart + MARK_LEAD_IN
  const bottom = sectionStart + Math.max(MARK_LEAD_IN, sectionHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN)
  if (bottom - top < 0.25) return [top]
  if (sectionHeightIn < SHORT_SHEET_IN) return [top, bottom]
  const middle = sectionStart + sectionHeightIn / 2 - MARK_SIZE_IN / 2
  if (middle - top < MARK_ROW_GAP_IN || bottom - middle < MARK_ROW_GAP_IN) return [top, bottom]
  return [top, middle, bottom]
}

function markYs(sheetHeightIn: number) {
  if (sheetHeightIn <= 0) return []
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    return sectionMarkYs(sectionStart, sectionHeightIn)
  }).flat()
}

function markXs(sheetWidthIn: number) {
  const left = Math.max(0, (sheetWidthIn - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
  const right = left + MARK_GAP_X_IN
  return { left, right }
}

export function registrationMarkBounds(
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
  pieces: PlacedSheetPiece[] = [],
) {
  const { left, right } = markXs(sheetWidthIn)
  return markYs(sheetHeightIn).flatMap((yIn, row) => [
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

export type ArrowPoint = { xIn: number; yIn: number }

/** Triangle to the right of the first crop mark, pointing at it. Stays in the header, off the artwork. */
export function startMarkArrowPoints(mark: CutBox): ArrowPoint[] {
  const cy = mark.yIn + mark.heightIn / 2
  const tipX = mark.xIn + mark.widthIn + MARK_PAD_IN + 0.6 / 25.4
  const length = START_ARROW_LENGTH_IN
  const half = START_ARROW_WIDTH_IN / 2
  return [
    { xIn: tipX, yIn: cy },
    { xIn: tipX + length, yIn: cy - half },
    { xIn: tipX + length, yIn: cy + half },
  ]
}

export function sheetHeightWithMarkTrail(
  sheetHeightIn: number,
  marks: Array<{ yIn: number; heightIn: number }>,
) {
  const lastMark = marks.reduce((max, mark) => Math.max(max, mark.yIn + mark.heightIn), 0)
  return Math.max(lastMark + MARK_TRAIL_IN, sheetHeightIn)
}

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1: number, y1: number, x2: number, y2: number) {
  return `U${x1},${y1} D${x1},${y1} D${x1},${y2},${x2},${y2},${x2},${y1},${x1},${y1} `
}

function markCenterInches(mark: CutBox) {
  return {
    xIn: mark.xIn + mark.widthIn / 2,
    yIn: mark.yIn + mark.heightIn / 2,
  }
}

/** CCD origin is the leading-left circle. Hunt that mark first, then left-to-right down the sheet. */
function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return ac.yIn - bc.yIn
    return ac.xIn - bc.xIn
  })
}

function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return {
    x: toUnits(xIn - origin.xIn),
    y: toUnits(yIn - origin.yIn),
  }
}

/** Pen-up visits to each printed 5 mm circle. No knife-down — the camera locks here first. */
function markHuntPath(marks: CutBox[], origin: { xIn: number; yIn: number }) {
  return marks.map((mark) => {
    const center = markCenterInches(mark)
    const { x, y } = toPlt(center.xIn, center.yIn, origin)
    return `U${x},${y} `
  }).join('')
}

/**
 * Artcut/Teneth DMPL contour cut for the CCD camera.
 * TB26,0,w,h is the 5 mm circle-mark size, not the sheet. Coordinates are relative
 * to the first crop-mark center so the camera origin is that circle (U0,0), the
 * matching right mark is 21.5 in across, and cuts share the same origin.
 */
export function buildTenethPlt(boxes: CutBox[], marks: CutBox[] = []) {
  const ordered = marksFromStart(marks)
  const firstMark = ordered[0]
  const origin = firstMark ? markCenterInches(firstMark) : { xIn: 0, yIn: 0 }
  const hunt = markHuntPath(ordered, origin)
  const paths = boxes.map((box) => {
    const start = toPlt(box.xIn, box.yIn, origin)
    const end = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
    return rectanglePath(start.x, start.y, end.x, end.y)
  }).join('')
  const markUnits = toUnits(MARK_SIZE_IN)
  const scan = marks.length > 0 ? `TB26,0,${markUnits},${markUnits};` : ''
  return `${scan};:H A L0 ECN U V10 ${hunt}${paths}U @`
}

export function cutPltSections(
  pieces: PlacedSheetPiece[],
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  const allMarks = registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces)
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    const inSection = (yIn: number, heightIn: number) =>
      yIn + heightIn > sectionStart + 1e-6 && yIn < sectionStart + sectionHeightIn - 1e-6
    const boxes = pieces
      .map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
      .filter((box) => inSection(box.yIn, box.heightIn))
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
    const marks = allMarks
      .filter((mark) => inSection(mark.yIn, mark.heightIn))
      .map((mark) => ({ ...mark, yIn: Math.max(0, mark.yIn - sectionStart) }))
    return {
      index,
      sectionCount,
      sectionHeightIn,
      plt: boxes.length > 0 ? buildTenethPlt(boxes, marks) : '',
    }
  }).filter((section) => section.plt)
}
