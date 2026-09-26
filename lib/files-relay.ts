import { createHmac, timingSafeEqual } from 'crypto'
import sharp from 'sharp'
import { driveParentFolderId, getGoogleDrive } from '@/lib/google-drive'
import { uploadSignSecret } from '@/lib/upload-sign'

export const ARCHIVE_FOLDER_NAME = 'Archive – Expired Gang Sheets'
export const THUMB_MAX_AGE_SEC = 15 * 60
export const BODY_MAX_AGE_SEC = 5 * 60

export function filesRelaySecret() {
  return uploadSignSecret()
}

function requiredSecret() {
  const secret = filesRelaySecret()
  if (!secret) throw new Error('SSGS_COMMIT_SECRET is not configured.')
  return secret
}

/** Sign / verify literal body string HMAC (hex). */
export function signBody(secret: string, body: string) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export function verifyBodySignature(secret: string, body: string, sig: string | null) {
  if (!secret || !sig) return false
  const expected = signBody(secret, body)
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseSignedJsonBody<T extends { ts?: number | string }>(
  rawBody: string,
  sigHeader: string | null,
): { ok: true; data: T } | { ok: false; error: string; status: number } {
  let secret: string
  try {
    secret = requiredSecret()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Secret missing', status: 503 }
  }
  if (!verifyBodySignature(secret, rawBody, sigHeader)) {
    return { ok: false, error: 'Invalid signature.', status: 403 }
  }
  let data: T
  try {
    data = JSON.parse(rawBody) as T
  } catch {
    return { ok: false, error: 'Invalid JSON body.', status: 400 }
  }
  const ts = Number(data.ts)
  if (!Number.isFinite(ts)) {
    return { ok: false, error: 'Missing ts.', status: 400 }
  }
  const tsMs = ts > 1e12 ? ts : ts * 1000
  if (Math.abs(Date.now() - tsMs) > BODY_MAX_AGE_SEC * 1000) {
    return { ok: false, error: 'Request expired.', status: 403 }
  }
  return { ok: true, data }
}

/** Thumbnail token: drive_file_id|user_id|exp */
export function signThumbToken(driveFileId: string, userId: number | string, expSec?: number) {
  const secret = requiredSecret()
  const exp = String(expSec ?? Math.floor(Date.now() / 1000) + THUMB_MAX_AGE_SEC)
  const payload = [driveFileId, String(userId), exp].join('|')
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  return Buffer.from(`${payload}|${sig}`, 'utf8').toString('base64url')
}

export function verifyThumbToken(token: string): { driveFileId: string; userId: string } | null {
  const secret = filesRelaySecret()
  if (!secret || !token) return null
  let decoded: string
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const parts = decoded.split('|')
  if (parts.length !== 4) return null
  const [driveFileId, userId, exp, sig] = parts
  if (!driveFileId || !userId || !exp || !sig) return null
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null
  const payload = [driveFileId, userId, exp].join('|')
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  return { driveFileId, userId }
}

async function ensureArchiveFolderId() {
  const drive = await getGoogleDrive()
  const parent = driveParentFolderId()
  const escaped = ARCHIVE_FOLDER_NAME.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = [
    `name = '${escaped}'`,
    `'${parent}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
  ].join(' and ')
  const listed = await drive.files.list({
    q,
    fields: 'files(id,name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const existing = listed.data.files?.[0]?.id
  if (existing) return existing

  const created = await drive.files.create({
    requestBody: {
      name: ARCHIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  if (!created.data.id) throw new Error('Could not create archive folder.')
  return created.data.id
}

export async function archiveDriveFile(driveFileId: string) {
  const drive = await getGoogleDrive()
  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'id,parents,appProperties',
    supportsAllDrives: true,
  })
  const parents = meta.data.parents || []
  if (!parents.length) throw new Error('File has no parent folder.')
  const originalParent = parents[0]
  const archiveId = await ensureArchiveFolderId()

  await drive.files.update({
    fileId: driveFileId,
    addParents: archiveId,
    removeParents: parents.join(','),
    requestBody: {
      appProperties: {
        ...(meta.data.appProperties || {}),
        ssdtf_original_parent: originalParent,
      },
    },
    fields: 'id,parents,appProperties',
    supportsAllDrives: true,
  })
  return { driveFileId, archiveFolderId: archiveId, originalParent }
}

export async function restoreDriveFile(driveFileId: string) {
  const drive = await getGoogleDrive()
  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'id,parents,appProperties',
    supportsAllDrives: true,
  })
  const originalParent =
    meta.data.appProperties?.ssdtf_original_parent || driveParentFolderId()
  const parents = meta.data.parents || []
  const remove = parents.filter((p) => p !== originalParent).join(',')

  await drive.files.update({
    fileId: driveFileId,
    addParents: originalParent,
    ...(remove ? { removeParents: remove } : {}),
    fields: 'id,parents',
    supportsAllDrives: true,
  })
  return { driveFileId, parentId: originalParent }
}

export async function deleteArchivedDriveFile(driveFileId: string) {
  const drive = await getGoogleDrive()
  const archiveId = await ensureArchiveFolderId()
  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'id,parents',
    supportsAllDrives: true,
  })
  const parents = meta.data.parents || []
  if (!parents.includes(archiveId)) {
    throw new Error('Refusing to delete: file is not in the Archive folder.')
  }
  await drive.files.delete({
    fileId: driveFileId,
    supportsAllDrives: true,
  })
  return { driveFileId, deleted: true }
}

export async function makeThumbPng(driveFileId: string): Promise<Buffer> {
  const drive = await getGoogleDrive()
  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'id,name,mimeType',
    supportsAllDrives: true,
  })
  const mime = (meta.data.mimeType || '').toLowerCase()
  const name = meta.data.name || 'file'

  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  const bytes = Buffer.from(res.data as ArrayBuffer)

  if (mime.includes('png') || mime.includes('jpeg') || mime.includes('jpg') || mime.includes('webp')) {
    return sharp(bytes).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  }

  try {
    return await sharp(bytes, { density: 72 })
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
  } catch {
    const safe = name.replace(/[<>&'"]/g, '').slice(0, 40)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect width="400" height="400" fill="#e8e8e8"/>
      <text x="200" y="190" text-anchor="middle" font-family="Arial" font-size="22" fill="#555">Gang sheet</text>
      <text x="200" y="230" text-anchor="middle" font-family="Arial" font-size="14" fill="#777">${safe}</text>
    </svg>`
    return sharp(Buffer.from(svg)).png().toBuffer()
  }
}
