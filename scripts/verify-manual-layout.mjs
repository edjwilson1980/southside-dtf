// Checks lib/manual-layout.ts: the manual builder's placement rules, and that a
// hand-placed sheet goes through the same pages / marks / cut boxes / PLT as an
// automatic one.
// Run: node scripts/verify-manual-layout.mjs
import { loadLib } from './load-lib.mjs'

const manual = await loadLib('lib/manual-layout.ts')
const pages = await loadLib('lib/sheet-pages.ts')
const compose = await loadLib('lib/compose-sheet.ts')
const cut = await loadLib('lib/cut-layout.ts')
const pricing = await loadLib('lib/sheet-pricing.ts')

let failed = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed++
}
const close = (a, b) => Math.abs(a - b) < 1e-6
const W = compose.SHEET_WIDTH_IN
const kinds = (problems) => problems.map((p) => p.kind).sort().join(',')

// 1. Working area follows the packer's own insets.
const plain = manual.manualArtArea({ workingLengthIn: 24, cutOut: false, sheetWidthIn: W })
const precut = manual.manualArtArea({ workingLengthIn: 24, cutOut: true, sheetWidthIn: W })
check(close(plain.top, compose.ART_INSET_IN) && plain.left === 0 && close(plain.right, W), 'print-only area starts at ART_INSET_IN, full width')
check(close(precut.top, compose.CUT_ART_START_IN) && close(precut.left, cut.MARK_CLEARANCE_IN) && close(precut.right, W - cut.MARK_CLEARANCE_IN), 'pre-cut area clears the cut-mark columns')
check(close(plain.bottom, plain.top + 24 + compose.PRINT_MARGIN_IN), 'a 24 in working sheet holds 24 + 1.5 in of art (billing grace)')
check(close(precut.minGapIn, cut.CUT_GUTTER_IN) && close(plain.minGapIn, compose.SHEET_GUTTER_IN), 'minimum gap: two cut margins with pre-cut, ⅛ in without')

// 2. Rules.
const at = (xIn, yIn, widthIn = 3, heightIn = 3) => ({ xIn, yIn, widthIn, heightIn })
const y0 = precut.top
const x0 = precut.left
check(manual.validateManualLayout([at(x0, y0), at(x0 + 4, y0)], precut, true).length === 0, 'two well-spaced designs: no problems')
check(kinds(manual.validateManualLayout([at(x0, y0), at(x0 + 2, y0)], precut, true)) === 'overlap,overlap', 'overlapping designs are both flagged')
check(kinds(manual.validateManualLayout([at(x0, y0), at(x0 + 3.1, y0)], precut, true)) === 'too-close,too-close', '0.1 in apart with pre-cut: cut lines would touch')
check(manual.validateManualLayout([at(x0, y0), at(x0 + 3.2, y0)], precut, true).length === 0, '0.2 in apart with pre-cut is enough')
check(manual.validateManualLayout([at(0, plain.top), at(3.15, plain.top)], plain, false).length === 0, '0.15 in apart without pre-cut is enough')
check(kinds(manual.validateManualLayout([at(0, y0)], precut, true)) === 'outside', 'pre-cut: touching the left edge crosses the mark column')
check(kinds(manual.validateManualLayout([at(x0, 0.5)], precut, true)) === 'outside', 'art in the label strip is flagged')
check(kinds(manual.validateManualLayout([at(x0, precut.bottom - 2)], precut, true)) === 'outside', 'art past the working length is flagged')
check(kinds(manual.validateManualLayout([at(x0, y0, 5, 20)], { ...precut, bottom: 100 }, true)) === 'too-tall', 'a 20 in tall design cannot be cut in one pass')
check(manual.validateManualLayout([at(0, plain.top, 5, 20)], { ...plain, bottom: 100 }, false).length === 0, 'a 20 in tall design is fine print-only')

// 3. A packer-made layout fed back through manualSheetPage matches paginateGangSheet.
const items = [
  ...Array.from({ length: 2 }, () => ({ previewUrl: 'front', widthIn: 10.5, heightIn: 12, allowRotate: true })),
  ...Array.from({ length: 6 }, () => ({ previewUrl: 'chest', widthIn: 3.75, heightIn: 3.75, allowRotate: true })),
]
for (const cutOut of [false, true]) {
  const auto = pages.paginateGangSheet(items, { cutOut })
  const page = auto.pages[0]
  const placed = page.layout.pieces
  const area = manual.manualArtArea({ workingLengthIn: page.billedLength, cutOut, sheetWidthIn: W })
  const mine = manual.manualSheetPage(placed, { workingLengthIn: page.billedLength, cutOut, sheetWidthIn: W, ladder: pricing.sheetOptions, trailingGapIn: page.layout.gutterIn })
  const tag = cutOut ? 'pre-cut' : 'print-only'
  check(manual.validateManualLayout(placed, area, cutOut).length === 0, `${tag}: the packer's own layout passes the manual rules`)
  check(close(mine.printHeight, page.printHeight), `${tag}: same film length (${mine.printHeight.toFixed(2)} in)`)
  check(JSON.stringify(mine.markBounds) === JSON.stringify(page.markBounds), `${tag}: same registration marks`)
  check(JSON.stringify(mine.cutBoxes) === JSON.stringify(page.cutBoxes), `${tag}: same cut boxes`)
  if (!cutOut) check(mine.billedLength === page.billedLength && mine.price === page.price, `${tag}: same tier and price (${mine.label}, $${mine.price})`)
  if (cutOut) {
    const plt = cut.cutPlt(mine.layout.pieces, mine.printHeight, W)
    const boxes = cut.cutPreviewBoxes(mine.layout.pieces, W, mine.printHeight)
    check(Boolean(plt) && boxes.length === items.length, `${tag}: cutter PLT builds with one box per transfer (${boxes.length})`)
    const markX = mine.markBounds.map((m) => m.xIn + m.widthIn)
    check(Math.max(...markX) <= W + 1e-6, `${tag}: marks stay inside ${W} in`)
  }
}

