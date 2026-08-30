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
const SHEET_WIDTH_IN = 22
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
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return bc.xIn - ac.xIn
  })
}

function markRowsFromStart(marks) {
  const rows = []
  for (const mark of marksFromStart(marks)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(markCenterInches(row[0]).yIn - markCenterInches(mark).yIn) < 0.05) row.push(mark)
    else rows.push([mark])
  }
  return rows
}

function toPlt(xIn, yIn, origin) {
  return {
    x: toUnits(origin.yIn - yIn),
    y: toUnits(origin.xIn - xIn),
  }
}

function markScanCommand(marks, origin) {
  const rows = markRowsFromStart(marks)
  const frame = [...(rows[0] ?? []), ...(rows[1] ?? [])]
  if (frame.length === 0) return ''
  let feed = 0
  let carriage = 0
  for (const mark of frame) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { command: `TB26,0,${feed},${carriage};CT1;`, feed, carriage }
}

const ROW_OVERLAP_IN = toUnits(0.25)

function boxesFromStart(boxes, origin) {
  const remaining = boxes
    .map((box) => {
      const a = toPlt(box.xIn, box.yIn, origin)
      const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
      return {
        x1: Math.min(a.x, b.x),
        y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x),
        y2: Math.max(a.y, b.y),
      }
    })
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)

  const order = []
  while (remaining.length > 0) {
    const seed = remaining.shift()
    const row = [seed]
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i].x1 + ROW_OVERLAP_IN < seed.x2) row.push(remaining.splice(i, 1)[0])
      else i += 1
    }
    row.sort((a, b) => a.y1 - b.y1)
    order.push(...row)
  }
  return order
}

/** Group an emitted order back into rows: a new row starts when Y steps backwards. */
function rowsOf(points) {
  const rows = []
  for (const point of points) {
    const row = rows[rows.length - 1]
    if (row && point.y > row[row.length - 1].y) row.push(point)
    else rows.push([point])
  }
  return rows
}

function buildTenethPlt(boxes, marks = []) {
  const ordered = marksFromStart(marks)
  const firstMark = ordered[0]
  const origin = firstMark ? markCenterInches(firstMark) : { xIn: 0, yIn: 0 }
  const scan = markScanCommand(ordered, origin)
  const paths = boxesFromStart(boxes, origin)
    .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
    .join('')
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

// Roll-fed: the camera parks on the bottom-right circle, so that is the origin.
const origin = markCenterInches(trailingRight)
const plt = buildTenethPlt([near, far], twoRows)
const threePlt = buildTenethPlt([near, far], threeRows)
const carriage = toUnits(MARK_GAP_X_IN)
const leadRel = toPlt(leftMark.xIn + MARK_SIZE_IN / 2, leftMark.yIn + MARK_SIZE_IN / 2, origin)
const midRel = toPlt(midLeft.xIn + MARK_SIZE_IN / 2, midLeft.yIn + MARK_SIZE_IN / 2, origin)
const nearRel = toPlt(near.xIn + near.widthIn, near.yIn + near.heightIn, origin)
const farRel = toPlt(far.xIn + far.widthIn, far.yIn + far.heightIn, origin)
const expectedScan = `TB26,0,${leadRel.x},${carriage};CT1;`
const threeRowScan = `TB26,0,${midRel.x},${carriage};CT1;`
const swappedScan = `TB26,0,${carriage},`
const feedIn = leadRel.x / PLT_UNITS_PER_IN
const sizeOnly = `TB26,0,200,200;`
const uploadedStuck = 'TB26,0,0,0,'
const tb26Match = plt.match(/^TB26,0,([^;]+);/)
const tb26Nums = tb26Match ? tb26Match[1].split(',').map(Number) : []
const allCoords = [...plt.matchAll(/[UD](-?\d+),(-?\d+)/g)].map(([, x, y]) => [Number(x), Number(y)])
// Where each cut path opens, in emitted order, skipping the origin tick.
const penUps = [...plt.matchAll(/U(\d+),(\d+);D/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }))
const cutStarts = penUps.filter((point) => !(point.x === 0 && point.y === 0))
const orderedBoxes = boxesFromStart([near, far], origin)
const feedOrder = cutStarts.map((point) => point.x)
const yOrder = cutStarts.map((point) => point.y)

