/** Shared gang-sheet size ladder and cutting rates (builder + upload flow). */

export const SAFETY_WIDTH_IN = 22.3

export type SheetOption = {
  length: number
  price: number
  label: string
}

export function sheetLabel(length: number) {
  return `22.3 × ${length} in`
}

export const sheetOptions: SheetOption[] = [
  { length: 12, price: 8 },
  { length: 24, price: 15 },
  { length: 36, price: 24 },
  { length: 48, price: 30 },
  { length: 60, price: 40 },
  { length: 72, price: 48 },
  { length: 100, price: 60 },
  { length: 120, price: 70 },
  { length: 150, price: 90 },
  { length: 200, price: 115 },
].map((option) => ({ ...option, label: sheetLabel(option.length) }))

/** Snap art length (inches) to the billable sheet tier. */
export function billedSheetLength(artLength: number) {
  const chargeable = Math.max(0, artLength - 1.5)
  const safeLength = Math.max(12, Math.ceil(chargeable - 1e-9))
  const fullSheets = Math.floor(safeLength / 200)
  const remainder = safeLength % 200
  if (remainder === 0) return Math.max(12, fullSheets * 200)
  const remainderSheet =
    sheetOptions.find((option) => remainder <= option.length) ?? sheetOptions[sheetOptions.length - 1]
  return fullSheets * 200 + remainderSheet.length
}

export function cuttingFeeEach(transferCount: number) {
  if (transferCount <= 0) return 0
  if (transferCount <= 24) return 0.5
  if (transferCount <= 99) return 0.25
  if (transferCount <= 249) return 0.2
  if (transferCount <= 499) return 0.15
  return 0.1
}

export function getGangSheet(length: number) {
  const billedLength = billedSheetLength(length)
  const fullSheets = Math.floor(billedLength / 200)
  const remainder = billedLength % 200
  const remainderSheet =
    remainder > 0
      ? sheetOptions.find((option) => option.length === remainder) ?? sheetOptions[sheetOptions.length - 1]
      : null
  const price = fullSheets * 115 + (remainderSheet?.price ?? 0)
  return {
    length: billedLength,
    label: sheetLabel(billedLength),
    price,
    breakdown:
      fullSheets > 0 && remainderSheet
        ? `${fullSheets} × 200 in + ${remainderSheet.length} in`
        : fullSheets > 0
          ? `${fullSheets} × 200 in`
          : remainderSheet?.label ?? sheetLabel(12),
  }
}
