/** Run: node scripts/verify-points-math.mjs */
function points_for_eligible(eligible, rate = 1.0) {
  return Math.floor(Number(eligible) * Number(rate))
}
function available_redeem(balance, cart_subtotal, block_pts = 100, block_val = 5.0, max_pct = 50.0) {
  if (balance <= 0) return { blocks: 0, points: 0, value: 0.0 }
  const max_by_balance = Math.floor(balance / block_pts)
  const max_value_by_cart = Number(cart_subtotal) * (max_pct / 100.0)
  const max_by_cart = block_val > 0 ? Math.floor(max_value_by_cart / block_val) : 0
  const blocks = Math.max(0, Math.min(max_by_balance, max_by_cart))
  return { blocks, points: blocks * block_pts, value: blocks * block_val }
}
function expires_at(last, hold = 60) {
  return last + hold * 86400
}
const checks = []
checks.push([points_for_eligible(80) === 80, 'earn 80 on $80 eligible'])
const cap = available_redeem(340, 20)
checks.push([cap.points === 200 && cap.value === 10, 'redeem cap 200 pts / $10 on $20 cart'])
let seen = {}
function award(oid, type, pts) {
  const k = oid + '|' + type
  if (seen[k]) return 0
  seen[k] = pts
  return pts
}
let total = award(1, 'earn', 80) + award(1, 'earn', 80)
checks.push([total === 80, 'idempotent earn'])
const now = Date.parse('2026-09-26T12:00:00Z') / 1000
checks.push([expires_at(now, 60) === now + 60 * 86400, 'expires_at = last + 60 days'])
const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(ok ? '✓' : '✗', label)
if (failed.length) {
  console.error(`${failed.length} failed`)
  process.exit(1)
}
console.log(`\n${checks.length} points math checks passed`)
