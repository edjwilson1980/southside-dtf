'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Plus, Trash2, Upload } from 'lucide-react'
import { CutOutNoteModal } from '@/components/cut-out-note-modal'
import { isEmbedSearchParam } from '@/lib/embed'
import { formatInches } from '@/lib/measure-file'
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { slugify, useStoreBridge, type GangSheetCartPayload } from '@/lib/ssgs-cart-bridge'
import { sheetStamp } from '@/lib/sheet-name'
import { formatSignedNumber, type UploadSignedMeasure } from '@/lib/upload-sign-shared'
import {
  UPLOAD_LOW_DPI,
  pickUploadSize,
  type UploadSizeOption,
} from '@/lib/upload-pricing'
import { fetchUploadSizes } from '@/lib/upload-woo-client'
import { BUILDER_VERSION } from '@/lib/version'

const logoUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
const MAX_SHEETS = 25
const MAX_PREVIEW_BYTES = 75 * 1024 * 1024
const CUT_OUT_NOTE_SESSION_KEY = 'ssgs-upload-cutout-note-seen'
const UPLOAD_ACCEPT = 'image/png,application/pdf,.png,.pdf,.ai'
const UPLOAD_ACCEPT_LABEL = 'PNG · PDF · AI'

type Step = 1 | 2 | 3 | 4

type MeasuredUpload = {
  width_in: number
  length_in: number
  dpi: number
  dpi_assumed: boolean
  filename: string
  kind: string
  warnings: string[]
}

type SheetEntry = {
  id: string
  file: File
  fileUrl: string
  measured: MeasuredUpload
  matched: UploadSizeOption | null
  quantity: number
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

function isUploadFile(file: File) {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return (
    type.includes('png') ||
    type.includes('pdf') ||
    name.endsWith('.png') ||
    name.endsWith('.pdf') ||
    name.endsWith('.ai')
  )
}

async function measureViaRelay(file: File): Promise<MeasuredUpload> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/upload/measure', { method: 'POST', body })
  const json = (await res.json()) as MeasuredUpload & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Could not measure that file.')
  return json
}

