/**
 * "Image list": one PDF per job that shows every design that was ordered —
 * its number, a picture, the size it prints at, and how many copies are on
 * the sheet. It goes in the Drive job folder with the sheet PNGs and cut
 * files so a reprint (sizing issue, lost transfer) never means reopening the
 * project to find out what was ordered.
 */

import { jsPDF } from 'jspdf'
import { printDpi, qualityFromDpi } from '@/lib/image-utils'
import {
  CONTENT_W,
  INK,
  MARGIN,
  MUTED,
  PAGE_H,
  PAPER,
  RED,
  RIGHT,
  RULE,
  WHITE,
  checkbox,
  drawThumb,
  fitText,
  pdfThumbFromUrl,
  setFill,
  setStroke,
  text,
  textWidth,
  type PdfThumb,
} from '@/lib/pdf-draw'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

export type ImageListImage = {
  /** 1-based design number, as printed on the gang sheet label. */
  number: number
  name: string
  /** Printed size on the film — the art fitted inside the chosen size box. */
  widthIn: number
  heightIn: number
  /** Copies on the sheet (transfers). */
  quantity: number
  placement?: string
  /** The size preset the customer picked, e.g. "Large · 9.75 × 11 in". */
  sizeLabel?: string
  pixelWidth?: number
  pixelHeight?: number
  /** Name of the art file saved next to the PDF in the Drive job folder. */
  artFileName?: string
  thumb?: PdfThumb | null
}

export type ImageListSheet = {
  /** "1 of 2" */
  label: string
  billedLengthIn: number
  transfers: number
  printFileName: string
  cutFileName?: string
  pieces: Array<{ designNumber: number; name: string; qty: number }>
}

export type ImageListInput = {
  customerName: string
  stamp: string
  images: ImageListImage[]
  sheets: ImageListSheet[]
  cutOut: boolean
  printPress?: boolean
}

/** Light gray backing so white art is visible on the page. */
export const IMAGE_LIST_THUMB_BACKGROUND = '#f4f6f8'

export function imageListThumbFromUrl(url: string | null | undefined) {
  return pdfThumbFromUrl(url, { background: IMAGE_LIST_THUMB_BACKGROUND, maxPx: 420 })
}

/** `Customer 10-21 1347     Image list.pdf` — same safe stamp as the sheet PNG and PLT names. */
export function imageListFileName(customerName: string, stamp: string) {
  const safe = (value: string) =>
    value
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  return `${safe(customerName) || 'Customer'} ${safe(stamp)}     Image list.pdf`
}

/** 10.5, 12, 3.75 — never 12.00. */
export function inches(value: number) {
  return String(Math.round(value * 100) / 100)
}

type State = { doc: jsPDF; y: number }

const ROW_H = 1.72
const ROW_GAP = 0.1

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function ensureSpace(state: State, input: ImageListInput, needed: number) {
  if (state.y + needed <= PAGE_H - MARGIN - 0.3) return
  state.doc.addPage()
  state.y = MARGIN
  drawHeader(state, input, true)
}

function drawHeader(state: State, input: ImageListInput, continued = false) {
  const { doc } = state
  const y = MARGIN
  const transfers = input.images.reduce((sum, image) => sum + image.quantity, 0)
  const billed = input.sheets.reduce((sum, sheet) => sum + sheet.billedLengthIn, 0)
  text(doc, 'SOUTH SIDE DTF · IMAGE LIST', MARGIN, y + 0.12, { size: 8, bold: true, color: RED })
  text(doc, input.customerName || 'Customer', MARGIN, y + 0.42, { size: 18, bold: true })
  const tags = [
    `Job ${input.stamp}`,
    plural(input.images.length, 'image'),
    input.cutOut ? 'pre-cut' : 'printed only',
    input.printPress ? 'Print & Press' : '',
    continued ? 'continued' : '',
  ].filter(Boolean)
  text(doc, tags.join(' · '), MARGIN, y + 0.6, { size: 8.5, color: MUTED, bold: true })
  text(doc, 'TRANSFERS', RIGHT, y + 0.12, { size: 7.5, bold: true, color: MUTED, align: 'right' })
  text(doc, String(transfers), RIGHT, y + 0.42, { size: 16, bold: true, align: 'right' })
  text(doc, `${plural(input.sheets.length, 'sheet')} · ${SHEET_WIDTH_IN} × ${inches(billed)} in`, RIGHT, y + 0.6, { size: 8, color: MUTED, bold: true, align: 'right' })
  setStroke(doc, INK)
  doc.setLineWidth(0.02)
  doc.line(MARGIN, y + 0.72, RIGHT, y + 0.72)
  state.y = y + 0.9
}

