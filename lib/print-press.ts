/**
 * Print & Press add-on: we press the customer's transfers onto garments they
 * supply. Labor only — the transfers themselves are bought on the gang sheet.
 * Pre-cutting is included (the labor price covers the crew cutting every
 * transfer), so a Print & Press job never bills the builder's pre-cut fee.
 */

export type PrintPressTier = {
  label: string
  min: number
  max: number
  /** Per garment for the first side pressed (front or back). */
  firstSide: number
  /** Added per garment that gets a second side (flip, reposition, press again). */
  secondSide: number
}

export const PRINT_PRESS_TIERS: PrintPressTier[] = [
  { label: '1–10', min: 1, max: 10, firstSide: 10, secondSide: 2 },
  { label: '11–20', min: 11, max: 20, firstSide: 5, secondSide: 1.5 },
  { label: '21–50', min: 21, max: 50, firstSide: 3, secondSide: 1.25 },
  { label: '51–99', min: 51, max: 99, firstSide: 2, secondSide: 1 },
  { label: '100+', min: 100, max: Infinity, firstSide: 1.5, secondSide: 0.75 },
]

/** Sorting / matching fee per personalized garment ("JONES" on Jones's shirt). */
export const PRINT_PRESS_NAME_FEE = 0.5

export const PRINT_PRESS_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const
export type PrintPressSize = (typeof PRINT_PRESS_SIZES)[number]

export type PrintPressLocation = 'front' | 'back' | 'both'

export const PRINT_PRESS_LOCATIONS: Array<{ value: PrintPressLocation; label: string }> = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'both', label: 'Front + Back' },
]

export const PRINT_PRESS_GARMENTS = [
  { value: 'tshirt', label: 'T-shirt' },
  { value: 'hoodie', label: 'Hoodie' },
] as const

export const PRINT_PRESS_COLORS = ['Black', 'White', 'Navy', 'Red', 'Gray', 'Other'] as const

/** One row of the customer's garment count. */
export type PrintPressLine = {
  id: number
  garment: string
  color: string
  location: PrintPressLocation
  /** Quantity per size, kept as the typed string so the inputs stay editable. */
  sizes: Record<PrintPressSize, string>
  /** Personalized garments on this line when no roster is pasted. */
  names: string
  /** One name per line; wins over `names` when present. */
  roster: string
  /** Builder design id pressed on the front (null until chosen). */
  frontDesign: number | null
  backDesign: number | null
}

export function emptyPrintPressSizes(): Record<PrintPressSize, string> {
  return { S: '', M: '', L: '', XL: '', '2XL': '', '3XL': '' }
}

export function newPrintPressLine(id: number, patch: Partial<PrintPressLine> = {}): PrintPressLine {
  return {
    id,
    garment: 'tshirt',
    color: 'Black',
    location: 'front',
    sizes: emptyPrintPressSizes(),
    names: '',
    roster: '',
    frontDesign: null,
    backDesign: null,
    ...patch,
  }
}

export function toCount(value: string | number | undefined | null) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function rosterNames(line: Pick<PrintPressLine, 'roster'>) {
  return line.roster
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
}

export function lineGarments(line: Pick<PrintPressLine, 'sizes'>) {
  return PRINT_PRESS_SIZES.reduce((sum, size) => sum + toCount(line.sizes[size]), 0)
}

/** Personalized garments on a line: the roster when pasted, else the typed count, capped at the garments. */
export function linePersonalized(line: PrintPressLine) {
  const total = lineGarments(line)
  const listed = rosterNames(line).length
  return Math.min(total, listed > 0 ? listed : toCount(line.names))
}

export function printPressTierFor(garments: number) {
  return PRINT_PRESS_TIERS.find((tier) => garments >= tier.min && garments <= tier.max) ?? PRINT_PRESS_TIERS[0]
}

export function printPressLocationLabel(location: PrintPressLocation) {
  return PRINT_PRESS_LOCATIONS.find((item) => item.value === location)?.label ?? location
}

