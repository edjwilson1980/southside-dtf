import { redirect } from 'next/navigation'

/** WordPress embed URL for UV DTF stickers → customer sticker maker (never the shop page). */
export default function EmbedStickersPage() {
  redirect('/stickers')
}
