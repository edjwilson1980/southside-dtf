import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const compose = readFileSync(join(root, 'lib/compose-sheet.ts'), 'utf8')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')

const SHEET_GUTTER_IN = 0.125
const SHEET_WIDTH_IN = 22
const CUT_SECTION_IN = 30
const MARK_SIZE_IN = 5 / 25.4
const MARK_PAD_IN = 2 / 25.4
const CUT_MARGIN_IN = 0.3
const CUT_GUTTER_IN = CUT_MARGIN_IN * 2
const MARK_GAP_X_IN = 21.5
const MARK_EDGE_IN = Math.max(0, (SHEET_WIDTH_IN - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
const MARK_CLEARANCE_IN = MARK_EDGE_IN + MARK_SIZE_IN + CUT_MARGIN_IN
const PREFERRED_GUTTER_IN = 0.25

function gutterChoices(minGutterIn) {
  const preferred = Math.max(PREFERRED_GUTTER_IN, minGutterIn)
  return [preferred, (preferred + minGutterIn) / 2, minGutterIn]
}
const LABEL_HEIGHT_IN = 1
const LABEL_PAD_IN = 0.125
const LABEL_MARGIN_IN = 0.75
const CUT_ART_START_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + LABEL_MARGIN_IN
const EPS = 1e-6

/**
 * The packer that shipped before this change: next-fit rows in upload order.
 * Given the same spacing the current packer is held to, so the comparison
 * measures packing quality rather than a change in spacing policy.
 */
function lengthNextFit(items, packWidthIn, cutOut) {
  const gutter = cutOut ? CUT_GUTTER_IN : SHEET_GUTTER_IN
  const rows = items.reduce((acc, item) => {
    const current = acc[acc.length - 1]
    const currentWidth = current?.reduce((sum, entry) => sum + entry.widthIn, 0) ?? 0
    const gutters = current ? current.length * gutter : 0
    if (!current || currentWidth + gutters + item.widthIn > packWidthIn) acc.push([item])
    else current.push(item)
    return acc
  }, [])
  let yIn = CUT_ART_START_IN
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((piece) => piece.heightIn), 0)
    if (cutOut) {
      const section = Math.floor(Math.max(0, yIn - MARK_CLEARANCE_IN) / CUT_SECTION_IN)
      const sectionEnd = (section + 1) * CUT_SECTION_IN
      if (yIn + rowHeight + MARK_CLEARANCE_IN > sectionEnd) yIn = sectionEnd + MARK_CLEARANCE_IN
    }
    yIn += rowHeight + gutter
  }
  return yIn - CUT_ART_START_IN
}

/** Mirrors packSheetPieces in lib/compose-sheet.ts. */
function splitFreeRect(free, used) {
  const noOverlap =
    used.xIn >= free.xIn + free.widthIn - EPS ||
    used.xIn + used.widthIn <= free.xIn + EPS ||
    used.yIn >= free.yIn + free.heightIn - EPS ||
    used.yIn + used.heightIn <= free.yIn + EPS
  if (noOverlap) return [free]
  const parts = []
  if (used.yIn > free.yIn + EPS) parts.push({ xIn: free.xIn, yIn: free.yIn, widthIn: free.widthIn, heightIn: used.yIn - free.yIn })
  const usedBottom = used.yIn + used.heightIn
  if (usedBottom < free.yIn + free.heightIn - EPS) parts.push({ xIn: free.xIn, yIn: usedBottom, widthIn: free.widthIn, heightIn: free.yIn + free.heightIn - usedBottom })
  if (used.xIn > free.xIn + EPS) parts.push({ xIn: free.xIn, yIn: free.yIn, widthIn: used.xIn - free.xIn, heightIn: free.heightIn })
  const usedRight = used.xIn + used.widthIn
  if (usedRight < free.xIn + free.widthIn - EPS) parts.push({ xIn: usedRight, yIn: free.yIn, widthIn: free.xIn + free.widthIn - usedRight, heightIn: free.heightIn })
  return parts
}