async function signMeasure(input: {
  drive_file_id: string
  width_in: number
  length_in: number
  dpi: number
  filename: string
}): Promise<UploadSignedMeasure> {
  const res = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      drive_file_id: input.drive_file_id,
      width_in: formatSignedNumber(input.width_in),
      length_in: formatSignedNumber(input.length_in),
      dpi: String(Math.round(input.dpi)),
      filename: input.filename,
    }),
  })
  const json = (await res.json()) as UploadSignedMeasure & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Could not sign the upload measure.')
  return json
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
  const [sizes, setSizes] = useState<UploadSizeOption[]>([])
  const [sizesError, setSizesError] = useState<string | null>(null)
  const [measureError, setMeasureError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [cutOutNoteOpen, setCutOutNoteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [built, setBuilt] = useState(false)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchUploadSizes()
      .then((list) => {
        if (!cancelled) {
          setSizes(list)
          setSizesError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setSizesError(err instanceof Error ? err.message : 'Could not load prices.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const validSheets = useMemo(
    () => sheets.filter((sheet) => sheet.matched && !sheet.error),
    [sheets],
  )
  const blocked = sheets.filter((sheet) => sheet.error || !sheet.matched)
  const sheetCount = sheets.length
  const orderTotal = validSheets.reduce(
    (sum, sheet) => sum + (sheet.matched?.price ?? 0) * Math.max(1, sheet.quantity),
    0,
  )
  const allClear = sheetCount > 0 && blocked.length === 0 && sizes.length > 0

  useEffect(() => {
    if (!embed) return
    const post = () => reportHeight(shellRef.current)
    post()
    const root = shellRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => post())
    observer.observe(root)
    return () => observer.disconnect()
  }, [embed, reportHeight, step, sheets, cutOutNoteOpen, saveError, cartStatus, built, sizesError])

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
    if (sizes.length === 0) {
      setMeasureError(sizesError || 'Still loading store prices — try again in a moment.')
      return
    }
    setMeasureError(null)
    setBuilt(false)
    setReading(true)

    const room = MAX_SHEETS - sheets.length
    const accepted: SheetEntry[] = []
    const problems: string[] = []

    for (const next of incoming.slice(0, Math.max(0, room))) {
      if (next.size > MAX_UPLOAD_BYTES) {
        problems.push(
          `${next.name} is ${formatBytes(next.size)} — keep each file under ${formatBytes(MAX_UPLOAD_BYTES)}.`,
        )
        continue
      }
      if (!isUploadFile(next)) {
        problems.push(`${next.name}: Please upload PNG, PDF, or AI.`)
        continue
      }
      try {
        const measured = await measureViaRelay(next)
        const matched = pickUploadSize(measured.length_in, sizes)
        const fileUrl =
          next.type.includes('png') && next.size <= MAX_PREVIEW_BYTES
            ? URL.createObjectURL(next)
            : ''
        accepted.push({
          id: makeEntryId(),
          file: next,
          fileUrl,
          measured,
          matched,
          quantity: 1,
          error: matched
            ? null
            : measured.length_in > 200
              ? 'Max sheet is 200 in (16 ft). Please split into two files.'
              : 'No matching sheet size for this file.',
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
      const jobs = validSheets.map((entry, index) => {
        const ext = fileExt(entry.file.name)
        const suffix = validSheets.length > 1 ? `-${index + 1}` : ''
        const lengthTier = entry.matched!.length_in
        return {
          entry,
          ext,
          printName: `${safeName}-upload${suffix}-${lengthTier}in-${stamp}${ext}`,
        }
      })

      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files: jobs.map((job) => ({
          name: job.printName,
          mimeType: job.entry.file.type || 'application/octet-stream',
          blob: job.entry.file,
        })),
        onProgress: setUploadProgress,
      })
      setDriveFolderUrl(drive.folderUrl)

      for (const [index, job] of jobs.entries()) {
        const uploaded = drive.files.find((file) => file.name === job.printName)
        if (!uploaded?.id || !uploaded.webViewLink) {
          throw new Error(`Could not save ${job.entry.file.name} to our print queue. Please try again.`)
        }

        const uploadSig = await signMeasure({
          drive_file_id: uploaded.id,
          width_in: job.entry.measured.width_in,
          length_in: job.entry.measured.length_in,
          dpi: job.entry.measured.dpi,
          filename: job.printName,
        })

        const payload: GangSheetCartPayload = {
          customerName: customerName.trim(),
          sheetWidthIn: 22,
          sheetHeightIn: job.entry.measured.length_in,
          billableHeightIn: job.entry.matched!.length_in,
          quantity: Math.max(1, job.entry.quantity),
          designs: 1,
          transfers: 0,
          precut: false,
          precutTotal: 0,
          fileName: job.printName,
          fileUrl: uploaded.webViewLink,
          driveFileId: uploaded.id,
          sheetIndex: `${index + 1} of ${jobs.length}`,
          sheetType: 'uploaded',
          sourceWidthIn: job.entry.measured.width_in,
          sourceHeightIn: job.entry.measured.length_in,
          effectiveDpi: job.entry.measured.dpi,
          dpiSource: job.entry.measured.dpi_assumed ? 'assumed' : 'file',
          jobStamp: stamp,
          printFileName: job.printName,
          variationId: job.entry.matched!.variation_id,
          measuredWidthIn: job.entry.measured.width_in,
          measuredLengthIn: job.entry.measured.length_in,
          measuredDpi: job.entry.measured.dpi,
          uploadSig,
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
        </div>
      ) : (
        <div className="builder-topbar">
          <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
          <div className="title-block">
            <h1>Upload Your Gang Sheets</h1>
            <p className="lead">Already laid out? Send the files — we size them from the file and bill the WooCommerce price.</p>
            <p className="sublead">
              PNG, PDF, or AI. Max width 22 in. You never pick the size — your file dimensions set the sheet.
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
                    PNG, PDF, or AI. Max {formatBytes(MAX_UPLOAD_BYTES)} each, up to {MAX_SHEETS} sheets. Print-ready,
                    no mirroring, no trademarks — store credit only on remakes.
                  </p>
                </div>
              </div>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
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
                <small>
                  {UPLOAD_ACCEPT_LABEL} · Max {formatBytes(MAX_UPLOAD_BYTES)} each, up to {MAX_SHEETS} sheets
                </small>
              </button>
              {reading && <p className="sublead">Measuring files…</p>}
              {sizesError && <p className="save-error">{sizesError}</p>}
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
                  <p>
                    Sheet size is set by your file. Wrong size? Resize your art and re-upload.
                  </p>
                </div>
              </div>

              <div className="upload-sheet-list">
                {sheets.map((entry, index) => (
                  <article key={entry.id} className="upload-sheet-card">
                    <header className="upload-sheet-head">
                      <div>
                        <span className="upload-sheet-index">Sheet {index + 1}</span>
                        <strong className="upload-sheet-name">{entry.file.name}</strong>
                      </div>
                      <div className="upload-sheet-head-right">
                        {entry.matched && !entry.error && (
                          <strong className="green-text">
                            ${(entry.matched.price * entry.quantity).toFixed(2)}
                          </strong>
                        )}
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

                    {entry.fileUrl && (
                      <div className="upload-file-preview">
                        <img src={entry.fileUrl} alt="" />
                      </div>
                    )}

                    <div className="upload-measure-card">
                      <p>
                        <strong>{entry.file.name}</strong> — {formatInches(entry.measured.width_in)} ×{' '}
                        {formatInches(entry.measured.length_in)} in
                        {entry.matched
                          ? ` → ${entry.matched.label} — ${entry.matched.price_html || `$${entry.matched.price.toFixed(2)}`}`
                          : ''}
                      </p>
                      {entry.measured.warnings.map((warning) => (
                        <p className="upload-warn" key={warning}>
                          ⚠ {warning}
                        </p>
                      ))}
                      {entry.measured.dpi > 0 && entry.measured.dpi < UPLOAD_LOW_DPI && (
                        <p className="upload-warn">⚠ May print blurry</p>
                      )}
                      {entry.error && <p className="save-error">{entry.error}</p>}
                      <p className="sublead">
                        Wrong size? Your file&apos;s dimensions set the sheet size. Resize your art and re-upload.
                      </p>
                    </div>

                    <label className="customer-name-field">
                      Quantity
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={entry.quantity}
                        onChange={(e) =>
                          updateEntry(entry.id, {
                            quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </label>
                  </article>
                ))}
              </div>

              <button
                type="button"
                className="add-design"
                onClick={() => inputRef.current?.click()}
              >
                <Plus size={18} /> Add another file
              </button>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                onChange={(e) => void onPickFiles(e.target.files)}
              />

              <button type="button" className="build-button" disabled={!allClear} onClick={confirmSizes}>
                Continue to review
              </button>
              {!allClear && (
                <p className="save-error">Every sheet must measure cleanly before you can continue.</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">4</span>
                <div>
                  <h2>Review & order</h2>
                  <p>Prices come from WooCommerce Upload Gangsheet variations — not from this page.</p>
                </div>
              </div>
              <ul className="upload-review-list">
                {validSheets.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <strong>{entry.file.name}</strong>
                      <small>
                        {formatInches(entry.measured.width_in)} × {formatInches(entry.measured.length_in)} in →{' '}
                        {entry.matched?.label} · qty {entry.quantity}
                      </small>
                    </span>
                    <strong>${((entry.matched?.price ?? 0) * entry.quantity).toFixed(2)}</strong>
                  </li>
                ))}
              </ul>
              {built ? (
                <div className="built-card">
                  <div className="built-title">
                    <span>
                      <Check size={16} />
                    </span>
                    <strong>Added to cart</strong>
                  </div>
                  <p>Finish checkout in the store cart. Your files are in our Drive print queue.</p>
                  {driveFolderUrl && (
                    <a href={driveFolderUrl} target="_blank" rel="noreferrer">
                      Open Drive folder
                    </a>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="build-button"
                  disabled={saving || cartStatus === 'sending' || !allClear}
                  onClick={() => void addUploadedToCart()}
                >
                  <Check size={18} />
                  {saving || cartStatus === 'sending'
                    ? uploadProgress != null
                      ? `Uploading… ${Math.round(uploadProgress * 100)}%`
                      : 'Adding to cart…'
                    : 'Add to Cart'}
                </button>
              )}
              {saveError && <p className="save-error">{saveError}</p>}
              {cartStatus === 'error' && cartError && <p className="save-error">{cartError}</p>}
            </div>
          )}
        </section>

        <aside className="order-panel panel">
          <div className="order-title">
            <div>
              <h2>Your order</h2>
              <p className="order-hint">{customerName.trim() || 'Add your name to start'}</p>
            </div>
          </div>
          <div className="metrics">
            <div className="metric">
              <span>Sheets</span>
              <strong>{sheetCount}</strong>
            </div>
            <div className="metric">
              <span>Order total</span>
              <strong className="green-text">${orderTotal.toFixed(2)}</strong>
            </div>
          </div>
          <p className="sublead" style={{ marginTop: 12 }}>
            Size is read-only. Live prices load from the store&apos;s Upload Gangsheet product.
          </p>
          <p className="builder-version">Builder v{BUILDER_VERSION}</p>
        </aside>
      </div>

      <CutOutNoteModal open={cutOutNoteOpen} onContinue={dismissCutOutNote} />
    </main>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={<main className="builder-shell"><p className="sublead">Loading…</p></main>}>
      <UploadFlow />
    </Suspense>
  )
}