/** Where each sheet file lives — the PNG to reprint from and its cut file. */
function drawFiles(state: State, input: ImageListInput) {
  const { doc } = state
  if (input.sheets.length === 0) return
  const columns = Math.min(2, input.sheets.length)
  const gap = 0.12
  const boxW = (CONTENT_W - gap * (columns - 1)) / columns
  const rows = Math.ceil(input.sheets.length / columns)
  const boxH = 0.6
  ensureSpace(state, input, rows * (boxH + gap))
  input.sheets.forEach((sheet, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const x = MARGIN + col * (boxW + gap)
    const y = state.y + row * (boxH + gap)
    setStroke(doc, RULE)
    doc.setLineWidth(0.01)
    doc.roundedRect(x, y, boxW, boxH, 0.06, 0.06)
    fitText(doc, `SHEET ${sheet.label.toUpperCase()} · ${SHEET_WIDTH_IN} × ${inches(sheet.billedLengthIn)} IN · ${sheet.transfers} TRANSFERS`, x + 0.1, y + 0.17, boxW - 0.2, { size: 7.5, bold: true })
    fitText(doc, `PNG  ${sheet.printFileName}`, x + 0.1, y + 0.33, boxW - 0.2, { size: 7, font: 'courier' })
    if (sheet.cutFileName) {
      fitText(doc, `PLT  ${sheet.cutFileName}`, x + 0.1, y + 0.48, boxW - 0.2, { size: 7, font: 'courier', color: RED })
    } else {
      text(doc, 'no cut file · printed only', x + 0.1, y + 0.48, { size: 7, color: MUTED, bold: true })
    }
  })
  state.y += rows * (boxH + gap) + 0.04
  const note = 'Print size is what the gang sheet prints — the art fitted inside the size box the customer picked. Quantity is the number of transfers on the sheet. Reprint from the sheet PNG, or from the art file at the size shown.'
  const lines = doc.splitTextToSize(note, CONTENT_W) as string[]
  lines.forEach((line, index) => text(doc, line, MARGIN, state.y + 0.1 + index * 0.13, { size: 7, color: MUTED, bold: true }))
  state.y += 0.1 + lines.length * 0.13 + 0.06
  setStroke(doc, RULE)
  doc.setLineWidth(0.01)
  doc.line(MARGIN, state.y, RIGHT, state.y)
  state.y += 0.14
}

function sheetsForImage(input: ImageListInput, image: ImageListImage) {
  const hits = input.sheets
    .map((sheet) => ({ sheet, qty: sheet.pieces.filter((piece) => piece.designNumber === image.number).reduce((sum, piece) => sum + piece.qty, 0) }))
    .filter((hit) => hit.qty > 0)
  if (hits.length === 0) return input.sheets.length === 1 ? input.sheets[0].label : '–'
  if (hits.length === 1) return hits[0].sheet.label
  return hits.map((hit) => `${hit.sheet.label.split(' of ')[0]} (×${hit.qty})`).join(' · ')
}

/** Thin dimension line with end ticks. */
function dimensionLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  setStroke(doc, MUTED)
  doc.setLineWidth(0.006)
  doc.line(x1, y1, x2, y2)
  const tick = 0.04
  if (y1 === y2) {
    doc.line(x1, y1 - tick, x1, y1 + tick)
    doc.line(x2, y2 - tick, x2, y2 + tick)
  } else {
    doc.line(x1 - tick, y1, x1 + tick, y1)
    doc.line(x2 - tick, y2, x2 + tick, y2)
  }
}

