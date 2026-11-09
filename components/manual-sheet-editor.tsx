'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Copy, CornerUpLeft, Lock, LayoutGrid, RotateCw, Trash2, Undo2 } from 'lucide-react'
import { PerspectiveToggle } from '@/components/perspective-toggle'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { cutPreviewBoxes, registrationMarkBounds } from '@/lib/cut-layout'
import { printDpi, qualityFromDpi } from '@/lib/image-utils'
import {
  autoArrangeRemaining,
  clampToArea,
  resizeFactor,
  scaleWithin,
  type ManualArtArea,
  type ResizeHandle,
} from '@/lib/manual-layout'
import type { SheetOption } from '@/lib/sheet-pricing'

/** One printed copy of a design (a design with quantity 6 is six transfers). */
export type ManualTransfer = {
  key: string
  designId: number
  designNumber: number
  name: string
  previewUrl: string
  /** Upright size on the sheet at scale 1 (the size picked in step 4). */
  widthIn: number
  heightIn: number
  /** Art pixel width, for the print-quality readout while resizing. */
  pixelWidth?: number
  /** Perspective is off: the image is stretched to widthIn × heightIn. */
  stretch?: boolean
}

/**
 * `scale` resizes this one copy (proportions locked); 1 when left out.
 * `angle` turns it clockwise about its centre, in degrees; 0 when left out.
 * xIn/yIn are the top-left of the box the turned copy takes up.
 */
export type ManualPlacement = { xIn: number; yIn: number; angle?: number; scale?: number }
export type ManualPlacements = Record<string, ManualPlacement>

const SNAP_IN = 1 / 8
const snap = (value: number) => Math.round(value / SNAP_IN) * SNAP_IN
const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const round2 = (value: number) => Math.round(value * 100) / 100

/** Angle in [0, 360), rounded to hundredths. */
export function normalizeAngle(degrees: number) {
  const value = (((Math.round(degrees * 100) / 100) % 360) + 360) % 360
  return value >= 360 ? 0 : value
}

/** The copy's own (upright) size at its scale. */
export function artSize(transfer: ManualTransfer, placement: ManualPlacement) {
  const scale = placement.scale ?? 1
  return { widthIn: transfer.widthIn * scale, heightIn: transfer.heightIn * scale }
}

/** The box the copy takes up on the sheet once turned to its angle. */
export function placedSize(transfer: ManualTransfer, placement: ManualPlacement) {
  const { widthIn, heightIn } = artSize(transfer, placement)
  const radians = ((placement.angle ?? 0) * Math.PI) / 180
  // Round off float noise so a quarter turn gives exactly the swapped size.
  const cos = Math.round(Math.abs(Math.cos(radians)) * 1e9) / 1e9
  const sin = Math.round(Math.abs(Math.sin(radians)) * 1e9) / 1e9
  return { widthIn: widthIn * cos + heightIn * sin, heightIn: widthIn * sin + heightIn * cos }
}

/** Free rotation in whole degrees, pulled to straight angles when close so lining up stays easy. */
const STRAIGHT_PULL_DEG = 4
function snapAngle(degrees: number, coarse: boolean) {
  if (coarse) return normalizeAngle(Math.round(degrees / 15) * 15)
  const straight = Math.round(degrees / 90) * 90
  return normalizeAngle(Math.abs(degrees - straight) <= STRAIGHT_PULL_DEG ? straight : Math.round(degrees))
}

/** Print DPI of one copy at its current size. */
export function placedDpi(transfer: ManualTransfer, placement: ManualPlacement) {
  return transfer.pixelWidth ? printDpi(transfer.pixelWidth, transfer.widthIn * (placement.scale ?? 1)) : 0
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
  /** Gang sheet name, shown over the sheet. */
  sheetName: string
  /** Add one more copy of this transfer's design next to it; returns the new copy's key. */
  onDuplicate: (key: string) => string | null
  /** Take this copy off the order (its design's quantity goes down by one). */
  onDelete: (key: string) => void
  /** Set this image's own print size, in inches. Applies to that image only. */
  onSizeDesign?: (designId: number, widthIn: number, heightIn: number) => void
  /** One more copy of this image, same size, waiting to be dragged onto the sheet. */
  onDuplicateDesign?: (designId: number) => void
  /** A separate copy of this image that can be sized on its own. */
  onCopyDesign?: (designId: number) => void
  /** Remove this image and every copy of it. */
  onDeleteDesign?: (designId: number) => void
  /** Drop an image onto the sheet at this point (inches from the film's top-left). */
  onPlaceDesign?: (designId: number, xIn: number, yIn: number) => void
  /** Artwork dropped on the sheet from the computer. */
  onAddFiles?: (files: FileList | File[]) => void
  /** Perspective on keeps this image's shape. Off lets width and height stretch it. */
  onPerspective?: (designId: number, on: boolean) => void
}

