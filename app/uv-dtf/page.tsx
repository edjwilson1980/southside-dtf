import type { Metadata } from 'next'
import { GangSheetBuilder } from '@/components/gang-sheet-builder'
import { UV_DTF_PRODUCT } from '@/lib/gang-sheet-product'

export const metadata: Metadata = {
  title: 'Build My UV DTF Gangsheet | South Side DTF',
  description: 'Build your 22 in UV DTF gang sheet, add pre-cut if you want, and add it to your cart.',
}

/** Customer UV DTF gang sheet builder — same flow as `/`, UV DTF prices and 22 in media. */
export default function UvDtfPage() {
  return <GangSheetBuilder product={UV_DTF_PRODUCT} />
}
