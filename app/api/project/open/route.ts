import { NextResponse } from 'next/server'
import {
  downloadDriveFileText,
  findProjectFileByProjectId,
  isGoogleDriveConfigured,
} from '@/lib/google-drive'
import { isProjectSource } from '@/lib/project/driveTags'
import { PROJECT_FORMAT } from '@/lib/project/types'

export const runtime = 'nodejs'

/**
 * GET — staff: open a project by projectId (or Drive fileId).
 * Returns the JSON plus which page should load it (shop builder vs DTF stickers).
 */
export async function GET(req: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not connected yet.' }, { status: 503 })
    }

    const url = new URL(req.url)
    const projectId = (url.searchParams.get('projectId') || url.searchParams.get('id') || '').trim()
    const fileIdParam = (url.searchParams.get('fileId') || '').trim()

    if (!projectId && !fileIdParam) {
      return NextResponse.json({ error: 'projectId or fileId is required.' }, { status: 400 })
    }

    let fileId = fileIdParam
    let folderId: string | undefined
    if (!fileId && projectId) {
      const found = await findProjectFileByProjectId(projectId)
      if (!found?.id) {
        return NextResponse.json({ error: 'Project not found in Google Drive.' }, { status: 404 })
      }
      fileId = found.id
      folderId = found.parents?.[0]
    }

    const text = await downloadDriveFileText(fileId)
    const project = JSON.parse(text) as Record<string, unknown>
    if (project.format !== PROJECT_FORMAT) {
      return NextResponse.json({ error: 'This file is not a gang sheet project.' }, { status: 400 })
    }

    const source = isProjectSource(project.source) ? project.source : 'shop-builder'
    const openPath = source === 'dtf-stickers' ? '/shop/sticker-maker' : '/shop'

    return NextResponse.json({
      ok: true,
      project,
      source,
      openPath,
      fileId,
      folderId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open the project.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
