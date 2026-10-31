'use client'

import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, RotateCw, Trash2, Undo2 } from 'lucide-react'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { cutPreviewBoxes, registrationMarkBounds } from '@/lib/cut-layout'
import { autoArrangeRemaining, type ManualArtArea } from '@/lib/manual-layout'
import type { SheetOption } from '@/lib/sheet-pricing'

/** One printed copy of a design (a design with quantity 6 is six transfers). */
export type ManualTransfer = {
  key: string
  designId: number
  designNumber: number
  name: string
  previewUrl: string
  /** Upright size on the sheet. */
  widthIn: number
  heightIn: number
}

export type ManualPlacement = { xIn: number; yIn: number; rotated: boolean }
export type ManualPlacements = Record<string, ManualPlacement>

const SNAP_IN = 1 / 8
const snap = (value: number) => Math.round(value / SNAP_IN) * SNAP_IN

export function placedSize(transfer: ManualTransfer, placement: ManualPlacement) {
  return placement.rotated
    ? { widthIn: transfer.heightIn, heightIn: transfer.widthIn }
    : { widthIn: transfer.widthIn, heightIn: transfer.heightIn }
}

type Props = {
  transfers: ManualTransfer[]
  placements: ManualPlacements
  onPlacementsChange: (update: (current: ManualPlacements) => ManualPlacements) => void
  area: ManualArtArea
  sheetWidthIn: number
  cutOut: boolean
  /** Problem message per transfer key; those pieces are outlined red. */
  problems: Record<string, string>
  ladder: SheetOption[]
  workingLengthIn: number
  onWorkingLengthChange: (lengthIn: number) => void
  labelWidthIn: number
}

/**
 * Drag-and-place editor for the manual builder: a to-scale sheet plus a tray of
 * transfers still to place. Positions are inches from the sheet's top-left.
 */
