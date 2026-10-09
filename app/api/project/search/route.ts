import { NextResponse } from 'next/server'
import { isGoogleDriveConfigured, searchDriveProjects } from '@/lib/google-drive'
import { isProjectSource } from '@/lib/project/driveTags'
import type { ProjectSearchHit, ProjectSource } from '@/lib/project/types'

export const runtime = 'nodejs'

/** GET — staff: search projects by name / order / email / ID, filter by source (SPEC E5). */
export async function GET(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({
        ok: true,
        projects: [] as ProjectSearchHit[],
        driveConfigured: false,
      })
    }

    const url = new URL(req.url)
    const query = url.searchParams.get('q') || url.searchParams.get('query') || ''
    const sourceParam = url.searchParams.get('source') || 'all'
    const limit = Number(url.searchParams.get('limit') || 25)
    const source =
      sourceParam === 'all' || isProjectSource(sourceParam)
        ? sourceParam
        : 'all'

    const raw = await searchDriveProjects({
      query,
      source: source === 'all' ? undefined : source,
      limit: Number.isFinite(limit) ? limit : 25,
    })

    const projects: ProjectSearchHit[] = raw.map((item) => ({
      projectId: item.projectId,
      name: item.customerName || item.name || item.projectId,
      source: (isProjectSource(item.source) ? item.source : 'shop-builder') as ProjectSource,
      orderId: item.orderId || undefined,
      customerName: item.customerName,
      email: item.email,
      updatedAt: item.updatedAt,
      folderId: item.folderId,
      fileId: item.fileId,
      webViewLink: item.webViewLink,
    }))

    return NextResponse.json({ ok: true, projects, driveConfigured: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not search projects.'
    return NextResponse.json({ error: message, projects: [] }, { status: 500 })
  }
}