function drawRow(state: State, input: ImageListInput, image: ImageListImage) {
  const { doc } = state
  ensureSpace(state, input, ROW_H + ROW_GAP)
  const top = state.y
  setStroke(doc, RULE)
  doc.setLineWidth(0.01)
  doc.roundedRect(MARGIN, top, CONTENT_W, ROW_H, 0.07, 0.07)

  // Number badge.
  const badgeX = MARGIN + 0.36
  const badgeY = top + 0.38
  setFill(doc, INK)
  doc.circle(badgeX, badgeY, 0.21, 'F')
  text(doc, String(image.number), badgeX, badgeY + 0.045, { size: image.number >= 100 ? 8 : 11, bold: true, color: WHITE, align: 'center' })
  text(doc, 'IMAGE', badgeX, badgeY + 0.37, { size: 5.5, bold: true, color: MUTED, align: 'center' })

  // Picture with its printed width and height called out.
  const thumbX = MARGIN + 0.74
  const thumbY = top + 0.12
  const thumbW = 1.42
  const thumbH = 1.22
  const drawn = drawThumb(doc, image.thumb, thumbX, thumbY, thumbW, thumbH, { outline: input.cutOut, fill: PAPER, pad: 0.1 })
  const widthLabel = `${inches(image.widthIn)} in`
  const heightLabel = `${inches(image.heightIn)} in`
  if (drawn) {
    const lineY = thumbY + thumbH + 0.08
    dimensionLine(doc, drawn.x, lineY, drawn.x + drawn.w, lineY)
    text(doc, widthLabel, drawn.x + drawn.w / 2, lineY + 0.15, { size: 6.5, bold: true, color: MUTED, align: 'center' })
    const lineX = thumbX + thumbW + 0.08
    dimensionLine(doc, lineX, drawn.y, lineX, drawn.y + drawn.h)
    const labelW = textWidth(doc, heightLabel, { size: 6.5, bold: true })
    text(doc, heightLabel, lineX + 0.14, drawn.y + drawn.h / 2 + labelW / 2, { size: 6.5, bold: true, color: MUTED, angle: 90 })
  } else {
    text(doc, `${widthLabel} × ${heightLabel}`, thumbX + thumbW / 2, thumbY + thumbH + 0.23, { size: 6.5, bold: true, color: MUTED, align: 'center' })
  }

  // Facts.
  const tx = MARGIN + 2.62
  const tw = RIGHT - 0.12 - tx
  fitText(doc, image.name, tx, top + 0.31, tw, { size: 12, bold: true })

  const qtyX = tx + 2.5
  const sheetX = tx + 3.5
  text(doc, 'PRINT SIZE', tx, top + 0.58, { size: 7, bold: true, color: MUTED })
  text(doc, 'QUANTITY', qtyX, top + 0.58, { size: 7, bold: true, color: MUTED })
  text(doc, 'ON SHEET', sheetX, top + 0.58, { size: 7, bold: true, color: MUTED })
  fitText(doc, `${inches(image.widthIn)} × ${inches(image.heightIn)} in`, tx, top + 0.9, qtyX - tx - 0.15, { size: 20, bold: true })
  fitText(doc, String(image.quantity), qtyX, top + 0.9, sheetX - qtyX - 0.15, { size: 20, bold: true })
  fitText(doc, sheetsForImage(input, image), sheetX, top + 0.88, tx + tw - sheetX, { size: 12, bold: true })

  const preset = image.placement === 'Custom'
    ? `Custom size · ${inches(image.widthIn)} × ${inches(image.heightIn)} in`
    : [image.placement, image.sizeLabel].filter(Boolean).join(' · ')
  fitText(doc, preset || 'Size as uploaded', tx, top + 1.13, tw, { size: 7.5, bold: true, color: MUTED })

  const dpi = printDpi(image.pixelWidth ?? 0, image.widthIn)
  const quality = qualityFromDpi(dpi)
  const artLine = image.pixelWidth && image.pixelHeight
    ? `Art ${image.pixelWidth} × ${image.pixelHeight} px · ${dpi} DPI at this size · ${quality.label}`
    : 'Art pixel size unknown'
  fitText(doc, artLine, tx, top + 1.27, tw, { size: 7.5, bold: true, color: quality.tone === 'poor' ? RED : MUTED })

  fitText(doc, `Art file  ${image.artFileName ?? 'not saved — re-upload from the project'}`, tx, top + 1.41, tw, { size: 7, font: 'courier', color: image.artFileName ? INK : RED })

  let cx = tx
  cx = checkbox(doc, cx, top + 1.6, 'Reprint', 7)
  cx = checkbox(doc, cx, top + 1.6, 'qty ______', 7)
  checkbox(doc, cx, top + 1.6, 'reason ______________________', 7)

  state.y = top + ROW_H + ROW_GAP
}

function drawFooter(doc: jsPDF, input: ImageListInput, page: number, total: number) {
  text(doc, 'Sizes are the printed size on the film. Quantities are transfers on the sheet, not garments.', MARGIN, PAGE_H - 0.28, { size: 7, color: MUTED, bold: true })
  text(doc, `${input.customerName || 'Customer'} · ${input.stamp} · Image list · page ${page} of ${total}`, RIGHT, PAGE_H - 0.28, { size: 7, color: MUTED, align: 'right' })
}

export async function generateImageListPdf(input: ImageListInput): Promise<Blob> {
  const doc = new jsPDF({ unit: 'in', format: 'letter', compress: true })
  const state: State = { doc, y: MARGIN }
  drawHeader(state, input)
  drawFiles(state, input)
  const images = [...input.images].sort((a, b) => a.number - b.number)
  images.forEach((image) => drawRow(state, input, image))
  if (images.length === 0) {
    text(doc, 'No images on this job.', MARGIN, state.y + 0.2, { size: 9, bold: true, color: MUTED })
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    drawFooter(doc, input, page, pages)
  }
  return doc.output('blob')
}
