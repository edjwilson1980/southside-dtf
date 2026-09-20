/** Customer work-order PDF from an intake `job.json` record (+ thumbnails). */

import { jsPDF } from 'jspdf'
import { piecePrintSize } from '@/lib/compose-sheet'
import { parsePrintWidthInches, qualityFromDpi } from '@/lib/image-utils'
import type { IntakeJobDesign, IntakeJobRecord } from '@/lib/intake'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { cuttingFeeEach } from '@/lib/sheet-pricing'

const PAGE_W = 8.5
const PAGE_H = 11
const MARGIN = 0.6
const VALUE_X = MARGIN + 1.25
const CONTENT_RIGHT = PAGE_W - MARGIN
const VALUE_WIDTH = CONTENT_RIGHT - VALUE_X
const RULE_GREY: [number, number, number] = [180, 180, 180]
const LABEL_GREY: [number, number, number] = [102, 102, 102] // ~40%
const THUMB_IN = 1
const THUMB_PX = 200

export type WorkOrderThumb = {
  /** data URL (image/jpeg or image/png) ready for jsPDF.addImage */
  dataUrl: string
  format: 'JPEG' | 'PNG'
}

export type WorkOrderPdfInput = {
  record: IntakeJobRecord
  /** One entry per design, same order as `record.designs`. Null when unavailable. */
  thumbnails?: Array<WorkOrderThumb | null>
  /** Optional backdrop colour labels when not stored on the design. */
  backdropLabels?: Array<string | null | undefined>
}

export function workOrderFileName(jobId: string) {
  return `00-WORK-ORDER-${jobId}.pdf`
}

/** Split customer prose into shop-readable lines — never rewrite their words. */
export function splitCustomerLines(text: string, maxCharsPerLine = 72): string[] {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!raw) return []

  const byNewline = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  const sentences: string[] = []
  for (const line of byNewline) {
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z])/).map((part) => part.trim()).filter(Boolean)
    for (const part of parts) {
      const chunks = part.split(/\s+[-–—]\s+|;(?=\s)/).map((chunk) => chunk.trim()).filter(Boolean)
      sentences.push(...chunks)
    }
  }

  const wrapped: string[] = []
  for (const sentence of sentences) {
    if (sentence.length <= maxCharsPerLine) {
      wrapped.push(sentence)
      continue
    }
    const words = sentence.split(/\s+/)
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length > maxCharsPerLine && current) {
        wrapped.push(current)
        current = word
      } else {
        current = next
      }
    }
    if (current) wrapped.push(current)
  }
  return wrapped
}

export function buildNeedsAttentionLines(
  designs: IntakeJobDesign[],
  backdropLabels?: Array<string | null | undefined>,
): string[] {
  const lines: string[] = []
  designs.forEach((design, index) => {
    const n = index + 1
    if (design.sizeUnknown) {
      lines.push(`Design ${n} has NO SIZE. Customer asked us to pick.`)
    }
    if (design.upscale || (design.dpi > 0 && design.dpi < 150)) {
      const dpi = design.dpi > 0 ? design.dpi : '?'
      lines.push(
        design.upscale
          ? `Design ${n} is ${dpi} DPI. Customer asked us to upscale it.`
          : `Design ${n} is ${dpi} DPI (soft).`,
      )
    }
    if (design.removeBackground) {
      lines.push(`Design ${n} background to be knocked out.`)
    }
  })
  return lines
}

