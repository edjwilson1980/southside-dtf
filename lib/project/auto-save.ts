import { writeDriveJobRecord } from '@/lib/upload-to-drive'
import { BUILDER_VERSION } from '@/lib/version'
import { nextRevision } from './conflict'
import { projectDriveAppProperties } from './driveTags'
import { rememberRecentProject } from './recent'
import {
  PROJECT_FORMAT,
  PROJECT_JSON_NAME,
  PROJECT_SCHEMA_VERSION,
  type ProjectCustomer,
  type ProjectImageRef,
  type ProjectSource,
  type SspProject,
} from './types'

function newProjectId() {
  const rand = Math.random().toString(36).slice(2, 8)
  return `prj_${rand}`
}

async function wait(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

export type AutoSaveInput = {
  folderId: string
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
  fileId?: string
  webViewLink?: string
}

/** Build the shared project.ssp.json body (SPEC B4 / E2). */
export function buildProjectDocument(input: Omit<AutoSaveInput, 'folderId'>): SspProject {
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
 * SPEC B2 / E2 / E3 — write project.ssp.json into the Drive job folder
 * after files are created. Retries up to 3 times.
 */
export async function autoSaveProjectJson(input: AutoSaveInput): Promise<AutoSaveResult> {
  const finalDoc = buildProjectDocument(input)
  const content = JSON.stringify(finalDoc, null, 2)
  const appProperties = projectDriveAppProperties({
    projectId: finalDoc.projectId,
    source: finalDoc.source,
    customer: finalDoc.customer,
    updatedAt: finalDoc.updatedAt,
    orderId: input.orderId,
  })

  let lastError: Error | null = null
  let written: { id?: string; webViewLink?: string } = {}
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      written = await writeDriveJobRecord({
        folderId: input.folderId,
        name: PROJECT_JSON_NAME,
        content,
        appProperties,
        upsert: true,
      })
      lastError = null
      break
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Could not write project.ssp.json')
      await wait(400 * 2 ** attempt)
    }
  }
  if (lastError) throw lastError

  rememberRecentProject({
    projectId: finalDoc.projectId,
    name: finalDoc.name,
    source: finalDoc.source,
    orderId: input.orderId?.trim() || undefined,
    customerName: finalDoc.customer?.name || undefined,
    email: finalDoc.customer?.email || undefined,
    updatedAt: finalDoc.updatedAt,
    folderId: input.folderId,
    fileId: written.id,
    webViewLink: written.webViewLink,
  })

  return {
    projectId: finalDoc.projectId,
    revision: finalDoc.revision,
    payload: finalDoc,
    fileId: written.id,
    webViewLink: written.webViewLink,
  }
}

/** Convenience: map Drive upload files onto lightweight image refs. */
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