/**
 * Drag-and-place editor for the manual builder: a to-scale sheet plus a scrolling
 * list of the customer's uploads. Positions are inches from the sheet's top-left.
 * Nothing can leave the printable area (the black frame): moves, nudges, rotates
 * and resizes are all pulled back inside it.
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
  sheetName,
  onDuplicate,
  onDelete,
  onSizeDesign,
  onDuplicateDesign,
  onCopyDesign,
  onDeleteDesign,
  onPlaceDesign,
  onAddFiles,
  onPerspective,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const [pxPerIn, setPxPerIn] = useState(24)
  const [selected, setSelected] = useState<string | null>(null)
  const drag = useRef<{ key: string; offX: number; offY: number; fromTray: boolean; onSheet: boolean } | null>(null)
  const dragOrigin = useRef({ x: 0, y: 0 })
  const dragMoved = useRef(false)
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number; w: number; h: number } | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const resize = useRef<{ key: string; handle: ResizeHandle; start: { xIn: number; yIn: number; widthIn: number; heightIn: number }; scale: number } | null>(null)
  /** Rotate handle drag: the piece turns about its centre by however far the pointer swings. */
  const turning = useRef<{ key: string; cx: number; cy: number; startAngle: number; pointerStart: number } | null>(null)
  const [turningAngle, setTurningAngle] = useState<number | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const [hitWall, setHitWall] = useState(false)
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [moreBelow, setMoreBelow] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    // Leave room on the left for the length ruler.
    const fit = () => setPxPerIn(Math.max(10, Math.min(40, (wrap.clientWidth - 62) / sheetWidthIn)))
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
  // Every upload keeps its row (even when all its copies are placed), so the list never jumps.
  const uploads = [...new Set(transfers.map((transfer) => transfer.designId))].map((designId) => {
    const copies = transfers.filter((transfer) => transfer.designId === designId)
    return { designId, first: copies[0], copies: copies.length, left: copies.filter((transfer) => !placements[transfer.key]) }
  })
  // drag.current is set before the first placement update, so it holds even on a render
  // where the `dragging` state has not landed yet. Warnings update on drop.
  const activeDrag = drag.current?.key ?? resize.current?.key ?? dragging ?? resizing
  const shownProblems = useRef<string[]>([])

  function flashWall() {
    setHitWall(true)
    if (hitTimer.current) clearTimeout(hitTimer.current)
    hitTimer.current = setTimeout(() => setHitWall(false), 350)
  }
  useEffect(() => () => { if (hitTimer.current) clearTimeout(hitTimer.current) }, [])

  // The frame moved (Pre-cut on, or a shorter working length): pull placed pieces back inside.
  useEffect(() => {
    onPlacementsChange((current) => {
      let changed = false
      const next = { ...current }
      for (const transfer of transfers) {
        const placement = current[transfer.key]
        if (!placement) continue
        const spot = clampToArea({ xIn: placement.xIn, yIn: placement.yIn, ...placedSize(transfer, placement) }, area)
        if (spot.hit) { next[transfer.key] = { ...placement, xIn: spot.xIn, yIn: spot.yIn }; changed = true }
      }
      return changed ? next : current
    })
    // Only when the frame itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.left, area.top, area.right, area.bottom])

  function updateMoreBelow() {
    const tray = trayRef.current
    setMoreBelow(Boolean(tray && tray.scrollTop + tray.clientHeight < tray.scrollHeight - 4))
  }
  useLayoutEffect(updateMoreBelow, [uploads.length])

  function inchesFromEvent(event: { clientX: number; clientY: number }) {
    const rect = sheetRef.current?.getBoundingClientRect()
    if (!rect) return { xIn: 0, yIn: 0 }
    // The view starts at the top of the printable area, so add the hidden strip back in.
    return { xIn: (event.clientX - rect.left) / pxPerIn, yIn: (event.clientY - rect.top) / pxPerIn + area.top }
  }

  /** Where a piece of `size` lands when asked for (xIn, yIn): snapped, then held inside the frame. */
  function landing(xIn: number, yIn: number, size: { widthIn: number; heightIn: number }) {
    const spot = clampToArea({ xIn: snap(xIn), yIn: snap(yIn), ...size }, area)
    if (spot.hit) flashWall()
    return { xIn: spot.xIn, yIn: spot.yIn }
  }

  function moveTo(key: string, xIn: number, yIn: number) {
    const transfer = byKey.get(key)
    if (!transfer) return
    const placement = placements[key] ?? { xIn: 0, yIn: 0 }
    const spot = landing(xIn, yIn, placedSize(transfer, placement))
    onPlacementsChange((current) => ({ ...current, [key]: { ...(current[key] ?? placement), ...spot } }))
  }

  function applyScale(key: string, factor: number, handle: ResizeHandle, start?: { xIn: number; yIn: number; widthIn: number; heightIn: number }, startScale?: number) {
    const transfer = byKey.get(key)
    const placement = placements[key]
    if (!transfer || !placement) return
    const from = start ?? { xIn: placement.xIn, yIn: placement.yIn, ...placedSize(transfer, placement) }
    const result = scaleWithin(from, startScale ?? placement.scale ?? 1, factor, handle, area)
    if (result.hit) flashWall()
    onPlacementsChange((current) => current[key]
      ? { ...current, [key]: { ...current[key], xIn: result.xIn, yIn: result.yIn, scale: result.scale } }
      : current)
  }

  function pointerOverSheet(event: { clientX: number; clientY: number }) {
    const rect = sheetRef.current?.getBoundingClientRect()
    if (!rect) return false
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const turn = turning.current
      if (turn) {
        const angle = snapAngle(turn.startAngle + pointerAngle(event, turn.cx, turn.cy) - turn.pointerStart, event.shiftKey)
        setTurningAngle(angle)
        setAngle(turn.key, angle, turn.cx, turn.cy)
        return
      }
      const sizing = resize.current
      if (sizing) {
        const point = inchesFromEvent(event)
        applyScale(sizing.key, resizeFactor(sizing.start, sizing.handle, point), sizing.handle, sizing.start, sizing.scale)
        return
      }
      const active = drag.current
      if (!active) return
      if (Math.hypot(event.clientX - dragOrigin.current.x, event.clientY - dragOrigin.current.y) > 6) dragMoved.current = true
      if (active.fromTray && !pointerOverSheet(event)) {
        if (active.onSheet) {
          const key = active.key
          active.onSheet = false
          onPlacementsChange((current) => {
            if (!current[key]) return current
            const next = { ...current }
            delete next[key]
            return next
          })
        }
        const transfer = byKey.get(active.key)
        setDropHover(false)
        if (transfer) {
          setGhost({
            src: transfer.previewUrl,
            x: event.clientX - (transfer.widthIn * pxPerIn) / 2,
            y: event.clientY - (transfer.heightIn * pxPerIn) / 2,
            w: Math.max(36, transfer.widthIn * pxPerIn),
            h: Math.max(36, transfer.heightIn * pxPerIn),
          })
        }
        return
      }
      setGhost(null)
      if (active.fromTray) setDropHover(true)
      if (active.fromTray && !active.onSheet) {
        active.onSheet = true
        const transfer = byKey.get(active.key)
        if (!transfer) return
        const point = inchesFromEvent(event)
        const spot = landing(point.xIn - active.offX, point.yIn - active.offY, { widthIn: transfer.widthIn, heightIn: transfer.heightIn })
        onPlacementsChange((current) => ({ ...current, [active.key]: { ...current[active.key], ...spot } }))
        return
      }
      const point = inchesFromEvent(event)
      moveTo(active.key, point.xIn - active.offX, point.yIn - active.offY)
    }
    function onUp() {
      if (turning.current) {
        turning.current = null
        setTurningAngle(null)
        setResizing(null)
        return
      }
      if (resize.current) {
        resize.current = null
        setResizing(null)
        return
      }
      if (!drag.current) return
      const active = drag.current
      drag.current = null
      setDragging(null)
      setGhost(null)
      setDropHover(false)
      if (active.fromTray && !active.onSheet) {
        const transfer = byKey.get(active.key)
        if (transfer && !dragMoved.current) placeOne(transfer)
        return
      }
      requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(active.key)}"]`)?.focus())
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
    event.stopPropagation()
    dragOrigin.current = { x: event.clientX, y: event.clientY }
    dragMoved.current = false
    drag.current = { key: transfer.key, offX: transfer.widthIn / 2, offY: transfer.heightIn / 2, fromTray: true, onSheet: false }
    setDragging(transfer.key)
    setSelected(transfer.key)
    setGhost({
      src: transfer.previewUrl,
      x: event.clientX - (transfer.widthIn * pxPerIn) / 2,
      y: event.clientY - (transfer.heightIn * pxPerIn) / 2,
      w: Math.max(36, transfer.widthIn * pxPerIn),
      h: Math.max(36, transfer.heightIn * pxPerIn),
    })
  }

  /** Keyboard / click placement for an upload row: drop it at the top-left free spot via Auto-arrange. */
  function placeOne(transfer: ManualTransfer) {
    arrange([transfer])
    setSelected(transfer.key)
  }

  function startOnSheet(event: React.PointerEvent, key: string) {
    const placement = placements[key]
    if (!placement) return
    event.preventDefault()
    const point = inchesFromEvent(event)
    drag.current = { key, offX: point.xIn - placement.xIn, offY: point.yIn - placement.yIn, fromTray: false, onSheet: true }
    setDragging(key)
    setSelected(key)
  }

  function startResize(event: React.PointerEvent, key: string, handle: ResizeHandle) {
    const transfer = byKey.get(key)
    const placement = placements[key]
    if (!transfer || !placement) return
    event.preventDefault()
    event.stopPropagation()
    resize.current = { key, handle, start: { xIn: placement.xIn, yIn: placement.yIn, ...placedSize(transfer, placement) }, scale: placement.scale ?? 1 }
    setResizing(key)
  }

  function startRotate(event: React.PointerEvent, key: string) {
    const transfer = byKey.get(key)
    const placement = placements[key]
    if (!transfer || !placement) return
    event.preventDefault()
    event.stopPropagation()
    const size = placedSize(transfer, placement)
    const cx = placement.xIn + size.widthIn / 2
    const cy = placement.yIn + size.heightIn / 2
    turning.current = { key, cx, cy, startAngle: placement.angle ?? 0, pointerStart: pointerAngle(event, cx, cy) }
    setTurningAngle(placement.angle ?? 0)
    setResizing(key)
  }

  /** Pointer direction from (cx, cy), in degrees clockwise from straight up. */
  function pointerAngle(event: { clientX: number; clientY: number }, cx: number, cy: number) {
    const point = inchesFromEvent(event)
    return (Math.atan2(point.xIn - cx, cy - point.yIn) * 180) / Math.PI
  }

  /** Turn a piece to `angle` about (cx, cy), held inside the frame. */
  function setAngle(key: string, angle: number, cx: number, cy: number) {
    const transfer = byKey.get(key)
    const placement = placements[key]
    if (!transfer || !placement || (placement.angle ?? 0) === angle) return
    const size = placedSize(transfer, { ...placement, angle })
    // No ⅛ in snap here, or the centre would wander as the piece turns.
    const spot = clampToArea({ xIn: cx - size.widthIn / 2, yIn: cy - size.heightIn / 2, ...size }, area)
    if (spot.hit) flashWall()
    onPlacementsChange((current) => current[key] ? { ...current, [key]: { ...current[key], angle, xIn: spot.xIn, yIn: spot.yIn } } : current)
  }

  /** Turn a piece to `angle` about its own centre. */
  function turnTo(key: string, angle: number) {
    const transfer = byKey.get(key)
    const placement = placements[key]
    if (!transfer || !placement) return
    const size = placedSize(transfer, placement)
    setAngle(key, normalizeAngle(angle), placement.xIn + size.widthIn / 2, placement.yIn + size.heightIn / 2)
  }

  function rotate(key: string) {
    turnTo(key, (placements[key]?.angle ?? 0) + 90)
  }

  function duplicate(key: string) {
    const copy = onDuplicate(key)
    if (copy) setSelected(copy)
  }

  /** Off the sheet and off the order. */
  function deleteCopy(key: string) {
    onDelete(key)
    setSelected(null)
  }

  /** Back to the uploads tray: off the sheet, still in the order. */
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
      for (const piece of result.pieces) next[piece.key] = { xIn: piece.xIn, yIn: piece.yIn, angle: piece.rotated ? 90 : 0 }
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
    } else if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault()
      duplicate(key)
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault()
      rotate(key)
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      deleteCopy(key)
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
  const rulerStep = workingLengthIn <= 24 ? 6 : 12
  const rulerInches = Array.from({ length: Math.floor(area.bottom - area.top) + 1 }, (_, index) => index)
  const selectedTransfer = selected && placements[selected] ? byKey.get(selected) : undefined
  const selectedPlacement = selected ? placements[selected] : undefined

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
          <button type="button" onClick={() => selected && duplicate(selected)} disabled={!selected || !placements[selected]}>
            <Copy size={16} /> Duplicate
          </button>
          <button type="button" className="danger" onClick={() => selected && deleteCopy(selected)} disabled={!selected || !placements[selected]}>
            <Trash2 size={16} /> Delete
          </button>
          <button type="button" onClick={() => selected && remove(selected)} disabled={!selected || !placements[selected]}>
            <CornerUpLeft size={16} /> Back to tray
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

      {/* Fixed-height list that scrolls inside itself, so many uploads never get cut off or push the sheet down. */}
      <div className="manual-uploads">
        <div className="manual-uploads-head">
          <strong>Your uploads</strong>
          <span>{uploads.length} design{uploads.length === 1 ? '' : 's'} · {unplaced.length ? `${unplaced.length} transfer${unplaced.length === 1 ? '' : 's'} left to place` : 'all placed'}</span>
        </div>
        <div
          className="manual-tray"
          ref={trayRef}
          onScroll={updateMoreBelow}
          aria-label="Your uploaded designs"
          onDragOver={(event) => { if (event.dataTransfer.files?.length) { event.preventDefault(); setDropHover(true) } }}
          onDragLeave={() => setDropHover(false)}
          onDrop={(event) => {
            if (!event.dataTransfer.files?.length) return
            event.preventDefault()
            setDropHover(false)
            onAddFiles?.(event.dataTransfer.files)
          }}
        >
          {uploads.length === 0 && (
            <div className="manual-tray-empty">Drop images here, or use Upload above. Then size, copy, and drag each one onto the sheet.</div>
          )}
          {uploads.map(({ designId, first, copies, left }) => {
            const next = left[0]
            return (
              <div key={designId} className={`manual-tile${next ? '' : ' done'}`}>
                <button
                  type="button"
                  className="manual-tile-art"
                  disabled={!next}
                  title={next ? 'Drag onto the sheet' : 'All copies are on the sheet. Duplicate to add another.'}
                  aria-label={next
                    ? `Drag ${first.name} onto the sheet, ${left.length} of ${copies} left`
                    : `${first.name}: all ${copies} placed`}
                  onPointerDown={(event) => { if (next) startFromTray(event, next) }}
                  onKeyDown={(event) => { if (next && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); placeOne(next) } }}
                >
                  {first.previewUrl ? <img src={first.previewUrl} alt="" draggable={false} /> : null}
                </button>
                <div className="manual-tile-meta">
                  <strong>#{first.designNumber} {first.name}</strong>
                  <span className={`manual-tile-count${next ? '' : ' done'}`}>{next ? `${left.length} of ${copies} left` : '✓ All placed'}</span>
                </div>
                <ImageSizeFields
                  name={first.name}
                  widthIn={first.widthIn}
                  heightIn={first.heightIn}
                  maxWidthIn={sheetWidthIn}
                  lockAspect={!first.stretch}
                  onCommit={(widthIn, heightIn) => onSizeDesign?.(designId, widthIn, heightIn)}
                />
                <PerspectiveToggle checked={!first.stretch} onChange={(on) => onPerspective?.(designId, on)} name={first.name} />
                <div className="manual-tile-actions">
                  <button type="button" onClick={() => onDuplicateDesign?.(designId)}><Copy size={14} /> Duplicate</button>
                  <button type="button" onClick={() => onCopyDesign?.(designId)}><Copy size={14} /> Copy</button>
                  <button type="button" className="danger" onClick={() => onDeleteDesign?.(designId)}><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            )
          })}
        </div>
        {moreBelow && (
          <button type="button" className="manual-tray-more" onClick={() => trayRef.current?.scrollBy({ top: 200, behavior: 'smooth' })}>
            Scroll for more uploads <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Always takes the same space, so selecting a design never moves the sheet under the pointer. */}
      {selectedTransfer && selectedPlacement && selected ? (
        <SizeBox
          key={`${selected}:${selectedPlacement.scale ?? 1}:${selectedPlacement.angle ?? 0}:${selectedTransfer.widthIn}:${selectedTransfer.heightIn}`}
          transfer={selectedTransfer}
          placement={selectedPlacement}
          lockAspect={!selectedTransfer.stretch}
          onScale={(factor) => applyScale(selected, factor, 'se')}
          onAbsoluteSize={(widthIn, heightIn) => onSizeDesign?.(selectedTransfer.designId, widthIn, heightIn)}
          onAngle={(angle) => turnTo(selected, angle)}
        />
      ) : (
        <div className="manual-sizebox empty">
          <strong>Resize or turn a design</strong>
          <span>Click a design on the sheet, then drag a corner or side handle, or type an exact size or angle here.</span>
        </div>
      )}
      <p className="manual-help">
        Set each image&apos;s width and height, then drag it onto the sheet. Duplicate adds another copy of the same size. Copy makes a separate image you can size on its own. Delete removes that image. On the sheet, drag to move a copy, drag a handle to size that copy, Ctrl+D duplicates it, and Delete removes that copy.
      </p>

      {/* One fixed-height line above the sheet, so nothing shifts the sheet while dragging. Full list below. */}
      <p className={`manual-status${problemMessages.length ? ' has-problems' : ''}`} aria-live="polite">
        {problemMessages.length
          ? `${problemMessages.length} to fix: ${problemMessages[0]}`
          : transfers.length === 0
            ? 'Upload an image, then drag it onto the sheet.'
            : unplaced.length
              ? `${unplaced.length} transfer${unplaced.length === 1 ? '' : 's'} left to place.`
              : 'Layout looks good. Every transfer is placed.'}
      </p>

      <div className="manual-sheet-head">
        <strong>{sheetName}</strong>
        <span>{labelWidthIn} × {workingLengthIn} in · drawn to scale</span>
      </div>
      <div className="manual-sheet-wrap" ref={wrapRef}>
        {/* Only the printable stretch is shown: the label strips above and below are ours, not the customer's. */}
        <div
          ref={sheetRef}
          className={`manual-sheet${dropHover ? ' drop-hover' : ''}`}
          style={{ width: sheetWidthIn * pxPerIn, height: (area.bottom - area.top) * pxPerIn }}
          onPointerDown={(event) => { if (event.target === sheetRef.current) setSelected(null) }}
          onDragOver={(event) => {
            const text = event.dataTransfer.types.includes('text/plain')
            if (text || event.dataTransfer.files?.length) { event.preventDefault(); setDropHover(true) }
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDropHover(false)
            if (event.dataTransfer.files?.length) { onAddFiles?.(event.dataTransfer.files); return }
            const match = /^ssgs-design:(\d+)$/.exec(event.dataTransfer.getData('text/plain'))
            if (!match || !onPlaceDesign) return
            const point = inchesFromEvent(event)
            const transfer = transfers.find((item) => item.designId === Number(match[1]))
            onPlaceDesign(Number(match[1]), point.xIn - (transfer?.widthIn ?? 2) / 2, point.yIn - (transfer?.heightIn ?? 2) / 2)
          }}
        >
          {area.left > 0 && <div className="manual-side" style={{ left: 0, width: area.left * pxPerIn }} />}
          {area.left > 0 && <div className="manual-side" style={{ right: 0, width: (sheetWidthIn - area.right) * pxPerIn }} />}
          <div
            className={`manual-frame${hitWall ? ' hit' : ''}`}
            style={{ left: area.left * pxPerIn, width: (area.right - area.left) * pxPerIn }}
            aria-hidden="true"
          />
          {/* Length ruler down the left side: an inch tick every inch, a number every foot. */}
          <div className="manual-ruler" aria-hidden="true">
            {rulerInches.map((inch) => (
              <span key={inch} className={inch % rulerStep === 0 ? 'major' : undefined} style={{ top: inch * pxPerIn }}>
                {inch % rulerStep === 0 && inch > 0 ? <b>{inch}&quot;</b> : null}
              </span>
            ))}
          </div>
          <div className="manual-end-line" style={{ top: workingLengthIn * pxPerIn }} aria-hidden="true">
            <span>{workingLengthIn} in sheet</span>
          </div>
          {placedKeys.map((key) => {
            const transfer = byKey.get(key) as ManualTransfer
            const placement = placements[key]
            const size = placedSize(transfer, placement)
            const art = artSize(transfer, placement)
            const angle = placement.angle ?? 0
            const problem = problems[key]
            const isSelected = selected === key
            const dpi = placedDpi(transfer, placement)
            const quality = qualityFromDpi(dpi)
            return (
              <div
                key={key}
                data-key={key}
                role="button"
                tabIndex={0}
                aria-label={`${transfer.name}, ${round2(size.widthIn)} by ${round2(size.heightIn)} inches${problem ? `. ${problem}` : ''}`}
                className={`manual-piece${isSelected ? ' selected' : ''}${problem ? ' problem' : ''}${dragging === key ? ' dragging' : ''}${transfer.stretch ? ' stretch' : ''}`}
                style={{
                  left: placement.xIn * pxPerIn,
                  top: (placement.yIn - area.top) * pxPerIn,
                  width: size.widthIn * pxPerIn,
                  height: size.heightIn * pxPerIn,
                }}
                onPointerDown={(event) => startOnSheet(event, key)}
                onFocus={() => setSelected(key)}
                onKeyDown={(event) => onPieceKey(event, key)}
              >
                <span className="manual-piece-art">
                  {transfer.previewUrl ? (
                    <img
                      src={transfer.previewUrl}
                      alt=""
                      draggable={false}
                      // Upright size, turned about the centre: the same way the print file draws it.
                      style={angle ? {
                        position: 'absolute', left: '50%', top: '50%',
                        width: art.widthIn * pxPerIn, height: art.heightIn * pxPerIn,
                        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                      } : undefined}
                    />
                  ) : (
                    <span>#{transfer.designNumber}</span>
                  )}
                </span>
                {isSelected && !dragging && (
                  <>
                    {HANDLES.map((handle) => (
                      <span
                        key={handle}
                        className="manual-handle"
                        data-h={handle}
                        onPointerDown={(event) => startResize(event, key, handle)}
                        aria-hidden="true"
                      />
                    ))}
                    <span
                      className="manual-rotate"
                      title="Drag to rotate"
                      onPointerDown={(event) => startRotate(event, key)}
                      aria-hidden="true"
                    >
                      <RotateCw size={13} />
                    </span>
                    {turningAngle !== null && resizing === key && <span className="manual-angle">{Math.round(turningAngle)}°</span>}
                    <span className={`manual-badge ${quality.tone}${placement.xIn + size.widthIn / 2 > sheetWidthIn / 2 ? ' end' : ''}`}>
                      {round2(art.widthIn)} × {round2(art.heightIn)} in{angle ? ` · ${Math.round(angle)}°` : ''}{dpi ? <b> · {dpi} DPI · {quality.label}</b> : null}
                    </span>
                  </>
                )}
              </div>
            )
          })}
          {cutOut && (
            // Drawn in whole-film inches, so shift it up by the hidden top strip and clip the strips off.
            <div className="manual-cut-layer" aria-hidden="true">
              <div style={{ position: 'absolute', left: 0, top: -area.top * pxPerIn, width: '100%', height: filmLengthIn * pxPerIn }}>
                <CutBoxOverlay boxes={cutBoxes} marks={marks} sheetWidthIn={sheetWidthIn} sheetHeightIn={filmLengthIn} />
              </div>
            </div>
          )}
        </div>
      </div>
      {problemMessages.length > 0 && (
        <ul className="manual-problems">
          {problemMessages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
      {ghost && (
        <div className="manual-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} aria-hidden="true">
          {ghost.src ? <img src={ghost.src} alt="" /> : null}
        </div>
      )}
      <p className="manual-legend">
        <span><i className="frame" /> Sheet edge: designs stop here</span>
        {cutOut && <span><i className="zone" /> Cut-mark columns</span>}
        {cutOut && <span><i className="cut" /> Cut line</span>}
        <span><i className="problem" /> Needs fixing</span>
        <span>Drawn to scale · {labelWidthIn} in wide</span>
      </p>
    </div>
  )
}

/** Exact width / height / angle for the selected copy. Proportions stay locked; typing one sets the other. */
function SizeBox({ transfer, placement, lockAspect = true, onScale, onAbsoluteSize, onAngle }: {
  transfer: ManualTransfer
  placement: ManualPlacement
  lockAspect?: boolean
  onScale: (factor: number) => void
  onAbsoluteSize?: (widthIn: number, heightIn: number) => void
  onAngle: (angle: number) => void
}) {
  const size = artSize(transfer, placement)
  const footprint = placedSize(transfer, placement)
  const currentAngle = placement.angle ?? 0
  const [width, setWidth] = useState(String(round2(size.widthIn)))
  const [height, setHeight] = useState(String(round2(size.heightIn)))
  const [angle, setAngleText] = useState(String(round2(currentAngle)))
  const dpi = placedDpi(transfer, placement)
  const quality = qualityFromDpi(dpi)
  function commit(side: 'width' | 'height') {
    const typed = Number(side === 'width' ? width : height)
    if (!(typed >= 0.5)) {
      setWidth(String(round2(size.widthIn)))
      setHeight(String(round2(size.heightIn)))
      return
    }
    if (!lockAspect && onAbsoluteSize) {
      const nextWidth = side === 'width' ? typed : size.widthIn
      const nextHeight = side === 'height' ? typed : size.heightIn
      if (Math.abs(nextWidth - size.widthIn) > 1e-3 || Math.abs(nextHeight - size.heightIn) > 1e-3) onAbsoluteSize(nextWidth, nextHeight)
      return
    }
    const current = side === 'width' ? size.widthIn : size.heightIn
    if (Math.abs(typed - current) > 1e-3) onScale(typed / current)
    else {
      setWidth(String(round2(size.widthIn)))
      setHeight(String(round2(size.heightIn)))
    }
  }
  function commitAngle() {
    const next = Number(angle)
    if (angle.trim() !== '' && Number.isFinite(next) && Math.abs(normalizeAngle(next) - currentAngle) > 1e-3) onAngle(next)
    else setAngleText(String(round2(currentAngle)))
  }
  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') event.currentTarget.blur() }
  return (
    <div className="manual-sizebox">
      <strong>Selected: #{transfer.designNumber} {transfer.name}</strong>
      <div className="manual-sizebox-row">
        <label>Width (in)
          <input type="number" min="0.5" step="0.125" value={width} onChange={(event) => setWidth(event.target.value)} onBlur={() => commit('width')} onKeyDown={onEnter} />
        </label>
        {lockAspect ? <Lock size={14} aria-label="Proportions locked" /> : null}
        <label>Height (in)
          <input type="number" min="0.5" step="0.125" value={height} onChange={(event) => setHeight(event.target.value)} onBlur={() => commit('height')} onKeyDown={onEnter} />
        </label>
        <label>Angle (°)
          <input type="number" min="0" max="359" step="1" value={angle} onChange={(event) => setAngleText(event.target.value)} onBlur={commitAngle} onKeyDown={onEnter} />
        </label>
      </div>
      <span>
        {lockAspect
          ? 'Resizes this copy only. Proportions stay locked so the art never stretches.'
          : 'Perspective is off. This image stretches to the width and height, even if it is taller than it is wide.'}
        {currentAngle ? ` Turned, it takes up ${round2(footprint.widthIn)} × ${round2(footprint.heightIn)} in on the sheet.` : ''}
      </span>
      {dpi > 0 && <span className={`manual-sizebox-quality ${quality.tone}`}>Print quality at this size: {dpi} DPI · {quality.label}</span>}
    </div>
  )
}

/** Width and height for one image in the manual list. Each image keeps its own size. */
function ImageSizeFields({ name, widthIn, heightIn, maxWidthIn, lockAspect = true, onCommit }: {
  name: string
  widthIn: number
  heightIn: number
  maxWidthIn: number
  lockAspect?: boolean
  onCommit: (widthIn: number, heightIn: number) => void
}) {
  const [width, setWidth] = useState(String(round2(widthIn)))
  const [height, setHeight] = useState(String(round2(heightIn)))
  useEffect(() => {
    setWidth(String(round2(widthIn)))
    setHeight(String(round2(heightIn)))
  }, [widthIn, heightIn])
  function reset() {
    setWidth(String(round2(widthIn)))
    setHeight(String(round2(heightIn)))
  }
  /** Locked: one side sets the other. Perspective off: width and height are independent and the art stretches. */
  function commit(side: 'width' | 'height') {
    const typed = Number(side === 'width' ? width : height)
    if (!lockAspect) {
      const nextWidth = side === 'width' ? typed : widthIn
      const nextHeight = side === 'height' ? typed : heightIn
      if (nextWidth < 0.5 || nextHeight < 0.5 || nextWidth > maxWidthIn || nextHeight > 199) { reset(); return }
      if (Math.abs(nextWidth - widthIn) <= 1e-3 && Math.abs(nextHeight - heightIn) <= 1e-3) { reset(); return }
      onCommit(nextWidth, nextHeight)
      return
    }
    const aspect = widthIn > 0 ? heightIn / widthIn : 1
    if (!(typed >= 0.5) || !Number.isFinite(aspect) || aspect <= 0) { reset(); return }
    const nextWidth = side === 'width' ? Math.min(maxWidthIn, typed) : Math.min(maxWidthIn, typed / aspect)
    const nextHeight = nextWidth * aspect
    if (nextWidth < 0.5 || nextHeight < 0.5 || nextHeight > 199) { reset(); return }
    if (Math.abs(nextWidth - widthIn) <= 1e-3 && Math.abs(nextHeight - heightIn) <= 1e-3) { reset(); return }
    onCommit(nextWidth, nextHeight)
  }
  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') event.currentTarget.blur() }
  return (
    <div className="manual-tile-size">
      <label>Width (in)
        <input aria-label={`Width for ${name}`} type="number" min="0.5" max={maxWidthIn} step="0.125" value={width} onChange={(event) => setWidth(event.target.value)} onBlur={() => commit('width')} onKeyDown={onEnter} />
      </label>
      <label>Height (in)
        <input aria-label={`Height for ${name}`} type="number" min="0.5" max="199" step="0.125" value={height} onChange={(event) => setHeight(event.target.value)} onBlur={() => commit('height')} onKeyDown={onEnter} />
      </label>
    </div>
  )
}
