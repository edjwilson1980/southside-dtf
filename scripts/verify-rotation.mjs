/**
 * Verifies the rotation-aware packer.
 *
 * Self-contained, in the style of verify-packing.mjs: the packer is reproduced
 * here in plain JS so this runs with no build step. If you change the real
 * packer in lib/compose-sheet.ts, mirror the change here.
 *
 *   node scripts/verify-rotation.mjs
 *
 * The guarantee this protects: allowing rotation must NEVER make a sheet
 * longer than it is without rotation. Rotation is chosen per whole layout,
 * with "no rotation" always among the candidates, so the result is the
 * shortest of the two by construction. A regression here costs customers
 * money on every order, silently.
 */

const EPS = 1e-6
const SHEET_WIDTH_IN = 22.3
const SHEET_GUTTER_IN = 0.125
const PREFERRED_GUTTER_IN = 0.25
const ART_INSET_IN = 0.125 + 1 + 1.5

const sheetOptions = [
  { length: 12, price: 8 }, { length: 24, price: 15 }, { length: 36, price: 24 },
  { length: 48, price: 30 }, { length: 60, price: 40 }, { length: 72, price: 48 },
  { length: 100, price: 60 }, { length: 120, price: 70 }, { length: 150, price: 90 },
  { length: 200, price: 115 },
]

function billedSheetLength(artLength) {
  const chargeable = Math.max(0, artLength - 1.5)
  const safeLength = Math.max(12, Math.ceil(chargeable - 1e-9))
  const full = Math.floor(safeLength / 200)
  const rem = safeLength % 200
  if (rem === 0) return Math.max(12, full * 200)
  const sheet = sheetOptions.find((o) => rem <= o.length) ?? sheetOptions.at(-1)
  return full * 200 + sheet.length
}

function priceFor(artLength) {
  const billed = billedSheetLength(artLength)
  const full = Math.floor(billed / 200)
  const rem = billed % 200
  const sheet = rem > 0 ? sheetOptions.find((o) => o.length === rem) ?? sheetOptions.at(-1) : null
  return { billed, price: full * 115 + (sheet?.price ?? 0) }
}

function splitFreeRect(free, used) {
  const noOverlap =
    used.xIn >= free.xIn + free.widthIn - EPS || used.xIn + used.widthIn <= free.xIn + EPS ||
    used.yIn >= free.yIn + free.heightIn - EPS || used.yIn + used.heightIn <= free.yIn + EPS
  if (noOverlap) return [free]
  const out = []
  if (used.yIn > free.yIn + EPS) out.push({ xIn: free.xIn, yIn: free.yIn, widthIn: free.widthIn, heightIn: used.yIn - free.yIn })
  if (used.yIn + used.heightIn < free.yIn + free.heightIn - EPS) out.push({ xIn: free.xIn, yIn: used.yIn + used.heightIn, widthIn: free.widthIn, heightIn: free.yIn + free.heightIn - (used.yIn + used.heightIn) })
  if (used.xIn > free.xIn + EPS) out.push({ xIn: free.xIn, yIn: free.yIn, widthIn: used.xIn - free.xIn, heightIn: free.heightIn })
  if (used.xIn + used.widthIn < free.xIn + free.widthIn - EPS) out.push({ xIn: used.xIn + used.widthIn, yIn: free.yIn, widthIn: free.xIn + free.widthIn - (used.xIn + used.widthIn), heightIn: free.heightIn })
  return out
}

const contains = (o, i) =>
  i.xIn >= o.xIn - EPS && i.yIn >= o.yIn - EPS &&
  i.xIn + i.widthIn <= o.xIn + o.widthIn + EPS && i.yIn + i.heightIn <= o.yIn + o.heightIn + EPS

function pruneFreeRects(rects) {
  const kept = []
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].widthIn <= EPS || rects[i].heightIn <= EPS) continue
    let covered = false
    for (let j = 0; j < rects.length; j++) {
      if (i !== j && contains(rects[j], rects[i]) && !(contains(rects[i], rects[j]) && j > i)) { covered = true; break }
    }
    if (!covered) kept.push(rects[i])
  }
  return kept
}

const SORTS = {
  tallest: (a, b) => (b.item.heightIn - a.item.heightIn) || (b.item.widthIn - a.item.widthIn) || (a.index - b.index),
  widest: (a, b) => (b.item.widthIn - a.item.widthIn) || (b.item.heightIn - a.item.heightIn) || (a.index - b.index),
  area: (a, b) => (b.item.widthIn * b.item.heightIn - a.item.widthIn * a.item.heightIn) || (a.index - b.index),
}

