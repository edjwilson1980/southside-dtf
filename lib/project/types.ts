/** Project origin — set once, never changes (SPEC E2). */
export type ProjectSource = 'shop-builder' | 'customer-site' | 'dtf-stickers'

export const PROJECT_SOURCES: ProjectSource[] = [
  'shop-builder',
  'customer-site',
  'dtf-stickers',
]

export const PROJECT_SOURCE_LABEL: Record<ProjectSource, string> = {
  'shop-builder': 'Shop Builder',
  'customer-site': 'Customer site',
  'dtf-stickers': 'DTF Stickers',
}

export const PROJECT_FORMAT = 'ssp-gangsheet-project' as const
export const PROJECT_SCHEMA_VERSION = 2
export const PROJECT_JSON_NAME = 'project.ssp.json'

export type ProjectCustomer = {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export type ProjectImageRef = {
  id?: string | number
  name?: string
  fileName?: string
  size?: string
  customWidth?: string
  customHeight?: string
  quantity?: number
  keepUpright?: boolean
  pixelWidth?: number
  pixelHeight?: number
  placement?: string
  dataUrl?: string
  driveFileId?: string
  cut?: { shape?: string; offsetMm?: number; squareCutMm?: number }
  sizeIn?: { w?: number; h?: number }
  original?: { driveFileId?: string; pxW?: number; pxH?: number }
  processed?: { driveFileId?: string; pxW?: number; pxH?: number }
}

export type SspProject = {
  format: typeof PROJECT_FORMAT
  schemaVersion: number
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  lastUploadAt?: string
  source: ProjectSource
  revision: number
  customer?: ProjectCustomer
  product?: Record<string, unknown>
  sheet?: Record<string, unknown>
  cut?: { enabled?: boolean }
  images?: ProjectImageRef[]
  orderRefs?: unknown[]
  snapshot?: unknown
  codeVersion?: { builder?: string }
  sig?: string
}

export type ProjectSearchHit = {
  projectId: string
  name: string
  source: ProjectSource
  orderId?: string
  customerName?: string
  email?: string
  updatedAt: string
  folderId?: string
  fileId?: string
  webViewLink?: string
}
