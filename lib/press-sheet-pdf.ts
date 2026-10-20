/**
 * Print & Press "press sheet": the one-page-per-job PDF the crew works from.
 * It names every print PNG and cut PLT, shows which design goes on the front
 * and back of each garment line, the size counts, and the name roster, so the
 * person weeding and pressing never has to guess what belongs where.
 */

import { jsPDF } from 'jspdf'
import {
  PRINT_PRESS_SIZES,
  money,
  printPressGarmentLabel,
  printPressLocationLabel,
  type PrintPressCartSummary,
} from '@/lib/print-press'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

const PAGE_W = 8.5
const PAGE_H = 11
const MARGIN = 0.55
const CONTENT_W = PAGE_W - MARGIN * 2
const RIGHT = PAGE_W - MARGIN
const INK: [number, number, number] = [23, 32, 51]
const MUTED: [number, number, number] = [93, 104, 120]
const RULE: [number, number, number] = [220, 225, 232]
const RED: [number, number, number] = [207, 32, 45]
const THUMB_PX = 260

export type PressSheetThumb = { dataUrl: string; format: 'JPEG' | 'PNG' }

export type PressSheetDesign = {
  /** 1-based design number, as printed on the gang sheet label. */
  number: number
  name: string
  widthIn: number
  heightIn: number
  thumb?: PressSheetThumb | null
}

export type PressSheetSheet = {
  /** "1 of 2" */
  label: string
  billedLengthIn: number
  transfers: number
  printFileName: string
  cutFileName?: string
  pieces: Array<{ designNumber: number; name: string; qty: number }>
}

export type PressSheetInput = {
  customerName: string
  stamp: string
  summary: PrintPressCartSummary
  designs: PressSheetDesign[]
  sheets: PressSheetSheet[]
  gangSheetPrice: number
}

/** Shrink a design preview to a JPEG data URL jsPDF can embed. */
export async function pressSheetThumbFromUrl(url: string | null | undefined): Promise<PressSheetThumb | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, THUMB_PX / Math.max(bitmap.width, bitmap.height))
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
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), format: 'JPEG' }
  } catch {
    return null
  }
}

type State = { doc: jsPDF; y: number }

function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2])
}
function setStroke(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2])
}
function setText(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

function text(doc: jsPDF, value: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; font?: 'helvetica' | 'courier' } = {}) {
  doc.setFont(opts.font ?? 'helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 9)
  setText(doc, opts.color ?? INK)
  doc.text(value, x, y, opts.align ? { align: opts.align } : undefined)
}

/** Draws an empty tick box and its label; returns the x where the next item can start. */
function checkbox(doc: jsPDF, x: number, y: number, label: string, size = 8, box = 0.1) {
  setStroke(doc, INK)
  doc.setLineWidth(0.008)
  doc.rect(x, y - box * 0.85, box, box)
  text(doc, label, x + box + 0.04, y, { size, color: MUTED, bold: true })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size)
  return x + box + 0.04 + doc.getTextWidth(label) + 0.16
}

function rule(state: State) {
  setStroke(state.doc, RULE)
  state.doc.setLineWidth(0.01)
  state.doc.line(MARGIN, state.y, RIGHT, state.y)
  state.y += 0.14
}

function ensureSpace(state: State, input: PressSheetInput, needed: number) {
  if (state.y + needed <= PAGE_H - MARGIN - 0.3) return
  state.doc.addPage()
  drawHeader(state, input, true)
}

function drawHeader(state: State, input: PressSheetInput, continued = false) {
  const { doc, y: top } = state
  const y = MARGIN
  text(doc, 'SOUTH SIDE DTF · PRINT & PRESS', MARGIN, y + 0.12, { size: 8, bold: true, color: RED })
  text(doc, input.customerName || 'Customer', MARGIN, y + 0.42, { size: 18, bold: true })
  const totalTransfers = input.sheets.reduce((sum, sheet) => sum + sheet.transfers, 0)
  text(
    doc,
    `Job ${input.stamp} · ${input.summary.lines.length} line${input.summary.lines.length === 1 ? '' : 's'} · ${input.summary.garments} garments · ${totalTransfers} pre-cut transfers${continued ? ' · continued' : ''}`,
    MARGIN,
    y + 0.6,
    { size: 8.5, color: MUTED, bold: true },
  )
  text(doc, 'LABOR', RIGHT, y + 0.12, { size: 7.5, bold: true, color: MUTED, align: 'right' })
  text(doc, money(input.summary.labor), RIGHT, y + 0.42, { size: 16, bold: true, align: 'right' })
  text(
    doc,
    `tier ${input.summary.tier} · ${money(input.summary.firstSideEach)} / +${money(input.summary.secondSideEach)} · sheet ${money(input.gangSheetPrice)}`,
    RIGHT,
    y + 0.6,
    { size: 8, color: MUTED, bold: true, align: 'right' },
  )
  setStroke(doc, INK)
  doc.setLineWidth(0.02)
  doc.line(MARGIN, y + 0.72, RIGHT, y + 0.72)
  state.y = Math.max(top, y + 0.9)
}