// 4. Billing follows how far down the art goes, not the working length.
const deep = manual.manualSheetPage([{ previewUrl: 'x', ...at(0, plain.top, 10, 10) }], { workingLengthIn: 120, cutOut: false, sheetWidthIn: W, ladder: pricing.sheetOptions })
check(deep.billedLength === 12 && deep.price === 8, `10 in of art on a 120 in working sheet bills ${deep.label} ($${deep.price})`)
const low = manual.manualSheetPage([{ previewUrl: 'x', ...at(0, plain.top + 30, 10, 10) }], { workingLengthIn: 48, cutOut: false, sheetWidthIn: W, ladder: pricing.sheetOptions })
check(low.billedLength === 48, `art reaching 40 in down bills ${low.label}`)
// The plugin bills min(billable, printed) and picks the smallest size ≥ floor(that), so it must land on the same tier.
const pluginTier = (page) => {
  const billed = Math.min(page.billedLength, page.printedHeightIn)
  return pricing.sheetOptions.find((o) => o.length + 0.01 >= Math.floor(billed + 1e-9))?.length
}
check([deep, low].every((page) => pluginTier(page) === page.billedLength), 'the store plugin bills the same sheet size the builder shows')

// 5. Auto-arrange fills the remaining space below what is placed, inside the area.
const placedOne = [{ ...at(x0, y0, 10.5, 12) }]
const arranged = manual.autoArrangeRemaining(placedOne, Array.from({ length: 6 }, () => ({ widthIn: 3.75, heightIn: 3.75, allowRotate: true })), precut)
const all = [...placedOne, ...arranged.pieces]
check(arranged.pieces.length === 6 && arranged.unplaced.length === 0, 'auto-arrange places all six left chests')
check(manual.validateManualLayout(all, precut, true).length === 0, 'auto-arranged layout passes the rules')
const tight = manual.autoArrangeRemaining([], Array.from({ length: 40 }, () => ({ widthIn: 10.5, heightIn: 12, allowRotate: false })), precut)
check(tight.unplaced.length > 0 && manual.validateManualLayout(tight.pieces, precut, true).length === 0, `what does not fit stays in the tray (${tight.unplaced.length} left)`)

// 6. The black frame is a hard stop: anything asked for outside lands on the frame.
for (const area of [plain, precut]) {
  const tag = area === precut ? 'pre-cut' : 'print-only'
  const box = { widthIn: 4, heightIn: 3 }
  const far = [[-10, -10], [100, -10], [-10, 100], [100, 100]].map(([xIn, yIn]) => manual.clampToArea({ xIn, yIn, ...box }, area))
  const onFrame = far.every((spot) => spot.hit &&
    (close(spot.xIn, area.left) || close(spot.xIn + 4, area.right)) && (close(spot.yIn, area.top) || close(spot.yIn + 3, area.bottom)))
  check(onFrame, `${tag}: dragging past every corner stops exactly on the frame`)
  check(!manual.clampToArea({ xIn: area.left + 1, yIn: area.top + 1, ...box }, area).hit, `${tag}: a spot inside the frame is left alone`)
}

// 7. Resizing: proportions locked, ⅛ in steps, ½ in minimum, never past the frame.
const startRect = { xIn: x0 + 1, yIn: y0 + 1, widthIn: 4, heightIn: 2 }
const grown = manual.scaleWithin(startRect, 1, 1.5, 'se', precut)
check(close(grown.widthIn, 6) && close(grown.heightIn, 3) && close(grown.xIn, startRect.xIn) && close(grown.yIn, startRect.yIn), 'corner drag ×1.5: 4×2 → 6×3, top-left stays put')
const fromLeft = manual.scaleWithin(startRect, 1, 1.5, 'w', precut)
check(close(fromLeft.xIn + fromLeft.widthIn, startRect.xIn + 4) && close(fromLeft.yIn + fromLeft.heightIn / 2, startRect.yIn + 1), 'left-side drag keeps the right edge and the vertical centre')
const huge = manual.scaleWithin(startRect, 1, 50, 'se', precut)
check(huge.hit && huge.xIn + huge.widthIn <= precut.right + 1e-6 && huge.yIn + huge.heightIn <= precut.bottom + 1e-6 && close(huge.widthIn / huge.heightIn, 2), 'growing into the frame stops at it, still 2:1')
const tiny = manual.scaleWithin(startRect, 1, 0.01, 'se', precut)
check(close(tiny.heightIn, 0.5) && close(tiny.widthIn, 1), 'shrinking stops at ½ in on the short side')
check(Math.abs(grown.widthIn * 8 - Math.round(grown.widthIn * 8)) < 1e-6 && close(grown.scale, 1.5), 'width snaps to ⅛ in and the scale follows')
check(close(manual.resizeFactor(startRect, 'se', { xIn: startRect.xIn + 8, yIn: startRect.yIn + 2 }), 2), 'corner handle uses the larger of the two stretches')

console.log(failed ? `\n${failed} check(s) failed` : '\nAll manual-layout checks passed')
process.exit(failed ? 1 : 0)
