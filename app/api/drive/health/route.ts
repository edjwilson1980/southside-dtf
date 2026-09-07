import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import {
  createOAuthClient,
  isGoogleDriveConfigured,
  isGoogleDriveOAuthConfigured,
  isGoogleDriveServiceAccountConfigured,
} from '@/lib/google-drive'

export const runtime = 'nodejs'

async function mintAccessToken() {
  if (isGoogleDriveOAuthConfigured()) {
    const client = createOAuthClient()
    client.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!.trim(),
    })
    const token = await client.getAccessToken()
    const accessToken = typeof token === 'string' ? token : token?.token
    if (!accessToken) throw new Error('Could not mint a Google access token.')
    return { mode: 'oauth' as const }
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
  const token = await auth.getAccessToken()
  const accessToken = typeof token === 'string' ? token : token?.token
  if (!accessToken) throw new Error('Could not mint a Google access token.')
  return { mode: 'service-account' as const }
}

/** Auth smoke test — confirms a Google access token can be minted. */
export async function GET() {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Google Drive is not configured.' },
        { status: 503 },
      )
    }
    const result = await mintAccessToken()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive health check failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
