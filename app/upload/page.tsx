'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Plus, Trash2, Upload } from 'lucide-react'
import { CutOutNoteModal } from '@/components/cut-out-note-modal'
import { isEmbedSearchParam } from '@/lib/embed'
import { formatInches, measureUploadFile, type MeasuredFile } from '@/lib/measure-file'
import { getGangSheet, SAFETY_WIDTH_IN } from '@/lib/sheet-pricing'
import {
  evaluateScaledSheet,
  scaleToSafetyWidth,
  softDpiWarning,
  type ScaleGate,
  type ScaledSheet,
} from '@/lib/upload-scale'
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { slugify, useStoreBridge, type GangSheetCartPayload } from '@/lib/ssgs-cart-bridge'
import { sheetStamp } from '@/lib/sheet-name'

const logoUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
const MAX_SHEETS = 25
/** Above this, decoding the file into an <img> preview can hang or crash the tab. */
const MAX_PREVIEW_BYTES = 75 * 1024 * 1024
const CUT_OUT_NOTE_SESSION_KEY = 'ssgs-upload-cutout-note-seen'

type Step = 1 | 2 | 3 | 4
type DpiSource = 'file' | 'assumed' | 'customer'

/** One uploaded gang sheet. Each entry prints, prices and carts on its own. */
type SheetEntry = {
  id: string
  file: File
  fileUrl: string
  measured: MeasuredFile
  overrideMode: boolean
  overrideWidth: string
  overrideHeight: string
  overrideDpi: string
}

type DerivedSheet = {
  entry: SheetEntry
  activeMeasure: MeasuredFile
  scaled: ScaledSheet | null
  gate: ScaleGate | null
  dpiSoft: string | null
  sheet: ReturnType<typeof getGangSheet> | null
  dpiSource: DpiSource
  error: string | null
}

