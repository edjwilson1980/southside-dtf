import type { ProjectImageRef } from './types'

/** Browser: turn a blob:/http(s): preview URL into a data URL for the project JSON. */
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

/**
 * Build image rows for project JSON with embedded art (data URLs).
 * This is what makes Reopen show the actual designs instead of empty/black thumbs.
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
 * Resolve preview URLs for reopen: prefer embedded dataUrl, else fetch Drive media.
 * Returns a map of image index → object URL or data URL.
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
