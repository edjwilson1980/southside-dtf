/** Default sites allowed to iframe this builder (WordPress storefronts). */
export const DEFAULT_FRAME_ANCESTORS = [
  "'self'",
  'https://southsidedtf.com',
  'https://www.southsidedtf.com',
  'https://sspdtf.com',
  'https://www.sspdtf.com',
]

export function frameAncestorsHeaderValue() {
  const fromEnv = process.env.EMBED_FRAME_ANCESTORS?.trim()
  if (fromEnv) return fromEnv
  return DEFAULT_FRAME_ANCESTORS.join(' ')
}

export function isEmbedSearchParam(value: string | null | undefined) {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'embed'
}
