import { redirect } from 'next/navigation'

/** WordPress embed URL for artwork intake → same page with embed chrome. */
export default function EmbedSendPage() {
  redirect('/send?embed=1')
}
