// Checks lib/sheet-pages.ts: jobs longer than 200 in are packed onto separate
// sheets, each labelled "N of M", each billed on its own ladder tier.
// Run: node scripts/verify-sheet-pages.mjs
import { loadLib } from './load-lib.mjs'

const pages = await loadLib('lib/sheet-pages.ts')
const names = await loadLib('lib/sheet-name.ts')
const compose = await loadLib('lib/compose-sheet.ts')
const pricing = await loadLib('lib/sheet-pricing.ts')

let failed = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed++
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// 1. Server-side split of a total (mirrors the plugin's ssgs_split_billed_length).
check(same(pages.splitBilledLength(500), [200, 200, 100]), 'split 500 → 200 + 200 + 100')
check(same(pages.splitBilledLength(212), [200, 12]), 'split 212 → 200 + 12')
check(same(pages.splitBilledLength(400), [200, 200]), 'split 400 → 200 + 200')
check(same(pages.splitBilledLength(199), [200]), 'split 199 → 200 (snaps to the tier)')
check(same(pages.splitBilledLength(36), [36]), 'split 36 → 36')
check(same(pages.splitBilledLength(0), []), 'split 0 → nothing')

// 2. Tier for one sheet's art length (1.5 in grace, never above 200).
check(pages.sheetTierForArtLength(37.4).length === 36, '37.4 in of art bills as 36 (1.5 in grace)')
check(pages.sheetTierForArtLength(37.6).length === 48, '37.6 in of art bills as 48')
check(pages.sheetTierForArtLength(201.5).length === 200, '201.5 in of art still bills as 200')
check(pages.sheetTierForArtLength(1).length === 12, 'tiny art bills the 12 in minimum')

// 3. Labels and file names carry the part.
check(pages.partLabel(0, 3) === '1 of 3' && pages.partLabel(2, 3) === '3 of 3', 'partLabel 1 of 3 … 3 of 3')
const stamp = '10/15 1200'
check(names.sheetJobName('Jane Doe', 200, stamp, { index: 1, count: 3 }) === 'Jane Doe 10/15 1200     (200) 2 of 3', `job name: ${names.sheetJobName('Jane Doe', 200, stamp, { index: 1, count: 3 })}`)
check(names.sheetJobName('Jane Doe', 36, stamp, { index: 0, count: 1 }) === 'Jane Doe 10/15 1200     (36)', 'single sheet has no part suffix')
check(names.sheetFileName('Jane Doe', 100, stamp, { index: 2, count: 3 }) === 'Jane Doe 10-15 1200 (100) 3 of 3.png', `file name: ${names.sheetFileName('Jane Doe', 100, stamp, { index: 2, count: 3 })}`)
check(names.sheetCutFileName('Jane Doe', 100, stamp, { index: 2, count: 3 }) === 'Jane Doe 10-15 1200 (100) 3 of 3 cut.plt', 'cut file name carries the part')
check(names.sheetJobName('Jane Doe', 36, stamp, 2) === 'Jane Doe 10/15 1200     (36) 2', 'legacy copy number still works')

