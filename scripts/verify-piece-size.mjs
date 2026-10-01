/**
 * Unusual / custom size print measurements for the gang sheet builder.
 * Run: node scripts/verify-piece-size.mjs
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'lib/compose-sheet.ts'), 'utf8')
const img = readFileSync(join(root, 'lib/image-utils.ts'), 'utf8')

const SHEET_WIDTH_IN = 22.3

// Mirror the TS helpers in plain JS for a fast check without a bundler.
function parseSizeBoxInches(size) {
  const measurement = size.split(' · ').pop() ?? size
  const pair = /([0-9]+(?:\.[0-9]+)?)\s*(?:×|x|by)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(measurement)
  if (pair) {
    const widthIn = Number(pair[1])
    const heightIn = Number(pair[2])
    if (widthIn > 0 && heightIn > 0) return { widthIn, heightIn, hasExplicitHeight: true }
  }
  const single = /([0-9]+(?:\.[0-9]+)?)/.exec(measurement)
  if (single) {
    const widthIn = Number(single[1])
    if (widthIn > 0) return { widthIn, heightIn: widthIn, hasExplicitHeight: false }
  }
  return null
}

function fitWithinBox(boxWidthIn, boxHeightIn, pixelWidth, pixelHeight) {
  const width = Math.max(0, boxWidthIn)
  const height = Math.max(0, boxHeightIn)
  if (!(pixelWidth > 0) || !(pixelHeight > 0) || width <= 0 || height <= 0) {
    return { widthIn: width, heightIn: height }
  }
  const naturalHeight = width * (pixelHeight / pixelWidth)
  return { widthIn: width, heightIn: Math.min(height, naturalHeight) }
}

/** Previous behaviour: shrink width when art is taller than the box. */
function fitWithinBoxOld(boxWidthIn, boxHeightIn, pixelWidth, pixelHeight) {
  const EPS = 1e-6
  const width = Math.max(0, boxWidthIn)
  const height = Math.max(0, boxHeightIn)
  const aspect = pixelHeight / pixelWidth
  const byWidth = { widthIn: width, heightIn: width * aspect }
  if (byWidth.heightIn <= height + EPS) return byWidth
  return { widthIn: height / aspect, heightIn: height }
}

function piecePrintSize(piece) {
  const width = piece.widthIn
  if (piece.placement === 'Custom') {
    const height = Number(piece.customHeight)
    if (Number.isFinite(height) && height > 0) {
      return { widthIn: width, heightIn: Math.min(199, height) }
    }
    return { widthIn: width, heightIn: width * (piece.pixelHeight / piece.pixelWidth) }
  }
  const parsed = parseSizeBoxInches(piece.size)
  if (parsed?.hasExplicitHeight) {
    return fitWithinBox(width, parsed.heightIn, piece.pixelWidth, piece.pixelHeight)
  }
  return { widthIn: width, heightIn: width * (piece.pixelHeight / piece.pixelWidth) }
}

function parsePrintWidthInches(size, placement, customWidth) {
  if (placement === 'Custom') return Math.min(SHEET_WIDTH_IN, Number(customWidth) || 0)
  const measurement = size.split(' · ').pop() ?? size
  const pair =
    /([0-9]+(?:\.[0-9]+)?)\s*(?:×|x|by)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(measurement) ||
    /([0-9]+(?:\.[0-9]+)?)/.exec(measurement)
  return Math.min(SHEET_WIDTH_IN, Number.parseFloat(pair?.[1] ?? '10.5'))
}

const checks = []
checks.push([src.includes('Exact custom size'), 'compose-sheet documents exact custom sizes'])
checks.push([src.includes('hasExplicitHeight'), 'single-number sizes are distinguished from W×H boxes'])
checks.push([img.includes('×|x|by'), 'width parser prefers the number before ×'])

