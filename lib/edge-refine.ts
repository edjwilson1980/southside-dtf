export type EdgeRefineSettings = {
  choke: number
  crisp: number
  smooth: number
}

function copyImageData(source: ImageData) {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
}

function erodeAlpha(source: ImageData, target: ImageData, radius: number) {
  const { width, height, data } = source
  const out = target.data
  const reach = Math.max(0, Math.round(radius))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      let minAlpha = data[index + 3]

      if (reach > 0 && minAlpha > 0) {
        for (let offsetY = -reach; offsetY <= reach; offsetY += 1) {
          const sampleY = y + offsetY
          if (sampleY < 0 || sampleY >= height) {
            minAlpha = 0
            break
          }
          for (let offsetX = -reach; offsetX <= reach; offsetX += 1) {
            const sampleX = x + offsetX
            if (sampleX < 0 || sampleX >= width) {
              minAlpha = 0
              break
            }
            const sample = data[(sampleY * width + sampleX) * 4 + 3]
            if (sample < minAlpha) minAlpha = sample
            if (minAlpha === 0) break
          }
          if (minAlpha === 0) break
        }
      }

      out[index] = data[index]
      out[index + 1] = data[index + 1]
      out[index + 2] = data[index + 2]
      out[index + 3] = minAlpha
    }
  }
}

function hardenAlpha(pixels: ImageData, crisp: number) {
  if (crisp <= 0) return
  const cut = Math.round((Math.max(0, Math.min(100, crisp)) / 100) * 255)

  for (let index = 3; index < pixels.data.length; index += 4) {
    pixels.data[index] = pixels.data[index] < cut ? 0 : 255
  }
}

function defringeEdges(pixels: ImageData) {
  const { width, height, data } = pixels

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3]
      if (alpha === 0) continue

      let touchesClear = false
      let red = 0
      let green = 0
      let blue = 0
      let count = 0

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue
          const sampleX = x + offsetX
          const sampleY = y + offsetY
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
            touchesClear = true
            continue
          }
          const sample = (sampleY * width + sampleX) * 4
          const sampleAlpha = data[sample + 3]
          if (sampleAlpha < 16) touchesClear = true
          if (sampleAlpha >= 220) {
            red += data[sample]
            green += data[sample + 1]
            blue += data[sample + 2]
            count += 1
          }
        }
      }

      if (!touchesClear || count === 0) continue
      data[index] = Math.round(red / count)
      data[index + 1] = Math.round(green / count)
      data[index + 2] = Math.round(blue / count)
    }
  }
}

function blurAlpha(pixels: ImageData, radius: number) {
  const reach = Math.max(0, Math.round(radius))
  if (reach <= 0) return

  const { width, height, data } = pixels
  const horizontal = new Uint8ClampedArray(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      let count = 0
      for (let offset = -reach; offset <= reach; offset += 1) {
        const sampleX = Math.min(width - 1, Math.max(0, x + offset))
        total += data[(y * width + sampleX) * 4 + 3]
        count += 1
      }
      horizontal[y * width + x] = total / count
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      let count = 0
      for (let offset = -reach; offset <= reach; offset += 1) {
        const sampleY = Math.min(height - 1, Math.max(0, y + offset))
        total += horizontal[sampleY * width + x]
        count += 1
      }
      data[(y * width + x) * 4 + 3] = total / count
    }
  }
}

export function refineEdges(source: ImageData, { choke, crisp, smooth = 0 }: EdgeRefineSettings, target = copyImageData(source)) {
  if (choke > 0) erodeAlpha(source, target, choke)
  else target.data.set(source.data)

  hardenAlpha(target, crisp)
  if (choke > 0 || crisp > 0) defringeEdges(target)
  if (smooth > 0) blurAlpha(target, smooth)
  return target
}

export function hasEdgeRefine({ choke, crisp, smooth = 0 }: EdgeRefineSettings) {
  return choke > 0 || crisp > 0 || smooth > 0
}
