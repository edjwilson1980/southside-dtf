import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { UV_DTF_WIDTH_IN, sheetOptions, uvDtfSheetOptions, type SheetOption } from '@/lib/sheet-pricing'

/** What the customer builder sells: DTF gang sheets (`/`) or UV DTF gang sheets (`/uv-dtf`). */
export type GangSheetProduct = {
  printType: 'dtf' | 'uv-dtf'
  /** Media width sold and named on labels. */
  widthIn: number
  /** Printed width with Pre-cut on — UV DTF pulls in so cut marks stay on the 22 in paper. */
  cutWidthIn: number
  ladder: SheetOption[]
  /** Print & Press add-on (garment pressing). DTF only. */
  printPress: boolean
  title: string
  embedTitle: string
  /** Short name in "Pre-cut …" and similar copy. */
  shortName: string
}

export const DTF_PRODUCT: GangSheetProduct = {
  printType: 'dtf',
  widthIn: SHEET_WIDTH_IN,
  cutWidthIn: SHEET_WIDTH_IN,
  ladder: sheetOptions,
  printPress: true,
  title: 'Build My Gangsheet',
  embedTitle: 'Build your gang sheet',
  shortName: 'DTFs',
}

export const UV_DTF_PRODUCT: GangSheetProduct = {
  printType: 'uv-dtf',
  widthIn: UV_DTF_WIDTH_IN,
  cutWidthIn: 21.75,
  ladder: uvDtfSheetOptions,
  printPress: false,
  title: 'Build My UV DTF Gangsheet',
  embedTitle: 'Build your UV DTF gang sheet',
  shortName: 'UV DTFs',
}

export function maxSheetLengthIn(product: GangSheetProduct) {
  return product.ladder[product.ladder.length - 1].length
}
