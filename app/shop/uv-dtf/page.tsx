import type { Metadata } from 'next'
import { GangSheetBuilder } from '@/components/gang-sheet-builder'
import { UV_DTF_PRODUCT } from '@/lib/gang-sheet-product'

export const metadata: Metadata = {
  title: 'UV DTF Builder | Shop Gang Sheet Tools',
}

/** Staff copy of the customer UV DTF builder (`/uv-dtf`), under `/shop` so the staff top menu shows. */
export default function ShopUvDtfPage() {
  return <GangSheetBuilder product={UV_DTF_PRODUCT} />
}
