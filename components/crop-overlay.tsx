'use client'

import { useRef } from 'react'
import { normalizeCrop, type CropRect } from '@/lib/crop-image'

const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof handles)[number]

type CropOverlayProps = {
  crop: CropRect
  imageWidth: number
  imageHeight: number
  onChange: (crop: CropRect) => void
}

export function CropOverlay({ crop, imageWidth, imageHeight, onChange }: CropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    type: 'move' | Handle
    startX: number
    startY: number
    start: CropRect
  } | null>(null)

  function pointFromEvent(event: React.PointerEvent) {
    const bounds = overlayRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * imageWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * imageHeight,
    }
  }

  function startDrag(event: React.PointerEvent, type: 'move' | Handle) {
    event.preventDefault()
    event.stopPropagation()
    const point = pointFromEvent(event)
    dragRef.current = { type, startX: point.x, startY: point.y, start: crop }
    overlayRef.current?.setPointerCapture(event.pointerId)
  }

  function applyDrag(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const point = pointFromEvent(event)
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY
    const next = { ...drag.start }

    if (drag.type === 'move') {
      next.x = drag.start.x + dx
      next.y = drag.start.y + dy
    } else {
      if (drag.type.includes('w')) {
        next.x = drag.start.x + dx
        next.width = drag.start.width - dx
      }
      if (drag.type.includes('e')) next.width = drag.start.width + dx
      if (drag.type.includes('n')) {
        next.y = drag.start.y + dy
        next.height = drag.start.height - dy
      }
      if (drag.type.includes('s')) next.height = drag.start.height + dy
    }

    onChange(normalizeCrop(next, imageWidth, imageHeight))
  }

  return (
    <div
      ref={overlayRef}
      className="crop-overlay"
      onPointerMove={applyDrag}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
    >
      <div className="crop-box" style={{
        left: `${(crop.x / imageWidth) * 100}%`,
        top: `${(crop.y / imageHeight) * 100}%`,
        width: `${(crop.width / imageWidth) * 100}%`,
        height: `${(crop.height / imageHeight) * 100}%`,
      }} onPointerDown={(event) => startDrag(event, 'move')}>
        {handles.map((handle) => (
          <span
            key={handle}
            className={`crop-handle crop-handle-${handle}`}
            onPointerDown={(event) => startDrag(event, handle)}
          />
        ))}
      </div>
    </div>
  )
}
