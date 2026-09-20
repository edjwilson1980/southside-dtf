/**
 * Shared upload allowlists so every surface (builder, shop, upload, halftone)
 * accepts the same customer art formats: JPEG, PNG, PDF, SVG (plus TIFF where
 * finished sheets already used it).
 */

export type UploadKind = 'png' | 'jpeg' | 'tiff' | 'pdf' | 'svg' | 'heic' | 'unknown'

/** File picker `accept` for design builders and the halftone tool. */
export const DESIGN_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/svg+xml,application/pdf,image/heic,image/heif,.png,.jpg,.jpeg,.svg,.pdf,.heic,.heif'

/** File picker `accept` for finished gang-sheet upload (keeps TIFF). */
export const SHEET_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/tiff,image/tif,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.tif,.tiff,.svg,.pdf'

export const DESIGN_ACCEPT_LABEL = 'PNG · JPG · PDF · SVG · HEIC'
export const SHEET_ACCEPT_LABEL = 'PNG · JPG · PDF · SVG · TIFF'

export function extensionOf(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match?.[1]?.toLowerCase() ?? ''
}

export function sniffUploadKind(file: File, bytes?: Uint8Array): UploadKind {
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  if (bytes && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png'
  }
  if (bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }
  if (bytes && bytes.length >= 4) {
    const head = String.fromCharCode(bytes[0]!, bytes[1]!)
    if (head === 'II' || head === 'MM') return 'tiff'
  }
  if (bytes && bytes.length >= 5) {
    const head = String.fromCharCode(...bytes.subarray(0, 5))
    if (head === '%PDF-') return 'pdf'
  }
  if (bytes && bytes.length >= 4) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 2048)))
    if (/<svg\b/i.test(text)) return 'svg'
  }

  if (type.includes('png') || name.endsWith('.png')) return 'png'
  if (type.includes('jpeg') || type.includes('jpg') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg'
  if (type.includes('tif') || name.endsWith('.tif') || name.endsWith('.tiff')) return 'tiff'
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (type.includes('svg') || name.endsWith('.svg')) return 'svg'
  if (type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) return 'heic'
  return 'unknown'
}

/** True when the browser/file picker handed us an allowed design file. */
export function isAcceptedDesignFile(file: File) {
  const kind = sniffUploadKind(file)
  return kind === 'png' || kind === 'jpeg' || kind === 'pdf' || kind === 'svg' || kind === 'tiff' || kind === 'heic'
}

export function isHeicFile(file: File) {
  return sniffUploadKind(file) === 'heic'
}

/** Finished-sheet upload allowlist (same formats + TIFF). */
export function isAcceptedSheetFile(file: File) {
  return isAcceptedDesignFile(file)
}

export function mimeForKind(kind: UploadKind) {
  switch (kind) {
    case 'png':
      return 'image/png'
    case 'jpeg':
      return 'image/jpeg'
    case 'tiff':
      return 'image/tiff'
    case 'pdf':
      return 'application/pdf'
    case 'svg':
      return 'image/svg+xml'
    case 'heic':
      return 'image/heic'
    default:
      return 'application/octet-stream'
  }
}
