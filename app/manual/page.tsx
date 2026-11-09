import type { Metadata } from 'next'
import { GangSheetBuilder } from '@/components/gang-sheet-builder'
import { DTF_PRODUCT } from '@/lib/gang-sheet-product'

export const metadata: Metadata = {
  title: 'Create Gangsheet Manually | South Side DTF',
  description: 'Size, duplicate, copy, and drag each image onto your DTF gang sheet, then add it to your cart.',
}

/** Manual DTF builder: the customer places every transfer (linked from step 1 of `/`). */
export default function ManualPage() {
  return <GangSheetBuilder product={DTF_PRODUCT} layout="manual" />
}
