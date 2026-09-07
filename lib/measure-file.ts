/**
 * Read print dimensions from file headers only — never decode the full bitmap.
 * A 22×200in @300DPI sheet is huge; measuring from IHDR/MediaBox/etc. stays cheap.
 */

export type MeasuredFile = {
  kind: 'png' | 'jpeg' | 'tiff' | 'pdf' | 'unknown'
  pixelWidth: number
  pixelHeight: number
  dpiX: number
  dpiY: number
  dpiAssumed: boolean
  widthIn: number
  heightIn: number
  mimeType: string
  fileName: string
  byteLength: number
}

const DEFAULT_DPI = 300

function readU16BE(view: DataView, offset: number) {
  return view.getUint16(offset, false)
}
function readU32BE(view: DataView, offset: number) {
  return view.getUint32(offset, false)
}
function readU16LE(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}
function readU32LE(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function measurePng(bytes: Uint8Array): Pick<MeasuredFile, 'pixelWidth' | 'pixelHeight' | 'dpiX' | 'dpiY' | 'dpiAssumed'> {
  if (bytes.length < 24 || ascii(bytes, 1, 3) !== 'PNG') {
    throw new Error('This PNG file header could not be read.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // IHDR starts at byte 8: length(4) + 'IHDR'(4) + data
  if (ascii(bytes, 12, 4) !== 'IHDR') {
    throw new Error('This PNG is missing an IHDR chunk.')
  }
  const pixelWidth = readU32BE(view, 16)
  const pixelHeight = readU32BE(view, 20)
  let dpiX = DEFAULT_DPI
  let dpiY = DEFAULT_DPI
  let dpiAssumed = true

  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readU32BE(view, offset)
    const type = ascii(bytes, offset + 4, 4)
    const dataStart = offset + 8
    if (type === 'pHYs' && length >= 9 && dataStart + 9 <= bytes.length) {
      const ppx = readU32BE(view, dataStart)
      const ppy = readU32BE(view, dataStart + 4)
      const unit = bytes[dataStart + 8]
      if (unit === 1 && ppx > 0 && ppy > 0) {
        // pixels per metre → DPI
        dpiX = Math.round(ppx * 0.0254)
        dpiY = Math.round(ppy * 0.0254)
        dpiAssumed = false
      }
      break
    }
    if (type === 'IEND') break
    offset += 12 + length
  }

  return { pixelWidth, pixelHeight, dpiX, dpiY, dpiAssumed }
}

function measureJpeg(bytes: Uint8Array): Pick<MeasuredFile, 'pixelWidth' | 'pixelHeight' | 'dpiX' | 'dpiY' | 'dpiAssumed'> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('This JPEG file header could not be read.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let dpiX = DEFAULT_DPI
  let dpiY = DEFAULT_DPI
  let dpiAssumed = true
  let pixelWidth = 0
  let pixelHeight = 0
  let offset = 2

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xd9 || marker === 0xda) break // EOI / SOS
    const size = readU16BE(view, offset + 2)
    if (size < 2 || offset + 2 + size > bytes.length) break

    if (marker === 0xe0 && size >= 16 && ascii(bytes, offset + 4, 4) === 'JFIF') {
      const units = bytes[offset + 11]
      const xDensity = readU16BE(view, offset + 12)
      const yDensity = readU16BE(view, offset + 14)
      if (units === 1 && xDensity > 0 && yDensity > 0) {
        dpiX = xDensity
        dpiY = yDensity
        dpiAssumed = false
      } else if (units === 2 && xDensity > 0 && yDensity > 0) {
        // dots per cm
        dpiX = Math.round(xDensity * 2.54)
        dpiY = Math.round(yDensity * 2.54)
        dpiAssumed = false
      }
    }

    // SOF0 / SOF2 (baseline / progressive)
    if ((marker === 0xc0 || marker === 0xc2) && size >= 8) {
      pixelHeight = readU16BE(view, offset + 5)
      pixelWidth = readU16BE(view, offset + 7)
    }

    offset += 2 + size
  }

  if (!pixelWidth || !pixelHeight) {
    throw new Error('Could not read JPEG image dimensions.')
  }
  return { pixelWidth, pixelHeight, dpiX, dpiY, dpiAssumed }
}

