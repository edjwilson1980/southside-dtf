import {
  MARK_EDGE_IN,
  MARK_GAP_X_IN,
  MARK_LEAD_IN,
  MARK_SECTION_IN,
  MARK_SIZE_IN,
  MARK_TRAIL_IN,
  PLT_UNITS_PER_IN,
  buildTenethPlt,
  type CutBox,
} from '@/lib/cut-layout'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

/**
 * A short two-section job for working out how the cutter is told to stop,
 * clamp, advance the film and pick up the next pair of marks.
 *
 * Neither our cut files nor the CorelDRAW plugin currently do this, so there
 * is no known-good file to copy. These variants each encode the advance a
 * different way; run them on one printed test sheet and see which one the
 * machine obeys.
 */

/** Short enough to be cheap to print, long enough to need a second pass. */
export const TEST_PITCH_IN = 12
export const TEST_ROWS = 3
export const TEST_BOX_IN = 4

const HEADER = ';:H A L0 ECN U '
const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const TAIL = '@'.repeat(21)

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1: number, y1: number, x2: number, y2: number) {
  return `U${x1},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};U${x1},${y1};`
}

/** Mark rows down the test sheet, leading edge first. */
export function testMarkYs() {
  return Array.from({ length: TEST_ROWS }, (_, index) => MARK_LEAD_IN + index * TEST_PITCH_IN)
}

export function testSheetLengthIn() {
  const ys = testMarkYs()
  return ys[ys.length - 1] + MARK_SIZE_IN + MARK_TRAIL_IN
}

export function testMarkXs() {
  return { left: MARK_EDGE_IN, right: MARK_EDGE_IN + MARK_GAP_X_IN }
}

/**
 * Two boxes in each section, side by side, so the cut order is visible as
 * well as whether the section was reached at all. Numbered in cut order.
 */
export function testCutBoxes(): Array<CutBox & { label: string; section: number }> {
  const ys = testMarkYs()
  const boxes: Array<CutBox & { label: string; section: number }> = []
  // Sections run from the start mark (last row) back up the sheet. The two
  // sections sit at different X so that a section cut in the wrong place is
  // obvious on the film, rather than landing on its neighbour's boxes.
  const sections = [
    { top: ys[1], xs: [12, 4] },
    { top: ys[0], xs: [16, 8] },
  ]
  sections.forEach((section, index) => {
    const yIn = section.top + (TEST_PITCH_IN - TEST_BOX_IN) / 2 + MARK_SIZE_IN
    // Right-hand box first: that is the order the cutter works in.
    section.xs.forEach((xIn, position) => {
      boxes.push({
        xIn,
        yIn,
        widthIn: TEST_BOX_IN,
        heightIn: TEST_BOX_IN,
        label: String(index * 2 + position + 1),
        section: index + 1,
      })
    })
  })
  return boxes
}

type Origin = { xIn: number; yIn: number }

/** Same frame as the real cut files: feed up the sheet, carriage across it. */
function toPlt(xIn: number, yIn: number, origin: Origin) {
  return { x: toUnits(origin.yIn - yIn), y: toUnits(origin.xIn - xIn) }
}

function pathsFor(boxes: CutBox[], origin: Origin) {
  return boxes
    .map((box) => {
      const a = toPlt(box.xIn, box.yIn, origin)
      const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
      return rectanglePath(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.max(a.x, b.x),
        Math.max(a.y, b.y),
      )
    })
    .join('')
}

/** The start mark of a row: right-hand circle, centre. */
function rowOrigin(rowY: number): Origin {
  return { xIn: testMarkXs().right + MARK_SIZE_IN / 2, yIn: rowY + MARK_SIZE_IN / 2 }
}

type Section = { origin: Origin; feed: number; boxes: CutBox[] }

/** Sections ordered from the parked start mark back up the sheet. */
function testSections(): Section[] {
  const ys = testMarkYs()
  const all = testCutBoxes()
  return [0, 1].map((index) => {
    const nearRow = ys[ys.length - 1 - index]
    const farRow = ys[ys.length - 2 - index]
    return {
      origin: rowOrigin(nearRow),
      feed: toUnits(nearRow - farRow),
      boxes: all.filter((box) => box.section === index + 1),
    }
  })
}

const carriage = () => toUnits(MARK_GAP_X_IN)

/** 1A: one self-contained register, cut and advance block per section. */
function variantRepeatedBlocks() {
  return testSections()
    .map((section) => {
      const scan = `TB26,0,${section.feed},${carriage()};CT1;`
      return `${scan}${HEADER}${ORIGIN_TICK}${pathsFor(section.boxes, section.origin)}U${section.feed},0;PG;`
    })
    .join('') + TAIL
}

/** 1B: one scan naming every mark row, retried now the axes are right. */
function variantMarkList() {
  const sections = testSections()
  const origin = sections[0].origin
  const ys = testMarkYs()
  const xs = testMarkXs()
  const points: number[] = []
  // Every mark except the parked one, as feed,carriage pairs.
  for (let row = ys.length - 1; row >= 0; row -= 1) {
    for (const xIn of [xs.right, xs.left]) {
      const point = toPlt(xIn + MARK_SIZE_IN / 2, ys[row] + MARK_SIZE_IN / 2, origin)
      if (point.x === 0 && point.y === 0) continue
      points.push(point.x, point.y)
    }
  }
  const all = sections.flatMap((section) =>
    section.boxes.map((box) => ({ box, origin: sections[0].origin })),
  )
  const feed = toUnits((ys[ys.length - 1] - ys[0]))
  return `TB26,0,${points.join(',')};CT1;${HEADER}${ORIGIN_TICK}${pathsFor(all.map((entry) => entry.box), origin)}U${feed},0;PG;${TAIL}`
}

