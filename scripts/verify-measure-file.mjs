import assert from 'node:assert/strict'
import { measureUploadFile } from '../lib/measure-file.ts'
import { scaleToSafetyWidth } from '../lib/upload-scale.ts'
import { SAFETY_WIDTH_IN } from '../lib/sheet-pricing.ts'

function pngFixture({ width, height, dpi = 300 }) {
  // Minimal PNG: signature + IHDR + optional pHYs + IEND (no IDAT — header-only read)
  const chunks = []
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrData = new Uint8Array(13)
  const view = new DataView(ihdrData.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdrData[8] = 8
  ihdrData[9] = 6
  chunks.push(chunk('IHDR', ihdrData))
  if (dpi) {
    const phys = new Uint8Array(9)
    const pv = new DataView(phys.buffer)
    const ppm = Math.round(dpi / 0.0254)
    pv.setUint32(0, ppm)
    pv.setUint32(4, ppm)
    phys[8] = 1
    chunks.push(chunk('pHYs', phys))
  }
  chunks.push(chunk('IEND', new Uint8Array(0)))
  const total = signature.length + chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  out.set(signature, 0)
  let o = signature.length
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

function chunk(type, data) {
  const typeBytes = Uint8Array.from(type.split('').map((ch) => ch.charCodeAt(0)))
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  // CRC skipped for our header parser (it does not validate CRC)
  return out
}

function pdfFixture(widthIn, heightIn) {
  const w = widthIn * 72
  const h = heightIn * 72
  const body = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R >>endobj
4 0 obj<< /Length 0 >>stream
endstream
endobj
trailer<< /Root 1 0 R >>
%%EOF`
  return new TextEncoder().encode(body)
}

class FakeFile extends Blob {
  constructor(parts, name, opts) {
    super(parts, opts)
    this.name = name
    this.lastModified = Date.now()
  }
}

const png = new FakeFile([pngFixture({ width: 6600, height: 10800, dpi: 300 })], 'sheet.png', {
  type: 'image/png',
})
const measuredPng = await measureUploadFile(png)
assert.equal(measuredPng.widthIn, 22)
assert.equal(measuredPng.heightIn, 36)
assert.equal(measuredPng.dpiAssumed, false)

const pngNoDpi = new FakeFile([pngFixture({ width: 6600, height: 3600, dpi: 0 })], 'nodpi.png', {
  type: 'image/png',
})
const assumed = await measureUploadFile(pngNoDpi)
assert.equal(assumed.dpiAssumed, true)
assert.equal(assumed.widthIn, 22)
assert.equal(assumed.heightIn, 12)

const pdf = new FakeFile([pdfFixture(22, 36)], 'sheet.pdf', { type: 'application/pdf' })
const measuredPdf = await measureUploadFile(pdf)
assert.ok(Math.abs(measuredPdf.widthIn - 22) < 0.01)
assert.ok(Math.abs(measuredPdf.heightIn - 36) < 0.01)

const scaled = scaleToSafetyWidth({
  widthIn: 26,
  heightIn: 40,
  pixelWidth: 7800,
  pixelHeight: 12000,
})
assert.ok(Math.abs(scaled.scaledWidthIn - SAFETY_WIDTH_IN) < 1e-9)
assert.ok(Math.abs(scaled.scaledHeightIn - (40 * SAFETY_WIDTH_IN) / 26) < 1e-9)

console.log('measure-file + scale ok')
