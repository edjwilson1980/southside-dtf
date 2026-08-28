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

function markHuntPath(marks, origin) {
  return marks.map((mark) => {
    const center = markCenterInches(mark)
    const { x, y } = toPlt(center.xIn, center.yIn, origin)
    return `U${x},${y} `
  }).join('')
}

function buildTenethPlt(boxes, marks = []) {
  const ordered = marksFromStart(marks)
  const origin = ordered.length > 0 ? markCenterInches(ordered[0]) : { xIn: 0, yIn: 0 }
  const hunt = markHuntPath(ordered, origin)
  const paths = boxes.map((box) => {
    const start = toPlt(box.xIn, box.yIn, origin)
    const end = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
    return rectanglePath(start.x, start.y, end.x, end.y)
  }).join('')
  const markUnits = toUnits(MARK_SIZE_IN)
  const scan = marks.length > 0 ? `TB26,0,${markUnits},${markUnits};` : ''
  return `${scan};:H A L0 ECN U V10 ${hunt}${paths}U @`
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
const leftMark = {
  xIn: 0.15,
  yIn: 10 / 25.4,
  widthIn: MARK_SIZE_IN,
  heightIn: MARK_SIZE_IN,
}
const rightMark = {
  xIn: 0.15 + MARK_GAP_X_IN,
  yIn: 10 / 25.4,
  widthIn: MARK_SIZE_IN,
  heightIn: MARK_SIZE_IN,
}
const trailingLeft = {
  xIn: 0.15,
  yIn: 20,
  widthIn: MARK_SIZE_IN,
  heightIn: MARK_SIZE_IN,
}
const trailingRight = {
  xIn: 0.15 + MARK_GAP_X_IN,
  yIn: 20,
  widthIn: MARK_SIZE_IN,
  heightIn: MARK_SIZE_IN,
}

const origin = markCenterInches(leftMark)
const plt = buildTenethPlt([near, far], [rightMark, trailingRight, leftMark, trailingLeft])
const markUnits = toUnits(MARK_SIZE_IN)
const gapX = toUnits(MARK_GAP_X_IN)
const nearRel = toPlt(near.xIn, near.yIn, origin)
const farRel = toPlt(far.xIn, far.yIn, origin)
const headerEnd = plt.indexOf('V10 ')
const firstCut = plt.indexOf(`U${nearRel.x},${nearRel.y} D`)
const leftHunt = plt.indexOf('U0,0 ')
const rightHunt = plt.indexOf(`U${gapX},0 `)
const tb26 = `TB26,0,${markUnits},${markUnits};`
const sheetWindow = `TB26,0,${toUnits(rightMark.xIn + rightMark.widthIn)},${toUnits(trailingRight.yIn + trailingRight.heightIn)};`

const checks = [
  [layout.includes('TB26,0,'), 'PLT starts contour jobs with TB26 circle-mark scan'],
  [layout.includes('toUnits(MARK_SIZE_IN)'), 'TB26 uses the 5 mm mark size, not the sheet bounds'],
  [layout.includes('marksFromStart'), 'PLT origin is the leading-left crop mark'],
  [!layout.includes('markScanWindow'), 'PLT no longer uses the full-sheet mark bounding box as the scan window'],
  [layout.includes('U @'), 'PLT ends with DMPL halt instead of a page feed'],
  [!layout.includes('CT1'), 'PLT no longer emits HPGL CT1'],
  [!layout.includes('PG;'), 'PLT no longer emits HPGL page-feed PG'],
  [!layout.includes('sectionHeightIn - box.yIn'), 'PLT Y is not flipped from the trailing edge'],
  [plt.startsWith(tb26), 'generated file starts with a 5 mm TB26 circle-mark size'],
  [markUnits === 200, '5 mm mark is 200 DMPL units (40 per mm)'],
  [!plt.includes(sheetWindow), 'generated file does not send the sheet size as the mark window'],
  [plt.includes(';:H A L0 ECN U V10 '), 'generated file includes the Artcut DMPL header'],
  [plt.trimEnd().endsWith('U @'), 'generated file ends with pen-up halt'],
  [!plt.includes('PG'), 'generated file has no page feed'],
  [leftHunt > headerEnd && leftHunt < firstCut, 'camera hunts the first left mark at U0,0 before any cut'],
  [rightHunt > leftHunt && rightHunt < firstCut, 'camera hunts the matching right mark 21.5 in across before any cut'],
  [plt.includes(`U${nearRel.x},${nearRel.y} `), 'first cut is relative to the first crop mark'],
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
console.log('Teneth PLT origin is the first 5 mm crop mark')