export function ManualSheetEditor({
  transfers,
  placements,
  onPlacementsChange,
  area,
  sheetWidthIn,
  cutOut,
  problems,
  ladder,
  workingLengthIn,
  onWorkingLengthChange,
  labelWidthIn,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pxPerIn, setPxPerIn] = useState(24)
  const [selected, setSelected] = useState<string | null>(null)
  const drag = useRef<{ key: string; offX: number; offY: number } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const fit = () => setPxPerIn(Math.max(10, Math.min(40, (wrap.clientWidth - 2) / sheetWidthIn)))
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [sheetWidthIn])

  const filmLengthIn = area.filmLengthIn
  const byKey = new Map(transfers.map((transfer) => [transfer.key, transfer]))
  const placedKeys = transfers.filter((transfer) => placements[transfer.key]).map((transfer) => transfer.key)
  const unplaced = transfers.filter((transfer) => !placements[transfer.key])
  const trayGroups = new Map<number, ManualTransfer[]>()
  for (const transfer of unplaced) trayGroups.set(transfer.designId, [...(trayGroups.get(transfer.designId) ?? []), transfer])
  // Nothing above the sheet may change height mid-drag, or the sheet slides away from the pointer:
  // the dragged design keeps its tray slot until the drop, and warnings update on drop.
  // drag.current is set before the first placement update, so it holds even on a render
  // where the `dragging` state has not landed yet.
  const activeDrag = drag.current?.key ?? dragging
  const draggingDesign = activeDrag ? byKey.get(activeDrag)?.designId : undefined
  const trayTiles = [...new Set(transfers.map((transfer) => transfer.designId))]
    .filter((designId) => trayGroups.has(designId) || designId === draggingDesign)
    .map((designId) => ({ designId, group: trayGroups.get(designId) ?? [], first: transfers.find((transfer) => transfer.designId === designId) as ManualTransfer }))
  const shownProblems = useRef<string[]>([])

  function inchesFromEvent(event: { clientX: number; clientY: number }) {
    const rect = sheetRef.current?.getBoundingClientRect()
    if (!rect) return { xIn: 0, yIn: 0 }
    return { xIn: (event.clientX - rect.left) / pxPerIn, yIn: (event.clientY - rect.top) / pxPerIn }
  }

  function moveTo(key: string, xIn: number, yIn: number) {
    const transfer = byKey.get(key)
    if (!transfer) return
    onPlacementsChange((current) => {
      const placement = current[key] ?? { xIn: 0, yIn: 0, rotated: false }
      const size = placedSize(transfer, placement)
      return {
        ...current,
        [key]: {
          ...placement,
          xIn: snap(Math.min(sheetWidthIn - size.widthIn, Math.max(0, xIn))),
          yIn: snap(Math.min(filmLengthIn - size.heightIn, Math.max(0, yIn))),
        },
      }
    })
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const active = drag.current
      if (!active) return
      const point = inchesFromEvent(event)
      moveTo(active.key, point.xIn - active.offX, point.yIn - active.offY)
    }
    function onUp() {
      if (!drag.current) return
      const key = drag.current.key
      drag.current = null
      setDragging(null)
      requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus())
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  })

  function startFromTray(event: React.PointerEvent, transfer: ManualTransfer) {
    event.preventDefault()
    const point = inchesFromEvent(event)
    const offX = transfer.widthIn / 2
    const offY = transfer.heightIn / 2
    drag.current = { key: transfer.key, offX, offY }
    onPlacementsChange((current) => ({
      ...current,
      [transfer.key]: {
        xIn: snap(Math.min(sheetWidthIn - transfer.widthIn, Math.max(0, point.xIn - offX))),
        yIn: snap(Math.min(filmLengthIn - transfer.heightIn, Math.max(0, point.yIn - offY))),
        rotated: false,
      },
    }))
    setDragging(transfer.key)
    setSelected(transfer.key)
  }

  /** Keyboard / click placement for a tray tile: drop it at the top-left free spot via Auto-arrange. */
  function placeOne(transfer: ManualTransfer) {
    arrange([transfer])
    setSelected(transfer.key)
  }

  function startOnSheet(event: React.PointerEvent, key: string) {
    const placement = placements[key]
    if (!placement) return
    event.preventDefault()
    const point = inchesFromEvent(event)
    drag.current = { key, offX: point.xIn - placement.xIn, offY: point.yIn - placement.yIn }
    setDragging(key)
    setSelected(key)
  }

  function rotate(key: string) {
    const transfer = byKey.get(key)
    if (!transfer) return
    onPlacementsChange((current) => {
      const placement = current[key]
      if (!placement) return current
      const turned = { ...placement, rotated: !placement.rotated }
      const size = placedSize(transfer, turned)
      return {
        ...current,
        [key]: {
          ...turned,
          xIn: snap(Math.min(sheetWidthIn - size.widthIn, Math.max(0, turned.xIn))),
          yIn: snap(Math.min(filmLengthIn - size.heightIn, Math.max(0, turned.yIn))),
        },
      }
    })
  }

  function remove(key: string) {
    onPlacementsChange((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setSelected(null)
  }

  function arrange(items: ManualTransfer[]) {
    if (items.length === 0) return
    onPlacementsChange((current) => {
      const placed = transfers
        .filter((transfer) => current[transfer.key])
        .map((transfer) => ({ yIn: current[transfer.key].yIn, ...placedSize(transfer, current[transfer.key]) }))
      const result = autoArrangeRemaining(
        placed,
        items.map((transfer) => ({ key: transfer.key, widthIn: transfer.widthIn, heightIn: transfer.heightIn, allowRotate: true })),
        area,
      )
      const next = { ...current }
      for (const piece of result.pieces) next[piece.key] = { xIn: piece.xIn, yIn: piece.yIn, rotated: Boolean(piece.rotated) }
      return next
    })
  }

  function onPieceKey(event: React.KeyboardEvent, key: string) {
    const placement = placements[key]
    if (!placement) return
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (step) {
      event.preventDefault()
      moveTo(key, placement.xIn + step[0] * SNAP_IN, placement.yIn + step[1] * SNAP_IN)
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault()
      rotate(key)
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      remove(key)
    }
  }

  const placedGeometry = placedKeys.map((key) => {
    const transfer = byKey.get(key) as ManualTransfer
    return { previewUrl: '', xIn: placements[key].xIn, yIn: placements[key].yIn, ...placedSize(transfer, placements[key]) }
  })
  const cutBoxes = cutOut ? cutPreviewBoxes(placedGeometry, sheetWidthIn, filmLengthIn) : []
  const marks = cutOut ? registrationMarkBounds(filmLengthIn, sheetWidthIn, placedGeometry) : []
  if (!activeDrag) shownProblems.current = [...new Set(Object.values(problems))]
  const problemMessages = shownProblems.current
  const rulerMarks = Array.from({ length: Math.floor(workingLengthIn / 12) + 1 }, (_, index) => index * 12)

  return (
    <div className="manual-editor">
      <div className="manual-controls">
        <label className="manual-length" htmlFor="manual-working-length">
          Working sheet length
          <select
            id="manual-working-length"
            value={workingLengthIn}
            onChange={(event) => onWorkingLengthChange(Number(event.target.value))}
          >
            {ladder.map((option) => (
              <option key={option.length} value={option.length}>
                {labelWidthIn} × {option.length} in (${option.price})
              </option>
            ))}
          </select>
          <small>You only pay for how far down your designs go, rounded up to the next sheet size.</small>
        </label>
        <div className="manual-tools">
          <button type="button" onClick={() => arrange(unplaced)} disabled={unplaced.length === 0}>
            <LayoutGrid size={16} /> Auto-arrange the rest
          </button>
          <button type="button" onClick={() => selected && rotate(selected)} disabled={!selected || !placements[selected]}>
            <RotateCw size={16} /> Rotate 90°
          </button>
          <button type="button" onClick={() => selected && remove(selected)} disabled={!selected || !placements[selected]}>
            <Trash2 size={16} /> Remove
          </button>
          <button
            type="button"
            onClick={() => { onPlacementsChange(() => ({})); setSelected(null) }}
            disabled={placedKeys.length === 0}
          >
            <Undo2 size={16} /> Clear sheet
          </button>
        </div>
      </div>

      <div className="manual-tray" aria-label="Transfers still to place">
        {trayTiles.length === 0 ? (
          <span className="manual-tray-done">Every transfer is on the sheet.</span>
        ) : (
          trayTiles.map(({ designId, group, first: shown }) => {
            const first = group[0] ?? shown
            if (group.length === 0) {
              return (
                <span key={designId} className="manual-tile" aria-hidden="true" style={{ visibility: 'hidden' }}>
                  <span className="manual-tile-art" />
                  <strong>#{shown.designNumber} {shown.name}</strong>
                  <span>0 left</span>
                </span>
              )
            }
            return (
              <button
                key={first.designId}
                type="button"
                className="manual-tile"
                onPointerDown={(event) => startFromTray(event, first)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); placeOne(first) } }}
                aria-label={`Place ${first.name}, ${group.length} left. Drag onto the sheet, or press Enter to place it.`}
              >
                <span className="manual-tile-art">{first.previewUrl ? <img src={first.previewUrl} alt="" draggable={false} /> : null}</span>
                <strong>#{first.designNumber} {first.name}</strong>
                <span>{Math.round(first.widthIn * 100) / 100} × {Math.round(first.heightIn * 100) / 100} in · {group.length} left</span>
              </button>
            )
          })
        )}
      </div>
      <p className="manual-help">
        Drag a design onto the sheet, then drag to move it. Click a design to select it: arrow keys nudge ⅛ in, R rotates, Delete sends it back to the tray.
      </p>

      {/* One fixed-height line above the sheet, so nothing shifts the sheet while dragging. Full list below. */}
      <p className={`manual-status${problemMessages.length ? ' has-problems' : ''}`} aria-live="polite">
        {problemMessages.length
          ? `${problemMessages.length} to fix: ${problemMessages[0]}`
          : unplaced.length
            ? `${unplaced.length} transfer${unplaced.length === 1 ? '' : 's'} left to place.`
            : 'Layout looks good. Every transfer is placed.'}
      </p>

      <div className="manual-sheet-wrap" ref={wrapRef}>
        <div
          ref={sheetRef}
          className="manual-sheet"
          style={{ width: sheetWidthIn * pxPerIn, height: filmLengthIn * pxPerIn }}
          onPointerDown={(event) => { if (event.target === sheetRef.current) setSelected(null) }}
        >
          <div className="manual-zone" style={{ top: 0, height: area.top * pxPerIn }}>Label strip</div>
          <div className="manual-zone" style={{ top: area.bottom * pxPerIn, bottom: 0 }}>Label strip · end of working length</div>
          {area.left > 0 && <div className="manual-side" style={{ left: 0, width: area.left * pxPerIn }} />}
          {area.left > 0 && <div className="manual-side" style={{ right: 0, width: (sheetWidthIn - area.right) * pxPerIn }} />}
          {rulerMarks.map((inch) => (
            <span key={inch} className="manual-ruler" style={{ top: (area.top + inch) * pxPerIn }}>{inch} in</span>
          ))}
          {placedKeys.map((key) => {
            const transfer = byKey.get(key) as ManualTransfer
            const placement = placements[key]
            const size = placedSize(transfer, placement)
            const problem = problems[key]
            return (
              <div
                key={key}
                data-key={key}
                role="button"
                tabIndex={0}
                aria-label={`${transfer.name}, ${Math.round(size.widthIn * 100) / 100} by ${Math.round(size.heightIn * 100) / 100} inches${problem ? `. ${problem}` : ''}`}
                className={`manual-piece${selected === key ? ' selected' : ''}${problem ? ' problem' : ''}${dragging === key ? ' dragging' : ''}`}
                style={{
                  left: placement.xIn * pxPerIn,
                  top: placement.yIn * pxPerIn,
                  width: size.widthIn * pxPerIn,
                  height: size.heightIn * pxPerIn,
                }}
                onPointerDown={(event) => startOnSheet(event, key)}
                onFocus={() => setSelected(key)}
                onKeyDown={(event) => onPieceKey(event, key)}
              >
                {transfer.previewUrl ? (
                  <img
                    src={transfer.previewUrl}
                    alt=""
                    draggable={false}
                    // Turned a quarter turn clockwise, the same way the print file draws it.
                    style={placement.rotated ? {
                      position: 'absolute', left: '50%', top: '50%',
                      width: size.heightIn * pxPerIn, height: size.widthIn * pxPerIn,
                      transform: 'translate(-50%, -50%) rotate(90deg)',
                    } : undefined}
                  />
                ) : (
                  <span>#{transfer.designNumber}</span>
                )}
              </div>
            )
          })}
          {cutOut && <CutBoxOverlay boxes={cutBoxes} marks={marks} sheetWidthIn={sheetWidthIn} sheetHeightIn={filmLengthIn} />}
        </div>
      </div>
      {problemMessages.length > 0 && (
        <ul className="manual-problems">
          {problemMessages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
      <p className="manual-legend">
        <span><i className="zone" /> No-print area</span>
        {cutOut && <span><i className="cut" /> Cut line</span>}
        <span><i className="problem" /> Needs fixing</span>
        <span>Drawn to scale · {labelWidthIn} in wide</span>
      </p>
    </div>
  )
}
