import { NextResponse } from 'next/server'
import { isGoogleDriveConfigured, verifyDriveWriteAccess } from '@/lib/google-drive'

export const runtime = 'nodejs'

/** Auth smoke test — confirms a Google access token can be minted. */
export async function GET() {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Google Drive is not configured.' },
        { status: 503 },
      )
    }
    const result = await verifyDriveWriteAccess()
    return NextResponse.json({
      ok: true,
      mode: result.mode,
      folderId: result.folderId,
      folderUrl: result.folderUrl,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive health check failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
