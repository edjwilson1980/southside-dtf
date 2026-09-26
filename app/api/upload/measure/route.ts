import { NextResponse } from 'next/server'
import { measureUploadBuffer } from '@/lib/upload-measure-server'

export const runtime = 'nodejs'

/** Measure an upload gang sheet (PNG / PDF / AI) for pricing — no Drive write. */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'An image or PDF file is required.' }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    if (!buffer.length) {
      return NextResponse.json({ error: 'The file was empty.' }, { status: 400 })
    }

    const measured = await measureUploadBuffer(buffer, file.name, file.type || '')
    if (measured.error) {
      return NextResponse.json({ error: measured.error, ...measured }, { status: 400 })
    }
    return NextResponse.json(measured)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not measure that file.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
