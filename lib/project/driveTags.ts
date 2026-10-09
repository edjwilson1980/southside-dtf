import type { ProjectSource, SspProject } from './types'

/** Drive appProperties tags for fast Reopen Project search (SPEC E5). */
export function projectDriveAppProperties(project: Pick<
  SspProject,
  'projectId' | 'source' | 'customer' | 'updatedAt'
> & { orderId?: string | null }): Record<string, string> {
  const orderId = project.orderId?.trim() || ''
  return {
    ssp_project_id: project.projectId,
    ssp_source: project.source,
    ssp_customer: (project.customer?.name || '').trim().toLowerCase(),
    ssp_email: (project.customer?.email || '').trim().toLowerCase(),
    ssp_order_id: orderId,
    ssp_updated: project.updatedAt || new Date().toISOString(),
  }
}

export function isProjectSource(value: unknown): value is ProjectSource {
  return value === 'shop-builder' || value === 'customer-site' || value === 'dtf-stickers'
}
