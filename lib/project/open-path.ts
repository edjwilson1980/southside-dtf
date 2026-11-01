/** Staff page that edits a project: sticker jobs, UV DTF gang sheets, or DTF gang sheets. */
export type ProjectOpenPath = '/shop' | '/shop/uv-dtf' | '/shop/sticker-maker'

/** sessionStorage key for a project handed to another page (uploaded / pasted JSON). */
export const PENDING_PROJECT_KEY = 'ssp.pending-project'

export function projectOpenPath(project: { source?: unknown; product?: unknown }): ProjectOpenPath {
  if (project.source === 'dtf-stickers') return '/shop/sticker-maker'
  const product = project.product as { printType?: unknown } | null | undefined
  if (product?.printType === 'uv-dtf') return '/shop/uv-dtf'
  return '/shop'
}
