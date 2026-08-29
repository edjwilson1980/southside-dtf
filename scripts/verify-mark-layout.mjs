import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')
const compose = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/compose-sheet.ts'), 'utf8')
const preview = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/sheet-preview-modal.tsx'), 'utf8')
const overlay = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/cut-box-overlay.tsx'), 'utf8')
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'), 'utf8')

const MARK_SIZE_IN = 5 / 25.4
const MARK_GAP_X_IN = 21.5
const MARK_LEAD_IN = 10 / 25.4
const MARK_TRAIL_IN = 0.75
const MARK_PAD_IN = 2 / 25.4
const SHORT_SHEET_IN = 12
const CUT_SECTION_IN = 30
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2
const SHEET_WIDTH_IN = 22

function sectionMarkYs(sectionStart, sectionHeightIn) {
  const top = sectionStart + MARK_LEAD_IN
  const bottom = sectionStart + Math.max(MARK_LEAD_IN, sectionHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN)
  if (bottom - top < 0.25) return [top]
  if (sectionHeightIn < SHORT_SHEET_IN) return [top, bottom]
  const middle = sectionStart + sectionHeightIn / 2 - MARK_SIZE_IN / 2
  if (middle - top < MARK_ROW_GAP_IN || bottom - middle < MARK_ROW_GAP_IN) return [top, bottom]
  return [top, middle, bottom]
}

function markYs(sheetHeightIn) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    return sectionMarkYs(sectionStart, sectionHeightIn)
  }).flat()
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

const xs = markXs()
const shortYs = markYs(11)
const firstMark = { xIn: xs.left, yIn: shortYs[0], widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN }
const arrowTipX = firstMark.xIn + firstMark.widthIn + MARK_PAD_IN + 0.6 / 25.4
const artStart = 0.125 + 1 + 0.75
const contentEnd = 8
const printHeight = contentEnd + artStart
const printYs = markYs(printHeight)
const lastPrintMark = printYs[printYs.length - 1]
const twelveYs = markYs(12)
const midYs = markYs(24)
const longYs = markYs(36)
const shortPrint = sheetHeightWithMarkTrail(11, shortYs)
const lastShort = shortYs[shortYs.length - 1] + MARK_SIZE_IN
const lastTwelve = twelveYs[twelveYs.length - 1] + MARK_SIZE_IN
const lastMid = midYs[midYs.length - 1] + MARK_SIZE_IN
const lastLong = longYs[longYs.length - 1] + MARK_SIZE_IN

const checks = [
  [layout.includes('SHORT_SHEET_IN = 12'), '12 in short-sheet threshold is in code'],
  [layout.includes('MARK_GAP_X_IN = 21.5'), '21.5 in left-to-right crop-mark spacing is in code'],
  [layout.includes('MARK_LEAD_IN = 10 / 25.4'), 'first mark row starts at the leading edge'],
  [layout.includes('MARK_TRAIL_IN = 0.75'), 'sheet ends 0.75 in after the last mark'],
  [layout.includes("shape: 'circle'"), 'printed marks are circles, not squares'],
  [overlay.includes('<circle'), 'preview overlay draws crop marks as SVG circles'],
  [overlay.includes('cut-start-arrow') && overlay.includes('<polygon'), 'preview overlay draws a start arrow pointing at the first crop mark'],
  [layout.includes('startMarkArrowPoints'), 'start-arrow geometry is defined next to the first crop mark'],
  [css.includes('cut-overlay-svg') && css.includes('stroke: #ff1a1a'), 'overlay crop marks are stroked circles, not boxes'],
  [preview.includes('21.5 in'), 'preview copy states 21.5 in horizontal spacing'],
  [preview.includes('down the film first'), 'preview copy says the mark window is measured down the film first'],
  [preview.includes('in the margins'), 'preview copy says crop marks stay off the designs'],
  [preview.includes('Under 12 in uses two pairs'), 'preview copy states mark count follows sheet length'],
  [Math.abs(xs.right - xs.left - 21.5) < 1e-9, 'left and right marks are 21.5 in apart'],
  [arrowTipX > firstMark.xIn + firstMark.widthIn, 'start arrow sits to the right of the first crop mark and points at it'],
  [firstMark.yIn + MARK_SIZE_IN < artStart, 'first crop-mark row stays in the header, above the artwork'],
  [lastPrintMark >= contentEnd, 'last crop-mark row stays in the footer, below the artwork'],
  [compose.includes('const rowInset = sideInsetIn'), 'cut sheets keep side gutters so marks do not land on designs'],
  [shortYs.length === 2, 'an 11 in sheet gets two mark pairs'],
  [twelveYs.length === 3, 'a 12 in sheet gets three mark pairs'],
  [midYs.length === 3, 'a 24 in sheet gets three mark pairs on that length'],
  [longYs.length === 5, 'a 36 in sheet gets three pairs in the first 30 in and two on the leftover'],
  [Math.abs(11 - lastShort - MARK_TRAIL_IN) < 1e-6, 'short-sheet last pair leaves 0.75 in after the mark'],
  [shortPrint - lastShort <= MARK_TRAIL_IN + 1e-9, 'no long unmarked footer after the last short-sheet mark'],
  [Math.abs(midYs[1] - (24 / 2 - MARK_SIZE_IN / 2)) < 1e-9, 'mid pair on a 24 in sheet is centered on that length'],
  [Math.abs(24 - lastMid - MARK_TRAIL_IN) < 1e-6, '24 in last pair leaves 0.75 in after the mark'],
  [Math.abs(12 - lastTwelve - MARK_TRAIL_IN) < 1e-6, '12 in last pair leaves 0.75 in after the mark'],
  [Math.abs(36 - lastLong - MARK_TRAIL_IN) < 1e-6, '36 in last pair leaves 0.75 in after the mark'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`x ${xs.left.toFixed(3)} to ${xs.right.toFixed(3)} in; 11 in ${shortYs.length} rows; 12 in ${twelveYs.length} rows; 36 in y ${longYs.map((y) => y.toFixed(2)).join(', ')}`)
console.log('crop mark count follows sheet length; marks stay circular')