export function printPressGarmentLabel(garment: string) {
  return PRINT_PRESS_GARMENTS.find((item) => item.value === garment)?.label ?? garment
}

export function lineNeedsFront(line: Pick<PrintPressLine, 'location'>) {
  return line.location !== 'back'
}

export function lineNeedsBack(line: Pick<PrintPressLine, 'location'>) {
  return line.location !== 'front'
}

/**
 * Transfers each design must supply for the garments: a design on the front of
 * 50 shirts and the back of 12 hoodies needs 62 pieces on the gang sheet.
 */
export function printPressDesignDemand(lines: PrintPressLine[]) {
  const demand = new Map<number, number>()
  for (const line of lines) {
    const qty = lineGarments(line)
    if (qty <= 0) continue
    if (lineNeedsFront(line) && line.frontDesign !== null) {
      demand.set(line.frontDesign, (demand.get(line.frontDesign) ?? 0) + qty)
    }
    if (lineNeedsBack(line) && line.backDesign !== null) {
      demand.set(line.backDesign, (demand.get(line.backDesign) ?? 0) + qty)
    }
  }
  return demand
}

export type PrintPressTotals = {
  garments: number
  tier: PrintPressTier
  /** Garments pressed on both sides. */
  doublePress: number
  frontTransfers: number
  backTransfers: number
  personalized: number
  firstPress: number
  secondPress: number
  nameFee: number
  labor: number
  /** Front / back image slots still empty. */
  missingDesigns: number
  /** Lines with no garments counted. */
  emptyLines: number
}

export function printPressTotals(lines: PrintPressLine[], namesOn: boolean): PrintPressTotals {
  const garments = lines.reduce((sum, line) => sum + lineGarments(line), 0)
  const tier = printPressTierFor(garments)
  const doublePress = lines.filter((line) => line.location === 'both').reduce((sum, line) => sum + lineGarments(line), 0)
  const frontTransfers = lines.filter(lineNeedsFront).reduce((sum, line) => sum + lineGarments(line), 0)
  const backTransfers = lines.filter(lineNeedsBack).reduce((sum, line) => sum + lineGarments(line), 0)
  const personalized = namesOn ? lines.reduce((sum, line) => sum + linePersonalized(line), 0) : 0
  const firstPress = round2(garments * tier.firstSide)
  const secondPress = round2(doublePress * tier.secondSide)
  const nameFee = round2(personalized * PRINT_PRESS_NAME_FEE)
  const missingDesigns = lines.reduce(
    (count, line) =>
      count +
      (lineNeedsFront(line) && line.frontDesign === null ? 1 : 0) +
      (lineNeedsBack(line) && line.backDesign === null ? 1 : 0),
    0,
  )
  const emptyLines = lines.filter((line) => lineGarments(line) === 0).length
  return {
    garments,
    tier,
    doublePress,
    frontTransfers,
    backTransfers,
    personalized,
    firstPress,
    secondPress,
    nameFee,
    labor: round2(firstPress + secondPress + nameFee),
    missingDesigns,
    emptyLines,
  }
}

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function money(value: number) {
  return `$${value.toFixed(2)}`
}

/** What blocks Add to Cart, in the words shown to the customer. */
export function printPressProblem(lines: PrintPressLine[], namesOn: boolean, designIds: number[]): string | null {
  const totals = printPressTotals(lines, namesOn)
  if (lines.length === 0 || totals.garments === 0) {
    return 'Enter how many garments you have on at least one Print & Press line.'
  }
  if (totals.emptyLines > 0) {
    return `${totals.emptyLines} Print & Press line${totals.emptyLines === 1 ? ' has' : 's have'} no garments — add sizes or remove the line.`
  }
  if (totals.missingDesigns > 0) {
    return `${totals.missingDesigns} Front / Back image slot${totals.missingDesigns === 1 ? ' is' : 's are'} empty — choose a design for every side.`
  }
  const known = new Set(designIds)
  for (const line of lines) {
    if (lineNeedsFront(line) && line.frontDesign !== null && !known.has(line.frontDesign)) {
      return 'A Print & Press line points at a design that was removed. Pick the front image again.'
    }
    if (lineNeedsBack(line) && line.backDesign !== null && !known.has(line.backDesign)) {
      return 'A Print & Press line points at a design that was removed. Pick the back image again.'
    }
  }
  return null
}

