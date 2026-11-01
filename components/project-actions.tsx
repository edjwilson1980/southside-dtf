'use client'

import { useState } from 'react'
import { FolderOpen, Save } from 'lucide-react'
import { ReopenProjectDialog } from '@/components/reopen-project-dialog'
import type { ProjectOpenPath } from '@/lib/project/open-path'
import type { SspProject } from '@/lib/project/types'

type ProjectActionsProps = {
  onOpenProject: (
    project: SspProject,
    meta?: { folderId?: string; fileId?: string },
  ) => void | Promise<void>
  /** Writes `{Customer}.ssp.json` to Drive now, creating the job folder if needed. */
  onSaveProject?: () => void
  saveDisabled?: boolean
  saving?: boolean
  /** Staff page this bar sits on; projects for another builder open there instead. */
  hostPath?: ProjectOpenPath
}

/** Save Project / Reopen Project bar (top right) — SPEC E1. */
export function ProjectActions({ onOpenProject, onSaveProject, saveDisabled, saving, hostPath = '/shop' }: ProjectActionsProps) {
  const [reopenOpen, setReopenOpen] = useState(false)

  return (
    <>
      <div className="shop-utility-bar" aria-label="Project actions">
        {onSaveProject ? (
          <button
            type="button"
            className="sticker-job-btn"
            disabled={saveDisabled}
            title={saveDisabled && !saving ? 'Enter a customer name first' : undefined}
            onClick={onSaveProject}
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Project'}
          </button>
        ) : null}
        <button
          type="button"
          className="sticker-job-btn"
          onClick={() => setReopenOpen(true)}
        >
          <FolderOpen size={16} /> Reopen Project
        </button>
      </div>

      <ReopenProjectDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        onOpenProject={onOpenProject}
        hostPath={hostPath}
      />
    </>
  )
}
