export function applyBrightnessContrast(pixels: ImageData, brightness: number, contrast: number) {
  if (!brightness && !contrast) return pixels

  const lift = (brightness / 100) * 255
  const mapped = Math.max(-100, Math.min(100, contrast)) * 2.55
  const factor = (259 * (mapped + 255)) / (255 * (259 - mapped))
  const data = pixels.data

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue
    for (let channel = 0; channel < 3; channel += 1) {
      const value = factor * (data[index + channel] + lift - 128) + 128
      data[index + channel] = Math.max(0, Math.min(255, value))
    }
  }

  return pixels
}
