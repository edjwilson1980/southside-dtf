import { loadLib } from './load-lib.mjs'

/**
 * Checks the real cut file the app produces, by importing the shipping module
 * rather than a hand-written copy of it.
 */
const cut = await loadLib('lib/cut-layout.ts')
const compose = await loadLib('lib/compose-sheet.ts')

const { cutPlt, buildTenethPlt, MARK_CLEARANCE_IN, CUT_GUTTER_IN, CUT_MARGIN_IN, MARK_SECTION_IN, registrationMarkBounds } = cut
const { packSheetBestGutter, CUT_ART_START_IN, SHEET_WIDTH_IN } = compose

const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'

function layoutFor(count, widthIn, heightIn) {
  const items = Array.from({ length: count }, () => ({ previewUrl: '', widthIn, heightIn }))
  const layout = packSheetBestGutter(items, {
    packWidthIn: SHEET_WIDTH_IN - MARK_CLEARANCE_IN * 2,
    startYIn: CUT_ART_START_IN,
    sideInsetIn: MARK_CLEARANCE_IN,
    minGutterIn: CUT_GUTTER_IN,
  })
  return { layout, printHeight: layout.contentEndY + CUT_ART_START_IN }
}

/** Cut rectangles, ignoring the origin tick each block opens with. */
function rectangles(plt) {
  return [...plt.matchAll(/U(-?\d+),(-?\d+);D\1,\2;D\1,(-?\d+);D(-?\d+),\3;D\4,\2;D\1,\2;U\1,\2;/g)].map((m) => ({
    x1: Number(m[1]),
    y1: Number(m[2]),
    y2: Number(m[3]),
    x2: Number(m[4]),
  }))
}

const checks = []
const scenarios = [
  { name: 'short job, one pass', count: 2, w: 10.75, h: 12 },
  { name: 'long job, several passes', count: 8, w: 10.75, h: 12 },
  { name: 'many small designs', count: 40, w: 4, h: 4 },
  { name: 'mixed sizes', count: 14, w: 6.5, h: 9 },
]

for (const scenario of scenarios) {
  const { layout, printHeight } = layoutFor(scenario.count, scenario.w, scenario.h)
  const plt = cutPlt(layout.pieces, printHeight)
  const blocks = plt.split('TB26').slice(1)
  const rects = rectangles(plt)
  const rows = registrationMarkBounds(printHeight, SHEET_WIDTH_IN, layout.pieces)
  const rowCount = new Set(rows.map((mark) => mark.yIn.toFixed(4))).size
  const label = `${scenario.name} (${printHeight.toFixed(1)} in)`

  checks.push([layout.pieces.length === scenario.count, `${label}: packer placed all ${scenario.count} designs`])
  checks.push([rects.length === scenario.count, `${label}: every design is cut exactly once (${rects.length}/${scenario.count})`])
  checks.push([blocks.length === rowCount - 1, `${label}: ${blocks.length} cutting passes for ${rowCount} mark rows`])
  checks.push([
    (plt.match(/PG;/g) || []).length === blocks.length,
    `${label}: every pass ends with its own advance`,
  ])
  checks.push([
    blocks.every((block) => block.includes(ORIGIN_TICK)),
    `${label}: every pass re-registers from its own start mark`,
  ])

  // Nothing may sit behind the start mark of its own pass, or the cutter
  // would have to run backwards to reach it.
  const behind = rects.filter((rect) => rect.x1 < 0 || rect.y1 < 0)
  checks.push([behind.length === 0, `${label}: no cut runs behind its start mark (${behind.length})`])

  // Each pass declares how far it advances; nothing should need more travel.
  const perBlock = blocks.map((block) => {
    const feed = Number(block.match(/^,0,(\d+),/)?.[1] ?? 0)
    return { feed, rects: rectangles('TB26' + block) }
  })
  const overrun = perBlock.filter((block) =>
    block.rects.some((rect) => rect.x2 > block.feed + MARK_SECTION_IN * 1016),
  )
  checks.push([overrun.length === 0, `${label}: no pass has to reach more than a section beyond its window`])

  const feeds = perBlock.map((block) => block.feed / 1016)
  checks.push([
    feeds.every((feed) => feed <= MARK_SECTION_IN + 1e-6),
    `${label}: every advance is within ${MARK_SECTION_IN} in (${feeds.map((f) => f.toFixed(1)).join(', ')})`,
  ])
  checks.push([
    feeds.every((feed) => Math.abs(feed - feeds[0]) < 1e-6),
    `${label}: every advance is the same distance`,
  ])
}

// A job with no marks at all must still produce something sane.
const bare = buildTenethPlt([{ xIn: 1, yIn: 1, widthIn: 2, heightIn: 2 }], [])
checks.push([bare.includes(';:H A L0 ECN U'), 'a job with no marks still emits a header'])
checks.push([!bare.includes('TB26'), 'a job with no marks does not pretend to register'])

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`cut file checks failed: ${failed.length}`)
  process.exit(1)
}
console.log('\nreal cut files register, cut and advance once per section')