// 4. A 520 in job: 82 adult fronts (10.5 × 12), two across, 16 rows per 200 in sheet.
const front = { widthIn: 10.5, heightIn: 12, allowRotate: false }
const big = Array.from({ length: 82 }, (_, i) => ({ ...front, previewUrl: `d${i}` }))
const job = pages.paginateGangSheet(big, { cutOut: false })
const placed = job.pages.reduce((sum, page) => sum + page.layout.pieces.length, 0)
check(job.tooLarge.length === 0 && placed === 82, `all 82 pieces placed across ${job.sheetCount} sheets`)
check(job.sheetCount === 3, `82 fronts need 3 sheets (${job.sheetCount})`)
check(job.pages.every((page) => page.billableHeightIn <= 200 + compose.PRINT_MARGIN_IN + 1e-6), 'no sheet packs more art than one 200 in sheet holds')
check(job.pages.every((page) => page.billedLength <= pages.MAX_SHEET_LENGTH_IN), 'every sheet bills at or under 200')
check(same(job.pages.map((page) => page.billedLength), [200, 200, 120]), `tiers ${job.pages.map((page) => page.billedLength).join(' + ')}`)
check(job.billedLength === 520 && job.price === 115 + 115 + 70, `total 520 in = $${job.price} (115 + 115 + 70)`)
check(job.breakdown === '2 × 200 in + 120 in', `breakdown "${job.breakdown}"`)
check(same(job.partLabels, ['1 of 3', '2 of 3', '3 of 3']), 'part labels 1 of 3, 2 of 3, 3 of 3')
check(job.pages.every((page, index) => page.index === index), 'page indexes are in order')
check(job.pages[0].label === '22.3 × 200 in' && job.pages[2].label === '22.3 × 120 in', 'per-sheet labels')
check(job.pages.every((page) => page.marks.length === 0 && page.cutBoxes.length === 0), 'no marks or cut boxes without pre-cut')
// Pieces never overlap and never leave the film on any page.
for (const page of job.pages) {
  const pieces = page.layout.pieces
  const inside = pieces.every((p) => p.xIn >= -1e-6 && p.xIn + p.widthIn <= compose.SHEET_WIDTH_IN + 1e-6 && p.yIn + p.heightIn <= page.printHeight + 1e-6)
  let overlap = false
  for (let i = 0; i < pieces.length && !overlap; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j]
      if (a.xIn < b.xIn + b.widthIn - 1e-6 && b.xIn < a.xIn + a.widthIn - 1e-6 && a.yIn < b.yIn + b.heightIn - 1e-6 && b.yIn < a.yIn + a.heightIn - 1e-6) { overlap = true; break }
    }
  }
  check(inside && !overlap, `sheet ${pages.partLabel(page.index, job.sheetCount)}: ${pieces.length} pieces inside the film, none overlapping`)
}

// 5. The same job with pre-cut: marks + cut boxes per sheet, billing unchanged by cut spacing.
const cutJob = pages.paginateGangSheet(big, { cutOut: true })
check(cutJob.tooLarge.length === 0 && cutJob.pages.reduce((s, p) => s + p.layout.pieces.length, 0) === 82, 'pre-cut: all 82 pieces placed')
check(cutJob.pages.every((page) => page.marks.length > 0 && page.cutBoxes.length === page.layout.pieces.length && page.startArrow.length === 3), 'pre-cut: every sheet has registration marks, a cut box per piece and a start arrow')
check(cutJob.pages.every((page) => page.printedHeightIn >= page.billableHeightIn - 1e-6), 'pre-cut: printed length ≥ billable length on every sheet')
check(cutJob.pages.every((page) => page.billedLength <= pages.MAX_SHEET_LENGTH_IN), 'pre-cut: every sheet still bills at or under 200')
check(cutJob.pages.every((page) => !page.cutTooTall), 'pre-cut: 12 in fronts fit one cutter pass')

// 6. Small job is one sheet, same as before.
const small = pages.paginateGangSheet(Array.from({ length: 4 }, (_, i) => ({ ...front, previewUrl: `s${i}` })), { cutOut: false })
check(small.sheetCount === 1 && small.pages[0].billedLength === 24 && small.price === 15 && small.breakdown === '22.3 × 24 in', `4 fronts: one ${small.breakdown} sheet for $${small.price}`)
check(same(small.partLabels, ['1 of 1']), 'single sheet labelled 1 of 1')

// 7. Exactly-full sheets: 199 in of art on each of two sheets → 200 + 200, not 200 + 200 + 12.
const tall = Array.from({ length: 4 }, (_, i) => ({ widthIn: 10, heightIn: 199, allowRotate: false, previewUrl: `t${i}` }))
const exact = pages.paginateGangSheet(tall, { cutOut: false })
check(same(exact.pages.map((page) => page.billedLength), [200, 200]) && exact.price === 230, `two 199 in pieces per sheet → ${exact.breakdown} for $${exact.price}`)

// 8. Something that cannot fit any sheet is reported, not silently dropped.
const impossible = pages.paginateGangSheet([{ widthIn: 10, heightIn: 230, allowRotate: false, previewUrl: 'x' }, { ...front, previewUrl: 'ok' }], { cutOut: false })
check(impossible.tooLarge.length === 1 && impossible.pages.length === 1 && impossible.pages[0].layout.pieces.length === 1, 'a 230 in piece is reported too large; the rest still packs')

// 9. Ladder sanity: per-sheet price equals the pricing table's tier price.
check(job.pages.every((page) => pricing.sheetOptions.find((o) => o.length === page.billedLength)?.price === page.price), 'per-sheet prices come from the ladder')

console.log(failed ? `\n${failed} check(s) failed` : '\nAll sheet-page checks passed')
process.exit(failed ? 1 : 0)
