/**
 * Build fee must only apply to intake sheets, never self-serve builder.
 * Run: node scripts/verify-build-fee.mjs
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')
const send = readFileSync(join(root, 'app/send/page.tsx'), 'utf8')
const php = readFileSync(join(root, 'wordpress/southside-gangsheet/southside-gangsheet.php'), 'utf8')
const pricing = readFileSync(join(root, 'lib/sheet-pricing.ts'), 'utf8')

const checks = []
checks.push([!page.includes('build-fee-warning'), 'customer builder has no build-fee-warning'])
checks.push([!page.includes('buildFeeForLength'), 'customer builder does not import buildFeeForLength'])
checks.push([page.includes('buildFee: 0'), 'customer builder sends buildFee: 0'])
checks.push([page.includes('sheet.price + cutFee'), 'customer builder subtotal is sheet + cut only'])
checks.push([send.includes('buildFeeForLength'), 'intake /send still charges build fee'])
checks.push([send.includes("sheetType: 'intake'"), 'intake marks sheetType intake'])
checks.push([php.includes("($sheet_type === 'intake') ? floatval($payload['buildFee'] ?? 0) : 0"), 'plugin stores build fee only for intake'])
checks.push([php.includes("!== 'intake'"), 'plugin fee hook skips non-intake sheets'])
checks.push([pricing.includes('done-for-you path only') || pricing.includes('Never charge this on the self-serve builder'), 'pricing comments document intake-only fee'])
checks.push([php.includes("Version: 1.22"), 'plugin version is 1.22'])

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(ok ? '✓' : '✗', label)
if (failed.length) {
  console.error(`\n${failed.length} build-fee checks failed`)
  process.exit(1)
}
console.log(`\n${checks.length} build-fee checks passed`)
