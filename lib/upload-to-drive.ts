export type DriveFileUpload = {
  name: string
  mimeType: string
  blob: Blob
}

export type DriveCutterUpload = {
  name: string
  content: string
  mimeType?: string
}

export type DriveUploadResult = {
  folderId: string
  folderName: string
  folderUrl: string
  cutterFileName?: string
}

/** Stay under typical serverless request body limits when proxying through our API. */
const PROXY_MAX_BYTES = 3_500_000

/**
 * Creates a customer folder in the shop Google Drive and uploads the given files.
 * - Cutter PLT: uploaded by our API (small text).
 * - Print PNG: proxied through our API when small enough; otherwise direct to Google
 *   using a resumable session initiated with this page's Origin (required for CORS).
 */
export async function uploadJobToGoogleDrive(options: {
  customerName: string
  stamp: string
  files: DriveFileUpload[]
  cutterFile?: DriveCutterUpload
}): Promise<DriveUploadResult> {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined

  const sessionRes = await fetch('/api/drive/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: options.customerName,
      stamp: options.stamp,
      origin,
      files: options.files.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        size: file.blob.size,
      })),
      cutterFile: options.cutterFile
        ? {
            name: options.cutterFile.name,
            content: options.cutterFile.content,
            mimeType: options.cutterFile.mimeType || 'text/plain',
          }
        : undefined,
    }),
  })

  const sessionJson = (await sessionRes.json()) as {
    error?: string
    folderId?: string
    folderName?: string
    folderUrl?: string
    uploads?: Array<{ name: string; uploadUrl: string }>
    cutter?: { id?: string; name?: string } | null
  }

  if (!sessionRes.ok) {
    throw new Error(sessionJson.error || 'Could not create the Google Drive folder.')
  }

  if (options.cutterFile && !sessionJson.cutter?.id) {
    throw new Error(`Could not upload cutter file ${options.cutterFile.name} to Google Drive.`)
  }

  const uploads = sessionJson.uploads ?? []
  for (const file of options.files) {
    const session = uploads.find((item) => item.name === file.name)
    if (!session?.uploadUrl) {
      throw new Error(`Missing Google Drive upload session for ${file.name}.`)
    }
    await putDriveFile(file, session.uploadUrl)
  }

  if (!sessionJson.folderId || !sessionJson.folderUrl) {
    throw new Error('Google Drive did not return a folder link.')
  }

  return {
    folderId: sessionJson.folderId,
    folderName: sessionJson.folderName || options.customerName,
    folderUrl: sessionJson.folderUrl,
    cutterFileName: sessionJson.cutter?.name,
  }
}

async function putDriveFile(file: DriveFileUpload, googleUploadUrl: string) {
  // Prefer same-origin proxy so the browser never talks to googleapis (no CORS).
  if (file.blob.size <= PROXY_MAX_BYTES) {
    const proxyRes = await fetch('/api/drive/upload', {
      method: 'PUT',
      headers: {
        'Content-Type': file.mimeType,
        'X-Drive-Upload-Url': googleUploadUrl,
      },
      body: file.blob,
    })
    if (proxyRes.ok) return
    const proxyJson = (await proxyRes.json().catch(() => ({}))) as { error?: string }
    // Fall through to direct PUT when proxy cannot accept the body.
    if (proxyRes.status !== 413 && proxyRes.status < 500) {
      throw new Error(proxyJson.error || `Could not upload ${file.name} to Google Drive.`)
    }
  }

  // Direct browser → Google (session must have been started with this Origin).
  const putRes = await fetch(googleUploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.mimeType,
    },
    body: file.blob,
  })
  if (!putRes.ok) {
    const detail = await putRes.text()
    throw new Error(`Could not upload ${file.name} to Google Drive: ${detail || putRes.statusText}`)
  }
}
