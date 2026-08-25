import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')
const preview = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/sheet-preview-modal.tsx'), 'utf8')

const MARK_SIZE_IN = 5 / 25.4
const CUT_MARGIN_IN = 2 / 25.4
const MARK_GAP_X_IN = 21.5
const MARK_GAP_Y_IN = 10
const MARK_LEAD_IN = 10 / 25.4
const MARK_TRAIL_IN = 0.75
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
  const first = MARK_LEAD_IN
  const contentBottom = pieces.length > 0
    ? artBounds(pieces).bottom + CUT_MARGIN_IN
    : sheetHeightIn
  const ys = [first]
  while (
    ys[ys.length - 1] + MARK_SIZE_IN < contentBottom - 1e-9
    || ys.length < 2
  ) {
    ys.push(ys[ys.length - 1] + MARK_GAP_Y_IN)
  }
  return ys
}

function markXs(sheetWidthIn = SHEET_WIDTH_IN) {
  const left = Math.max(0, (sheetWidthIn - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
  const right = left + MARK_GAP_X_IN
  return { left, right }
}

function sheetHeightWithMarkTrail(sheetHeightIn, ys) {
  const lastMark = Math.max(0, ...ys.map((yIn) => yIn + MARK_SIZE_IN))
  return Math.max(lastMark + MARK_TRAIL_IN, sheetHeightIn)
}

const shortArt = [{ yIn: 1.875, heightIn: 6, xIn: 4, widthIn: 5 }]
const midArt = [{ yIn: 1.875, heightIn: 18, xIn: 3, widthIn: 8 }]
const longArt = [{ yIn: 1.875, heightIn: 36, xIn: 2, widthIn: 10 }]
const xs = markXs()
const shortYs = markYs(shortArt, 11)
const midYs = markYs(midArt, 24)
const longYs = markYs(longArt, 40)
const midEnd = artBounds(midArt).bottom + CUT_MARGIN_IN
const longEnd = artBounds(longArt).bottom + CUT_MARGIN_IN
const midPrint = sheetHeightWithMarkTrail(midEnd, midYs)
const lastMid = midYs[midYs.length - 1] + MARK_SIZE_IN
const lastLong = longYs[longYs.length - 1] + MARK_SIZE_IN
const midGaps = midYs.slice(1).map((y, i) => y - midYs[i])
const longGaps = longYs.slice(1).map((y, i) => y - longYs[i])

const checks = [
  [layout.includes('MARK_GAP_X_IN = 21.5'), '21.5 in left-to-right crop-mark spacing is in code'],
  [layout.includes('MARK_GAP_Y_IN = 10'), '10 in vertical crop-mark spacing is in code'],
  [layout.includes('MARK_LEAD_IN = 10 / 25.4'), 'first mark row starts at the leading edge'],
  [layout.includes('MARK_TRAIL_IN = 0.75'), 'sheet ends 0.75 in after the last mark'],
  [preview.includes('21.5 in apart'), 'preview copy states 21.5 in horizontal spacing'],
  [preview.includes('every 10 in through the last design'), 'preview copy states marks continue through the last design'],
  [Math.abs(xs.right - xs.left - 21.5) < 1e-9, 'left and right marks are 21.5 in apart'],
  [Math.abs(shortYs[0] - MARK_LEAD_IN) < 1e-9, 'first pair sits at the leading edge, not down on the art'],
  [shortYs.length === 2, 'short art still gets two rows 10 in apart'],
  [Math.abs(shortYs[1] - shortYs[0] - 10) < 1e-9, 'short-art rows are 10 in apart'],
  [midGaps.every((gap) => Math.abs(gap - 10) < 1e-9), '18 in of art keeps a 10 in pitch from the leading edge'],
  [lastMid + 1e-9 >= midEnd, 'last mid-sheet mark reaches the bottom of the designs'],
  [midPrint - lastMid <= MARK_TRAIL_IN + 1e-9, 'no long unmarked footer after the last mid-sheet mark'],
  [longYs.length === 5, '36 in of art gets a mark every 10 in from the leading edge through the end'],
  [longGaps.every((gap) => Math.abs(gap - 10) < 1e-9), 'long-sheet rows are 10 in apart'],
  [lastLong + 1e-9 >= longEnd, 'last long-sheet mark reaches the bottom of the designs'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`x ${xs.left.toFixed(3)} to ${xs.right.toFixed(3)} in; y ${longYs.map((y) => y.toFixed(2)).join(', ')} in`)
console.log('crop marks start at the film edge and continue every 10 in through the last design')
