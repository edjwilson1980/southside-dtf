'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'

/**
 * Every stage between "Add to Cart" and the store's cart page, in order. The
 * paperwork stage writes the image list for every job and the press sheet too
 * for Print & Press jobs.
 */
export type CartStep = 'compose' | 'art' | 'paperwork' | 'upload' | 'record' | 'cart' | 'done' | 'error'

export type CartProgress = {
  step: CartStep
  /** Short status under the step label, e.g. "Sheet 2 of 3"; the message when step is 'error'. */
  detail?: string
  /** 0–1 progress inside the current step when it can be measured. */
  fraction?: number | null
}

type StepSpec = { key: CartStep; label: string; weight: number }

function stepsFor(options: { sheetCount: number; cutOut: boolean; pressSheet: boolean }): StepSpec[] {
  const sheets = options.sheetCount > 1 ? `${options.sheetCount} sheets` : 'your sheet'
  return [
    { key: 'compose', label: options.cutOut ? `Building print + cut files for ${sheets}` : `Building the print file for ${sheets}`, weight: 25 },
    { key: 'art', label: 'Packing your artwork', weight: 8 },
    { key: 'paperwork', label: options.pressSheet ? 'Writing the image list + press sheet' : 'Writing the image list', weight: 5 },
    { key: 'upload', label: 'Uploading to Google Drive', weight: 45 },
    { key: 'record', label: 'Saving your project', weight: 5 },
    { key: 'cart', label: 'Adding to your cart', weight: 12 },
  ]
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

export function CartProgressOverlay(props: {
  progress: CartProgress
  startedAt: number
  sheetCount: number
  cutOut: boolean
  pressSheet: boolean
  /** Inside the store iframe the page does not scroll, so the card is placed next to
   *  where the customer clicked instead of the middle of a very tall frame. */
  framed: boolean
  anchorTop: number | null
  /** Dismisses the failure card. */
  onClose?: () => void
}) {
  const { progress, startedAt, framed, anchorTop } = props
  const steps = stepsFor({ sheetCount: props.sheetCount, cutOut: props.cutOut, pressSheet: props.pressSheet })
  const currentIndex = progress.step === 'done' ? steps.length : Math.max(0, steps.findIndex((step) => step.key === progress.step))
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0)
  const doneWeight = steps.slice(0, currentIndex).reduce((sum, step) => sum + step.weight, 0)
  const current = steps[currentIndex]
  const within = current ? current.weight * Math.min(1, Math.max(0, progress.fraction ?? 0)) : 0
  const percent = progress.step === 'done' ? 100 : Math.min(99, Math.round(((doneWeight + within) / totalWeight) * 100))
  const measured = progress.fraction != null && progress.step !== 'done'

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = () => setElapsed(Date.now() - startedAt)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const cardRef = useRef<HTMLDivElement | null>(null)
  const [top, setTop] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!framed) return
    const card = cardRef.current
    const cardHeight = card?.offsetHeight || 380
    const docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight)
    const wanted = (anchorTop ?? window.innerHeight / 2) - cardHeight / 2
    setTop(Math.max(16, Math.min(wanted, docHeight - cardHeight - 16)))
  }, [framed, anchorTop, props.pressSheet])

  const slow = elapsed > 45_000

  if (progress.step === 'error') {
    return (
      <div className={`cart-progress-backdrop${framed ? ' framed' : ''}`} role="presentation">
        <div
          ref={cardRef}
          className="cart-progress-card failed"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cart-progress-title"
          style={framed && top != null ? { top } : undefined}
        >
          <div className="cart-progress-head">
            <div>
              <span className="eyebrow">Could not add to cart</span>
              <h2 id="cart-progress-title">Something went wrong</h2>
            </div>
            <span className="cart-progress-fail-icon" aria-hidden="true">
              <AlertTriangle size={20} />
            </span>
          </div>
          <p className="cart-progress-error">{progress.detail || 'Could not add this sheet to the cart.'}</p>
          <p className="cart-progress-note">
            Nothing was added or charged. Your designs are still here — fix the issue above and click Add to Cart again. If it keeps failing, contact us and mention the time: {new Date().toLocaleTimeString()}.
          </p>
          <button type="button" className="cart-progress-close" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`cart-progress-backdrop${framed ? ' framed' : ''}`} role="presentation">
      <div
        ref={cardRef}
        className="cart-progress-card"
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        aria-labelledby="cart-progress-title"
        style={framed && top != null ? { top } : undefined}
      >
        <div className="cart-progress-head">
          <div>
            <span className="eyebrow">{progress.step === 'done' ? 'All set' : 'Sending to your cart'}</span>
            <h2 id="cart-progress-title">
              {progress.step === 'done' ? 'Added — taking you to your cart…' : (current?.label ?? 'Working…')}
            </h2>
            {progress.detail && progress.step !== 'done' && <p>{progress.detail}</p>}
          </div>
          <div className="cart-progress-elapsed" title="Time since you clicked Add to Cart">
            <Loader2 size={16} className="cart-progress-spin" /> {formatElapsed(elapsed)}
          </div>
        </div>

        <div className={`cart-progress-track${measured || progress.step === 'done' ? '' : ' busy'}`} aria-hidden="true">
          <div className="cart-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="cart-progress-meta">
          <span>{percent}% overall</span>
          {progress.step === 'upload' && progress.fraction != null && <span>Drive upload {Math.round(progress.fraction * 100)}%</span>}
        </div>

        <ol className="cart-progress-steps">
          {steps.map((step, index) => {
            const state = index < currentIndex || progress.step === 'done' ? 'done' : index === currentIndex ? 'current' : 'todo'
            return (
              <li key={step.key} className={state}>
                <span className="cart-progress-dot">{state === 'done' ? <Check size={12} /> : state === 'current' ? <Loader2 size={12} className="cart-progress-spin" /> : null}</span>
                <span>{step.label}</span>
              </li>
            )
          })}
        </ol>

        <p className="cart-progress-note">
          {progress.step === 'done'
            ? 'Your gang sheet is in the cart. If the cart page does not open on its own in a few seconds, open your cart from the store menu.'
            : slow
              ? 'Still working — large sheets and slower connections can take a few minutes. Nothing has timed out. Please keep this page open and do not refresh.'
              : 'Please keep this page open and do not refresh. Big sheets can take a minute or two.'}
        </p>
      </div>
    </div>
  )
}
