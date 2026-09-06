import { NextResponse } from 'next/server'
import { getDriveAuthUrl } from '@/lib/google-drive'

export const runtime = 'nodejs'

function redirectUriFrom(req: Request) {
  const url = new URL(req.url)
  return `${url.origin}/api/drive/oauth/callback`
}

export async function GET(req: Request) {
  try {
    if (!process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim() || !process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim()) {
      return NextResponse.json(
        {
          error:
            'OAuth client is not set. Add GOOGLE_DRIVE_OAUTH_CLIENT_ID and GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, then try again.',
        },
        { status: 503 },
      )
    }
    const authUrl = getDriveAuthUrl(redirectUriFrom(req))
    return NextResponse.redirect(authUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start Google Drive login.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