function orient(items, policy, packWidthIn) {
  return items.map((item) => {
    if (policy === 'none' || item.allowRotate === false) return item
    if (item.heightIn > packWidthIn + EPS) return item
    const w = item.widthIn, h = item.heightIn
    const turn =
      (policy === 'landscape' && h > w) ||
      (policy === 'portrait' && w > h) ||
      (policy === 'fitWidth' && w > packWidthIn + EPS)
    return turn ? { ...item, widthIn: h, heightIn: w, rotated: true } : item
  })
}

function packSheetPieces(items, { packWidthIn, gutterIn = SHEET_GUTTER_IN, startYIn = ART_INSET_IN, sort = 'tallest' }) {
  const stripWidth = packWidthIn + gutterIn
  const totalHeight = items.reduce((s, i) => s + i.heightIn + gutterIn, 0)
  let free = [{ xIn: 0, yIn: startYIn, widthIn: stripWidth, heightIn: totalHeight + startYIn + 1 }]
  const placed = []
  const unplaced = []
  const ordered = items.map((item, index) => ({ item, index })).sort(SORTS[sort])

  for (const { item } of ordered) {
    // No silent clamp: a piece too wide for the roll is reported, never squashed.
    if (item.widthIn > packWidthIn + EPS) { unplaced.push(item); continue }
    const boxWidth = item.widthIn + gutterIn
    const boxHeight = item.heightIn + gutterIn
    let found = false, bestY = Infinity, bestX = Infinity, bestFit = Infinity
    for (const r of free) {
      if (r.widthIn + EPS < boxWidth || r.heightIn + EPS < boxHeight) continue
      const fit = Math.min(r.widthIn - boxWidth, r.heightIn - boxHeight)
      if (r.yIn < bestY - EPS ||
          (Math.abs(r.yIn - bestY) <= EPS && fit < bestFit - EPS) ||
          (Math.abs(r.yIn - bestY) <= EPS && Math.abs(fit - bestFit) <= EPS && r.xIn < bestX - EPS)) {
        found = true; bestY = r.yIn; bestX = r.xIn; bestFit = fit
      }
    }
    if (!found) { unplaced.push(item); continue }
    free = pruneFreeRects(free.flatMap((r) => splitFreeRect(r, { xIn: bestX, yIn: bestY, widthIn: boxWidth, heightIn: boxHeight })))
    placed.push({ ...item, xIn: bestX, yIn: bestY })
  }

  const contentBottom = placed.reduce((m, p) => Math.max(m, p.yIn + p.heightIn), startYIn)
  return { pieces: placed, unplaced: unplaced.length, contentBottom, contentEndY: contentBottom + gutterIn }
}

const gutterChoices = (min) => {
  const preferred = Math.max(PREFERRED_GUTTER_IN, min)
  return [preferred, (preferred + min) / 2, min]
}

