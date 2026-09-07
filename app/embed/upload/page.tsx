import { redirect } from 'next/navigation'

/** WordPress embed URL for the upload flow → same page with embed chrome. */
export default function EmbedUploadPage() {
  redirect('/upload?embed=1')
}
