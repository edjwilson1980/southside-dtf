import type { Metadata } from 'next'
import { StickerMaker } from '@/components/sticker-maker'

export const metadata: Metadata = {
  title: 'UV DTF Sticker Maker | South Side DTF',
  description: 'Build your UV DTF sticker sheet — Cut or No Cut — and add it to your cart.',
}

/** Customer UV DTF sticker maker. Always store mode; no shop tools. */
export default function StickersPage() {
  return <StickerMaker audience="customer" />
}
