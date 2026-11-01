'use client'

import { useEffect, useRef } from 'react'
import { PENDING_PROJECT_KEY } from './open-path'
import type { SspProject } from './types'

type OpenMeta = { folderId?: string; fileId?: string }

/**
 * One-shot: load a project handed to this page by Reopen Project on another page —
 * a pending uploaded/pasted JSON in sessionStorage, or `?projectId=` / `?fileId=`.
 */
export function useOpenProjectFromUrl(
  open: (project: SspProject, meta?: OpenMeta) => void | Promise<void>,
  onError: (message: string) => void,
  enabled = true,
) {
  const done = useRef(false)
  useEffect(() => {
    if (!enabled || done.current) return
    done.current = true
    void (async () => {
      try {
        const pending = sessionStorage.getItem(PENDING_PROJECT_KEY)
        if (pending) {
          sessionStorage.removeItem(PENDING_PROJECT_KEY)
          await open(JSON.parse(pending) as SspProject)
          return
        }
      } catch {
        // ignore
      }
      const params = new URLSearchParams(window.location.search)
      const projectId = params.get('projectId')
      const fileId = params.get('fileId')
      if (!projectId && !fileId) return
      try {
        const qs = new URLSearchParams()
        if (projectId) qs.set('projectId', projectId)
        if (fileId) qs.set('fileId', fileId)
        const res = await fetch(`/api/project/open?${qs.toString()}`)
        const json = (await res.json()) as { error?: string; project?: SspProject; folderId?: string; fileId?: string }
        if (!res.ok || !json.project) throw new Error(json.error || 'Could not open project.')
        await open(json.project, { folderId: json.folderId, fileId: json.fileId })
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not open project from Drive.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link / pending upload
  }, [enabled])
}
