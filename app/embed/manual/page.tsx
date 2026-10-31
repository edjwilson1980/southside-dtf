import { redirect } from 'next/navigation'

/** WordPress embed URL for the manual builder → manual builder with embed chrome. */
export default function EmbedManualPage() {
  redirect('/manual?embed=1')
}
