/**
 * HMAC / thumb token checks for files relay (no Drive calls).
 * Run: node scripts/verify-files-relay.mjs
 */
import { createHmac } from 'crypto'

const secret = 'test-secret'

function signBody(body) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

function signThumb(driveFileId, userId, exp) {
  const payload = [driveFileId, String(userId), String(exp)].join('|')
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  return Buffer.from(`${payload}|${sig}`, 'utf8').toString('base64url')
}

function verifyThumb(token) {
  const decoded = Buffer.from(token, 'base64url').toString('utf8')
  const parts = decoded.split('|')
  if (parts.length !== 4) return null
  const [driveFileId, userId, exp, sig] = parts
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null
  const payload = [driveFileId, userId, exp].join('|')
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  return expected === sig ? { driveFileId, userId } : null
}

const checks = []
const body = JSON.stringify({ drive_file_id: 'abc', ts: Math.floor(Date.now() / 1000) })
const sig = signBody(body)
checks.push([sig.length === 64, 'body sig is sha256 hex'])
checks.push([signBody(body) === sig, 'body sig stable'])

const exp = Math.floor(Date.now() / 1000) + 900
const token = signThumb('file123', 42, exp)
const ok = verifyThumb(token)
checks.push([!!ok && ok.driveFileId === 'file123' && ok.userId === '42', 'thumb token verifies'])

const expired = signThumb('file123', 42, Math.floor(Date.now() / 1000) - 10)
checks.push([verifyThumb(expired) === null, 'expired thumb rejected'])

const failed = checks.filter(([c]) => !c)
for (const [c, label] of checks) console.log(c ? '✓' : '✗', label)
if (failed.length) {
  console.error(`${failed.length} failed`)
  process.exit(1)
}
console.log(`\n${checks.length} files-relay checks passed`)
