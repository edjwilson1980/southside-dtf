/**
 * Square cut shapes for the DTF Sticker Maker (UV DTF only).
 * Fixed 2.5 mm box around art. PLT generation reuses the Teneth
 * mark-row / section structure from cut-layout.
 */

import type { PlacedSheetPiece } from '@/lib/compose-sheet'
import {
  CUT_MARGIN_IN,
  MARK_SECTION_IN,
  PLT_UNITS_PER_IN,
  cutBoxForPiece,
  registrationMarkBounds,
  type CutBox,
} from '@/lib/cut-layout'

/** UV DTF sticker maker supports Square Cut only. */
export type CutMode = 'box'

export type PieceCutSettings = {
  mode: CutMode
  /** Border outside the art, in inches. */
  offsetIn: number
}

export type CutShape = {
  kind: CutMode
  /** Bounding box used for packing / mark sections (always axis-aligned). */
  bounds: CutBox
  /** Closed path in sheet inches for preview + knife. */
  points: Array<{ xIn: number; yIn: number }>
}

const EPS = 1e-6
/** Default Square Cut border (2.5 mm) — same as CUT_MARGIN_IN. */
export const DEFAULT_BOX_OFFSET_IN = CUT_MARGIN_IN

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function markCenterInches(mark: CutBox) {
  return {
    xIn: mark.xIn + mark.widthIn / 2,
    yIn: mark.yIn + mark.heightIn / 2,
  }
}

function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return {
    x: toUnits(origin.yIn - yIn),
    y: toUnits(origin.xIn - xIn),
  }
}

function polygonPath(
  points: Array<{ xIn: number; yIn: number }>,
  origin: { xIn: number; yIn: number },
) {
  if (points.length < 3) return ''
  const plotted = points.map((point) => toPlt(point.xIn, point.yIn, origin))
  const first = plotted[0]
  let out = `U${first.x},${first.y};D${first.x},${first.y};`
  for (let i = 1; i < plotted.length; i += 1) {
    out += `D${plotted[i].x},${plotted[i].y};`
  }
  out += `D${first.x},${first.y};U${first.x},${first.y};`
  return out
}

function boxPoints(box: CutBox) {
  return [
    { xIn: box.xIn, yIn: box.yIn },
    { xIn: box.xIn + box.widthIn, yIn: box.yIn },
    { xIn: box.xIn + box.widthIn, yIn: box.yIn + box.heightIn },
    { xIn: box.xIn, yIn: box.yIn + box.heightIn },
  ]
}

function artBounds(piece: PlacedSheetPiece): CutBox {
  return {
    xIn: piece.xIn,
    yIn: piece.yIn,
    widthIn: piece.widthIn,
    heightIn: piece.heightIn,
  }
}

function expandBounds(box: CutBox, offsetIn: number): CutBox {
  const pad = Math.max(0, offsetIn)
  return {
    xIn: box.xIn - pad,
    yIn: box.yIn - pad,
    widthIn: box.widthIn + pad * 2,
    heightIn: box.heightIn + pad * 2,
  }
}

function shapeForPiece(
  piece: PlacedSheetPiece,
  sheetWidthIn: number,
  sheetHeightIn: number,
  offsetIn: number,
): CutShape | null {
  const art = artBounds(piece)
  if (art.widthIn <= EPS || art.heightIn <= EPS) return null
  const pad = Math.max(0, offsetIn)
  const box =
    pad > 0 || art.widthIn > 0
      ? expandBounds(art, pad)
      : cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn)
  return { kind: 'box', bounds: box, points: boxPoints(box) }
}

export async function buildCutShapes(
  pieces: PlacedSheetPiece[],
  mode: CutMode,
  sheetWidthIn: number,
  sheetHeightIn: number,
  /** Border outside the art, in inches. */
  boxOffsetIn: number = DEFAULT_BOX_OFFSET_IN,
  /** Optional per-piece overrides — non-box modes are ignored (always Square Cut). */
  perPiece?: Array<PieceCutSettings | undefined>,
): Promise<CutShape[]> {
  void mode
  const fallbackOffset = Math.max(0, boxOffsetIn)
  const shapes: CutShape[] = []
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i]
    const settings = perPiece?.[i]
    const offsetIn = settings ? Math.max(0, settings.offsetIn) : fallbackOffset
    const shape = shapeForPiece(piece, sheetWidthIn, sheetHeightIn, offsetIn)
    if (shape) shapes.push(shape)
  }
  return shapes
}

