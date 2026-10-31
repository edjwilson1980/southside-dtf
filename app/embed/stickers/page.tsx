import { redirect } from 'next/navigation'

/** Older WordPress embeds (`mode="stickers"`) → UV DTF gang sheet builder in store mode. */
export default function EmbedStickersPage() {
  redirect('/uv-dtf?embed=1')
}
