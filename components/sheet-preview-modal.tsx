'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { CutShapeOverlay } from '@/components/cut-shape-overlay'
import { SheetLayoutOverlay, type LayoutPiece } from '@/components/sheet-layout-overlay'
import { CUT_MARGIN_IN, MARK_SECTION_IN, type CutBox } from '@/lib/cut-layout'
import { type CutShape } from '@/lib/custom-cut'
import { readImageSize } from '@/lib/image-utils'
import { formatInches } from '@/lib/measure-file'
import { SHEET_WIDTH_IN } from '@/lib/compose-sheet'

function cropMarkPreviewCopy(markCount: number, audience: 'customer' | 'shop') {
  const countLabel = markCount === 4 ? 'four' : markCount === 6 ? 'six' : String(markCount)
  const cutMargin = formatInches(CUT_MARGIN_IN, 1)
  if (audience === 'customer') {
    return `Black 5 mm circles (${countLabel}) print in the margins for our cutter — not on your art. Red boxes are ${cutMargin} in cut lines (preview only). Add the sheet to your cart when you are ready to order.`
  }
  return `The ${countLabel} black 5 mm circles ARE printed on the PNG for the cutter camera, in the margins — not on the designs. Lay the sheet on the bed UPSIDE DOWN, so the bottom of this preview goes in first and the job name reads back to front. Park the camera on what is then the nearest circle: the BOTTOM-RIGHT one in this preview, with the arrow beside it. The cut file is built for that corner, so loading the sheet the right way up will cut mirrored. Mark rows are evenly spaced, never more than ${MARK_SECTION_IN} in apart, so the cutter always reaches the next pair before it runs out of travel and can stop, advance the belt and pick them up. Overlay crop marks are red circles. Red rectangles are the image plus ${cutMargin} in cut lines.`
}

const zoomPresets = [
  { id: 'fit', label: 'Fit' },
  { id: '0.5', label: '50%' },
  { id: '1', label: '100%' },
  { id: '2', label: '200%' },
  { id: '4', label: '400%' },
] as const

/** Close-up ceiling: 16× a 150 ppi sheet is enough to see a single pixel's edge. */
const MAX_ZOOM = 16

const TAN_GRAY = '#c4b8a8'

/** Backgrounds to proof the sheet against — the garment colours we print on most. */
const backdropPresets = [
  { id: 'check', label: 'Checker' },
  { id: TAN_GRAY, label: 'Tan gray' },
  { id: '#ffffff', label: 'White' },
  { id: '#111111', label: 'Black' },
  { id: '#1e3a5f', label: 'Navy' },
  { id: '#cf202d', label: 'Red' },
  { id: '#6b7280', label: 'Gray' },
] as const

type SheetPreviewModalProps = {
  url: string
  sheetLabel: string
  sheetLengthIn: number
  totalTransfers: number
  saving: boolean
  onClose: () => void
  onConfirm: () => void
  cutOut?: boolean
  cutBoxes?: CutBox[]
  /** When set, draws true Square Cut paths instead of only boxes. */
  cutShapes?: CutShape[]
  cutMarks?: Array<CutBox & { first?: boolean }>
  printHeightIn?: number
  /** Defaults to roll printable width; sticker-maker jobs pass a media width. */
  sheetWidthIn?: number
  /** customer = public builder; shop = production tools with cutter loading notes */
  audience?: 'customer' | 'shop'
  layoutPieces?: LayoutPiece[]
  confirmLabel?: string
  /** Multi-sheet jobs: 0-based sheet being shown and how many there are. */
  pageIndex?: number
  pageCount?: number
  onPageChange?: (index: number) => void
}

