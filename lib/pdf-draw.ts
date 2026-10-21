/**
 * Drawing primitives shared by the job paperwork PDFs (press sheet, image list).
 * Letter paper, inches, the same ink/muted/red palette as the builder UI.
 */

import { jsPDF } from 'jspdf'

export const PAGE_W = 8.5
export const PAGE_H = 11
export const MARGIN = 0.55
export const CONTENT_W = PAGE_W - MARGIN * 2
export const RIGHT = PAGE_W - MARGIN

export type Rgb = [number, number, number]
export const INK: Rgb = [23, 32, 51]
export const MUTED: Rgb = [93, 104, 120]
export const RULE: Rgb = [220, 225, 232]
export const RED: Rgb = [207, 32, 45]
export const PAPER: Rgb = [244, 246, 248]
export const WHITE: Rgb = [255, 255, 255]

export type PdfThumb = { dataUrl: string; format: 'JPEG' | 'PNG' }

/**
 * Shrink a design preview to a JPEG data URL jsPDF can embed. Transparent art
 * is flattened onto `background` — white for the press sheet, light gray for
 * the image list so white designs still show up.
 */
export async function pdfThumbFromUrl(
  url: string | null | undefined,
  options: { background?: string; maxPx?: number } = {},
): Promise<PdfThumb | null> {
  if (!url) return null
  const maxPx = options.maxPx ?? 260
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.fillStyle = options.background ?? '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), format: 'JPEG' }
  } catch {
    return null
  }
}

export function setFill(doc: jsPDF, rgb: Rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2])
}
export function setStroke(doc: jsPDF, rgb: Rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2])
}
export function setText(doc: jsPDF, rgb: Rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

export type TextOptions = {
  size?: number
  bold?: boolean
  color?: Rgb
  align?: 'left' | 'right' | 'center'
  font?: 'helvetica' | 'courier'
  angle?: number
}

export function text(doc: jsPDF, value: string, x: number, y: number, opts: TextOptions = {}) {
  doc.setFont(opts.font ?? 'helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 9)
  setText(doc, opts.color ?? INK)
  const extra: { align?: 'left' | 'right' | 'center'; angle?: number } = {}
  if (opts.align) extra.align = opts.align
  if (opts.angle) extra.angle = opts.angle
  doc.text(value, x, y, extra)
}

/** Like text(), but steps the font size down until the string fits in maxW. */
export function fitText(doc: jsPDF, value: string, x: number, y: number, maxW: number, opts: TextOptions & { size: number }) {
  doc.setFont(opts.font ?? 'helvetica', opts.bold ? 'bold' : 'normal')
  let size = opts.size
  doc.setFontSize(size)
  const width = doc.getTextWidth(value)
  if (width > maxW) size = Math.max(4.5, (size * maxW) / width)
  text(doc, value, x, y, { ...opts, size })
}

/** Width of `value` in inches at the given font. */
export function textWidth(doc: jsPDF, value: string, opts: { size: number; bold?: boolean; font?: 'helvetica' | 'courier' }) {
  doc.setFont(opts.font ?? 'helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size)
  return doc.getTextWidth(value)
}

/** Draws an empty tick box and its label; returns the x where the next item can start. */
export function checkbox(doc: jsPDF, x: number, y: number, label: string, size = 8, box = 0.1) {
  setStroke(doc, INK)
  doc.setLineWidth(0.008)
  doc.rect(x, y - box * 0.85, box, box)
  text(doc, label, x + box + 0.04, y, { size, color: MUTED, bold: true })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size)
  return x + box + 0.04 + doc.getTextWidth(label) + 0.16
}

export type DrawnThumb = { x: number; y: number; w: number; h: number }

/**
 * Draws a bordered box and fits the thumbnail inside it. `outline` adds the
 * red knife-path rectangle the builder preview uses for pre-cut jobs. Returns
 * where the picture itself landed so callers can hang labels off it.
 */
export function drawThumb(
  doc: jsPDF,
  thumb: PdfThumb | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { outline?: boolean; pad?: number; fill?: Rgb; border?: boolean } = {},
): DrawnThumb | null {
  const pad = options.pad ?? 0.08
  if (options.fill) {
    setFill(doc, options.fill)
    doc.roundedRect(x, y, w, h, 0.05, 0.05, 'F')
  }
  if (options.border !== false) {
    setStroke(doc, RULE)
    doc.setLineWidth(0.01)
    doc.roundedRect(x, y, w, h, 0.05, 0.05)
  }
  if (!thumb?.dataUrl) {
    text(doc, 'no art', x + w / 2, y + h / 2 + 0.04, { size: 8, color: MUTED, bold: true, align: 'center' })
    return null
  }
  try {
    const props = doc.getImageProperties(thumb.dataUrl)
    const aspect = props.width / Math.max(1, props.height)
    let drawW = w - pad * 2
    let drawH = drawW / aspect
    if (drawH > h - pad * 2) {
      drawH = h - pad * 2
      drawW = drawH * aspect
    }
    const dx = x + (w - drawW) / 2
    const dy = y + (h - drawH) / 2
    doc.addImage(thumb.dataUrl, thumb.format, dx, dy, drawW, drawH)
    if (options.outline) {
      setStroke(doc, RED)
      doc.setLineWidth(0.012)
      doc.rect(dx - 0.03, dy - 0.03, drawW + 0.06, drawH + 0.06)
    }
    return { x: dx, y: dy, w: drawW, h: drawH }
  } catch {
    return null
  }
}
