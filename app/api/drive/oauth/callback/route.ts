import { NextResponse } from 'next/server'
import { exchangeDriveAuthCode } from '@/lib/google-drive'

export const runtime = 'nodejs'

function redirectUriFrom(req: Request) {
  const url = new URL(req.url)
  return `${url.origin}/api/drive/oauth/callback`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const oauthError = url.searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(new URL(`/shop/connect-drive?error=${encodeURIComponent(oauthError)}`, url.origin))
  }
  if (!code) {
    return NextResponse.redirect(new URL('/shop/connect-drive?error=missing_code', url.origin))
  }

  try {
    const tokens = await exchangeDriveAuthCode(redirectUriFrom(req), code)
    const refresh = tokens.refresh_token || ''
    // Show the token on the shop connect page so it can be pasted into host secrets.
    // Do not persist secrets in the repo.
    return NextResponse.redirect(
      new URL(`/shop/connect-drive?connected=1&refresh=${encodeURIComponent(refresh)}`, url.origin),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not finish Google Drive login.'
    return NextResponse.redirect(new URL(`/shop/connect-drive?error=${encodeURIComponent(message)}`, url.origin))
  }
}
