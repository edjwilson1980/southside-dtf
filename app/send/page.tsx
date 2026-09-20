'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Image as ImageIcon, Minus, Plus, Trash2, Upload } from 'lucide-react'
import { DESIGN_ACCEPT, DESIGN_ACCEPT_LABEL, isAcceptedDesignFile, isHeicFile } from '@/lib/accepted-uploads'
import { suggestBackgroundKnockout } from '@/lib/detect-backdrop'
import { isEmbedSearchParam } from '@/lib/embed'
import { trimEmptySpace } from '@/lib/crop-image'
import { parsePrintWidthInches, printDpi, qualityFromDpi, readImageSize } from '@/lib/image-utils'
import {
  buildIntakeJobRecord,
  buildNeedsAttention,
  intakeFileName,
  intakeJobId,
} from '@/lib/intake'
import {
  generateWorkOrderPdf,
  workOrderFileName,
  workOrderThumbsFromBlobs,
} from '@/lib/work-order-pdf'
import { prepareEditableUpload } from '@/lib/rasterize-upload'
import { ART_INSET_IN, packSheetBestGutter, piecePrintSize, SHEET_WIDTH_IN } from '@/lib/compose-sheet'
import { billedSheetLength, buildFeeForLength, cuttingFeeEach, getGangSheet } from '@/lib/sheet-pricing'
import { sheetStamp } from '@/lib/sheet-name'
import { uploadJobToGoogleDrive, writeDriveFolderBlob, writeDriveJobRecord } from '@/lib/upload-to-drive'
import { slugify, useStoreBridge, type GangSheetCartPayload } from '@/lib/ssgs-cart-bridge'
import { BUILDER_VERSION } from '@/lib/version'

const UNSURE_SIZE = 'unsure'
const UNSURE_BOX_IN = 10.5

const sizeGuideUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/DTF%20size%20chart%20%20front2-SIpj1XrVDRyRDtQhaACxzNHj5geNxv.png'

const placements = [
  'Left Chest',
  'Toddler Shirt',
  'Youth Shirt',
  'Adult Shirt',
  'Hoodie Front',
  'Hoodie Back',
  'Hat',
  'Sleeve',
  'Custom',
]

const sizeOptions: Record<string, string[]> = {
  'Left Chest': [
    'Youth Left Chest · 3 × 3 in',
    'Standard Left Chest · 3.75 × 3.75 in',
    'Oversized Left Chest · 4.5 × 4.5 in',
  ],
  'Toddler Shirt': ['2T · 5.5 × 6 in', '3T · 6 × 6.5 in', '4T · 6.5 × 7 in', '5T · 6.5 × 7 in'],
  'Youth Shirt': ['XS · 7.5 × 8 in', 'Small · 8.5 × 9 in', 'Medium · 9.25 × 10 in', 'Large · 9.75 × 11 in'],
  'Adult Shirt': [
    'Small · 10 × 12 in',
    'Medium · 10.5 × 12 in',
    'Large · 10.5 × 12 in',
    'XL · 10.5 × 12 in',
    '2XL · 12.5 × 13 in',
    '3XL · 13.5 × 14 in',
  ],
  'Hoodie Front': [
    'Small · 10.5 × 10 in',
    'Medium · 10.5 × 11 in',
    'Large · 10.5 × 12 in',
    'XL · 10.5 × 12 in',
    '2XL · 12 × 13 in',
    '3XL · 13 × 15 in',
    '4XL · 14 × 15 in',
  ],
  'Hoodie Back': [
    'Small · 10.5 × 12 in',
    'Medium · 10.5 × 12 in',
    'Large · 10.5 × 12 in',
    'XL · 10.5 × 12 in',
    '2XL · 12 × 14 in',
    '3XL · 13 × 15 in',
    '4XL · 14 × 16 in',
  ],
  Hat: ['Small · 3 in', 'Medium · 4 in', 'Large · 5 in'],
  Sleeve: ['3 in', '3.5 in', '4 in', '4.5 in', '5 in'],
  Custom: ['3 in', '4 in', '5 in', '6 in', '8 in', '10 in', '12 in', '14 in'],
  default: ['3 in', '4 in', '5 in', '6 in', '10.5 in', '12 in'],
}

