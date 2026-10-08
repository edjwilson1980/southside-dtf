'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Eye, FileImage, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Scissors, Sticker, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
import { SheetPreviewModal } from '@/components/sheet-preview-modal'
import { ShopNav } from '@/components/shop-nav'
import { CutShapeOverlay } from '@/components/cut-shape-overlay'
import {
  composeGangSheet,
  packSheetBestGutter,
  piecePrintSize,
  ART_INSET_IN,
  CUT_ART_START_IN,
} from '@/lib/compose-sheet'
import { type LayoutPiece } from '@/components/sheet-layout-overlay'
import { BUILDER_VERSION } from '@/lib/version'
import {
  CUT_GUTTER_IN,
  MARK_CLEARANCE_IN,
  registrationMarkBounds,
  registrationMarkRects,
  startMarkArrowPoints,
} from '@/lib/cut-layout'
import {
  CUT_MODES,
  buildCutShapes,
  cutPltForShapes,
  shapeTooTallForCutter,
  type CutMode,
  type CutShape,
} from '@/lib/custom-cut'
import { trimEmptySpace } from '@/lib/crop-image'
import { parsePrintWidthInches, printDpi, qualityFromDpi, readImageSize } from '@/lib/image-utils'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { DESIGN_ACCEPT, DESIGN_ACCEPT_LABEL, isAcceptedDesignFile } from '@/lib/accepted-uploads'
import { prepareEditableUpload } from '@/lib/rasterize-upload'

type Design = {
  id: number
  designNumber: number
  name: string
  /** Always Custom — stickers use free W×H, not garment presets. */
  placement: 'Custom'
  size: string
  customWidth: string
  customHeight: string
  quantity: number
  notes: string
  color: string
  originalUrl: string
  previewUrl: string
  enhanced: boolean
  pixelWidth: number
  pixelHeight: number
  keepUpright: boolean
}

const logoUrl =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'

type StickerProduct = 'uv-dtf' | 'vinyl'

const PRODUCT_MODES: {
  value: StickerProduct
  label: string
  hint: string
}[] = [
  {
    value: 'uv-dtf',
    label: 'UV DTF stickers',
    hint: 'Media width locks to 22 in. Set the length (height) for the sheet.',
  },
  {
    value: 'vinyl',
    label: 'Vinyl sticker maker',
    hint: 'Customize media width and length for vinyl.',
  },
]

const DEFAULT_STICKER_W = '3'
const DEFAULT_STICKER_H = '3'
/** UV DTF sticker media is always 22 in wide. */
const UV_DTF_MEDIA_WIDTH_IN = 22
const MIN_MEDIA_IN = 4
const MAX_VINYL_MEDIA_WIDTH_IN = 48
const MAX_MEDIA_HEIGHT_IN = 200
const MAX_STICKER_H = 199
const DEFAULT_VINYL_WIDTH_IN = 12
const DEFAULT_MEDIA_HEIGHT_IN = 24

function clampVinylWidth(value: number) {
  return Math.min(MAX_VINYL_MEDIA_WIDTH_IN, Math.max(MIN_MEDIA_IN, value))
}

function clampMediaHeight(value: number) {
  return Math.min(MAX_MEDIA_HEIGHT_IN, Math.max(MIN_MEDIA_IN, value))
}

function mediaLabel(widthIn: number, heightIn: number) {
  return `${widthIn.toFixed(2).replace(/\.00$/, '')} × ${heightIn.toFixed(2).replace(/\.00$/, '')} in`
}

function stickerSizeLabel(width: string, height: string) {
  return `${width || '0'} × ${height || '0'} in`
}

function howToStepsFor(product: StickerProduct) {
  return [
    { id: 'step-1', number: 1, title: 'Customer name', detail: 'Type the customer name first.' },
    { id: 'step-2', number: 2, title: 'Upload artwork', detail: 'Drop or click to add sticker art.' },
    { id: 'step-3', number: 3, title: 'Sticker size & edit', detail: 'Set each sticker W×H, crop, and quantity.' },
    {
      id: 'step-4',
      number: 4,
      title: product === 'uv-dtf' ? 'Length & cut' : 'Media size & cut',
      detail:
        product === 'uv-dtf'
          ? 'Width is 22 in. Set length, pick cut type, then build.'
          : 'Set vinyl width × length, pick cut type, then build.',
    },
  ]
}

