import { NextResponse } from 'next/server'
import {
  isGoogleDriveConfigured,
  uploadCutterFileToFolder,
} from '@/lib/google-drive'

export const runtime = 'nodejs'

type Body = {
  folderId?: string
  content?: string
  name?: string
}

/** Writes `job.json` into an existing Drive job folder after the art uploads. */
export async function POST(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })
    }

    const body = (await req.json()) as Body
    const folderId = String(body.folderId ?? '').trim()
    const content = String(body.content ?? '')
    const name = String(body.name ?? 'job.json').trim() || 'job.json'

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required.' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'job.json content is required.' }, { status: 400 })
    }

    const file = await uploadCutterFileToFolder(folderId, name, content, 'application/json')
    return NextResponse.json({
      ok: true,
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not write job.json to Google Drive.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
