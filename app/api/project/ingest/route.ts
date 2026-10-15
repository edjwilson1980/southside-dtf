import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { isGoogleDriveConfigured } from '@/lib/google-drive'
import { IngestError, ingestProject } from '@/lib/server/ingest-project'
import type { SspProject } from '@/lib/project/types'

export const runtime = 'nodejs'
// Long sheets: trimming, compositing, CMYK mapping and the Drive upload take a while.
export const maxDuration = 300

/** Projects come by URL: with embedded art they are far over the 4.5 MB request limit. */
const MAX_PROJECT_BYTES = 200 * 1024 * 1024

function secretsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Server-side Confirm & Build, for Mockup Pro: fetch a `.ssp.json` project,
 * build the print-ready gang sheet (PNG, plus PLT when pre-cut) and save it in
 * a new Google Drive job folder with the project JSON — no browser involved.
 * Auth: header `x-ssgs-ingest-secret` = MOCKUP_PRO_INGEST_SECRET.
 */
export async function POST(req: Request) {
  const expected = process.env.MOCKUP_PRO_INGEST_SECRET?.trim()
  if (!expected) return NextResponse.json({ error: 'Ingest is not configured.' }, { status: 503 })
  if (!secretsMatch(req.headers.get('x-ssgs-ingest-secret') ?? '', expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  if (!isGoogleDriveConfigured()) return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })

  let body: { projectUrl?: string; stamp?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Send JSON: { projectUrl }.' }, { status: 400 })
  }
  const url = String(body.projectUrl ?? '')
  if (!/^https:\/\//i.test(url)) return NextResponse.json({ error: 'projectUrl must be an https URL.' }, { status: 400 })

  let project: SspProject
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`the project URL answered ${res.status}`)
    const size = Number(res.headers.get('content-length') || 0)
    if (size > MAX_PROJECT_BYTES) throw new Error('the project file is too large')
    project = (await res.json()) as SspProject
  } catch (err) {
    return NextResponse.json({ error: `Could not read the project: ${err instanceof Error ? err.message : 'fetch failed'}` }, { status: 400 })
  }

  try {
    const result = await ingestProject(project, { stamp: body.stamp?.trim() || undefined })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not build the gang sheet.'
    console.error('[ingest] failed:', message)
    return NextResponse.json({ error: message }, { status: err instanceof IngestError ? 422 : 500 })
  }
}
