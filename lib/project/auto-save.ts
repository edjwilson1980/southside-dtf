import { writeDriveJobRecord, type DriveJobRecordResult } from '@/lib/upload-to-drive'
import { BUILDER_VERSION } from '@/lib/version'
import { nextRevision } from './conflict'
import { projectDriveAppProperties } from './driveTags'
import { projectJsonFileName } from './file-name'
import { buildImagesForDriveProject, stripImageDataUrls, type DesignArtInput } from './images'
import { rememberRecentProject } from './recent'
import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  type ProjectCustomer,
  type ProjectImageRef,
  type ProjectSource,
  type SspProject,
} from './types'

/** Keep job-record POST well under Vercel's ~4.5MB body limit. */
const MAX_DRIVE_JSON_CHARS = 2_500_000

function newProjectId() {
  const rand = Math.random().toString(36).slice(2, 8)
  return `prj_${rand}`
}

async function wait(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

export type AutoSaveInput = {
  /** Existing Drive job folder. Omit and pass `createFolder` to make one first. */
  folderId?: string
  /** Create the customer job folder when none exists yet (Save Job before build). */
  createFolder?: { customerName: string; stamp: string }
  source: ProjectSource
  /** Keep stable across updates for the same job. */
  projectId?: string
  /** Revision currently known client-side (pre-increment). Omit on first write. */
  revision?: number
  createdAt?: string
  name: string
  customer?: ProjectCustomer
  orderId?: string | null
  product?: Record<string, unknown>
  sheet?: Record<string, unknown>
  cut?: { enabled?: boolean }
  images?: ProjectImageRef[]
  /** When false, skip lastUploadAt. Default true. */
  fromUpload?: boolean
}

export type AutoSaveResult = {
  projectId: string
  revision: number
  payload: SspProject
  fileName: string
  fileId?: string
  webViewLink?: string
  /** Folder the JSON landed in (new when created on demand). */
  folderId: string
  folderUrl: string
}

/** Build the shared project JSON body (SPEC B4 / E2). */
export function buildProjectDocument(input: Omit<AutoSaveInput, 'folderId' | 'createFolder'>): SspProject {
  const now = new Date().toISOString()
  const projectId = input.projectId?.trim() || newProjectId()
  const revision =
    input.revision === undefined || input.revision === null
      ? 1
      : nextRevision(input.revision)
  const createdAt = input.createdAt || now

  return {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    name: input.name.trim() || `Untitled ${now.slice(0, 10)}`,
    createdAt,
    updatedAt: now,
    ...(input.fromUpload === false ? {} : { lastUploadAt: now }),
    source: input.source,
    revision,
    customer: {
      name: input.customer?.name ?? input.name,
      email: input.customer?.email ?? null,
      phone: input.customer?.phone ?? null,
    },
    product: input.product,
    sheet: input.sheet,
    cut: input.cut,
    images: input.images || [],
    orderRefs: [],
    snapshot: null,
    codeVersion: { builder: BUILDER_VERSION },
  }
}

/**
 * Write `{Project Name}.ssp.json` into the Drive job folder after files are created.
 * Retries up to 3 times. Upserts / renames any existing `*.ssp.json` in that folder.
 */
export async function autoSaveProjectJson(input: AutoSaveInput): Promise<AutoSaveResult> {
  if (!input.folderId && !input.createFolder) {
    throw new Error('No Drive folder for this project yet.')
  }
  // Never put full image dataUrls in the Drive write — they blow past Vercel body limits
  // and the JSON never lands in the job folder.
  const finalDoc = buildProjectDocument({
    ...input,
    images: stripImageDataUrls(input.images),
  })
  const fileName = projectJsonFileName(finalDoc.name)
  let content = JSON.stringify(finalDoc, null, 2)
  if (content.length > MAX_DRIVE_JSON_CHARS) {
    finalDoc.images = (finalDoc.images || []).map((image) => {
      const { dataUrl: _d, ...rest } = image
      return rest
    })
    content = JSON.stringify(finalDoc, null, 2)
  }
  if (content.length > MAX_DRIVE_JSON_CHARS) {
    throw new Error(
      `Project JSON is too large to write to Drive (${Math.round(content.length / 1024)} KB).`,
    )
  }
  const appProperties = projectDriveAppProperties({
    projectId: finalDoc.projectId,
    source: finalDoc.source,
    customer: finalDoc.customer,
    updatedAt: finalDoc.updatedAt,
    orderId: input.orderId,
  })

  let lastError: Error | null = null
  let written: DriveJobRecordResult = {}
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      written = await writeDriveJobRecord({
        folderId: input.folderId,
        createFolder: input.folderId ? undefined : input.createFolder,
        name: fileName,
        content,
        appProperties,
        upsert: true,
      })
      lastError = null
      break
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`Could not write ${fileName}`)
      await wait(400 * 2 ** attempt)
    }
  }
  if (lastError) throw lastError

  const folderId = written.folderId || input.folderId || ''
  const folderUrl = written.folderUrl || `https://drive.google.com/drive/folders/${folderId}`

  rememberRecentProject({
    projectId: finalDoc.projectId,
    name: finalDoc.name,
    source: finalDoc.source,
    orderId: input.orderId?.trim() || undefined,
    customerName: finalDoc.customer?.name || undefined,
    email: finalDoc.customer?.email || undefined,
    updatedAt: finalDoc.updatedAt,
    folderId,
    fileId: written.id,
    webViewLink: written.webViewLink,
  })

  return {
    projectId: finalDoc.projectId,
    revision: finalDoc.revision,
    payload: finalDoc,
    fileName: written.name || fileName,
    fileId: written.id,
    webViewLink: written.webViewLink,
    folderId,
    folderUrl,
  }
}

