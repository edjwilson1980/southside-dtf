'use client'

import { useEffect, useRef, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import {
  filterRecentProjects,
  listRecentProjects,
  rememberRecentProject,
} from '@/lib/project/recent'
import {
  PROJECT_SOURCE_LABEL,
  type ProjectSearchHit,
  type ProjectSource,
  type SspProject,
} from '@/lib/project/types'
import { PROJECT_FORMAT } from '@/lib/project/types'

type SourceFilter = 'all' | ProjectSource

type ReopenProjectDialogProps = {
  open: boolean
  onClose: () => void
  /** Called when a shop-builder / customer-site project should load into this page. */
  onOpenProject: (project: SspProject, meta?: { folderId?: string; fileId?: string }) => void
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ReopenProjectDialog({ open, onClose, onOpenProject }: ReopenProjectDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<SourceFilter>('all')
  const [paste, setPaste] = useState('')
  const [hits, setHits] = useState<ProjectSearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [driveConfigured, setDriveConfigured] = useState(true)

  useEffect(() => {
    if (!open) return
    setError(null)
    setHits(listRecentProjects(source))
    void runSearch('', source)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when dialog opens / source changes
  }, [open, source])

  async function runSearch(q: string, src: SourceFilter) {
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (src !== 'all') params.set('source', src)
      params.set('limit', '25')
      const res = await fetch(`/api/project/search?${params.toString()}`)
      const json = (await res.json()) as {
        error?: string
        projects?: ProjectSearchHit[]
        driveConfigured?: boolean
      }
      if (!res.ok) throw new Error(json.error || 'Search failed.')
      setDriveConfigured(json.driveConfigured !== false)
      const remote = json.projects || []
      if (remote.length > 0) {
        setHits(remote)
      } else {
        setHits(filterRecentProjects(q, src))
      }
    } catch (err) {
      setHits(filterRecentProjects(q, src))
      setError(err instanceof Error ? err.message : 'Could not search Drive — showing local recent.')
    } finally {
      setBusy(false)
    }
  }

  async function openHit(hit: ProjectSearchHit) {
    setBusy(true)
    setError(null)
    try {
      if (hit.source === 'dtf-stickers') {
        const params = new URLSearchParams()
        if (hit.projectId) params.set('projectId', hit.projectId)
        if (hit.fileId) params.set('fileId', hit.fileId)
        window.location.href = `/shop/sticker-maker?${params.toString()}`
        return
      }
      const params = new URLSearchParams()
      if (hit.projectId) params.set('projectId', hit.projectId)
      if (hit.fileId) params.set('fileId', hit.fileId)
      const res = await fetch(`/api/project/open?${params.toString()}`)
      const json = (await res.json()) as {
        error?: string
        project?: SspProject
        folderId?: string
        fileId?: string
        openPath?: string
        source?: ProjectSource
      }
      if (!res.ok || !json.project) throw new Error(json.error || 'Could not open project.')
      if (json.source === 'dtf-stickers' || json.openPath === '/shop/sticker-maker') {
        window.location.href = `/shop/sticker-maker?projectId=${encodeURIComponent(hit.projectId)}`
        return
      }
      rememberRecentProject(hit)
      onOpenProject(json.project, { folderId: json.folderId, fileId: json.fileId })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that project.')
    } finally {
      setBusy(false)
    }
  }

  async function openUploadedFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const text = await file.text()
      const project = JSON.parse(text) as SspProject
      if (project.format !== PROJECT_FORMAT) {
        throw new Error('This file is not a gang sheet project (.ssp.json).')
      }
      if (project.source === 'dtf-stickers') {
        try {
          sessionStorage.setItem('ssp.pending-project', text)
        } catch {
          // ignore
        }
        window.location.href = '/shop/sticker-maker?fromUpload=1'
        return
      }
      rememberRecentProject({
        projectId: project.projectId || `local_${Date.now()}`,
        name: project.name || file.name,
        source: project.source || 'shop-builder',
        customerName: project.customer?.name || project.name,
        email: project.customer?.email || undefined,
        updatedAt: project.updatedAt || new Date().toISOString(),
      })
      onOpenProject(project)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that project file.')
    } finally {
      setBusy(false)
    }
  }

  async function openPaste() {
    const value = paste.trim()
    if (!value) return
    if (value.startsWith('{')) {
      try {
        const project = JSON.parse(value) as SspProject
        if (project.format !== PROJECT_FORMAT) throw new Error('Not a project JSON.')
        if (project.source === 'dtf-stickers') {
          sessionStorage.setItem('ssp.pending-project', value)
          window.location.href = '/shop/sticker-maker?fromUpload=1'
          return
        }
        onOpenProject(project)
        onClose()
        return
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid project JSON.')
        return
      }
    }
    // Treat as project ID or Drive file link
    const idMatch = value.match(/prj_[a-z0-9]+/i)
    const fileMatch = value.match(/\/d\/([a-zA-Z0-9_-]+)/)
    const projectId = idMatch?.[0] || (/^prj_/i.test(value) ? value : '')
    const fileId = fileMatch?.[1] || (!projectId && !value.includes('/') ? value : '')
    await openHit({
      projectId: projectId || fileId,
      name: projectId || fileId,
      source: 'shop-builder',
      updatedAt: new Date().toISOString(),
      fileId: fileId || undefined,
    })
  }

  if (!open) return null

  return (
    <div
      className="reopen-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="reopen-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-project-title"
      >
        <header className="reopen-dialog-header">
          <h2 id="reopen-project-title">
            <FolderOpen size={18} aria-hidden /> Reopen Project
          </h2>
          <button type="button" className="reopen-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="reopen-field">
          Search
          <input
            type="search"
            placeholder="Customer name, order #, email or project ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch(query, source)
            }}
          />
        </label>

        <fieldset className="reopen-source">
          <legend>Source</legend>
          {(
            [
              ['all', 'All'],
              ['shop-builder', 'Shop Builder'],
              ['customer-site', 'Customer site'],
              ['dtf-stickers', 'DTF Stickers'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="reopen-source"
                checked={source === value}
                onChange={() => setSource(value)}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>

        <div className="reopen-actions-row">
          <button
            type="button"
            className="sticker-job-btn"
            disabled={busy}
            onClick={() => void runSearch(query, source)}
          >
            {busy ? 'Searching…' : 'Search'}
          </button>
          {!driveConfigured && (
            <span className="reopen-hint">Drive not connected — showing local recent only.</span>
          )}
        </div>

        <div className="reopen-recent">
          <h3>Recent</h3>
          {hits.length === 0 ? (
            <p className="reopen-empty">No projects yet. Upload a .ssp.json or build a job to Drive.</p>
          ) : (
            <ul>
              {hits.map((hit) => (
                <li key={`${hit.projectId}-${hit.fileId || ''}`}>
                  <button type="button" disabled={busy} onClick={() => void openHit(hit)}>
                    <strong>{hit.name || hit.customerName || hit.projectId}</strong>
                    <span>{PROJECT_SOURCE_LABEL[hit.source] || hit.source}</span>
                    <span>{hit.orderId ? `Order #${hit.orderId}` : '—'}</span>
                    <span>{formatWhen(hit.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="reopen-footer-tools">
          <button
            type="button"
            className="sticker-job-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload .ssp.json file
          </button>
          <label className="reopen-field reopen-paste">
            Paste project link / ID
            <span className="reopen-paste-row">
              <input
                type="text"
                placeholder="prj_… or Drive link"
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void openPaste()
                }}
              />
              <button type="button" className="sticker-job-btn" disabled={busy} onClick={() => void openPaste()}>
                Open
              </button>
            </span>
          </label>
        </div>

        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".json,.ssp.json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void openUploadedFile(file)
            event.target.value = ''
          }}
        />

        {error && <p className="reopen-error">{error}</p>}
      </section>
    </div>
  )
}
