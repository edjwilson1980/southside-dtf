import { SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'

/**
 * Cut contour is the printed image plus this much on every side.
 *
 * Two 10.5 in designs side by side is a hard requirement, and it sets the
 * ceiling: the pair uses 21.0 in of the clear film between the crop marks,
 * and four cut margins share whatever is left — one outboard of each design
 * and two back to back in the middle. See MAX_CUT_MARGIN_IN below.
 */
export const CUT_MARGIN_IN = 0.125
/** Neighbouring designs need this much between them or their cut boxes overlap. */
export const CUT_GUTTER_IN = CUT_MARGIN_IN * 2
/**
 * How much the cutter can take in one pass before it has to stop, advance the
 * belt and pick up the next pair of marks. Mark rows are never further apart
 * than this, so it always reaches the next registration before the stop.
 */
export const MARK_SECTION_IN = 20
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
export const MARK_PAD_IN = 2 / 25.4
/**
 * The marks sit hard against both film edges, the same 0.003 in inset
 * measured off the hand-built sheet. Centring them on a fixed 21.5 in gap
 * threw away a quarter inch of the clear span between them, which is the
 * only room the artwork and its cut boxes have.
 */
export const MARK_EDGE_IN = 0.003
export const MARK_GAP_X_IN = SHEET_WIDTH_IN - MARK_SIZE_IN - MARK_EDGE_IN * 2
/** Clear film between the two printed circles: everything has to fit in here. */
export const MARK_CLEAR_SPAN_IN = MARK_GAP_X_IN - MARK_SIZE_IN
/** Largest cut margin that still lets two 10.5 in designs sit side by side. */
export const MAX_CUT_MARGIN_IN = (MARK_CLEAR_SPAN_IN - 21) / 4
/**
 * How far artwork sits in from the film edge: far enough that its cut box
 * clears the printed circle.
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
export const PLT_UNITS_PER_IN = 1016

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
  // The sheet goes on the bed upside down, so the bottom-right circle is the
  // one that presents itself first to the camera.
  const startRow = ys.length - 1
  return ys.flatMap((yIn, row) => [
    { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: false },
    { xIn: right, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: row === startRow },
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
 * mark is now the bottom-right circle, so the arrow sits to its left where
 * there is room, in the footer below the artwork.
 */
export function startMarkArrowPoints(mark: CutBox): ArrowPoint[] {
  const cy = mark.yIn + mark.heightIn / 2
  const tipX = mark.xIn - MARK_PAD_IN - 0.6 / 25.4
  const length = START_ARROW_LENGTH_IN
  const half = START_ARROW_WIDTH_IN / 2
  return [
    { xIn: tipX, yIn: cy },
    { xIn: tipX - length, yIn: cy - half },
    { xIn: tipX - length, yIn: cy + half },
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

/** Roll-fed CCD origin is the bottom-right circle: last row first, then right to left. */
function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return bc.xIn - ac.xIn
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
 * The plotter frame is not the PNG frame. HPGL X is the feed direction and Y
 * is the carriage across the media, so the two axes are transposed.
 *
 * The sheet is laid on the bed upside down, which is a 180 degree rotation,
 * so both axes also run backwards through the PNG from the bottom-right
 * start circle: +X up the sheet, +Y across it to the left. Both stay
 * positive, which is only true from that corner.
 */
function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return {
    x: toUnits(origin.yIn - yIn),
    y: toUnits(origin.xIn - xIn),
  }
}

/**
 * TB26,0,feed,carriage is the four-point window the camera reads: the parked
 * circle, its pair across the film, and the next row up. Sizing it to the
 * furthest row instead made the camera run past the nearer rows.
 */
function scanWindow(frame: CutBox[], origin: { xIn: number; yIn: number }) {
  let feed = 0
  let carriage = 0
  for (const mark of frame) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { feed, carriage }
}

/** Tiny origin tick from the working Corel plugin file, then cuts, then return to the window width. */
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'

/** Designs must share at least this much of the sheet's length to count as one row. */
const ROW_OVERLAP_IN = toUnits(0.25)

type PltBox = { x1: number; y1: number; x2: number; y2: number }

/**
 * Cut order is row by row, working outward from the parked start mark.
 *
 * The first cut is the design nearest the start mark. Everything sitting
 * beside it is cut next, sweeping side by side across the film, and only
 * then does the job move along to the next row.
 *
 * Rows are grouped by overlap rather than by a fixed tolerance. The packer
 * staggers designs, so neighbours that plainly sit side by side can start a
 * couple of inches apart; a fixed band split them into separate rows and the
 * knife appeared to skip designs near the start of the page.
 */
function boxesFromStart(boxes: CutBox[], origin: { xIn: number; yIn: number }): PltBox[] {
  const remaining: PltBox[] = boxes
    .map((box) => {
      const a = toPlt(box.xIn, box.yIn, origin)
      const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
      return {
        x1: Math.min(a.x, b.x),
        y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x),
        y2: Math.max(a.y, b.y),
      }
    })
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)

  const order: PltBox[] = []
  while (remaining.length > 0) {
    const seed = remaining.shift() as PltBox
    const row = [seed]
    // Compare against the seed, not a growing extent, so one tall design
    // cannot chain the whole sheet into a single row.
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i].x1 + ROW_OVERLAP_IN < seed.x2) row.push(remaining.splice(i, 1)[0])
      else i += 1
    }
    row.sort((a, b) => a.y1 - b.y1)
    order.push(...row)
  }
  return order
}

