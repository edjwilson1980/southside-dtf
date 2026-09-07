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

/** 8 MB chunks — resumable PUT direct to Google (never through Vercel body limits). */
const CHUNK = 8 * 1024 * 1024

/**
 * Creates a customer folder in the shop Google Drive and uploads the given files.
 * - Cutter PLT: uploaded by our API (small text).
 * - Print files: browser → Google resumable PUT only. Vercel/WP never see the bytes.
 */
export async function uploadJobToGoogleDrive(options: {
  customerName: string
  stamp: string
  files: DriveFileUpload[]
  cutterFile?: DriveCutterUpload
  onProgress?: (fraction: number) => void
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
  const totalBytes = options.files.reduce((sum, file) => sum + file.blob.size, 0)
  let uploadedBytes = 0
  let printFile: { id?: string; name?: string; webViewLink?: string } | null = null

  for (const file of options.files) {
    const session = uploads.find((item) => item.name === file.name)
    if (!session?.uploadUrl) {
      throw new Error(`Missing Google Drive upload session for ${file.name}.`)
    }
    const uploaded = await putDriveFileChunked(file, session.uploadUrl, (fileFraction) => {
      const done = uploadedBytes + file.blob.size * fileFraction
      options.onProgress?.(totalBytes > 0 ? Math.min(1, done / totalBytes) : 1)
    })
    uploadedBytes += file.blob.size
    options.onProgress?.(totalBytes > 0 ? Math.min(1, uploadedBytes / totalBytes) : 1)
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

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function putWithRetry(
  uploadUrl: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(uploadUrl, init)
      if (res.status === 308 || res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408)) {
        return res
      }
      lastError = new Error(`Upload failed: ${res.status} ${await res.text()}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Network error during Drive upload.')
    }
    await sleep(500 * 2 ** attempt)
  }
  throw lastError || new Error('Drive upload failed after retries.')
}

/**
 * Chunked resumable PUT direct to Google.
 * No Authorization header — the session URI carries credentials.
 */
async function putDriveFileChunked(
  file: DriveFileUpload,
  googleUploadUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<{ id?: string; name?: string; webViewLink?: string }> {
  const size = file.blob.size
  if (size <= 0) throw new Error(`File ${file.name} is empty.`)

  let offset = 0
  while (offset < size) {
    const end = Math.min(offset + CHUNK, size)
    const chunk = file.blob.slice(offset, end)
    const res = await putWithRetry(googleUploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.size),
        'Content-Range': `bytes ${offset}-${end - 1}/${size}`,
      },
      body: chunk,
    })

    if (res.status === 308) {
      const range = res.headers.get('range')
      offset = range ? parseInt(range.split('-')[1] || '', 10) + 1 : end
      if (!Number.isFinite(offset) || offset < 0) offset = end
      onProgress?.(Math.min(1, offset / size))
      continue
    }

    if (!res.ok) {
      throw new Error(`Could not upload ${file.name} to Google Drive: ${res.status} ${await res.text()}`)
    }

    const detail = await res.text()
    let parsed: { id?: string; name?: string; webViewLink?: string } = {}
    try {
      parsed = detail ? JSON.parse(detail) : {}
    } catch {
      parsed = {}
    }
    const id = parsed.id
    onProgress?.(1)
    return {
      id,
      name: parsed.name || file.name,
      webViewLink:
        parsed.webViewLink || (id ? `https://drive.google.com/file/d/${id}/view` : undefined),
    }
  }

  throw new Error(`Could not finish uploading ${file.name} to Google Drive.`)
}
