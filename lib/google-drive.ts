import { google } from 'googleapis'

/** Full Drive scope so we can write into an existing My Drive folder (personal Gmail). */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

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
      `Google Drive is not configured (${name} is missing). Connect Drive from Shop tools or add the env vars on the host.`,
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

/** Personal Gmail path: OAuth as the shop owner (kwprintings@gmail.com). */
export function isGoogleDriveOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim() &&
      process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim(),
  )
}

/** Workspace Shared Drive path: service account with storage on a Shared Drive. */
export function isGoogleDriveServiceAccountConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim() &&
      process.env.GOOGLE_DRIVE_PRIVATE_KEY?.trim() &&
      process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim(),
  )
}

export function isGoogleDriveConfigured() {
  return isGoogleDriveOAuthConfigured() || isGoogleDriveServiceAccountConfigured()
}

export function createOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    requiredEnv('GOOGLE_DRIVE_OAUTH_CLIENT_ID'),
    requiredEnv('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET'),
    redirectUri,
  )
}

export function getDriveAuthUrl(redirectUri: string, state?: string) {
  const client = createOAuthClient(redirectUri)
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
    state,
  })
}

export async function exchangeDriveAuthCode(redirectUri: string, code: string) {
  const client = createOAuthClient(redirectUri)
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke app access at https://myaccount.google.com/permissions and connect again.',
    )
  }
  return tokens
}

async function driveAuth() {
  if (isGoogleDriveOAuthConfigured()) {
    const client = createOAuthClient()
    client.setCredentials({
      refresh_token: requiredEnv('GOOGLE_DRIVE_REFRESH_TOKEN'),
    })
    return client
  }

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

/** Smoke-test: create a tiny folder then delete it. */
export async function verifyDriveWriteAccess() {
  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  const parent = driveParentFolderId()
  const created = await drive.files.create({
    requestBody: {
      name: `Drive connect check ${new Date().toISOString()}`,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  })
  const folderId = created.data.id
  if (!folderId) throw new Error('Drive check failed: no folder id.')
  // Leave the check folder so the shop can see it; they can delete it.
  return {
    folderId,
    folderName: created.data.name || 'Drive connect check',
    folderUrl: created.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`,
    mode: isGoogleDriveOAuthConfigured() ? 'oauth' : 'service-account',
  }
}
