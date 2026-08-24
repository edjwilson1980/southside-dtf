import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const STEPS = 16
const width = STEPS * STEPS
const height = STEPS
const rgb = Buffer.alloc(width * height * 3)

let offset = 0
for (let r = 0; r < STEPS; r += 1) {
  for (let g = 0; g < STEPS; g += 1) {
    for (let b = 0; b < STEPS; b += 1) {
      rgb[offset] = Math.round((r * 255) / (STEPS - 1))
      rgb[offset + 1] = Math.round((g * 255) / (STEPS - 1))
      rgb[offset + 2] = Math.round((b * 255) / (STEPS - 1))
      offset += 3
    }
  }
}

const cmykTiff = await sharp(rgb, { raw: { width, height, channels: 3 } })
  .toColorspace('cmyk')
  .tiff({ compression: 'lzw' })
  .toBuffer()

const { data, info } = await sharp(cmykTiff)
  .toColorspace('srgb')
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

if (info.width !== width || info.height !== height || info.channels !== 3) {
  throw new Error('CMYK LUT generation changed the sample size.')
}

const bytes = [...data]
const file = `export const CMYK_LUT_STEPS = ${STEPS}

export const CMYK_LUT = new Uint8Array([
  ${bytes.join(', ')}
])
`

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'cmyk-lut.ts')
writeFileSync(outPath, file)
console.log(`Wrote ${outPath} (${bytes.length} bytes)`)
