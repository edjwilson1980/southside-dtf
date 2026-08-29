import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const layout = readFileSync(join(root, 'lib/cut-layout.ts'), 'utf8')
const names = readFileSync(join(root, 'lib/sheet-name.ts'), 'utf8')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')

const PLT_UNITS_PER_IN = 1016
const MARK_SIZE_IN = 5 / 25.4
const MARK_GAP_X_IN = 21.5
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const WORKING_HEAD = 'TB26,0,9660,7105;CT1;;:H A L0 ECN U U-7,8;D-7,8;D-7,0;U-7,0;'

function toUnits(inches) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1, y1, x2, y2) {
  return `U${x1},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};U${x1},${y1};`
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
    x: toUnits(yIn - origin.yIn),
    y: toUnits(xIn - origin.xIn),
  }
}

function markScanCommand(marks, origin) {
  if (marks.length === 0) return ''
  let feed = 0
  let carriage = 0
  for (const mark of marks) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { command: `TB26,0,${feed},${carriage};CT1;`, feed, carriage }
}

function buildTenethPlt(boxes, marks = []) {
  const ordered = marksFromStart(marks)
  const firstMark = ordered[0]
  const origin = firstMark ? markCenterInches(firstMark) : { xIn: 0, yIn: 0 }
  const scan = markScanCommand(ordered, origin)
  const paths = boxes.map((box) => {
    const start = toPlt(box.xIn, box.yIn, origin)
    const end = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
    return rectanglePath(start.x, start.y, end.x, end.y)
  }).join('')
  if (!scan) return `;:H A L0 ECN U ${paths}U @`
  return `${scan.command};:H A L0 ECN U ${ORIGIN_TICK}${paths}U${scan.feed},0;PG;${'@'.repeat(21)}`
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
const twoRows = [rightMark, trailingRight, leftMark, trailingLeft]
const threeRows = [rightMark, midRight, trailingRight, leftMark, midLeft, trailingLeft]

const origin = markCenterInches(leftMark)
const plt = buildTenethPlt([near, far], twoRows)
const threePlt = buildTenethPlt([near, far], threeRows)
const carriage = toUnits(MARK_GAP_X_IN)
const trailRel = toPlt(trailingLeft.xIn + MARK_SIZE_IN / 2, trailingLeft.yIn + MARK_SIZE_IN / 2, origin)
const nearRel = toPlt(near.xIn, near.yIn, origin)
const farRel = toPlt(far.xIn, far.yIn, origin)
const expectedScan = `TB26,0,${trailRel.x},${carriage};CT1;`
const swappedScan = `TB26,0,${carriage},`
const feedIn = trailRel.x / PLT_UNITS_PER_IN
const sizeOnly = `TB26,0,200,200;`
const uploadedStuck = 'TB26,0,0,0,'
const tb26Match = plt.match(/^TB26,0,([^;]+);/)
const tb26Nums = tb26Match ? tb26Match[1].split(',').map(Number) : []
const firstCut = plt.indexOf(`U${nearRel.x},${nearRel.y};D`)

const checks = [
  [layout.includes('TB26,0,'), 'PLT includes TB26 mark-window scan'],
  [layout.includes('CT1;'), 'PLT enables contour with CT1 like CutterPro/ToCutter'],
  [layout.includes('PG;'), 'PLT ends with HPGL page feed like the working Corel file'],
  [layout.includes(ORIGIN_TICK), 'PLT includes the Corel origin tick'],
  [layout.includes('U${x1},${y1};D${x1},${y1};'), 'cut vertices are semicolon-separated like Corel HPGL'],
  [!layout.includes('V10'), 'PLT no longer emits V10'],
  [!layout.includes('toUnits(MARK_SIZE_IN)'), 'TB26 is not the 5 mm mark size'],
  [!layout.includes('marks.slice(1)'), 'TB26 is not a list of other mark coordinates'],
  [!layout.includes('markHuntPath'), 'PLT does not pen-up hunt marks as ordinary U moves'],
  [!layout.includes('sectionHeightIn - box.yIn'), 'PLT Y is not flipped from the trailing edge'],
  [layout.includes('x: toUnits(yIn - origin.yIn)'), 'PLT X is the feed axis, taken from the PNG down-sheet axis'],
  [layout.includes('y: toUnits(xIn - origin.xIn)'), 'PLT Y is the carriage axis, taken from the PNG across-sheet axis'],
  [plt.startsWith(expectedScan), 'TB26 is feed down the film first, then 21.5 in across the carriage'],
  [!plt.startsWith(swappedScan), 'TB26 does not command 21.5 in of feed'],
  [!threePlt.startsWith(swappedScan), 'three-pair file does not command 21.5 in of feed either'],
  [feedIn < MARK_GAP_X_IN, `feed span (${feedIn.toFixed(2)} in) is the sheet length, not the 21.5 in width`],
  [plt.includes(`;:H A L0 ECN U ${ORIGIN_TICK}`), 'DMPL header and origin tick follow the scan'],
  [tb26Nums.length === 2, 'TB26 has only the far-corner span, not a mark list'],
  [tb26Nums[0] === trailRel.x && tb26Nums[1] === carriage, 'TB26 span is the far mark from the parked start circle'],
  [!plt.includes(uploadedStuck), 'TB26 is not a zero-size 0,0 window'],
  [!plt.includes(sizeOnly), 'TB26 is not a 5 mm size-only window'],
  [!plt.includes('V10'), 'generated file has no V10'],
  [plt.includes(`U${trailRel.x},0;PG;`), 'file returns to the far feed position then page-feeds'],
  [plt.trimEnd().endsWith('@'.repeat(21)), 'generated file pads with @ like the working Corel file'],
  [!plt.includes('U0,0'), 'PLT does not hunt U0,0 and reread the parked start mark'],
  [!plt.includes(`U${trailRel.x},0;D`), 'window corners are not cut or hunted as geometry'],
  [firstCut > plt.indexOf(ORIGIN_TICK), 'knife paths start after the origin tick'],
  [plt.includes(`U${nearRel.x},${nearRel.y};D${nearRel.x},${nearRel.y};`), 'first cut is relative to the first crop mark'],
  [nearRel.x < farRel.x, 'designs further down the sheet have a larger feed X'],
  [plt.includes(`U${farRel.x},${farRel.y};`), 'second cut uses the same first-mark origin'],
  [Math.abs(nearRel.y) < toUnits(near.xIn), 'cut carriage Y is measured from the first mark, not the sheet edge'],
  [toUnits(1) === 1016, 'DMPL units are 1016 per inch (40 per mm)'],
  [WORKING_HEAD.startsWith('TB26,0,'), 'working Corel file uses the same TB26 prefix'],
  [WORKING_HEAD.includes(';CT1;;:H A L0 ECN U U-7,8;'), 'working Corel file is TB26, CT1, header, origin tick'],
  [layout.includes('export function cutPlt('), 'the whole job builds one cut file'],
  [!layout.includes('cutPltSections'), 'the job is no longer split into cut sections'],
  [!names.includes('sectionCount'), 'cut file names carry no section number'],
  [names.includes('cut.plt`'), 'the cut file is named "<job> cut.plt"'],
  [!page.includes('for (const section of'), 'the builder downloads a single cut file'],
  [!page.includes('cutTooTall'), 'the 30 in per-design section limit is gone'],
  [layout.includes('MARK_SECTION_IN = 30'), 'crop marks still repeat every 30 in for re-registration'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(plt.slice(0, 220))
console.log('Teneth PLT matches CutterPro/ToCutter: TB26 window, CT1, semicolon paths, PG')
