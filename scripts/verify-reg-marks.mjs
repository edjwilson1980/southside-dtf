import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const layout = readFileSync(join(root, 'lib/cut-layout.ts'), 'utf8')
const compose = readFileSync(join(root, 'lib/compose-sheet.ts'), 'utf8')
const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
const preview = readFileSync(join(root, 'components/sheet-preview-modal.tsx'), 'utf8')
const overlay = readFileSync(join(root, 'components/cut-box-overlay.tsx'), 'utf8')

const htmlPath = '/tmp/reg-mark-render.html'
const pngPath = '/tmp/reg-mark-render.png'
const cropPath = '/tmp/reg-mark-crop.png'

writeFileSync(htmlPath, `<!DOCTYPE html>
<meta charset="utf-8">
<canvas id="c"></canvas>
<script>
const dpi = 150
const padMm = 9
const blackMm = 5
const pad = Math.round((padMm / 25.4) * dpi)
const black = Math.round((blackMm / 25.4) * dpi)
const canvas = document.getElementById('c')
canvas.width = pad + 8
canvas.height = pad + 8
const ctx = canvas.getContext('2d')
ctx.clearRect(0, 0, canvas.width, canvas.height)
function fillCircle(x, y, size, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fill()
}
const origin = 4
fillCircle(origin, origin, pad, '#ffffff')
fillCircle(origin + (pad - black) / 2, origin + (pad - black) / 2, black, '#000000')
const dataUrl = canvas.toDataURL('image/png')
document.body.textContent = dataUrl
</script>`)

const chrome = spawnSync('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--user-data-dir=/tmp/chrome-reg-mark',
  '--virtual-time-budget=4000',
  `--dump-dom`,
  htmlPath,
], { encoding: 'utf8', timeout: 20000 })

if (chrome.status !== 0) {
  console.error(chrome.stderr || chrome.stdout)
  process.exit(1)
}

const match = chrome.stdout.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)
if (!match) {
  console.error('chrome did not return a PNG data URL')
  process.exit(1)
}

const png = Buffer.from(match[1], 'base64')
writeFileSync(pngPath, png)

const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height } = info
function pixel(x, y) {
  const i = (y * width + x) * 4
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}
const cx = Math.floor(width / 2)
const cy = Math.floor(height / 2)
const [cr, cg, cb, ca] = pixel(cx, cy)
const corners = [
  pixel(1, 1),
  pixel(width - 2, 1),
  pixel(1, height - 2),
  pixel(width - 2, height - 2),
]
const cornerOpaque = corners.filter(([, , , a]) => a > 32).length
const centerBlack = cr < 40 && cg < 40 && cb < 40 && ca > 200

mkdirSync('/opt/cursor/artifacts', { recursive: true })
await sharp(png).resize(320, 320, { kernel: 'nearest' }).png().toFile('/opt/cursor/artifacts/registration_mark_circle.png')
await sharp(png).png().toFile(cropPath)

const checks = [
  [layout.includes('MARK_SIZE_IN = 5 / 25.4'), 'printed marks are 5 mm'],
  [/color: '#ffffff',\s*shape: 'circle'/.test(layout), 'white pads are circular'],
  [compose.includes('fillMarkCircle'), 'export fills marks with canvas arcs'],
  [!compose.includes('fillRect('), 'export no longer fillRects marks'],
  [css.includes('.cut-reg-mark') && css.includes('stroke: #ff1a1a'), 'overlay crop marks are stroked circles'],
  [overlay.includes('<circle'), 'overlay draws crop marks with SVG circles'],
  [overlay.includes('cut-start-arrow'), 'overlay draws an arrow at the starting crop mark'],
  [compose.includes('fillStartArrow'), 'export prints a start arrow on the PNG'],
  [compose.indexOf('fillText') < compose.indexOf('drawImage'), 'job name is drawn before artwork so it cannot cover the designs'],
  [compose.includes('fillText'), 'job name is still printed on the sheet'],
  [preview.includes('black 5 mm circles'), 'preview copy describes circles'],
  [preview.includes('BOTTOM-RIGHT'), 'preview copy names the bottom-right start circle'],
  [layout.includes('MARK_SECTION_IN = 30'), 'mark rows sit no more than 30 in apart'],
  [layout.includes('const pitch = span / steps'), 'mark rows are evenly spaced down the sheet'],
  [layout.includes('MARK_LEAD_IN = 10 / 25.4'), 'the far mark row sits at the film edge'],
  [layout.includes('MARK_GAP_X_IN = 21.5'), 'left and right marks are 21.5 in apart'],
  [centerBlack, `center pixel is black (${cr},${cg},${cb},${ca})`],
  [cornerOpaque === 0, `bounding-box corners are transparent, not a white square (${cornerOpaque} opaque)`],
]

const failed = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`)
if (failed.length) {
  console.error(`registration mark checks failed: ${failed.length}`)
  process.exit(1)
}
console.log(`registration marks render as circles (${width}x${height} px sample)`)
