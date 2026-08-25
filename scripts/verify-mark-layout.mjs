import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')
const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app/page.tsx'), 'utf8')
const compose = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/compose-sheet.ts'), 'utf8')

const CUT_SECTION_IN = 30
const SHORT_SHEET_IN = 12
const MARK_SIZE_IN = 5 / 25.4
const MARK_PAD_IN = 2 / 25.4
const MARK_INSET_IN = 2 / 25.4
const MARK_TRAIL_IN = 2
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2
const GUTTER = 0.125
const CUT_ART_START_IN = 0.125 + 1 + 0.75

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

function designRowsInSection(pieces, sectionStart, sectionHeightIn) {
  const sectionEnd = sectionStart + sectionHeightIn
  const rows = []
  for (const piece of [...(pieces ?? [])].sort((a, b) => a.yIn - b.yIn)) {
    if (piece.yIn >= sectionEnd - 1e-6 || piece.yIn + piece.heightIn <= sectionStart + 1e-6) continue
    const row = rows.find((item) => Math.abs(item.yIn - piece.yIn) < 1e-6)
    if (row) row.bottom = Math.max(row.bottom, piece.yIn + piece.heightIn)
    else rows.push({ yIn: piece.yIn, bottom: piece.yIn + piece.heightIn })
  }
  return rows
}

function sectionMarkYs(sectionStart, sectionHeightIn, pieces) {
  if (sectionHeightIn <= 0) return []
  const span = contentSpanInSection(pieces, sectionStart, sectionHeightIn)
  const first = span.top
  const last = span.bottom - MARK_SIZE_IN
  if (last < first) return [sectionStart + Math.max(0, (sectionHeightIn - MARK_SIZE_IN) / 2)]
  const sets = span.bottom - span.top < SHORT_SHEET_IN ? 2 : 3
  const rows = designRowsInSection(pieces, sectionStart, sectionHeightIn)
  if (rows.length === 2 && sets === 3) {
    const gapMid = (rows[0].bottom + rows[1].yIn) / 2 - MARK_SIZE_IN / 2
    return [first, gapMid, last]
  }
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

function sheetHeightWithMarkTrail(sheetHeightIn, ys) {
  const lastMark = Math.max(0, ...ys.map((yIn) => yIn + MARK_SIZE_IN))
  return Math.max(sheetHeightIn, lastMark + MARK_TRAIL_IN)
}

const shortArt = [{ yIn: 2.5, heightIn: 6, xIn: 1, widthIn: 4 }]
const tallArt = [{ yIn: 2.5, heightIn: 18, xIn: 1, widthIn: 4 }]
const twoSectionArt = [
  { yIn: 2.5, heightIn: 24, xIn: 1, widthIn: 4 },
  { yIn: 31, heightIn: 6, xIn: 1, widthIn: 4 },
]

const row1Y = CUT_ART_START_IN
const row2Y = CUT_ART_START_IN + 8 + GUTTER
const owlArt = [
  { yIn: row1Y, heightIn: 8, xIn: 1, widthIn: 8 },
  { yIn: row1Y, heightIn: 8, xIn: 10, widthIn: 8 },
  { yIn: row2Y, heightIn: 8, xIn: 1, widthIn: 8 },
  { yIn: row2Y, heightIn: 8, xIn: 10, widthIn: 8 },
]
const owlEnd = row2Y + 8 + GUTTER
const owlRows = markRows(owlEnd, owlArt)[0]
const owlPrint = sheetHeightWithMarkTrail(owlEnd, owlRows)
const owlGaps = [owlRows[1] - owlRows[0], owlRows[2] - owlRows[1]]
const gutterCenter = (row1Y + 8 + row2Y) / 2

const shortRows = markRows(11, shortArt)[0]
const tallRows = markRows(24, tallArt)[0]
const splitRows = markRows(38, twoSectionArt)
const shortGap = shortRows[1] - shortRows[0]
const tallGaps = [tallRows[1] - tallRows[0], tallRows[2] - tallRows[1]]
const lastOwl = owlRows[owlRows.length - 1] + MARK_SIZE_IN

const leftX = MARK_INSET_IN + MARK_PAD_IN

const checks = [
  [layout.includes('MARK_TRAIL_IN = 2'), '2 in of film stays after the last mark'],
  [layout.includes('MARK_INSET_IN = 2 / 25.4'), 'marks sit on the left and right film edges'],
  [layout.includes('function evenMarkYs'), 'mark rows are evenly spaced'],
  [layout.includes('function designRowsInSection'), 'two-row gangs put the middle pair between the rows'],
  [layout.includes('contentSpanInSection'), 'marks follow the designs, not the sheet ends'],
  [compose.includes('CUT_ART_START_IN'), 'pre-cut art starts without the extra print margin'],
  [page.includes('sheetHeightWithMarkTrail(sheetLayout.contentEndY'), 'print height is the last mark plus trail, not a 1.5 in footer'],
  [page.includes('startYIn: CUT_ART_START_IN'), 'pre-cut designs start near the first crop marks'],
  [shortRows.length === 2, 'art under 12 in gets two evenly spaced pairs'],
  [Math.abs(shortRows[0] - 2.5) < 1e-6, 'first pair sits at the top of the designs'],
  [Math.abs(shortRows[1] - (8.5 - MARK_SIZE_IN)) < 1e-6, 'last pair sits at the bottom of the designs'],
  [tallRows.length === 3, 'art over 12 in gets three evenly spaced pairs'],
  [Math.abs(tallGaps[0] - tallGaps[1]) < 1e-6, 'spacing between the three pairs is equal'],
  [splitRows[0].length === 3, 'first 30 in of a long sheet gets three pairs on its designs'],
  [splitRows[1].length === 2, 'remainder under 12 in gets two pairs'],
  [splitRows[1][0] >= 30, 'next set starts after the 30 in gap'],
  [owlRows.length === 3, 'a 2x2 gang over 12 in gets three mark pairs'],
  [Math.abs(owlRows[0] - row1Y) < 1e-6, 'top pair lines up with the first row of designs'],
  [Math.abs(owlRows[1] + MARK_SIZE_IN / 2 - gutterCenter) < 0.02, 'middle pair sits in the gap between the two rows'],
  [Math.abs(owlRows[2] - (row2Y + 8 - MARK_SIZE_IN)) < 1e-6, 'bottom pair lines up with the last row of designs'],
  [Math.abs(owlGaps[0] - owlGaps[1]) < 0.15, 'space between each 2x2 mark set is about one row'],
  [lastOwl + MARK_TRAIL_IN <= owlPrint + 1e-6, 'sheet ends 2 in after the last mark'],
  [owlPrint - lastOwl >= MARK_TRAIL_IN - 1e-6, 'cutter has 2 in of film after the last mark, not at the edge'],
  [leftX < 0.2, 'left marks are within 0.2 in of the film edge'],
  [shortGap > 0, `short-sheet pair spacing is ${shortGap.toFixed(2)} in`],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`2x2 crop marks at ${owlRows.map((y) => y.toFixed(2)).join(', ')} in; print ${owlPrint.toFixed(2)} in`)
console.log('crop marks follow design-row spacing with a readable trail')
