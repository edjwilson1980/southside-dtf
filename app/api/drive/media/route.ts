import { NextResponse } from 'next/server'
import { downloadDriveFileBytes, isGoogleDriveConfigured } from '@/lib/google-drive'

export const runtime = 'nodejs'

/** GET — staff: stream a Drive file (design art) for project reopen. */
export async function GET(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })
    }

    const url = new URL(req.url)
    const fileId = (url.searchParams.get('fileId') || url.searchParams.get('id') || '').trim()
    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required.' }, { status: 400 })
    }

    const file = await downloadDriveFileBytes(fileId)
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${file.name.replace(/"/g, '')}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load Drive file.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
