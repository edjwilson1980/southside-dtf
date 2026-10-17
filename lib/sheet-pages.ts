import {
  ART_INSET_IN,
  CUT_ART_START_IN,
  PRINT_MARGIN_IN,
  SHEET_WIDTH_IN,
  packSheetBestGutter,
  packSheetIntoPages,
  packSheetPieces,
  type PackItem,
  type PlacedSheetPiece,
} from '@/lib/compose-sheet'
import {
  CUT_GUTTER_IN,
  CUT_MARGIN_IN,
  MARK_CLEARANCE_IN,
  MARK_SECTION_IN,
  cutPreviewBoxes,
  registrationMarkBounds,
  registrationMarkRects,
  startMarkArrowPoints,
} from '@/lib/cut-layout'
import { sheetLabel, sheetOptions } from '@/lib/sheet-pricing'

/** Longest gang sheet we print and bill as one piece. Anything longer becomes more sheets. */
export const MAX_SHEET_LENGTH_IN = 200

type PackResult<T extends PackItem> = ReturnType<typeof packSheetPieces<T>>

export type SheetPage<T extends PackItem> = {
  /** 0-based position in the job. */
  index: number
  /** Printed layout (with pre-cut gutters / insets when cut is on). */
  layout: PackResult<T>
  /** Art length that is billed — packed without any pre-cut spacing. */
  billableHeightIn: number
  /** Art length actually printed (includes pre-cut spacing when on). */
  printedHeightIn: number
  /** Full film length for PNG / PLT / overlays (leading + trailing insets). */
  printHeight: number
  /** Ladder tier this sheet is billed at (≤ MAX_SHEET_LENGTH_IN). */
  billedLength: number
  price: number
  /** e.g. "22.3 × 100 in". */
  label: string
  transfers: number
  marks: ReturnType<typeof registrationMarkRects>
  markBounds: ReturnType<typeof registrationMarkBounds>
  startArrow: ReturnType<typeof startMarkArrowPoints>
  cutBoxes: ReturnType<typeof cutPreviewBoxes>
  /** A piece plus its cut box is taller than one cutter pass. */
  cutTooTall: boolean
}

export type SheetPagination<T extends PackItem> = {
  pages: SheetPage<T>[]
  /** Designs too large to fit an empty 200 in sheet. */
  tooLarge: T[]
  sheetCount: number
  /** Sum of per-sheet tiers. */
  billedLength: number
  /** Sum of per-sheet prices. */
  price: number
  /** e.g. "2 × 200 in + 100 in" or "22.3 × 36 in". */
  breakdown: string
  /** "1 of 3" style part labels, in order. */
  partLabels: string[]
  rotatedCount: number
  /** Film the packer saved by turning designs, versus everything upright. */
  filmSavedIn: number
}

/** Snap one sheet's art length to its ladder tier (never above the max sheet). */
export function sheetTierForArtLength(artLengthIn: number) {
  const chargeable = Math.max(0, artLengthIn - PRINT_MARGIN_IN)
  const safeLength = Math.max(sheetOptions[0].length, Math.ceil(chargeable - 1e-9))
  return (
    sheetOptions.find((option) => safeLength <= option.length) ?? sheetOptions[sheetOptions.length - 1]
  )
}

/** Return a placed piece to its upright dimensions so it can be re-packed. */
function uprightItem<T extends PackItem>(piece: T & { rotated?: boolean }): T {
  const { rotated, ...rest } = piece as T & { rotated?: boolean; xIn?: number; yIn?: number }
  const item = { ...(rest as T) }
  delete (item as { xIn?: number }).xIn
  delete (item as { yIn?: number }).yIn
  if (rotated) {
    return { ...item, widthIn: piece.heightIn, heightIn: piece.widthIn }
  }
  return item
}

export function partLabel(index: number, count: number) {
  return `${index + 1} of ${count}`
}

/**
 * Pack a job onto as many 200 in sheets as it needs. Each sheet is its own
 * print file, its own cut file, and its own billed line — 500 in of art is
 * three sheets (200 + 200 + 100), not one 200 in sheet.
 */
