import { createHmac, timingSafeEqual } from 'crypto'

function projectHmacSecret() {
  return (
    process.env.PROJECT_HMAC_SECRET?.trim() ||
    process.env.SSGS_COMMIT_SECRET?.trim() ||
    ''
  )
}

/** Strip an existing sig, then HMAC the canonical JSON body. */
export function signProjectPayload(payload: Record<string, unknown>): string | undefined {
  const secret = projectHmacSecret()
  if (!secret) return undefined
  const { sig: _sig, ...rest } = payload
  const body = JSON.stringify(rest)
  return `hmac-sha256:${createHmac('sha256', secret).update(body).digest('hex')}`
}

/** Add a `sig` to a project JSON string (unchanged when no secret is set or it isn't a project). */
export function signProjectJsonContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (parsed.format !== 'ssp-gangsheet-project') return content
    const sig = signProjectPayload(parsed)
    if (!sig) return content
    return JSON.stringify({ ...parsed, sig }, null, 2)
  } catch {
    return content
  }
}

export function verifyProjectSignature(payload: Record<string, unknown>): boolean {
  const secret = projectHmacSecret()
  if (!secret) return true
  const expected = signProjectPayload(payload)
  const actual = typeof payload.sig === 'string' ? payload.sig : ''
  if (!expected || !actual) return false
  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(actual)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
