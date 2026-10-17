// Checks the server-side Confirm & Build (lib/server/ingest-project.ts) without Drive:
// rows → trimmed designs → shop packing → composed PNG, against the shop's own rules.
// Run: node scripts/verify-ingest.mjs [out.png]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Like load-lib.mjs, but keeps native/CommonJS packages (sharp, googleapis)
 * external, and writes the bundle inside the repo so they resolve from node_modules.
 */
async function loadLib(entry) {
  const dir = join(root, 'node_modules', '.cache', 'verify-ingest')
  mkdirSync(dir, { recursive: true })
  const out = join(dir, entry.replace(/[\/]/g, '_').replace(/\.ts$/, '.mjs'))
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    alias: { '@': root },
    external: ['sharp', 'googleapis'],
    logLevel: 'error',
  })
  return import(pathToFileURL(out).href)
}

const ingest = await loadLib('lib/server/ingest-project.ts')
const compose = await loadLib('lib/server/compose-sheet-node.ts')
const sheet = await loadLib('lib/compose-sheet.ts')
const sizes = await loadLib('lib/shop-sizes.ts')

let failed = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed++
}

// Art with transparent padding around it, so trimming has something to do.
async function art(w, h, pad, color) {
  const inner = await sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer()
  const png = await sharp({ create: { width: w + pad * 2, height: h + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, left: pad, top: pad }])
    .png()
    .toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

const project = {
  format: 'ssp-gangsheet-project',
  schemaVersion: 2,
  projectId: 'verify',
  name: 'test 1 · MP-901',
  createdAt: '2026-10-15T15:00:00.000Z',
  updatedAt: '2026-10-15T15:00:00.000Z',
  source: 'shop-builder',
  revision: 1,
  customer: { name: 'test 1' },
  cut: { enabled: false },
  images: [
    { id: 1, name: 'Front', placement: 'Adult Shirt', size: 'Medium · 10.5 × 12 in', quantity: 6, keepUpright: false, dataUrl: await art(3150, 1500, 40, { r: 200, g: 16, b: 46, alpha: 1 }) },
    { id: 2, name: 'Left chest', placement: 'Left Chest', size: 'Standard Left Chest · 3.75 × 3.75 in', quantity: 6, dataUrl: await art(1125, 1125, 0, { r: 31, g: 78, b: 140, alpha: 1 }) },
    { id: 3, name: '12 x 18 custom', placement: 'Custom', size: '12 × 18 in', customWidth: '12', customHeight: '18', quantity: 2, dataUrl: await art(2400, 3600, 10, { r: 20, g: 120, b: 60, alpha: 1 }) },
  ],
  orderRefs: [{ system: 'mockup-pro', orderNumber: 'MP-901' }],
}

// 1. Rows → designs, the Reopen Project way.
const designs = await ingest.designsFromProject(project)
check(designs.length === 3, 'three designs restored')
// The shop keeps 1 px of padding around trimmed art (TRIM_PAD).
check(designs[0].art.width === 3152 && designs[0].art.height === 1502, `padding trimmed to the art + 1 px (${designs[0].art.width}×${designs[0].art.height})`)
check(sizes.sizeOptions['Adult Shirt'].includes(designs[0].size), 'garment size kept as a shop size')
check(Math.abs(designs[0].sizeIn.w - 10.5) < 1e-6, `front prints 10.5 in wide (${designs[0].sizeIn.w.toFixed(2)})`)
check(Math.abs(designs[2].sizeIn.w - 12) < 1e-6 && Math.abs(designs[2].sizeIn.h - 18) < 0.01, `custom prints 12 × 18 (${designs[2].sizeIn.w}×${designs[2].sizeIn.h.toFixed(3)})`)

// 2. Layout = the shop's packing call with the same pieces.
const layout = ingest.layoutSheet(designs, false)
const direct = sheet.packSheetBestGutter(
  designs.flatMap((d) => Array.from({ length: d.quantity }, () => ({ previewUrl: d.key, widthIn: d.sizeIn.w, heightIn: d.sizeIn.h, allowRotate: !d.keepUpright }))),
  { packWidthIn: sheet.SHEET_WIDTH_IN, startYIn: sheet.ART_INSET_IN },
)
check(layout.transfers === 14, `14 transfers (${layout.transfers})`)
check(JSON.stringify(layout.pieces) === JSON.stringify(direct.pieces), 'same piece positions as the shop packer')
check(Math.abs(layout.printHeight - (direct.contentEndY + sheet.ART_INSET_IN)) < 1e-9, `film length ${layout.printHeight.toFixed(2)} in`)

// 3. ppi rule = the shop's sheetPxPerIn(14000, 150).
check(ingest.sheetPpi(48) === 150, '150 ppi on a 48 in sheet')
check(ingest.sheetPpi(200) === 70, `70 ppi on a 200 in film (${ingest.sheetPpi(200)})`)

// 4. Compose and look at the result.
const ppi = ingest.sheetPpi(layout.printHeight)
const png = await compose.composeGangSheetNode({
  pieces: layout.pieces,
  art: new Map(designs.map((d) => [d.key, d.art])),
  sheetLengthIn: layout.printHeight,
  pxPerIn: ppi,
  label: 'test 1 10/15 1000     (' + layout.billedLength + ')',
  mapCmyk: true,
})
const meta = await sharp(png).metadata()
check(meta.width === Math.round(22.3 * ppi) && meta.height === Math.round(layout.printHeight * ppi), `PNG ${meta.width}×${meta.height} at ${ppi} ppi`)
check(Math.round(meta.density ?? 0) === ppi, `PNG density ${meta.density} dpi`)
check(meta.hasAlpha === true, 'transparent background')

// Every piece's centre pixel is opaque (art landed where the packer put it).
const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const opaqueAt = (xIn, yIn) => raw.data[(Math.round(yIn * ppi) * raw.info.width + Math.round(xIn * ppi)) * 4 + 3] > 200
check(layout.pieces.every((p) => opaqueAt(p.xIn + p.widthIn / 2, p.yIn + p.heightIn / 2)), 'art at every packed position')
check(!opaqueAt(0.2, 0.2) && !opaqueAt(22.1, layout.printHeight - 0.2), 'empty film stays transparent')
// The label is drawn near the top centre.
let labelInk = 0
for (let x = 0; x < raw.info.width; x += 2) if (raw.data[(Math.round(1.25 * ppi) * raw.info.width + x) * 4 + 3] > 128) labelInk++
check(labelInk > 20, `label drawn (${labelInk} px of ink on its centre line)`)

// 5. Pre-cut: registration circles drawn black after CMYK, and a PLT for the cutter.
const cutLib = await loadLib('lib/cut-layout.ts')
const cutLayout = ingest.layoutSheet(designs, true)
check(cutLayout.marks.length > 0 && cutLayout.startArrow.length === 3, `cut marks (${cutLayout.marks.length}) and start arrow`)
const cutPpi = ingest.sheetPpi(cutLayout.printHeight)
const cutPng = await compose.composeGangSheetNode({
  pieces: cutLayout.pieces,
  art: new Map(designs.map((d) => [d.key, d.art])),
  sheetLengthIn: cutLayout.printHeight,
  pxPerIn: cutPpi,
  mapCmyk: true,
  marks: cutLayout.marks,
  startArrow: cutLayout.startArrow,
})
const cutRaw = await sharp(cutPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const m0 = cutLayout.marks[0]
const mi = (Math.round((m0.yIn + m0.heightIn / 2) * cutPpi) * cutRaw.info.width + Math.round((m0.xIn + m0.widthIn / 2) * cutPpi)) * 4
check(cutRaw.data[mi + 3] === 255 && cutRaw.data[mi] < 10 && cutRaw.data[mi + 1] < 10 && cutRaw.data[mi + 2] < 10, 'registration circle is solid black')
const plt = cutLib.cutPlt(cutLayout.pieces, cutLayout.printHeight)
check(typeof plt === 'string' && plt.startsWith('TB26'), 'cutter PLT built')

// 6. Over 200 in: the same designs × 6 become separate sheets, each ≤ 200 in and billed on its own tier.
const bigDesigns = designs.map((d) => ({ ...d, quantity: d.quantity * 6 }))
const multi = ingest.layoutSheets(bigDesigns, false)
const placedAll = multi.pages.reduce((sum, page) => sum + page.layout.pieces.length, 0)
check(placedAll === 84 && multi.sheetCount > 1, `84 transfers packed onto ${multi.sheetCount} sheets`)
check(multi.pages.every((page) => page.billedLength <= 200), 'every sheet bills at or under 200 in')
check(multi.billedLength === multi.pages.reduce((sum, page) => sum + page.billedLength, 0), `total billed ${multi.billedLength} in = ${multi.breakdown}`)
check(multi.partLabels[0] === `1 of ${multi.sheetCount}` && multi.partLabels.at(-1) === `${multi.sheetCount} of ${multi.sheetCount}`, 'sheets labelled 1 of N … N of N')
const firstOnly = ingest.layoutSheet(bigDesigns, false)
check(firstOnly.billedLength === multi.pages[0].billedLength && firstOnly.sheetCount === multi.sheetCount && firstOnly.totalBilledLength === multi.billedLength, 'layoutSheet keeps the sheet-1 shape and reports the full job')
let threw = null
try {
  ingest.layoutSheets([{ ...designs[0], quantity: 1, sizeIn: { w: 10, h: 230 } }], false)
} catch (err) {
  threw = err
}
check(threw instanceof ingest.IngestError && /too large/.test(threw.message), `a 230 in design is refused: ${threw?.message}`)

const out = process.argv[2]
if (out) {
  writeFileSync(out, png)
  console.log(`wrote ${out}`)
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll ingest checks passed')
process.exit(failed ? 1 : 0)
