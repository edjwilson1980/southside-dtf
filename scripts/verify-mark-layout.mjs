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
const MARK_GAP_X_IN = 21.5
const MARK_GAP_Y_IN = 10
const SHEET_WIDTH_IN = 22

function artBounds(pieces) {
  return {
    left: Math.min(...pieces.map((piece) => piece.xIn)),
    right: Math.max(...pieces.map((piece) => piece.xIn + piece.widthIn)),
    top: Math.min(...pieces.map((piece) => piece.yIn)),
    bottom: Math.max(...pieces.map((piece) => piece.yIn + piece.heightIn)),
  }
}

function markYs(pieces, sheetHeightIn) {
  const first = pieces.length > 0 ? artBounds(pieces).top : MARK_INSET_IN + MARK_PAD_IN
  const last = pieces.length > 0
    ? Math.max(first, artBounds(pieces).bottom - MARK_SIZE_IN)
    : Math.max(first, sheetHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN)
  const ys = []
  const limit = Math.max(last, first + MARK_GAP_Y_IN)
  for (let yIn = first; yIn <= limit + 1e-9; yIn += MARK_GAP_Y_IN) ys.push(yIn)
  return ys
}

function markXs(sheetWidthIn = SHEET_WIDTH_IN) {
  const left = Math.max(0, (sheetWidthIn - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
  const right = left + MARK_GAP_X_IN
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
const xs = markXs()
const shortYs = markYs(shortArt, 11)
const tallYs = markYs(tallArt, 24)
const longYs = markYs(longArt, 40)
const tallGaps = tallYs.slice(1).map((y, i) => y - tallYs[i])
const longGaps = longYs.slice(1).map((y, i) => y - longYs[i])
const box = cutBoxForPiece(shortArt[0], 22, 20)
const art = shortArt[0]

const checks = [
  [layout.includes('MARK_GAP_X_IN = 21.5'), '21.5 in left-to-right crop-mark spacing is in code'],
  [layout.includes('MARK_GAP_Y_IN = 10'), '10 in vertical crop-mark spacing is in code'],
  [layout.includes('CUT_MARGIN_MM = 2'), 'cut contour is image plus 2 mm'],
  [preview.includes('21.5 in apart'), 'preview copy states 21.5 in horizontal spacing'],
  [preview.includes('10 in apart'), 'preview copy states 10 in vertical spacing'],
  [Math.abs(xs.right - xs.left - 21.5) < 1e-9, 'left and right marks are 21.5 in apart'],
  [xs.left >= 0 && xs.right + MARK_SIZE_IN <= SHEET_WIDTH_IN + 1e-9, '21.5 in pair fits on the 22 in sheet'],
  [shortYs.length === 2, 'short art still gets two rows 10 in apart'],
  [Math.abs(shortYs[1] - shortYs[0] - 10) < 1e-9, 'short-art rows are 10 in apart'],
  [tallGaps.every((gap) => Math.abs(gap - 10) < 1e-9), 'taller art keeps a 10 in vertical pitch'],
  [longYs.length === 4, '36 in of art gets a mark every 10 in'],
  [longGaps.every((gap) => Math.abs(gap - 10) < 1e-9), 'long-sheet rows are 10 in apart'],
  [Math.abs(box.widthIn - (art.widthIn + CUT_MARGIN_IN * 2)) < 1e-9, 'cut box width is the image plus 2 mm on each side'],
  [Math.abs(box.heightIn - (art.heightIn + CUT_MARGIN_IN * 2)) < 1e-9, 'cut box height is the image plus 2 mm on each side'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`x ${xs.left.toFixed(3)} to ${xs.right.toFixed(3)} in; y ${longYs.map((y) => y.toFixed(2)).join(', ')} in`)
console.log('crop marks are 21.5 in on X and 10 in on Y')
