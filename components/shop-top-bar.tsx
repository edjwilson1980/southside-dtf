'use client'

import { ShopNav } from '@/components/shop-nav'
import { ProjectActions } from '@/components/project-actions'
import type { SspProject } from '@/lib/project/types'

const logoUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'

type ShopTopBarProps = {
  onOpenProject: (
    project: SspProject,
    meta?: { folderId?: string; fileId?: string },
  ) => void | Promise<void>
  /** Writes `{Customer}.ssp.json` to Drive now, creating the job folder if needed. */
  onSaveProject?: () => void
  saveDisabled?: boolean
  saving?: boolean
}

/** Shop Builder title row + Save / Reopen Project (top right) — SPEC E1. */
export function ShopTopBar({ onOpenProject, onSaveProject, saveDisabled, saving }: ShopTopBarProps) {
  return (
    <>
      <ProjectActions
        onOpenProject={onOpenProject}
        onSaveProject={onSaveProject}
        saveDisabled={saveDisabled}
        saving={saving}
      />

      <div className="builder-topbar">
        <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
        <div className="title-block">
          <h1>Shop Gang Sheet Tools</h1>
          <p className="lead">Production builder with cut files and marks.</p>
          <p className="sublead">Internal shop app — advanced features stay here, not on the customer builder.</p>
        </div>
        <ShopNav current="shop" />
      </div>
    </>
  )
}
