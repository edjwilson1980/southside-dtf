import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { google } from 'googleapis'
import {
  createOAuthClient,
  isGoogleDriveConfigured,
  isGoogleDriveOAuthConfigured,
  isGoogleDriveServiceAccountConfigured,
} from '@/lib/google-drive'

export const runtime = 'nodejs'

type FinalizeBody = {
  driveFileId?: string
  orderNumber?: string
  renamePrefix?: string
}

function secretsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function driveAuth() {
  if (isGoogleDriveOAuthConfigured()) {
    const client = createOAuthClient()
    client.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!.trim(),
    })
    return client
  }
  if (!isGoogleDriveServiceAccountConfigured()) {
    throw new Error('Google Drive is not configured.')
  }
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL!.trim(),
    key: process.env.GOOGLE_DRIVE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  await auth.authorize()
  return auth
}

/**
 * Verify a Drive file after browser upload, optionally rename with order number.
 * Small JSON only — never receives file bytes.
 */
export async function POST(req: Request) {
  try {
    const expected = process.env.SSGS_COMMIT_SECRET?.trim() || process.env.RELAY_SHARED_SECRET?.trim()
    if (!expected) {
      return NextResponse.json({ error: 'Finalize secret is not configured.' }, { status: 503 })
    }
    const provided = req.headers.get('x-ssgs-secret')?.trim() || req.headers.get('x-ssdtf-signature')?.trim() || ''
    // For finalize we accept the shared secret header (same as commit). HMAC body verify is optional for this path.
    if (!provided || !secretsMatch(provided, expected)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not configured.' }, { status: 503 })
    }

    const body = (await req.json()) as FinalizeBody
    const fileId = String(body.driveFileId ?? '').trim()
    if (!fileId) {
      return NextResponse.json({ error: 'driveFileId is required.' }, { status: 400 })
    }

    const auth = await driveAuth()
    const drive = google.drive({ version: 'v3', auth })
    const meta = await drive.files.get({
      fileId,
      fields: 'id,name,size,webViewLink,parents',
      supportsAllDrives: true,
    })

    if (!meta.data.id) {
      return NextResponse.json({ error: 'Drive file not found.' }, { status: 404 })
    }
    if (Number(meta.data.size || 0) === 0) {
      return NextResponse.json({ error: 'Zero-byte upload.' }, { status: 400 })
    }

    let name = meta.data.name || fileId
    const orderNumber = String(body.orderNumber ?? '').trim().replace(/^#/, '')
    if (orderNumber && !name.startsWith(`#${orderNumber}__`)) {
      const nextName = `#${orderNumber}__${name}`.replace(/[\\/]+/g, '-')
      const updated = await drive.files.update({
        fileId,
        requestBody: { name: nextName },
        fields: 'id,name,size,webViewLink',
        supportsAllDrives: true,
      })
      name = updated.data.name || nextName
      return NextResponse.json({
        id: updated.data.id || fileId,
        name,
        size: Number(updated.data.size || meta.data.size || 0),
        webViewLink:
          updated.data.webViewLink ||
          meta.data.webViewLink ||
          `https://drive.google.com/file/d/${fileId}/view`,
      })
    }

    return NextResponse.json({
      id: meta.data.id,
      name,
      size: Number(meta.data.size || 0),
      webViewLink: meta.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not finalize Drive file.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
