import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import {
  UPLOAD_LOW_DPI,
  UPLOAD_MAX_LENGTH_IN,
  UPLOAD_MAX_WIDTH_IN,
  UPLOAD_WIDTH_TOLERANCE_IN,
  lengthRejectMessage,
  widthRejectMessage,
} from '@/lib/upload-pricing'

export type ServerMeasuredUpload = {
  width_in: number
  length_in: number
  dpi: number
  dpi_assumed: boolean
  filename: string
  kind: 'png' | 'pdf' | 'ai'
  warnings: string[]
  error?: string
}

const DEFAULT_DPI = 300

function sniffKind(name: string, mime: string): 'png' | 'pdf' | 'ai' | null {
  const lower = name.toLowerCase()
  const type = mime.toLowerCase()
  if (type.includes('png') || lower.endsWith('.png')) return 'png'
  if (lower.endsWith('.ai')) return 'ai'
  if (type.includes('pdf') || lower.endsWith('.pdf')) return 'pdf'
  return null
}

async function measurePng(buffer: Buffer): Promise<Omit<ServerMeasuredUpload, 'filename' | 'kind' | 'warnings' | 'error'>> {
  const meta = await sharp(buffer).metadata()
  const pixelWidth = meta.width || 0
  const pixelHeight = meta.height || 0
  if (!(pixelWidth > 0) || !(pixelHeight > 0)) {
    throw new Error('Could not read PNG dimensions.')
  }

  let dpi = DEFAULT_DPI
  let dpiAssumed = true
  if (meta.density && meta.density > 1) {
    dpi = meta.density
    dpiAssumed = false
  }

  // Prefer pHYs via sharp when present; density is often from pHYs.
  return {
    width_in: pixelWidth / dpi,
    length_in: pixelHeight / dpi,
    dpi,
    dpi_assumed: dpiAssumed,
  }
}

async function measurePdf(buffer: Buffer): Promise<Omit<ServerMeasuredUpload, 'filename' | 'kind' | 'warnings' | 'error'>> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const page = doc.getPages()[0]
  if (!page) throw new Error('This PDF has no pages.')
  const { width, height } = page.getSize() // points
  const widthIn = width / 72
  const heightIn = height / 72
  // Roll length is the longer edge for landscape sheets; upload sheets are width × length with width ~22.
  const short = Math.min(widthIn, heightIn)
  const long = Math.max(widthIn, heightIn)
  // If one side is near 22, treat that as width.
  const near22 = Math.abs(short - 22) <= 1.5 || Math.abs(long - 22) <= 1.5
  const sheetWidth = near22 ? (Math.abs(widthIn - 22) <= Math.abs(heightIn - 22) ? widthIn : heightIn) : widthIn
  const sheetLength = near22 ? (sheetWidth === widthIn ? heightIn : widthIn) : heightIn
  return {
    width_in: sheetWidth,
    length_in: sheetLength,
    dpi: DEFAULT_DPI,
    dpi_assumed: true,
  }
}

export async function measureUploadBuffer(
  buffer: Buffer,
  filename: string,
  mimeType = '',
): Promise<ServerMeasuredUpload> {
  const kind = sniffKind(filename, mimeType)
  if (!kind) {
    return {
      width_in: 0,
      length_in: 0,
      dpi: 0,
      dpi_assumed: true,
      filename,
      kind: 'png',
      warnings: [],
      error: 'Please upload PNG, PDF, or AI.',
    }
  }

  const warnings: string[] = []
  try {
    const measured = kind === 'png' ? await measurePng(buffer) : await measurePdf(buffer)
    if (measured.dpi_assumed && kind === 'png') {
      warnings.push('No DPI tag in this PNG — we assumed 300 DPI.')
    }
    if (measured.dpi > 0 && measured.dpi < UPLOAD_LOW_DPI) {
      warnings.push('May print blurry')
    }

    const maxWidth = UPLOAD_MAX_WIDTH_IN + UPLOAD_WIDTH_TOLERANCE_IN
    if (measured.width_in > maxWidth + 1e-9) {
      return {
        ...measured,
        filename,
        kind,
        warnings,
        error: widthRejectMessage(measured.width_in),
      }
    }
    if (measured.length_in > UPLOAD_MAX_LENGTH_IN + 1e-9) {
      return {
        ...measured,
        filename,
        kind,
        warnings,
        error: lengthRejectMessage(),
      }
    }

    return { ...measured, filename, kind, warnings }
  } catch (err) {
    return {
      width_in: 0,
      length_in: 0,
      dpi: 0,
      dpi_assumed: true,
      filename,
      kind,
      warnings,
      error: err instanceof Error ? err.message : 'Could not measure that file.',
    }
  }
}
