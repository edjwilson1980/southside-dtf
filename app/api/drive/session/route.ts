import { NextResponse } from 'next/server'
import {
  createCustomerDriveFolder,
  createResumableUploadSessions,
  isGoogleDriveConfigured,
  isGoogleDriveOAuthConfigured,
  uploadCutterFileToFolder,
  type DriveUploadSpec,
} from '@/lib/google-drive'

export const runtime = 'nodejs'

type SessionBody = {
  customerName?: string
  stamp?: string
  files?: DriveUploadSpec[]
  /** Small PLT text uploaded by the server into the same job folder. */
  cutterFile?: {
    name?: string
    content?: string
    mimeType?: string
  }
}

export async function POST(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Drive is not connected yet. Open /shop/connect-drive and sign in with the shop Gmail account, or set the Drive env vars on the host.',
        },
        { status: 503 },
      )
    }

    const body = (await req.json()) as SessionBody
    const customerName = String(body.customerName ?? '').trim()
    const stamp = String(body.stamp ?? '').trim()
    const files = Array.isArray(body.files) ? body.files : []
    const cutterName = String(body.cutterFile?.name ?? '').trim()
    const cutterContent = String(body.cutterFile?.content ?? '')
    const cutterMime = String(body.cutterFile?.mimeType ?? 'text/plain').trim() || 'text/plain'
    const wantsCutter = Boolean(body.cutterFile)

    if (!customerName) {
      return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 })
    }
    if (!stamp) {
      return NextResponse.json({ error: 'Job stamp is required.' }, { status: 400 })
    }
    if (files.length === 0 && !wantsCutter) {
      return NextResponse.json({ error: 'At least one file is required.' }, { status: 400 })
    }
    for (const file of files) {
      if (!file?.name || !file?.mimeType || !Number.isFinite(file.size) || file.size <= 0) {
        return NextResponse.json({ error: 'Each file needs a name, mimeType, and size.' }, { status: 400 })
      }
    }
    if (wantsCutter && (!cutterName || !cutterContent)) {
      return NextResponse.json({ error: 'Cutter file needs a name and content.' }, { status: 400 })
    }

    const folder = await createCustomerDriveFolder(customerName, stamp)
    const uploads = files.length > 0 ? await createResumableUploadSessions(folder.folderId, files) : []

    let cutter = null
    if (wantsCutter) {
      cutter = await uploadCutterFileToFolder(folder.folderId, cutterName, cutterContent, cutterMime)
    }

    return NextResponse.json({
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderUrl: folder.folderUrl,
      uploads,
      cutter,
      authMode: isGoogleDriveOAuthConfigured() ? 'oauth' : 'service-account',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start Google Drive upload.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