function contains(outer, inner) {
  return (
    inner.xIn >= outer.xIn - EPS &&
    inner.yIn >= outer.yIn - EPS &&
    inner.xIn + inner.widthIn <= outer.xIn + outer.widthIn + EPS &&
    inner.yIn + inner.heightIn <= outer.yIn + outer.heightIn + EPS
  )
}

function pruneFreeRects(rects) {
  const kept = []
  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i]
    if (rect.widthIn <= EPS || rect.heightIn <= EPS) continue
    let covered = false
    for (let j = 0; j < rects.length; j += 1) {
      if (i === j) continue
      if (contains(rects[j], rect) && !(contains(rect, rects[j]) && j > i)) {
        covered = true
        break
      }
    }
    if (!covered) kept.push(rect)
  }
  return kept
}

function packSheetPieces(items, opts) {
  const gutterIn = opts.gutterIn ?? SHEET_GUTTER_IN
  const startYIn = opts.startYIn ?? CUT_ART_START_IN
  const sideInsetIn = opts.sideInsetIn ?? 0
  const stripWidth = opts.packWidthIn + gutterIn
  const totalHeight = items.reduce((sum, item) => sum + item.heightIn + gutterIn, 0)
  const openHeight = totalHeight + startYIn + 1

  let free = [{ xIn: 0, yIn: startYIn, widthIn: stripWidth, heightIn: openHeight }]
  const placed = []
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const heightDiff = b.item.heightIn - a.item.heightIn
      if (Math.abs(heightDiff) > EPS) return heightDiff
      const widthDiff = b.item.widthIn - a.item.widthIn
      if (Math.abs(widthDiff) > EPS) return widthDiff
      return a.index - b.index
    })

  for (const { item } of ordered) {
    const boxWidth = Math.min(item.widthIn, opts.packWidthIn) + gutterIn
    const boxHeight = item.heightIn + gutterIn
    let bestRect
    let bestY = Infinity
    let bestX = Infinity
    let bestFit = Infinity
    for (const rect of free) {
      if (rect.widthIn + EPS < boxWidth || rect.heightIn + EPS < boxHeight) continue
      const fit = Math.min(rect.widthIn - boxWidth, rect.heightIn - boxHeight)
      if (
        rect.yIn < bestY - EPS ||
        (Math.abs(rect.yIn - bestY) <= EPS && fit < bestFit - EPS) ||
        (Math.abs(rect.yIn - bestY) <= EPS && Math.abs(fit - bestFit) <= EPS && rect.xIn < bestX - EPS)
      ) {
        bestRect = rect
        bestY = rect.yIn
        bestX = rect.xIn
        bestFit = fit
      }
    }
    if (!bestRect) continue
    const used = { xIn: bestX, yIn: bestY, widthIn: boxWidth, heightIn: boxHeight }
    placed.push({ ...item, xIn: bestX + sideInsetIn, yIn: bestY })
    free = pruneFreeRects(free.flatMap((rect) => splitFreeRect(rect, used)))
  }

  const contentBottom = placed.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn), startYIn)
  return { pieces: placed, contentBottom, contentEndY: contentBottom + gutterIn, gutterIn }
}

function packSheetBestGutter(items, opts) {
  const [first, ...rest] = gutterChoices(opts.minGutterIn ?? SHEET_GUTTER_IN)
  let best = packSheetPieces(items, { ...opts, gutterIn: first })
  for (const gutterIn of rest) {
    const candidate = packSheetPieces(items, { ...opts, gutterIn })
    if (candidate.contentBottom < best.contentBottom - EPS) best = candidate
  }
  return best
}

function packOptions(cutOut, packWidthIn) {
  return cutOut
    ? { packWidthIn, startYIn: CUT_ART_START_IN, sideInsetIn: MARK_CLEARANCE_IN, minGutterIn: CUT_GUTTER_IN }
    : { packWidthIn, startYIn: CUT_ART_START_IN }
}

function repeat(widthIn, heightIn, count) {
  return Array.from({ length: count }, () => ({ widthIn, heightIn }))
}

