'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, RotateCw } from 'lucide-react'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { SheetLayoutOverlay, pieceKey, type LayoutPiece } from '@/components/sheet-layout-overlay'
import { CUT_MARGIN_IN, MARK_SECTION_IN, type CutBox } from '@/lib/cut-layout'
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
  cutMarks?: Array<CutBox & { first?: boolean }>
  printHeightIn?: number
  /** customer = public builder; shop = production tools with cutter loading notes */
  audience?: 'customer' | 'shop'
  layoutPieces?: LayoutPiece[]
  onResizePiece?: (designId: number, copyIndex: number, factor: number) => void
  onTurnPiece?: (designId: number, copyIndex: number, rotated: boolean) => void
  onResetPiece?: (designId: number, copyIndex: number) => void
  adjustFocusKey?: string | null
  refreshing?: boolean
}

function naturalSize(piece: LayoutPiece) {
  if (piece.rotated) {
    return { widthIn: piece.heightIn, heightIn: piece.widthIn }
  }
  return { widthIn: piece.widthIn, heightIn: piece.heightIn }
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
  cutMarks = [],
  printHeightIn,
  audience = 'shop',
  layoutPieces = [],
  onResizePiece,
  onTurnPiece,
  onResetPiece,
  adjustFocusKey = null,
  refreshing = false,
}: SheetPreviewModalProps) {
  const paneRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const fitZoomRef = useRef(true)
  const zoomScaleRef = useRef(1)
  const adjustModeRef = useRef(false)
  const selectedKeyRef = useRef<string | null>(null)
  const [pixels, setPixels] = useState({ width: 0, height: 0 })
  const [fitZoom, setFitZoom] = useState(true)
  const [zoomScale, setZoomScale] = useState(1)
  const [fitBox, setFitBox] = useState({ width: 0, height: 0 })
  const [adjustMode, setAdjustMode] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const sheetHeightIn = printHeightIn || sheetLengthIn
  const canAdjust = !cutOut && layoutPieces.length > 0 && Boolean(onResizePiece)
  const selected = layoutPieces.find((piece) => pieceKey(piece) === selectedKey) ?? null

  useEffect(() => {
    adjustModeRef.current = adjustMode
  }, [adjustMode])

  useEffect(() => {
    selectedKeyRef.current = selectedKey
  }, [selectedKey])

  useEffect(() => {
    if (adjustFocusKey) {
      setSelectedKey(adjustFocusKey)
      setAdjustMode(true)
    }
  }, [adjustFocusKey])

  useEffect(() => {
    if (!canAdjust && adjustMode) setAdjustMode(false)
  }, [canAdjust, adjustMode])

  useEffect(() => {
    if (!selectedKey) return
    if (!layoutPieces.some((piece) => pieceKey(piece) === selectedKey)) {
      setSelectedKey(null)
    }
  }, [layoutPieces, selectedKey])

  useEffect(() => {
    let active = true
    readImageSize(url).then((size) => {
      if (active) setPixels(size)
    })
    return () => {
      active = false
    }
  }, [url])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

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
  }, [pixels.width, pixels.height, fitZoom])

  function currentDisplayScale() {
    if (!fitZoomRef.current) return zoomScaleRef.current
    if (!pixels.width || fitBox.width <= 0) return 1
    return fitBox.width / pixels.width
  }

  function applyZoom(nextScale: number, origin?: { x: number; y: number; left: number; top: number }) {
    const pane = paneRef.current
    const current = Math.max(0.01, currentDisplayScale())
    const clamped = Math.max(0.01, Math.min(8, nextScale))
    zoomScaleRef.current = clamped
    fitZoomRef.current = false
    setFitZoom(false)
    setZoomScale(clamped)
    requestAnimationFrame(() => {
      if (!pane) return
      if (origin) {
        const ratio = clamped / current
        pane.scrollLeft = origin.x * ratio - origin.left
        pane.scrollTop = origin.y * ratio - origin.top
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
      if (
        adjustModeRef.current &&
        selectedKeyRef.current &&
        onResizePiece
      ) {
        const piece = layoutPieces.find((item) => pieceKey(item) === selectedKeyRef.current)
        if (piece) {
          onResizePiece(piece.designId, piece.copyIndex, event.deltaY < 0 ? 1.03 : 1 / 1.03)
          return
        }
      }
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
  }, [pixels.width, layoutPieces, onResizePiece])

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

  const natural = selected ? naturalSize(selected) : null

  return (
    <div
      className="size-popup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section className="sheet-preview-popup" role="dialog" aria-modal="true" aria-labelledby="sheet-preview-title">
        <div className="inspect-head">
          <div>
            <span className="eyebrow">Gang sheet preview</span>
            <h2 id="sheet-preview-title">{sheetLabel}</h2>
            <p>
              {SHEET_WIDTH_IN} in wide · {sheetLengthIn} in long · {totalTransfers} transfers.
              {cutOut
                ? cropMarkPreviewCopy(cutMarks.length, audience)
                : ' Scroll or zoom to inspect the layout. Turn on Adjust sizes to nudge a design by hand.'}
            </p>
          </div>
          <button className="size-popup-close" aria-label="Close gang sheet preview" onClick={onClose} disabled={saving}>
            ×
          </button>
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
          {canAdjust && (
            <button
              type="button"
              className={`adjust-toggle${adjustMode ? ' selected' : ''}`}
              aria-pressed={adjustMode}
              onClick={() => {
                setAdjustMode((current) => {
                  if (current) setSelectedKey(null)
                  return !current
                })
              }}
            >
              Adjust sizes
            </button>
          )}
        </div>

        {adjustMode && selected && natural && (
          <div className="adjust-bar" aria-live="polite">
            <div className="adjust-bar-copy">
              <strong>{selected.name}</strong>
              <span>
                {formatInches(natural.widthIn)} × {formatInches(natural.heightIn)} in
                {selected.rotated ? ' · turned' : ''}
              </span>
            </div>
            <div className="adjust-bar-actions">
              <button
                type="button"
                aria-label="Make smaller"
                onClick={() => onResizePiece?.(selected.designId, selected.copyIndex, 1 / 1.03)}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                aria-label="Make larger"
                onClick={() => onResizePiece?.(selected.designId, selected.copyIndex, 1.03)}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={() => onTurnPiece?.(selected.designId, selected.copyIndex, !selected.rotated)}
              >
                <RotateCw size={14} /> {selected.rotated ? 'Upright' : 'Turn'}
              </button>
              <button type="button" onClick={() => onResetPiece?.(selected.designId, selected.copyIndex)}>
                Reset
              </button>
            </div>
          </div>
        )}
        {adjustMode && !selected && (
          <p className="adjust-hint">Click a design box to select it. Scroll to resize, or use + / −.</p>
        )}

        <div className={`sheet-preview-stage${refreshing ? ' refreshing' : ''}`}>
          <div ref={paneRef} className={`inspect-frame on-check ${fitZoom ? 'zoom-fit' : 'zoom-manual'}`}>
            <div className="inspect-zoom-inner">
              <div className="inspect-media sheet-media" style={zoomStyle}>
                <img
                  ref={imageRef}
                  src={url}
                  alt="Full gang sheet preview"
                  className={fitZoom ? 'fit' : 'actual'}
                />
                <SheetLayoutOverlay
                  pieces={layoutPieces}
                  sheetWidthIn={SHEET_WIDTH_IN}
                  sheetHeightIn={sheetHeightIn}
                  selectable={adjustMode}
                  selectedKey={selectedKey}
                  onSelect={(piece) => {
                    const key = pieceKey(piece)
                    setSelectedKey((current) => (current === key ? null : key))
                  }}
                />
                {cutOut && (
                  <CutBoxOverlay
                    boxes={cutBoxes}
                    marks={cutMarks}
                    sheetWidthIn={SHEET_WIDTH_IN}
                    sheetHeightIn={sheetHeightIn}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sheet-preview-actions">
          <button type="button" className="knockout-white" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="button" className="confirm-button sheet-preview-confirm" disabled={saving} onClick={onConfirm}>
            <Check size={18} />{' '}
            {saving ? 'Adding to cart…' : audience === 'customer' ? 'Add to Cart' : 'Confirm & Build Gang Sheet'}
          </button>
        </div>
      </section>
    </div>
  )
}
