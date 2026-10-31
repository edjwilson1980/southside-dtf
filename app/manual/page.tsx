import type { Metadata } from 'next'
import { GangSheetBuilder } from '@/components/gang-sheet-builder'
import { DTF_PRODUCT } from '@/lib/gang-sheet-product'

export const metadata: Metadata = {
  title: 'Arrange My Own Gangsheet | South Side DTF',
  description: 'Place every design on your DTF gang sheet yourself, then add it to your cart.',
}

/** Manual DTF builder: the customer places every transfer (linked from step 1 of `/`). */
export default function ManualPage() {
  return <GangSheetBuilder product={DTF_PRODUCT} layout="manual" />
}