function measureTiff(bytes: Uint8Array): Pick<MeasuredFile, 'pixelWidth' | 'pixelHeight' | 'dpiX' | 'dpiY' | 'dpiAssumed'> {
  if (bytes.length < 8) throw new Error('This TIFF file is too short to read.')
  const little = ascii(bytes, 0, 2) === 'II'
  const big = ascii(bytes, 0, 2) === 'MM'
  if (!little && !big) throw new Error('This TIFF byte order marker is invalid.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = little ? readU16LE : readU16BE
  const u32 = little ? readU32LE : readU32BE
  if (u16(view, 2) !== 42) throw new Error('This TIFF magic number is invalid.')

  const ifdOffset = u32(view, 4)
  if (ifdOffset + 2 > bytes.length) throw new Error('This TIFF IFD is out of range.')
  const entryCount = u16(view, ifdOffset)
  let pixelWidth = 0
  let pixelHeight = 0
  let xResNum = 0
  let xResDen = 1
  let yResNum = 0
  let yResDen = 1
  let resUnit = 2 // inch

  for (let i = 0; i < entryCount; i++) {
    const entry = ifdOffset + 2 + i * 12
    if (entry + 12 > bytes.length) break
    const tag = u16(view, entry)
    const type = u16(view, entry + 2)
    const count = u32(view, entry + 4)
    const valueOffset = entry + 8
    const valueOrPtr = u32(view, valueOffset)

    const readRational = (ptr: number) => {
      if (ptr + 8 > bytes.length) return { num: 0, den: 1 }
      return { num: u32(view, ptr), den: Math.max(1, u32(view, ptr + 4)) }
    }

    if (tag === 256) pixelWidth = type === 3 ? u16(view, valueOffset) : valueOrPtr
    if (tag === 257) pixelHeight = type === 3 ? u16(view, valueOffset) : valueOrPtr
    if (tag === 282 && count >= 1) {
      const r = readRational(type === 5 ? valueOrPtr : valueOffset)
      xResNum = r.num
      xResDen = r.den
    }
    if (tag === 283 && count >= 1) {
      const r = readRational(type === 5 ? valueOrPtr : valueOffset)
      yResNum = r.num
      yResDen = r.den
    }
    if (tag === 296) resUnit = type === 3 ? u16(view, valueOffset) : valueOrPtr
  }

  if (!pixelWidth || !pixelHeight) {
    throw new Error('Could not read TIFF image dimensions.')
  }

  let dpiX = DEFAULT_DPI
  let dpiY = DEFAULT_DPI
  let dpiAssumed = true
  if (xResNum > 0 && yResNum > 0) {
    const x = xResNum / xResDen
    const y = yResNum / yResDen
    if (resUnit === 3) {
      // cm
      dpiX = Math.round(x * 2.54)
      dpiY = Math.round(y * 2.54)
    } else {
      dpiX = Math.round(x)
      dpiY = Math.round(y)
    }
    if (dpiX > 0 && dpiY > 0) dpiAssumed = false
  }

  return { pixelWidth, pixelHeight, dpiX, dpiY, dpiAssumed }
}

function measurePdf(bytes: Uint8Array): Pick<MeasuredFile, 'pixelWidth' | 'pixelHeight' | 'dpiX' | 'dpiY' | 'dpiAssumed' | 'widthIn' | 'heightIn'> {
  // Search a prefix for the first MediaBox — enough for normal single-page art PDFs.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)))
  const match = /\/MediaBox\s*\[\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\]/.exec(
    head,
  )
  if (!match) {
    throw new Error('Could not find a MediaBox in this PDF. Export a single-page print PDF and try again.')
  }
  const x0 = Number(match[1])
  const y0 = Number(match[2])
  const x1 = Number(match[3])
  const y1 = Number(match[4])
  const widthPt = Math.abs(x1 - x0)
  const heightPt = Math.abs(y1 - y0)
  if (widthPt < 1 || heightPt < 1) {
    throw new Error('This PDF MediaBox is empty.')
  }
  const widthIn = widthPt / 72
  const heightIn = heightPt / 72
  // Synthetic pixel size at 300 DPI so downstream DPI math still works.
  const dpi = DEFAULT_DPI
  return {
    pixelWidth: Math.round(widthIn * dpi),
    pixelHeight: Math.round(heightIn * dpi),
    dpiX: dpi,
    dpiY: dpi,
    dpiAssumed: false,
    widthIn,
    heightIn,
  }
}

function sniffKind(file: File, bytes: Uint8Array): MeasuredFile['kind'] {
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 4 && (ascii(bytes, 0, 2) === 'II' || ascii(bytes, 0, 2) === 'MM')) return 'tiff'
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'pdf'
  if (type.includes('png') || name.endsWith('.png')) return 'png'
  if (type.includes('jpeg') || type.includes('jpg') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg'
  if (type.includes('tif') || name.endsWith('.tif') || name.endsWith('.tiff')) return 'tiff'
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  return 'unknown'
}

/** Read only the leading bytes needed for headers (PDFs may need more for MediaBox). */
async function readPrefix(file: File, maxBytes: number) {
  const slice = file.slice(0, Math.min(file.size, maxBytes))
  return new Uint8Array(await slice.arrayBuffer())
}

export async function measureUploadFile(file: File): Promise<MeasuredFile> {
  if (!file || file.size <= 0) {
    throw new Error('Choose a PNG, PDF, or TIFF gang sheet to upload.')
  }

  // 4 MB covers PNG/JPEG/TIFF headers and most PDF MediaBox locations.
  const bytes = await readPrefix(file, 4_000_000)
  const kind = sniffKind(file, bytes)
  if (kind === 'unknown') {
    throw new Error('Upload a PNG (transparent), PDF, or TIFF gang sheet.')
  }

  let measured: Pick<MeasuredFile, 'pixelWidth' | 'pixelHeight' | 'dpiX' | 'dpiY' | 'dpiAssumed'> & {
    widthIn?: number
    heightIn?: number
  }

  if (kind === 'png') measured = measurePng(bytes)
  else if (kind === 'jpeg') measured = measureJpeg(bytes)
  else if (kind === 'tiff') measured = measureTiff(bytes)
  else measured = measurePdf(bytes)

  const dpiX = Math.max(1, measured.dpiX || DEFAULT_DPI)
  const dpiY = Math.max(1, measured.dpiY || DEFAULT_DPI)
  const widthIn = measured.widthIn ?? measured.pixelWidth / dpiX
  const heightIn = measured.heightIn ?? measured.pixelHeight / dpiY

  if (!(widthIn > 0) || !(heightIn > 0)) {
    throw new Error('Could not determine the physical size of this file.')
  }

  return {
    kind,
    pixelWidth: measured.pixelWidth,
    pixelHeight: measured.pixelHeight,
    dpiX,
    dpiY,
    dpiAssumed: measured.dpiAssumed,
    widthIn,
    heightIn,
    mimeType: file.type || (kind === 'png' ? 'image/png' : kind === 'jpeg' ? 'image/jpeg' : kind === 'tiff' ? 'image/tiff' : 'application/pdf'),
    fileName: file.name,
    byteLength: file.size,
  }
}

export function formatInches(value: number, digits = 2) {
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.?0+$/, '') || '0'
}
