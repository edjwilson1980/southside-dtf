import { redirect } from 'next/navigation'

/** Clean URL for WordPress embeds → same builder with embed chrome. */
export default function EmbedPage() {
  redirect('/?embed=1')
}
