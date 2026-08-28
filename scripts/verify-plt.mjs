import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/cut-layout.ts'), 'utf8')

const PLT_UNITS_PER_IN = 1016

function toUnits(inches) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1, y1, x2, y2) {
  return `U${x1},${y1} D${x1},${y1} D${x1},${y2},${x2},${y2},${x2},${y1},${x1},${y1} `
}

function buildTenethPlt(boxes) {
  const paths = boxes.map((box) => {
    const x1 = toUnits(box.xIn)
    const x2 = toUnits(box.xIn + box.widthIn)
    const y1 = toUnits(box.yIn)
    const y2 = toUnits(box.yIn + box.heightIn)
    return rectanglePath(x1, y1, x2, y2)
  }).join('')
  return `;:H A L0 ECN U V10 ${paths}U @`
}

const near = {
  xIn: 2,
  yIn: 1.875,
  widthIn: 4,
  heightIn: 3,
}
const far = {
  xIn: 8,
  yIn: 12,
  widthIn: 5,
  heightIn: 2,
}
const plt = buildTenethPlt([near, far])
const nearY = toUnits(near.yIn)
const farY = toUnits(far.yIn)

const checks = [
  [layout.includes(';:H A L0 ECN U V10'), 'PLT header matches Artcut DMPL'],
  [layout.includes('U @'), 'PLT ends with DMPL halt instead of a page feed'],
  [!layout.includes('TB26'), 'PLT no longer sets a TB26 work area'],
  [!layout.includes('CT1'), 'PLT no longer emits HPGL CT1'],
  [!layout.includes('PG;'), 'PLT no longer emits HPGL page-feed PG'],
  [!layout.includes('sectionHeightIn - box.yIn'), 'PLT Y is not flipped from the trailing edge'],
  [plt.startsWith(';:H A L0 ECN U V10 '), 'generated file starts with the Artcut DMPL header'],
  [plt.trimEnd().endsWith('U @'), 'generated file ends with pen-up halt'],
  [!plt.includes('PG'), 'generated file has no page feed'],
  [plt.includes(`U${toUnits(near.xIn)},${nearY} `), 'first cut starts at the printed leading-edge Y'],
  [nearY < farY, 'later designs have larger Y, matching the PNG feed direction'],
  [plt.includes(`U${toUnits(far.xIn)},${farY} `), 'second cut uses the printed Y, not height minus Y'],
  [toUnits(1) === 1016, 'DMPL units are 1016 per inch (40 per mm)'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`PLT checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(plt)
console.log('Teneth PLT matches Artcut DMPL with PNG-space coordinates')
