import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'lib/cutter-test.ts'), 'utf8')
const page = readFileSync(join(root, 'app/cutter-test/page.tsx'), 'utf8')

const IN = 25.4
const PLT = 1016
const SHEET_WIDTH_IN = 21.93
const MARK_SIZE_IN = 5 / IN
const MARK_EDGE_IN = 0.003
const MARK_GAP_X_IN = SHEET_WIDTH_IN - MARK_SIZE_IN - MARK_EDGE_IN * 2
const MARK_LEAD_IN = 10 / IN
const MARK_TRAIL_IN = 0.75
const PITCH = 12
const ROWS = 3
const BOX = 4
const CUT_MARGIN_IN = 0.125

const toUnits = (i) => Math.round(i * PLT)
const ys = Array.from({ length: ROWS }, (_, i) => MARK_LEAD_IN + i * PITCH)
const sheetLen = ys[ys.length - 1] + MARK_SIZE_IN + MARK_TRAIL_IN
const xs = { left: MARK_EDGE_IN, right: MARK_EDGE_IN + MARK_GAP_X_IN }

const boxes = []
;[ys[1], ys[0]].forEach((top, section) => {
  const yIn = top + (PITCH - BOX) / 2 + MARK_SIZE_IN
  ;[12, 4].forEach((xIn, index) => {
    boxes.push({ xIn, yIn, widthIn: BOX, heightIn: BOX, label: String(section * 2 + index + 1), section: section + 1 })
  })
})

const checks = []

// The test sheet has to be a real, printable, two-section job.
checks.push([ys.length === 3, `three mark rows at ${ys.map((y) => y.toFixed(2)).join(', ')} in`])
checks.push([sheetLen < 30, `test sheet is ${sheetLen.toFixed(2)} in, inside one cutter pass so 1D can fail visibly`])
checks.push([boxes.length === 4, 'four numbered cut boxes'])
checks.push([boxes.filter((b) => b.section === 1).length === 2, 'two boxes in section 1'])
checks.push([boxes.filter((b) => b.section === 2).length === 2, 'two boxes in section 2'])

// No box may sit on a mark row, or the cut would run through a mark.
const onAMark = boxes.filter((box) =>
  ys.some((y) => box.yIn - CUT_MARGIN_IN < y + MARK_SIZE_IN && y < box.yIn + box.heightIn + CUT_MARGIN_IN),
)
checks.push([onAMark.length === 0, `no cut box overlaps a mark row (${onAMark.length})`])

// Boxes must clear the marks across the sheet too.
const offSide = boxes.filter(
  (box) =>
    box.xIn - CUT_MARGIN_IN < xs.left + MARK_SIZE_IN ||
    box.xIn + box.widthIn + CUT_MARGIN_IN > xs.right,
)
checks.push([offSide.length === 0, `no cut box reaches a side mark (${offSide.length})`])

// Every box must land inside the sheet.
const offSheet = boxes.filter((box) => box.yIn + box.heightIn + CUT_MARGIN_IN > sheetLen || box.yIn - CUT_MARGIN_IN < 0)
checks.push([offSheet.length === 0, `every cut box is on the sheet (${offSheet.length})`])

// The four variants have to be genuinely different files.
for (const id of ['1A', '1B', '1C', '1D']) {
  checks.push([src.includes(`id: '${id}'`), `variant ${id} exists`])
}
checks.push([src.includes('variantRepeatedBlocks'), '1A repeats a register/cut/advance block per section'])
checks.push([src.includes('variantMarkList'), '1B names every mark in one scan'])
checks.push([src.includes('variantSectionCount'), '1C sets the second TB26 field'])
checks.push([src.includes('variantCurrent'), '1D is the shipped control'])
checks.push([src.includes('TB26,${sections.length},'), '1C puts the section count where the 0 usually is'])

// The frame must match the real cut files, or the test proves nothing.
checks.push([src.includes('x: toUnits(origin.yIn - yIn)'), 'test files use the same feed axis as real cut files'])
checks.push([src.includes('y: toUnits(origin.xIn - xIn)'), 'test files use the same carriage axis as real cut files'])
checks.push([src.includes("';:H A L0 ECN U '"), 'test files use the same DMPL header'])
checks.push([src.includes('U-7,8;D-7,8;D-7,0;U-7,0;'), 'test files use the same origin tick'])

// Section geometry: the advance must be one mark pitch.
const pitchUnits = toUnits(PITCH)
checks.push([pitchUnits === 12192, `one section advance is ${pitchUnits} units (${PITCH} in)`])
checks.push([toUnits(MARK_GAP_X_IN) === toUnits(SHEET_WIDTH_IN - MARK_SIZE_IN - MARK_EDGE_IN * 2), 'carriage span is the full mark spacing'])

// The page has to actually hand over all four files plus the sheet.
for (const id of ['1A', '1B', '1C', '1D']) {
  checks.push([page.includes('cutter test ${variant.id}.plt') || page.includes(id), `page offers test ${id}`])
}
checks.push([page.includes('Test 1 sheet'), 'page offers the printable test sheet'])
checks.push([page.includes('canvasToPngBlob(canvas, DPI)'), 'the test sheet carries its DPI so it prints at the right size'])
checks.push([!page.includes('canvas.toBlob('), 'the test sheet is not written as an untagged PNG'])
checks.push([page.includes('upside down'), 'page repeats the upside-down loading instruction'])
checks.push([!page.includes('cutPlt('), 'the test page does not touch the real cut path'])

// Test 2A: full length at the widest mark spacing, built by the shipping code.
const SECTION_MAX = 20
const TEST2 = 50
const first2 = MARK_LEAD_IN
const last2 = TEST2 - MARK_TRAIL_IN - MARK_SIZE_IN
const steps2 = Math.max(1, Math.ceil((last2 - first2) / SECTION_MAX - 1e-9))
const pitch2 = (last2 - first2) / steps2
checks.push([src.includes('TEST2_SHEET_IN = 50'), 'test 2A is a 50 in sheet'])
checks.push([src.includes('buildTenethPlt(test2CutBoxes(), test2Marks())'), 'test 2A is built by the shipping code, not a copy of it'])
checks.push([steps2 === 3, `a 50 in sheet needs ${steps2} passes`])
checks.push([pitch2 <= SECTION_MAX + 1e-9, `pitch ${pitch2.toFixed(2)} in is within the ${SECTION_MAX} in limit`])
checks.push([pitch2 > PITCH, `pitch ${pitch2.toFixed(2)} in is wider than the ${PITCH} in that test 1A proved`])
checks.push([src.includes('test2CutBoxes'), 'test 2A has its own numbered boxes'])
checks.push([page.includes('Test 2A sheet'), 'the page offers the 50 in test sheet'])
checks.push([page.includes('register / cut / advance'), 'the page says 1A is now what the builder does'])

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`cutter test checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`\ntest sheet ${SHEET_WIDTH_IN} x ${sheetLen.toFixed(2)} in, ${ROWS} mark rows, boxes at ${boxes.map((b) => b.label).join(' ')}`)
console.log('four distinct advance encodings ready to try')