/** Interleaved so upload order is a bad packing order, which is the real-world case. */
function interleave(groups) {
  const out = []
  let more = true
  for (let i = 0; more; i += 1) {
    more = false
    for (const group of groups) {
      if (i < group.length) {
        out.push(group[i])
        more = true
      }
    }
  }
  return out
}

const scenarios = [
  {
    name: 'adult fronts, pockets and sleeves',
    items: interleave([repeat(11, 14, 12), repeat(4, 4, 24), repeat(3.5, 3, 24)]),
  },
  { name: 'many small left-chest logos', items: interleave([repeat(4, 4, 40), repeat(3, 3, 40)]) },
  { name: 'a few big prints plus a lot of small', items: interleave([repeat(10.5, 12, 6), repeat(2.5, 2.5, 60)]) },
  { name: 'uniform full fronts', items: repeat(11, 14, 10) },
  { name: 'tall sleeve strips with wide chests', items: interleave([repeat(2.5, 11, 20), repeat(10, 4, 12)]) },
  { name: 'one big print with many tiny names', items: interleave([repeat(20, 24, 2), repeat(2, 1.25, 80)]) },
]

const checks = []
const rows = []

for (const scenario of scenarios) {
  for (const cutOut of [false, true]) {
    const packWidth = cutOut ? SHEET_WIDTH_IN - MARK_CLEARANCE_IN * 2 : SHEET_WIDTH_IN
    const before = lengthNextFit(scenario.items, packWidth, cutOut)
    const packed = packSheetBestGutter(scenario.items, packOptions(cutOut, packWidth))
    const after = packed.contentEndY - CUT_ART_START_IN
    const gutter = packed.gutterIn
    const label = `${scenario.name}${cutOut ? ' (pre-cut)' : ''}`
    rows.push({ label, before, after, gutter, pct: before > 0 ? ((before - after) / before) * 100 : 0 })

    const tooTight = packed.pieces.some((a) =>
      packed.pieces.some((b) =>
        a !== b &&
        a.yIn < b.yIn + b.heightIn - EPS && b.yIn < a.yIn + a.heightIn - EPS &&
        a.xIn + a.widthIn <= b.xIn + EPS &&
        b.xIn - (a.xIn + a.widthIn) < SHEET_GUTTER_IN - EPS,
      ),
    )
    checks.push([!tooTight, `${label} never puts designs closer than ${SHEET_GUTTER_IN} in`])

    checks.push([after <= before + EPS, `${label} is never longer than before (${before.toFixed(1)} -> ${after.toFixed(1)} in)`])
    checks.push([packed.pieces.length === scenario.items.length, `${label} keeps every design (${packed.pieces.length}/${scenario.items.length})`])

    const overflow = packed.pieces.filter((piece) => piece.xIn + piece.widthIn > packWidth + (cutOut ? MARK_CLEARANCE_IN : 0) + EPS)
    checks.push([overflow.length === 0, `${label} keeps every design inside the usable width`])

    const overlaps = []
    for (let i = 0; i < packed.pieces.length; i += 1) {
      for (let j = i + 1; j < packed.pieces.length; j += 1) {
        const a = packed.pieces[i]
        const b = packed.pieces[j]
        const apart =
          a.xIn + a.widthIn <= b.xIn + EPS ||
          b.xIn + b.widthIn <= a.xIn + EPS ||
          a.yIn + a.heightIn <= b.yIn + EPS ||
          b.yIn + b.heightIn <= a.yIn + EPS
        if (!apart) overlaps.push([i, j])
      }
    }
    checks.push([overlaps.length === 0, `${label} places no design on top of another (${overlaps.length} overlaps)`])

    if (cutOut) {
      const tooFarLeft = packed.pieces.filter((piece) => piece.xIn < MARK_CLEARANCE_IN - EPS)
      checks.push([tooFarLeft.length === 0, `${label} keeps designs clear of the crop marks`])
    }
  }
}

const gutterCase = packSheetBestGutter(repeat(4, 4, 2), packOptions(false, SHEET_WIDTH_IN))
const [first, second] = [...gutterCase.pieces].sort((a, b) => a.xIn - b.xIn)
checks.push([
  Math.abs(second.xIn - (first.xIn + first.widthIn) - PREFERRED_GUTTER_IN) < 1e-6,
  `designs with room to spare sit ${PREFERRED_GUTTER_IN} in apart`,
])

