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

/**
 * Creates a customer folder in the shop Google Drive and uploads the given files.
 * Large PNGs use resumable sessions (client PUT to Google).
 * Cutter PLT files are uploaded by our API (small text; more reliable than browser PUT).
 */
export async function uploadJobToGoogleDrive(options: {
  customerName: string
  stamp: string
  files: DriveFileUpload[]
  cutterFile?: DriveCutterUpload
}): Promise<DriveUploadResult> {
  const sessionRes = await fetch('/api/drive/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: options.customerName,
      stamp: options.stamp,
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
    // Do not set Content-Length — browsers treat it as a forbidden header.
    const putRes = await fetch(session.uploadUrl, {
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
