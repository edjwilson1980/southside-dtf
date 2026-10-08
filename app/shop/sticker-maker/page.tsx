'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Eye, FileImage, FolderOpen, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Save, Scissors, Sticker, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
import { SheetPreviewModal } from '@/components/sheet-preview-modal'
import { ShopNav } from '@/components/shop-nav'
import { CutShapeOverlay } from '@/components/cut-shape-overlay'
import {
  composeGangSheet,
  packSheetBestGutter,
  packSheetIntoPages,
  piecePrintSize,
  ART_INSET_IN,
  CUT_ART_START_IN,
  type PlacedSheetPiece,
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
  clampContourOffsetIn,
  cutPltForShapes,
  shapeTooTallForCutter,
  type CutMode,
  type CutShape,
} from '@/lib/custom-cut'

/** Spec v2.0.0 cut border (mm). */
const DEFAULT_BORDER_MM = 2
const BORDER_STEP_MM = 0.5
const MIN_BORDER_MM_BOX = 0
const MIN_BORDER_MM_SHAPE = 0.5
const MAX_BORDER_MM = 12

function mmToInches(mm: number) {
  return mm / 25.4
}

function clampBorderMm(mm: number, shape: CutMode) {
  const min = shape === 'box' ? MIN_BORDER_MM_BOX : MIN_BORDER_MM_SHAPE
  if (!Number.isFinite(mm)) return DEFAULT_BORDER_MM
  return Math.min(MAX_BORDER_MM, Math.max(min, Math.round(mm / BORDER_STEP_MM) * BORDER_STEP_MM))
}
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
    hint: 'Width is always 22 in (never wider). Min / default length 12 in.',
  },
  {
    value: 'vinyl',
    label: 'Vinyl sticker maker',
    hint: 'Default / min 8 × 11 in. Overflow becomes page 2, 3…',
  },
]

const DEFAULT_STICKER_W = '3'
const DEFAULT_STICKER_H = '3'
/** UV DTF sticker media is always exactly 22 in wide — never exceed. */
const UV_DTF_MEDIA_WIDTH_IN = 22
const MIN_UV_LENGTH_IN = 12
const MIN_VINYL_WIDTH_IN = 8
const MIN_VINYL_LENGTH_IN = 11
const MAX_VINYL_MEDIA_WIDTH_IN = 48
const MAX_MEDIA_HEIGHT_IN = 200
const MAX_STICKER_H = 199
const DEFAULT_VINYL_WIDTH_IN = MIN_VINYL_WIDTH_IN
const DEFAULT_VINYL_LENGTH_IN = MIN_VINYL_LENGTH_IN
const DEFAULT_UV_LENGTH_IN = MIN_UV_LENGTH_IN

function clampVinylWidth(value: number) {
  return Math.min(MAX_VINYL_MEDIA_WIDTH_IN, Math.max(MIN_VINYL_WIDTH_IN, value))
}

function clampVinylLength(value: number) {
  return Math.min(MAX_MEDIA_HEIGHT_IN, Math.max(MIN_VINYL_LENGTH_IN, value))
}

function clampUvLength(value: number) {
  return Math.min(MAX_MEDIA_HEIGHT_IN, Math.max(MIN_UV_LENGTH_IN, value))
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
    {
      id: 'step-2',
      number: 2,
      title: 'Cut options',
      detail:
        product === 'uv-dtf'
          ? 'No Cut or Box Cut only.'
          : 'No Cut or Add Contour Cut (Circle / Box / Contour).',
    },
    { id: 'step-3', number: 3, title: 'Upload artwork', detail: 'Drop or click to add sticker art.' },
    { id: 'step-4', number: 4, title: 'Sticker size & edit', detail: 'Set each sticker W×H, crop, and quantity.' },
    {
      id: 'step-5',
      number: 5,
      title: product === 'uv-dtf' ? 'Length & build' : 'Media size & build',
      detail:
        product === 'uv-dtf'
          ? 'Width stays 22 in. Length min 12 in. Then preview and build.'
          : 'Vinyl defaults to 8 × 11 in. Extra stickers become page 2, 3…',
    },
  ]
}

