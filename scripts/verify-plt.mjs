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

function markScanCommand() {
  const markUnits = toUnits(MARK_SIZE_IN)
  return `TB26,0,${markUnits},${markUnits};`
}

function markHuntPath(marks, origin) {
  return marks.slice(1).map((mark) => {
    const center = markCenterInches(mark)
    const { x, y } = toPlt(center.xIn, center.yIn, origin)
    return `U${x},${y} `
  }).join('')
}

function buildTenethPlt(boxes, marks = []) {
  const ordered = marksFromStart(marks)
  const origin = ordered.length > 0 ? markCenterInches(ordered[0]) : { xIn: 0, yIn: 0 }
  const scan = ordered.length > 0 ? markScanCommand() : ''
  const hunt = markHuntPath(ordered, origin)
  const paths = boxes.map((box) => {
    const start = toPlt(box.xIn, box.yIn, origin)
    const end = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
    return rectanglePath(start.x, start.y, end.x, end.y)
  }).join('')
  return `;:H A L0 ECN U V10 ${scan}${hunt}${paths}U @`
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
const trailingLeft = circle(0.15, 20)
const trailingRight = circle(0.15 + MARK_GAP_X_IN, 20)
const allMarks = [rightMark, trailingRight, leftMark, trailingLeft]

const origin = markCenterInches(leftMark)
const plt = buildTenethPlt([near, far], allMarks)
const markUnits = toUnits(MARK_SIZE_IN)
const gapX = toUnits(MARK_GAP_X_IN)
const trailRel = toPlt(trailingLeft.xIn + MARK_SIZE_IN / 2, trailingLeft.yIn + MARK_SIZE_IN / 2, origin)
const nearRel = toPlt(near.xIn, near.yIn, origin)
const farRel = toPlt(far.xIn, far.yIn, origin)
const header = ';:H A L0 ECN U V10 '
const scan = `TB26,0,${markUnits},${markUnits};`
const rightHunt = `U${gapX},0 `
const trailLeftHunt = `U0,${trailRel.y} `
const trailRightHunt = `U${gapX},${trailRel.y} `
const headerEnd = plt.indexOf('V10 ')
const scanAt = plt.indexOf(scan)
const firstCut = plt.indexOf(`U${nearRel.x},${nearRel.y} D`)
const rightHuntAt = plt.indexOf(rightHunt)
const uploadedStuck = 'TB26,0,0,0,'

const checks = [
  [layout.includes('TB26,0,'), 'PLT includes TB26 circle-mark scan'],
  [layout.includes('toUnits(MARK_SIZE_IN)'), 'TB26 is the 5 mm mark size, not mark positions'],
  [layout.includes('marks.slice(1)'), 'camera hunts every mark after the parked start circle'],
  [layout.includes('markHuntPath'), 'PLT pen-up visits remaining crop marks before cutting'],
  [!layout.includes('coords.join'), 'TB26 no longer lists mark X/Y pairs as if they were the scan window'],
  [layout.includes('U @'), 'PLT ends with DMPL halt instead of a page feed'],
  [!layout.includes('CT1'), 'PLT no longer emits HPGL CT1'],
  [!layout.includes('PG;'), 'PLT no longer emits HPGL page-feed PG'],
  [!layout.includes('sectionHeightIn - box.yIn'), 'PLT Y is not flipped from the trailing edge'],
  [plt.startsWith(header), 'generated file starts with the Artcut DMPL header, not TB26'],
  [scanAt > headerEnd, '5 mm TB26 scan comes after init so Home does not cancel it'],
  [markUnits === 200, '5 mm mark is 200 DMPL units (40 per mm)'],
  [!plt.includes(uploadedStuck), 'TB26 is not a zero-size 0,0 window that leaves the head stuck'],
  [plt.includes(scan), 'TB26 asks the camera for a 5 mm circle'],
  [plt.trimEnd().endsWith('U @'), 'generated file ends with pen-up halt'],
  [!plt.includes('PG'), 'generated file has no page feed'],
  [!plt.includes('U0,0 '), 'PLT does not hunt U0,0 and reread the parked start mark'],
  [rightHuntAt > scanAt && rightHuntAt < firstCut, 'camera moves 21.5 in to the right mark before any cut'],
  [plt.includes(trailLeftHunt) && plt.indexOf(trailLeftHunt) < firstCut, 'camera hunts the next left mark down the sheet before cutting'],
  [plt.includes(trailRightHunt) && plt.indexOf(trailRightHunt) < firstCut, 'camera hunts the matching right mark on that row before cutting'],
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
console.log('Teneth PLT uses a 5 mm TB26 window then hunts the remaining crop marks')