function formatReceived(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  const day = date.toLocaleDateString('en-US', { day: 'numeric' })
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const year = date.toLocaleDateString('en-US', { year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${weekday} ${day} ${month} ${year}, ${time}`
}

function formatInchPair(widthIn: number, heightIn: number) {
  const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(2))
  return `${fmt(widthIn)} x ${fmt(heightIn)} in`
}

function sizeDisplay(design: IntakeJobDesign): { text: string; alert: boolean } {
  if (design.sizeUnknown) return { text: '*** NOT SIZED - WE PICK ***', alert: true }
  if (design.placement === 'Custom' || (design.customWidth && design.customHeight)) {
    const w = design.customWidth || '?'
    const h = design.customHeight || '?'
    if (design.customWidth || design.customHeight) {
      return { text: `${w} x ${h} in`, alert: false }
    }
  }
  return { text: design.size || '—', alert: false }
}

function printsAtDisplay(design: IntakeJobDesign): string {
  if (design.sizeUnknown) return '-'
  const size = piecePrintSize({
    placement: design.placement,
    size: design.size,
    customWidth: design.customWidth,
    customHeight: design.customHeight,
    pixelWidth: design.pixelWidth,
    pixelHeight: design.pixelHeight,
    widthIn: parsePrintWidthInches(design.size, design.placement, design.customWidth),
  })
  if (!(size.widthIn > 0) || !(size.heightIn > 0)) return '-'
  return formatInchPair(size.widthIn, size.heightIn)
}

function resolutionDisplay(design: IntakeJobDesign): { text: string; alert: boolean } {
  const dpi = design.dpi > 0 ? design.dpi : 0
  if (design.upscale) {
    return { text: `${dpi || '?'} DPI - SOFT, upscale requested`, alert: true }
  }
  if (!dpi) return { text: 'Unknown', alert: false }
  const quality = qualityFromDpi(dpi)
  const label =
    quality.tone === 'good'
      ? 'print ready'
      : quality.tone === 'ok'
        ? 'acceptable'
        : 'soft — upscale recommended'
  return { text: `${dpi} DPI - ${label}`, alert: quality.tone === 'poor' }
}

function backgroundDisplay(
  design: IntakeJobDesign,
  backdropLabel?: string | null,
): { text: string; alert: boolean } {
  if (design.removeBackground) {
    const colour = design.backdropLabel || backdropLabel || 'solid'
    return { text: `*** REMOVE BACKGROUND (${colour}) ***`, alert: true }
  }
  return { text: 'Leave as supplied', alert: false }
}

function precutDisplay(record: IntakeJobRecord): { text: string; bold: boolean } {
  if (!record.precut) return { text: 'NO', bold: false }
  const transfers = record.estimate.transfers
  const each = cuttingFeeEach(transfers)
  const total = record.estimate.precutTotal
  return {
    text: `YES - ${transfers} x $${each.toFixed(2)} = $${total.toFixed(2)}`,
    bold: true,
  }
}

async function blobToThumb(blob: Blob): Promise<WorkOrderThumb | null> {
  try {
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return { dataUrl, format: 'JPEG' }
  } catch {
    return null
  }
}

/** Build thumbnail data URLs from the same blobs uploaded to Drive. */
export async function workOrderThumbsFromBlobs(blobs: Array<Blob | null | undefined>) {
  const out: Array<WorkOrderThumb | null> = []
  for (const blob of blobs) {
    out.push(blob ? await blobToThumb(blob) : null)
  }
  return out
}

type DocState = {
  doc: jsPDF
  y: number
  page: number
}

function drawHeader(doc: jsPDF, record: IntakeJobRecord) {
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('SOUTH SIDE DTF', MARGIN, MARGIN + 0.18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('CHICAGO - DIRECT TO FILM', MARGIN, MARGIN + 0.38)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('WORK ORDER', CONTENT_RIGHT, MARGIN + 0.18, { align: 'right' })
  doc.setFontSize(12)
  doc.text(record.jobId, CONTENT_RIGHT, MARGIN + 0.4, { align: 'right' })

  doc.setDrawColor(...RULE_GREY)
  doc.setLineWidth(0.02)
  doc.line(MARGIN, MARGIN + 0.55, CONTENT_RIGHT, MARGIN + 0.55)
}

function drawFooter(doc: jsPDF, record: IntakeJobRecord, page: number, totalPages: number) {
  const text = `${record.jobId} - ${record.customer.name || 'Customer'} - Page ${page} of ${totalPages}`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(text, PAGE_W / 2, PAGE_H - 0.35, { align: 'center' })
  doc.setTextColor(0, 0, 0)
}

function ensureSpace(state: DocState, record: IntakeJobRecord, needed: number) {
  const bottom = PAGE_H - MARGIN - 0.35
  if (state.y + needed <= bottom) return
  state.doc.addPage()
  state.page += 1
  drawHeader(state.doc, record)
  state.y = MARGIN + 0.75
}

function rule(state: DocState) {
  state.doc.setDrawColor(...RULE_GREY)
  state.doc.setLineWidth(0.01)
  state.doc.line(MARGIN, state.y, CONTENT_RIGHT, state.y)
  state.y += 0.18
}

function field(
  state: DocState,
  label: string,
  value: string,
  opts?: { bold?: boolean; size?: number; font?: 'helvetica' | 'courier' },
) {
  const size = opts?.size ?? 10
  state.doc.setFont('helvetica', 'bold')
  state.doc.setFontSize(8.5)
  state.doc.setTextColor(...LABEL_GREY)
  state.doc.text(label.toUpperCase(), MARGIN, state.y)

  state.doc.setTextColor(0, 0, 0)
  state.doc.setFont(opts?.font === 'courier' ? 'courier' : 'helvetica', opts?.bold ? 'bold' : 'normal')
  state.doc.setFontSize(size)
  const lines = state.doc.splitTextToSize(value || '—', VALUE_WIDTH) as string[]
  state.doc.text(lines, VALUE_X, state.y)
  state.y += Math.max(0.22, lines.length * (size / 72) * 1.25 + 0.06)
}

function sectionTitle(state: DocState, title: string) {
  state.doc.setFont('helvetica', 'bold')
  state.doc.setFontSize(9)
  state.doc.setTextColor(0, 0, 0)
  state.doc.text(title.toUpperCase(), MARGIN, state.y)
  state.y += 0.22
}

/**
 * Generate the work-order PDF blob. Throws on failure — callers must catch and
 * continue the submission with `work-order-missing` flagged.
 */
export async function generateWorkOrderPdf(input: WorkOrderPdfInput): Promise<Blob> {
  const { record } = input
  const thumbs = input.thumbnails ?? []
  const backdropLabels = input.backdropLabels ?? []
  const doc = new jsPDF({ unit: 'in', format: 'letter', compress: true })
  const state: DocState = { doc, y: MARGIN + 0.75, page: 1 }

  drawHeader(doc, record)

  field(state, 'Received', formatReceived(record.submittedAt))
  field(state, 'Customer', record.customer.name || '—', { bold: true })
  field(state, 'Email', record.customer.email || '—')
  field(state, 'Phone', record.customer.phone || '—')
  state.y += 0.06
  rule(state)

  sectionTitle(state, 'The sheet')
  field(state, 'Sheet size', `${SHEET_WIDTH_IN} x ${record.estimate.billedLengthIn} in`)
  field(state, 'Designs', String(record.estimate.designs))
  field(state, 'Transfers', String(record.estimate.transfers), { bold: true, size: 16 })
  const precut = precutDisplay(record)
  field(state, 'Pre-cut', precut.text, { bold: precut.bold })
  const buildFee = Number(record.estimate.buildFee ?? 0)
  if (buildFee > 0) {
    field(
      state,
      'Build fee',
      `$${buildFee.toFixed(2)}${record.estimate.billedLengthIn >= 101 ? ' (over 100 in)' : ''}`,
    )
  }
  field(state, 'Total', `$${record.estimate.total.toFixed(2)} - PAID`, { bold: true })
  state.y += 0.06
  rule(state)

  const attention = buildNeedsAttentionLines(record.designs, backdropLabels)
  if (attention.length > 0) {
    sectionTitle(state, 'Needs attention')
    for (const line of attention) {
      ensureSpace(state, record, 0.28)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text('!', MARGIN, state.y)
      const wrapped = doc.splitTextToSize(line, VALUE_WIDTH + (VALUE_X - MARGIN - 0.2)) as string[]
      doc.setFont('helvetica', 'normal')
      doc.text(wrapped, MARGIN + 0.2, state.y)
      state.y += Math.max(0.24, wrapped.length * 0.18)
    }
    state.y += 0.06
    rule(state)
  }

  const orderLines = splitCustomerLines(record.orderNote)
  if (orderLines.length > 0) {
    sectionTitle(state, "Order instructions - customer's own words")
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const line of orderLines) {
      ensureSpace(state, record, 0.24)
      const wrapped = doc.splitTextToSize(line, VALUE_WIDTH) as string[]
      doc.text(wrapped, VALUE_X, state.y)
      state.y += Math.max(0.22, wrapped.length * 0.18)
    }
    state.y += 0.08
  }

  const designCount = record.designs.length
  record.designs.forEach((design, index) => {
    const blockHeight = estimateDesignBlockHeight(doc, design, orderNoteLinesFor(design))
    ensureSpace(state, record, blockHeight)
    rule(state)
    drawDesignBlock(state, record, design, index, designCount, thumbs[index] ?? null, backdropLabels[index])
  })

  ensureSpace(state, record, 0.4)
  state.y += 0.1
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  const closer =
    'Artwork files are in the same Google Drive folder as this sheet, numbered to match.'
  const closerLines = doc.splitTextToSize(closer, CONTENT_RIGHT - MARGIN) as string[]
  doc.text(closerLines, MARGIN, state.y)

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    drawFooter(doc, record, page, totalPages)
  }

  return doc.output('blob')
}

function orderNoteLinesFor(design: IntakeJobDesign) {
  return splitCustomerLines(design.notes)
}

function estimateDesignBlockHeight(doc: jsPDF, design: IntakeJobDesign, noteLines: string[]) {
  let notesH = 0.22
  for (const line of noteLines) {
    const wrapped = doc.splitTextToSize(line, VALUE_WIDTH - THUMB_IN - 0.15) as string[]
    notesH += wrapped.length * 0.18
  }
  if (noteLines.length === 0) notesH = 0.22
  // thumb + fields
  return Math.max(THUMB_IN + 0.35, 1.55 + notesH)
}

function drawDesignBlock(
  state: DocState,
  _record: IntakeJobRecord,
  design: IntakeJobDesign,
  index: number,
  total: number,
  thumb: WorkOrderThumb | null,
  backdropLabel?: string | null,
) {
  const { doc } = state
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text(`DESIGN ${index + 1} OF ${total}`, MARGIN, state.y)
  state.y += 0.2

  const blockTop = state.y
  const thumbX = MARGIN
  const thumbY = blockTop
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(0.01)
  doc.rect(thumbX, thumbY, THUMB_IN, THUMB_IN)
  if (thumb?.dataUrl) {
    try {
      // Fit image inside the 1 in box, aspect preserved, centered.
      const props = doc.getImageProperties(thumb.dataUrl)
      const aspect = props.width / Math.max(1, props.height)
      let drawW = THUMB_IN - 0.06
      let drawH = drawW / aspect
      if (drawH > THUMB_IN - 0.06) {
        drawH = THUMB_IN - 0.06
        drawW = drawH * aspect
      }
      const dx = thumbX + (THUMB_IN - drawW) / 2
      const dy = thumbY + (THUMB_IN - drawH) / 2
      doc.addImage(thumb.dataUrl, thumb.format, dx, dy, drawW, drawH)
    } catch {
      // empty box is fine
    }
  }

  const saveY = state.y
  // Fields sit to the right of the thumbnail.
  const fieldLeft = MARGIN + THUMB_IN + 0.15
  const fieldValueX = Math.max(VALUE_X, fieldLeft + 1.05)
  const fieldWidth = CONTENT_RIGHT - fieldValueX

  const write = (
    label: string,
    value: string,
    opts?: { bold?: boolean; size?: number; font?: 'helvetica' | 'courier' },
  ) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...LABEL_GREY)
    doc.text(label.toUpperCase(), fieldLeft, state.y)
    doc.setTextColor(0, 0, 0)
    doc.setFont(opts?.font === 'courier' ? 'courier' : 'helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(opts?.size ?? 10)
    const lines = doc.splitTextToSize(value || '—', fieldWidth) as string[]
    doc.text(lines, fieldValueX, state.y)
    state.y += Math.max(0.2, lines.length * ((opts?.size ?? 10) / 72) * 1.25 + 0.04)
  }

  const size = sizeDisplay(design)
  const resolution = resolutionDisplay(design)
  const background = backgroundDisplay(design, backdropLabel)

  write('File', design.file, { font: 'courier', bold: true })
  write('Quantity', String(design.quantity), { bold: true, size: 16 })
  write('Placement', design.placement || '—')
  write('Size', size.text, { bold: size.alert })
  write('Prints at', printsAtDisplay(design), { bold: design.sizeUnknown })
  write('Resolution', resolution.text, { bold: resolution.alert || design.upscale })
  write('Background', background.text, { bold: background.alert })

  const notes = orderNoteLinesFor(design)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...LABEL_GREY)
  doc.text('INSTRUCTIONS', fieldLeft, state.y)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (notes.length === 0) {
    doc.text('—', fieldValueX, state.y)
    state.y += 0.22
  } else {
    for (const line of notes) {
      const wrapped = doc.splitTextToSize(line, fieldWidth) as string[]
      doc.text(wrapped, fieldValueX, state.y)
      state.y += Math.max(0.2, wrapped.length * 0.18)
    }
  }

  // Block must clear the thumbnail.
  state.y = Math.max(state.y, saveY + THUMB_IN + 0.12)
}