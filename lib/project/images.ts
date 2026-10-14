import { uploadFilesToExistingDriveFolder, type DriveFileUpload } from '@/lib/upload-to-drive'
import type { ProjectImageRef } from './types'

/** Browser: turn a blob:/http(s): preview URL into a data URL for local Save Job downloads. */
export async function urlToDataUrl(url: string): Promise<string> {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not read artwork for the project file.')
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read artwork for the project file.'))
    reader.readAsDataURL(blob)
  })
}

export type DesignArtInput = {
  id?: string | number
  name: string
  previewUrl?: string | null
  originalUrl?: string | null
  size?: string
  customWidth?: string
  customHeight?: string
  quantity?: number
  keepUpright?: boolean
  pixelWidth?: number
  pixelHeight?: number
  placement?: string
  cut?: ProjectImageRef['cut']
  sizeIn?: ProjectImageRef['sizeIn']
}

function safeArtFileName(name: string, index: number) {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40) || `design-${index + 1}`
  return `art-${index + 1}-${base}.png`
}

/**
 * Build image rows with embedded data URLs — for local Save Job / download only.
 * Do NOT send this payload to `/api/drive/job-record` (hits Vercel body limits).
 */
export async function buildImagesWithEmbeddedArt(
  designs: DesignArtInput[],
  options?: { sheetDriveFileId?: string },
): Promise<ProjectImageRef[]> {
  const images: ProjectImageRef[] = []
  for (const design of designs) {
    const sourceUrl = design.previewUrl || design.originalUrl || ''
    let dataUrl = ''
    if (sourceUrl) {
      try {
        dataUrl = await urlToDataUrl(sourceUrl)
      } catch {
        dataUrl = ''
      }
    }
    images.push({
      id: design.id,
      name: design.name,
      fileName: design.name,
      size: design.size,
      customWidth: design.customWidth,
      customHeight: design.customHeight,
      quantity: Math.max(1, design.quantity || 1),
      keepUpright: Boolean(design.keepUpright),
      pixelWidth: design.pixelWidth,
      pixelHeight: design.pixelHeight,
      placement: design.placement,
      cut: design.cut,
      sizeIn: design.sizeIn,
      ...(dataUrl ? { dataUrl } : {}),
      ...(options?.sheetDriveFileId ? { driveFileId: options.sheetDriveFileId } : {}),
    })
  }
  return images
}

/**
 * Build image rows for Drive project JSON: upload each design's art into the job
 * folder (resumable, outside Vercel), then store only Drive file ids — no dataUrls.
 */
export async function buildImagesForDriveProject(
  designs: DesignArtInput[],
  options: {
    folderId: string
    customerName?: string
    sheetDriveFileId?: string
  },
): Promise<ProjectImageRef[]> {
  const uploads: DriveFileUpload[] = []
  const indexByUpload: number[] = []

  for (let index = 0; index < designs.length; index += 1) {
    const design = designs[index]
    const sourceUrl = design.previewUrl || design.originalUrl || ''
    if (!sourceUrl) continue
    try {
      const res = await fetch(sourceUrl)
      if (!res.ok) continue
      const blob = await res.blob()
      if (blob.size <= 0) continue
      uploads.push({
        name: safeArtFileName(design.name, index),
        mimeType: blob.type || 'image/png',
        blob,
      })
      indexByUpload.push(index)
    } catch {
      // Skip unreadable art; JSON still writes metadata.
    }
  }

  const uploaded =
    uploads.length > 0
      ? await uploadFilesToExistingDriveFolder({
          folderId: options.folderId,
          files: uploads,
          customerName: options.customerName,
        })
      : []

  return designs.map((design, index) => {
    const uploadPos = indexByUpload.indexOf(index)
    const artFile = uploadPos >= 0 ? uploaded[uploadPos] : undefined
    const driveFileId = artFile?.id || options.sheetDriveFileId
    return {
      id: design.id,
      name: design.name,
      fileName: artFile?.name || design.name,
      size: design.size,
      customWidth: design.customWidth,
      customHeight: design.customHeight,
      quantity: Math.max(1, design.quantity || 1),
      keepUpright: Boolean(design.keepUpright),
      pixelWidth: design.pixelWidth,
      pixelHeight: design.pixelHeight,
      placement: design.placement,
      cut: design.cut,
      sizeIn: design.sizeIn,
      ...(driveFileId
        ? {
            driveFileId,
            original: {
              driveFileId,
              pxW: design.pixelWidth,
              pxH: design.pixelHeight,
            },
            processed: {
              driveFileId,
              pxW: design.pixelWidth,
              pxH: design.pixelHeight,
            },
          }
        : {}),
    }
  })
}

/** Strip bulky dataUrls so the job-record POST stays under Vercel body limits. */
export function stripImageDataUrls(images: ProjectImageRef[] | undefined): ProjectImageRef[] {
  return (images || []).map(({ dataUrl: _dataUrl, ...rest }) => rest)
}

/**
 * Resolve preview URLs for reopen: prefer embedded dataUrl, else fetch Drive media.
 */
export async function resolveProjectImageUrls(
  images: ProjectImageRef[] | undefined,
): Promise<string[]> {
  if (!images?.length) return []
  const urls: string[] = []
  for (const image of images) {
    if (image.dataUrl) {
      urls.push(image.dataUrl)
      continue
    }
    const fileId =
      image.driveFileId ||
      image.processed?.driveFileId ||
      image.original?.driveFileId ||
      ''
    if (!fileId) {
      urls.push('')
      continue
    }
    try {
      const res = await fetch(`/api/drive/media?fileId=${encodeURIComponent(fileId)}`)
      if (!res.ok) {
        urls.push('')
        continue
      }
      const blob = await res.blob()
      urls.push(URL.createObjectURL(blob))
    } catch {
      urls.push('')
    }
  }
  return urls
}