export type SaveProjectWithArtResult = AutoSaveResult & {
  /** Set when design art could not be uploaded; the JSON still landed (metadata only). */
  artError?: string
}

/**
 * Save a project to Drive in two steps so the JSON always lands:
 *   1. write `{Project}.ssp.json` with design metadata right away;
 *   2. upload each design's art into the folder, then update the JSON with ids.
 * If step 2 fails, the file from step 1 remains and `artError` explains why.
 */
export async function saveProjectWithArt(
  input: Omit<AutoSaveInput, 'images'> & { designs: DesignArtInput[] },
): Promise<SaveProjectWithArtResult> {
  const { designs, ...rest } = input
  const metadataOnly: ProjectImageRef[] = designs.map((design) => ({
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
  }))

  const first = await autoSaveProjectJson({ ...rest, images: metadataOnly })
  if (designs.length === 0) return first

  try {
    const images = await buildImagesForDriveProject(designs, {
      folderId: first.folderId,
      customerName: rest.customer?.name || rest.name,
    })
    const hasArt = images.some((image) => image.driveFileId)
    if (!hasArt) {
      return { ...first, artError: 'Design art could not be read for upload.' }
    }
    const second = await autoSaveProjectJson({
      ...rest,
      folderId: first.folderId,
      createFolder: undefined,
      projectId: first.projectId,
      revision: first.revision,
      createdAt: first.payload.createdAt,
      images,
    })
    return second
  } catch (err) {
    return {
      ...first,
      artError: err instanceof Error ? err.message : 'Design art upload failed.',
    }
  }
}

/** Convenience: map Drive upload files onto lightweight image refs (no embedded art). */
export function imagesFromDriveFiles(
  files: Array<{ name: string; id: string }>,
  extras?: Array<Partial<ProjectImageRef>>,
): ProjectImageRef[] {
  return files.map((file, index) => ({
    id: extras?.[index]?.id ?? `img_${index + 1}`,
    name: file.name,
    fileName: file.name,
    driveFileId: file.id,
    quantity: extras?.[index]?.quantity ?? 1,
    ...extras?.[index],
  }))
}
