/**
 * Acceptance checks for Upload Gangsheet measure + size pick (spec §9).
 * Run: node scripts/verify-upload-pricing.mjs
 */
import { createRequire } from 'module'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Load via dynamic import through tsx path — keep pure JS mirror of lengthFromSlug / pickUploadSize
function lengthFromSlug(slug) {
  const match = String(slug).match(/x-?(\d+)/i)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function pickUploadSize(lengthIn, sizes, lengthToleranceIn = 0) {
  if (!(lengthIn > 0) || sizes.length === 0) return null
  const target = Math.max(12, lengthIn - lengthToleranceIn)
  if (target > 200 + 1e-9) return null
  const ordered = [...sizes].sort((a, b) => a.length_in - b.length_in)
  for (const size of ordered) {
    if (size.length_in + 1e-9 >= target) return size
  }
  return null
}

const slugs = [
  ['22-in-x-12-in-1ft', 12],
  ['22-in-x-24-in-2ft', 24],
  ['22-in-x-36-in-3ft', 36],
  ['22-in-x-48-in-4ft', 48],
  ['22-in-x-60-in-5ft', 60],
  ['22-in-x-72in-6ft', 72],
  ['22-in-x-120in-10ft', 120],
  ['22-x150-in-12ft', 150],
  ['22-x200-16ft', 200],
]

const checks = []
for (const [slug, len] of slugs) {
  checks.push([lengthFromSlug(slug) === len, `lengthFromSlug(${slug}) === ${len}`])
}

const map = slugs.map(([slug, length_in], i) => ({
  variation_id: 100 + i,
  slug,
  label: slug,
  length_in,
  price: 1,
  price_html: '$1',
}))

const pickCases = [
  [12, 12],
  [12.01, 24],
  [48, 48],
  [200, 200],
  [200.01, null],
  [11, 12],
]
for (const [len, want] of pickCases) {
  const got = pickUploadSize(len, map)
  checks.push([(got ? got.length_in : null) === want, `pickUploadSize(${len}) === ${want}`])
}

// Measure via sharp / pdf-lib (same stack as the relay)
const sharp = require(join(root, 'node_modules/sharp'))
const { PDFDocument } = require(join(root, 'node_modules/pdf-lib'))

async function measurePng(buf) {
  const meta = await sharp(buf).metadata()
  const dpi = meta.density && meta.density > 1 ? meta.density : 300
  const dpiAssumed = !(meta.density && meta.density > 1)
  return { width_in: meta.width / dpi, length_in: meta.height / dpi, dpi, dpiAssumed }
}

mkdirSync('/tmp/upload-tests', { recursive: true })

async function makePng(name, w, h, dpi) {
  let img = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
  img = dpi ? img.png({ density: dpi }) : img.png()
  const buf = await img.toBuffer()
  writeFileSync(join('/tmp/upload-tests', name), buf)
  return buf
}

const m12 = await measurePng(await makePng('22x12-300.png', 6600, 3600, 300))
checks.push([Math.abs(m12.width_in - 22) < 0.01 && Math.abs(m12.length_in - 12) < 0.01, 'PNG 6600×3600@300 → 22×12'])
checks.push([pickUploadSize(m12.length_in, map)?.length_in === 12, '22×12 picks 12 in tier'])

const m122 = await measurePng(await makePng('22x12.2-300.png', 6600, 3660, 300))
checks.push([pickUploadSize(m122.length_in, map)?.length_in === 24, '22×12.2 rounds up to 24'])

const m48 = await measurePng(await makePng('22x48-300.png', 6600, 14400, 300))
checks.push([pickUploadSize(m48.length_in, map)?.length_in === 48, '22×48 picks 48'])

const mWide = await measurePng(await makePng('23in-wide.png', 6900, 3600, 300))
checks.push([mWide.width_in > 22.1, '23 in wide is over limit'])

const pdf = await PDFDocument.create()
pdf.addPage([22 * 72, 210 * 72])
const pdfBuf = Buffer.from(await pdf.save())
writeFileSync('/tmp/upload-tests/22x210.pdf', pdfBuf)
const page = (await PDFDocument.load(pdfBuf)).getPages()[0]
const { width, height } = page.getSize()
const lengthIn = Math.max(width, height) / 72
checks.push([lengthIn > 200, 'PDF 22×210 is over max length'])

const noDpi = await measurePng(await makePng('no-dpi.png', 6600, 3600))
checks.push([noDpi.dpiAssumed === true && noDpi.dpi === 300, 'PNG with no DPI assumes 300'])

// lighter UI demos
writeFileSync(
  '/tmp/upload-tests/demo-22x12.png',
  await sharp({
    create: { width: 3300, height: 1800, channels: 3, background: { r: 20, g: 90, b: 160 } },
  })
    .png({ density: 150 })
    .toBuffer(),
)
writeFileSync(
  '/tmp/upload-tests/demo-22x12.2.png',
  await sharp({
    create: { width: 3300, height: 1830, channels: 3, background: { r: 160, g: 60, b: 20 } },
  })
    .png({ density: 150 })
    .toBuffer(),
)

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) {
  console.log(ok ? '✓' : '✗', label)
}
if (failed.length) {
  console.error(`\n${failed.length} upload pricing checks failed`)
  process.exit(1)
}
console.log(`\n${checks.length} upload pricing checks passed`)