function drawFiles(state: State, input: PressSheetInput) {
  const { doc } = state
  const columns = Math.min(2, Math.max(1, input.sheets.length))
  const gap = 0.12
  const boxW = (CONTENT_W - gap * (columns - 1)) / columns
  const rows = Math.ceil(input.sheets.length / columns)
  const boxH = 0.86
  ensureSpace(state, input, rows * (boxH + gap))
  input.sheets.forEach((sheet, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const x = MARGIN + col * (boxW + gap)
    const y = state.y + row * (boxH + gap)
    setStroke(doc, RULE)
    doc.setLineWidth(0.01)
    doc.roundedRect(x, y, boxW, boxH, 0.06, 0.06)
    text(doc, `SHEET ${sheet.label.toUpperCase()} · ${SHEET_WIDTH_IN} × ${sheet.billedLengthIn} IN · ${sheet.transfers} TRANSFERS`, x + 0.1, y + 0.17, { size: 7.5, bold: true })
    text(doc, `PNG  ${sheet.printFileName}`, x + 0.1, y + 0.33, { size: 7, font: 'courier' })
    text(doc, `PLT  ${sheet.cutFileName ?? '—'}`, x + 0.1, y + 0.46, { size: 7, font: 'courier', color: RED })
    const pieces = sheet.pieces.map((piece) => `#${piece.designNumber} ${piece.name} × ${piece.qty}`).join(' · ')
    const pieceLines = doc.splitTextToSize(pieces, boxW - 0.2) as string[]
    text(doc, pieceLines[0] ?? '', x + 0.1, y + 0.6, { size: 7, color: MUTED, bold: true })
    let cx = x + 0.1
    cx = checkbox(doc, cx, y + 0.76, 'printed', 7)
    cx = checkbox(doc, cx, y + 0.76, 'cut', 7)
    checkbox(doc, cx, y + 0.76, 'weeded & sorted by design', 7)
  })
  state.y += rows * (boxH + gap) + 0.06
}

function drawSizeTotals(state: State, input: PressSheetInput) {
  const { doc } = state
  const totals = PRINT_PRESS_SIZES.map((size) => input.summary.lines.reduce((sum, line) => sum + (line.sizes[size] ?? 0), 0))
  const labelW = 1.9
  const cellW = (CONTENT_W - labelW - 0.7) / PRINT_PRESS_SIZES.length
  const h = 0.26
  ensureSpace(state, input, h * 2 + 0.2)
  const y = state.y
  setFill(doc, [244, 246, 248])
  doc.rect(MARGIN, y, CONTENT_W, h, 'F')
  setStroke(doc, RULE)
  doc.setLineWidth(0.01)
  doc.rect(MARGIN, y, CONTENT_W, h * 2)
  text(doc, 'ALL GARMENTS', MARGIN + 0.1, y + 0.17, { size: 8, bold: true })
  PRINT_PRESS_SIZES.forEach((size, index) => {
    text(doc, size, MARGIN + labelW + cellW * index + cellW / 2, y + 0.17, { size: 8, bold: true, color: MUTED, align: 'center' })
  })
  text(doc, 'Total', RIGHT - 0.1, y + 0.17, { size: 8, bold: true, color: MUTED, align: 'right' })
  const front = input.summary.lines.filter((line) => line.location !== 'back').reduce((sum, line) => sum + line.quantity, 0)
  const back = input.summary.lines.filter((line) => line.location !== 'front').reduce((sum, line) => sum + line.quantity, 0)
  text(doc, `${front} front · ${back} back transfers`, MARGIN + 0.1, y + h + 0.17, { size: 8, color: MUTED, bold: true })
  totals.forEach((count, index) => {
    text(doc, count ? String(count) : '–', MARGIN + labelW + cellW * index + cellW / 2, y + h + 0.17, { size: 9, bold: true, align: 'center' })
  })
  text(doc, String(input.summary.garments), RIGHT - 0.1, y + h + 0.17, { size: 9, bold: true, align: 'right' })
  state.y = y + h * 2 + 0.18
}

