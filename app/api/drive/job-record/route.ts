import { NextResponse } from 'next/server'
import {
  isGoogleDriveConfigured,
  uploadBufferToFolder,
  uploadCutterFileToFolder,
} from '@/lib/google-drive'

export const runtime = 'nodejs'

type Body = {
  folderId?: string
  content?: string
  name?: string
  mimeType?: string
  /** utf8 (default) for job.json / text; base64 for PDF and other binaries. */
  encoding?: 'utf8' | 'base64'
}

/** Writes a small file (job.json or work-order PDF) into an existing Drive job folder. */
export async function POST(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })
    }

    const body = (await req.json()) as Body
    const folderId = String(body.folderId ?? '').trim()
    const content = String(body.content ?? '')
    const name = String(body.name ?? 'job.json').trim() || 'job.json'
    const encoding = body.encoding === 'base64' ? 'base64' : 'utf8'
    const mimeType =
      String(body.mimeType ?? '').trim() ||
      (name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : name.toLowerCase().endsWith('.json')
          ? 'application/json'
          : 'text/plain')

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required.' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'File content is required.' }, { status: 400 })
    }

    const file =
      encoding === 'base64'
        ? await uploadBufferToFolder(folderId, name, Buffer.from(content, 'base64'), mimeType)
        : await uploadCutterFileToFolder(folderId, name, content, mimeType)

    return NextResponse.json({
      ok: true,
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not write file to Google Drive.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
