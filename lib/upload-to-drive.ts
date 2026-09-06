export type DriveFileUpload = {
  name: string
  mimeType: string
  blob: Blob
}

export type DriveUploadResult = {
  folderId: string
  folderName: string
  folderUrl: string
}

/**
 * Creates a customer folder in the shop Google Drive and uploads the given files
 * via resumable sessions (so large gang-sheet PNGs fit past serverless body limits).
 */
export async function uploadJobToGoogleDrive(options: {
  customerName: string
  stamp: string
  files: DriveFileUpload[]
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
    }),
  })

  const sessionJson = (await sessionRes.json()) as {
    error?: string
    folderId?: string
    folderName?: string
    folderUrl?: string
    uploads?: Array<{ name: string; uploadUrl: string }>
  }

  if (!sessionRes.ok) {
    throw new Error(sessionJson.error || 'Could not create the Google Drive folder.')
  }

  const uploads = sessionJson.uploads ?? []
  for (const file of options.files) {
    const session = uploads.find((item) => item.name === file.name)
    if (!session?.uploadUrl) {
      throw new Error(`Missing Google Drive upload session for ${file.name}.`)
    }
    const putRes = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.blob.size),
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
  }
}
