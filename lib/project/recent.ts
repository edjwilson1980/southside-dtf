import type { ProjectSearchHit, ProjectSource } from './types'
import { isProjectSource } from './driveTags'

const STORAGE_KEY = 'ssp.recent-projects.v1'
const MAX_RECENT = 25

function readAll(): ProjectSearchHit[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ProjectSearchHit[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.projectId === 'string' && isProjectSource(item.source))
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeAll(items: ProjectSearchHit[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))
  } catch {
    // Quota / private mode — ignore.
  }
}

export function listRecentProjects(source?: ProjectSource | 'all'): ProjectSearchHit[] {
  const all = readAll().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  if (!source || source === 'all') return all
  return all.filter((item) => item.source === source)
}

export function rememberRecentProject(hit: ProjectSearchHit) {
  const next = [hit, ...readAll().filter((item) => item.projectId !== hit.projectId)].slice(
    0,
    MAX_RECENT,
  )
  writeAll(next)
}

export function filterRecentProjects(
  query: string,
  source?: ProjectSource | 'all',
): ProjectSearchHit[] {
  const q = query.trim().toLowerCase()
  const base = listRecentProjects(source)
  if (!q) return base
  return base.filter((item) => {
    const hay = [
      item.name,
      item.customerName,
      item.email,
      item.orderId,
      item.projectId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
