import { NextResponse } from 'next/server'
import {
  formatSignedNumber,
  signUploadMeasure,
  uploadSignSecret,
} from '@/lib/upload-sign'

export const runtime = 'nodejs'

type Body = {
  drive_file_id?: string
  width_in?: number | string
  length_in?: number | string
  dpi?: number | string
  filename?: string
}

/** Sign measured dimensions + Drive file id for Woo cart verification. */
export async function POST(req: Request) {
  try {
    const secret = uploadSignSecret()
    if (!secret) {
      return NextResponse.json({ error: 'Upload signing is not configured.' }, { status: 503 })
    }

    const body = (await req.json()) as Body
    const driveFileId = String(body.drive_file_id ?? '').trim()
    const filename = String(body.filename ?? '').trim()
    const widthNum = Number(body.width_in)
    const lengthNum = Number(body.length_in)
    const dpiNum = Number(body.dpi)

    if (!driveFileId || !filename) {
      return NextResponse.json({ error: 'drive_file_id and filename are required.' }, { status: 400 })
    }
    if (!(widthNum > 0) || !(lengthNum > 0) || !(dpiNum > 0)) {
      return NextResponse.json({ error: 'width_in, length_in, and dpi must be positive.' }, { status: 400 })
    }

    // Prefer caller-supplied transport strings when already formatted.
    const width_in =
      typeof body.width_in === 'string' && body.width_in.trim()
        ? body.width_in.trim()
        : formatSignedNumber(widthNum)
    const length_in =
      typeof body.length_in === 'string' && body.length_in.trim()
        ? body.length_in.trim()
        : formatSignedNumber(lengthNum)
    const dpi =
      typeof body.dpi === 'string' && body.dpi.trim()
        ? body.dpi.trim()
        : String(Math.round(dpiNum))

    const exp = String(Math.floor(Date.now() / 1000) + 60 * 60) // 1 hour
    const signed = signUploadMeasure(secret, {
      drive_file_id: driveFileId,
      width_in,
      length_in,
      dpi,
      filename,
      exp,
    })

    return NextResponse.json(signed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not sign the upload measure.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
