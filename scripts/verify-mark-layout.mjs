import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')

const CUT_SECTION_IN = 30
const SHORT_SHEET_IN = 12
const MARK_SIZE_IN = 5 / 25.4
const MARK_PAD_IN = 2 / 25.4
const MARK_INSET_IN = 10 / 25.4
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2

function sectionMarkYs(sectionStart, sectionHeightIn) {
  if (sectionHeightIn <= 0) return []
  const top = sectionStart + MARK_INSET_IN + MARK_PAD_IN
  const bottom = sectionStart + sectionHeightIn - MARK_INSET_IN - MARK_PAD_IN - MARK_SIZE_IN
  if (bottom < top) return [sectionStart + Math.max(0, (sectionHeightIn - MARK_SIZE_IN) / 2)]
  if (sectionHeightIn < SHORT_SHEET_IN) return [top, bottom]
  const middle = sectionStart + sectionHeightIn / 2 - MARK_SIZE_IN / 2
  if (middle - top < MARK_ROW_GAP_IN || bottom - middle < MARK_ROW_GAP_IN) return [top, bottom]
  return [top, middle, bottom]
}

function markCount(sheetHeightIn) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  let count = 0
  for (let index = 0; index < sectionCount; index += 1) {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    count += sectionMarkYs(sectionStart, sectionHeightIn).length * 2
  }
  return count
}

function markRows(sheetHeightIn) {
  const sectionCount = Math.max(1, Math.ceil(sheetHeightIn / CUT_SECTION_IN - 1e-9))
  return Array.from({ length: sectionCount }, (_, index) => {
    const sectionStart = index * CUT_SECTION_IN
    const sectionHeightIn = Math.min(CUT_SECTION_IN, Math.max(0, sheetHeightIn - sectionStart))
    return sectionMarkYs(sectionStart, sectionHeightIn)
  })
}

const checks = [
  [layout.includes('SHORT_SHEET_IN = 12'), 'cut-layout has a 12 in short-sheet rule'],
  [layout.includes('sectionHeightIn < SHORT_SHEET_IN'), 'short remainder sections use two pairs'],
  [markCount(9) === 4, 'under 12 in prints 4 marks'],
  [markRows(9)[0].length === 2, 'under 12 in uses two rows'],
  [markCount(12) === 6, '12 in prints 6 marks'],
  [markRows(12)[0].length === 3, '12 in uses three rows'],
  [markCount(24) === 6, '24 in prints 6 marks on the actual sheet'],
  [markRows(24)[0].every((y) => y >= 0 && y <= 24 - MARK_SIZE_IN + 1e-6), '24 in marks stay on the sheet'],
  [markCount(30) === 6, '30 in prints 6 marks'],
  [markCount(36) === 10, '36 in prints 6 marks, a gap, then 4 marks'],
  [markRows(36)[0].length === 3, 'first 30 in of a 36 in sheet has three rows'],
  [markRows(36)[1].length === 2, '6 in remainder has two rows'],
  [markRows(36)[1][0] >= 30, 'second set starts after the 30 in gap'],
  [markCount(60) === 12, '60 in repeats three pairs after the 30 in gap'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`mark layout checks failed: ${failed.length}`)
  process.exit(1)
}
console.log('crop marks follow sheet length')
