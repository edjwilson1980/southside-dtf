import { CMYK_LUT, CMYK_LUT_STEPS } from '@/lib/cmyk-lut'

function sampleLut(rIndex: number, gIndex: number, bIndex: number) {
  const index = ((rIndex * CMYK_LUT_STEPS + gIndex) * CMYK_LUT_STEPS + bIndex) * 3
  return [
    CMYK_LUT[index],
    CMYK_LUT[index + 1],
    CMYK_LUT[index + 2],
  ] as const
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mapRgbThroughCmyk(red: number, green: number, blue: number) {
  const max = CMYK_LUT_STEPS - 1
  const rScale = (red / 255) * max
  const gScale = (green / 255) * max
  const bScale = (blue / 255) * max
  const r0 = Math.min(max - 1, Math.floor(rScale))
  const g0 = Math.min(max - 1, Math.floor(gScale))
  const b0 = Math.min(max - 1, Math.floor(bScale))
  const r1 = r0 + 1
  const g1 = g0 + 1
  const b1 = b0 + 1
  const rt = rScale - r0
  const gt = gScale - g0
  const bt = bScale - b0

  const c000 = sampleLut(r0, g0, b0)
  const c001 = sampleLut(r0, g0, b1)
  const c010 = sampleLut(r0, g1, b0)
  const c011 = sampleLut(r0, g1, b1)
  const c100 = sampleLut(r1, g0, b0)
  const c101 = sampleLut(r1, g0, b1)
  const c110 = sampleLut(r1, g1, b0)
  const c111 = sampleLut(r1, g1, b1)

  const mapped = [0, 0, 0]
  for (let channel = 0; channel < 3; channel += 1) {
    const c00 = lerp(c000[channel], c100[channel], rt)
    const c01 = lerp(c001[channel], c101[channel], rt)
    const c10 = lerp(c010[channel], c110[channel], rt)
    const c11 = lerp(c011[channel], c111[channel], rt)
    const c0 = lerp(c00, c10, gt)
    const c1 = lerp(c01, c11, gt)
    mapped[channel] = Math.round(lerp(c0, c1, bt))
  }
  return mapped
}

export function mapRgbaThroughCmyk(rgba: Uint8ClampedArray | Uint8Array) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue
    const [red, green, blue] = mapRgbThroughCmyk(rgba[i], rgba[i + 1], rgba[i + 2])
    rgba[i] = red
    rgba[i + 1] = green
    rgba[i + 2] = blue
  }
}
