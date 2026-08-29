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
const MARK_INSET_IN = 2 / 25.4
const CUT_MARGIN_IN = 2 / 25.4
const MARK_CLEARANCE_IN = MARK_INSET_IN + MARK_PAD_IN * 2 + MARK_SIZE_IN + CUT_MARGIN_IN
const LABEL_HEIGHT_IN = 1
const LABEL_PAD_IN = 0.125
const LABEL_MARGIN_IN = 0.75
const CUT_ART_START_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + LABEL_MARGIN_IN
const EPS = 1e-6

/** The packer that shipped before this change: next-fit rows in upload order. */
function lengthNextFit(items, packWidthIn, cutOut) {
  const rows = items.reduce((acc, item) => {
    const current = acc[acc.length - 1]
    const currentWidth = current?.reduce((sum, entry) => sum + entry.widthIn, 0) ?? 0
    const gutters = current ? current.length * SHEET_GUTTER_IN : 0
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
    yIn += rowHeight + SHEET_GUTTER_IN
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

  const contentEndY = placed.reduce((max, piece) => Math.max(max, piece.yIn + piece.heightIn + gutterIn), startYIn)
  return { pieces: placed, contentEndY }
}

function packOptions(cutOut, packWidthIn) {
  return cutOut
    ? { packWidthIn, startYIn: CUT_ART_START_IN, sideInsetIn: MARK_CLEARANCE_IN }
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
    const packed = packSheetPieces(scenario.items, packOptions(cutOut, packWidth))
    const after = packed.contentEndY - CUT_ART_START_IN
    const label = `${scenario.name}${cutOut ? ' (pre-cut)' : ''}`
    rows.push({ label, before, after, pct: before > 0 ? ((before - after) / before) * 100 : 0 })

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

const gutterCase = packSheetPieces(repeat(4, 4, 2), packOptions(false, SHEET_WIDTH_IN))
const [first, second] = [...gutterCase.pieces].sort((a, b) => a.xIn - b.xIn)
checks.push([
  Math.abs(second.xIn - (first.xIn + first.widthIn) - SHEET_GUTTER_IN) < 1e-6,
  'neighbouring designs keep exactly one gutter between them',
])

const oversize = packSheetPieces([{ widthIn: 30, heightIn: 5 }, { widthIn: 4, heightIn: 4 }], packOptions(false, SHEET_WIDTH_IN))
checks.push([oversize.pieces.length === 2, 'a design wider than the sheet is still placed rather than dropped'])

checks.push([compose.includes('export function packSheetPieces'), 'packSheetPieces is exported from compose-sheet'])
checks.push([page.includes('packSheetPieces('), 'the builder uses packSheetPieces'])
checks.push([!page.includes('rows.push([design])'), 'the old upload-order packer is gone'])

console.log('scenario'.padEnd(44), 'before'.padStart(9), 'after'.padStart(9), 'saved'.padStart(7))
for (const row of rows) {
  console.log(
    row.label.padEnd(44),
    `${row.before.toFixed(1)}in`.padStart(9),
    `${row.after.toFixed(1)}in`.padStart(9),
    `${row.pct.toFixed(0)}%`.padStart(7),
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
