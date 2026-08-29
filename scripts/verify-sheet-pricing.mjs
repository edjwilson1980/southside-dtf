import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')

const block = page.match(/const sheetOptions = \[([\s\S]*?)\n\]/)
if (!block) {
  console.error('could not find sheetOptions in app/page.tsx')
  process.exit(1)
}

const sheetOptions = [...block[1].matchAll(/\{ length: (\d+), label: '([^']+)', price: (\d+) \}/g)].map(
  ([, length, label, price]) => ({ length: Number(length), label, price: Number(price) }),
)

/** Mirrors billedSheetLength in app/page.tsx. */
function billedSheetLength(artLength) {
  const chargeable = Math.max(0, artLength - 1.5)
  const safeLength = Math.max(12, Math.ceil(chargeable - 1e-9))
  const fullSheets = Math.floor(safeLength / 200)
  const remainder = safeLength % 200
  if (remainder === 0) return Math.max(12, fullSheets * 200)
  const remainderSheet = sheetOptions.find((option) => remainder <= option.length) ?? sheetOptions[sheetOptions.length - 1]
  return fullSheets * 200 + remainderSheet.length
}

function priceFor(artLength) {
  const billed = billedSheetLength(artLength)
  const fullSheets = Math.floor(billed / 200)
  const remainder = billed % 200
  const remainderSheet = remainder > 0 ? sheetOptions.find((option) => option.length === remainder) : null
  return fullSheets * 115 + (remainderSheet?.price ?? 0)
}

const checks = []

checks.push([sheetOptions.length > 0, `sheetOptions parsed (${sheetOptions.length} tiers)`])

const ascending = sheetOptions.every((option, index) => index === 0 || option.length > sheetOptions[index - 1].length)
checks.push([ascending, 'tiers are listed shortest to longest so the smallest fitting sheet wins'])

const pricesRise = sheetOptions.every((option, index) => index === 0 || option.price > sheetOptions[index - 1].price)
checks.push([pricesRise, 'a longer sheet never costs less than a shorter one'])

const labelsMatch = sheetOptions.every((option) => option.label === `22 × ${option.length} in`)
checks.push([labelsMatch, 'every tier label matches its length'])

// Every tier must be reachable: a job just over the previous tier bills at this one.
for (let i = 0; i < sheetOptions.length; i += 1) {
  const option = sheetOptions[i]
  const previous = i === 0 ? 0 : sheetOptions[i - 1].length
  const artLength = previous + 1.5 + 0.5
  const billed = billedSheetLength(artLength)
  checks.push([
    billed === option.length,
    `${previous + 0.5} in of artwork bills as the ${option.length} in sheet, not a longer one (got ${billed})`,
  ])
}

// The reported gap: a 48 in tier at $30 must exist and be used.
const fortyEight = sheetOptions.find((option) => option.length === 48)
checks.push([Boolean(fortyEight), 'there is a 48 in tier'])
checks.push([fortyEight?.price === 30, `the 48 in tier costs $30 (got $${fortyEight?.price})`])
for (const artLength of [38, 42, 46, 49.5]) {
  checks.push([
    billedSheetLength(artLength) === 48,
    `${artLength} in of artwork bills as 48 in (got ${billedSheetLength(artLength)})`,
  ])
}
checks.push([priceFor(42) === 30, `a 42 in job costs $30, not $${priceFor(42)}`])

// No tier may be skipped: every step in the ladder should be reachable.
const reachable = new Set()
for (let art = 1; art <= 200; art += 0.25) reachable.add(billedSheetLength(art))
const skipped = sheetOptions.filter((option) => !reachable.has(option.length))
checks.push([skipped.length === 0, `no tier is unreachable (${skipped.map((s) => s.length).join(', ') || 'none skipped'})`])

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`sheet pricing checks failed: ${failed.length}`)
  process.exit(1)
}
console.log('\nladder: ' + sheetOptions.map((o) => `${o.length}in $${o.price}`).join('  '))
console.log('sheet pricing has no gaps')
