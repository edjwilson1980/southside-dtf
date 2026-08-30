'use client'

import { useState } from 'react'
import {
  MARK_PAD_IN,
  MARK_SIZE_IN,
  CUT_MARGIN_IN,
  startMarkArrowPoints,
} from '@/lib/cut-layout'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { canvasToPngBlob } from '@/lib/image-utils'
import {
  TEST2_SHEET_IN,
  TEST_PITCH_IN,
  test2CutBoxes,
  test2MarkYs,
  test2Pitch,
  testCutBoxes,
  testMarkXs,
  testMarkYs,
  testSheetLengthIn,
  testVariants,
} from '@/lib/cutter-test'

const DPI = 300

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function circle(context: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  context.fillStyle = fill
  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.closePath()
  context.fill()
}

type SheetSpec = {
  lengthIn: number
  ys: number[]
  boxes: Array<{ xIn: number; yIn: number; widthIn: number; heightIn: number; label: string; section: number }>
  note: string
}

async function buildTestSheet({ lengthIn, ys, boxes: sheetBoxes, note }: SheetSpec) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(SHEET_WIDTH_IN * DPI)
  canvas.height = Math.round(lengthIn * DPI)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not draw the test sheet.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  // Where each cut should land, so a miss is obvious on the film.
  for (const box of sheetBoxes) {
    const x = box.xIn * DPI
    const y = box.yIn * DPI
    const w = box.widthIn * DPI
    const h = box.heightIn * DPI
    context.strokeStyle = '#9aa3af'
    context.lineWidth = 3
    context.strokeRect(x, y, w, h)
    context.strokeStyle = '#d92b2b'
    context.setLineDash([14, 10])
    context.lineWidth = 2
    context.strokeRect(x - CUT_MARGIN_IN * DPI, y - CUT_MARGIN_IN * DPI, w + CUT_MARGIN_IN * 2 * DPI, h + CUT_MARGIN_IN * 2 * DPI)
    context.setLineDash([])
    context.fillStyle = '#111827'
    context.font = `700 ${Math.round(1.6 * DPI)}px Arial, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(box.label, x + w / 2, y + h / 2)
    context.font = `${Math.round(0.28 * DPI)}px Arial, sans-serif`
    context.fillText(`section ${box.section}`, x + w / 2, y + h - 0.45 * DPI)
  }

  const xs = testMarkXs()
  const startY = ys[ys.length - 1]
  ys.forEach((yIn) => {
    for (const xIn of [xs.left, xs.right]) {
      const cx = (xIn + MARK_SIZE_IN / 2) * DPI
      const cy = (yIn + MARK_SIZE_IN / 2) * DPI
      circle(context, cx, cy, (MARK_SIZE_IN / 2 + MARK_PAD_IN) * DPI, '#ffffff')
      circle(context, cx, cy, (MARK_SIZE_IN / 2) * DPI, '#000000')
    }
  })

  const startMark = { xIn: xs.right, yIn: startY, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN }
  const points = startMarkArrowPoints(startMark)
  context.fillStyle = '#000000'
  context.beginPath()
  points.forEach((point, index) => {
    const x = point.xIn * DPI
    const y = point.yIn * DPI
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.fill()

  context.fillStyle = '#111827'
  context.font = `700 ${Math.round(0.4 * DPI)}px Arial, sans-serif`
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillText(note, 0.35 * DPI, (startY - 0.55) * DPI)

  // Tag the DPI, or the printer has no idea what size to lay this down at and
  // every measurement on the sheet is wrong.
  return canvasToPngBlob(canvas, DPI)
}

export default function CutterTestPage() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const variants = testVariants()
  const lengthIn = testSheetLengthIn()
  const ys2 = test2MarkYs()
  const pitch2 = test2Pitch()

  const sheets: Array<{ id: string; label: string; spec: SheetSpec }> = [
    {
      id: '2A',
      label: `Test 2A sheet — ${TEST2_SHEET_IN} in, marks ${pitch2.toFixed(1)} in apart`,
      spec: {
        lengthIn: TEST2_SHEET_IN,
        ys: ys2,
        boxes: test2CutBoxes(),
        note: `CUTTER TEST 2A — ${SHEET_WIDTH_IN} x ${TEST2_SHEET_IN} in — ${ys2.length} mark rows ${pitch2.toFixed(1)} in apart — ${ys2.length - 1} passes — load UPSIDE DOWN, start bottom-right`,
      },
    },
    {
      id: '1',
      label: `Test 1 sheet — ${lengthIn.toFixed(2)} in, marks ${TEST_PITCH_IN} in apart`,
      spec: {
        lengthIn,
        ys: testMarkYs(),
        boxes: testCutBoxes(),
        note: `CUTTER TEST SHEET — ${SHEET_WIDTH_IN} x ${lengthIn.toFixed(2)} in — marks every ${TEST_PITCH_IN} in — load UPSIDE DOWN, start bottom-right`,
      },
    },
  ]

  async function onSheet(id: string, spec: SheetSpec) {
    setBusy(id)
    setError(null)
    try {
      download(
        `cutter test ${id} sheet ${SHEET_WIDTH_IN}x${spec.lengthIn.toFixed(2)}.png`,
        await buildTestSheet(spec),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the test sheet.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="cutter-test">
      <h1>Cutter advance test</h1>
      <p className="lede">
        Test 1A worked, so the builder now writes one register / cut / advance block per pair of
        mark rows. Test 2A is that same structure at full length and the widest mark spacing,
        built by the shipping code.
      </p>

      <ol className="steps">
        <li>Print the <strong>Test 2A</strong> sheet: {SHEET_WIDTH_IN} × {TEST2_SHEET_IN} in, {ys2.length} mark rows {pitch2.toFixed(1)} in apart, {(ys2.length - 1) * 2} numbered boxes.</li>
        <li>Load it <strong>upside down</strong> and park the camera on the bottom-right circle, exactly as you would a real job.</li>
        <li>Run <strong>2A</strong> and watch it cut two boxes, advance {pitch2.toFixed(1)} in, re-read and carry on.</li>
        <li>Tell me whether all {(ys2.length - 1) * 2} boxes landed, and whether {pitch2.toFixed(1)} in is comfortable or too far for the camera.</li>
      </ol>

      <div className="sheets">
        {sheets.map((sheet) => (
          <button key={sheet.id} className="primary" onClick={() => void onSheet(sheet.id, sheet.spec)} disabled={busy !== null}>
            {busy === sheet.id ? 'Building…' : sheet.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="variants">
        {variants.map((variant) => (
          <section key={variant.id}>
            <h2>Test {variant.id} — {variant.title}</h2>
            <p>{variant.idea}</p>
            <p className="watch"><strong>Watch for:</strong> {variant.watchFor}</p>
            <button
              onClick={() =>
                download(
                  `cutter test ${variant.id}.plt`,
                  new Blob([variant.plt], { type: 'application/vnd.hp-hpgl' }),
                )
              }
            >
              Download test {variant.id} .plt
            </button>
            <details>
              <summary>First line of the file</summary>
              <code>{variant.plt.slice(0, 150)}…</code>
            </details>
          </section>
        ))}
      </div>
    </main>
  )
}
