import { NextResponse } from 'next/server'
import {
  createCustomerDriveFolder,
  createResumableUploadSessions,
  isGoogleDriveConfigured,
  type DriveUploadSpec,
} from '@/lib/google-drive'

export const runtime = 'nodejs'

type SessionBody = {
  customerName?: string
  stamp?: string
  files?: DriveUploadSpec[]
}

export async function POST(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Drive is not configured. Set GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, and GOOGLE_DRIVE_PARENT_FOLDER_ID.',
        },
        { status: 503 },
      )
    }

    const body = (await req.json()) as SessionBody
    const customerName = String(body.customerName ?? '').trim()
    const stamp = String(body.stamp ?? '').trim()
    const files = Array.isArray(body.files) ? body.files : []

    if (!customerName) {
      return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 })
    }
    if (!stamp) {
      return NextResponse.json({ error: 'Job stamp is required.' }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required.' }, { status: 400 })
    }
    for (const file of files) {
      if (!file?.name || !file?.mimeType || !Number.isFinite(file.size) || file.size <= 0) {
        return NextResponse.json({ error: 'Each file needs a name, mimeType, and size.' }, { status: 400 })
      }
    }

    const folder = await createCustomerDriveFolder(customerName, stamp)
    const uploads = await createResumableUploadSessions(folder.folderId, files)

    return NextResponse.json({
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderUrl: folder.folderUrl,
      uploads,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start Google Drive upload.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
