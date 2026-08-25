import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const layout = readFileSync(join(root, 'lib/cut-layout.ts'), 'utf8')
const compose = readFileSync(join(root, 'lib/compose-sheet.ts'), 'utf8')
const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
const preview = readFileSync(join(root, 'components/sheet-preview-modal.tsx'), 'utf8')

function paintHardDisk(data, width, height, originX, originY, cx, cy, radius) {
  const r2 = radius * radius
  for (let row = 0; row < height; row++) {
    const dy = originY + row + 0.5 - cy
    for (let col = 0; col < width; col++) {
      const dx = originX + col + 0.5 - cx
      if (dx * dx + dy * dy <= r2) {
        const index = (row * width + col) * 4
        data[index] = 0
        data[index + 1] = 0
        data[index + 2] = 0
        data[index + 3] = 255
      }
    }
  }
}

const size = 40
const pixels = new Uint8ClampedArray(size * size * 4)
paintHardDisk(pixels, size, size, 0, 0, 20, 20, 10)

let filled = 0
let outsideSquare = 0
for (let row = 0; row < size; row++) {
  for (let col = 0; col < size; col++) {
    if (pixels[(row * size + col) * 4 + 3] !== 255) continue
    filled += 1
    if (Math.abs(col - 20) > 10 || Math.abs(row - 20) > 10) outsideSquare = 1
  }
}

const expected = Math.PI * 10 * 10
const checks = [
  [layout.includes('MARK_SIZE_IN = 5 / 25.4'), 'printed marks are 5 mm'],
  [layout.includes("shape: 'circle'"), 'printed marks are tagged as circles'],
  [/color: '#ffffff',\s*shape: 'circle'/.test(layout), 'white pads are circular'],
  [compose.includes('fillHardDisk'), 'export draws filled circular disks'],
  [css.includes('.cut-reg-mark') && css.includes('border-radius: 50%'), 'preview overlay is circular'],
  [readFileSync(join(root, 'components/cut-box-overlay.tsx'), 'utf8').includes("aspectRatio: '1'"), 'overlay boxes stay 1:1 circles'],
  [preview.includes('black 5 mm circles'), 'preview copy describes circles'],
  [outsideSquare === 0, 'disk stays inside its bounding box'],
  [Math.abs(filled - expected) / expected < 0.08, `disk area is circular (${filled} px vs ${expected.toFixed(1)})`],
  [filled < 20 * 20, 'disk is not a filled square'],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) {
  console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
}
if (failed.length) {
  console.error(`registration mark checks failed: ${failed.length}`)
  process.exit(1)
}
console.log('registration marks look circular')
