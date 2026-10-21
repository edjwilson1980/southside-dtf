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

/** `art-N-<design>.png` — the name a design's art gets in the Drive job folder. */
export function designArtFileName(name: string, index: number) {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40) || `design-${index + 1}`
  return `art-${index + 1}-${base}.png`
}

async function blobFromDesignUrl(url: string): Promise<Blob | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}

/**
 * Build image rows with embedded data URLs — for local Save Job / download only.
 * Do NOT send this payload to `/api/drive/job-record` (hits Vercel body limits).
 */
export async function buildImagesWithEmbeddedArt(
  designs: DesignArtInput[],
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
    })
  }
  return images
}

export type DesignArtUploadPlan = {
  /** Files to send to Drive — one per design that had readable art. */
  uploads: DriveFileUpload[]
  /** `indexByUpload[i]` is the design index for `uploads[i]`. */
  indexByUpload: number[]
}

/**
 * Read each design's art into a Blob and name it `art-N-<design>.png` so it can
 * ride along in the same Drive upload batch as the print files. Designs whose art
 * cannot be read are skipped (they reopen as RE-UPLOAD rows).
 */
export async function prepareDesignArtUploads(
  designs: DesignArtInput[],
): Promise<DesignArtUploadPlan> {
  const uploads: DriveFileUpload[] = []
  const indexByUpload: number[] = []

  for (let index = 0; index < designs.length; index += 1) {
    const design = designs[index]
    // Prefer the edited preview; fall back to the original upload.
    const blob =
      (await blobFromDesignUrl(design.previewUrl || '')) ||
      (await blobFromDesignUrl(design.originalUrl || ''))
    if (!blob) continue
    uploads.push({
      name: designArtFileName(design.name, index),
      mimeType: blob.type || 'image/png',
      blob,
    })
    indexByUpload.push(index)
  }

  return { uploads, indexByUpload }
}

/**
 * Map uploaded art files back onto design rows (by upload name) and build the
 * project image refs. Rows without an uploaded file carry metadata only.
 */
export function imagesFromUploadedArt(
  designs: DesignArtInput[],
  plan: DesignArtUploadPlan,
  uploaded: Array<{ name: string; id: string }>,
): ProjectImageRef[] {
  const idByName = new Map(uploaded.map((file) => [file.name, file.id]))
  return designs.map((design, index) => {
    const uploadPos = plan.indexByUpload.indexOf(index)
    const uploadName = uploadPos >= 0 ? plan.uploads[uploadPos]?.name : undefined
    const driveFileId = uploadName ? idByName.get(uploadName) : undefined
    const artFile = driveFileId ? { name: uploadName, id: driveFileId } : undefined
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

/**
 * Build image rows for Drive project JSON: upload each design's art into the job
 * folder (resumable, outside Vercel), then store only Drive file ids — no dataUrls.
 *
 * Never stores the composed sheet PNG as a design's art id — that broke reopen
 * previews when individual art uploads failed.
 */
export async function buildImagesForDriveProject(
  designs: DesignArtInput[],
  options: {
    folderId: string
    customerName?: string
  },
): Promise<ProjectImageRef[]> {
  const plan = await prepareDesignArtUploads(designs)
  const uploaded =
    plan.uploads.length > 0
      ? await uploadFilesToExistingDriveFolder({
          folderId: options.folderId,
          files: plan.uploads,
          customerName: options.customerName,
        })
      : []
  return imagesFromUploadedArt(designs, plan, uploaded)
}

/** Strip bulky dataUrls so the job-record POST stays under Vercel body limits. */
export function stripImageDataUrls(images: ProjectImageRef[] | undefined): ProjectImageRef[] {
  return (images || []).map(({ dataUrl: _dataUrl, ...rest }) => rest)
}

function readBlobPixelSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    image.src = url
  })
}

/**
 * Reject files that are clearly the composed sheet (or otherwise wrong) when the
 * project recorded the design's pixel size. Older builds sometimes stored the
 * sheet PNG id on every image row.
 */
function looksLikeWrongArt(
  loaded: { width: number; height: number },
  expectedW?: number,
  expectedH?: number,
): boolean {
  if (!loaded.width || !loaded.height) return true
  if (!expectedW || !expectedH) return false
  const widthRatio = loaded.width / expectedW
  const heightRatio = loaded.height / expectedH
  // Same art (possibly lightly cropped) stays near 1×1.
  if (widthRatio >= 0.5 && widthRatio <= 2.2 && heightRatio >= 0.5 && heightRatio <= 2.2) {
    return false
  }
  // Sheet PNGs are much wider/taller than a single design.
  return widthRatio > 2.5 || heightRatio > 2.5 || loaded.width * loaded.height > expectedW * expectedH * 6
}

async function fetchDriveArtBlob(fileId: string): Promise<Blob | null> {
  if (!fileId) return null
  try {
    const res = await fetch(`/api/drive/media?fileId=${encodeURIComponent(fileId)}`)
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}

/**
 * Resolve preview URLs for reopen: prefer embedded dataUrl, else fetch Drive media.
 * Tries processed → driveFileId → original. Drops sheet-sized mismatches.
 */
export async function resolveProjectImageUrls(
  images: ProjectImageRef[] | undefined,
): Promise<string[]> {
  if (!images?.length) return []

  // If every row shares one Drive id, that id is almost certainly the sheet PNG
  // from the old fallback — do not use it as per-design art.
  const sharedIds = images
    .map(
      (image) =>
        image.processed?.driveFileId || image.driveFileId || image.original?.driveFileId || '',
    )
    .filter(Boolean)
  const uniqueShared = new Set(sharedIds)
  const rejectSharedSheetId =
    images.length > 1 && uniqueShared.size === 1 ? [...uniqueShared][0] : ''

  const urls: string[] = []
  for (const image of images) {
    if (image.dataUrl) {
      urls.push(image.dataUrl)
      continue
    }

    const candidates = [
      image.processed?.driveFileId,
      image.driveFileId,
      image.original?.driveFileId,
    ].filter((id): id is string => Boolean(id && id !== rejectSharedSheetId))

    // Deduplicate while preserving order.
    const tried = new Set<string>()
    let resolved = ''
    let fallback = ''
    const expectedW = image.pixelWidth || image.processed?.pxW || image.original?.pxW
    const expectedH = image.pixelHeight || image.processed?.pxH || image.original?.pxH

    for (const fileId of candidates) {
      if (tried.has(fileId)) continue
      tried.add(fileId)
      const blob = await fetchDriveArtBlob(fileId)
      if (!blob) continue
      const size = await readBlobPixelSize(blob)
      if (looksLikeWrongArt(size, expectedW, expectedH)) {
        // Keep a fallback only when we have no expected size to judge against.
        if (!expectedW || !expectedH) fallback = fallback || URL.createObjectURL(blob)
        continue
      }
      resolved = URL.createObjectURL(blob)
      break
    }

    urls.push(resolved || fallback)
  }
  return urls
}