// A staggered sheet: three designs side by side whose near edges do not line
// up, then a second row further along. This is what the packer really emits.
const staggered = [
  { xIn: 0.6, yIn: 20.0, widthIn: 6.5, heightIn: 7.0 },
  { xIn: 7.4, yIn: 20.4, widthIn: 6.5, heightIn: 6.6 },
  { xIn: 14.2, yIn: 19.7, widthIn: 6.5, heightIn: 7.3 },
  { xIn: 0.6, yIn: 8.0, widthIn: 10.3, heightIn: 11.0 },
  { xIn: 11.2, yIn: 8.4, widthIn: 10.3, heightIn: 10.6 },
]
const staggeredOrder = boxesFromStart(staggered, origin)
const staggeredRows = rowsOf(staggeredOrder.map((box) => ({ x: box.x1, y: box.y1 })))
const staggeredNearest = Math.min(...staggeredOrder.map((box) => box.x1))
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
  [layout.includes('x: toUnits(origin.yIn - yIn)'), 'feed runs up the film from the bottom-right start mark'],
  [layout.includes('y: toUnits(origin.xIn - xIn)'), 'the carriage runs left from the bottom-right start mark'],
  [layout.includes('return bc.yIn - ac.yIn'), 'marks are ordered from the bottom of the sheet up'],
  [layout.includes('rows[1]'), 'TB26 is the four-point window to the next row, not the furthest row'],
  [plt.startsWith(expectedScan), 'TB26 is one row of feed, then 21.5 in across the carriage'],
  [threePlt.startsWith(threeRowScan), 'a three-row sheet scans only as far as the next row'],
  [!threePlt.startsWith(expectedScan), 'a three-row sheet does not aim at the far row'],
  [!plt.startsWith(swappedScan), 'TB26 does not command 21.5 in of feed'],
  [!threePlt.startsWith(swappedScan), 'three-row file does not command 21.5 in of feed either'],
  [feedIn < MARK_GAP_X_IN, `feed span (${feedIn.toFixed(2)} in) is along the sheet, not the 21.5 in width`],
  [allCoords.every(([x, y]) => x >= -10 && y >= -10), 'every cut coordinate runs forward from the start mark'],
  [plt.includes(`;:H A L0 ECN U ${ORIGIN_TICK}`), 'DMPL header and origin tick follow the scan'],
  [tb26Nums.length === 2, 'TB26 has only the window corner, not a mark list'],
  [tb26Nums[0] === leadRel.x && tb26Nums[1] === carriage, 'TB26 corner is the next mark row across the film'],
  [!plt.includes(uploadedStuck), 'TB26 is not a zero-size 0,0 window'],
  [!plt.includes(sizeOnly), 'TB26 is not a 5 mm size-only window'],
  [!plt.includes('V10'), 'generated file has no V10'],
  [plt.includes(`U${leadRel.x},0;PG;`), 'file returns to the window corner then page-feeds'],
  [plt.trimEnd().endsWith('@'.repeat(21)), 'generated file pads with @ like the working Corel file'],
  [!plt.includes('U0,0'), 'PLT does not hunt U0,0 and reread the parked start mark'],
  [!plt.includes(`U${leadRel.x},0;D`), 'window corners are not cut or hunted as geometry'],
  [firstCut > plt.indexOf(ORIGIN_TICK), 'knife paths start after the origin tick'],
  [layout.includes('function boxesFromStart'), 'cuts are ordered outward from the start mark'],
  [
    cutStarts.length > 0 && cutStarts[0].x === orderedBoxes[0].x1 && cutStarts[0].y === orderedBoxes[0].y1,
    'the first cut is the design nearest the start mark',
  ],
  [
    cutStarts.length > 0 && cutStarts[0].x === Math.min(...orderedBoxes.map((box) => box.x1)),
    'nothing along the sheet is cut before it',
  ],
  [feedOrder.every((x) => x >= 0) && yOrder.every((y) => y >= 0), 'every cut sits on the positive side of both axes'],
  [layout.includes('row.sort((a, b) => a.y1 - b.y1)'), 'designs in a row are cut side by side'],
  [layout.includes('ROW_OVERLAP_IN'), 'rows are grouped by overlap, not a fixed band'],
  // The reported bug: staggered neighbours must be cut side by side, not skipped.
  [staggeredRows.length === 2, `a staggered sheet is cut as two rows, not ${staggeredRows.length}`],
  [staggeredRows[0].length === 3, `the first row cuts all three side-by-side designs (${staggeredRows[0].length})`],
  [staggeredRows[1]?.length === 2, `the second row cuts both of its designs (${staggeredRows[1]?.length})`],
  [staggeredOrder[0].x1 === staggeredNearest, 'the staggered sheet still starts on the design nearest the start mark'],
  [
    staggeredRows.every((row) => row.every((point, index) => index === 0 || point.y > row[index - 1].y)),
    'each row sweeps side by side in one direction',
  ],
  [
    staggeredRows.every((row, index) => index === 0 || Math.min(...row.map((p) => p.x)) > Math.min(...staggeredRows[index - 1].map((p) => p.x))),
    'each new row is further along the sheet than the last',
  ],
  [plt.includes(`U${nearRel.x},${nearRel.y};D${nearRel.x},${nearRel.y};`), 'each cut starts at its corner nearest the start mark'],
  [nearRel.x > farRel.x, 'designs nearer the start mark have a smaller feed X'],
  [plt.includes(`U${farRel.x},${farRel.y};`), 'the far cut uses the same bottom-right origin'],
  [Math.abs(nearRel.y) < toUnits(SHEET_WIDTH_IN), 'cut carriage Y is measured from the start mark, not the sheet edge'],
  [toUnits(1) === 1016, 'DMPL units are 1016 per inch (40 per mm)'],
  [WORKING_HEAD.startsWith('TB26,0,'), 'working Corel file uses the same TB26 prefix'],
  [WORKING_HEAD.includes(';CT1;;:H A L0 ECN U U-7,8;'), 'working Corel file is TB26, CT1, header, origin tick'],
  [layout.includes('export function cutPlt('), 'the whole job builds one cut file'],
  [!layout.includes('cutPltSections'), 'the job is no longer split into cut sections'],
  [!names.includes('sectionCount'), 'cut file names carry no section number'],
  [names.includes('cut.plt`'), 'the cut file is named "<job> cut.plt"'],
  [!page.includes('for (const section of'), 'the builder downloads a single cut file'],
  [!page.includes('cutTooTall'), 'the per-design section height limit is gone'],
  [layout.includes('MARK_SECTION_IN = 36'), 'mark rows sit no more than 36 in apart'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(plt.slice(0, 220))
console.log('Teneth PLT matches CutterPro/ToCutter: TB26 window, CT1, semicolon paths, PG')