function pageFileSuffix(pageNumber: number, pageCount: number) {
  return pageCount > 1 ? ` p${pageNumber}` : ''
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
  const reopenInputRef = useRef<HTMLInputElement>(null)
  const [designs, setDesigns] = useState<Design[]>([])
  const [dragging, setDragging] = useState(false)
  const [built, setBuilt] = useState(false)
  const [replaceTargetId, setReplaceTargetId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [inspectId, setInspectId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false)
  const [jobStamp, setJobStamp] = useState('')
  /** Spec: No Cut by default (master toggle OFF). */
  const [cutEnabled, setCutEnabled] = useState(false)
  const [cutMode, setCutMode] = useState<CutMode>('box')
  const [borderMm, setBorderMm] = useState(DEFAULT_BORDER_MM)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [product, setProduct] = useState<StickerProduct>('uv-dtf')
  const [vinylWidthIn, setVinylWidthIn] = useState(DEFAULT_VINYL_WIDTH_IN)
  const [vinylLengthIn, setVinylLengthIn] = useState(DEFAULT_VINYL_LENGTH_IN)
  const [uvLengthIn, setUvLengthIn] = useState(DEFAULT_UV_LENGTH_IN)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [pagePreviewUrls, setPagePreviewUrls] = useState<string[]>([])
  const [cutShapes, setCutShapes] = useState<CutShape[]>([])
  const [shapesBusy, setShapesBusy] = useState(false)
  const previewGen = useRef(0)
  const contourRefreshGen = useRef(0)

  const mediaWidthIn = product === 'uv-dtf' ? UV_DTF_MEDIA_WIDTH_IN : vinylWidthIn
  const mediaHeightIn = product === 'uv-dtf' ? uvLengthIn : vinylLengthIn
  const maxStickerWidthIn = mediaWidthIn
  const howToSteps = howToStepsFor(product)
  const productLabel = PRODUCT_MODES.find((mode) => mode.value === product)?.label ?? 'Sticker Maker'
  const paginateVinyl = product === 'vinyl'
  /** UV DTF may only use Box when cutting; vinyl may use Circle / Box / Contour. */
  const effectiveCutMode: CutMode = product === 'uv-dtf' ? 'box' : cutMode
  const contourOffsetIn = clampContourOffsetIn(mmToInches(clampBorderMm(borderMm, effectiveCutMode)))
  const cutLabel = !cutEnabled
    ? 'No Cut'
    : product === 'uv-dtf'
      ? 'Box Cut'
      : CUT_MODES.find((mode) => mode.value === effectiveCutMode)?.label ?? 'Cut'

  function selectProduct(next: StickerProduct) {
    setProduct(next)
    setActivePageIndex(0)
    if (next === 'uv-dtf') {
      setCutMode('box')
      setUvLengthIn((current) => clampUvLength(current < MIN_UV_LENGTH_IN ? DEFAULT_UV_LENGTH_IN : current))
      return
    }
    setVinylWidthIn((current) => clampVinylWidth(current < MIN_VINYL_WIDTH_IN ? DEFAULT_VINYL_WIDTH_IN : current))
    setVinylLengthIn((current) =>
      clampVinylLength(current < MIN_VINYL_LENGTH_IN ? DEFAULT_VINYL_LENGTH_IN : current),
    )
  }

  function setCuttingOn(enabled: boolean) {
    setCutEnabled(enabled)
    if (enabled && product === 'uv-dtf') setCutMode('box')
  }

  function revokePagePreviewUrls(urls: string[]) {
    for (const url of urls) URL.revokeObjectURL(url)
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
  const packWidthIn = Math.max(1, mediaWidthIn - MARK_CLEARANCE_IN * 2)
  const packOpts = {
    packWidthIn,
    startYIn: CUT_ART_START_IN,
    sideInsetIn: MARK_CLEARANCE_IN,
    minGutterIn: CUT_GUTTER_IN,
  }
  const uprightLayout = packSheetBestGutter(pieceInputs, {
    packWidthIn,
    startYIn: ART_INSET_IN,
    rotatePolicy: 'none' as const,
  })

  const vinylPacked = paginateVinyl
    ? packSheetIntoPages(pieceInputs, { ...packOpts, pageHeightIn: mediaHeightIn })
    : null
  const uvLayout = paginateVinyl
    ? null
    : packSheetBestGutter(pieceInputs, packOpts)

  const pageLayouts = paginateVinyl
    ? vinylPacked!.pages
    : uvLayout && uvLayout.pieces.length > 0
      ? [uvLayout]
      : []
  const tooLargePieces = vinylPacked?.tooLarge ?? []
  const pageCount = Math.max(1, pageLayouts.length)
  const safePageIndex = Math.min(activePageIndex, Math.max(0, pageLayouts.length - 1))
  const sheetLayout = pageLayouts[safePageIndex] ?? {
    pieces: [] as PlacedSheetPiece[],
    unplaced: [],
    contentBottom: CUT_ART_START_IN,
    contentEndY: CUT_ART_START_IN,
    gutterIn: CUT_GUTTER_IN,
    rotatedCount: 0,
  }

  /** Vinyl keeps the chosen media size; UV DTF roll can grow in length. */
  const printHeight = paginateVinyl
    ? mediaHeightIn
    : Math.max(mediaHeightIn, (uvLayout?.contentEndY ?? CUT_ART_START_IN) + CUT_ART_START_IN)
  const cutMarkRects = cutEnabled
    ? registrationMarkRects(printHeight, mediaWidthIn, sheetLayout.pieces)
    : []
  const cutMarks = cutEnabled
    ? registrationMarkBounds(printHeight, mediaWidthIn, sheetLayout.pieces)
    : []
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
  const rotatedCount = pageLayouts.reduce((sum, page) => sum + page.rotatedCount, 0)
  const filmSavedIn = Math.max(0, uprightLayout.contentBottom - (uvLayout?.contentBottom ?? uprightLayout.contentBottom))
  const rotateSaveMessage =
    !paginateVinyl && rotatedCount > 0 && filmSavedIn > 0.05
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
      .join('|') +
    `|product:${product}|cutOn:${cutEnabled}|cut:${effectiveCutMode}|border:${borderMm}|media:${mediaWidthIn}x${mediaHeightIn}`
  const sheetLabelText = mediaLabel(mediaWidthIn, billedLength)
  const fillPercent =
    mediaHeightIn > 0
      ? Math.min(100, Math.round((sheetLayout.contentBottom / mediaHeightIn) * 100))
      : 0
  const sheetFillMessage =
    designs.length === 0
      ? null
      : tooLargePieces.length > 0
        ? `${tooLargePieces.length} sticker${tooLargePieces.length === 1 ? '' : 's'} too large for ${sheetLabelText} media. Shrink the sticker or enlarge media.`
        : paginateVinyl
          ? pageCount > 1
            ? `${pageCount} pages at ${sheetLabelText} (media size stays fixed — overflow becomes the next page).`
            : `Page 1 of 1 · ${sheetLabelText}`
          : printHeight > mediaHeightIn + 1e-6
            ? `Art needs ${printHeight.toFixed(1)} in — UV DTF length grew to fit.`
            : `Media is ${fillPercent}% used (${printHeight.toFixed(1)} of ${mediaHeightIn} in)`
  const sheetName = customerName.trim() || 'Sticker Maker'
  const sheetPreviewUrl = pagePreviewUrls[safePageIndex] ?? null
  const currentGuideStep = !customerName.trim()
    ? 1
    : designs.length === 0
      ? 3
      : !previewing && !built
        ? 4
        : 5

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
    setActivePageIndex(0)
    setPagePreviewUrls((urls) => {
      revokePagePreviewUrls(urls)
      return []
    })
  }, [layoutKey, customerName])

  useEffect(() => {
    if (activePageIndex > pageLayouts.length - 1) {
      setActivePageIndex(Math.max(0, pageLayouts.length - 1))
    }
  }, [activePageIndex, pageLayouts.length])

  function sheetPxPerIn(maxEdge: number, preferred: number) {
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(printHeight, mediaWidthIn))))
  }

  async function refreshCutShapes(
    offsetIn = contourOffsetIn,
    pieces: PlacedSheetPiece[] = sheetLayout.pieces,
  ) {
    if (!cutEnabled || pieces.length === 0) {
      setCutShapes([])
      return []
    }
    const gen = ++contourRefreshGen.current
    setShapesBusy(true)
    try {
      const shapes = await buildCutShapes(
        pieces,
        effectiveCutMode,
        mediaWidthIn,
        printHeight,
        offsetIn,
      )
      if (gen !== contourRefreshGen.current) return shapes
      setCutShapes(shapes)
      return shapes
    } finally {
      if (gen === contourRefreshGen.current) setShapesBusy(false)
    }
  }

  function handleBorderMmChange(nextMm: number) {
    const clamped = clampBorderMm(nextMm, effectiveCutMode)
    setBorderMm(clamped)
    if (cutEnabled) void refreshCutShapes(clampContourOffsetIn(mmToInches(clamped)))
  }

  function handleContourOffsetChange(nextInches: number) {
    const nextMm = clampBorderMm(nextInches * 25.4, effectiveCutMode)
    handleBorderMmChange(nextMm)
  }

  async function urlToDataUrl(url: string) {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Could not read artwork for save.'))
      reader.readAsDataURL(blob)
    })
  }

  async function saveJobFile() {
    if (!customerName.trim()) {
      setSaveError('Enter a customer name before saving the job.')
      return
    }
    setJobStatus('Saving…')
    try {
      const images = []
      for (const design of designs) {
        const dataUrl = design.previewUrl ? await urlToDataUrl(design.previewUrl) : ''
        images.push({
          id: design.id,
          name: design.name,
          size: design.size,
          customWidth: design.customWidth,
          customHeight: design.customHeight,
          quantity: design.quantity,
          keepUpright: design.keepUpright,
          pixelWidth: design.pixelWidth,
          pixelHeight: design.pixelHeight,
          dataUrl,
        })
      }
      const payload = {
        format: 'ssp-gangsheet-project',
        schemaVersion: 1,
        name: customerName.trim(),
        updatedAt: new Date().toISOString(),
        product: {
          printType: product,
          widthIn: mediaWidthIn,
          heightIn: mediaHeightIn,
        },
        cut: {
          enabled: cutEnabled,
          shape: effectiveCutMode,
          offsetMm: borderMm,
        },
        images,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const safe = customerName.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40) || 'job'
      downloadBlob(blob, `${safe}.ssp.json`)
      setJobStatus(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ✓`)
      setSaveError(null)
    } catch (err) {
      setJobStatus(null)
      setSaveError(err instanceof Error ? err.message : 'Could not save the job file.')
    }
  }

  async function reopenJobFile(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as {
        format?: string
        name?: string
        product?: { printType?: string; widthIn?: number; heightIn?: number }
        cut?: { enabled?: boolean; shape?: CutMode; offsetMm?: number }
        images?: Array<{
          id?: number
          name: string
          size?: string
          customWidth?: string
          customHeight?: string
          quantity?: number
          keepUpright?: boolean
          pixelWidth?: number
          pixelHeight?: number
          dataUrl?: string
        }>
      }
      if (data.format !== 'ssp-gangsheet-project') {
        throw new Error('This file is not a Sticker Maker job (.ssp.json).')
      }
      if (data.name) setCustomerName(data.name)
      const nextProduct = data.product?.printType === 'vinyl' ? 'vinyl' : 'uv-dtf'
      selectProduct(nextProduct)
      if (nextProduct === 'vinyl') {
        if (data.product?.widthIn) setVinylWidthIn(clampVinylWidth(data.product.widthIn))
        if (data.product?.heightIn) setVinylLengthIn(clampVinylLength(data.product.heightIn))
      } else if (data.product?.heightIn) {
        setUvLengthIn(clampUvLength(data.product.heightIn))
      }
      setCutEnabled(Boolean(data.cut?.enabled))
      const shape = data.cut?.shape
      setCutMode(shape === 'circle' || shape === 'contour' || shape === 'box' ? shape : 'box')
      if (typeof data.cut?.offsetMm === 'number') {
        setBorderMm(clampBorderMm(data.cut.offsetMm, shape === 'circle' || shape === 'contour' ? shape : 'box'))
      }
      const nextDesigns: Design[] = (data.images || []).map((image, index) => {
        const url = image.dataUrl || ''
        return {
          id: image.id ?? Date.now() + index,
          designNumber: index + 1,
          name: image.name || `Sticker ${index + 1}`,
          placement: 'Custom' as const,
          size: image.size || stickerSizeLabel(image.customWidth || DEFAULT_STICKER_W, image.customHeight || DEFAULT_STICKER_H),
          customWidth: image.customWidth || DEFAULT_STICKER_W,
          customHeight: image.customHeight || DEFAULT_STICKER_H,
          quantity: Math.max(1, image.quantity || 1),
          notes: '',
          color: index % 2 ? 'red' : 'blue',
          originalUrl: url,
          previewUrl: url,
          enhanced: false,
          pixelWidth: image.pixelWidth || 0,
          pixelHeight: image.pixelHeight || 0,
          keepUpright: Boolean(image.keepUpright),
        }
      })
      setDesigns((current) => {
        for (const design of current) {
          revokeUnusedUrls([design.originalUrl, design.previewUrl], nextDesigns)
        }
        return nextDesigns
      })
      setJobStatus(`Reopened “${data.name || file.name}” ✓`)
      setSaveError(null)
      setBuilt(false)
      setPreviewing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not reopen that job file.')
    }
  }

  async function composePageSheet(
    pieces: PlacedSheetPiece[],
    pxPerIn: number,
    label: string,
    mapCmyk = false,
  ) {
    if (pieces.length === 0) throw new Error('Add a design before previewing the sheet.')
    const marks = cutEnabled ? registrationMarkRects(printHeight, mediaWidthIn, pieces) : []
    const markBounds = cutEnabled ? registrationMarkBounds(printHeight, mediaWidthIn, pieces) : []
    const first = markBounds.find((mark) => mark.first)
    return composeGangSheet({
      pieces,
      sheetLengthIn: printHeight,
      sheetWidthIn: mediaWidthIn,
      pxPerIn,
      label,
      mapCmyk,
      marks,
      startArrow: first ? startMarkArrowPoints(first) : [],
    })
  }

  async function previewStickerSheet() {
    if (!customerName.trim() || designs.length === 0 || previewBusy || saving) return
    if (tooLargePieces.length > 0) {
      setSaveError(
        `${tooLargePieces.length} sticker${tooLargePieces.length === 1 ? '' : 's'} do not fit the ${sheetLabelText} media. Reduce sticker size or increase media size.`,
      )
      return
    }
    if (pageLayouts.length === 0) {
      setSaveError('Add a design before previewing the sheet.')
      return
    }
    if (pagePreviewUrls.length > 0 && previewing) {
      setSheetPreviewOpen(true)
      return
    }
    const stamp = sheetStamp()
    setJobStamp(stamp)
    const gen = ++previewGen.current
    setPreviewBusy(true)
    setSaveError(null)
    setBuilt(false)
    try {
      const urls: string[] = []
      for (let i = 0; i < pageLayouts.length; i += 1) {
        const pageNumber = i + 1
        const label =
          sheetJobName(customerName.trim(), billedLength, stamp) +
          pageFileSuffix(pageNumber, pageLayouts.length)
        const blob = await composePageSheet(
          pageLayouts[i].pieces,
          sheetPxPerIn(3600, 72),
          label,
        )
        if (gen !== previewGen.current) {
          revokePagePreviewUrls(urls)
          return
        }
        urls.push(URL.createObjectURL(blob))
      }
      if (gen !== previewGen.current) {
        revokePagePreviewUrls(urls)
        return
      }
      setPagePreviewUrls((prev) => {
        revokePagePreviewUrls(prev)
        return urls
      })
      setActivePageIndex(0)
      await refreshCutShapes(contourOffsetIn, pageLayouts[0].pieces)
      if (gen !== previewGen.current) return
      setPreviewing(true)
      setSheetPreviewOpen(true)
    } catch (err) {
      if (gen !== previewGen.current) return
      setSaveError(err instanceof Error ? err.message : 'Could not preview the sticker sheet.')
    } finally {
      if (gen === previewGen.current) setPreviewBusy(false)
    }
  }

  async function selectPreviewPage(index: number) {
    setActivePageIndex(index)
    const page = pageLayouts[index]
    if (page) await refreshCutShapes(contourOffsetIn, page.pieces)
  }

  async function buildAndStore() {
    if (!customerName.trim() || designs.length === 0 || saving || !previewing) return
    if (tooLargePieces.length > 0 || pageLayouts.length === 0) return
    setSaving(true)
    setSaveError(null)
    setDriveFolderUrl(null)
    try {
      const stamp = jobStamp || sheetStamp()
      const pngFiles: Array<{ name: string; mimeType: string; blob: Blob }> = []
      const pltFiles: Array<{ name: string; content: string }> = []

      for (let i = 0; i < pageLayouts.length; i += 1) {
        const pageNumber = i + 1
        const suffix = pageFileSuffix(pageNumber, pageLayouts.length)
        const label = sheetJobName(customerName.trim(), billedLength, stamp) + suffix
        const fileName = sheetFileName(customerName.trim(), billedLength, stamp).replace(
          /\.png$/i,
          `${suffix}.png`,
        )
        const pieces = pageLayouts[i].pieces
        const png = await composePageSheet(pieces, sheetPxPerIn(14000, 150), label, true)
        downloadBlob(png, fileName)
        pngFiles.push({ name: fileName, mimeType: 'image/png', blob: png })
        if (cutEnabled) {
          const shapes = await buildCutShapes(
            pieces,
            effectiveCutMode,
            mediaWidthIn,
            printHeight,
            contourOffsetIn,
          )
          const plt = cutPltForShapes(shapes, printHeight, mediaWidthIn, pieces)
          if (!plt) throw new Error(`Could not build the cutter PLT for page ${pageNumber}.`)
          const cutName = sheetCutFileName(customerName.trim(), billedLength, stamp).replace(
            / cut\.plt$/i,
            `${suffix} cut.plt`,
          )
          await wait(200)
          downloadBlob(new Blob([plt], { type: 'text/plain' }), cutName)
          pltFiles.push({ name: cutName, content: plt })
        }
      }

      const [firstPlt, ...otherPlts] = pltFiles
      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files: [
          ...pngFiles,
          ...otherPlts.map((file) => ({
            name: file.name,
            mimeType: 'text/plain',
            blob: new Blob([file.content], { type: 'text/plain' }),
          })),
        ],
        cutterFile: firstPlt
          ? {
              name: firstPlt.name,
              content: firstPlt.content,
              mimeType: 'text/plain',
            }
          : undefined,
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
          <p className="lead">UV DTF (22 × 12 in min) or vinyl (8 × 11 in min) — crop, size, cut, and export.</p>
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

          <div id="step-2" className="guide-block sticker-cut-options">
            <GuideHeading
              number={2}
              title="Cut options"
              hint={
                product === 'uv-dtf'
                  ? 'UV DTF: No Cut or Box Cut only. Choose before you upload.'
                  : 'Vinyl: No Cut, or Add Contour Cut (Circle / Box / Contour per sheet).'
              }
            />
            <div className="sticker-cut-option-row" role="radiogroup" aria-label="Cut options">
              {product === 'uv-dtf' ? (
                <>
                  <label className={`sticker-cut-choice ${!cutEnabled ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="uv-cut"
                      checked={!cutEnabled}
                      onChange={() => setCuttingOn(false)}
                    />
                    <strong>No Cut</strong>
                    <span>Print only — no knife path</span>
                  </label>
                  <label className={`sticker-cut-choice ${cutEnabled ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="uv-cut"
                      checked={cutEnabled}
                      onChange={() => setCuttingOn(true)}
                    />
                    <strong>Box Cut</strong>
                    <span>Rectangle around every sticker</span>
                  </label>
                </>
              ) : (
                <>
                  <label className={`sticker-cut-choice ${!cutEnabled ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="vinyl-cut"
                      checked={!cutEnabled}
                      onChange={() => setCuttingOn(false)}
                    />
                    <strong>No Cut</strong>
                    <span>Print only — no knife path</span>
                  </label>
                  <label className={`sticker-cut-choice ${cutEnabled ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="vinyl-cut"
                      checked={cutEnabled}
                      onChange={() => setCuttingOn(true)}
                    />
                    <strong>Add Contour Cut</strong>
                    <span>Circle, Box, or Cut around object</span>
                  </label>
                </>
              )}
            </div>

            {cutEnabled && (
              <div className="sticker-border-control">
                <span className="precut-button-title">
                  <Scissors size={16} /> Border (cut distance from art)
                </span>
                {product === 'vinyl' && (
                  <div className="sticker-shape-picks" role="group" aria-label="Cut shape">
                    {CUT_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        className={effectiveCutMode === mode.value ? 'selected' : undefined}
                        onClick={() => setCutMode(mode.value)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="sticker-border-stepper">
                  <button
                    type="button"
                    aria-label="Decrease border"
                    disabled={borderMm <= (effectiveCutMode === 'box' ? MIN_BORDER_MM_BOX : MIN_BORDER_MM_SHAPE)}
                    onClick={() => handleBorderMmChange(borderMm - BORDER_STEP_MM)}
                  >
                    <Minus size={14} />
                  </button>
                  <strong>
                    {borderMm.toFixed(1)} mm{' '}
                    <em>({mmToInches(borderMm).toFixed(3)} in)</em>
                  </strong>
                  <button
                    type="button"
                    aria-label="Increase border"
                    disabled={borderMm >= MAX_BORDER_MM}
                    onClick={() => handleBorderMmChange(borderMm + BORDER_STEP_MM)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <small>
                  {product === 'uv-dtf'
                    ? 'UV DTF is locked to Box Cut. Default border is 2 mm.'
                    : 'Default is Box at 2 mm when Contour Cut is on.'}
                </small>
              </div>
            )}
          </div>

          <div className="sticker-job-bar">
            <button type="button" className="sticker-job-btn" onClick={() => void saveJobFile()}>
              <Save size={16} /> Save Job
            </button>
            <button
              type="button"
              className="sticker-job-btn"
              onClick={() => reopenInputRef.current?.click()}
            >
              <FolderOpen size={16} /> Reopen Job
            </button>
            <input
              ref={reopenInputRef}
              className="sr-only"
              type="file"
              accept=".json,.ssp.json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void reopenJobFile(file)
                e.target.value = ''
              }}
            />
            {jobStatus && <span className="sticker-job-status">{jobStatus}</span>}
          </div>

          <div id="step-3" className="guide-block">
            <GuideHeading
              number={3}
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

          <div id="step-4" className="guide-block design-heading">
            <GuideHeading
              number={4}
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
              sheetLabel={
                pageLayouts.length > 1
                  ? `${sheetLabelText} · Page ${safePageIndex + 1} of ${pageLayouts.length}`
                  : sheetLabelText
              }
              sheetLengthIn={billedLength}
              totalTransfers={sheetLayout.pieces.length}
              saving={saving}
              onClose={() => setSheetPreviewOpen(false)}
              onConfirm={() => void buildAndStore()}
              cutBoxes={cutShapes.map((shape) => shape.bounds)}
              cutShapes={cutShapes}
              cutMarks={cutMarks}
              printHeightIn={printHeight}
              sheetWidthIn={mediaWidthIn}
              cutOut={cutEnabled}
              audience="shop"
              layoutPieces={layoutPieces}
              contourOffsetEnabled={cutEnabled && effectiveCutMode === 'contour'}
              contourOffsetIn={contourOffsetIn}
              contourOffsetBusy={shapesBusy}
              onContourOffsetChange={handleContourOffsetChange}
              confirmLabel={
                pageLayouts.length > 1
                  ? `Confirm & Build ${pageLayouts.length} Pages`
                  : 'Confirm & Build Stickers'
              }
            />
          )}
        </section>

        <aside className="order-panel panel">
          <div id="step-5" className="order-title">
            <span className="guide-num">5</span>
            <div>
              <h2>
                {product === 'uv-dtf' ? 'Length & build' : 'Media size & build'}
              </h2>
              <p className="order-hint">
                {product === 'uv-dtf'
                  ? 'UV DTF is 22 in wide (never wider). Length starts at 12 in. Cut options are set in step 2.'
                  : 'Vinyl defaults to 8 × 11 in. Media stays fixed; overflow becomes page 2, 3… Cut options are in step 2.'}
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
                  min={product === 'uv-dtf' ? UV_DTF_MEDIA_WIDTH_IN : MIN_VINYL_WIDTH_IN}
                  max={product === 'uv-dtf' ? UV_DTF_MEDIA_WIDTH_IN : MAX_VINYL_MEDIA_WIDTH_IN}
                  step="0.25"
                  value={mediaWidthIn}
                  disabled={product === 'uv-dtf'}
                  readOnly={product === 'uv-dtf'}
                  aria-label={product === 'uv-dtf' ? 'UV DTF width locked at 22 inches' : 'Vinyl media width'}
                  onChange={(e) => {
                    if (product !== 'vinyl') return
                    setVinylWidthIn(clampVinylWidth(Number(e.target.value) || MIN_VINYL_WIDTH_IN))
                  }}
                />
              </label>
              <label>
                Length (in)
                <input
                  type="number"
                  min={product === 'uv-dtf' ? MIN_UV_LENGTH_IN : MIN_VINYL_LENGTH_IN}
                  max={MAX_MEDIA_HEIGHT_IN}
                  step="0.25"
                  value={mediaHeightIn}
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 0
                    if (product === 'vinyl') setVinylLengthIn(clampVinylLength(raw || MIN_VINYL_LENGTH_IN))
                    else setUvLengthIn(clampUvLength(raw || MIN_UV_LENGTH_IN))
                  }}
                />
              </label>
            </div>
            <small>
              {product === 'uv-dtf'
                ? `Width is locked at ${UV_DTF_MEDIA_WIDTH_IN} in (never exceeds). Minimum length ${MIN_UV_LENGTH_IN} in. Length grows on the roll if stickers need more film.`
                : `Default / min ${MIN_VINYL_WIDTH_IN} × ${MIN_VINYL_LENGTH_IN} in. Media size never grows — extra stickers become page 2, 3, 4…`}
            </small>
          </div>

          <div className="sticker-cut-summary">
            <span className="precut-button-title">
              <Scissors size={18} /> Cut
            </span>
            <strong>{cutLabel}</strong>
            {cutEnabled && (
              <small>
                Border {borderMm.toFixed(1)} mm
                {product === 'vinyl' ? ` · ${effectiveCutMode}` : ''}
              </small>
            )}
            <small>
              Change cut options in step 2 under Customer name.
            </small>
          </div>

          {cutEnabled && cutTooTall && (
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
              label="Pages"
              value={pageLayouts.length || (designs.length ? 0 : 1)}
              icon={<FileImage size={22} />}
              green
            />
            <Metric label="Cut" value={cutLabel} icon={<Scissors size={22} />} green />
            <div className="price-breakdown">
              <strong>{sheetName}</strong>
              <span>
                {productLabel} · {sheetLabelText}
                {pageLayouts.length > 1 ? ` · ${pageLayouts.length} pages` : ''} · {cutLabel}
                {cutEnabled ? ` · ${borderMm.toFixed(1)} mm` : ''}
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
              {!paginateVinyl && (
                <span className="sheet-fill-bar" aria-hidden="true">
                  <span style={{ width: `${fillPercent}%` }} />
                </span>
              )}
            </p>
          )}
          {pageLayouts.length > 1 && (
            <div className="sticker-page-tabs" role="tablist" aria-label="Sticker pages">
              {pageLayouts.map((_, index) => (
                <button
                  key={`page-${index + 1}`}
                  type="button"
                  role="tab"
                  aria-selected={safePageIndex === index}
                  className={`sticker-page-tab ${safePageIndex === index ? 'selected' : ''}`}
                  onClick={() => void selectPreviewPage(index)}
                >
                  Page {index + 1}
                </button>
              ))}
            </div>
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
                  <img
                    className="sheet-final-preview"
                    src={sheetPreviewUrl}
                    alt={
                      pageLayouts.length > 1
                        ? `Sticker sheet page ${safePageIndex + 1} preview`
                        : 'Sticker sheet preview'
                    }
                  />
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
              disabled={
                previewBusy ||
                saving ||
                designs.length === 0 ||
                !customerName.trim() ||
                tooLargePieces.length > 0
              }
              onClick={() => void previewStickerSheet()}
            >
              <Eye size={18} />{' '}
              {previewBusy
                ? 'Building preview…'
                : pageLayouts.length > 1
                  ? `Preview ${pageLayouts.length} Pages`
                  : 'Preview Sticker Sheet'}
            </button>
            {previewing && pagePreviewUrls.length > 0 && (
              <button className="confirm-button" disabled={saving || shapesBusy} onClick={() => void buildAndStore()}>
                <Check size={18} />{' '}
                {saving
                  ? 'Saving to Drive…'
                  : pageLayouts.length > 1
                    ? `Confirm & Build ${pageLayouts.length} Pages`
                    : 'Confirm & Build Stickers'}
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
                {sheetLabelText}
                {pageLayouts.length > 1 ? ` · ${pageLayouts.length} pages` : ''} · {totalTransfers} pieces ·{' '}
                {cutLabel} · Ready
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
          <p className="builder-version">
            South Side DTF Sticker Maker · v{BUILDER_VERSION}
          </p>
        </aside>
      </div>
      <footer className="builder-version-footer">
        South Side DTF Gang Sheet Builder · v{BUILDER_VERSION} · Sticker Maker
      </footer>
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
