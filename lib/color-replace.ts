import { knockoutThreshold, type RgbColor } from '@/lib/color-knockout'

export function colorDistances(pixels: ImageData, color: RgbColor) {
  const distances = new Float32Array(pixels.data.length / 4)

  for (let index = 0, point = 0; index < pixels.data.length; index += 4, point += 1) {
    distances[point] = Math.hypot(
      pixels.data[index] - color.r,
      pixels.data[index + 1] - color.g,
      pixels.data[index + 2] - color.b,
    )
  }

  return distances
}

export function applyColorReplace(
  pixels: ImageData,
  distances: Float32Array,
  replacement: RgbColor,
  tolerance: number,
) {
  const maxDistance = knockoutThreshold(tolerance)
  const { data } = pixels

  for (let point = 0, index = 0; point < distances.length; point += 1, index += 4) {
    if (distances[point] <= maxDistance && data[index + 3] > 0) {
      data[index] = replacement.r
      data[index + 1] = replacement.g
      data[index + 2] = replacement.b
    }
  }

  return pixels
}