function drawImage(doc: jsPDF, thumb: PressSheetThumb | null | undefined, x: number, y: number, w: number, h: number) {
  setStroke(doc, RULE)
  doc.setLineWidth(0.01)
  doc.roundedRect(x, y, w, h, 0.05, 0.05)
  if (!thumb?.dataUrl) {
    text(doc, 'no art', x + w / 2, y + h / 2 + 0.04, { size: 8, color: MUTED, bold: true, align: 'center' })
    return
  }
  try {
    const props = doc.getImageProperties(thumb.dataUrl)
    const aspect = props.width / Math.max(1, props.height)
    let drawW = w - 0.16
    let drawH = drawW / aspect
    if (drawH > h - 0.16) {
      drawH = h - 0.16
      drawW = drawH * aspect
    }
    const dx = x + (w - drawW) / 2
    const dy = y + (h - drawH) / 2
    doc.addImage(thumb.dataUrl, thumb.format, dx, dy, drawW, drawH)
    // The red outline is the knife path — same cue the builder preview uses.
    setStroke(doc, RED)
    doc.setLineWidth(0.012)
    doc.rect(dx - 0.03, dy - 0.03, drawW + 0.06, drawH + 0.06)
  } catch {
    // Empty box is fine.
  }
}

function sheetsForDesign(input: PressSheetInput, designNumber: number | null) {
  if (designNumber === null) return '–'
  const labels = input.sheets.filter((sheet) => sheet.pieces.some((piece) => piece.designNumber === designNumber)).map((sheet) => sheet.label.split(' of ')[0])
  return labels.length ? labels.join(', ') : '–'
}

function drawLine(state: State, input: PressSheetInput, index: number) {
  const { doc } = state
  const line = input.summary.lines[index]
  const front = line.location !== 'back' ? input.designs.find((design) => design.number === line.frontDesign) : undefined
  const back = line.location !== 'front' ? input.designs.find((design) => design.number === line.backDesign) : undefined
  const imageW = 1.45
  const imageH = 1.1
  const imageCount = (front || line.location !== 'back' ? 1 : 0) + (back || line.location !== 'front' ? 1 : 0)
  const imagesW = imageCount * (imageW + 0.12)
  const rosterRows = line.roster.length > 0 ? Math.ceil(Math.min(line.roster.length, line.quantity) / 4) : 0
  const namesH = line.personalized > 0 ? 0.42 + rosterRows * 0.17 : 0
  const bodyH = Math.max(imageH + 0.62, 0.78 + namesH + 0.3)
  const barH = 0.32
  ensureSpace(state, input, barH + bodyH + 0.2)

  const top = state.y
  setFill(doc, INK)
  doc.roundedRect(MARGIN, top, CONTENT_W, barH + bodyH, 0.07, 0.07, 'S')
  doc.rect(MARGIN, top, CONTENT_W, barH, 'F')
  setFill(doc, [255, 255, 255])
  doc.circle(MARGIN + 0.22, top + barH / 2, 0.1, 'F')
  text(doc, String(index + 1), MARGIN + 0.22, top + barH / 2 + 0.035, { size: 8, bold: true, align: 'center' })
  text(doc, `${line.color} ${printPressGarmentLabel(line.garment)}`, MARGIN + 0.42, top + 0.21, { size: 11, bold: true, color: [255, 255, 255] })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const nameW = doc.getTextWidth(`${line.color} ${printPressGarmentLabel(line.garment)}`)
  text(doc, `· print on ${printPressLocationLabel(line.location).toUpperCase()}`, MARGIN + 0.5 + nameW, top + 0.21, { size: 8.5, bold: true, color: [220, 225, 232] })
  text(doc, `${line.quantity} pcs`, RIGHT - 0.12, top + 0.21, { size: 11, bold: true, color: [255, 255, 255], align: 'right' })

  // Image cards.
  let ix = MARGIN + 0.12
  const iy = top + barH + 0.12
  const card = (design: PressSheetDesign | undefined, side: string, number: number | null) => {
    drawImage(doc, design?.thumb, ix, iy, imageW, imageH)
    text(doc, `${side} · ${line.quantity} pcs`, ix, iy + imageH + 0.15, { size: 7.5, bold: true })
    const name = design ? `#${design.number} ${design.name}` : 'design missing'
    const nameLines = doc.splitTextToSize(name, imageW) as string[]
    text(doc, nameLines[0] ?? '', ix, iy + imageH + 0.28, { size: 7, color: design ? MUTED : RED, bold: true })
    text(doc, design ? `${design.widthIn} × ${design.heightIn} in · pre-cut · sheet ${sheetsForDesign(input, number)}` : '', ix, iy + imageH + 0.4, { size: 7, color: MUTED, bold: true })
    ix += imageW + 0.12
  }
  if (line.location !== 'back') card(front, 'FRONT', line.frontDesign)
  if (line.location !== 'front') card(back, 'BACK', line.backDesign)

  // Size boxes.
  const gridX = MARGIN + 0.12 + imagesW + 0.08
  const gridW = RIGHT - 0.12 - gridX
  const cellW = (gridW - 0.06 * (PRINT_PRESS_SIZES.length - 1)) / PRINT_PRESS_SIZES.length
  const cellH = 0.56
  PRINT_PRESS_SIZES.forEach((size, sizeIndex) => {
    const qty = line.sizes[size] ?? 0
    const x = gridX + sizeIndex * (cellW + 0.06)
    setStroke(doc, qty ? INK : RULE)
    doc.setLineWidth(0.01)
    doc.roundedRect(x, iy, cellW, cellH, 0.04, 0.04)
    text(doc, size, x + cellW / 2, iy + 0.14, { size: 7, bold: true, color: qty ? INK : RULE, align: 'center' })
    text(doc, qty ? String(qty) : '–', x + cellW / 2, iy + 0.36, { size: 13, bold: true, color: qty ? INK : RULE, align: 'center' })
    if (qty > 0) {
      const start = x + Math.max(0.03, (cellW - 0.54) / 2)
      const next = checkbox(doc, start, iy + 0.5, 'pull', 5, 0.07)
      checkbox(doc, next - 0.06, iy + 0.5, 'press', 5, 0.07)
    }
  })

  // Names.
  let ny = iy + cellH + 0.14
  if (line.personalized > 0) {
    setStroke(doc, INK)
    doc.setLineWidth(0.01)
    doc.setLineDashPattern([0.04, 0.03], 0)
    doc.roundedRect(gridX, ny, gridW, namesH - 0.06, 0.04, 0.04)
    doc.setLineDashPattern([], 0)
    text(doc, 'PERSONALIZED NAMES', gridX + 0.1, ny + 0.17, { size: 7.5, bold: true })
    text(doc, `${line.personalized} of ${line.quantity} · match the pre-cut name transfer to the shirt before pressing`, gridX + 1.5, ny + 0.17, { size: 7, color: MUTED, bold: true })
    if (line.roster.length > 0) {
      const colW = (gridW - 0.2) / 4
      line.roster.slice(0, line.quantity).forEach((name, nameIndex) => {
        const col = nameIndex % 4
        const row = Math.floor(nameIndex / 4)
        checkbox(doc, gridX + 0.1 + col * colW, ny + 0.36 + row * 0.17, name.slice(0, 22), 7)
      })
    } else {
      text(doc, 'Roster not supplied yet — get the list before pressing.', gridX + 0.1, ny + 0.36, { size: 7.5, bold: true, color: RED })
    }
    ny += namesH
  }

  // Bottom checklist.
  const cy = top + barH + bodyH - 0.12
  let cx = gridX
  cx = checkbox(doc, cx, cy, 'Garments counted in', 7)
  cx = checkbox(doc, cx, cy, 'Pre-cut transfers pulled', 7)
  cx = checkbox(doc, cx, cy, 'Pressed', 7)
  checkbox(doc, cx, cy, 'Counted out', 7)
  text(doc, 'Press: ________', RIGHT - 0.12, cy, { size: 7, color: MUTED, bold: true, align: 'right' })

  state.y = top + barH + bodyH + 0.14
}

