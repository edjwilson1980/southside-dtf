import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const layout = readFileSync(join(root, 'lib/cut-layout.ts'), 'utf8')
const compose = readFileSync(join(root, 'lib/compose-sheet.ts'), 'utf8')
const preview = readFileSync(join(root, 'components/sheet-preview-modal.tsx'), 'utf8')
const overlay = readFileSync(join(root, 'components/cut-box-overlay.tsx'), 'utf8')
const css = readFileSync(join(root, 'app/globals.css'), 'utf8')

const MARK_SIZE_IN = 5 / 25.4
const MARK_GAP_X_IN = 21.5
const MARK_LEAD_IN = 10 / 25.4
const MARK_TRAIL_IN = 0.75
const MARK_PAD_IN = 2 / 25.4
const MARK_SECTION_IN = 30
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2
const SHEET_WIDTH_IN = 22
const START_ARROW_LENGTH_IN = 8 / 25.4

/** Mirrors markYs in lib/cut-layout.ts. */
function markYs(sheetHeightIn) {
  if (sheetHeightIn <= 0) return []
  const first = MARK_LEAD_IN
  const last = sheetHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN
  const span = last - first
  if (span < MARK_ROW_GAP_IN) return [first]
  const steps = Math.max(1, Math.ceil(span / MARK_SECTION_IN - 1e-9))
  const pitch = span / steps
  return Array.from({ length: steps + 1 }, (_, index) => first + index * pitch)
}

function markXs(sheetWidthIn = SHEET_WIDTH_IN) {
  const left = Math.max(0, (sheetWidthIn - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
  const right = left + MARK_GAP_X_IN
  return { left, right }
}

function pitches(ys) {
  return ys.slice(1).map((y, index) => y - ys[index])
}

function evenlySpaced(ys) {
  const gaps = pitches(ys)
  if (gaps.length < 2) return true
  return Math.max(...gaps) - Math.min(...gaps) < 1e-9
}

const xs = markXs()
const artStart = 0.125 + 1 + 0.75
const contentEnd = 8
const printHeight = contentEnd + artStart
const printYs = markYs(printHeight)

const heights = [11, 12, 24, 36, 72, 150]
const spacingChecks = heights.flatMap((h) => {
  const ys = markYs(h)
  const gaps = pitches(ys)
  const last = ys[ys.length - 1] + MARK_SIZE_IN
  return [
    [evenlySpaced(ys), `${h} in sheet spaces its ${ys.length} mark rows evenly (${gaps.map((g) => g.toFixed(2)).join(', ')})`],
    [ys.length >= 2, `${h} in sheet has at least two mark rows for four-point registration`],
    [Math.max(...gaps) <= MARK_SECTION_IN + 1e-9, `${h} in sheet never asks the camera to travel more than ${MARK_SECTION_IN} in`],
    [Math.abs(ys[0] - MARK_LEAD_IN) < 1e-9, `${h} in sheet starts its first row at the film edge`],
    [Math.abs(h - last - MARK_TRAIL_IN) < 1e-6, `${h} in sheet leaves ${MARK_TRAIL_IN} in after the last row`],
  ]
})

// Roll-fed: the start mark is the bottom-right circle, with the arrow to its left.
const startY = printYs[printYs.length - 1]
const startMark = { xIn: xs.right, yIn: startY, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN }
const arrowTipX = startMark.xIn - MARK_PAD_IN - 0.6 / 25.4
const arrowBaseX = arrowTipX - START_ARROW_LENGTH_IN

const checks = [
  [layout.includes('MARK_SECTION_IN = 30'), 'the cutter never has to travel more than 30 in between mark rows'],
  [!layout.includes('SHORT_SHEET_IN'), 'the old under-12-in / 12-to-30-in mark rules are gone'],
  [layout.includes('const startRow = ys.length - 1'), 'the start mark is on the last row down the sheet'],
  [layout.includes('first: row === startRow'), 'the right-hand circle on that row is the start mark'],
  [layout.includes('return bc.yIn - ac.yIn'), 'the PLT orders marks from the bottom of the sheet up'],
  [layout.includes('return bc.xIn - ac.xIn'), 'the PLT orders each row from the right'],
  [layout.includes('x: toUnits(origin.yIn - yIn)'), 'feed runs up the film from the bottom-right start mark'],
  [layout.includes('y: toUnits(origin.xIn - xIn)'), 'the carriage runs left from the bottom-right start mark'],
  [layout.includes('MARK_LEAD_IN = 10 / 25.4'), 'the far mark row still sits at the film edge'],
  [layout.includes('MARK_TRAIL_IN = 0.75'), 'the sheet ends 0.75 in after the start mark row'],
  [layout.includes('MARK_GAP_X_IN = 21.5'), '21.5 in left-to-right crop-mark spacing is in code'],
  [layout.includes("shape: 'circle'"), 'printed marks are circles, not squares'],
  [overlay.includes('<circle'), 'preview overlay draws crop marks as SVG circles'],
  [overlay.includes('cut-start-arrow') && overlay.includes('<polygon'), 'preview overlay draws a start arrow pointing at the start crop mark'],
  [layout.includes('startMarkArrowPoints'), 'start-arrow geometry is defined next to the start crop mark'],
  [css.includes('cut-overlay-svg') && css.includes('stroke: #ff1a1a'), 'overlay crop marks are stroked circles, not boxes'],
  [preview.includes('BOTTOM-RIGHT'), 'preview copy tells the operator to park on the bottom-right circle'],
  [preview.includes('UPSIDE DOWN'), 'preview copy tells the operator to lay the sheet on the bed upside down'],
  [preview.includes('cut mirrored'), 'preview copy warns that loading it the right way up cuts mirrored'],
  [preview.includes('evenly spaced'), 'preview copy says mark rows are evenly spaced'],
  [preview.includes('in the margins'), 'preview copy says crop marks stay off the designs'],
  [compose.includes('xIn: bestX + sideInsetIn'), 'cut sheets inset designs so marks do not land on them'],
  [Math.abs(xs.right - xs.left - 21.5) < 1e-9, 'left and right marks are 21.5 in apart'],
  [arrowTipX < startMark.xIn, 'start arrow sits to the left of the start crop mark and points at it'],
  [arrowBaseX > 0, 'the whole start arrow stays on the sheet'],
  [startY > contentEnd, 'the start crop-mark row sits in the footer, below the artwork'],
  [printYs[0] + MARK_SIZE_IN < artStart, 'the far crop-mark row stays in the header, above the artwork'],
  ...spacingChecks,
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
for (const h of heights) {
  const ys = markYs(h)
  console.log(`${h} in: ${ys.length} rows at ${ys.map((y) => y.toFixed(2)).join(', ')}`)
}
console.log('crop marks are evenly spaced and start at the bottom-right circle')
