import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Proxies a browser file PUT to a Google Drive resumable upload URL.
 * Avoids browser→Google CORS (sessions started without Origin fail in Chrome).
 */
export async function PUT(req: Request) {
  try {
    const uploadUrl = req.headers.get('x-drive-upload-url')?.trim()
    if (!uploadUrl || !uploadUrl.startsWith('https://www.googleapis.com/upload/drive/')) {
      return NextResponse.json({ error: 'Missing or invalid Google Drive upload URL.' }, { status: 400 })
    }

    const contentType = req.headers.get('content-type')?.trim() || 'application/octet-stream'
    const bytes = Buffer.from(await req.arrayBuffer())
    if (bytes.length === 0) {
      return NextResponse.json({ error: 'Upload body is empty.' }, { status: 400 })
    }

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
      },
      body: bytes,
    })

    const detail = await putRes.text()
    if (!putRes.ok) {
      return NextResponse.json(
        { error: `Google Drive upload failed: ${detail || putRes.statusText}` },
        { status: 502 },
      )
    }

    let file = null
    try {
      file = detail ? JSON.parse(detail) : null
    } catch {
      file = null
    }

    const id = file?.id as string | undefined
    return NextResponse.json({
      ok: true,
      id,
      name: file?.name,
      webViewLink:
        (file?.webViewLink as string | undefined) ||
        (id ? `https://drive.google.com/file/d/${id}/view` : undefined),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not proxy Google Drive upload.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
