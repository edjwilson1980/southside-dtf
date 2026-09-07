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
  /** Drive file id for the first (print) upload — used as cart fileUrl. */
  fileId?: string
  /** Direct Drive link for the print PNG (https://drive.google.com/file/d/…/view). */
  fileUrl?: string
  webViewLink?: string
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
  let printFile: { id?: string; name?: string; webViewLink?: string } | null = null
  for (const file of options.files) {
    const session = uploads.find((item) => item.name === file.name)
    if (!session?.uploadUrl) {
      throw new Error(`Missing Google Drive upload session for ${file.name}.`)
    }
    const uploaded = await putDriveFile(file, session.uploadUrl)
    if (!printFile) printFile = uploaded
  }

  if (!sessionJson.folderId || !sessionJson.folderUrl) {
    throw new Error('Google Drive did not return a folder link.')
  }

  const fileId = printFile?.id
  if (!fileId) {
    throw new Error('Could not save your sheet to our print queue. Please try again.')
  }
  const webViewLink =
    printFile?.webViewLink || `https://drive.google.com/file/d/${fileId}/view`

  return {
    folderId: sessionJson.folderId,
    folderName: sessionJson.folderName || options.customerName,
    folderUrl: sessionJson.folderUrl,
    cutterFileName: sessionJson.cutter?.name,
    fileId,
    fileUrl: webViewLink,
    webViewLink,
  }
}

async function putDriveFile(
  file: DriveFileUpload,
  googleUploadUrl: string,
): Promise<{ id?: string; name?: string; webViewLink?: string }> {
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
    if (proxyRes.ok) {
      const proxyJson = (await proxyRes.json().catch(() => ({}))) as {
        id?: string
        name?: string
        webViewLink?: string
      }
      const id = proxyJson.id
      return {
        id,
        name: proxyJson.name || file.name,
        webViewLink:
          proxyJson.webViewLink ||
          (id ? `https://drive.google.com/file/d/${id}/view` : undefined),
      }
    }
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
  const detail = await putRes.text()
  if (!putRes.ok) {
    throw new Error(`Could not upload ${file.name} to Google Drive: ${detail || putRes.statusText}`)
  }
  let parsed: { id?: string; name?: string; webViewLink?: string } = {}
  try {
    parsed = detail ? JSON.parse(detail) : {}
  } catch {
    parsed = {}
  }
  const id = parsed.id
  return {
    id,
    name: parsed.name || file.name,
    webViewLink:
      parsed.webViewLink || (id ? `https://drive.google.com/file/d/${id}/view` : undefined),
  }
}
