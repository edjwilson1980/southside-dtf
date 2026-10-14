import type { ProjectSource, SspProject } from './types'

/** Drive appProperties values max out at 124 bytes. */
function propValue(value: string, max = 120): string {
  return value.trim().slice(0, max)
}

/** Drive appProperties tags for fast Reopen Project search (SPEC E5). */
export function projectDriveAppProperties(project: Pick<
  SspProject,
  'projectId' | 'source' | 'customer' | 'updatedAt'
> & { orderId?: string | null }): Record<string, string> {
  const orderId = project.orderId?.trim() || ''
  return {
    ssp_project_id: propValue(project.projectId, 64),
    ssp_source: propValue(project.source, 32),
    ssp_customer: propValue((project.customer?.name || '').toLowerCase()),
    ssp_email: propValue((project.customer?.email || '').toLowerCase()),
    ssp_order_id: propValue(orderId, 32),
    ssp_updated: propValue(project.updatedAt || new Date().toISOString(), 40),
  }
}

export function isProjectSource(value: unknown): value is ProjectSource {
  return value === 'shop-builder' || value === 'customer-site' || value === 'dtf-stickers'
}