type IntakeDesign = {
  id: number
  name: string
  placement: string
  size: string
  customWidth: string
  customHeight: string
  quantity: number
  notes: string
  previewUrl: string
  uploadBlob: Blob | null
  pixelWidth: number
  pixelHeight: number
  sizeUnknown: boolean
  removeBackground: boolean
  upscale: boolean
  backdropLabel: string | null
  converting: boolean
}

function revokeUnusedUrls(urls: Array<string | null>, remaining: IntakeDesign[]) {
  for (const url of urls) {
    if (!url) continue
    if (!remaining.some((design) => design.previewUrl === url)) URL.revokeObjectURL(url)
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const blob = Array.isArray(result) ? result[0] : result
  const nextName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([blob], nextName, { type: 'image/jpeg' })
}

async function sampleBackdrop(url: string) {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image()
      node.onload = () => resolve(node)
      node.onerror = () => reject(new Error('Could not read image'))
      node.src = url
    })
    const canvas = document.createElement('canvas')
    const maxEdge = 640
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    return suggestBackgroundKnockout(pixels)
  } catch {
    return null
  }
}

function recommendedSize(placement: string) {
  return (sizeOptions[placement] ?? sizeOptions.default)[0]
}

export default function SendPage() {
  return (
    <Suspense fallback={<main className="builder-shell intake-shell"><p className="sublead">Loading…</p></main>}>
      <SendIntake />
    </Suspense>
  )
}