function GuideHeading({ number, title, hint }: { number: number; title: string; hint: string }) {
  return (
    <div className="guide-heading">
      <span className="guide-num">{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
    </div>
  )
}

function revokeUnusedUrls(urls: Array<string | null>, remaining: Design[]) {
  for (const url of urls) {
    if (!url) continue
    const stillUsed = remaining.some((design) => design.originalUrl === url || design.previewUrl === url)
    if (!stillUsed) URL.revokeObjectURL(url)
  }
}

export default function StickerMakerPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [designs, setDesigns] = useState<Design[]>([])
  const [dragging, setDragging] = useState(false)
  const [built, setBuilt] = useState(false)
  const [replaceTargetId, setReplaceTargetId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [inspectId, setInspectId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false)
  const [jobStamp, setJobStamp] = useState('')
  const [cutMode, setCutMode] = useState<CutMode>('box')
  const [product, setProduct] = useState<StickerProduct>('uv-dtf')
  const [vinylWidthIn, setVinylWidthIn] = useState(DEFAULT_VINYL_WIDTH_IN)
  const [mediaHeightIn, setMediaHeightIn] = useState(DEFAULT_MEDIA_HEIGHT_IN)
  const [cutShapes, setCutShapes] = useState<CutShape[]>([])
  const [shapesBusy, setShapesBusy] = useState(false)
  const previewGen = useRef(0)

  const mediaWidthIn = product === 'uv-dtf' ? UV_DTF_MEDIA_WIDTH_IN : vinylWidthIn
  const maxStickerWidthIn = mediaWidthIn
  const howToSteps = howToStepsFor(product)
  const productLabel = PRODUCT_MODES.find((mode) => mode.value === product)?.label ?? 'Sticker Maker'

  function selectProduct(next: StickerProduct) {
    setProduct(next)
    if (next === 'uv-dtf') {
      // Width is fixed; keep the current length.
      return
    }
    setVinylWidthIn((current) => clampVinylWidth(current || DEFAULT_VINYL_WIDTH_IN))
  }

  async function addFiles(list: FileList | File[]) {
    if (!customerName.trim()) return
    const incoming = Array.from(list)
    const accepted = incoming.filter((file) => isAcceptedDesignFile(file))
    if (accepted.length === 0) return

    const prepared = []
    for (const file of accepted) {
      try {
        prepared.push(await prepareEditableUpload(file))
      } catch {
        // Skip unreadable files quietly in the shop tool.
      }
    }
    if (prepared.length === 0) return

    const additions = prepared.map((item, index) => {
      const originalUrl = item.editUrl
      return {
        id: Date.now() + index,
        designNumber: 0,
        name: item.sourceFile.name,
        placement: 'Custom' as const,
        size: stickerSizeLabel(DEFAULT_STICKER_W, DEFAULT_STICKER_H),
        customWidth: DEFAULT_STICKER_W,
        customHeight: DEFAULT_STICKER_H,
        quantity: 1,
        notes: '',
        color: index % 2 ? 'red' : 'blue',
        originalUrl,
        previewUrl: originalUrl,
        enhanced: false,
        pixelWidth: item.measured.pixelWidth,
        pixelHeight: item.measured.pixelHeight,
        keepUpright: false,
      } satisfies Design
    })

    setDesigns((current) => [
      ...current,
      ...additions.map((design, index) => ({
        ...design,
        designNumber: current.length + index + 1,
      })),
    ])

    for (const design of additions) {
      if (!design.originalUrl) continue
      void trimUploadedDesign(design.id, design.originalUrl)
    }
  }

  async function trimUploadedDesign(id: number, sourceUrl: string) {
    try {
      const result = await trimEmptySpace(sourceUrl)
      setDesigns((items) =>
        items.map((item) => {
          if (item.id !== id) return item
          if (!result.trimmed) {
            return { ...item, pixelWidth: result.width, pixelHeight: result.height }
          }
          const nextUrl = URL.createObjectURL(result.blob)
          if (item.originalUrl === sourceUrl || item.previewUrl === sourceUrl) {
            URL.revokeObjectURL(sourceUrl)
          }
          return {
            ...item,
            originalUrl: item.originalUrl === sourceUrl ? nextUrl : item.originalUrl,
            previewUrl: item.previewUrl === sourceUrl ? nextUrl : item.previewUrl,
            pixelWidth: result.width,
            pixelHeight: result.height,
          }
        }),
      )
    } catch {
      readImageSize(sourceUrl).then((size) => {
        setDesigns((items) =>
          items.map((item) =>
            item.id === id ? { ...item, pixelWidth: size.width, pixelHeight: size.height } : item,
          ),
        )
      })
    }
  }

  const totalTransfers = designs.reduce((sum, design) => sum + design.quantity, 0)
  const previewPieces = designs.flatMap((design) => Array.from({ length: design.quantity }, () => design))

  const getDesignSize = (design: Design) =>
    piecePrintSize({
      placement: design.placement,
      size: design.size,
      customWidth: design.customWidth,
      customHeight: design.customHeight,
      pixelWidth: design.pixelWidth,
      pixelHeight: design.pixelHeight,
      widthIn: parsePrintWidthInches(design.size, design.placement, design.customWidth),
    })
  const getDesignWidth = (design: Design) => getDesignSize(design).widthIn
  const getDesignHeight = (design: Design) => getDesignSize(design).heightIn

  const pieceInputs = previewPieces.map((design) => ({
    previewUrl: design.previewUrl,
    widthIn: getDesignWidth(design),
    heightIn: getDesignHeight(design),
    allowRotate: !design.keepUpright,
  }))
  const packWidthIn = Math.max(MIN_MEDIA_IN, mediaWidthIn - MARK_CLEARANCE_IN * 2)
  const uprightLayout = packSheetBestGutter(pieceInputs, {
    packWidthIn,
    startYIn: ART_INSET_IN,
    rotatePolicy: 'none' as const,
  })
  const sheetLayout = packSheetBestGutter(pieceInputs, {
    packWidthIn,
    startYIn: CUT_ART_START_IN,
    sideInsetIn: MARK_CLEARANCE_IN,
    minGutterIn: CUT_GUTTER_IN,
  })
  const contentHeightIn = Math.max(0, sheetLayout.contentEndY - CUT_ART_START_IN)
  const printHeight = Math.max(mediaHeightIn, sheetLayout.contentEndY + CUT_ART_START_IN)
  const pageOverflow = contentHeightIn + CUT_ART_START_IN * 2 > mediaHeightIn + 1e-6
  const cutMarkRects = registrationMarkRects(printHeight, mediaWidthIn, sheetLayout.pieces)
  const cutMarks = registrationMarkBounds(printHeight, mediaWidthIn, sheetLayout.pieces)
  const startArrow = cutMarks.find((mark) => mark.first)
  const startArrowPoints = startArrow ? startMarkArrowPoints(startArrow) : []
  const billedLength = Math.ceil(printHeight - 1e-9)
  const cutTooTall = shapeTooTallForCutter(cutShapes)
  const layoutPieces: LayoutPiece[] = sheetLayout.pieces.map((piece) => ({
    xIn: piece.xIn,
    yIn: piece.yIn,
    widthIn: piece.widthIn,
    heightIn: piece.heightIn,
  }))
  const rotatedCount = sheetLayout.rotatedCount
  const filmSavedIn = Math.max(0, uprightLayout.contentBottom - sheetLayout.contentBottom)
  const rotateSaveMessage =
    rotatedCount > 0 && filmSavedIn > 0.05
      ? `Turned ${rotatedCount} design${rotatedCount === 1 ? '' : 's'} a quarter turn to fit more across — saves ${filmSavedIn.toFixed(1)} in of film.`
      : null
  const layoutKey =
    designs
      .map((design) =>
        [
          design.id,
          design.quantity,
          design.size,
          design.keepUpright,
          design.customWidth,
          design.customHeight,
          design.previewUrl,
          design.pixelWidth,
          design.pixelHeight,
        ].join(':'),
      )
      .join('|') + `|product:${product}|cut:${cutMode}|media:${mediaWidthIn}x${mediaHeightIn}`
  const sheetLabelText = mediaLabel(mediaWidthIn, billedLength)
  const fillPercent =
    mediaHeightIn > 0 ? Math.min(100, Math.round((printHeight / mediaHeightIn) * 100)) : 0
  const sheetFillMessage =
    designs.length === 0
      ? null
      : pageOverflow
        ? `Art needs ${printHeight.toFixed(1)} in — taller than the ${mediaHeightIn} in media. Sheet length grew to fit.`
        : `Media is ${fillPercent}% used (${printHeight.toFixed(1)} of ${mediaHeightIn} in)`
  const sheetName = customerName.trim() || 'Sticker Maker'
  const currentGuideStep = !customerName.trim() ? 1 : designs.length === 0 ? 2 : !previewing && !built ? 3 : 4

  const updateDesign = (id: number, patch: Partial<Design>) =>
    setDesigns((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const duplicateDesign = (sourceId: number) => {
    const source = designs.find((design) => design.id === sourceId)
    if (!source) return
    setDesigns((items) => {
      const nextId = Math.max(0, ...items.map((item) => item.id)) + 1
      return [...items, { ...source, id: nextId, quantity: 1 }]
    })
  }

  const removeDesign = (id: number) => {
    setDesigns((items) => {
      const target = items.find((item) => item.id === id)
      const remaining = items.filter((item) => item.id !== id)
      if (target) revokeUnusedUrls([target.originalUrl, target.previewUrl], remaining)
      return remaining
    })
    setInspectId((current) => (current === id ? null : current))
  }

  const applyInspectedDesign = (id: number, previewUrl: string) => {
    setDesigns((items) =>
      items.map((item) => {
        if (item.id !== id) return item
        if (item.previewUrl !== item.originalUrl && item.previewUrl !== previewUrl) {
          revokeUnusedUrls(
            [item.previewUrl],
            items.filter((other) => other.id !== id).concat([{ ...item, previewUrl }]),
          )
        }
        return { ...item, previewUrl, enhanced: previewUrl !== item.originalUrl }
      }),
    )
    setInspectId(null)
    readImageSize(previewUrl).then((size) => {
      setDesigns((items) =>
        items.map((item) =>
          item.id === id ? { ...item, pixelWidth: size.width, pixelHeight: size.height } : item,
        ),
      )
    })
  }
  const inspectDesign = designs.find((design) => design.id === inspectId && design.previewUrl)

  async function replaceDesignArtwork(id: number, file: File) {
    if (!isAcceptedDesignFile(file)) return
    try {
      const prepared = await prepareEditableUpload(file)
      setDesigns((items) => {
        const target = items.find((item) => item.id === id)
        const next = items.map((item) =>
          item.id === id
            ? {
                ...item,
                name: prepared.sourceFile.name,
                originalUrl: prepared.editUrl,
                previewUrl: prepared.editUrl,
                enhanced: false,
                pixelWidth: prepared.measured.pixelWidth,
                pixelHeight: prepared.measured.pixelHeight,
              }
            : item,
        )
        if (target) revokeUnusedUrls([target.originalUrl, target.previewUrl], next)
        return next
      })
      if (prepared.editUrl) void trimUploadedDesign(id, prepared.editUrl)
    } catch {
      // Internal shop tool — operator sees the thumbnail stay put on failure.
    }
  }

  function startReplace(id: number) {
    setReplaceTargetId(id)
    replaceInputRef.current?.click()
  }

  const duplicateLatestDesign = () => {
    const latest = designs[designs.length - 1]
    if (latest) duplicateDesign(latest.id)
  }

  useEffect(() => {
    previewGen.current += 1
    setPreviewing(false)
    setSheetPreviewOpen(false)
    setJobStamp('')
    setBuilt(false)
    setSheetPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
  }, [layoutKey, customerName])

  function sheetPxPerIn(maxEdge: number, preferred: number) {
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(printHeight, mediaWidthIn))))
  }

  async function refreshCutShapes() {
    if (sheetLayout.pieces.length === 0) {
      setCutShapes([])
      return []
    }
    setShapesBusy(true)
    try {
      const shapes = await buildCutShapes(sheetLayout.pieces, cutMode, mediaWidthIn, printHeight)
      setCutShapes(shapes)
      return shapes
    } finally {
      setShapesBusy(false)
    }
  }

  async function composeCurrentSheet(pxPerIn: number, label: string, mapCmyk = false) {
    if (sheetLayout.pieces.length === 0) throw new Error('Add a design before previewing the sheet.')
    return composeGangSheet({
      pieces: sheetLayout.pieces,
      sheetLengthIn: printHeight,
      sheetWidthIn: mediaWidthIn,
      pxPerIn,
      label,
      mapCmyk,
      marks: cutMarkRects,
      startArrow: startArrowPoints,
    })
  }

  async function previewStickerSheet() {
    if (!customerName.trim() || designs.length === 0 || previewBusy || saving) return
    if (sheetPreviewUrl && previewing) {
      setSheetPreviewOpen(true)
      return
    }
    const stamp = sheetStamp()
    const label = sheetJobName(customerName.trim(), billedLength, stamp)
    setJobStamp(stamp)
    const gen = ++previewGen.current
    setPreviewBusy(true)
    setSaveError(null)
    setBuilt(false)
    try {
      await refreshCutShapes()
      if (gen !== previewGen.current) return
      const blob = await composeCurrentSheet(sheetPxPerIn(3600, 72), label)
      if (gen !== previewGen.current) return
      setSheetPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return URL.createObjectURL(blob)
      })
      setPreviewing(true)
      setSheetPreviewOpen(true)
    } catch (err) {
      if (gen !== previewGen.current) return
      setSaveError(err instanceof Error ? err.message : 'Could not preview the sticker sheet.')
    } finally {
      if (gen === previewGen.current) setPreviewBusy(false)
    }
  }

  async function buildAndStore() {
    if (!customerName.trim() || designs.length === 0 || saving || !previewing) return
    setSaving(true)
    setSaveError(null)
    setDriveFolderUrl(null)
    try {
      const stamp = jobStamp || sheetStamp()
      const label = sheetJobName(customerName.trim(), billedLength, stamp)
      const fileName = sheetFileName(customerName.trim(), billedLength, stamp)
      const shapes = await refreshCutShapes()
      const png = await composeCurrentSheet(sheetPxPerIn(14000, 150), label, true)
      downloadBlob(png, fileName)
      const plt = cutPltForShapes(shapes, printHeight, mediaWidthIn, sheetLayout.pieces)
      if (!plt) throw new Error('Could not build the cutter PLT for this sheet.')
      const cutName = sheetCutFileName(customerName.trim(), billedLength, stamp)
      await wait(200)
      downloadBlob(new Blob([plt], { type: 'text/plain' }), cutName)
      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files: [{ name: fileName, mimeType: 'image/png', blob: png }],
        cutterFile: { name: cutName, content: plt, mimeType: 'text/plain' },
      })
      setDriveFolderUrl(drive.folderUrl)
      setBuilt(true)
      setSheetPreviewOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not build the sticker sheet.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="builder-shell">
      <div className="builder-topbar">
        <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
        <div className="title-block">
          <h1>Sticker Maker</h1>
          <p className="lead">UV DTF (22 in wide) or vinyl stickers — crop, size, cut, and export.</p>
          <p className="sublead">Crop and clean art, then export print PNG + cutter PLT (box, circle, or cut around object).</p>
        </div>
        <ShopNav current="sticker-maker" />
      </div>

      <div className="sticker-product-tabs" role="tablist" aria-label="Sticker product">
        {PRODUCT_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="tab"
            aria-selected={product === mode.value}
            className={`sticker-product-tab ${product === mode.value ? 'selected' : ''}`}
            onClick={() => selectProduct(mode.value)}
          >
            <strong>{mode.label}</strong>
            <span>{mode.hint}</span>
          </button>
        ))}
      </div>

      <ol className="how-to" aria-label="How to make stickers">
        {howToSteps.map((step) => (
          <li key={step.id}>
            <a
              href={`#${step.id}`}
              className={`how-to-item ${currentGuideStep === step.number ? 'current' : ''} ${currentGuideStep > step.number ? 'done' : ''}`}
            >
              <b>{step.number}</b>
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </a>
          </li>
        ))}
      </ol>

      <div className="builder-grid">
        <section className="workspace panel">
          <div id="step-1" className="guide-block">
            <GuideHeading number={1} title="Customer name" hint="Type the customer name before you upload anything." />
            <label className="customer-name-field workspace-customer-name">
              Customer name <span className="required-field">Required</span>
              <input
                required
                type="text"
                maxLength={80}
                placeholder="Enter customer name before uploading"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </label>
          </div>

          <div id="step-2" className="guide-block">
            <GuideHeading
              number={2}
              title="Upload sticker art"
              hint="Drop a PNG, JPG, PDF, or SVG here, or click to choose a file. Click a design to crop, clean, or upscale."
            />
          </div>
          <button
            className={`dropzone ${dragging ? 'dragging' : ''} ${!customerName.trim() ? 'customer-required-disabled' : ''}`}
            aria-disabled={!customerName.trim()}
            title={!customerName.trim() ? 'Enter a customer name first' : undefined}
            onClick={() => {
              if (customerName.trim()) inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void addFiles(e.dataTransfer.files)
            }}
          >
            <Upload size={48} strokeWidth={1.7} />
            <strong>Drop your sticker artwork here</strong>
            <span>{DESIGN_ACCEPT_LABEL}</span>
            <small>Click a design to crop, check quality, and upscale</small>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            multiple
            accept={DESIGN_ACCEPT}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={replaceInputRef}
            className="sr-only"
            type="file"
            accept={DESIGN_ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && replaceTargetId !== null) void replaceDesignArtwork(replaceTargetId, file)
              setReplaceTargetId(null)
              e.target.value = ''
            }}
          />

          <div className="divider" />

          <div id="step-3" className="guide-block design-heading">
            <GuideHeading
              number={3}
              title="Sticker size & edit"
              hint="Set width × height for each sticker, quantity, and crop/clean the art."
            />
            <h2 className="design-count">Your stickers ({designs.length})</h2>
          </div>

          {designs.length === 0 && (
            <div className="empty-designs">
              <FileImage size={24} />
              <span>Your uploaded stickers will appear here.</span>
            </div>
          )}

          <div className="design-list">
            {designs.map((design) => {
              const dpi = printDpi(design.pixelWidth, getDesignWidth(design))
              const quality = qualityFromDpi(dpi)
              return (
                <div className="design-row" key={design.id}>
                  <div className="drag-handle">
                    ⋮
                    <br />⋮
                  </div>
                  <button
                    type="button"
                    className={`thumb ${design.previewUrl ? 'has-art' : design.color}`}
                    disabled={!design.previewUrl}
                    onClick={() => design.previewUrl && setInspectId(design.id)}
                    aria-label={`Inspect ${design.name}`}
                  >
                    {design.previewUrl ? (
                      <img src={design.previewUrl} alt="" />
                    ) : (
                      <>
                        <ImageIcon size={24} />
                        <small>ARTWORK</small>
                      </>
                    )}
                    <span className="thumb-status">Click to crop / edit</span>
                  </button>
                  <div className="design-name">
                    <strong>{design.name}</strong>
                    <span
                      className={
                        quality.tone === 'good'
                          ? 'quality'
                          : quality.tone === 'poor'
                            ? 'quality-warn'
                            : 'transparent'
                      }
                    >
                      {quality.tone === 'good' ? <Check size={13} /> : null}
                      {dpi ? `${dpi} DPI · ${quality.label}` : 'Click art to check quality'}
                    </span>
                    {design.enhanced && <span className="quality">Upscaled</span>}
                    <button
                      type="button"
                      className="compare-link"
                      disabled={!design.previewUrl}
                      onClick={() => setInspectId(design.id)}
                    >
                      Crop · View large · Upscale
                    </button>
                  </div>
                  <div className="custom-dimensions">
                    <span>
                      Sticker size (max {maxStickerWidthIn} in wide × {MAX_STICKER_H} in high)
                    </span>
                    <div>
                      <label>
                        Width (in)
                        <input
                          aria-label={`Sticker width for ${design.name}`}
                          type="number"
                          min="0.25"
                          max={maxStickerWidthIn}
                          step="0.25"
                          placeholder="Width"
                          value={design.customWidth}
                          onChange={(e) => {
                            const width = Math.min(maxStickerWidthIn, Math.max(0, Number(e.target.value) || 0))
                            const value = e.target.value === '' ? '' : String(width)
                            updateDesign(design.id, {
                              customWidth: value,
                              size: stickerSizeLabel(value, design.customHeight),
                            })
                          }}
                        />
                      </label>
                      <label>
                        Height (in)
                        <input
                          aria-label={`Sticker height for ${design.name}`}
                          type="number"
                          min="0.25"
                          max={MAX_STICKER_H}
                          step="0.25"
                          placeholder="Height"
                          value={design.customHeight}
                          onChange={(e) => {
                            const height = Math.min(MAX_STICKER_H, Math.max(0, Number(e.target.value) || 0))
                            const value = e.target.value === '' ? '' : String(height)
                            updateDesign(design.id, {
                              customHeight: value,
                              size: stickerSizeLabel(design.customWidth, value),
                            })
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <label>
                    Quantity
                    <div className="number-input">
                      <button
                        aria-label="Decrease sticker quantity"
                        onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        aria-label={`Quantity for ${design.name}`}
                        type="number"
                        min="1"
                        step="1"
                        value={design.quantity}
                        onChange={(event) =>
                          updateDesign(design.id, {
                            quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                          })
                        }
                      />
                      <button
                        aria-label="Increase sticker quantity"
                        onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </label>
                  <div className="design-actions-stack">
                    <button
                      type="button"
                      className="row-action"
                      title="Replace artwork"
                      aria-label={`Replace artwork for ${design.name}`}
                      onClick={() => startReplace(design.id)}
                    >
                      <Replace size={15} />
                    </button>
                    <button
                      type="button"
                      className="row-action"
                      title="Duplicate this sticker"
                      aria-label={`Duplicate ${design.name}`}
                      onClick={() => duplicateDesign(design.id)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      className={`row-action${design.keepUpright ? ' upright' : ''}`}
                      aria-pressed={design.keepUpright}
                      title={
                        design.keepUpright
                          ? 'Keep this sticker upright'
                          : 'Allow turning to fit more across'
                      }
                      aria-label={
                        design.keepUpright
                          ? `Keep ${design.name} upright`
                          : `Allow turning ${design.name}`
                      }
                      onClick={() => updateDesign(design.id, { keepUpright: !design.keepUpright })}
                    >
                      <RotateCw size={15} />
                    </button>
                    <button
                      type="button"
                      className="row-action danger"
                      title="Remove sticker"
                      aria-label={`Remove ${design.name}`}
                      onClick={() => removeDesign(design.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="design-footer-actions">
            <button
              className="add-design"
              disabled={!customerName.trim()}
              onClick={() => {
                if (customerName.trim()) inputRef.current?.click()
              }}
            >
              <Plus size={20} /> Add Another Sticker
            </button>
            <button className="duplicate-design" disabled={designs.length === 0} onClick={duplicateLatestDesign}>
              <Copy size={18} /> Duplicate Sticker
            </button>
          </div>

          {inspectDesign && (
            <DesignInspector
              design={inspectDesign}
              onClose={() => setInspectId(null)}
              onApply={(previewUrl) => applyInspectedDesign(inspectDesign.id, previewUrl)}
            />
          )}
          {sheetPreviewOpen && sheetPreviewUrl && (
            <SheetPreviewModal
              url={sheetPreviewUrl}
              sheetLabel={sheetLabelText}
              sheetLengthIn={billedLength}
              totalTransfers={totalTransfers}
              saving={saving}
              onClose={() => setSheetPreviewOpen(false)}
              onConfirm={() => void buildAndStore()}
              cutBoxes={cutShapes.map((shape) => shape.bounds)}
              cutMarks={cutMarks}
              printHeightIn={printHeight}
              sheetWidthIn={mediaWidthIn}
              cutOut
              audience="shop"
              layoutPieces={layoutPieces}
            />
          )}
        </section>

        <aside className="order-panel panel">
          <div id="step-4" className="order-title">
            <span className="guide-num">4</span>
            <div>
              <h2>
                {product === 'uv-dtf' ? 'Length, cut type & build' : 'Media size, cut type & build'}
              </h2>
              <p className="order-hint">
                {product === 'uv-dtf'
                  ? 'UV DTF media is 22 in wide. Set the length, pick how we cut, then build.'
                  : 'Set vinyl width and length, pick how we cut, then build.'}
              </p>
            </div>
          </div>

          <div className="sticker-media-size">
            <span className="precut-button-title">
              <Maximize2 size={18} /> {product === 'uv-dtf' ? 'UV DTF media' : 'Vinyl media size'}
            </span>
            <div className="sticker-size-fields">
              <label>
                Width (in)
                <input
                  type="number"
                  min={product === 'uv-dtf' ? UV_DTF_MEDIA_WIDTH_IN : MIN_MEDIA_IN}
                  max={product === 'uv-dtf' ? UV_DTF_MEDIA_WIDTH_IN : MAX_VINYL_MEDIA_WIDTH_IN}
                  step="0.25"
                  value={mediaWidthIn}
                  disabled={product === 'uv-dtf'}
                  readOnly={product === 'uv-dtf'}
                  onChange={(e) => {
                    if (product !== 'vinyl') return
                    setVinylWidthIn(clampVinylWidth(Number(e.target.value) || MIN_MEDIA_IN))
                  }}
                />
              </label>
              <label>
                Length (in)
                <input
                  type="number"
                  min={MIN_MEDIA_IN}
                  max={MAX_MEDIA_HEIGHT_IN}
                  step="0.25"
                  value={mediaHeightIn}
                  onChange={(e) => setMediaHeightIn(clampMediaHeight(Number(e.target.value) || MIN_MEDIA_IN))}
                />
              </label>
            </div>
            <small>
              {product === 'uv-dtf'
                ? 'Width is fixed at 22 in for UV DTF stickers. Length grows automatically if stickers need more film.'
                : `Customize vinyl width (up to ${MAX_VINYL_MEDIA_WIDTH_IN} in) and length. Length grows if stickers need more media.`}
            </small>
          </div>

          <div className="sticker-cut-modes" role="group" aria-label="Cut type">
            <span className="precut-button-title">
              <Scissors size={18} /> Cut type
            </span>
            {CUT_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={`precut-button ${cutMode === mode.value ? 'selected' : ''}`}
                aria-pressed={cutMode === mode.value}
                onClick={() => setCutMode(mode.value)}
              >
                <span className="precut-button-title">
                  {mode.label}
                  {cutMode === mode.value ? <em>On</em> : null}
                </span>
                <small>{mode.hint}</small>
              </button>
            ))}
          </div>

          {cutTooTall && (
            <p className="save-error">
              A cut shape is taller than one cutter pass. Shorten the sticker or reduce packing.
            </p>
          )}
          {rotateSaveMessage && (
            <p className="rotate-save-note" aria-live="polite">
              {rotateSaveMessage}
            </p>
          )}

          <div className="metrics">
            <Metric label="Stickers" value={designs.length} icon={<ImageIcon size={24} />} />
            <Metric label="Total pieces" value={totalTransfers} icon={<Sticker size={25} />} />
            <Metric label="Product" value={product === 'uv-dtf' ? 'UV DTF' : 'Vinyl'} icon={<Sticker size={22} />} green />
            <Metric label="Media size" value={sheetLabelText} icon={<Maximize2 size={21} />} green />
            <Metric
              label="Cut type"
              value={CUT_MODES.find((mode) => mode.value === cutMode)?.label ?? cutMode}
              icon={<Scissors size={22} />}
              green
            />
            <div className="price-breakdown">
              <strong>{sheetName}</strong>
              <span>
                {productLabel} · {sheetLabelText} · {cutMode} cut
              </span>
              {shapesBusy && <span>Tracing cut paths…</span>}
            </div>
          </div>

          <div className="preview-heading">
            <strong>Sticker sheet</strong>
          </div>
          {sheetFillMessage && (
            <p className="sheet-fill-readout" aria-live="polite">
              {sheetFillMessage}
              <span className="sheet-fill-bar" aria-hidden="true">
                <span style={{ width: `${fillPercent}%` }} />
              </span>
            </p>
          )}
          <div className="sheet-preview">
            <span className="dimension horizontal">{mediaWidthIn} in</span>
            {sheetPreviewUrl ? (
              <button
                type="button"
                className="sheet-final-preview-button"
                onClick={() => setSheetPreviewOpen(true)}
              >
                <span className="sheet-final-preview-wrap">
                  <img className="sheet-final-preview" src={sheetPreviewUrl} alt="Sticker sheet preview" />
                  <CutShapeOverlay
                    shapes={cutShapes}
                    marks={cutMarks}
                    sheetWidthIn={mediaWidthIn}
                    sheetHeightIn={printHeight}
                  />
                </span>
              </button>
            ) : (
              <div className="mini-sheet preview-placeholder">
                {previewPieces.length ? '' : <div className="preview-empty">Add stickers</div>}
              </div>
            )}
            <span className="dimension vertical">{billedLength} in</span>
            <button
              className="build-button"
              disabled={previewBusy || saving || designs.length === 0 || !customerName.trim()}
              onClick={() => void previewStickerSheet()}
            >
              <Eye size={18} /> {previewBusy ? 'Building preview…' : 'Preview Sticker Sheet'}
            </button>
            {previewing && sheetPreviewUrl && (
              <button className="confirm-button" disabled={saving || shapesBusy} onClick={() => void buildAndStore()}>
                <Check size={18} /> {saving ? 'Saving to Drive…' : 'Confirm & Build Stickers'}
              </button>
            )}
            {saveError && <p className="save-error">{saveError}</p>}
          </div>

          {built && (
            <div className="built-card">
              <div className="built-title">
                <span>
                  <Check size={21} />
                </span>
                <strong>Your sticker sheet is built.</strong>
              </div>
              <p>
                {sheetLabelText} · {totalTransfers} pieces · {cutMode} cut · Ready
              </p>
              {driveFolderUrl && (
                <a className="drive-link" href={driveFolderUrl} target="_blank" rel="noreferrer">
                  Open job folder in Google Drive (print PNG + cutter PLT)
                </a>
              )}
              <button
                onClick={() => {
                  setBuilt(false)
                  setDriveFolderUrl(null)
                }}
              >
                Done <span>›</span>
              </button>
            </div>
          )}
          <p className="builder-version">Builder v{BUILDER_VERSION}</p>
        </aside>
      </div>
    </main>
  )
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

function Metric({
  label,
  value,
  icon,
  green,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  green?: boolean
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={green ? 'green-text' : ''}>{value}</strong>
      <i>{icon}</i>
    </div>
  )
}