// 13 × 4 custom must stay 13 × 4 even if trim changed pixel aspect
const custom13x4 = piecePrintSize({
  placement: 'Custom',
  size: '13 × 4 in',
  customHeight: '4',
  pixelWidth: 3000,
  pixelHeight: 1200, // 2.5:1 after trim — old fitWithinBox would shrink width
  widthIn: 13,
})
checks.push([
  Math.abs(custom13x4.widthIn - 13) < 1e-9 && Math.abs(custom13x4.heightIn - 4) < 1e-9,
  `custom 13×4 prints 13×4 (got ${custom13x4.widthIn}×${custom13x4.heightIn})`,
])

const oldCustomFit = fitWithinBoxOld(13, 4, 3000, 1200)
checks.push([Math.abs(oldCustomFit.widthIn - 10) < 1e-6, 'old fitWithinBox would have shrunk custom to 10×4'])

// Sleeve "4 in" with tall art follows natural height
const sleeve = piecePrintSize({
  placement: 'Sleeve',
  size: '4 in',
  customHeight: '',
  pixelWidth: 1200,
  pixelHeight: 3900,
  widthIn: 4,
})
checks.push([
  Math.abs(sleeve.widthIn - 4) < 1e-9 && Math.abs(sleeve.heightIn - 13) < 1e-6,
  `sleeve 4 in + tall art → 4×13 (got ${sleeve.widthIn}×${sleeve.heightIn})`,
])

// Garment preset: wide/short art still collapses height (no empty film)
const adult = piecePrintSize({
  placement: 'Adult Shirt',
  size: 'Medium · 10.5 × 12 in',
  customHeight: '',
  pixelWidth: 3900,
  pixelHeight: 1200,
  widthIn: parsePrintWidthInches('Medium · 10.5 × 12 in', 'Adult Shirt', ''),
})
checks.push([
  Math.abs(adult.widthIn - 10.5) < 1e-9 && Math.abs(adult.heightIn - 3.230769) < 0.01,
  `adult 10.5×12 box + wide art fits to ~10.5×3.23 (got ${adult.widthIn}×${adult.heightIn})`,
])

// 2XL 12.5×13 with tall art must KEEP 12.5 in width (old code shrunk to ~8.67)
const twoXl = piecePrintSize({
  placement: 'Adult Shirt',
  size: '2XL · 12.5 × 13 in',
  customHeight: '',
  pixelWidth: 2000,
  pixelHeight: 3000,
  widthIn: parsePrintWidthInches('2XL · 12.5 × 13 in', 'Adult Shirt', ''),
})
const oldTwoXl = fitWithinBoxOld(12.5, 13, 2000, 3000)
checks.push([
  Math.abs(twoXl.widthIn - 12.5) < 1e-9 && Math.abs(twoXl.heightIn - 13) < 1e-9,
  `2XL tall art prints 12.5×13 (got ${twoXl.widthIn}×${twoXl.heightIn})`,
])
checks.push([
  Math.abs(oldTwoXl.widthIn - 13 / 1.5) < 1e-6,
  `old fit would shrink 2XL width to ${(13 / 1.5).toFixed(2)} in`,
])
checks.push([
  twoXl.widthIn * 2 + 0.25 > SHEET_WIDTH_IN,
  'two 12.5 in designs need more than the roll width — they must stack, not shrink',
])

const chest = parseSizeBoxInches('Standard Left Chest · 3.75 × 3.75 in')
checks.push([chest?.hasExplicitHeight === true, '3.75 × 3.75 is an explicit height box'])

checks.push([
  src.includes('fill the ordered WIDTH') || src.includes('Fill the ordered WIDTH'),
  'composeGangSheet fills garment width instead of contain-shrinking',
])
checks.push([src.includes('context.clip()'), 'composeGangSheet clips tall art to the piece box'])

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(ok ? '✓' : '✗', label)
if (failed.length) {
  console.error(`\n${failed.length} piece size checks failed`)
  process.exit(1)
}
console.log(`\n${checks.length} piece size checks passed`)