const DMPL_HEADER = ';:H A L0 ECN U '
const PLT_TAIL = '@'.repeat(21)

/** One register, cut and advance block: the structure proven by cutter test 1A. */
function sectionBlock(boxes: CutBox[], frame: CutBox[], origin: { xIn: number; yIn: number }) {
  const { feed, carriage } = scanWindow(frame, origin)
  const paths = boxesFromStart(boxes, origin)
    .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
    .join('')
  return `TB26,0,${feed},${carriage};CT1;${DMPL_HEADER}${ORIGIN_TICK}${paths}U${feed},0;PG;`
}

/**
 * A cut file the machine can work through in passes.
 *
 * Each pair of mark rows gets its own block: register on those four marks,
 * cut what sits between them in that pair's own frame, then PG to stop,
 * clamp and roll the film on to the next pair. A single block for the whole
 * job ran the cutter into its travel stop on anything long; this is the
 * encoding that came back working from cutter test 1A.
 *
 * A design is cut by the section its leading edge falls in, so one that
 * crosses a mark row is still cut whole, by the pass that reaches it first.
 */
export function buildTenethPlt(boxes: CutBox[], marks: CutBox[] = []) {
  const rows = markRowsFromStart(marks)
  if (rows.length === 0) {
    const paths = boxesFromStart(boxes, { xIn: 0, yIn: 0 })
      .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
      .join('')
    return `${DMPL_HEADER}${paths}U @`
  }

  const rowY = rows.map((row) => markCenterInches(row[0]).yIn)
  if (rows.length === 1) {
    return sectionBlock(boxes, rows[0], markCenterInches(rows[0][0])) + PLT_TAIL
  }

  // Leading edge is the one nearest the parked start mark, so the largest Y.
  const sectionOf = (box: CutBox) => {
    const leadingEdge = box.yIn + box.heightIn
    for (let i = 0; i < rowY.length - 1; i += 1) {
      if (leadingEdge > rowY[i + 1]) return i
    }
    return rowY.length - 2
  }

  const perSection: CutBox[][] = Array.from({ length: rows.length - 1 }, () => [])
  for (const box of boxes) perSection[sectionOf(box)].push(box)

  // Empty sections still need their block, or the film never advances past them.
  return perSection
    .map((sectionBoxes, index) =>
      sectionBlock(sectionBoxes, [...rows[index], ...rows[index + 1]], markCenterInches(rows[index][0])),
    )
    .join('') + PLT_TAIL
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
