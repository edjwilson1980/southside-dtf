import { NextResponse } from 'next/server'
import { isGoogleDriveConfigured, verifyDriveWriteAccess } from '@/lib/google-drive'

export const runtime = 'nodejs'

export async function POST() {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        { error: 'Google Drive is not configured yet. Finish the connect steps first.' },
        { status: 503 },
      )
    }
    const result = await verifyDriveWriteAccess()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive write check failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
