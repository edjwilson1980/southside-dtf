import { GangSheetBuilder } from '@/components/gang-sheet-builder'
import { DTF_PRODUCT } from '@/lib/gang-sheet-product'

export default function Home() {
  return <GangSheetBuilder product={DTF_PRODUCT} />
}
