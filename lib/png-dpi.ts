const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    value = CRC_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  )
}

function physChunk(dpi: number) {
  const pixelsPerMeter = Math.round(dpi / 0.0254)
  const data = new Uint8Array(9)
  writeUint32(data, 0, pixelsPerMeter)
  writeUint32(data, 4, pixelsPerMeter)
  data[8] = 1
  const typeAndData = new Uint8Array(13)
  typeAndData.set([112, 72, 89, 115], 0)
  typeAndData.set(data, 4)
  const chunk = new Uint8Array(21)
  writeUint32(chunk, 0, 9)
  chunk.set(typeAndData, 4)
  writeUint32(chunk, 17, crc32(typeAndData))
  return chunk
}

export function setPngDpi(png: Uint8Array, dpi: number) {
  if (png.length < 33) throw new Error('Could not set the gang sheet print size.')
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (png[index] !== PNG_SIGNATURE[index]) {
      throw new Error('Could not set the gang sheet print size.')
    }
  }

  const nextDpi = Math.max(1, Math.round(dpi))
  let offset = 8
  let insertAt = -1
  let replaceAt = -1
  let replaceSize = 0

  while (offset + 12 <= png.length) {
    const length = readUint32(png, offset)
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7])
    const chunkSize = 12 + length
    if (type === 'IHDR') insertAt = offset + chunkSize
    if (type === 'pHYs') {
      replaceAt = offset
      replaceSize = chunkSize
      break
    }
    if (type === 'IDAT' || type === 'IEND') break
    offset += chunkSize
  }

  const chunk = physChunk(nextDpi)
  if (replaceAt >= 0) {
    const next = new Uint8Array(png.length - replaceSize + chunk.length)
    next.set(png.subarray(0, replaceAt), 0)
    next.set(chunk, replaceAt)
    next.set(png.subarray(replaceAt + replaceSize), replaceAt + chunk.length)
    return next
  }
  if (insertAt < 0) throw new Error('Could not set the gang sheet print size.')
  const next = new Uint8Array(png.length + chunk.length)
  next.set(png.subarray(0, insertAt), 0)
  next.set(chunk, insertAt)
  next.set(png.subarray(insertAt), insertAt + chunk.length)
  return next
}

export async function pngBlobWithDpi(blob: Blob, dpi: number) {
  const tagged = setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi)
  return new Blob([tagged], { type: 'image/png' })
}
