import { NextResponse } from 'next/server'
import { archiveDriveFile, parseSignedJsonBody } from '@/lib/files-relay'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const sig = req.headers.get('x-ssgs-signature') || req.headers.get('x-ssdtf-signature')
    const parsed = parseSignedJsonBody<{ drive_file_id?: string; ts?: number }>(rawBody, sig)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const driveFileId = String(parsed.data.drive_file_id || '').trim()
    if (!driveFileId) {
      return NextResponse.json({ error: 'drive_file_id is required.' }, { status: 400 })
    }
    const result = await archiveDriveFile(driveFileId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archive failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
