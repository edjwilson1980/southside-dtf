import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

/** Cut contour is the printed image plus 2 mm on every side. */
export const CUT_MARGIN_MM = 2
export const CUT_MARGIN_IN = CUT_MARGIN_MM / 25.4
/** Longest the camera ever has to travel between mark rows. */
export const MARK_SECTION_IN = 36
/** Left and right crop marks are 21.5 in apart. */
export const MARK_GAP_X_IN = 21.5
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
export const MARK_PAD_IN = 2 / 25.4
/** Marks are centred on the sheet, so the first one starts this far in. */
export const MARK_EDGE_IN = Math.max(0, (SHEET_WIDTH_IN - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
/**
 * How far artwork sits in from the film edge: far enough that its 2 mm cut
 * box clears the printed circle. Reserving the white halo as well cost
 * another 2 mm a side, which was just enough to stop two 10.5 in designs
 * fitting across a 22 in sheet.
 */
export const MARK_CLEARANCE_IN = MARK_EDGE_IN + MARK_SIZE_IN + CUT_MARGIN_IN
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

/**
 * Mark rows are evenly spaced from the start mark to the far end of the
 * sheet. The camera advances the same distance to every row, so it cannot
 * overshoot the way it did when the middle row sat closer than the last.
 */
function markYs(sheetHeightIn: number) {
  if (sheetHeightIn <= 0) return []
  const first = MARK_LEAD_IN
  const last = sheetHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN
  const span = last - first
  if (span < MARK_ROW_GAP_IN) return [first]
  const steps = Math.max(1, Math.ceil(span / MARK_SECTION_IN - 1e-9))
  const pitch = span / steps
  return Array.from({ length: steps + 1 }, (_, index) => first + index * pitch)
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
  const ys = markYs(sheetHeightIn)
  // Roll-fed: the bottom of the sheet leaves the roller first, so the camera
  // parks on the bottom row and works up the film. Unwinding a roll reverses
  // the feed order but does not mirror the film, so left stays left and the
  // start mark is the bottom-left circle.
  const startRow = ys.length - 1
  return ys.flatMap((yIn, row) => [
    { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: row === startRow },
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

/**
 * Triangle inboard of the start crop mark, pointing out at it. The start
 * mark is the bottom-left circle, so the arrow sits to its right where there
 * is room, in the footer below the artwork.
 */
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
  return `U${x1},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};U${x1},${y1};`
}

function markCenterInches(mark: CutBox) {
  return {
    xIn: mark.xIn + mark.widthIn / 2,
    yIn: mark.yIn + mark.heightIn / 2,
  }
}

/** Roll-fed CCD origin is the bottom-left circle: last row first, then left to right. */
function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return ac.xIn - bc.xIn
  })
}

/** Marks grouped into rows, starting at the parked bottom row and working up. */
function markRowsFromStart(marks: CutBox[]) {
  const rows: CutBox[][] = []
  for (const mark of marksFromStart(marks)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(markCenterInches(row[0]).yIn - markCenterInches(mark).yIn) < 0.05) row.push(mark)
    else rows.push([mark])
  }
  return rows
}

/**
 * The plotter frame is not the PNG frame. On a roll cutter, HPGL X is the
 * feed direction and Y is the carriage across the media, so the two axes are
 * transposed.
 *
 * Feeding from the bottom of the sheet reverses the feed axis but not the
 * carriage: a roll unwinds, it is not turned around, so the film's left edge
 * is still on the same side of the machine. Flipping both axes rotated every
 * cut 180 degrees, which is why the marks read but the job cut mirrored.
 */
function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return {
    x: toUnits(origin.yIn - yIn),
    y: toUnits(xIn - origin.xIn),
  }
}

/**
 * TB26,0,feed,carriage is the four-point window the camera reads: the parked
 * circle, its pair across the film, and the next row up. Sizing it to the
 * furthest row instead made the camera run past the nearer rows.
 */
function markScanCommand(marks: CutBox[], origin: { xIn: number; yIn: number }) {
  const rows = markRowsFromStart(marks)
  const frame = [...(rows[0] ?? []), ...(rows[1] ?? [])]
  if (frame.length === 0) return ''
  let feed = 0
  let carriage = 0
  for (const mark of frame) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { command: `TB26,0,${feed},${carriage};CT1;`, feed, carriage }
}

/** Tiny origin tick from the working Corel plugin file, then cuts, then return to the window width. */
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'

/**
 * Match the working Corel Teneth plugin PLT:
 * TB26,0,feed,carriage;CT1;;:H A L0 ECN U  <tick> <semicolon U/D cuts> Ufeed,0;PG;@
 */
export function buildTenethPlt(boxes: CutBox[], marks: CutBox[] = []) {
  const ordered = marksFromStart(marks)
  const firstMark = ordered[0]
  const origin = firstMark ? markCenterInches(firstMark) : { xIn: 0, yIn: 0 }
  const scan = markScanCommand(ordered, origin)
  const paths = boxes.map((box) => {
    const a = toPlt(box.xIn, box.yIn, origin)
    const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
    return rectanglePath(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y))
  }).join('')
  if (!scan) return `;:H A L0 ECN U ${paths}U @`
  return `${scan.command};:H A L0 ECN U ${ORIGIN_TICK}${paths}U${scan.feed},0;PG;${'@'.repeat(21)}`
}

/**
 * One cut file per job, however long the sheet is. The belt bed feeds the
 * whole roll and re-registers on each mark pair down the sheet, so there is
 * no reason to split the job into separate files.
 */
export function cutPlt(
  pieces: PlacedSheetPiece[],
  sheetHeightIn: number,
  sheetWidthIn = SHEET_WIDTH_IN,
) {
  const boxes = pieces
    .map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
    .filter((box) => box.widthIn > 0 && box.heightIn > 0)
  if (boxes.length === 0) return ''
  return buildTenethPlt(boxes, registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces))
}
