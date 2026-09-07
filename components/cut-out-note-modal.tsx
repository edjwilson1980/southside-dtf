'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

const BUILDER_URL = 'https://southsidedtf.com/build-my-gangsheet/'

type CutOutNoteModalProps = {
  open: boolean
  onContinue: () => void
}

export function CutOutNoteModal({ open, onContinue }: CutOutNoteModalProps) {
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
        event.preventDefault()
        onContinue()
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
  }, [open, onContinue])

  if (!open) return null

  return (
    <div
      className="size-popup-backdrop cut-out-note-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onContinue()
      }}
    >
      <section
        ref={dialogRef}
        className="size-popup cut-out-note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="size-popup-header">
          <div>
            <h2 id={titleId}>Want your transfers cut out?</h2>
            <p>
              We cut sheets that are laid out in our builder — that&apos;s how we know where each
              transfer sits and can leave room for the blade. Uploaded sheets print as one piece.
            </p>
            <p>
              If you&apos;d like your transfers cut and ready to press, build your sheet with Build A
              Gang Sheet instead.
            </p>
          </div>
          <button
            type="button"
            className="size-popup-close"
            aria-label="Continue with my upload"
            onClick={onContinue}
          >
            <X size={22} />
          </button>
        </div>

        <div className="cut-out-note-actions">
          <button type="button" className="cut-out-note-continue" onClick={onContinue}>
            Continue with my upload
          </button>
          <a
            className="cut-out-note-builder"
            href={BUILDER_URL}
            target="_top"
            rel="noopener noreferrer"
            title="Leaves this page — your upload will not carry over"
          >
            Try Build A Gang Sheet
            <small>Leaves this page — your upload won&apos;t carry over</small>
          </a>
        </div>
      </section>
    </div>
  )
}