const DMPL_HEADER = ';:H A L0 ECN U '
const PLT_TAIL = '@'.repeat(21)
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const ROW_OVERLAP_IN = toUnits(0.25)

function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return bc.xIn - ac.xIn
  })
}

function markRowsFromStart(marks: CutBox[]) {
  const rows: CutBox[][] = []
  for (const mark of marksFromStart(marks)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(markCenterInches(row[0]).yIn - markCenterInches(mark).yIn) < 0.05) row.push(mark)
    else rows.push([mark])
  }
  return rows
}

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

function shapesFromStart(shapes: CutShape[], origin: { xIn: number; yIn: number }): CutShape[] {
  type Entry = { shape: CutShape; x1: number; y1: number; x2: number; y2: number }
  const remaining: Entry[] = shapes
    .map((shape) => {
      const a = toPlt(shape.bounds.xIn, shape.bounds.yIn, origin)
      const b = toPlt(
        shape.bounds.xIn + shape.bounds.widthIn,
        shape.bounds.yIn + shape.bounds.heightIn,
        origin,
      )
      return {
        shape,
        x1: Math.min(a.x, b.x),
        y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x),
        y2: Math.max(a.y, b.y),
      }
    })
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)

  const order: CutShape[] = []
  while (remaining.length > 0) {
    const seed = remaining.shift() as Entry
    const row = [seed]
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i].x1 + ROW_OVERLAP_IN < seed.x2) row.push(remaining.splice(i, 1)[0])
      else i += 1
    }
    row.sort((a, b) => a.y1 - b.y1)
    order.push(...row.map((entry) => entry.shape))
  }
  return order
}

function sectionBlock(shapes: CutShape[], frame: CutBox[], origin: { xIn: number; yIn: number }) {
  const { feed, carriage } = scanWindow(frame, origin)
  const paths = shapesFromStart(shapes, origin)
    .map((shape) => polygonPath(shape.points, origin))
    .join('')
  return `TB26,0,${feed},${carriage};CT1;${DMPL_HEADER}${ORIGIN_TICK}${paths}U${feed},0;PG;`
}

export function cutPltForShapes(
  shapes: CutShape[],
  sheetHeightIn: number,
  sheetWidthIn: number,
  pieces: PlacedSheetPiece[],
) {
  if (shapes.length === 0) return ''
  const marks = registrationMarkBounds(sheetHeightIn, sheetWidthIn, pieces)
  const rows = markRowsFromStart(marks)
  if (rows.length === 0) {
    const origin = { xIn: 0, yIn: 0 }
    const paths = shapesFromStart(shapes, origin)
      .map((shape) => polygonPath(shape.points, origin))
      .join('')
    return `${DMPL_HEADER}${paths}U @`
  }
  const rowY = rows.map((row) => markCenterInches(row[0]).yIn)
  if (rows.length === 1) {
    return sectionBlock(shapes, rows[0], markCenterInches(rows[0][0])) + PLT_TAIL
  }

  const sectionOf = (shape: CutShape) => {
    const leadingEdge = shape.bounds.yIn + shape.bounds.heightIn
    for (let i = 0; i < rowY.length - 1; i += 1) {
      if (leadingEdge > rowY[i + 1]) return i
    }
    return rowY.length - 2
  }

  const perSection: CutShape[][] = Array.from({ length: rows.length - 1 }, () => [])
  for (const shape of shapes) perSection[sectionOf(shape)].push(shape)

  return (
    perSection
      .map((sectionShapes, index) =>
        sectionBlock(sectionShapes, [...rows[index], ...rows[index + 1]], markCenterInches(rows[index][0])),
      )
      .join('') + PLT_TAIL
  )
}

export function shapeTooTallForCutter(shapes: CutShape[]) {
  return shapes.some((shape) => shape.bounds.heightIn > MARK_SECTION_IN)
}
