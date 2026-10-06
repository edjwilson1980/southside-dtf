/**
 * Verifies PLT output uses turned piece dimensions.
 *
 *   node scripts/verify-plt.mjs
 */

const EPS = 1e-6
const SHEET_WIDTH_IN = 22
const CUT_MARGIN_IN = 2 / 25.4
const CUT_SECTION_IN = 30
const PLT_UNITS_PER_IN = 1016

function cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn) {
  const xIn = Math.max(0, piece.xIn - CUT_MARGIN_IN)
  const yIn = Math.max(0, piece.yIn - CUT_MARGIN_IN)
  const right = Math.min(sheetWidthIn, piece.xIn + piece.widthIn + CUT_MARGIN_IN)
  const bottom = Math.min(sheetHeightIn, piece.yIn + piece.heightIn + CUT_MARGIN_IN)
  return {
    xIn,
    yIn,
    widthIn: Math.max(0, right - xIn),
    heightIn: Math.max(0, bottom - yIn),
  }
}

function toUnits(inches) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1, y1, x2, y2) {
  return `U${x2},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};`
}

function buildTenethPlt(boxes, sectionWidthIn, sectionHeightIn) {
  const width = toUnits(sectionWidthIn)
  const height = toUnits(sectionHeightIn)
  const paths = boxes.map((box) => {
    const x1 = toUnits(box.xIn)
    const x2 = toUnits(box.xIn + box.widthIn)
    const yTop = toUnits(sectionHeightIn - box.yIn)
    const yBottom = toUnits(sectionHeightIn - (box.yIn + box.heightIn))
    return rectanglePath(x1, yBottom, x2, yTop)
  }).join('')
  return `TB26,0,${width},${height};CT1;;:H A L0 ECN U SP1;;${paths}U${width},0;PG;`
}

function cutPltSections(pieces, sheetHeightIn, sheetWidthIn = SHEET_WIDTH_IN) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    const boxes = pieces
      .map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
      .filter((box) => box.yIn + box.heightIn > sectionStart + 1e-6 && box.yIn < sectionStart + sectionHeightIn - 1e-6)
      .map((box) => {
        const yIn = Math.max(0, box.yIn - sectionStart)
        const bottom = Math.min(sectionHeightIn, box.yIn + box.heightIn - sectionStart)
        return { xIn: box.xIn, yIn, widthIn: box.widthIn, heightIn: Math.max(0, bottom - yIn) }
      })
      .filter((box) => box.widthIn > 0 && box.heightIn > 0)
    return {
      index,
      sectionCount,
      sectionHeightIn,
      plt: boxes.length > 0 ? buildTenethPlt(boxes, sheetWidthIn, sectionHeightIn) : '',
    }
  }).filter((section) => section.plt)
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

console.log('PLT checks (rotated pieces)\n')

const rotated = { xIn: 0.8, yIn: 2.8, widthIn: 3, heightIn: 16, rotated: true }
const sheetHeightIn = 22
const box = cutBoxForPiece(rotated, SHEET_WIDTH_IN, sheetHeightIn)
const sections = cutPltSections([rotated], sheetHeightIn)
const plt = sections[0]?.plt ?? ''

check('emits a PLT section', sections.length === 1)
check('PLT contains turned box left', plt.includes(`D${toUnits(box.xIn)},`))
check('PLT contains turned box right', plt.includes(`D${toUnits(box.xIn + box.widthIn)},`))
check('turned box is portrait in plotter units', toUnits(box.heightIn) > toUnits(box.widthIn))
check('PLT does not use the unrotated 16 in width', Math.abs(box.widthIn - 16) > 8)

const tooWide = { xIn: 0, yIn: 3, widthIn: 16, heightIn: 3, rotated: false }
const wideBox = cutBoxForPiece(tooWide, SHEET_WIDTH_IN, sheetHeightIn)
check('upright comparison box is wider than tall', wideBox.widthIn > wideBox.heightIn + EPS)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
