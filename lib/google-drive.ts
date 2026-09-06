import { google } from 'googleapis'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export type DriveUploadSpec = {
  name: string
  mimeType: string
  size: number
}

export type DriveUploadSession = {
  name: string
  uploadUrl: string
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `Google Drive is not configured (${name} is missing). Add the service account env vars on the host.`,
    )
  }
  return value
}

function privateKey() {
  return requiredEnv('GOOGLE_DRIVE_PRIVATE_KEY').replace(/\\n/g, '\n')
}

export function driveParentFolderId() {
  return requiredEnv('GOOGLE_DRIVE_PARENT_FOLDER_ID')
}

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim() &&
      process.env.GOOGLE_DRIVE_PRIVATE_KEY?.trim() &&
      process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim(),
  )
}

async function driveAuth() {
  const auth = new google.auth.JWT({
    email: requiredEnv('GOOGLE_DRIVE_CLIENT_EMAIL'),
    key: privateKey(),
    scopes: [DRIVE_SCOPE],
  })
  await auth.authorize()
  return auth
}

export async function createCustomerDriveFolder(customerName: string, stamp: string) {
  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  const parent = driveParentFolderId()
  const safeCustomer = customerName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Customer'
  const folderName = `${safeCustomer} ${stamp}`.trim()

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  })

  const folderId = created.data.id
  if (!folderId) throw new Error('Google Drive did not return a folder id.')

  return {
    folderId,
    folderName: created.data.name || folderName,
    folderUrl: created.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`,
  }
}

export async function createResumableUploadSessions(
  folderId: string,
  files: DriveUploadSpec[],
): Promise<DriveUploadSession[]> {
  const auth = await driveAuth()
  const token = await auth.getAccessToken()
  const accessToken = typeof token === 'string' ? token : token?.token
  if (!accessToken) throw new Error('Could not authorize Google Drive uploads.')

  const sessions: DriveUploadSession[] = []
  for (const file of files) {
    if (!file.name || file.size <= 0) {
      throw new Error(`Invalid upload file: ${file.name || '(missing name)'}`)
    }
    const start = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': file.mimeType,
          'X-Upload-Content-Length': String(file.size),
        },
        body: JSON.stringify({
          name: file.name,
          parents: [folderId],
        }),
      },
    )
    if (!start.ok) {
      const detail = await start.text()
      throw new Error(`Could not start Google Drive upload for ${file.name}: ${detail || start.statusText}`)
    }
    const uploadUrl = start.headers.get('location')
    if (!uploadUrl) throw new Error(`Google Drive did not return an upload URL for ${file.name}.`)
    sessions.push({ name: file.name, uploadUrl })
  }
  return sessions
}