function SendIntake() {
  const searchParams = useSearchParams()
  const embedParam = isEmbedSearchParam(searchParams.get('embed'))
  const { embedded, addToCart, status: cartStatus, error: cartError, reportHeight } = useStoreBridge()
  const embed = embedParam || embedded
  const shellRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [designs, setDesigns] = useState<IntakeDesign[]>([])
  const [placement, setPlacement] = useState('Adult Shirt')
  const [dragging, setDragging] = useState(false)
  const [cutOut, setCutOut] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState<{
    jobId: string
    stamp: string
    total: string
    designs: IntakeDesign[]
  } | null>(null)

  useEffect(() => {
    if (!embed) return
    const post = () => reportHeight(shellRef.current)
    post()
    const root = shellRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => post())
    observer.observe(root)
    return () => observer.disconnect()
  }, [embed, reportHeight, designs.length, cutOut, submitted, addError, saveError, cartStatus])

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    if (incoming.length === 0) return
    if (!customerName.trim()) {
      setAddError('Enter your name first, then add your artwork.')
      return
    }
    setAddError(null)

    for (const raw of incoming) {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      let file = raw
      const converting = isHeicFile(file)
      if (!isAcceptedDesignFile(file) && !converting) {
        setAddError(`Upload a ${DESIGN_ACCEPT_LABEL.replace(/ · /g, ', ')} file.`)
        continue
      }

      setDesigns((current) => [
        ...current,
        {
          id,
          name: file.name,
          placement,
          size: recommendedSize(placement),
          customWidth: '',
          customHeight: '',
          quantity: 1,
          notes: '',
          previewUrl: '',
          uploadBlob: null,
          pixelWidth: 0,
          pixelHeight: 0,
          sizeUnknown: false,
          removeBackground: false,
          upscale: false,
          backdropLabel: null,
          converting,
        },
      ])

      try {
        if (converting) {
          file = await convertHeicToJpeg(file)
        }
        const prepared = await prepareEditableUpload(file)
        let previewUrl = prepared.editUrl
        let blob: Blob = prepared.editFile
        let pixelWidth = prepared.measured.pixelWidth
        let pixelHeight = prepared.measured.pixelHeight

        try {
          const trimmed = await trimEmptySpace(prepared.editUrl)
          if (trimmed.trimmed) {
            URL.revokeObjectURL(prepared.editUrl)
            previewUrl = URL.createObjectURL(trimmed.blob)
            blob = trimmed.blob
            pixelWidth = trimmed.width
            pixelHeight = trimmed.height
          } else {
            pixelWidth = trimmed.width
            pixelHeight = trimmed.height
          }
        } catch {
          const size = await readImageSize(previewUrl)
          pixelWidth = size.width
          pixelHeight = size.height
        }

        const backdrop = await sampleBackdrop(previewUrl)
        const defaultWidth = piecePrintSize({
          placement,
          size: recommendedSize(placement),
          customWidth: '',
          customHeight: '',
          pixelWidth,
          pixelHeight,
          widthIn: parsePrintWidthInches(recommendedSize(placement), placement, ''),
        }).widthIn
        const dpi = printDpi(pixelWidth, defaultWidth)
        setDesigns((items) =>
          items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  name: file.name,
                  previewUrl,
                  uploadBlob: blob,
                  pixelWidth,
                  pixelHeight,
                  converting: false,
                  backdropLabel: backdrop?.label ?? null,
                  removeBackground: Boolean(backdrop),
                  upscale: qualityFromDpi(dpi).tone === 'poor',
                }
              : item,
          ),
        )
      } catch (err) {
        setDesigns((items) => {
          const remaining = items.filter((item) => item.id !== id)
          revokeUnusedUrls(
            items.filter((item) => item.id === id).map((item) => item.previewUrl),
            remaining,
          )
          return remaining
        })
        setAddError(err instanceof Error ? err.message : `Could not read ${raw.name}.`)
      }
    }
  }

  const updateDesign = (id: number, patch: Partial<IntakeDesign>) =>
    setDesigns((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const removeDesign = (id: number) => {
    setDesigns((items) => {
      const target = items.find((item) => item.id === id)
      const remaining = items.filter((item) => item.id !== id)
      if (target) revokeUnusedUrls([target.previewUrl], remaining)
      return remaining
    })
  }

  const getDesignSize = (design: IntakeDesign) => {
    if (design.sizeUnknown || design.size === UNSURE_SIZE) {
      return { widthIn: UNSURE_BOX_IN, heightIn: UNSURE_BOX_IN }
    }
    return piecePrintSize({
      placement: design.placement,
      size: design.size,
      customWidth: design.customWidth,
      customHeight: design.customHeight,
      pixelWidth: design.pixelWidth,
      pixelHeight: design.pixelHeight,
      widthIn: parsePrintWidthInches(design.size, design.placement, design.customWidth),
    })
  }

  const totalTransfers = designs.reduce((sum, design) => sum + design.quantity, 0)
  const pieceInputs = designs.flatMap((design) => {
    const size = getDesignSize(design)
    return Array.from({ length: design.quantity }, () => ({
      widthIn: size.widthIn,
      heightIn: size.heightIn,
    }))
  })
  const layout = packSheetBestGutter(pieceInputs, {
    packWidthIn: SHEET_WIDTH_IN,
    startYIn: ART_INSET_IN,
  })
  const billableHeightIn = Math.max(0, layout.contentEndY - ART_INSET_IN)
  const billedLength = billedSheetLength(billableHeightIn)
  const sheet = getGangSheet(billableHeightIn)
  const cutRate = cuttingFeeEach(totalTransfers)
  const cutFee = cutOut && totalTransfers > 0 ? cutRate * totalTransfers : 0
  const buildFee = designs.length > 0 ? buildFeeForLength(billedLength) : 0
  const total = (sheet.price + cutFee + buildFee).toFixed(2)
  const hasSizeUnknown = designs.some((design) => design.sizeUnknown || design.size === UNSURE_SIZE)

  async function submitAndPay() {
    if (!customerName.trim()) {
      setSaveError('Enter your name so we can find your job.')
      return
    }
    if (designs.length === 0) {
      setSaveError('Add at least one design before you submit.')
      return
    }
    if (designs.some((design) => !design.uploadBlob || design.converting)) {
      setSaveError('Wait for every image to finish loading, then try again.')
      return
    }
    if (saving || cartStatus === 'sending') return

    setSaving(true)
    setSaveError(null)
    setUploadProgress(0)
    try {
      const stamp = sheetStamp()
      const files = designs.map((design, index) => ({
        name: intakeFileName(index, design.name),
        mimeType: design.uploadBlob!.type || 'image/png',
        blob: design.uploadBlob!,
      }))

      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files,
        onProgress: setUploadProgress,
      })

      const jobDesigns = designs.map((design, index) => {
        const size = getDesignSize(design)
        const dpi = printDpi(design.pixelWidth, size.widthIn)
        const uploaded = drive.files[index]
        return {
          file: files[index].name,
          driveFileId: uploaded?.id || '',
          placement: design.placement,
          size: design.sizeUnknown ? UNSURE_SIZE : design.size,
          customWidth: design.customWidth,
          customHeight: design.customHeight,
          sizeUnknown: design.sizeUnknown || design.size === UNSURE_SIZE,
          quantity: design.quantity,
          notes: design.notes,
          pixelWidth: design.pixelWidth,
          pixelHeight: design.pixelHeight,
          dpi,
          removeBackground: design.removeBackground,
          backdropLabel: design.backdropLabel || undefined,
          upscale: design.upscale,
        }
      })

      let workOrderMissing = false

      const draftRecord = buildIntakeJobRecord({
        stamp,
        submittedAt: new Date().toISOString(),
        customer: {
          name: customerName.trim(),
          email: customerEmail.trim(),
          phone: customerPhone.trim(),
        },
        orderNote: orderNote.trim(),
        precut: cutOut,
        estimate: {
          designs: designs.length,
          transfers: totalTransfers,
          billedLengthIn: billedLength,
          sheetPrice: sheet.price,
          precutTotal: cutFee,
          buildFee,
          total: Number(total),
        },
        designs: jobDesigns,
      })

      try {
        const thumbs = await workOrderThumbsFromBlobs(designs.map((design) => design.uploadBlob))
        const workOrderBlob = await generateWorkOrderPdf({
          record: draftRecord,
          thumbnails: thumbs,
          backdropLabels: designs.map((design) => design.backdropLabel),
        })
        await writeDriveFolderBlob({
          folderId: drive.folderId,
          name: workOrderFileName(draftRecord.jobId),
          blob: workOrderBlob,
          mimeType: 'application/pdf',
        })
      } catch (pdfErr) {
        workOrderMissing = true
        console.error('Work order PDF failed; continuing without it.', pdfErr)
      }

      const record = {
        ...draftRecord,
        needsAttention: buildNeedsAttention(jobDesigns, workOrderMissing ? ['work-order-missing'] : []),
      }

      await writeDriveJobRecord({
        folderId: drive.folderId,
        content: JSON.stringify(record, null, 2),
      })

      const payload: GangSheetCartPayload = {
        customerName: customerName.trim(),
        sheetWidthIn: SHEET_WIDTH_IN,
        sheetHeightIn: billedLength,
        billableHeightIn: billedLength,
        quantity: 1,
        designs: designs.length,
        transfers: totalTransfers,
        precut: cutOut,
        precutTotal: cutFee,
        buildFee,
        fileName: `${slugify(customerName.trim()) || 'artwork'}-${stamp}`,
        fileUrl: drive.folderUrl,
        driveFileId: drive.folderId,
        sheetIndex: '1 of 1',
        sheetType: 'intake',
        jobStamp: stamp,
        printFileName: workOrderMissing ? undefined : workOrderFileName(draftRecord.jobId),
      }

      const cart = await addToCart(payload)
      if (!cart.ok) throw new Error(cart.error || 'Could not add this job to your cart.')

      setSubmitted({
        jobId: intakeJobId(stamp),
        stamp,
        total,
        designs: designs.map((design) => ({ ...design })),
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not submit your artwork. Please try again.')
    } finally {
      setSaving(false)
      setUploadProgress(null)
    }
  }

  if (submitted) {
    return (
      <main ref={shellRef} className={`builder-shell intake-shell${embed ? ' embed-mode' : ''}`}>
        <section className="panel intake-confirm">
          <span className="eyebrow">Submitted</span>
          <h1>We have your artwork</h1>
          <p className="lead">
            Job <strong>{submitted.jobId}</strong> · estimated total ${submitted.total}
          </p>
          <div className="intake-confirm-thumbs">
            {submitted.designs.map((design) => (
              <figure key={design.id}>
                {design.previewUrl ? <img src={design.previewUrl} alt="" /> : <ImageIcon size={24} />}
                <figcaption>
                  {design.quantity}× {design.name}
                </figcaption>
              </figure>
            ))}
          </div>
          <ol className="intake-next-steps">
            <li>We nest your designs onto film and check size, background, and sharpness.</li>
            <li>If anything would change your total, we email you before we print — never after.</li>
            <li>Finish checkout in your cart so the job stays in our queue.</li>
          </ol>
          {hasSizeUnknown && (
            <p className="intake-promise">
              One design still needs a size from us. We&apos;ll email you before we print if it changes your
              total — never after.
            </p>
          )}
        </section>
      </main>
    )
  }

  return (
    <main ref={shellRef} className={`builder-shell intake-shell${embed ? ' embed-mode' : ''}`}>
      <div className="builder-grid">
        <section className="panel workspace">
          <div className="title-block">
            <h1>Send us your artwork</h1>
            <p className="lead">
              Upload your designs, tell us how big and how many, and we build the gang sheet for you. No
              layout to fuss with — we handle the nesting so you get the most out of every inch of film.
            </p>
          </div>

          <div className="inline-guide">
            <img src={sizeGuideUrl} alt="DTF design size guide for toddler, youth, and adult shirts" />
            <div className="inline-guide-copy">
              <span className="eyebrow">Live size chart</span>
              <h2>{placement} max sizes</h2>
              <p>Pick a garment below to update this chart. Use it when you are not sure what size to choose.</p>
              <div className="guide-quick-picks">
                {placements.filter((item) => item !== 'Custom').map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={placement === item ? 'active' : undefined}
                    onClick={() => setPlacement(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="live-size-chart" aria-live="polite">
              <section
                id={`intake-size-chart-${placement.replace(/\s+/g, '-').toLowerCase()}`}
                className="live-size-section selected"
              >
                <header>
                  <h3>{placement === 'Custom' ? 'Custom sizes' : placement}</h3>
                  <span>Max print size</span>
                </header>
                <div className="size-recommendations">
                  {(sizeOptions[placement] ?? sizeOptions.default).map((option) => (
                    <div key={option} className="size-recommendation">
                      <strong>{option.split(' · ')[0]}</strong>
                      <span>{option.includes(' · ') ? option.split(' · ')[1] : option}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <label className="customer-name-field workspace-customer-name">
            Your name <span className="required-field">required</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Name on the order"
              autoComplete="name"
            />
          </label>
          <div className="intake-contact-row">
            <label className="customer-name-field">
              Email
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="So we can reach you about size"
                autoComplete="email"
              />
            </label>
            <label className="customer-name-field">
              Phone
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Optional"
                autoComplete="tel"
              />
            </label>
          </div>

          <button
            type="button"
            className={`dropzone ${dragging ? 'dragging' : ''} ${!customerName.trim() ? 'customer-required-disabled' : ''}`}
            aria-disabled={!customerName.trim()}
            onClick={() => {
              if (customerName.trim()) inputRef.current?.click()
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void addFiles(event.dataTransfer.files)
            }}
          >
            <Upload size={40} strokeWidth={1.7} />
            <strong>Drop your artwork here</strong>
            <span>{DESIGN_ACCEPT_LABEL}</span>
            <small>Add another image — PNG, JPG, PDF or HEIC</small>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            multiple
            accept={DESIGN_ACCEPT}
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files)
              event.target.value = ''
            }}
          />
          {addError && <p className="save-error">{addError}</p>}

          <div className="design-heading">
            <h2>Your designs ({designs.length})</h2>
          </div>
          {designs.length === 0 && (
            <div className="empty-designs">
              <ImageIcon size={24} />
              <span>Your uploaded designs will appear here.</span>
            </div>
          )}

          <div className="design-list intake-design-list">
            {designs.map((design) => {
              const size = getDesignSize(design)
              const dpi = printDpi(design.pixelWidth, size.widthIn)
              const quality = qualityFromDpi(dpi)
              const sizeChoices = sizeOptions[design.placement] ?? sizeOptions.default
              return (
                <div className="design-row intake-design-row" key={design.id}>
                  <div className={`thumb ${design.previewUrl ? 'has-art' : 'blue'}`}>
                    {design.converting ? (
                      <small>Converting…</small>
                    ) : design.previewUrl ? (
                      <img src={design.previewUrl} alt="" />
                    ) : (
                      <ImageIcon size={24} />
                    )}
                  </div>
                  <div className="design-name">
                    <strong>{design.name}</strong>
                    {dpi > 0 && (
                      <span className={quality.tone === 'poor' ? 'quality-warn' : 'quality'}>
                        {dpi} DPI · {quality.label}
                      </span>
                    )}
                  </div>
                  <label>
                    Placement
                    <select
                      value={design.placement}
                      onChange={(event) => {
                        const nextPlacement = event.target.value
                        updateDesign(design.id, {
                          placement: nextPlacement,
                          size:
                            design.sizeUnknown || design.size === UNSURE_SIZE
                              ? UNSURE_SIZE
                              : nextPlacement === 'Custom'
                                ? '0 × 0 in'
                                : recommendedSize(nextPlacement),
                          customWidth: nextPlacement === 'Custom' ? design.customWidth : '',
                          customHeight: nextPlacement === 'Custom' ? design.customHeight : '',
                        })
                      }}
                    >
                      {placements.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {design.placement === 'Custom' && !design.sizeUnknown ? (
                    <div className="custom-dimensions">
                      <span>Custom size</span>
                      <div>
                        <label>
                          Width
                          <input
                            type="number"
                            min="0.25"
                            max={SHEET_WIDTH_IN}
                            step="0.25"
                            value={design.customWidth}
                            onChange={(event) => {
                              const width = Math.min(SHEET_WIDTH_IN, Math.max(0, Number(event.target.value) || 0))
                              const value = event.target.value === '' ? '' : String(width)
                              updateDesign(design.id, {
                                customWidth: value,
                                size: `${value || '0'} × ${design.customHeight || '0'} in`,
                              })
                            }}
                          />
                        </label>
                        <label>
                          Height
                          <input
                            type="number"
                            min="0.25"
                            max="199"
                            step="0.25"
                            value={design.customHeight}
                            onChange={(event) => {
                              const height = Math.min(199, Math.max(0, Number(event.target.value) || 0))
                              const value = event.target.value === '' ? '' : String(height)
                              updateDesign(design.id, {
                                customHeight: value,
                                size: `${design.customWidth || '0'} × ${value || '0'} in`,
                              })
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label>
                      Size
                      <select
                        value={design.sizeUnknown ? UNSURE_SIZE : design.size}
                        onChange={(event) => {
                          const value = event.target.value
                          updateDesign(design.id, {
                            size: value,
                            sizeUnknown: value === UNSURE_SIZE,
                            customWidth: '',
                            customHeight: '',
                          })
                        }}
                      >
                        <option value={UNSURE_SIZE}>I&apos;m not sure — you pick</option>
                        {sizeChoices.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Quantity
                    <div className="number-input">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={design.quantity}
                        onChange={(event) =>
                          updateDesign(design.id, {
                            quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </label>
                  <label className="notes">
                    Notes
                    <input
                      value={design.notes}
                      onChange={(event) => updateDesign(design.id, { notes: event.target.value })}
                      placeholder="Anything we should know"
                    />
                  </label>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={`Remove ${design.name}`}
                    onClick={() => removeDesign(design.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                  {design.backdropLabel && (
                    <div className="intake-flag amber">
                      <span>
                        This one has a solid {design.backdropLabel} background. Want us to knock it out?
                      </span>
                      <label>
                        <input
                          type="checkbox"
                          checked={design.removeBackground}
                          onChange={(event) =>
                            updateDesign(design.id, { removeBackground: event.target.checked })
                          }
                        />
                        Remove background
                      </label>
                    </div>
                  )}
                  {quality.tone === 'poor' && dpi > 0 && (
                    <div className="intake-flag red">
                      <span>
                        This will print soft at {size.widthIn.toFixed(size.widthIn % 1 ? 1 : 0)} in wide. Send
                        a bigger file, or let us upscale it.
                      </span>
                      <label>
                        <input
                          type="checkbox"
                          checked={design.upscale}
                          onChange={(event) => updateDesign(design.id, { upscale: event.target.checked })}
                        />
                        Upscale it
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            type="button"
            className="add-design"
            disabled={!customerName.trim()}
            onClick={() => {
              if (customerName.trim()) inputRef.current?.click()
            }}
          >
            <Plus size={18} /> Add another image — PNG, JPG, PDF or HEIC
          </button>

          <label className="customer-name-field" style={{ marginTop: 22 }}>
            Order note
            <textarea
              className="intake-order-note"
              rows={3}
              value={orderNote}
              onChange={(event) => setOrderNote(event.target.value)}
              placeholder="All going on black tees. Need them Friday if you can swing it."
            />
          </label>
        </section>

        <aside className="order-panel panel intake-order">
          <div className="order-title">
            <div>
              <h2>Your order</h2>
              <p className="order-hint">{customerName.trim() || 'Add your name to start'}</p>
            </div>
          </div>

          <button
            type="button"
            className={`precut-button ${cutOut ? 'selected' : ''}`}
            aria-pressed={cutOut}
            onClick={() => setCutOut((value) => !value)}
          >
            <span className="precut-button-title">Cut them out for me</span>
            <small>
              We&apos;ll trim every transfer so they peel and press ready (${cutRate.toFixed(2)} each).
            </small>
          </button>

          <div className="metrics">
            <div className="metric">
              <span>Designs</span>
              <strong>{designs.length}</strong>
            </div>
            <div className="metric">
              <span>Transfers</span>
              <strong>{totalTransfers}</strong>
            </div>
            <div className="metric">
              <span>Sheet size</span>
              <strong className="green-text">{sheet.label}</strong>
            </div>
          </div>

          <div className="intake-info-box">
            <p>We nest and turn your designs to use the least film possible.</p>
            {hasSizeUnknown && (
              <p>
                One design on this sheet still needs a size from us — we&apos;ll email you if it changes the
                price.
              </p>
            )}
          </div>

          <p className="build-fee-warning" role="status">
            A gang sheet build fee will be applied: <strong>$5.00</strong> up to 100 in,{' '}
            <strong>$10.00</strong> for sheets over 100 in.
          </p>

          <div className="price-breakdown intake-price">
            <div>
              <span>Gang sheet — {billedLength} in</span>
              <strong>${sheet.price.toFixed(2)}</strong>
            </div>
            {buildFee > 0 && (
              <div>
                <span>Build fee{billedLength >= 101 ? ' (over 100 in)' : ''}</span>
                <strong>${buildFee.toFixed(2)}</strong>
              </div>
            )}
            {cutOut && totalTransfers > 0 && (
              <div>
                <span>
                  Pre-cut ({totalTransfers} × ${cutRate.toFixed(2)})
                </span>
                <strong>${cutFee.toFixed(2)}</strong>
              </div>
            )}
            <div className="intake-total">
              <span>Total</span>
              <strong>${total}</strong>
            </div>
          </div>

          <button
            type="button"
            className="build-button"
            disabled={saving || cartStatus === 'sending' || designs.length === 0 || !customerName.trim()}
            onClick={() => void submitAndPay()}
          >
            <Check size={18} />
            {saving || cartStatus === 'sending'
              ? uploadProgress != null
                ? `Uploading… ${Math.round(uploadProgress * 100)}%`
                : 'Submitting…'
              : 'Submit & pay'}
          </button>
          <p className="intake-submit-hint">You&apos;ll get a confirmation with your job number.</p>
          {saveError && <p className="save-error">{saveError}</p>}
          {cartStatus === 'error' && cartError && <p className="save-error">{cartError}</p>}
          <p className="builder-version">Builder v{BUILDER_VERSION}</p>
        </aside>
      </div>
    </main>
  )
}
