import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { mapRgbaThroughCmyk } from '@/lib/cmyk-map'

export type SheetPiece = {
  previewUrl: string
  widthIn: number
  heightIn: number
}

export type PlacedSheetPiece = SheetPiece & {
  xIn: number
  yIn: number
}

export const SHEET_GUTTER_IN = 0.125
export const SHEET_WIDTH_IN = 22
export const LABEL_PT = 72
export const PRINT_MARGIN_IN = 1.5
export const LABEL_MARGIN_IN = 0.75
const LABEL_HEIGHT_IN = LABEL_PT / 72
const LABEL_PAD_IN = 0.125
export const ART_INSET_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + PRINT_MARGIN_IN

export function pieceHeightInches(piece: {
  placement: string;
  size: string;
  customHeight: string;
  pixelWidth: number;
  pixelHeight: number;
  widthIn: number;
}) {
  if (piece.placement === 'Custom') {
    const height = Number(piece.customHeight)
    if (Number.isFinite(height) && height > 0) return Math.min(199, height)
  }
  const measurement = piece.size.split(' · ').pop() ?? piece.size
  const nums = [...measurement.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((match) => Number(match[0]))
  if (nums.length >= 2) return nums[1]
  if (piece.pixelWidth > 0 && piece.pixelHeight > 0) {
    return piece.widthIn * (piece.pixelHeight / piece.pixelWidth)
  }
  return piece.widthIn
}

export function layoutSheetRows(
  rows: SheetPiece[][],
  opts?: { sectionLengthIn?: number; boxMarginIn?: number; sideInsetIn?: number },
) {
  const sectionLengthIn = opts?.sectionLengthIn
  const boxMarginIn = opts?.boxMarginIn ?? 0
  const sideInsetIn = opts?.sideInsetIn ?? 0
  let yIn = ART_INSET_IN
  const pieces: PlacedSheetPiece[] = []

  for (const row of rows) {
    const rowHeight = Math.max(...row.map((piece) => piece.heightIn), 0)
    const rowWidth = row.reduce((sum, piece, index) => sum + piece.widthIn + (index > 0 ? SHEET_GUTTER_IN : 0), 0)
    const rowInset = rowWidth > SHEET_WIDTH_IN - sideInsetIn * 2 ? 0 : sideInsetIn
    if (sectionLengthIn && sectionLengthIn > 0) {
      const section = Math.floor(Math.max(0, yIn - boxMarginIn) / sectionLengthIn)
      const sectionEnd = (section + 1) * sectionLengthIn
      if (yIn + rowHeight + boxMarginIn > sectionEnd) {
        yIn = sectionEnd + boxMarginIn
      }
    }
    let xIn = rowInset
    for (const piece of row) {
      pieces.push({ ...piece, xIn, yIn })
      xIn += piece.widthIn + SHEET_GUTTER_IN
    }
    yIn += rowHeight + SHEET_GUTTER_IN
  }

  return { pieces, contentEndY: yIn }
}

function markPixelBox(mark: { xIn: number; yIn: number; widthIn: number; heightIn: number }, pxPerIn: number) {
  const x = Math.round(mark.xIn * pxPerIn)
  const y = Math.round(mark.yIn * pxPerIn)
  const width = Math.max(2, Math.round(mark.widthIn * pxPerIn))
  const height = Math.max(2, Math.round(mark.heightIn * pxPerIn))
  return { x, y, width, height }
}

function fillHardDisk(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const diameter = Math.max(2, Math.min(width, height))
  const cx = x + width / 2
  const cy = y + height / 2
  const radius = diameter / 2
  const left = Math.max(0, Math.floor(cx - radius))
  const top = Math.max(0, Math.floor(cy - radius))
  const right = Math.min(context.canvas.width, Math.ceil(cx + radius))
  const bottom = Math.min(context.canvas.height, Math.ceil(cy + radius))
  const w = Math.max(1, right - left)
  const h = Math.max(1, bottom - top)
  const image = context.getImageData(left, top, w, h)
  const { data } = image
  const style = context.fillStyle
  const color = typeof style === 'string' && style.startsWith('#') ? style : '#000000'
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const r2 = radius * radius
  for (let row = 0; row < h; row++) {
    const dy = top + row + 0.5 - cy
    for (let col = 0; col < w; col++) {
      const dx = left + col + 0.5 - cx
      if (dx * dx + dy * dy <= r2) {
        const index = (row * w + col) * 4
        data[index] = red
        data[index + 1] = green
        data[index + 2] = blue
        data[index + 3] = 255
      }
    }
  }
  context.putImageData(image, left, top)
}

function fillRegistrationMark(
  context: CanvasRenderingContext2D,
  mark: { xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string; shape?: 'rect' | 'circle' },
  pxPerIn: number,
) {
  const { x, y, width, height } = markPixelBox(mark, pxPerIn)
  context.fillStyle = mark.color || '#000000'
  if (mark.shape === 'circle') {
    fillHardDisk(context, x, y, width, height)
    return
  }
  context.fillRect(x, y, width, height)
}

export async function composeGangSheet(opts: {
  pieces: PlacedSheetPiece[]
  sheetLengthIn: number
  pxPerIn: number
  label?: string
  mapCmyk?: boolean
  marks?: Array<{ xIn: number; yIn: number; widthIn: number; heightIn: number; color?: string; shape?: 'rect' | 'circle' }>
}) {
  const width = Math.max(1, Math.round(SHEET_WIDTH_IN * opts.pxPerIn))
  const height = Math.max(1, Math.round(opts.sheetLengthIn * opts.pxPerIn))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: Boolean(opts.mapCmyk) || Boolean(opts.marks?.length) })
  if (!context) throw new Error('Could not build the gang sheet preview.')

  context.clearRect(0, 0, width, height)

  for (const piece of opts.pieces) {
    if (!piece.previewUrl) continue
    const image = await loadImage(piece.previewUrl)
    context.drawImage(
      image,
      piece.xIn * opts.pxPerIn,
      piece.yIn * opts.pxPerIn,
      piece.widthIn * opts.pxPerIn,
      piece.heightIn * opts.pxPerIn,
    )
  }

  if (opts.label) {
    const fontPx = Math.max(1, (LABEL_PT * opts.pxPerIn) / 72)
    context.font = `700 ${fontPx}px Arial, Helvetica, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#111111'
    const x = width / 2
    const labelY = (LABEL_MARGIN_IN + LABEL_HEIGHT_IN / 2) * opts.pxPerIn
    context.fillText(opts.label, x, labelY)
    context.fillText(opts.label, x, height - labelY)
  }

  if (opts.mapCmyk) {
    const pixels = context.getImageData(0, 0, width, height)
    mapRgbaThroughCmyk(pixels.data)
    context.putImageData(pixels, 0, 0)
  }

  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  for (const mark of opts.marks ?? []) {
    fillRegistrationMark(context, mark, opts.pxPerIn)
  }

  return canvasToPngBlob(canvas, width / SHEET_WIDTH_IN)
}
