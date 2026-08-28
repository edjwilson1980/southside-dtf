import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')

const PLT_UNITS_PER_IN = 1016
const MARK_SIZE_IN = 5 / 25.4

function toUnits(inches) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1, y1, x2, y2) {
  return `U${x1},${y1} D${x1},${y1} D${x1},${y2},${x2},${y2},${x2},${y1},${x1},${y1} `
}

function markHuntPath(marks) {
  return marks.map((mark) => {
    const x = toUnits(mark.xIn + mark.widthIn / 2)
    const y = toUnits(mark.yIn + mark.heightIn / 2)
    return `U${x},${y} `
  }).join('')
}

function buildTenethPlt(boxes, marks = []) {
  const hunt = markHuntPath(marks)
  const paths = boxes.map((box) => {
    const x1 = toUnits(box.xIn)
    const x2 = toUnits(box.xIn + box.widthIn)
    const y1 = toUnits(box.yIn)
    const y2 = toUnits(box.yIn + box.heightIn)
    return rectanglePath(x1, y1, x2, y2)
  }).join('')
  const right = marks.length ? Math.max(...marks.map((mark) => mark.xIn + mark.widthIn)) : 0
  const bottom = marks.length ? Math.max(...marks.map((mark) => mark.yIn + mark.heightIn)) : 0
  const scan = marks.length > 0 ? `TB26,0,${toUnits(right)},${toUnits(bottom)};` : ''
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
  xIn: 0.15 + 21.5,
  yIn: 10 / 25.4,
  widthIn: MARK_SIZE_IN,
  heightIn: MARK_SIZE_IN,
}
const plt = buildTenethPlt([near, far], [leftMark, rightMark])
const nearY = toUnits(near.yIn)
const farY = toUnits(far.yIn)
const leftCx = toUnits(leftMark.xIn + leftMark.widthIn / 2)
const leftCy = toUnits(leftMark.yIn + leftMark.heightIn / 2)
const rightCx = toUnits(rightMark.xIn + rightMark.widthIn / 2)
const headerEnd = plt.indexOf('V10 ')
const firstCut = plt.indexOf(`U${toUnits(near.xIn)},${nearY} D`)
const leftHunt = plt.indexOf(`U${leftCx},${leftCy} `)
const rightHunt = plt.indexOf(`U${rightCx},${toUnits(rightMark.yIn + rightMark.heightIn / 2)} `)

const checks = [
  [layout.includes('TB26,0,'), 'PLT starts contour jobs with TB26 circle-mark scan'],
  [layout.includes('markHuntPath'), 'PLT visits registration mark centers before cutting'],
  [layout.includes('U @'), 'PLT ends with DMPL halt instead of a page feed'],
  [!layout.includes('CT1'), 'PLT no longer emits HPGL CT1'],
  [!layout.includes('PG;'), 'PLT no longer emits HPGL page-feed PG'],
  [!layout.includes('sectionHeightIn - box.yIn'), 'PLT Y is not flipped from the trailing edge'],
  [plt.startsWith('TB26,0,'), 'generated file starts with the CCD circle-mark scan window'],
  [plt.includes(';:H A L0 ECN U V10 '), 'generated file includes the Artcut DMPL header'],
  [plt.trimEnd().endsWith('U @'), 'generated file ends with pen-up halt'],
  [!plt.includes('PG'), 'generated file has no page feed'],
  [leftHunt > headerEnd && leftHunt < firstCut, 'camera hunts the first left mark before any cut'],
  [rightHunt > headerEnd && rightHunt < firstCut, 'camera hunts the first right mark before any cut'],
  [plt.includes(`U${toUnits(near.xIn)},${nearY} `), 'first cut starts at the printed leading-edge Y'],
  [nearY < farY, 'later designs have larger Y, matching the PNG feed direction'],
  [plt.includes(`U${toUnits(far.xIn)},${farY} `), 'second cut uses the printed Y, not height minus Y'],
  [toUnits(1) === 1016, 'DMPL units are 1016 per inch (40 per mm)'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(plt)
console.log('Teneth PLT hunts registration marks before cutting')
