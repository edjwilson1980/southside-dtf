import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { LABEL_MARGIN_IN, LABEL_PT, type PlacedSheetPiece } from '@/lib/compose-sheet'
import { mapRgbaThroughCmyk } from '@/lib/cmyk-map'
import { setPngDpi } from '@/lib/png-dpi'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

/**
 * Server version of composeGangSheet (lib/compose-sheet.ts), step for step:
 * transparent sheet → label top and bottom → art contain-fitted in each slot
 * (turned a quarter turn clockwise when the packer turned it) → CMYK mapping →
 * registration circles and start arrow → PNG with the sheet's DPI.
 * Pieces carry `previewUrl` as a key into `art` (trimmed PNG buffers).
 */

const LABEL_HEIGHT_IN = LABEL_PT / 72
const FONT_FILE = join(process.cwd(), 'lib/server/fonts/Arimo-Bold.ttf')

type Mark = { xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string }

export async function composeGangSheetNode(opts: {
  pieces: PlacedSheetPiece[]
  art: Map<string, { png: Buffer; width: number; height: number }>
  sheetLengthIn: number
  pxPerIn: number
  label?: string
  mapCmyk?: boolean
  marks?: Mark[]
  startArrow?: Array<{ xIn: number; yIn: number }>
}): Promise<Buffer> {
  const ppi = opts.pxPerIn
  const width = Math.max(1, Math.round(SHEET_WIDTH_IN * ppi))
  const height = Math.max(1, Math.round(opts.sheetLengthIn * ppi))
  const layers: OverlayOptions[] = []

  if (opts.label) {
    const label = await renderLabel(opts.label, ppi)
    const centerY = (LABEL_MARGIN_IN + LABEL_HEIGHT_IN / 2) * ppi
    const left = Math.round((width - label.width) / 2)
    for (const cy of [centerY, height - centerY]) {
      layers.push({ input: label.png, left, top: Math.round(cy - label.height / 2) })
    }
  }

  // One resized copy per art + drawn size + turn, reused by every repeat.
  const cache = new Map<string, Promise<Buffer>>()
  for (const piece of opts.pieces) {
    const art = opts.art.get(piece.previewUrl)
    if (!art) continue
    const x = piece.xIn * ppi
    const y = piece.yIn * ppi
    const w = piece.widthIn * ppi
    const h = piece.heightIn * ppi
    const boxW = piece.rotated ? h : w
    const boxH = piece.rotated ? w : h
    const scale = Math.min(boxW / Math.max(1, art.width), boxH / Math.max(1, art.height))
    const drawW = Math.max(1, Math.round(art.width * scale))
    const drawH = Math.max(1, Math.round(art.height * scale))
    const key = `${piece.previewUrl}|${drawW}x${drawH}|${piece.rotated ? 'r' : 'u'}`
    let buffer = cache.get(key)
    if (!buffer) {
      let img = sharp(art.png).resize(drawW, drawH, { fit: 'fill', kernel: 'linear' })
      if (piece.rotated) img = sharp(await img.png().toBuffer()).rotate(90)
      buffer = img.png().toBuffer()
      cache.set(key, buffer)
    }
    // Same placement as the canvas: centred in the slot (a turned piece is drawH wide, drawW tall).
    const left = piece.rotated ? x + (w - drawH) / 2 : x + (boxW - drawW) / 2
    const top = piece.rotated ? y + (h - drawW) / 2 : y + (boxH - drawH) / 2
    layers.push({ input: await buffer, left: Math.round(left), top: Math.round(top) })
  }

  const sheet = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }, limitInputPixels: false })
    .composite(layers)
    .raw()
    .toBuffer()
  if (opts.mapCmyk) mapRgbaThroughCmyk(sheet)

  const marks = marksSvg(opts.marks ?? [], opts.startArrow ?? [], width, height, ppi)
  let out = sharp(sheet, { raw: { width, height, channels: 4 }, limitInputPixels: false })
  if (marks) out = out.composite([{ input: Buffer.from(marks), left: 0, top: 0, limitInputPixels: false }])
  const png = await out.png({ compressionLevel: 6 }).toBuffer()
  return Buffer.from(setPngDpi(png, width / SHEET_WIDTH_IN))
}

/** The sheet label: bold, 72 pt (1 in at the sheet's ppi), #111111, spaces kept. */
async function renderLabel(text: string, ppi: number) {
  if (!existsSync(FONT_FILE)) throw new Error(`Label font missing: ${FONT_FILE}`)
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const png = await sharp({
    text: {
      text: `<span foreground="#111111">${escaped}</span>`,
      font: `Arimo Bold ${LABEL_PT}`,
      fontfile: FONT_FILE,
      dpi: Math.round(ppi),
      rgba: true,
    },
  })
    .png()
    .toBuffer()
  const meta = await sharp(png).metadata()
  return { png, width: meta.width ?? 1, height: meta.height ?? 1 }
}

/** Registration circles (black) and the start arrow (white halo, black arrow), drawn after CMYK. */
function marksSvg(marks: Mark[], arrow: Array<{ xIn: number; yIn: number }>, width: number, height: number, ppi: number): string | null {
  if (!marks.length && arrow.length < 3) return null
  const parts: string[] = []
  for (const m of marks) {
    const cx = (m.xIn + m.widthIn / 2) * ppi
    const cy = (m.yIn + m.heightIn / 2) * ppi
    const r = Math.max(1, Math.max(2, Math.min(m.widthIn, m.heightIn) * ppi) / 2)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${m.color || '#000000'}"/>`)
  }
  if (arrow.length >= 3) {
    const cx = arrow.reduce((s, p) => s + p.xIn, 0) / arrow.length
    const cy = arrow.reduce((s, p) => s + p.yIn, 0) / arrow.length
    const pts = (scale: number) =>
      arrow.map((p) => `${(cx + (p.xIn - cx) * scale) * ppi},${(cy + (p.yIn - cy) * scale) * ppi}`).join(' ')
    parts.push(`<polygon points="${pts(1.9)}" fill="#ffffff"/>`, `<polygon points="${pts(1)}" fill="#000000"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('')}</svg>`
}
