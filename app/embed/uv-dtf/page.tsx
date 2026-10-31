import { redirect } from 'next/navigation'

/** WordPress embed URL for UV DTF → UV DTF builder with embed chrome. */
export default function EmbedUvDtfPage() {
  redirect('/uv-dtf?embed=1')
}
