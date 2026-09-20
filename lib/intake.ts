/** Types and builders for the customer artwork intake `job.json` contract. */

export type IntakeNeedsAttention = 'size-unknown' | 'low-dpi' | 'remove-background'

export type IntakeJobDesign = {
  file: string
  driveFileId: string
  placement: string
  size: string
  customWidth: string
  customHeight: string
  sizeUnknown: boolean
  quantity: number
  notes: string
  pixelWidth: number
  pixelHeight: number
  dpi: number
  removeBackground: boolean
  upscale: boolean
}

export type IntakeJobRecord = {
  v: 1
  jobId: string
  stamp: string
  submittedAt: string
  customer: {
    name: string
    email: string
    phone: string
  }
  orderNote: string
  precut: boolean
  estimate: {
    designs: number
    transfers: number
    billedLengthIn: number
    sheetPrice: number
    precutTotal: number
    total: number
  }
  needsAttention: IntakeNeedsAttention[]
  designs: IntakeJobDesign[]
}

export function intakeJobId(stamp: string) {
  return `SSD-${stamp}`
}

export function intakeFileName(index: number, originalName: string) {
  const safe = originalName.replace(/[^\w.\-()+ ]+/g, '_').trim() || 'artwork.png'
  return `${String(index + 1).padStart(2, '0')}-${safe}`
}

export function buildNeedsAttention(designs: Array<{
  sizeUnknown?: boolean
  upscale?: boolean
  removeBackground?: boolean
  dpi?: number
}>): IntakeNeedsAttention[] {
  const flags = new Set<IntakeNeedsAttention>()
  for (const design of designs) {
    if (design.sizeUnknown) flags.add('size-unknown')
    if (design.upscale || (design.dpi != null && design.dpi > 0 && design.dpi < 150)) flags.add('low-dpi')
    if (design.removeBackground) flags.add('remove-background')
  }
  return [...flags]
}

export function buildIntakeJobRecord(input: Omit<IntakeJobRecord, 'v' | 'jobId' | 'needsAttention'> & {
  needsAttention?: IntakeNeedsAttention[]
}): IntakeJobRecord {
  return {
    v: 1,
    jobId: intakeJobId(input.stamp),
    stamp: input.stamp,
    submittedAt: input.submittedAt,
    customer: input.customer,
    orderNote: input.orderNote,
    precut: input.precut,
    estimate: input.estimate,
    needsAttention: input.needsAttention ?? buildNeedsAttention(input.designs),
    designs: input.designs,
  }
}
