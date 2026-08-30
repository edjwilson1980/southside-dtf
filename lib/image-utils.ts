import { pngBlobWithDpi } from '@/lib/png-dpi'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'

export async function loadImageData(src: string) {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not read the image.')
  context.drawImage(image, 0, 0)
  return {
    pixels: context.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
  }
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the image.'))
    image.src = src
  })
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement, dpi?: number) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => {
      if (next) resolve(next)
      else reject(new Error('Could not export the image.'))
    }, 'image/png')
  })
  if (!dpi) return blob
  return pngBlobWithDpi(blob, dpi)
}

export async function blobFromUrl(url: string) {
  const response = await fetch(url)
  return response.blob()
}

export function readImageSize(src: string) {
  return loadImage(src)
    .then((image) => ({ width: image.naturalWidth, height: image.naturalHeight }))
    .catch(() => ({ width: 0, height: 0 }))
}

export function parsePrintWidthInches(size: string, placement: string, customWidth: string) {
  if (placement === 'Custom') return Math.min(SHEET_WIDTH_IN, Number(customWidth) || 0)
  const measurement = size.split(' · ').pop() ?? size
  return Math.min(SHEET_WIDTH_IN, Number.parseFloat(measurement.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] ?? '10.5'))
}

export function printDpi(pixelWidth: number, printWidthInches: number) {
  if (!pixelWidth || !printWidthInches) return 0
  return Math.round(pixelWidth / printWidthInches)
}

export function qualityFromDpi(dpi: number) {
  if (dpi >= 300) return { label: 'Print ready', tone: 'good' as const }
  if (dpi >= 200) return { label: 'Acceptable', tone: 'ok' as const }
  if (dpi > 0) return { label: 'Soft — upscale recommended', tone: 'poor' as const }
  return { label: 'Unknown', tone: 'ok' as const }
}