/** 1C: the second TB26 parameter, always zero so far, set to the section count. */
function variantSectionCount() {
  const sections = testSections()
  const origin = sections[0].origin
  const all = sections.flatMap((section) => section.boxes)
  return `TB26,${sections.length},${sections[0].feed},${carriage()};CT1;${HEADER}${ORIGIN_TICK}${pathsFor(all, origin)}U${sections[0].feed},0;PG;${TAIL}`
}

/** 1D: exactly what we ship today, as the control. */
function variantCurrent() {
  const sections = testSections()
  const origin = sections[0].origin
  const all = sections.flatMap((section) => section.boxes)
  return `TB26,0,${sections[0].feed},${carriage()};CT1;${HEADER}${ORIGIN_TICK}${pathsFor(all, origin)}U${sections[0].feed},0;PG;${TAIL}`
}

/** Test 2A: a full-length sheet at the widest mark spacing, through the real builder. */
export const TEST2_SHEET_IN = 50

export function test2MarkYs() {
  const first = MARK_LEAD_IN
  const last = TEST2_SHEET_IN - MARK_TRAIL_IN - MARK_SIZE_IN
  const steps = Math.max(1, Math.ceil((last - first) / MARK_SECTION_IN - 1e-9))
  const pitch = (last - first) / steps
  return Array.from({ length: steps + 1 }, (_, index) => first + index * pitch)
}

export function test2Pitch() {
  const ys = test2MarkYs()
  return ys[1] - ys[0]
}

/** Two boxes per section, staggered across the sheet so a misplaced pass shows. */
export function test2CutBoxes(): Array<CutBox & { label: string; section: number }> {
  const ys = test2MarkYs()
  const pitch = test2Pitch()
  const boxes: Array<CutBox & { label: string; section: number }> = []
  // Sections run from the start mark (last row) back up the sheet.
  for (let index = 0; index < ys.length - 1; index += 1) {
    const top = ys[ys.length - 2 - index]
    const yIn = top + (pitch - TEST_BOX_IN) / 2 + MARK_SIZE_IN
    const xs = index % 2 === 0 ? [12, 4] : [16, 8]
    xs.forEach((xIn, position) => {
      boxes.push({
        xIn,
        yIn,
        widthIn: TEST_BOX_IN,
        heightIn: TEST_BOX_IN,
        label: String(index * 2 + position + 1),
        section: index + 1,
      })
    })
  }
  return boxes
}

function test2Marks(): CutBox[] {
  const xs = testMarkXs()
  return test2MarkYs().flatMap((yIn) =>
    [xs.left, xs.right].map((xIn) => ({ xIn, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN })),
  )
}

/** Built by the shipping code, so this test exercises what real jobs will use. */
export function test2Plt() {
  return buildTenethPlt(test2CutBoxes(), test2Marks())
}

export type TestVariant = {
  id: string
  title: string
  idea: string
  watchFor: string
  plt: string
}

export function testVariants(): TestVariant[] {
  const ys = test2MarkYs()
  return [
    {
      id: '2A',
      title: `${TEST2_SHEET_IN} in sheet, marks ${test2Pitch().toFixed(1)} in apart`,
      idea: `Test 1A's structure at full length and the widest mark spacing worth using. ${TEST2_SHEET_IN} in of film, ${ys.length} mark rows, ${ys.length - 1} cutting passes instead of the ${Math.ceil((TEST2_SHEET_IN - 1) / TEST_PITCH_IN)} the 12 in spacing would need. Built by the shipping code, so this is exactly what real jobs now produce.`,
      watchFor: `Cuts two boxes, advances ${test2Pitch().toFixed(1)} in, re-reads, repeats. All ${(ys.length - 1) * 2} boxes cut in the right places.`,
      plt: test2Plt(),
    },
    {
      id: '1A',
      title: 'Repeated register / cut / advance blocks',
      idea: 'Each section gets its own TB26 scan, its own cuts in its own frame, and its own PG advance. The most literal way to say "cut this much, then move on".',
      watchFor: 'Cuts boxes 1 and 2, advances the film, re-reads the next pair, then cuts 3 and 4.',
      plt: variantRepeatedBlocks(),
    },
    {
      id: '1B',
      title: 'One scan naming every mark',
      idea: 'A single TB26 listing all six mark positions, letting the cutter plan the sections itself. Tried once before, but the feed and carriage axes were swapped at the time, so that test proved nothing.',
      watchFor: 'Reads several mark pairs up front, then cuts all four boxes, advancing as needed.',
      plt: variantMarkList(),
    },
    {
      id: '1C',
      title: 'Section count in the second TB26 field',
      idea: 'That field has been 0 in every file we have seen, including CorelDRAW\u2019s, which only ever writes single-section jobs. It may be a section count or a multi-mark mode flag.',
      watchFor: 'Same as 1A, but driven by the cutter rather than by repeated blocks.',
      plt: variantSectionCount(),
    },
    {
      id: '1D',
      title: 'Control: what we ship today',
      idea: 'One scan, every cut, one advance at the end. Included so you can see the current failure on the same sheet as the others.',
      watchFor: 'Expected to cut boxes 1 and 2, then run out of travel or cut 3 and 4 in the wrong place.',
      plt: variantCurrent(),
    },
  ]
}
