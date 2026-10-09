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
  /** Browser origin so Google includes CORS headers on later client PUTs. */
  browserOrigin?: string,
): Promise<DriveUploadSession[]> {
  const auth = await driveAuth()
  const token = await auth.getAccessToken()
  const accessToken = typeof token === 'string' ? token : token?.token
  if (!accessToken) throw new Error('Could not authorize Google Drive uploads.')

  const origin = browserOrigin?.trim()
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
          // Required when the browser will PUT the bytes; without this, Google
          // omits Access-Control-Allow-Origin on the upload response (CORS fail).
          ...(origin ? { Origin: origin } : {}),
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

/**
 * Upload bytes to Drive via resumable upload (server-side — no browser CORS).
 * Used for payment-commit pushes and small cutter PLT files.
 */
export async function uploadBufferToFolder(
  folderId: string,
  name: string,
  bytes: Buffer,
  mimeType: string,
) {
  if (!name.trim()) throw new Error('File name is required.')
  if (!bytes.length) throw new Error(`File ${name} is empty.`)

  const [session] = await createResumableUploadSessions(folderId, [
    { name, mimeType, size: bytes.length },
  ])
  if (!session?.uploadUrl) {
    throw new Error(`Could not start Google Drive upload for ${name}.`)
  }

  const putRes = await fetch(session.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  })
  const detail = await putRes.text()
  if (!putRes.ok) {
    throw new Error(`Could not upload ${name}: ${detail || putRes.statusText}`)
  }

  let parsed: { id?: string; name?: string; webViewLink?: string } = {}
  try {
    parsed = detail ? JSON.parse(detail) : {}
  } catch {
    parsed = {}
  }

  const fileId = parsed.id
  if (!fileId) throw new Error(`Google Drive did not return an id for ${name}.`)

  return {
    id: fileId,
    name: parsed.name || name,
    webViewLink: parsed.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  }
}

/**
 * Upload a small text cutter file (PLT) from the server.
 * Uses the same resumable PUT path as PNG (googleapis media body streams
 * are unreliable on this Node/runtime combo — `body.pipe is not a function`).
 */
export async function uploadCutterFileToFolder(
  folderId: string,
  name: string,
  content: string,
  mimeType = 'text/plain',
) {
  if (!name.trim()) throw new Error('Cutter file name is required.')
  if (!content) throw new Error('Cutter file content is empty.')
  return uploadBufferToFolder(folderId, name, Buffer.from(content, 'utf8'), mimeType)
}

async function driveAccessToken() {
  const auth = await driveAuth()
  const token = await auth.getAccessToken()
  const accessToken = typeof token === 'string' ? token : token?.token
  if (!accessToken) throw new Error('Could not authorize Google Drive uploads.')
  return accessToken
}

async function patchDriveAppProperties(fileId: string, appProperties: Record<string, string>) {
  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.update({
    fileId,
    requestBody: { appProperties },
    fields: 'id',
    supportsAllDrives: true,
  })
}

/**
 * Create or update a text/JSON file in a Drive folder.
 * Uses raw media upload (same reliability path as PLT) — no googleapis streams.
 */
export async function upsertTextFileInFolder(
  folderId: string,
  name: string,
  content: string,
  mimeType = 'application/json',
  appProperties?: Record<string, string>,
) {
  if (!name.trim()) throw new Error('File name is required.')
  if (!content) throw new Error(`File ${name} is empty.`)

  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const existingId = existing.data.files?.[0]?.id
  const bytes = Buffer.from(content, 'utf8')

  if (existingId) {
    const accessToken = await driveAccessToken()
    const putRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
          'Content-Length': String(bytes.length),
        },
        body: bytes,
      },
    )
    const detail = await putRes.text()
    if (!putRes.ok) {
      throw new Error(`Could not update ${name}: ${detail || putRes.statusText}`)
    }
    if (appProperties) await patchDriveAppProperties(existingId, appProperties)
    let parsed: { id?: string; name?: string; webViewLink?: string } = {}
    try {
      parsed = detail ? JSON.parse(detail) : {}
    } catch {
      parsed = {}
    }
    const id = parsed.id || existingId
    return {
      id,
      name: parsed.name || name,
      webViewLink: parsed.webViewLink || `https://drive.google.com/file/d/${id}/view`,
    }
  }

  const created = await uploadBufferToFolder(folderId, name, bytes, mimeType)
  if (appProperties) await patchDriveAppProperties(created.id, appProperties)
  return created
}

