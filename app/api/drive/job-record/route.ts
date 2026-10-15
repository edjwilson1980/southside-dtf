import { NextResponse } from 'next/server'
import {
  createCustomerDriveFolder,
  isGoogleDriveConfigured,
  uploadBufferToFolder,
  uploadCutterFileToFolder,
  upsertTextFileInFolder,
} from '@/lib/google-drive'
import { isProjectJsonFileName } from '@/lib/project/file-name'
import { signProjectJsonContent } from '@/lib/project/sign'

export const runtime = 'nodejs'
export const maxDuration = 60

type Body = {
  folderId?: string
  /** Create the customer job folder first when no folder exists yet (Save Job before build). */
  createFolder?: { customerName?: string; stamp?: string }
  content?: string
  name?: string
  mimeType?: string
  /** utf8 (default) for job.json / text; base64 for PDF and other binaries. */
  encoding?: 'utf8' | 'base64'
  appProperties?: Record<string, string>
  upsert?: boolean
}

function maybeSignProjectJson(name: string, content: string): string {
  return isProjectJsonFileName(name) ? signProjectJsonContent(content) : content
}

/** Writes a small file (job.json, project.ssp.json, or work-order PDF) into a Drive job folder. */
export async function POST(req: Request) {
  let fileName = 'job.json'
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })
    }

    const body = (await req.json()) as Body
    let folderId = String(body.folderId ?? '').trim()
    let content = String(body.content ?? '')
    const name = String(body.name ?? 'job.json').trim() || 'job.json'
    fileName = name
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
              .filter(([, value]) => value != null && String(value).trim() !== '')
              .map(([key, value]) => [key, String(value)]),
          )
        : undefined

    if (!content) {
      return NextResponse.json({ error: 'File content is required.' }, { status: 400 })
    }

    let folderUrl: string | undefined
    let folderName: string | undefined
    if (!folderId) {
      const customerName = String(body.createFolder?.customerName ?? '').trim()
      const stamp = String(body.createFolder?.stamp ?? '').trim()
      if (!customerName || !stamp) {
        return NextResponse.json(
          { error: 'folderId is required (or createFolder with customerName and stamp).' },
          { status: 400 },
        )
      }
      const folder = await createCustomerDriveFolder(customerName, stamp)
      folderId = folder.folderId
      folderUrl = folder.folderUrl
      folderName = folder.folderName
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

    return NextResponse.json({
      ok: true,
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
      folderId,
      folderUrl: folderUrl || `https://drive.google.com/drive/folders/${folderId}`,
      folderName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not write file to Google Drive.'
    console.error('[drive/job-record] failed', { fileName, message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
