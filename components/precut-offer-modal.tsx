'use client'

import { useEffect, useId, useRef } from 'react'
import { Scissors, X } from 'lucide-react'

type PrecutOfferModalProps = {
  open: boolean
  transfers: number
  rateEach: number
  precutTotal: number
  sheetPrice: number
  busy?: boolean
  onAccept: () => void
  onDecline: () => void
  onCancel: () => void
}

export function PrecutOfferModal({
  open,
  transfers,
  rateEach,
  precutTotal,
  sheetPrice,
  busy = false,
  onAccept,
  onDecline,
  onCancel,
}: PrecutOfferModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (busy) return
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const rateLabel = rateEach.toFixed(2)
  const totalLabel = precutTotal.toFixed(2)
  const sheetLabel = sheetPrice.toFixed(2)

  return (
    <div
      className="size-popup-backdrop precut-offer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (busy) return
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        className="size-popup precut-offer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="size-popup-header">
          <div>
            <span className="eyebrow">Optional add-on</span>
            <h2 id={titleId}>Want us to cut them out for you?</h2>
            <p>
              Pre-cut means we cut each transfer out individually, so there is no trimming by hand
              when your order arrives.
            </p>
          </div>
          <button
            type="button"
            className="size-popup-close"
            aria-label="Cancel and return to builder"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={22} />
          </button>
        </div>

        <div className="precut-offer-math">
          <p>
            {transfers} transfer{transfers === 1 ? '' : 's'} × ${rateLabel} each
          </p>
          <strong>Add pre-cut for ${totalLabel}</strong>
          <span>Your gang sheet price stays the same — ${sheetLabel}.</span>
        </div>

        <div className="precut-offer-actions">
          <button
            type="button"
            className="precut-offer-accept"
            disabled={busy}
            onClick={onAccept}
          >
            <Scissors size={18} />
            {busy ? 'Adding pre-cut…' : `Add pre-cut — $${totalLabel}`}
          </button>
          <button
            type="button"
            className="precut-offer-decline"
            disabled={busy}
            onClick={onDecline}
          >
            No thanks, continue
          </button>
        </div>
      </section>
    </div>
  )
}
