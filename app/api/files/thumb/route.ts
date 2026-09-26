import { NextResponse } from 'next/server'
import { makeThumbPng, verifyThumbToken } from '@/lib/files-relay'

export const runtime = 'nodejs'

/** HMAC-token thumbnail — never expose Drive URLs to the browser. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t') || ''
    const verified = verifyThumbToken(token)
    if (!verified) {
      return NextResponse.json({ error: 'Invalid or expired thumbnail token.' }, { status: 403 })
    }

    const png = await makeThumbPng(verified.driveFileId)
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not make thumbnail.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