const oversize = packSheetBestGutter([{ widthIn: 30, heightIn: 5 }, { widthIn: 4, heightIn: 4 }], packOptions(false, SHEET_WIDTH_IN))
checks.push([oversize.pieces.length === 2, 'a design wider than the sheet is still placed rather than dropped'])

const cutWidth = SHEET_WIDTH_IN - MARK_CLEARANCE_IN * 2
const usable = cutWidth
const markLeftEdge = MARK_EDGE_IN
const markRightEdge = SHEET_WIDTH_IN - MARK_EDGE_IN

// Widest pair that still fits two up now the cut box is 0.3 in a side.
const maxTwoUp = (usable - CUT_GUTTER_IN) / 2
checks.push([maxTwoUp > 10 && maxTwoUp < 10.5, `the widest 2-up pair is ${maxTwoUp.toFixed(3)} in with a ${CUT_GUTTER_IN} in gap`])

const twoUp = packSheetBestGutter(repeat(10, 12, 2), packOptions(true, cutWidth))
const twoUpRow = twoUp.pieces.every((piece) => Math.abs(piece.yIn - twoUp.pieces[0].yIn) < EPS)
const twoUpGap = Math.abs(twoUp.pieces[1].xIn - twoUp.pieces[0].xIn) - 10
checks.push([twoUpRow, 'two 10 x 12 designs still sit side by side on a pre-cut sheet'])
checks.push([twoUp.contentEndY - CUT_ART_START_IN < 13, `they need one 12 in row, not two (${(twoUp.contentEndY - CUT_ART_START_IN).toFixed(1)} in)`])
checks.push([twoUpGap >= CUT_GUTTER_IN - EPS, `they keep ${twoUpGap.toFixed(3)} in between them, enough for both cut boxes`])

// Cut boxes must clear the printed marks and never reach into a neighbour.
for (const scenario of scenarios) {
  const packed = packSheetBestGutter(scenario.items, packOptions(true, cutWidth))
  const boxes = packed.pieces.map((piece) => ({
    left: piece.xIn - CUT_MARGIN_IN,
    right: piece.xIn + piece.widthIn + CUT_MARGIN_IN,
    top: piece.yIn - CUT_MARGIN_IN,
    bottom: piece.yIn + piece.heightIn + CUT_MARGIN_IN,
  }))
  const offMark = boxes.filter(
    (box) => box.left < markLeftEdge + MARK_SIZE_IN - EPS || box.right > markRightEdge - MARK_SIZE_IN + EPS,
  )
  checks.push([offMark.length === 0, `${scenario.name}: every ${CUT_MARGIN_IN} in cut box clears the printed crop marks`])

  let overlapping = 0
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      const apart = a.right <= b.left + EPS || b.right <= a.left + EPS || a.bottom <= b.top + EPS || b.bottom <= a.top + EPS
      if (!apart) overlapping += 1
    }
  }
  checks.push([overlapping === 0, `${scenario.name}: no cut box reaches into a neighbouring design (${overlapping})`])
}

checks.push([compose.includes('export function packSheetPieces'), 'packSheetPieces is exported from compose-sheet'])
checks.push([page.includes('packSheetBestGutter('), 'the builder uses packSheetBestGutter'])
checks.push([!page.includes('rows.push([design])'), 'the old upload-order packer is gone'])

console.log('scenario'.padEnd(44), 'before'.padStart(9), 'after'.padStart(9), 'saved'.padStart(7), 'gutter'.padStart(8))
for (const row of rows) {
  console.log(
    row.label.padEnd(44),
    `${row.before.toFixed(1)}in`.padStart(9),
    `${row.after.toFixed(1)}in`.padStart(9),
    `${row.pct.toFixed(0)}%`.padStart(7),
    `${row.gutter}in`.padStart(8),
  )
}
console.log()

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`packing checks failed: ${failed.length}`)
  process.exit(1)
}
console.log('\ngang sheets pack in two dimensions, shortest sheet first')
