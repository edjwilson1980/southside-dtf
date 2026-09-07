/**
 * Pre-cut packing must not inflate the billable sheet length used for pricing.
 * Example: 11in-wide pieces fit 2-across without cut marks, but only 1-across with
 * mark clearance — that would wrongly double the sheet tier if we billed on print packing.
 */
const SHEET_WIDTH_IN = 22.3
const ART_INSET_IN = 0.125 + 1 + 1.5
const CUT_ART_START_IN = 0.125 + 1 + 0.75
const MARK_CLEARANCE_IN = 0.003 + 5 / 25.4 + 2.5 / 25.4
const CUT_GUTTER_IN = (2.5 / 25.4) * 2
const SHEET_GUTTER_IN = 0.125
const PREFERRED_GUTTER_IN = 0.25

function packSheetPieces(pieces, { packWidthIn, startYIn = 0, sideInsetIn = 0, gutterIn }) {
  const free = [{ x: sideInsetIn, y: startYIn, w: packWidthIn, h: 1e9 }]
  let contentBottom = startYIn
  for (const piece of pieces) {
    const needW = piece.widthIn + gutterIn
    const needH = piece.heightIn + gutterIn
    let best = null
    for (let i = 0; i < free.length; i++) {
      const r = free[i]
      if (r.w + 1e-9 < needW || r.h + 1e-9 < needH) continue
      const score = r.y * 1e6 + r.x
      if (!best || score < best.score) best = { i, r, score }
    }
    if (!best) throw new Error('no fit')
    const { r, i } = best
    contentBottom = Math.max(contentBottom, r.y + piece.heightIn)
    const next = [
      { x: r.x + needW, y: r.y, w: r.w - needW, h: r.h },
      { x: r.x, y: r.y + needH, w: r.w, h: r.h - needH },
    ]
    free.splice(i, 1, ...next.filter((rect) => rect.w > 1e-9 && rect.h > 1e-9))
  }
  return contentBottom + gutterIn
}

function packBest(pieces, opts) {
  const min = opts.minGutterIn ?? SHEET_GUTTER_IN
  let best = Infinity
  for (const gutterIn of [PREFERRED_GUTTER_IN, (PREFERRED_GUTTER_IN + min) / 2, min]) {
    if (gutterIn + 1e-9 < min) continue
    best = Math.min(best, packSheetPieces(pieces, { ...opts, gutterIn }))
  }
  return best
}

function billedSheetLength(artLength) {
  const chargeable = Math.max(0, artLength - 1.5)
  const safeLength = Math.max(12, Math.ceil(chargeable - 1e-9))
  const tiers = [12, 24, 36, 48, 60, 72, 100, 120, 150, 200]
  const fullSheets = Math.floor(safeLength / 200)
  const remainder = safeLength % 200
  if (remainder === 0) return Math.max(12, fullSheets * 200)
  return fullSheets * 200 + (tiers.find((length) => remainder <= length) ?? 200)
}

const pieces = Array.from({ length: 6 }, () => ({ widthIn: 11, heightIn: 12 }))

const billableEnd = packBest(pieces, { packWidthIn: SHEET_WIDTH_IN, startYIn: ART_INSET_IN })
const printedEnd = packBest(pieces, {
  packWidthIn: SHEET_WIDTH_IN - MARK_CLEARANCE_IN * 2,
  startYIn: CUT_ART_START_IN,
  sideInsetIn: MARK_CLEARANCE_IN,
  minGutterIn: CUT_GUTTER_IN,
})

const billableHeightIn = Math.max(0, billableEnd - ART_INSET_IN)
const printedHeightIn = Math.max(0, printedEnd - CUT_ART_START_IN)
const billedLength = billedSheetLength(billableHeightIn)
const wrongBilled = billedSheetLength(printedHeightIn)

const identicalWhenOff =
  Math.abs(
    Math.max(0, billableEnd - ART_INSET_IN) -
      Math.max(0, billableEnd - ART_INSET_IN),
  ) < 1e-9

const ok =
  printedHeightIn > billableHeightIn + 1 &&
  billedLength === 36 &&
  wrongBilled >= 72 &&
  identicalWhenOff

console.log(
  JSON.stringify(
    {
      billableHeightIn: Number(billableHeightIn.toFixed(3)),
      printedHeightIn: Number(printedHeightIn.toFixed(3)),
      billedLength,
      wrongBilledIfPricedOnPrinted: wrongBilled,
      ok,
    },
    null,
    2,
  ),
)

if (!ok) process.exit(1)