/** Compact, serialisable summary carried in the cart payload and project JSON. */
export type PrintPressCartLine = {
  garment: string
  color: string
  location: PrintPressLocation
  sizes: Partial<Record<PrintPressSize, number>>
  quantity: number
  personalized: number
  roster: string[]
  /** Design numbers (1-based, as printed on the sheet), not internal ids. */
  frontDesign: number | null
  backDesign: number | null
  frontDesignName?: string
  backDesignName?: string
}

export type PrintPressCartSummary = {
  garments: number
  tier: string
  firstSideEach: number
  secondSideEach: number
  nameFeeEach: number
  doublePress: number
  personalized: number
  firstPress: number
  secondPress: number
  nameFee: number
  /** Total labor charged for the job. */
  labor: number
  lines: PrintPressCartLine[]
  /** Drive link + name for the press sheet PDF, when it uploaded. */
  pressSheetUrl?: string
  pressSheetFileId?: string
  pressSheetFileName?: string
}

export function printPressCartSummary(
  lines: PrintPressLine[],
  namesOn: boolean,
  designInfo: (id: number) => { number: number; name: string } | undefined,
): PrintPressCartSummary {
  const totals = printPressTotals(lines, namesOn)
  return {
    garments: totals.garments,
    tier: totals.tier.label,
    firstSideEach: totals.tier.firstSide,
    secondSideEach: totals.tier.secondSide,
    nameFeeEach: PRINT_PRESS_NAME_FEE,
    doublePress: totals.doublePress,
    personalized: totals.personalized,
    firstPress: totals.firstPress,
    secondPress: totals.secondPress,
    nameFee: totals.nameFee,
    labor: totals.labor,
    lines: lines
      .filter((line) => lineGarments(line) > 0)
      .map((line) => {
        const sizes: Partial<Record<PrintPressSize, number>> = {}
        for (const size of PRINT_PRESS_SIZES) {
          const qty = toCount(line.sizes[size])
          if (qty > 0) sizes[size] = qty
        }
        const front = lineNeedsFront(line) && line.frontDesign !== null ? designInfo(line.frontDesign) : undefined
        const back = lineNeedsBack(line) && line.backDesign !== null ? designInfo(line.backDesign) : undefined
        return {
          garment: line.garment,
          color: line.color,
          location: line.location,
          sizes,
          quantity: lineGarments(line),
          personalized: namesOn ? linePersonalized(line) : 0,
          roster: namesOn ? rosterNames(line).slice(0, lineGarments(line)) : [],
          frontDesign: front?.number ?? null,
          backDesign: back?.number ?? null,
          frontDesignName: front?.name,
          backDesignName: back?.name,
        }
      }),
  }
}

/** One-line description for cart rows and order notes. */
export function printPressSummaryText(summary: PrintPressCartSummary) {
  const parts = [`${summary.garments} garments × ${money(summary.firstSideEach)}`]
  if (summary.doublePress > 0) parts.push(`${summary.doublePress} second side × ${money(summary.secondSideEach)}`)
  if (summary.personalized > 0) parts.push(`${summary.personalized} names × ${money(summary.nameFeeEach)}`)
  return `${parts.join(' + ')} = ${money(summary.labor)}`
}

export function pressSheetFileName(customerName: string, stamp: string) {
  const who =
    customerName
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'Customer'
  return `${who} ${stamp}     Print & Press sheet.pdf`
}
