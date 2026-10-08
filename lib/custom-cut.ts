/**
 * Cut shapes for the staff Sticker Maker: rectangular box, circle, or
 * silhouette contour around the artwork. PLT generation reuses the Teneth
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
import { loadImage } from '@/lib/image-utils'

export type CutMode = 'box' | 'circle' | 'contour'

export const CUT_MODES: { value: CutMode; label: string; hint: string }[] = [
  {
    value: 'box',
    label: 'Box cut',
    hint: 'Rectangle around each design — same as standard pre-cut boxes.',
  },
  {
    value: 'circle',
    label: 'Circle cut',
    hint: 'Round cut sized to the design’s longer side plus cut margin.',
  },
  {
    value: 'contour',
    label: 'Cut around object',
    hint: 'Follows the artwork silhouette (alpha edge) with a small offset.',
  },
]

export type CutShape = {
  kind: CutMode
  /** Bounding box used for packing / mark sections (always axis-aligned). */
  bounds: CutBox
  /** Closed path in sheet inches for preview + knife. */
  points: Array<{ xIn: number; yIn: number }>
}

const EPS = 1e-6
const CIRCLE_SEGMENTS = 48
/** How far outside the alpha the contour sits (matches box margin feel). */
const CONTOUR_OFFSET_IN = CUT_MARGIN_IN

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

function circlePoints(cx: number, cy: number, radius: number, segments = CIRCLE_SEGMENTS) {
  const points: Array<{ xIn: number; yIn: number }> = []
  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments
    points.push({ xIn: cx + Math.cos(angle) * radius, yIn: cy + Math.sin(angle) * radius })
  }
  return points
}

function boxPoints(box: CutBox) {
  return [
    { xIn: box.xIn, yIn: box.yIn },
    { xIn: box.xIn + box.widthIn, yIn: box.yIn },
    { xIn: box.xIn + box.widthIn, yIn: box.yIn + box.heightIn },
    { xIn: box.xIn, yIn: box.yIn + box.heightIn },
  ]
}

/** Marching-squares style outline of opaque pixels → sheet-inch polygon. */
async function contourPointsForPiece(
  piece: PlacedSheetPiece,
  sheetWidthIn: number,
  sheetHeightIn: number,
): Promise<Array<{ xIn: number; yIn: number }>> {
  if (!piece.previewUrl) return boxPoints(cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))

  const image = await loadImage(piece.previewUrl)
  const sampleW = Math.min(240, Math.max(32, image.naturalWidth))
  const sampleH = Math.max(32, Math.round((sampleW * image.naturalHeight) / Math.max(1, image.naturalWidth)))
  const canvas = document.createElement('canvas')
  canvas.width = sampleW
  canvas.height = sampleH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return boxPoints(cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
  ctx.clearRect(0, 0, sampleW, sampleH)
  ctx.drawImage(image, 0, 0, sampleW, sampleH)
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH)

  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= sampleW || y >= sampleH) return false
    return data[(y * sampleW + x) * 4 + 3] > 24
  }

  // Boundary walk: start at left-most solid pixel, walk 8-connected edge.
  let startX = -1
  let startY = -1
  outer: for (let x = 0; x < sampleW; x += 1) {
    for (let y = 0; y < sampleH; y += 1) {
      if (solid(x, y)) {
        startX = x
        startY = y
        break outer
      }
    }
  }
  if (startX < 0) return boxPoints(cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))

  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ] as const

  const edge: Array<{ x: number; y: number }> = []
  let x = startX
  let y = startY
  let dir = 0
  const maxSteps = sampleW * sampleH * 4
  for (let step = 0; step < maxSteps; step += 1) {
    edge.push({ x, y })
    let found = false
    for (let turn = 0; turn < 8; turn += 1) {
      const nextDir = (dir + 6 + turn) % 8 // prefer left turns to stay on outer edge
      const nx = x + dirs[nextDir][0]
      const ny = y + dirs[nextDir][1]
      if (!solid(nx, ny)) continue
      // Edge pixel if any 4-neighbour is empty
      const isEdge =
        !solid(nx + 1, ny) || !solid(nx - 1, ny) || !solid(nx, ny + 1) || !solid(nx, ny - 1)
      if (!isEdge && !(nx === startX && ny === startY)) continue
      x = nx
      y = ny
      dir = nextDir
      found = true
      break
    }
    if (!found) break
    if (edge.length > 8 && x === startX && y === startY) break
  }

  if (edge.length < 8) return boxPoints(cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))

  // Decimate + expand slightly outward from piece centre.
  const stride = Math.max(1, Math.floor(edge.length / 80))
  const cx = piece.xIn + piece.widthIn / 2
  const cy = piece.yIn + piece.heightIn / 2
  const points: Array<{ xIn: number; yIn: number }> = []
  for (let i = 0; i < edge.length; i += stride) {
    const px = piece.xIn + (edge[i].x / sampleW) * piece.widthIn
    const py = piece.yIn + (edge[i].y / sampleH) * piece.heightIn
    const dx = px - cx
    const dy = py - cy
    const len = Math.hypot(dx, dy) || 1
    points.push({
      xIn: px + (dx / len) * CONTOUR_OFFSET_IN,
      yIn: py + (dy / len) * CONTOUR_OFFSET_IN,
    })
  }
  return points.length >= 3 ? points : boxPoints(cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
}

export async function buildCutShapes(
  pieces: PlacedSheetPiece[],
  mode: CutMode,
  sheetWidthIn: number,
  sheetHeightIn: number,
): Promise<CutShape[]> {
  const shapes: CutShape[] = []
  for (const piece of pieces) {
    const box = cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn)
    if (box.widthIn <= EPS || box.heightIn <= EPS) continue

    if (mode === 'box') {
      shapes.push({ kind: 'box', bounds: box, points: boxPoints(box) })
      continue
    }

    if (mode === 'circle') {
      const cx = box.xIn + box.widthIn / 2
      const cy = box.yIn + box.heightIn / 2
      const radius = Math.max(box.widthIn, box.heightIn) / 2
      const bounds: CutBox = {
        xIn: cx - radius,
        yIn: cy - radius,
        widthIn: radius * 2,
        heightIn: radius * 2,
      }
      shapes.push({ kind: 'circle', bounds, points: circlePoints(cx, cy, radius) })
      continue
    }

    const points = await contourPointsForPiece(piece, sheetWidthIn, sheetHeightIn)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of points) {
      minX = Math.min(minX, point.xIn)
      minY = Math.min(minY, point.yIn)
      maxX = Math.max(maxX, point.xIn)
      maxY = Math.max(maxY, point.yIn)
    }
    shapes.push({
      kind: 'contour',
      bounds: { xIn: minX, yIn: minY, widthIn: maxX - minX, heightIn: maxY - minY },
      points,
    })
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
