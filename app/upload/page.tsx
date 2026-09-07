'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Upload } from 'lucide-react'
import { CutOutNoteModal } from '@/components/cut-out-note-modal'
import { isEmbedSearchParam } from '@/lib/embed'
import { formatInches, measureUploadFile, type MeasuredFile } from '@/lib/measure-file'
import { getGangSheet, SAFETY_WIDTH_IN } from '@/lib/sheet-pricing'
import { evaluateScaledSheet, scaleToSafetyWidth, softDpiWarning, type ScaledSheet } from '@/lib/upload-scale'
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { slugify, useStoreBridge, type GangSheetCartPayload } from '@/lib/ssgs-cart-bridge'
import { sheetStamp } from '@/lib/sheet-name'

const logoUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024
const CUT_OUT_NOTE_SESSION_KEY = 'ssgs-upload-cutout-note-seen'

type Step = 1 | 2 | 3 | 4
type DpiSource = 'file' | 'assumed' | 'customer'

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

function UploadFlow() {
  const searchParams = useSearchParams()
  const embedParam = isEmbedSearchParam(searchParams.get('embed'))
  const { embedded, addToCart, status: cartStatus, error: cartError, reportHeight } = useStoreBridge()
  const embed = embedParam || embedded
  const shellRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [customerName, setCustomerName] = useState('')
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [measured, setMeasured] = useState<MeasuredFile | null>(null)
  const [measureError, setMeasureError] = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [overrideWidth, setOverrideWidth] = useState('')
  const [overrideHeight, setOverrideHeight] = useState('')
  const [overrideDpi, setOverrideDpi] = useState('')
  const [dpiSource, setDpiSource] = useState<DpiSource>('assumed')
  const [cutOutNoteOpen, setCutOutNoteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [built, setBuilt] = useState(false)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!embed) return
    const post = () => reportHeight(shellRef.current)
    post()
    const root = shellRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => post())
    observer.observe(root)
    return () => observer.disconnect()
  }, [embed, reportHeight, step, measured, cutOutNoteOpen, saveError, cartStatus, built])

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
    }
  }, [fileUrl])

  const activeMeasure = useMemo(() => {
    if (!measured) return null
    if (!overrideMode) return measured
    const dpi = Number(overrideDpi) || measured.dpiX
    const widthIn = Number(overrideWidth) || measured.pixelWidth / Math.max(1, dpi)
    const heightIn = Number(overrideHeight) || measured.pixelHeight / Math.max(1, dpi)
    return { ...measured, dpiX: dpi, dpiY: dpi, dpiAssumed: false, widthIn, heightIn }
  }, [measured, overrideMode, overrideWidth, overrideHeight, overrideDpi])

  const scaled: ScaledSheet | null = useMemo(() => {
    if (!activeMeasure) return null
    return scaleToSafetyWidth({
      widthIn: activeMeasure.widthIn,
      heightIn: activeMeasure.heightIn,
      pixelWidth: activeMeasure.pixelWidth,
      pixelHeight: activeMeasure.pixelHeight,
    })
  }, [activeMeasure])

  const scaleGate = scaled ? evaluateScaledSheet(scaled) : null
  const dpiSoft = scaled ? softDpiWarning(scaled) : null
  const sheet = scaled ? getGangSheet(scaled.scaledHeightIn) : null
  const total = (sheet?.price ?? 0).toFixed(2)

  async function onPickFile(list: FileList | null) {
    const next = list?.[0]
    if (!next) return
    setMeasureError(null)
    setOverrideMode(false)
    setBuilt(false)

    if (next.size > MAX_UPLOAD_BYTES) {
      setMeasureError(
        `This file is ${(next.size / (1024 * 1024)).toFixed(1)} MB. Keep uploads under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB, or compress/split the sheet.`,
      )
      return
    }

    try {
      const info = await measureUploadFile(next)
      if (info.kind === 'jpeg') {
        setMeasureError(
          'This file has a solid background. DTF prints white ink, so a white background prints as a white rectangle. Export a transparent PNG or TIFF.',
        )
        return
      }
      setFile(next)
      setFileUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return URL.createObjectURL(next)
      })
      setMeasured(info)
      setDpiSource(info.dpiAssumed ? 'assumed' : 'file')
      setOverrideWidth(formatInches(info.widthIn))
      setOverrideHeight(formatInches(info.heightIn))
      setOverrideDpi(String(Math.round(info.dpiX)))
      setStep(3)
    } catch (err) {
      setMeasured(null)
      setFile(null)
      setMeasureError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  function goToReview() {
    setDpiSource(overrideMode ? 'customer' : measured?.dpiAssumed ? 'assumed' : 'file')
    setStep(4)
  }

  function confirmSize() {
    if (!file || !scaled || !scaleGate?.ok) return
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
    if (!file || !scaled || !sheet || !customerName.trim() || saving || cartStatus === 'sending') return
    if (!scaleGate?.ok) return
    setSaving(true)
    setSaveError(null)
    setDriveFolderUrl(null)
    try {
      const stamp = sheetStamp()
      const safeName = slugify(customerName.trim())
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.png'
      const driveName = `${safeName}-upload-${Math.round(scaled.scaledHeightIn)}in-${stamp}${ext}`
      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files: [{ name: driveName, mimeType: file.type || 'application/octet-stream', blob: file }],
      })
      const driveLink =
        drive.webViewLink ??
        drive.fileUrl ??
        (drive.fileId ? `https://drive.google.com/file/d/${drive.fileId}/view` : null)
      if (!driveLink) throw new Error('Could not save your sheet to our print queue. Please try again.')
      setDriveFolderUrl(drive.folderUrl)

      const payload: GangSheetCartPayload = {
        customerName: customerName.trim(),
        sheetWidthIn: SAFETY_WIDTH_IN,
        sheetHeightIn: scaled.scaledHeightIn,
        billableHeightIn: scaled.scaledHeightIn,
        quantity: 1,
        designs: 1,
        transfers: 0,
        precut: false,
        precutTotal: 0,
        fileName: `${safeName}-gangsheet-upload${ext}`,
        fileUrl: driveLink,
        sheetIndex: '1 of 1',
        sheetType: 'uploaded',
        sourceWidthIn: scaled.sourceWidthIn,
        sourceHeightIn: scaled.sourceHeightIn,
        scaleFactor: scaled.scaleFactor,
        effectiveDpi: scaled.effectiveDpi,
        dpiSource,
      }
      const result = await addToCart(file, payload)
      if (!result.ok) throw new Error(result.error)
      setBuilt(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add this sheet to the cart.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main ref={shellRef} className={`builder-shell upload-shell${embed ? ' embed-mode' : ''}`}>
      {embed ? (
        <div className="embed-bar">
          <strong>Upload your gang sheet</strong>
          <a href="/upload" target="_blank" rel="noreferrer">
            Open full page
          </a>
        </div>
      ) : (
        <div className="builder-topbar">
          <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
          <div className="title-block">
            <h1>Upload Your Gang Sheet</h1>
            <p className="lead">Already laid out? Send the file and we will size it for the roll.</p>
            <p className="sublead">PNG (transparent), PDF, or TIFF. We measure from the file — you confirm before checkout.</p>
          </div>
        </div>
      )}

      <ol className="how-to upload-how-to" aria-label="Upload steps">
        {[
          { n: 1, t: 'Your name' },
          { n: 2, t: 'Upload file' },
          { n: 3, t: 'Confirm size' },
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
                  <p>We use this to label the sheet in print and in your cart.</p>
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
                  <h2>Upload your gang sheet</h2>
                  <p>One file: transparent PNG, PDF, or TIFF. Max {MAX_UPLOAD_BYTES / (1024 * 1024)} MB.</p>
                </div>
              </div>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                accept="image/png,image/tiff,image/tif,application/pdf,.png,.tif,.tiff,.pdf"
                onChange={(e) => void onPickFile(e.target.files)}
              />
              <button
                type="button"
                className="dropzone"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  void onPickFile(e.dataTransfer.files)
                }}
              >
                <Upload size={28} />
                <strong>Drop your gang sheet here</strong>
                <span>or click to choose a file</span>
                <small>PNG · PDF · TIFF</small>
              </button>
              {measureError && <p className="save-error">{measureError}</p>}
            </div>
          )}

          {step === 3 && measured && scaled && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">3</span>
                <div>
                  <h2>Confirm the size</h2>
                  <p>We read this from the file header — please check it before we price the sheet.</p>
                </div>
              </div>
              <div className="upload-measure-card">
                <p>
                  We measured this as{' '}
                  <strong>
                    {formatInches(activeMeasure?.widthIn ?? measured.widthIn)} ×{' '}
                    {formatInches(activeMeasure?.heightIn ?? measured.heightIn)} in
                  </strong>{' '}
                  at {Math.round(activeMeasure?.dpiX ?? measured.dpiX)} DPI
                  {measured.dpiAssumed && !overrideMode ? ' (DPI assumed at 300 — the file had no density tag)' : ''}.
                </p>
                {Math.abs(scaled.scaleFactor - 1) > 0.001 && (
                  <p>
                    Your file is {formatInches(scaled.sourceWidthIn)} × {formatInches(scaled.sourceHeightIn)} in. We
                    will scale it to{' '}
                    <strong>
                      {formatInches(scaled.scaledWidthIn)} × {formatInches(scaled.scaledHeightIn)} in
                    </strong>{' '}
                    to fit the {SAFETY_WIDTH_IN} in printable width.
                  </p>
                )}
                {dpiSoft && <p className="upload-warn">{dpiSoft}</p>}
                {scaleGate && !scaleGate.ok && <p className="save-error">{scaleGate.message}</p>}
              </div>

              {!overrideMode ? (
                <div className="upload-size-actions">
                  <button type="button" className="build-button" disabled={!scaleGate?.ok} onClick={() => confirmSize()}>
                    <Check size={18} /> That&apos;s right
                  </button>
                  <button type="button" className="confirm-button" onClick={() => setOverrideMode(true)}>
                    No, let me set the size
                  </button>
                </div>
              ) : (
                <div className="upload-override">
                  <label>
                    Width (in)
                    <input value={overrideWidth} onChange={(e) => setOverrideWidth(e.target.value)} />
                  </label>
                  <label>
                    Height (in)
                    <input value={overrideHeight} onChange={(e) => setOverrideHeight(e.target.value)} />
                  </label>
                  <label>
                    DPI
                    <input value={overrideDpi} onChange={(e) => setOverrideDpi(e.target.value)} />
                  </label>
                  <button type="button" className="build-button" disabled={!scaleGate?.ok} onClick={() => confirmSize()}>
                    Use this size
                  </button>
                </div>
              )}
              {fileUrl && measured.kind !== 'pdf' && (
                <img className="upload-file-preview" src={fileUrl} alt="Uploaded gang sheet preview" />
              )}
            </div>
          )}

          {step === 4 && sheet && scaled && (
            <div className="guide-block">
              <div className="guide-heading">
                <span className="guide-num">4</span>
                <div>
                  <h2>Review & order</h2>
                  <p>We upload your original file to the print queue, then add it to the cart.</p>
                </div>
              </div>
              <div className="upload-review">
                <p>
                  <strong>{customerName.trim()}</strong>
                </p>
                <p>
                  Print size:{' '}
                  <strong>
                    {formatInches(scaled.scaledWidthIn)} × {formatInches(scaled.scaledHeightIn)} in
                  </strong>{' '}
                  ({sheet.label})
                </p>
                <p>
                  Effective DPI: {Math.round(scaled.effectiveDpi)} ({dpiSource})
                </p>
                <p>Uploaded sheets print as one piece — no pre-cut on this flow.</p>
                <p className="upload-total">
                  Gang sheet: <strong>${total}</strong>
                </p>
              </div>
              {fileUrl && <img className="upload-file-preview" src={fileUrl} alt="Sheet preview" />}
              {!built ? (
                <button
                  type="button"
                  className="confirm-button cart-button"
                  disabled={saving || cartStatus === 'sending' || !customerName.trim()}
                  onClick={() => void addUploadedToCart()}
                >
                  <Check size={18} />
                  {saving || cartStatus === 'sending' ? 'Adding to cart…' : 'Add to Cart'}
                </button>
              ) : (
                <div className="built-card">
                  <div className="built-title">
                    <span>
                      <Check size={21} />
                    </span>
                    <strong>Added to your cart.</strong>
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
              <p className="order-hint">Updates as you confirm size.</p>
            </div>
          </div>
          <div className="metrics">
            <div className="metric">
              <span>Gang sheet</span>
              <strong className="green-text">{sheet?.label ?? '—'}</strong>
            </div>
            <div className="metric">
              <span>Sheet price</span>
              <strong className="green-text">${sheet ? total : '—'}</strong>
            </div>
          </div>
          {scaled && (
            <div className="price-breakdown">
              <span>
                Source {formatInches(scaled.sourceWidthIn)}×{formatInches(scaled.sourceHeightIn)} in → print{' '}
                {formatInches(scaled.scaledWidthIn)}×{formatInches(scaled.scaledHeightIn)} in
              </span>
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
    <Suspense fallback={<main className="builder-shell"><p className="sublead">Loading upload…</p></main>}>
      <UploadFlow />
    </Suspense>
  )
}