function cutOutNoteAlreadySeen() {
  try {
    return sessionStorage.getItem(CUT_OUT_NOTE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function markCutOutNoteSeen() {
  try {
    sessionStorage.setItem(CUT_OUT_NOTE_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

function makeEntryId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

function fileExt(name: string) {
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : '.png'
}

/** Resolve one entry into its measurement, scaled size, gate and price. */
function deriveSheet(entry: SheetEntry): DerivedSheet {
  const { measured } = entry
  const activeMeasure: MeasuredFile = entry.overrideMode
    ? (() => {
        const dpi = Number(entry.overrideDpi) || measured.dpiX
        const widthIn = Number(entry.overrideWidth) || measured.pixelWidth / Math.max(1, dpi)
        const heightIn = Number(entry.overrideHeight) || measured.pixelHeight / Math.max(1, dpi)
        return { ...measured, dpiX: dpi, dpiY: dpi, dpiAssumed: false, widthIn, heightIn }
      })()
    : measured

  const dpiSource: DpiSource = entry.overrideMode ? 'customer' : measured.dpiAssumed ? 'assumed' : 'file'

  let scaled: ScaledSheet | null = null
  let error: string | null = null
  try {
    scaled = scaleToSafetyWidth({
      widthIn: activeMeasure.widthIn,
      heightIn: activeMeasure.heightIn,
      pixelWidth: activeMeasure.pixelWidth,
      pixelHeight: activeMeasure.pixelHeight,
    })
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not size this sheet.'
  }

  return {
    entry,
    activeMeasure,
    scaled,
    gate: scaled ? evaluateScaledSheet(scaled) : null,
    dpiSoft: scaled ? softDpiWarning(scaled) : null,
    sheet: scaled ? getGangSheet(scaled.scaledHeightIn) : null,
    dpiSource,
    error,
  }
}

function UploadFlow() {
  const searchParams = useSearchParams()
  const embedParam = isEmbedSearchParam(searchParams.get('embed'))
  const { embedded, addToCart, status: cartStatus, error: cartError, reportHeight } = useStoreBridge()
  const embed = embedParam || embedded
  const shellRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [customerName, setCustomerName] = useState('')
  const [step, setStep] = useState<Step>(1)
  const [sheets, setSheets] = useState<SheetEntry[]>([])
  const [measureError, setMeasureError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [cutOutNoteOpen, setCutOutNoteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [built, setBuilt] = useState(false)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)

  const derived = useMemo(() => sheets.map(deriveSheet), [sheets])
  const priced = derived.filter((item) => item.sheet && item.gate?.ok)
  const blocked = derived.filter((item) => item.error || (item.gate && !item.gate.ok))
  const sheetCount = derived.length
  const totalLengthIn = priced.reduce((sum, item) => sum + (item.scaled?.scaledHeightIn ?? 0), 0)
  const totalPrice = priced.reduce((sum, item) => sum + (item.sheet?.price ?? 0), 0)
  const total = totalPrice.toFixed(2)
  const allClear = sheetCount > 0 && blocked.length === 0

  useEffect(() => {
    if (!embed) return
    const post = () => reportHeight(shellRef.current)
    post()
    const root = shellRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => post())
    observer.observe(root)
    return () => observer.disconnect()
  }, [embed, reportHeight, step, sheets, cutOutNoteOpen, saveError, cartStatus, built])

  const sheetsRef = useRef<SheetEntry[]>([])
  useEffect(() => {
    sheetsRef.current = sheets
  }, [sheets])
  useEffect(() => {
    return () => {
      for (const entry of sheetsRef.current) URL.revokeObjectURL(entry.fileUrl)
    }
  }, [])

  const updateEntry = useCallback((id: string, patch: Partial<SheetEntry>) => {
    setSheets((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }, [])

  const removeEntry = useCallback((id: string) => {
    setBuilt(false)
    setSheets((current) => {
      const target = current.find((entry) => entry.id === id)
      if (target) URL.revokeObjectURL(target.fileUrl)
      return current.filter((entry) => entry.id !== id)
    })
  }, [])

  useEffect(() => {
    if (sheets.length === 0 && (step === 3 || step === 4)) setStep(2)
  }, [sheets.length, step])

  async function onPickFiles(list: FileList | null) {
    const incoming = Array.from(list ?? [])
    if (incoming.length === 0) return
    setMeasureError(null)
    setBuilt(false)
    setReading(true)

    const room = MAX_SHEETS - sheets.length
    const accepted: SheetEntry[] = []
    const problems: string[] = []

    for (const next of incoming.slice(0, Math.max(0, room))) {
      if (next.size > MAX_UPLOAD_BYTES) {
        problems.push(
          `${next.name} is ${formatBytes(next.size)} — keep each file under ${formatBytes(MAX_UPLOAD_BYTES)}, or split the sheet.`,
        )
        continue
      }
      try {
        const info = await measureUploadFile(next)
        if (info.kind === 'jpeg') {
          problems.push(
            `${next.name} has a solid background. DTF prints white ink, so a white background prints as a white rectangle. Export a transparent PNG or TIFF.`,
          )
          continue
        }
        accepted.push({
          id: makeEntryId(),
          file: next,
          fileUrl: URL.createObjectURL(next),
          measured: info,
          overrideMode: false,
          overrideWidth: formatInches(info.widthIn),
          overrideHeight: formatInches(info.heightIn),
          overrideDpi: String(Math.round(info.dpiX)),
        })
      } catch (err) {
        problems.push(`${next.name}: ${err instanceof Error ? err.message : 'could not read that file.'}`)
      }
    }

    if (incoming.length > room) {
      problems.push(`You can upload up to ${MAX_SHEETS} sheets per order. Extra files were skipped.`)
    }

    setReading(false)
    if (accepted.length > 0) {
      setSheets((current) => [...current, ...accepted])
      setStep(3)
    }
    setMeasureError(problems.length > 0 ? problems.join(' ') : null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function goToReview() {
    setStep(4)
  }

  function confirmSizes() {
    if (!allClear) return
    if (cutOutNoteAlreadySeen()) {
      goToReview()
      return
    }
    setCutOutNoteOpen(true)
  }

  function dismissCutOutNote() {
    markCutOutNoteSeen()
    setCutOutNoteOpen(false)
    goToReview()
  }

  async function addUploadedToCart() {
    if (!allClear || !customerName.trim() || saving || cartStatus === 'sending') return
    setSaving(true)
    setSaveError(null)
    setUploadProgress(0)
    setDriveFolderUrl(null)

    try {
      const stamp = sheetStamp()
      const safeName = slugify(customerName.trim())
      const jobs = priced.map((item, index) => {
        const scaled = item.scaled as ScaledSheet
        const ext = fileExt(item.entry.file.name)
        const suffix = priced.length > 1 ? `-${index + 1}` : ''
        return {
          item,
          scaled,
          ext,
          printName: `${safeName}-upload${suffix}-${Math.round(scaled.scaledHeightIn)}in-${stamp}${ext}`,
        }
      })

      // Browser → Google Drive directly (chunked). WordPress only gets the Drive links.
      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files: jobs.map((job) => ({
          name: job.printName,
          mimeType: job.item.entry.file.type || 'application/octet-stream',
          blob: job.item.entry.file,
        })),
        onProgress: setUploadProgress,
      })
      setDriveFolderUrl(drive.folderUrl)

      // One cart line per uploaded sheet, each with its own Drive link and price.
      for (const [index, job] of jobs.entries()) {
        const uploaded = drive.files.find((file) => file.name === job.printName)
        if (!uploaded?.id || !uploaded.webViewLink) {
          throw new Error(`Could not save ${job.item.entry.file.name} to our print queue. Please try again.`)
        }

        const payload: GangSheetCartPayload = {
          customerName: customerName.trim(),
          sheetWidthIn: SAFETY_WIDTH_IN,
          sheetHeightIn: job.scaled.scaledHeightIn,
          billableHeightIn: job.scaled.scaledHeightIn,
          quantity: 1,
          designs: 1,
          transfers: 0,
          precut: false,
          precutTotal: 0,
          fileName: `${safeName}-gangsheet-upload${jobs.length > 1 ? `-${index + 1}` : ''}${job.ext}`,
          fileUrl: uploaded.webViewLink,
          driveFileId: uploaded.id,
          sheetIndex: `${index + 1} of ${jobs.length}`,
          sheetType: 'uploaded',
          sourceWidthIn: job.scaled.sourceWidthIn,
          sourceHeightIn: job.scaled.sourceHeightIn,
          scaleFactor: job.scaled.scaleFactor,
          effectiveDpi: job.scaled.effectiveDpi,
          dpiSource: job.item.dpiSource,
          jobStamp: stamp,
          printFileName: job.printName,
        }

        const result = await addToCart(payload)
        if (!result.ok) {
          throw new Error(
            jobs.length > 1
              ? `Sheet ${index + 1} of ${jobs.length} could not be added to the cart: ${result.error}`
              : result.error,
          )
        }
      }

      setBuilt(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add these sheets to the cart.')
    } finally {
      setSaving(false)
      setUploadProgress(null)
    }
  }

  return (
    <main ref={shellRef} className={`builder-shell upload-shell${embed ? ' embed-mode' : ''}`}>
      {embed ? (
        <div className="embed-bar">
          <strong>Upload your gang sheets</strong>
          <a href="/upload" target="_blank" rel="noreferrer">
            Open full page
          </a>
        </div>
      ) : (
        <div className="builder-topbar">
          <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
          <div className="title-block">
            <h1>Upload Your Gang Sheets</h1>
            <p className="lead">Already laid out? Send the files and we will size them for the roll.</p>
            <p className="sublead">
              PNG (transparent), PDF, or TIFF. Upload as many sheets as you need — each one is priced on its own and
              they add up to your order total.
            </p>
          </div>
        </div>
      )}

      <ol className="how-to upload-how-to" aria-label="Upload steps">
        {[
          { n: 1, t: 'Your name' },
          { n: 2, t: 'Upload files' },
          { n: 3, t: 'Confirm sizes' },
          { n: 4, t: 'Review & order' },
        ].map((item) => (
          <li key={item.n}>
            <button
              type="button"
              className={`how-to-item ${step === item.n ? 'current' : ''} ${step > item.n ? 'done' : ''}`}
              onClick={() => {
                if (item.n < step) setStep(item.n as Step)
              }}
            >
              <b>{item.n}</b>
              <strong>{item.t}</strong>
            </button>
          </li>
        ))}
      </ol>

      <div className="builder-grid upload-grid">
        <section className="workspace panel">
          {step === 1 && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">1</span>
                <div>
                  <h2>Your name</h2>
                  <p>We use this to label the sheets in print and in your cart.</p>
                </div>
              </div>
              <label className="customer-name-field workspace-customer-name">
                Name on the sheet
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Your name or shop name"
                  autoComplete="name"
                />
              </label>
              <button type="button" className="build-button" disabled={!customerName.trim()} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">2</span>
                <div>
                  <h2>Upload your gang sheets</h2>
                  <p>
                    One or more files: transparent PNG, PDF, or TIFF. Max {formatBytes(MAX_UPLOAD_BYTES)} each, up to{' '}
                    {MAX_SHEETS} sheets.
                  </p>
                </div>
              </div>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                multiple
                accept="image/png,image/tiff,image/tif,application/pdf,.png,.tif,.tiff,.pdf"
                onChange={(e) => void onPickFiles(e.target.files)}
              />
              <button
                type="button"
                className="dropzone"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  void onPickFiles(e.dataTransfer.files)
                }}
              >
                <Upload size={28} />
                <strong>Drop your gang sheets here</strong>
                <span>or click to choose files — you can pick several at once</span>
                <small>PNG · PDF · TIFF · Max {formatBytes(MAX_UPLOAD_BYTES)} each, up to {MAX_SHEETS} sheets</small>
              </button>
              {reading && <p className="sublead">Reading files…</p>}
              {measureError && <p className="save-error">{measureError}</p>}
              {sheetCount > 0 && (
                <button type="button" className="build-button" onClick={() => setStep(3)}>
                  Continue with {sheetCount} {sheetCount === 1 ? 'sheet' : 'sheets'}
                </button>
              )}
            </div>
          )}

          {step === 3 && sheetCount > 0 && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">3</span>
                <div>
                  <h2>Confirm the sizes</h2>
                  <p>We read these from the file headers — please check each one before we price it.</p>
                </div>
              </div>

              <div className="upload-sheet-list">
                {derived.map((item, index) => {
                  const { entry, activeMeasure, scaled, gate, dpiSoft, sheet } = item
                  return (
                    <article key={entry.id} className="upload-sheet-card">
                      <header className="upload-sheet-head">
                        <div>
                          <span className="upload-sheet-index">Sheet {index + 1}</span>
                          <strong className="upload-sheet-name">{entry.file.name}</strong>
                        </div>
                        <div className="upload-sheet-head-right">
                          {sheet && gate?.ok && <strong className="green-text">${sheet.price.toFixed(2)}</strong>}
                          <button
                            type="button"
                            className="upload-sheet-remove"
                            onClick={() => removeEntry(entry.id)}
                            aria-label={`Remove ${entry.file.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </header>

                      <div className="upload-measure-card">
                        <p>
                          We measured this as{' '}
                          <strong>
                            {formatInches(activeMeasure.widthIn)} × {formatInches(activeMeasure.heightIn)} in
                          </strong>{' '}
                          at {Math.round(activeMeasure.dpiX)} DPI
                          {entry.measured.dpiAssumed && !entry.overrideMode
                            ? ' (DPI assumed at 300 — the file had no density tag)'
                            : ''}
                          .
                        </p>
                        {scaled && Math.abs(scaled.scaleFactor - 1) > 0.001 && (
                          <p>
                            We will scale it to{' '}
                            <strong>
                              {formatInches(scaled.scaledWidthIn)} × {formatInches(scaled.scaledHeightIn)} in
                            </strong>{' '}
                            to fit the {SAFETY_WIDTH_IN} in printable width.
                          </p>
                        )}
                        {sheet && gate?.ok && (
                          <p>
                            Billed as <strong>{sheet.label}</strong> — ${sheet.price.toFixed(2)}
                          </p>
                        )}
                        {dpiSoft && <p className="upload-warn">{dpiSoft}</p>}
                        {item.error && <p className="save-error">{item.error}</p>}
                        {gate && !gate.ok && <p className="save-error">{gate.message}</p>}
                      </div>

                      {!entry.overrideMode ? (
                        <div className="upload-size-actions">
                          <button
                            type="button"
                            className="upload-ghost-button"
                            onClick={() => updateEntry(entry.id, { overrideMode: true })}
                          >
                            Set the size myself
                          </button>
                        </div>
                      ) : (
                        <div className="upload-override">
                          <label>
                            Width (in)
                            <input
                              value={entry.overrideWidth}
                              onChange={(e) => updateEntry(entry.id, { overrideWidth: e.target.value })}
                            />
                          </label>
                          <label>
                            Height (in)
                            <input
                              value={entry.overrideHeight}
                              onChange={(e) => updateEntry(entry.id, { overrideHeight: e.target.value })}
                            />
                          </label>
                          <label>
                            DPI
                            <input
                              value={entry.overrideDpi}
                              onChange={(e) => updateEntry(entry.id, { overrideDpi: e.target.value })}
                            />
                          </label>
                          <button
                            type="button"
                            className="upload-ghost-button"
                            onClick={() => updateEntry(entry.id, { overrideMode: false })}
                          >
                            Use the measured size instead
                          </button>
                        </div>
                      )}

                      {entry.measured.kind !== 'pdf' && entry.file.size <= MAX_PREVIEW_BYTES && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="upload-file-preview" src={entry.fileUrl} alt={`${entry.file.name} preview`} />
                      )}
                      {entry.measured.kind !== 'pdf' && entry.file.size > MAX_PREVIEW_BYTES && (
                        <p className="upload-preview-skipped">
                          Preview skipped — {formatBytes(entry.file.size)} is too large to render in the browser. The
                          measurements above come from the file header and are what we print from.
                        </p>
                      )}
                    </article>
                  )
                })}
              </div>

              <div className="upload-sheet-actions">
                <button type="button" className="upload-ghost-button" onClick={() => setStep(2)}>
                  <Plus size={16} /> Add more sheets
                </button>
                <button type="button" className="build-button" disabled={!allClear} onClick={() => confirmSizes()}>
                  <Check size={18} /> That&apos;s right — ${total}
                </button>
              </div>
              {!allClear && blocked.length > 0 && (
                <p className="save-error">
                  Fix or remove {blocked.length} {blocked.length === 1 ? 'sheet' : 'sheets'} above to continue.
                </p>
              )}
            </div>
          )}

          {step === 4 && allClear && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">4</span>
                <div>
                  <h2>Review &amp; order</h2>
                  <p>We upload your original files to one Google Drive job folder, then add each sheet to the cart.</p>
                </div>
              </div>
              <div className="upload-review">
                <p>
                  <strong>{customerName.trim()}</strong>
                </p>
                <ul className="upload-review-list">
                  {priced.map((item, index) => (
                    <li key={item.entry.id}>
                      <span>
                        <span className="upload-review-title">
                          <b>Sheet {index + 1}</b> — {item.entry.file.name}
                        </span>
                        <small>
                          {formatInches(item.scaled?.scaledWidthIn ?? 0)} ×{' '}
                          {formatInches(item.scaled?.scaledHeightIn ?? 0)} in ({item.sheet?.label}) ·{' '}
                          {Math.round(item.scaled?.effectiveDpi ?? 0)} DPI ({item.dpiSource})
                        </small>
                      </span>
                      <strong>${(item.sheet?.price ?? 0).toFixed(2)}</strong>
                    </li>
                  ))}
                </ul>
                <p>Uploaded sheets print as one piece each — no pre-cut on this flow.</p>
                <p className="upload-total">
                  {sheetCount} {sheetCount === 1 ? 'sheet' : 'sheets'}: <strong>${total}</strong>
                </p>
              </div>
              {!built ? (
                <>
                  <button
                    type="button"
                    className="confirm-button cart-button"
                    disabled={saving || cartStatus === 'sending' || !customerName.trim()}
                    onClick={() => void addUploadedToCart()}
                  >
                    <Check size={18} />
                    {saving || cartStatus === 'sending'
                      ? uploadProgress != null
                        ? `Uploading to Drive… ${Math.round(uploadProgress * 100)}%`
                        : 'Adding to cart…'
                      : `Add ${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'} to Cart — $${total}`}
                  </button>
                  {uploadProgress != null && (
                    <div className="upload-progress" aria-live="polite">
                      <div className="upload-progress-bar" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                    </div>
                  )}
                </>
              ) : (
                <div className="built-card">
                  <div className="built-title">
                    <span>
                      <Check size={21} />
                    </span>
                    <strong>
                      {sheetCount} {sheetCount === 1 ? 'sheet' : 'sheets'} added to your cart.
                    </strong>
                  </div>
                  {driveFolderUrl && (
                    <a className="drive-link" href={driveFolderUrl} target="_blank" rel="noreferrer">
                      Open your job folder in Google Drive
                    </a>
                  )}
                </div>
              )}
              {(saveError || cartError) && <p className="save-error">{saveError || cartError}</p>}
            </div>
          )}
        </section>

        <aside className="order-panel panel">
          <div className="order-title">
            <span className="guide-num">✓</span>
            <div>
              <h2>Order summary</h2>
              <p className="order-hint">Updates as you add sheets.</p>
            </div>
          </div>
          <div className="metrics">
            <div className="metric">
              <span>Sheets</span>
              <strong className="green-text">{sheetCount || '—'}</strong>
            </div>
            <div className="metric">
              <span>Order total</span>
              <strong className="green-text">{sheetCount ? `$${total}` : '—'}</strong>
            </div>
          </div>
          {priced.length > 0 && (
            <div className="price-breakdown">
              {priced.map((item, index) => (
                <span key={item.entry.id}>
                  Sheet {index + 1}: {item.sheet?.label} — ${(item.sheet?.price ?? 0).toFixed(2)}
                </span>
              ))}
              <span>Total film length: {formatInches(totalLengthIn, 1)} in</span>
            </div>
          )}
        </aside>
      </div>

      <CutOutNoteModal open={cutOutNoteOpen} onContinue={dismissCutOutNote} />
    </main>
  )
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <main className="builder-shell">
          <p className="sublead">Loading upload…</p>
        </main>
      }
    >
      <UploadFlow />
    </Suspense>
  )
}
