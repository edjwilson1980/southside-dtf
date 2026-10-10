'use client'

import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { ShopNav } from '@/components/shop-nav'
import { ReopenProjectDialog } from '@/components/reopen-project-dialog'
import type { SspProject } from '@/lib/project/types'

const logoUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'

type ShopTopBarProps = {
  onOpenProject: (project: SspProject, meta?: { folderId?: string; fileId?: string }) => void
}

/** Shop Builder title row + Reopen Project (top right) — SPEC E1. */
export function ShopTopBar({ onOpenProject }: ShopTopBarProps) {
  const [reopenOpen, setReopenOpen] = useState(false)

  return (
    <>
      <div className="shop-utility-bar" aria-label="Project actions">
        <button
          type="button"
          className="sticker-job-btn"
          onClick={() => setReopenOpen(true)}
        >
          <FolderOpen size={16} /> Reopen Project
        </button>
      </div>

      <div className="builder-topbar">
        <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
        <div className="title-block">
          <h1>Shop Gang Sheet Tools</h1>
          <p className="lead">Production builder with cut files and marks.</p>
          <p className="sublead">Internal shop app — advanced features stay here, not on the customer builder.</p>
        </div>
        <ShopNav current="shop" />
      </div>

      <ReopenProjectDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        onOpenProject={onOpenProject}
      />
    </>
  )
}
