/** Drive / download file name for a project JSON — uses the project/customer name. */
export function projectJsonFileName(projectName: string): string {
  const safe =
    projectName
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.ssp\.json$/i, '')
      .slice(0, 80) || 'Untitled'
  return `${safe}.ssp.json`
}

export function isProjectJsonFileName(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return lower === 'project.ssp.json' || lower.endsWith('.ssp.json')
}