export function paginateGangSheet<T extends PackItem>(
  items: T[],
  options: { cutOut: boolean; sheetWidthIn?: number },
): SheetPagination<T> {
  const sheetWidthIn = options.sheetWidthIn ?? SHEET_WIDTH_IN
  const cutOut = options.cutOut
  const billableOpts = { packWidthIn: sheetWidthIn, startYIn: ART_INSET_IN }
  const printOpts = cutOut
    ? {
        packWidthIn: sheetWidthIn - MARK_CLEARANCE_IN * 2,
        startYIn: CUT_ART_START_IN,
        sideInsetIn: MARK_CLEARANCE_IN,
        minGutterIn: CUT_GUTTER_IN,
      }
    : billableOpts
  const startY = cutOut ? CUT_ART_START_IN : ART_INSET_IN
  // Billing allows PRINT_MARGIN_IN of grace before snapping, so a sheet can hold
  // that much more art than the tier and still bill as 200.
  const pageHeightIn = startY + MAX_SHEET_LENGTH_IN + PRINT_MARGIN_IN

  const { pages: layouts, tooLarge } = packSheetIntoPages(items, { ...printOpts, pageHeightIn })

  const pages: SheetPage<T>[] = layouts.map((layout, index) => {
    const uprightItems = layout.pieces.map((piece) => uprightItem(piece))
    const billable = cutOut ? packSheetBestGutter(uprightItems, billableOpts) : layout
    const billableHeightIn = Math.max(0, billable.contentEndY - ART_INSET_IN)
    const printedHeightIn = cutOut
      ? Math.max(0, layout.contentEndY - CUT_ART_START_IN)
      : billableHeightIn
    const printHeight = cutOut
      ? layout.contentEndY + CUT_ART_START_IN
      : layout.contentEndY + ART_INSET_IN
    const tier = sheetTierForArtLength(billableHeightIn)
    // Cut helpers only read geometry; server-side items carry no preview URL.
    const geometry: PlacedSheetPiece[] = layout.pieces.map((piece) => ({ previewUrl: '', ...piece }))
    const marks = cutOut ? registrationMarkRects(printHeight, sheetWidthIn, geometry) : []
    const markBounds = cutOut ? registrationMarkBounds(printHeight, sheetWidthIn, geometry) : []
    const first = markBounds.find((mark) => mark.first)
    return {
      index,
      layout,
      billableHeightIn,
      printedHeightIn,
      printHeight,
      billedLength: tier.length,
      price: tier.price,
      label: sheetLabel(tier.length),
      transfers: layout.pieces.length,
      marks,
      markBounds,
      startArrow: first ? startMarkArrowPoints(first) : [],
      cutBoxes: cutOut ? cutPreviewBoxes(geometry, sheetWidthIn, printHeight) : [],
      cutTooTall:
        cutOut && layout.pieces.some((piece) => piece.heightIn + CUT_MARGIN_IN * 2 > MARK_SECTION_IN),
    }
  })

  const sheetCount = Math.max(1, pages.length)
  const billedLength = pages.reduce((sum, page) => sum + page.billedLength, 0)
  const price = pages.reduce((sum, page) => sum + page.price, 0)
  const partLabels = pages.map((page) => partLabel(page.index, pages.length))

  const fullSheets = pages.filter((page) => page.billedLength === MAX_SHEET_LENGTH_IN).length
  const partials = pages.filter((page) => page.billedLength !== MAX_SHEET_LENGTH_IN)
  const breakdown =
    pages.length === 0
      ? sheetLabel(sheetOptions[0].length)
      : pages.length === 1
        ? pages[0].label
        : [
            fullSheets > 0 ? `${fullSheets} × ${MAX_SHEET_LENGTH_IN} in` : '',
            ...partials.map((page) => `${page.billedLength} in`),
          ]
            .filter(Boolean)
            .join(' + ')

  // Saving readout: everything upright on one open roll versus what we packed.
  const upright = packSheetBestGutter(items, { ...billableOpts, rotatePolicy: 'none' as const })
  const packedBillable = pages.reduce((sum, page) => sum + page.billableHeightIn, 0)
  const uprightBillable = Math.max(0, upright.contentEndY - ART_INSET_IN)
  const rotatedCount = pages.reduce((sum, page) => sum + page.layout.rotatedCount, 0)

  return {
    pages,
    tooLarge,
    sheetCount,
    billedLength,
    price,
    breakdown,
    partLabels,
    rotatedCount,
    filmSavedIn: Math.max(0, uprightBillable - packedBillable),
  }
}

/**
 * Split an already-billed total into per-sheet tiers (200, 200, 100 for 500).
 * Mirrors the WooCommerce plugin's server-side split for payloads that only
 * carry a total length.
 */
export function splitBilledLength(totalBilledIn: number): number[] {
  const total = Math.max(0, Math.round(totalBilledIn))
  if (total <= 0) return []
  const parts: number[] = []
  let remaining = total
  while (remaining > MAX_SHEET_LENGTH_IN) {
    parts.push(MAX_SHEET_LENGTH_IN)
    remaining -= MAX_SHEET_LENGTH_IN
  }
  const tier =
    sheetOptions.find((option) => remaining <= option.length) ?? sheetOptions[sheetOptions.length - 1]
  parts.push(tier.length)
  return parts
}