export type DriveProjectSearchOptions = {
  query?: string
  source?: string
  limit?: number
}

/**
 * List recent project.ssp.json files (SPEC E5).
 * Exact matches use appProperties; name search filters ssp_customer client-side.
 */
export async function searchDriveProjects(options: DriveProjectSearchOptions = {}) {
  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50)
  const qParts = [`name = 'project.ssp.json'`, 'trashed = false']
  const query = options.query?.trim() || ''
  const source = options.source?.trim() || ''

  if (source && source !== 'all') {
    qParts.push(`appProperties has { key='ssp_source' and value='${source.replace(/'/g, "\\'")}' }`)
  }

  // Exact keys: project id, order #, email
  if (query) {
    const safe = query.replace(/'/g, "\\'").toLowerCase()
    if (/^prj_[a-z0-9]+$/i.test(query) || /^\d+$/.test(query) || query.includes('@')) {
      const key = /^prj_/i.test(query)
        ? 'ssp_project_id'
        : query.includes('@')
          ? 'ssp_email'
          : 'ssp_order_id'
      qParts.push(`appProperties has { key='${key}' and value='${safe}' }`)
    }
  }

  const listed = await drive.files.list({
    q: qParts.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: query && !/^prj_/i.test(query) && !/^\d+$/.test(query) && !query.includes('@') ? 50 : limit,
    fields: 'files(id, name, modifiedTime, appProperties, parents, webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  let files = listed.data.files || []
  if (query && !/^prj_/i.test(query) && !/^\d+$/.test(query) && !query.includes('@')) {
    const needle = query.toLowerCase()
    files = files.filter((file) => {
      const props = file.appProperties || {}
      const hay = [
        props.ssp_customer,
        props.ssp_email,
        props.ssp_order_id,
        props.ssp_project_id,
        file.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }

  return files.slice(0, limit).map((file) => {
    const props = file.appProperties || {}
    return {
      projectId: props.ssp_project_id || file.id || '',
      name: props.ssp_customer || file.name || 'project.ssp.json',
      source: props.ssp_source || 'shop-builder',
      orderId: props.ssp_order_id || undefined,
      customerName: props.ssp_customer || undefined,
      email: props.ssp_email || undefined,
      updatedAt: props.ssp_updated || file.modifiedTime || new Date().toISOString(),
      folderId: file.parents?.[0],
      fileId: file.id || undefined,
      webViewLink: file.webViewLink || (file.id ? `https://drive.google.com/file/d/${file.id}/view` : undefined),
    }
  })
}

/** Download a Drive file's text content (project JSON). */
export async function downloadDriveFileText(fileId: string) {
  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  const data = res.data as ArrayBuffer | Buffer | string
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  return Buffer.from(data).toString('utf8')
}

/** Find project.ssp.json by project id appProperty. */
export async function findProjectFileByProjectId(projectId: string) {
  const auth = await driveAuth()
  const drive = google.drive({ version: 'v3', auth })
  const safe = projectId.replace(/'/g, "\\'")
  const listed = await drive.files.list({
    q: `name = 'project.ssp.json' and trashed = false and appProperties has { key='ssp_project_id' and value='${safe}' }`,
    pageSize: 1,
    fields: 'files(id, name, appProperties, parents, webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return listed.data.files?.[0] || null
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
