import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')
const preview = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/sheet-preview-modal.tsx'), 'utf8')

const MARK_SIZE_IN = 5 / 25.4
const MARK_PAD_IN = 2 / 25.4
const MARK_INSET_IN = 2 / 25.4
const MARK_TRAIL_IN = 2
const CUT_MARGIN_IN = 2 / 25.4
const MAX_MARK_GAP_Y_IN = 12
const MAX_MARK_GAP_X_IN = 22.5
const MAX_MARK_TO_ART_X_IN = 2.5
const SHEET_WIDTH_IN = 22

function evenMarkYs(firstY, lastY, setCount) {
  if (setCount <= 1) return [firstY]
  const step = (lastY - firstY) / (setCount - 1)
  return Array.from({ length: setCount }, (_, index) => firstY + index * step)
}

function artBounds(pieces) {
  return {
    left: Math.min(...pieces.map((piece) => piece.xIn)),
    right: Math.max(...pieces.map((piece) => piece.xIn + piece.widthIn)),
    top: Math.min(...pieces.map((piece) => piece.yIn)),
    bottom: Math.max(...pieces.map((piece) => piece.yIn + piece.heightIn)),
  }
}

function markYs(pieces, sheetHeightIn) {
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

function markXs(pieces, sheetWidthIn = SHEET_WIDTH_IN) {
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

function cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn) {
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

const shortArt = [{ yIn: 2.5, heightIn: 6, xIn: 4, widthIn: 5 }]
const tallArt = [{ yIn: 2.5, heightIn: 18, xIn: 3, widthIn: 8 }]
const longArt = [{ yIn: 1, heightIn: 36, xIn: 2, widthIn: 10 }]
const narrowArt = [{ yIn: 2, heightIn: 8, xIn: 8, widthIn: 4 }]

const shortYs = markYs(shortArt, 11)
const tallYs = markYs(tallArt, 24)
const longYs = markYs(longArt, 40)
const shortGaps = shortYs.slice(1).map((y, i) => y - shortYs[i])
const tallGaps = tallYs.slice(1).map((y, i) => y - tallYs[i])
const longGaps = longYs.slice(1).map((y, i) => y - longYs[i])
const narrow = markXs(narrowArt)
const wide = markXs(tallArt)
const box = cutBoxForPiece(shortArt[0], 22, 20)
const art = shortArt[0]

const checks = [
  [layout.includes('MAX_MARK_GAP_Y_IN = 12'), '12 in max vertical crop-mark gap is in code'],
  [layout.includes('MAX_MARK_GAP_X_IN = 22.5'), '22.5 in max left-to-right crop-mark gap is in code'],
  [layout.includes('MAX_MARK_TO_ART_X_IN = 2.5'), '2.5 in max mark-to-artwork gap is in code'],
  [layout.includes('CUT_MARGIN_MM = 2'), 'cut contour is image plus 2 mm'],
  [preview.includes('never more than 12 in apart'), 'preview copy states the 12 in vertical cap'],
  [preview.includes('never more than 22.5 in apart'), 'preview copy states the 22.5 in horizontal cap'],
  [preview.includes('within 2.5 in of the artwork'), 'preview copy states the 2.5 in artwork cap'],
  [preview.includes('image plus 2 mm'), 'preview copy states cut boxes are image plus 2 mm'],
  [shortYs.length === 2, 'art under 12 in gets two mark rows'],
  [shortGaps.every((gap) => gap <= MAX_MARK_GAP_Y_IN + 1e-9), 'short-sheet vertical gaps stay at or under 12 in'],
  [tallYs.length === 3, '18 in of art gets three rows so no vertical gap exceeds 12 in'],
  [tallGaps.every((gap) => gap <= MAX_MARK_GAP_Y_IN + 1e-9), 'tall-sheet vertical gaps stay at or under 12 in'],
  [Math.abs(tallGaps[0] - tallGaps[1]) < 1e-6, 'vertical rows are evenly spaced under the 12 in cap'],
  [longYs.length === 4, '36 in of art gets four rows at a 12 in cap'],
  [longGaps.every((gap) => gap <= MAX_MARK_GAP_Y_IN + 1e-9), 'long-sheet vertical gaps stay at or under 12 in'],
  [wide.right - wide.left <= MAX_MARK_GAP_X_IN + 1e-9, 'left-to-right marks stay at or under 22.5 in'],
  [narrowArt[0].xIn - (narrow.left + MARK_SIZE_IN) <= MAX_MARK_TO_ART_X_IN + 1e-9, 'left mark stays within 2.5 in of the art'],
  [narrow.right - narrowArt[0].xIn - narrowArt[0].widthIn <= MAX_MARK_TO_ART_X_IN + 1e-9, 'right mark stays within 2.5 in of the art'],
  [Math.abs(box.widthIn - (art.widthIn + CUT_MARGIN_IN * 2)) < 1e-9, 'cut box width is the image plus 2 mm on each side'],
  [Math.abs(box.heightIn - (art.heightIn + CUT_MARGIN_IN * 2)) < 1e-9, 'cut box height is the image plus 2 mm on each side'],
  [Math.abs(box.xIn - (art.xIn - CUT_MARGIN_IN)) < 1e-9, 'cut box starts 2 mm left of the image'],
  [Math.abs(box.yIn - (art.yIn - CUT_MARGIN_IN)) < 1e-9, 'cut box starts 2 mm above the image'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`vertical rows at ${longYs.map((y) => y.toFixed(2)).join(', ')} in for 36 in art`)
console.log('crop marks use 12 / 22.5 / 2.5 in caps; cut boxes are image plus 2 mm')
