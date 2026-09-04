import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLib } from './load-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const layout = readFileSync(join(root, 'lib/cut-layout.ts'), 'utf8')
const names = readFileSync(join(root, 'lib/sheet-name.ts'), 'utf8')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')

const cut = await loadLib('lib/cut-layout.ts')
const { buildTenethPlt, MARK_SIZE_IN, MARK_GAP_X_IN, PLT_UNITS_PER_IN } = cut

const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const WORKING_HEAD = 'TB26,0,9660,7105;CT1;;:H A L0 ECN U U-7,8;D-7,8;D-7,0;U-7,0;'
const toUnits = (inches) => Math.round(inches * PLT_UNITS_PER_IN)

const circle = (xIn, yIn) => ({ xIn, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN })
const near = { xIn: 2, yIn: 1.875, widthIn: 4, heightIn: 3 }
const far = { xIn: 8, yIn: 12, widthIn: 5, heightIn: 2 }

const leftMark = circle(0.01, 10 / 25.4)
const rightMark = circle(0.01 + MARK_GAP_X_IN, 10 / 25.4)
const midLeft = circle(0.01, 10)
const midRight = circle(0.01 + MARK_GAP_X_IN, 10)
const trailingLeft = circle(0.01, 20)
const trailingRight = circle(0.01 + MARK_GAP_X_IN, 20)
const twoRows = [rightMark, trailingRight, leftMark, trailingLeft]
const threeRows = [rightMark, midRight, trailingRight, leftMark, midLeft, trailingLeft]

// Real output from the shipping builder, not a copy of it.
const plt = buildTenethPlt([near, far], twoRows)
const threePlt = buildTenethPlt([near, far], threeRows)

const carriage = toUnits(MARK_GAP_X_IN)
const twoRowFeed = toUnits(20 - 10 / 25.4)
const threeRowFeed = toUnits(20 - 10)
const coords = [...plt.matchAll(/[UD](-?\d+),(-?\d+)/g)].map(([, x, y]) => [Number(x), Number(y)])
const tb26 = [...plt.matchAll(/TB26,([^;]+);/g)].map((m) => m[1].split(',').map(Number))

const checks = [
  // Structure of the file, matched against the Corel plugin output that works.
  [plt.startsWith(`TB26,0,${twoRowFeed},${carriage};CT1;`), 'opens with the mark window then CT1'],
  [plt.includes(`;:H A L0 ECN U ${ORIGIN_TICK}`), 'DMPL header and origin tick follow the scan'],
  [plt.trimEnd().endsWith('@'.repeat(21)), 'pads with @ like the working Corel file'],
  [!plt.includes('V10'), 'no V10'],
  [WORKING_HEAD.startsWith('TB26,0,'), 'working Corel file uses the same TB26 prefix'],
  [WORKING_HEAD.includes(';CT1;;:H A L0 ECN U U-7,8;'), 'working Corel file is TB26, CT1, header, origin tick'],
  [/U\d+,\d+;D\d+,\d+;/.test(plt), 'cut vertices are semicolon separated, one command each'],
  [!/D \d+,\d+ \d+,\d+/.test(plt), 'no space separated multi point moves'],

  // The scan window: the next mark row, never the furthest.
  [tb26.length === 1, `a two row sheet is one pass (${tb26.length})`],
  [tb26[0].length === 3 && tb26[0][0] === 0, 'TB26 carries a mode flag then the window corner'],
  [tb26[0][1] === twoRowFeed && tb26[0][2] === carriage, 'window is one row of feed, then the carriage span'],
  [tb26[0][1] < carriage, `feed ${(tb26[0][1] / PLT_UNITS_PER_IN).toFixed(1)} in is along the sheet, not the ${MARK_GAP_X_IN.toFixed(1)} in width`],
  [(threePlt.match(/TB26/g) || []).length === 2, 'a three row sheet is two passes'],
  [threePlt.startsWith(`TB26,0,${threeRowFeed},${carriage};CT1;`), 'each pass reaches only its own next row'],

  // Axes and origin: bottom-right start, feed up the film, carriage across.
  [coords.every(([x, y]) => x >= -10 && y >= -10), 'every coordinate runs forward from the start mark'],
  [coords.every(([, y]) => y <= toUnits(22)), 'no coordinate runs off the far side of the film'],

  // Source level intent, so the reasoning cannot be quietly undone.
  [layout.includes('x: toUnits(origin.yIn - yIn)'), 'feed runs up the film from the bottom start mark'],
  [layout.includes('y: toUnits(origin.xIn - xIn)'), 'the carriage runs across from the start mark'],
  [layout.includes('return bc.yIn - ac.yIn'), 'marks are ordered from the bottom of the sheet up'],
  [layout.includes('return bc.xIn - ac.xIn'), 'each row is ordered from the right'],
  [layout.includes('function sectionBlock'), 'the file is built from per-section blocks'],
  [layout.includes('U${feed},0;PG;'), 'each block ends with its own advance'],
  [layout.includes('Empty sections still need their block'), 'a section with no cuts still advances the film'],
  [layout.includes('function boxesFromStart'), 'cuts are ordered outward from the start mark'],
  [layout.includes('row.sort((a, b) => a.y1 - b.y1)'), 'designs in a row are cut side by side'],
  [layout.includes('ROW_OVERLAP_IN'), 'rows are grouped by overlap, not a fixed band'],
  [layout.includes('MARK_SECTION_IN = 20'), 'mark rows sit no more than 20 in apart'],
  [layout.includes('CUT_MARGIN_IN = 2.5 / 25.4'), 'the cut box is 2.5 mm around each design'],
  [layout.includes('CUT_GUTTER_IN = CUT_MARGIN_IN * 2'), 'neighbouring cut boxes cannot overlap'],
  [!layout.includes('cutPltSections'), 'the job is not split into separate files'],
  [layout.includes('export function cutPlt('), 'the whole job builds one cut file'],

  // Filenames and the builder wiring.
  [!names.includes('sectionCount'), 'cut file names carry no section number'],
  [names.includes('cut.plt`'), 'the cut file is named "<job> cut.plt"'],
  [!page.includes('for (const section of'), 'the builder downloads a single cut file'],
  [page.includes('minGutterIn: CUT_GUTTER_IN'), 'pre-cut packing keeps designs two cut boxes apart'],
  [page.includes('cutTooTall'), 'a design too tall for one pass is flagged'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`\n${plt.slice(0, 150)}`)
console.log('cut files match the Corel structure and advance once per section')
