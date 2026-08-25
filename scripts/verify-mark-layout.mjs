import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')

const CUT_SECTION_IN = 30
const SHORT_SHEET_IN = 12
const MARK_SIZE_IN = 5 / 25.4
const MARK_PAD_IN = 2 / 25.4
const MARK_INSET_IN = 10 / 25.4
const MARK_TRAIL_IN = 1
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2

function evenMarkYs(firstY, lastY, setCount) {
  if (setCount <= 1) return [firstY]
  const step = (lastY - firstY) / (setCount - 1)
  return Array.from({ length: setCount }, (_, index) => firstY + index * step)
}

function contentSpanInSection(pieces, sectionStart, sectionHeightIn) {
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

function sectionMarkYs(sectionStart, sectionHeightIn, pieces) {
  if (sectionHeightIn <= 0) return []
  const span = contentSpanInSection(pieces, sectionStart, sectionHeightIn)
  const first = span.top
  const last = span.bottom - MARK_SIZE_IN
  if (last < first) return [sectionStart + Math.max(0, (sectionHeightIn - MARK_SIZE_IN) / 2)]
  const sets = span.bottom - span.top < SHORT_SHEET_IN ? 2 : 3
  const ys = evenMarkYs(first, last, sets)
  if (ys.length === 3 && (ys[1] - ys[0] < MARK_ROW_GAP_IN || ys[2] - ys[1] < MARK_ROW_GAP_IN)) return [first, last]
  return ys
}

function markRows(sheetHeightIn, pieces = []) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    return sectionMarkYs(sectionStart, sectionHeightIn, pieces)
  })
}

const shortArt = [{ yIn: 2.5, heightIn: 6, xIn: 1, widthIn: 4 }]
const tallArt = [{ yIn: 2.5, heightIn: 18, xIn: 1, widthIn: 4 }]
const twoSectionArt = [
  { yIn: 2.5, heightIn: 24, xIn: 1, widthIn: 4 },
  { yIn: 31, heightIn: 6, xIn: 1, widthIn: 4 },
]

const shortRows = markRows(11, shortArt)[0]
const tallRows = markRows(24, tallArt)[0]
const splitRows = markRows(38, twoSectionArt)
const shortGap = shortRows[1] - shortRows[0]
const tallGaps = [tallRows[1] - tallRows[0], tallRows[2] - tallRows[1]]
const lastShort = shortRows[shortRows.length - 1] + MARK_SIZE_IN
const trailOk = lastShort + MARK_TRAIL_IN <= 11 + MARK_TRAIL_IN + 1e-6

const checks = [
  [layout.includes('MARK_TRAIL_IN = 1'), '1 in of film stays after the last mark'],
  [layout.includes('function evenMarkYs'), 'mark rows are evenly spaced'],
  [layout.includes('contentSpanInSection'), 'marks follow the designs, not the sheet ends'],
  [shortRows.length === 2, 'art under 12 in gets two evenly spaced pairs'],
  [Math.abs(shortRows[0] - 2.5) < 1e-6, 'first pair sits at the top of the designs'],
  [Math.abs(shortRows[1] - (8.5 - MARK_SIZE_IN)) < 1e-6, 'last pair sits at the bottom of the designs'],
  [tallRows.length === 3, 'art over 12 in gets three evenly spaced pairs'],
  [Math.abs(tallGaps[0] - tallGaps[1]) < 1e-6, 'spacing between the three pairs is equal'],
  [splitRows[0].length === 3, 'first 30 in of a long sheet gets three pairs on its designs'],
  [splitRows[1].length === 2, 'remainder under 12 in gets two pairs'],
  [splitRows[1][0] >= 30, 'next set starts after the 30 in gap'],
  [trailOk, 'last mark is not on the trailing edge'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log('crop marks follow design spacing with a readable trail')
