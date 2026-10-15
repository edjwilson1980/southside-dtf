import { redirect } from 'next/navigation'

/** WordPress embed URL for UV DTF stickers → sticker maker with embed chrome. */
export default function EmbedStickersPage() {
  redirect('/shop/sticker-maker?embed=1')
}