function packSheetBestGutter(items, opts, policies = ['none', 'fitWidth', 'landscape', 'portrait']) {
  const gutters = gutterChoices(opts.minGutterIn ?? SHEET_GUTTER_IN)
  let best
  for (const policy of policies) {
    const oriented = orient(items, policy, opts.packWidthIn)
    for (const sort of Object.keys(SORTS)) {
      for (const gutterIn of gutters) {
        const c = packSheetPieces(oriented, { ...opts, gutterIn, sort })
        if (!best || c.unplaced < best.unplaced ||
            (c.unplaced === best.unplaced && c.contentBottom < best.contentBottom - EPS)) {
          best = { ...c, policy, sort, gutterIn }
        }
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const expand = (list) => list.flatMap(([name, w, h, q]) =>
  Array.from({ length: q }, () => ({ name, widthIn: w, heightIn: h })))

const jobs = {
  'Wide back print + shirts': expand([
    ['Back print 20x5', 20, 5, 4], ['Adult L', 10.5, 12, 6], ['Left chest', 3.75, 3.75, 10],
  ]),
  'Sleeve prints (long + thin)': expand([
    ['Sleeve 16x3', 16, 3, 12], ['Adult M', 10.5, 12, 4],
  ]),
  'Mixed shop day': expand([
    ['Banner 22x6', 22, 6, 2], ['Hoodie', 13, 15, 3], ['Youth', 9.25, 10, 6],
    ['Sleeve 14x2.5', 14, 2.5, 8], ['Left chest', 3.75, 3.75, 12],
  ]),
  'All portrait (control)': expand([
    ['Adult L', 10.5, 12, 12], ['Youth', 9.25, 10, 8],
  ]),
  'Tall narrow banners': expand([
    ['Banner 4x20', 4, 20, 8], ['Left chest', 3.75, 3.75, 6],
  ]),
  'Single oversized, fits only turned': [{ name: 'Wide 22x4', widthIn: 22, heightIn: 4 }],
}

const artLen = (r) => Math.max(0, r.contentEndY - ART_INSET_IN)

console.log('Rotation packer checks\n')

console.log('1. Rotation never makes a sheet longer')
let saved = 0
for (const [label, items] of Object.entries(jobs)) {
  const noRot = packSheetBestGutter(items, { packWidthIn: SHEET_WIDTH_IN }, ['none'])
  const best = packSheetBestGutter(items, { packWidthIn: SHEET_WIDTH_IN })
  const a = priceFor(artLen(noRot)), b = priceFor(artLen(best))
  saved += a.price - b.price
  const turned = best.pieces.filter((p) => p.rotated).length
  check(
    `${label}: ${a.billed}in -> ${b.billed}in`,
    b.billed <= a.billed,
    `$${a.price} -> $${b.price}, ${turned} turned, strategy ${best.policy}/${best.sort}`,
  )
}
console.log(`  Total saved across these jobs: $${saved}\n`)

console.log('2. Nothing overlaps and nothing exceeds the sheet width')
for (const [label, items] of Object.entries(jobs)) {
  const r = packSheetBestGutter(items, { packWidthIn: SHEET_WIDTH_IN })
  let overlaps = 0
  for (let i = 0; i < r.pieces.length; i++) {
    for (let j = i + 1; j < r.pieces.length; j++) {
      const p = r.pieces[i], q = r.pieces[j]
      if (p.xIn < q.xIn + q.widthIn - EPS && p.xIn + p.widthIn > q.xIn + EPS &&
          p.yIn < q.yIn + q.heightIn - EPS && p.yIn + p.heightIn > q.yIn + EPS) overlaps++
    }
  }
  const tooWide = r.pieces.filter((p) => p.xIn + p.widthIn > SHEET_WIDTH_IN + EPS)
  check(`${label}: no overlaps`, overlaps === 0, `${overlaps} pairs`)
  check(`${label}: inside the roll`, tooWide.length === 0, `${tooWide.length} over the edge`)
}
console.log()

console.log('3. Everything gets placed')
for (const [label, items] of Object.entries(jobs)) {
  const r = packSheetBestGutter(items, { packWidthIn: SHEET_WIDTH_IN })
  check(`${label}: ${r.pieces.length}/${items.length} placed`,
    r.pieces.length === items.length && r.unplaced === 0)
}
console.log()

console.log('4. An all-portrait job is left alone')
{
  const r = packSheetBestGutter(jobs['All portrait (control)'], { packWidthIn: SHEET_WIDTH_IN })
  check('nothing rotated', r.pieces.every((p) => !p.rotated))
}
console.log()

console.log('5. A design too wide to lie flat is rescued by turning it')
{
  const narrow = 10
  const r = packSheetBestGutter(jobs['Single oversized, fits only turned'], { packWidthIn: narrow })
  check('placed by rotating', r.pieces.length === 1 && r.pieces[0].rotated === true)
  check('fits the narrow width', r.pieces.every((p) => p.xIn + p.widthIn <= narrow + EPS))
}
console.log()

console.log('6. allowRotate: false is respected')
{
  const items = [{ name: 'locked', widthIn: 16, heightIn: 3, allowRotate: false },
                 { name: 'free', widthIn: 16, heightIn: 3 }]
  const r = packSheetBestGutter(items, { packWidthIn: SHEET_WIDTH_IN })
  const locked = r.pieces.find((p) => p.name === 'locked')
  check('locked piece stayed upright', locked && !locked.rotated &&
    Math.abs(locked.widthIn - 16) < EPS)
}
console.log()

console.log('7. Packing is deterministic')
{
  const items = jobs['Mixed shop day']
  const runs = Array.from({ length: 5 }, () =>
    priceFor(artLen(packSheetBestGutter(items, { packWidthIn: SHEET_WIDTH_IN }))).price)
  check('5 runs, identical price', new Set(runs).size === 1, runs.join(', '))
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
