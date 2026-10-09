/**
 * SPEC E4 — refuse a staff save when the live Drive revision is newer
 * than the revision staff opened with.
 */
export function assertRevisionUnchanged(options: {
  openedRevision: number
  liveRevision: number
}): void {
  if (options.liveRevision > options.openedRevision) {
    throw new Error(
      'This project was changed by the customer since you opened it. Reload to see their changes.',
    )
  }
}

export function nextRevision(current: number | undefined | null): number {
  const n = Number(current)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n) + 1
}