function drawFooter(doc: jsPDF, input: PressSheetInput, page: number, total: number) {
  const s = input.summary
  const math = [`${s.garments} × ${money(s.firstSideEach)}`, s.doublePress > 0 ? `${s.doublePress} × ${money(s.secondSideEach)}` : '', s.personalized > 0 ? `${s.personalized} names × ${money(s.nameFeeEach)}` : ''].filter(Boolean).join(' + ')
  text(doc, `Customer supplies garments. All transfers are pre-cut from the cut files listed above; the red outline is the knife path. Labor: ${math} = ${money(s.labor)}.`, MARGIN, PAGE_H - 0.42, { size: 7, color: MUTED, bold: true })
  text(doc, `${input.customerName || 'Customer'} · ${input.stamp} · Press sheet · page ${page} of ${total}`, RIGHT, PAGE_H - 0.28, { size: 7, color: MUTED, align: 'right' })
}

export async function generatePressSheetPdf(input: PressSheetInput): Promise<Blob> {
  const doc = new jsPDF({ unit: 'in', format: 'letter', compress: true })
  const state: State = { doc, y: MARGIN }
  drawHeader(state, input)
  drawFiles(state, input)
  drawSizeTotals(state, input)
  rule(state)
  input.summary.lines.forEach((_line, index) => drawLine(state, input, index))
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    drawFooter(doc, input, page, pages)
  }
  return doc.output('blob')
}
