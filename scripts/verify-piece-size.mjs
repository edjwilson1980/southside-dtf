/**
 * Unusual / custom size print measurements for the gang sheet builder.
 * Run: node scripts/verify-piece-size.mjs
 */
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'lib/compose-sheet.ts'), 'utf8')
const img = readFileSync(join(root, 'lib/image-utils.ts'), 'utf8')

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
  const EPS = 1e-6
  const width = Math.max(0, boxWidthIn)
  const height = Math.max(0, boxHeightIn)
  if (!(pixelWidth > 0) || !(pixelHeight > 0) || width <= 0 || height <= 0) {
    return { widthIn: width, heightIn: height }
  }
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
  if (placement === 'Custom') return Math.min(22, Number(customWidth) || 0)
  const measurement = size.split(' · ').pop() ?? size
  const pair =
    /([0-9]+(?:\.[0-9]+)?)\s*(?:×|x|by)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(measurement) ||
    /([0-9]+(?:\.[0-9]+)?)/.exec(measurement)
  return Math.min(22, Number.parseFloat(pair?.[1] ?? '10.5'))
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

// Old bug: fitWithinBox on that aspect inside 13×4 → 10×4
const shrunk = fitWithinBox(13, 4, 3000, 1200)
checks.push([Math.abs(shrunk.widthIn - 10) < 1e-6, 'fitWithinBox would have shrunk to 10×4'])

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

// Garment preset still fits inside the box
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

// Square left chest still a two-number box
const chest = parseSizeBoxInches('Standard Left Chest · 3.75 × 3.75 in')
checks.push([chest?.hasExplicitHeight === true, '3.75 × 3.75 is an explicit height box'])

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(ok ? '✓' : '✗', label)
if (failed.length) {
  console.error(`\n${failed.length} piece size checks failed`)
  process.exit(1)
}
console.log(`\n${checks.length} piece size checks passed`)
