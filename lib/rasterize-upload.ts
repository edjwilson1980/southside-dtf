import { DESIGN_ACCEPT_LABEL, sniffUploadKind, type UploadKind } from '@/lib/accepted-uploads'
import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { measureUploadFile, type MeasuredFile } from '@/lib/measure-file'

const MAX_RASTER_EDGE = 8000

export type PreparedUpload = {
  /** Original file the customer picked. */
  sourceFile: File
  /** File used for editing/preview — PNG when PDF/SVG were rasterized. */
  editFile: File
  /** Object URL for editFile (caller must revoke). */
  editUrl: string
  kind: UploadKind
  measured: MeasuredFile
  rasterized: boolean
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'artwork'
}

function fitEdges(width: number, height: number) {
  const longest = Math.max(width, height)
  if (longest <= MAX_RASTER_EDGE) return { width, height }
  const scale = MAX_RASTER_EDGE / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function canvasFromImageUrl(url: string, width: number, height: number) {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not open a canvas to convert that file.')
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

async function rasterizeSvg(file: File, measured: MeasuredFile) {
  const url = URL.createObjectURL(file)
  try {
    const size = fitEdges(measured.pixelWidth, measured.pixelHeight)
    const canvas = await canvasFromImageUrl(url, size.width, size.height)
    const blob = await canvasToPngBlob(canvas, Math.round(measured.dpiX) || 300)
    return new File([blob], `${baseName(file.name)}.png`, { type: 'image/png' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function rasterizePdf(file: File, measured: MeasuredFile) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const target = fitEdges(measured.pixelWidth, measured.pixelHeight)
    const scale = Math.min(
      target.width / Math.max(1, base.width),
      target.height / Math.max(1, base.height),
    )
    const viewport = page.getViewport({ scale: Math.max(0.1, scale) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not open a canvas to convert that PDF.')
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await canvasToPngBlob(canvas, Math.round(measured.dpiX) || 300)
    return new File([blob], `${baseName(file.name)}.png`, { type: 'image/png' })
  } finally {
    await doc.destroy()
  }
}

/**
 * Prepare a customer upload for preview/edit tools.
 * PNG/JPEG/TIFF pass through; PDF and SVG become PNG so crop, knockout,
 * upscale, compose, and half-tone can all use the same canvas path.
 */
export async function prepareEditableUpload(file: File): Promise<PreparedUpload> {
  const measured = await measureUploadFile(file)
  const kind = (measured.kind === 'unknown' ? sniffUploadKind(file) : measured.kind) as UploadKind

  if (kind === 'unknown') {
    throw new Error(`Upload a ${DESIGN_ACCEPT_LABEL.replace(/ · /g, ', ')} file.`)
  }

  if (kind === 'pdf' || kind === 'svg') {
    const editFile = kind === 'pdf' ? await rasterizePdf(file, measured) : await rasterizeSvg(file, measured)
    const editMeasured = await measureUploadFile(editFile)
    return {
      sourceFile: file,
      editFile,
      editUrl: URL.createObjectURL(editFile),
      kind,
      measured: {
        ...editMeasured,
        // Keep the physical size inferred from the vector/PDF source.
        widthIn: measured.widthIn,
        heightIn: measured.heightIn,
        dpiX: editMeasured.pixelWidth / Math.max(0.01, measured.widthIn),
        dpiY: editMeasured.pixelHeight / Math.max(0.01, measured.heightIn),
        dpiAssumed: measured.dpiAssumed,
        fileName: file.name,
      },
      rasterized: true,
    }
  }

  return {
    sourceFile: file,
    editFile: file,
    editUrl: URL.createObjectURL(file),
    kind,
    measured,
    rasterized: false,
  }
}