export function SheetPreviewModal({
  url,
  sheetLabel,
  sheetLengthIn,
  totalTransfers,
  saving,
  onClose,
  onConfirm,
  cutOut = false,
  cutBoxes = [],
  cutShapes = [],
  cutMarks = [],
  printHeightIn,
  sheetWidthIn = SHEET_WIDTH_IN,
  audience = 'shop',
  layoutPieces = [],
  confirmLabel,
  pageIndex = 0,
  pageCount = 1,
  onPageChange,
}: SheetPreviewModalProps) {
  const paged = pageCount > 1 && typeof onPageChange === 'function'
  const dialogRef = useRef<HTMLElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const fitZoomRef = useRef(true)
  const zoomScaleRef = useRef(1)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const [pixels, setPixels] = useState({ width: 0, height: 0 })
  const [fitZoom, setFitZoom] = useState(true)
  const [zoomScale, setZoomScale] = useState(1)
  const [fitBox, setFitBox] = useState({ width: 0, height: 0 })
  const [backdrop, setBackdrop] = useState<'check' | 'color'>('check')
  const [backdropColor, setBackdropColor] = useState<string>(TAN_GRAY)
  const [showOverlays, setShowOverlays] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [dragging, setDragging] = useState(false)

  const sheetHeightIn = printHeightIn || sheetLengthIn

  useEffect(() => {
    let active = true
    readImageSize(url).then((size) => {
      if (active) setPixels(size)
    })
    return () => {
      active = false
    }
  }, [url])

  const exitFullscreen = useCallback(() => {
    setFullscreen(false)
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  const enterFullscreen = useCallback(() => {
    setFullscreen(true)
    // Native fullscreen where the browser allows it; the CSS class alone still
    // fills the window (and is what iOS Safari gets).
    const dialog = dialogRef.current
    if (dialog && typeof dialog.requestFullscreen === 'function' && !document.fullscreenElement) {
      dialog.requestFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement) return
      if (fullscreen) {
        exitFullscreen()
        return
      }
      if (!saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving, fullscreen, exitFullscreen])

  // The browser leaves native fullscreen on Esc by itself; fall back to the
  // windowed layout when it does.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const pane = paneRef.current
    if (!pane || pixels.width <= 0 || pixels.height <= 0) return
    const measure = () => {
      const pad = 24
      const availW = Math.max(1, pane.clientWidth - pad)
      const availH = Math.max(1, pane.clientHeight - pad)
      const scale = Math.min(availW / pixels.width, availH / pixels.height)
      setFitBox({
        width: Math.max(1, Math.round(pixels.width * scale)),
        height: Math.max(1, Math.round(pixels.height * scale)),
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [pixels.width, pixels.height, fitZoom, fullscreen])

  function currentDisplayScale() {
    if (!fitZoomRef.current) return zoomScaleRef.current
    if (!pixels.width || fitBox.width <= 0) return 1
    return fitBox.width / pixels.width
  }

  function applyZoom(nextScale: number, origin?: { x: number; y: number; left: number; top: number }) {
    const pane = paneRef.current
    const current = Math.max(0.01, currentDisplayScale())
    const clamped = Math.max(0.01, Math.min(MAX_ZOOM, nextScale))
    zoomScaleRef.current = clamped
    fitZoomRef.current = false
    setFitZoom(false)
    setZoomScale(clamped)
    // Without a pointer position, zoom about the middle of what is on screen so
    // a preset or the +/− buttons stay on the spot being inspected. In Fit the
    // sheet is centred in the pane, so measure from the image, not the pane.
    const anchor =
      origin ??
      (() => {
        if (!pane) return undefined
        const image = imageRef.current
        const paneRect = pane.getBoundingClientRect()
        const imageRect = image?.getBoundingClientRect()
        const left = paneRect.width / 2
        const top = paneRect.height / 2
        if (fitZoomRef.current && imageRect) {
          const sx = pixels.width / Math.max(1, imageRect.width)
          const sy = pixels.height / Math.max(1, imageRect.height)
          const imgX = (paneRect.left + left - imageRect.left) * sx
          const imgY = (paneRect.top + top - imageRect.top) * sy
          return { x: imgX * current, y: imgY * current, left, top }
        }
        return { x: left + pane.scrollLeft, y: top + pane.scrollTop, left, top }
      })()
    requestAnimationFrame(() => {
      if (!pane) return
      if (anchor) {
        const ratio = clamped / current
        pane.scrollLeft = anchor.x * ratio - anchor.left
        pane.scrollTop = anchor.y * ratio - anchor.top
        return
      }
      pane.scrollLeft = 0
      pane.scrollTop = 0
    })
  }

  function applyFit() {
    const pane = paneRef.current
    fitZoomRef.current = true
    setFitZoom(true)
    if (pane) {
      pane.scrollLeft = 0
      pane.scrollTop = 0
    }
  }

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = pane.getBoundingClientRect()
      applyZoom(currentDisplayScale() * (event.deltaY < 0 ? 1.12 : 1 / 1.12), {
        x: event.clientX - rect.left + pane.scrollLeft,
        y: event.clientY - rect.top + pane.scrollTop,
        left: event.clientX - rect.left,
        top: event.clientY - rect.top,
      })
    }

    pane.addEventListener('wheel', onWheel, { passive: false })
    return () => pane.removeEventListener('wheel', onWheel)
  }, [pixels.width, fitBox.width])

  /** Drag to pan once zoomed in, so a close-up of an edge can be walked along. */
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (fitZoom || event.button !== 0) return
    const pane = paneRef.current
    if (!pane) return
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: pane.scrollLeft,
      top: pane.scrollTop,
    }
    pane.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const pane = paneRef.current
    if (!drag || !pane || drag.pointerId !== event.pointerId) return
    pane.scrollLeft = drag.left - (event.clientX - drag.x)
    pane.scrollTop = drag.top - (event.clientY - drag.y)
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const pane = paneRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (pane?.hasPointerCapture(event.pointerId)) pane.releasePointerCapture(event.pointerId)
  }

  /** Double-click zooms in on that spot; with Fit active it jumps to 100%. */
  function onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const pane = paneRef.current
    if (!pane) return
    const rect = pane.getBoundingClientRect()
    const current = currentDisplayScale()
    const next = fitZoom ? Math.max(1, current * 2) : current * 2
    applyZoom(next, {
      x: event.clientX - rect.left + pane.scrollLeft,
      y: event.clientY - rect.top + pane.scrollTop,
      left: event.clientX - rect.left,
      top: event.clientY - rect.top,
    })
  }

  const frameStyle = backdrop === 'color' ? ({ backgroundColor: backdropColor } as React.CSSProperties) : undefined

  const zoomStyle =
    !fitZoom && pixels.width > 0 && pixels.height > 0
      ? ({
          width: `${Math.max(1, Math.round(pixels.width * zoomScale))}px`,
          height: `${Math.max(1, Math.round(pixels.height * zoomScale))}px`,
          imageRendering: zoomScale > 1.01 ? 'pixelated' : 'auto',
        } as React.CSSProperties)
      : fitBox.width > 0 && fitBox.height > 0
        ? ({ width: `${fitBox.width}px`, height: `${fitBox.height}px` } as React.CSSProperties)
        : pixels.width > 0 && pixels.height > 0
          ? ({ aspectRatio: `${pixels.width} / ${pixels.height}` } as React.CSSProperties)
          : undefined

  return (
    <div
      className={`size-popup-backdrop${fullscreen ? ' sheet-preview-fullscreen-backdrop' : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !fullscreen) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className={`sheet-preview-popup${fullscreen ? ' fullscreen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-preview-title"
      >
        <div className="inspect-head">
          <div>
            <span className="eyebrow">Gang sheet preview</span>
            <h2 id="sheet-preview-title">{sheetLabel}</h2>
            <p>
              {sheetWidthIn} in wide · {sheetLengthIn} in long · {totalTransfers} transfers.
              {cutOut
                ? cropMarkPreviewCopy(cutMarks.length, audience)
                : ' Scroll or zoom to inspect the layout. Black boxes mark the film edge and each design.'}
              {' '}Pick a background to proof it on a garment colour, zoom in for a close-up of the edges, or open it full screen.
            </p>
          </div>
          <div className="sheet-preview-head-actions">
            <button
              type="button"
              className="sheet-preview-expand"
              aria-pressed={fullscreen}
              aria-label={fullscreen ? 'Exit full screen' : 'View full screen'}
              title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
              onClick={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
            </button>
            <button className="size-popup-close" aria-label="Close gang sheet preview" onClick={onClose} disabled={saving}>
              ×
            </button>
          </div>
        </div>

        <div className="inspect-toolbar">
          <div className="inspect-zooms">
            <button type="button" className={fitZoom ? 'selected' : ''} onClick={applyFit}>
              Fit
            </button>
            {zoomPresets
              .filter((level) => level.id !== 'fit')
              .map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={!fitZoom && Math.abs(zoomScale - Number(level.id)) < 0.05 ? 'selected' : ''}
                  onClick={() => applyZoom(Number(level.id))}
                >
                  {level.label}
                </button>
              ))}
            <button type="button" aria-label="Zoom out" onClick={() => applyZoom(currentDisplayScale() / 1.25)}>
              <Minus size={13} />
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => applyZoom(currentDisplayScale() * 1.25)}>
              <Plus size={13} />
            </button>
            <span className="zoom-readout">{fitZoom ? 'Fit' : `${Math.round(zoomScale * 100)}%`}</span>
          </div>
          {paged && (
            <div className="sheet-pager" role="group" aria-label="Sheet">
              <button
                type="button"
                aria-label="Previous sheet"
                disabled={pageIndex <= 0}
                onClick={() => onPageChange?.(Math.max(0, pageIndex - 1))}
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={index === pageIndex ? 'selected' : ''}
                  aria-current={index === pageIndex ? 'true' : undefined}
                  onClick={() => onPageChange?.(index)}
                >
                  {index + 1}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next sheet"
                disabled={pageIndex >= pageCount - 1}
                onClick={() => onPageChange?.(Math.min(pageCount - 1, pageIndex + 1))}
              >
                <ChevronRight size={14} />
              </button>
              <span className="zoom-readout">Sheet {pageIndex + 1} of {pageCount}</span>
            </div>
          )}
        </div>

        <div className="inspect-toolbar sheet-preview-backdrops">
          <div className="inspect-view-toggles" role="group" aria-label="Preview background">
            <span className="zoom-readout">Background</span>
            {backdropPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  (preset.id === 'check' ? backdrop === 'check' : backdrop === 'color' && backdropColor === preset.id)
                    ? 'selected'
                    : ''
                }
                onClick={() => {
                  if (preset.id === 'check') setBackdrop('check')
                  else {
                    setBackdrop('color')
                    setBackdropColor(preset.id)
                  }
                }}
              >
                {preset.id !== 'check' && <i className="backdrop-swatch" style={{ background: preset.id }} aria-hidden="true" />}
                {preset.label}
              </button>
            ))}
            <label
              className={`backdrop-picker ${
                backdrop === 'color' && !backdropPresets.some((preset) => preset.id === backdropColor) ? 'selected' : ''
              }`}
            >
              <i
                className="backdrop-swatch"
                style={{ background: backdrop === 'color' ? backdropColor : TAN_GRAY }}
                aria-hidden="true"
              />
              <span>Pick</span>
              <input
                type="color"
                value={backdrop === 'color' ? backdropColor : TAN_GRAY}
                aria-label="Pick a preview background color"
                onChange={(event) => {
                  setBackdrop('color')
                  setBackdropColor(event.target.value)
                }}
              />
            </label>
          </div>
          <div className="inspect-view-toggles">
            <button
              type="button"
              className={showOverlays ? '' : 'selected'}
              aria-pressed={!showOverlays}
              title="Hide the red cut lines and layout boxes to check the printed edges"
              onClick={() => setShowOverlays((value) => !value)}
            >
              {showOverlays ? <EyeOff size={12} /> : <Eye size={12} />} {showOverlays ? 'Hide guides' : 'Show guides'}
            </button>
          </div>
        </div>

        <div className="sheet-preview-stage">
          <div
            ref={paneRef}
            className={`inspect-frame ${backdrop === 'check' ? 'on-check' : 'on-color'} ${fitZoom ? 'zoom-fit' : 'zoom-manual'}${dragging ? ' dragging' : ''}`}
            style={frameStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          >
            <div className="inspect-zoom-inner">
              <div className="inspect-media sheet-media" style={zoomStyle}>
                <img
                  ref={imageRef}
                  src={url}
                  alt="Full gang sheet preview"
                  className={fitZoom ? 'fit' : 'actual'}
                  draggable={false}
                />
                {showOverlays && (
                  <SheetLayoutOverlay
                    pieces={layoutPieces}
                    sheetWidthIn={sheetWidthIn}
                    sheetHeightIn={sheetHeightIn}
                  />
                )}
                {!showOverlays ? null : cutOut && cutShapes.length > 0 ? (
                  <CutShapeOverlay
                    shapes={cutShapes}
                    marks={cutMarks}
                    sheetWidthIn={sheetWidthIn}
                    sheetHeightIn={sheetHeightIn}
                  />
                ) : cutOut ? (
                  <CutBoxOverlay
                    boxes={cutBoxes}
                    marks={cutMarks}
                    sheetWidthIn={sheetWidthIn}
                    sheetHeightIn={sheetHeightIn}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="sheet-preview-actions">
          <button type="button" className="knockout-white" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button
            type="button"
            className="confirm-button sheet-preview-confirm"
            disabled={saving}
            onClick={onConfirm}
          >
            <Check size={18} />{' '}
            {saving
              ? 'Adding to cart…'
              : confirmLabel ||
                (audience === 'customer' ? 'Add to Cart' : 'Confirm & Build Gang Sheet')}
          </button>
        </div>
      </section>
    </div>
  )
}
