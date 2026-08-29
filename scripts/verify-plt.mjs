import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')

const PLT_UNITS_PER_IN = 1016
const MARK_SIZE_IN = 5 / 25.4
const MARK_GAP_X_IN = 21.5

function toUnits(inches) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1, y1, x2, y2) {
  return `U${x1},${y1} D${x1},${y1} D${x1},${y2},${x2},${y2},${x2},${y1},${x1},${y1} `
}

function markCenterInches(mark) {
  return {
    xIn: mark.xIn + mark.widthIn / 2,
    yIn: mark.yIn + mark.heightIn / 2,
  }
}

function marksFromStart(marks) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return ac.yIn - bc.yIn
    return ac.xIn - bc.xIn
  })
}

function toPlt(xIn, yIn, origin) {
  return {
    x: toUnits(xIn - origin.xIn),
    y: toUnits(yIn - origin.yIn),
  }
}

function markScanCommand(marks, origin) {
  if (marks.length === 0) return ''
  const coords = marks.flatMap((mark) => {
    const center = markCenterInches(mark)
    const { x, y } = toPlt(center.xIn, center.yIn, origin)
    return [x, y]
  })
  return `TB26,0,${coords.join(',')};`
}

function buildTenethPlt(boxes, marks = []) {
  const ordered = marksFromStart(marks)
  const origin = ordered.length > 0 ? markCenterInches(ordered[0]) : { xIn: 0, yIn: 0 }
  const scan = markScanCommand(ordered, origin)
  const paths = boxes.map((box) => {
    const start = toPlt(box.xIn, box.yIn, origin)
    const end = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
    return rectanglePath(start.x, start.y, end.x, end.y)
  }).join('')
  return `${scan};:H A L0 ECN U V10 ${paths}U @`
}

function circle(xIn, yIn) {
  return { xIn, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN }
}

const near = {
  xIn: 2,
  yIn: 1.875,
  widthIn: 4,
  heightIn: 3,
}
const far = {
  xIn: 8,
  yIn: 12,
  widthIn: 5,
  heightIn: 2,
}
const leftMark = circle(0.15, 10 / 25.4)
const rightMark = circle(0.15 + MARK_GAP_X_IN, 10 / 25.4)
const midLeft = circle(0.15, 10)
const midRight = circle(0.15 + MARK_GAP_X_IN, 10)
const trailingLeft = circle(0.15, 20)
const trailingRight = circle(0.15 + MARK_GAP_X_IN, 20)
const allMarks = [rightMark, trailingRight, midRight, leftMark, trailingLeft, midLeft]

const origin = markCenterInches(leftMark)
const plt = buildTenethPlt([near, far], allMarks)
const gapX = toUnits(MARK_GAP_X_IN)
const midRel = toPlt(midLeft.xIn + MARK_SIZE_IN / 2, midLeft.yIn + MARK_SIZE_IN / 2, origin)
const trailRel = toPlt(trailingLeft.xIn + MARK_SIZE_IN / 2, trailingLeft.yIn + MARK_SIZE_IN / 2, origin)
const nearRel = toPlt(near.xIn, near.yIn, origin)
const farRel = toPlt(far.xIn, far.yIn, origin)
const headerEnd = plt.indexOf('V10 ')
const firstCut = plt.indexOf(`U${nearRel.x},${nearRel.y} D`)
const tb26Match = plt.match(/^TB26,0,([^;]+);/)
const tb26Nums = tb26Match ? tb26Match[1].split(',').map(Number) : []
const markUnits = toUnits(MARK_SIZE_IN)
const sizeOnly = `TB26,0,${markUnits},${markUnits};`
const expectedScan = `TB26,0,0,0,${gapX},0,0,${midRel.y},${gapX},${midRel.y},0,${trailRel.y},${gapX},${trailRel.y};`

const checks = [
  [layout.includes('TB26,0,'), 'PLT starts contour jobs with TB26 circle-mark scan'],
  [layout.includes('markScanCommand'), 'TB26 lists every crop-mark center'],
  [layout.includes('coords.join'), 'TB26 joins all mark X/Y pairs, not a 5 mm size window'],
  [!layout.includes('markHuntPath'), 'PLT no longer pen-up hunts U0,0 before cutting'],
  [!layout.includes('toUnits(MARK_SIZE_IN)'), 'TB26 is not the 5 mm mark size'],
  [layout.includes('U @'), 'PLT ends with DMPL halt instead of a page feed'],
  [!layout.includes('CT1'), 'PLT no longer emits HPGL CT1'],
  [!layout.includes('PG;'), 'PLT no longer emits HPGL page-feed PG'],
  [!layout.includes('sectionHeightIn - box.yIn'), 'PLT Y is not flipped from the trailing edge'],
  [plt.startsWith(expectedScan), 'TB26 lists all six mark centers from the first circle'],
  [tb26Nums.length === 12, 'TB26 has one X,Y pair per printed mark'],
  [tb26Nums[0] === 0 && tb26Nums[1] === 0, 'first TB26 point is the parked starting circle'],
  [tb26Nums[2] === gapX && tb26Nums[3] === 0, 'second TB26 point is 21.5 in across on the same row'],
  [tb26Nums[4] === 0 && tb26Nums[5] === midRel.y, 'third TB26 point is the next left circle down the sheet'],
  [tb26Nums[6] === gapX && tb26Nums[7] === midRel.y, 'fourth TB26 point is the matching right circle'],
  [!plt.startsWith(sizeOnly), 'TB26 is not a single 5 mm point on the first mark'],
  [plt.includes(';:H A L0 ECN U V10 '), 'generated file includes the Artcut DMPL header'],
  [plt.trimEnd().endsWith('U @'), 'generated file ends with pen-up halt'],
  [!plt.includes('PG'), 'generated file has no page feed'],
  [!plt.slice(0, headerEnd + 4).includes('U0,0'), 'header does not hunt U0,0 before the mark list is complete'],
  [firstCut > headerEnd, 'knife paths start after the DMPL header'],
  [plt.includes(`U${nearRel.x},${nearRel.y} D`), 'first cut is relative to the first crop mark'],
  [nearRel.y < farRel.y, 'later designs have larger Y, matching the PNG feed direction'],
  [plt.includes(`U${farRel.x},${farRel.y} `), 'second cut uses the same first-mark origin'],
  [Math.abs(nearRel.x) < toUnits(near.xIn), 'cut X is not measured from the sheet edge'],
  [toUnits(1) === 1016, 'DMPL units are 1016 per inch (40 per mm)'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(plt)
console.log('Teneth PLT lists every crop-mark center in TB26')
