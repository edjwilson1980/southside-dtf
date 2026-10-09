import { NextResponse } from 'next/server'
import {
  isGoogleDriveConfigured,
  uploadBufferToFolder,
  uploadCutterFileToFolder,
  upsertTextFileInFolder,
} from '@/lib/google-drive'
import { signProjectPayload } from '@/lib/project/sign'
import { PROJECT_FORMAT, PROJECT_JSON_NAME } from '@/lib/project/types'

export const runtime = 'nodejs'

type Body = {
  folderId?: string
  content?: string
  name?: string
  mimeType?: string
  /** utf8 (default) for job.json / text; base64 for PDF and other binaries. */
  encoding?: 'utf8' | 'base64'
  appProperties?: Record<string, string>
  upsert?: boolean
}

function maybeSignProjectJson(name: string, content: string): string {
  if (name !== PROJECT_JSON_NAME) return content
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (parsed.format !== PROJECT_FORMAT) return content
    const sig = signProjectPayload(parsed)
    if (!sig) return content
    return JSON.stringify({ ...parsed, sig }, null, 2)
  } catch {
    return content
  }
}

/** Writes a small file (job.json, project.ssp.json, or work-order PDF) into an existing Drive job folder. */
export async function POST(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })
    }

    const body = (await req.json()) as Body
    const folderId = String(body.folderId ?? '').trim()
    let content = String(body.content ?? '')
    const name = String(body.name ?? 'job.json').trim() || 'job.json'
    const encoding = body.encoding === 'base64' ? 'base64' : 'utf8'
    const mimeType =
      String(body.mimeType ?? '').trim() ||
      (name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : name.toLowerCase().endsWith('.json')
          ? 'application/json'
          : 'text/plain')
    const upsert = body.upsert !== false
    const appProperties =
      body.appProperties && typeof body.appProperties === 'object'
        ? Object.fromEntries(
            Object.entries(body.appProperties)
              .filter(([, value]) => value != null)
              .map(([key, value]) => [key, String(value)]),
          )
        : undefined

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required.' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'File content is required.' }, { status: 400 })
    }

    if (encoding === 'utf8' && name.toLowerCase().endsWith('.json')) {
      content = maybeSignProjectJson(name, content)
    }

    const file =
      encoding === 'base64'
        ? await uploadBufferToFolder(folderId, name, Buffer.from(content, 'base64'), mimeType)
        : upsert && mimeType === 'application/json'
          ? await upsertTextFileInFolder(folderId, name, content, mimeType, appProperties)
          : await uploadCutterFileToFolder(folderId, name, content, mimeType)

    if (encoding === 'base64' && appProperties) {
      // Binary uploads skip upsert path — properties set only for JSON upserts above.
    }

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
