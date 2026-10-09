'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Download, Eye, FileImage, FolderOpen, HardDrive, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Save, Scissors, Sticker, Trash2, Upload,
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
  buildCutShapes,
  cutPltForShapes,
  shapeTooTallForCutter,
  type CutShape,
} from '@/lib/custom-cut'
import { trimEmptySpace } from '@/lib/crop-image'
import { parsePrintWidthInches, printDpi, qualityFromDpi, readImageSize } from '@/lib/image-utils'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { uploadJobToGoogleDrive, writeDriveJobRecord } from '@/lib/upload-to-drive'
import { DESIGN_ACCEPT, DESIGN_ACCEPT_LABEL, isAcceptedDesignFile } from '@/lib/accepted-uploads'
import { prepareEditableUpload } from '@/lib/rasterize-upload'

/** Spec A7: minimum gap between cut lines when nesting cut footprints. */
const CUT_MIN_GAP_IN = 0.125
/** UV DTF Cut is always a fixed Square Cut at 2.5 mm. */
const UV_BORDER_MM = 2.5

function mmToInches(mm: number) {
  return mm / 25.4
}

type PackDesignPiece = {
  previewUrl: string
  widthIn: number
  heightIn: number
  allowRotate: boolean
  designId: number
  /** Art size before cut padding (and before packer rotation). */
  artWidthIn: number
  artHeightIn: number
}

type PackedCutPiece = PlacedSheetPiece & {
  designId?: number
  artWidthIn?: number
  artHeightIn?: number
}

/** Centre art inside the packed cut footprint for compose / cut tracing. */
function toArtPieces(pieces: PackedCutPiece[]): PackedCutPiece[] {
  return pieces.map((piece) => {
    const artW = piece.rotated
      ? (piece.artHeightIn ?? piece.heightIn)
      : (piece.artWidthIn ?? piece.widthIn)
    const artH = piece.rotated
      ? (piece.artWidthIn ?? piece.widthIn)
      : (piece.artHeightIn ?? piece.heightIn)
    return {
      ...piece,
      xIn: piece.xIn + (piece.widthIn - artW) / 2,
      yIn: piece.yIn + (piece.heightIn - artH) / 2,
      widthIn: artW,
      heightIn: artH,
    }
  })
}

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

const DEFAULT_STICKER_W = '3'
const DEFAULT_STICKER_H = '3'
/** UV DTF sticker media is always exactly 22 in wide — never exceed. */
const UV_DTF_MEDIA_WIDTH_IN = 22
const MIN_UV_LENGTH_IN = 12
const MAX_MEDIA_HEIGHT_IN = 200
const MAX_STICKER_H = 199
const DEFAULT_UV_LENGTH_IN = MIN_UV_LENGTH_IN

function clampUvLength(value: number) {
  return Math.min(MAX_MEDIA_HEIGHT_IN, Math.max(MIN_UV_LENGTH_IN, value))
}

function mediaLabel(widthIn: number, heightIn: number) {
  return `${widthIn.toFixed(2).replace(/\.00$/, '')} × ${heightIn.toFixed(2).replace(/\.00$/, '')} in`
}

function stickerSizeLabel(width: string, height: string) {
  return `${width || '0'} × ${height || '0'} in`
}

const HOW_TO_STEPS = [
  { id: 'step-1', number: 1, title: 'Customer name', detail: 'Type the customer name first.' },
  {
    id: 'step-2',
    number: 2,
    title: 'Cut / No Cut',
    detail: 'Cut = fixed 2.5 mm Square Cut. Or No Cut.',
  },
  { id: 'step-3', number: 3, title: 'Upload artwork', detail: 'Drop or click to add sticker art.' },
  { id: 'step-4', number: 4, title: 'Sticker size & edit', detail: 'Set each sticker W×H, crop, and quantity.' },
  {
    id: 'step-5',
    number: 5,
    title: 'Length & build',
    detail: 'Width stays 22 in. Length min 12 in. Then preview and build.',
  },
]

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
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false)
  const [jobStamp, setJobStamp] = useState('')
  /** Spec: No Cut by default. */
  const [cutEnabled, setCutEnabled] = useState(false)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [uvLengthIn, setUvLengthIn] = useState(DEFAULT_UV_LENGTH_IN)
  const [pagePreviewUrls, setPagePreviewUrls] = useState<string[]>([])
  const [cutShapes, setCutShapes] = useState<CutShape[]>([])
  const [shapesBusy, setShapesBusy] = useState(false)
  const previewGen = useRef(0)
  const shapesRefreshGen = useRef(0)

  const mediaWidthIn = UV_DTF_MEDIA_WIDTH_IN
  const mediaHeightIn = uvLengthIn
  const maxStickerWidthIn = mediaWidthIn
  const cutLabel = !cutEnabled ? 'No Cut' : 'Square Cut · 2.5 mm'
  const borderIn = cutEnabled ? mmToInches(UV_BORDER_MM) : 0

  function setCuttingOn(enabled: boolean) {
    setCutEnabled(enabled)
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

  const pieceInputs: PackDesignPiece[] = previewPieces.map((design) => {
    const artWidthIn = getDesignWidth(design)
    const artHeightIn = getDesignHeight(design)
    return {
      previewUrl: design.previewUrl,
      widthIn: artWidthIn + borderIn * 2,
      heightIn: artHeightIn + borderIn * 2,
      allowRotate: !design.keepUpright,
      designId: design.id,
      artWidthIn,
      artHeightIn,
    }
  })
  const packWidthIn = Math.max(1, mediaWidthIn - MARK_CLEARANCE_IN * 2)
  const packOpts = {
    packWidthIn,
    startYIn: CUT_ART_START_IN,
    sideInsetIn: MARK_CLEARANCE_IN,
    /** With cut on, pieces are already cut footprints — only need gap between cut lines. */
    minGutterIn: cutEnabled ? CUT_MIN_GAP_IN : CUT_GUTTER_IN,
  }
  const uprightLayout = packSheetBestGutter(pieceInputs, {
    packWidthIn,
    startYIn: ART_INSET_IN,
    rotatePolicy: 'none' as const,
  })

  const uvLayout = packSheetBestGutter(pieceInputs, packOpts)
  const pageLayouts =
    uvLayout && uvLayout.pieces.length > 0 ? [uvLayout] : []
  const sheetLayout = pageLayouts[0] ?? {
    pieces: [] as PlacedSheetPiece[],
    unplaced: [],
    contentBottom: CUT_ART_START_IN,
    contentEndY: CUT_ART_START_IN,
    gutterIn: CUT_GUTTER_IN,
    rotatedCount: 0,
  }

  /** UV DTF roll can grow in length. */
  const printHeight = Math.max(mediaHeightIn, (uvLayout?.contentEndY ?? CUT_ART_START_IN) + CUT_ART_START_IN)
  const artLayoutPieces = toArtPieces(sheetLayout.pieces as PackedCutPiece[])
  const cutMarks = cutEnabled
    ? registrationMarkBounds(printHeight, mediaWidthIn, artLayoutPieces)
    : []
  const billedLength = Math.ceil(printHeight - 1e-9)
  const cutTooTall = shapeTooTallForCutter(cutShapes)
  const layoutPieces: LayoutPiece[] = artLayoutPieces.map((piece) => ({
    xIn: piece.xIn,
    yIn: piece.yIn,
    widthIn: piece.widthIn,
    heightIn: piece.heightIn,
  }))
  const rotatedCount = sheetLayout.rotatedCount
  const filmSavedIn = Math.max(0, uprightLayout.contentBottom - (uvLayout?.contentBottom ?? uprightLayout.contentBottom))
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
      .join('|') + `|cutOn:${cutEnabled}|media:${mediaWidthIn}x${mediaHeightIn}`
  const sheetLabelText = mediaLabel(mediaWidthIn, billedLength)
  const fillPercent =
    mediaHeightIn > 0
      ? Math.min(100, Math.round((sheetLayout.contentBottom / mediaHeightIn) * 100))
      : 0
  const sheetFillMessage =
    designs.length === 0
      ? null
      : printHeight > mediaHeightIn + 1e-6
        ? `Art needs ${printHeight.toFixed(1)} in — UV DTF length grew to fit.`
        : `Media is ${fillPercent}% used (${printHeight.toFixed(1)} of ${mediaHeightIn} in)`
  const sheetName = customerName.trim() || 'Sticker Maker'
  const sheetPreviewUrl = pagePreviewUrls[0] ?? null
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
    setPagePreviewUrls((urls) => {
      revokePagePreviewUrls(urls)
      return []
    })
  }, [layoutKey, customerName])

  function sheetPxPerIn(maxEdge: number, preferred: number) {
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(printHeight, mediaWidthIn))))
  }

  async function refreshCutShapes(
    pieces: PlacedSheetPiece[] = sheetLayout.pieces,
  ) {
    if (!cutEnabled || pieces.length === 0) {
      setCutShapes([])
      return []
    }
    const gen = ++shapesRefreshGen.current
    setShapesBusy(true)
    try {
      const artPieces = toArtPieces(pieces as PackedCutPiece[])
      const shapes = await buildCutShapes(
        artPieces,
        'box',
        mediaWidthIn,
        printHeight,
        mmToInches(UV_BORDER_MM),
      )
      if (gen !== shapesRefreshGen.current) return shapes
      setCutShapes(shapes)
      return shapes
    } finally {
      if (gen === shapesRefreshGen.current) setShapesBusy(false)
    }
  }

  /** Red cut traces appear as soon as cut is on / art is laid out. */
  useEffect(() => {
    if (!cutEnabled || sheetLayout.pieces.length === 0) {
      setCutShapes([])
      return
    }
    void refreshCutShapes(sheetLayout.pieces)
    // layoutKey covers cut settings, media, and designs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshCutShapes closes over current layout
  }, [layoutKey, cutEnabled])

  async function exportArtForPhotoshop() {
    if (designs.length === 0) {
      setJobStatus(null)
      setSaveError('Upload sticker art before exporting to Photoshop.')
      return
    }
    setSaveError(null)
    setJobStatus('Downloading art (no cut lines)…')
    try {
      for (const design of designs) {
        const url = design.originalUrl || design.previewUrl
        if (!url) continue
        const res = await fetch(url)
        const blob = await res.blob()
        const base = design.name.replace(/\.[^.]+$/, '') || `sticker-${design.designNumber}`
        downloadBlob(blob, `${base}.png`)
        await wait(150)
      }
      setJobStatus('Art exported for Photoshop ✓')
    } catch (err) {
      setJobStatus(null)
      setSaveError(err instanceof Error ? err.message : 'Could not export art for Photoshop.')
    }
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

  async function buildProjectPayload(options?: {
    /** When writing to Drive after upload, attach Drive file ids instead of embedding data URLs. */
    driveFiles?: Array<{ name: string; id: string }>
    includeDataUrls?: boolean
  }) {
    const includeDataUrls = options?.includeDataUrls !== false && !options?.driveFiles
    const images = []
    for (const design of designs) {
      const dataUrl =
        includeDataUrls && design.previewUrl ? await urlToDataUrl(design.previewUrl) : ''
      const driveMatch = options?.driveFiles?.find((file) =>
        file.name.toLowerCase().includes(design.name.replace(/\.[^.]+$/, '').toLowerCase().slice(0, 20)),
      )
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
        ...(dataUrl ? { dataUrl } : {}),
        ...(driveMatch ? { driveFileId: driveMatch.id } : {}),
        cut: { shape: 'box' as const, offsetMm: UV_BORDER_MM },
      })
    }
    const now = new Date().toISOString()
    return {
      format: 'ssp-gangsheet-project' as const,
      schemaVersion: 2,
      name: customerName.trim() || `Untitled job ${now.slice(0, 10)}`,
      createdAt: now,
      updatedAt: now,
      lastUploadAt: options?.driveFiles ? now : undefined,
      product: {
        printType: 'uv-dtf' as const,
        widthIn: mediaWidthIn,
        heightIn: mediaHeightIn,
      },
      cut: {
        enabled: cutEnabled,
      },
      images,
      codeVersion: { builder: BUILDER_VERSION },
    }
  }

  /** SPEC B2: write project.ssp.json into the Drive job folder (retry up to 3 times). */
  async function writeProjectJsonToDrive(folderId: string, content: string) {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await writeDriveJobRecord({
          folderId,
          name: 'project.ssp.json',
          content,
        })
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Could not write project.ssp.json')
        await wait(400 * 2 ** attempt)
      }
    }
    throw lastError || new Error('Could not write project.ssp.json to Google Drive.')
  }

  async function saveJobFile() {
    if (!customerName.trim()) {
      setSaveError('Enter a customer name before saving the job.')
      return
    }
    setJobStatus('Saving…')
    try {
      const payload = await buildProjectPayload({ includeDataUrls: true })
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const safe = customerName.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40) || 'job'
      downloadBlob(blob, `${safe}.ssp.json`)
      if (driveFolderId) {
        try {
          await writeProjectJsonToDrive(driveFolderId, json)
        } catch {
          setJobStatus('Not saved — retrying')
          throw new Error('Downloaded the job file, but could not update project.ssp.json in Drive.')
        }
      }
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
        cut?: { enabled?: boolean; shape?: string; offsetMm?: number }
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
          cut?: { shape?: string; offsetMm?: number }
        }>
      }
      if (data.format !== 'ssp-gangsheet-project') {
        throw new Error('This file is not a Sticker Maker job (.ssp.json).')
      }
      const printType = data.product?.printType
      if (printType === 'vinyl' || printType === 'vinyl-sticker') {
        throw new Error(
          'Vinyl stickers are handled in the Vinyl Sticker Maker. This DTF Sticker Maker opens UV DTF jobs only.',
        )
      }
      if (data.name) setCustomerName(data.name)
      if (data.product?.heightIn) {
        setUvLengthIn(clampUvLength(data.product.heightIn))
      }
      setCutEnabled(Boolean(data.cut?.enabled))
      /** Ignore legacy per-image shape / offsetMm — always Square Cut 2.5 mm when Cut is on. */
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
    const artPieces = toArtPieces(pieces as PackedCutPiece[])
    const marks = cutEnabled ? registrationMarkRects(printHeight, mediaWidthIn, artPieces) : []
    const markBounds = cutEnabled ? registrationMarkBounds(printHeight, mediaWidthIn, artPieces) : []
    const first = markBounds.find((mark) => mark.first)
    return composeGangSheet({
      pieces: artPieces,
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
      const label = sheetJobName(customerName.trim(), billedLength, stamp)
      const blob = await composePageSheet(
        pageLayouts[0].pieces,
        sheetPxPerIn(3600, 72),
        label,
      )
      if (gen !== previewGen.current) return
      const url = URL.createObjectURL(blob)
      setPagePreviewUrls((prev) => {
        revokePagePreviewUrls(prev)
        return [url]
      })
      await refreshCutShapes(pageLayouts[0].pieces)
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

  async function buildAndStore() {
    if (!customerName.trim() || designs.length === 0 || saving || !previewing) return
    if (pageLayouts.length === 0) return
    setSaving(true)
    setSaveError(null)
    setDriveFolderUrl(null)
    setDriveFolderId(null)
    try {
      const stamp = jobStamp || sheetStamp()
      const label = sheetJobName(customerName.trim(), billedLength, stamp)
      const fileName = sheetFileName(customerName.trim(), billedLength, stamp)
      const pieces = pageLayouts[0].pieces
      const png = await composePageSheet(pieces, sheetPxPerIn(14000, 150), label, true)
      downloadBlob(png, fileName)
      const pngFiles = [{ name: fileName, mimeType: 'image/png', blob: png }]
      const pltFiles: Array<{ name: string; content: string }> = []

      if (cutEnabled) {
        const artPieces = toArtPieces(pieces as PackedCutPiece[])
        const shapes = await buildCutShapes(
          artPieces,
          'box',
          mediaWidthIn,
          printHeight,
          mmToInches(UV_BORDER_MM),
        )
        const plt = cutPltForShapes(shapes, printHeight, mediaWidthIn, artPieces)
        if (!plt) throw new Error('Could not build the cutter PLT.')
        const cutName = sheetCutFileName(customerName.trim(), billedLength, stamp)
        await wait(200)
        downloadBlob(new Blob([plt], { type: 'text/plain' }), cutName)
        pltFiles.push({ name: cutName, content: plt })
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
      setDriveFolderId(drive.folderId)
      /** SPEC B2: create/update project.ssp.json in the same folder as soon as files land. */
      try {
        const payload = await buildProjectPayload({
          driveFiles: drive.files.map((file) => ({ name: file.name, id: file.id })),
          includeDataUrls: false,
        })
        await writeProjectJsonToDrive(drive.folderId, JSON.stringify(payload, null, 2))
        setJobStatus(
          `Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ✓`,
        )
      } catch {
        setJobStatus('Not saved — retrying')
        setSaveError('Files are in Drive, but project.ssp.json could not be written. Use Save Job to retry.')
      }
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
      <div className="sticker-utility-bar" aria-label="Job actions">
        <button
          type="button"
          className="sticker-job-btn"
          onClick={() => reopenInputRef.current?.click()}
        >
          <FolderOpen size={16} /> Reopen Job
        </button>
        <button
          type="button"
          className="sticker-job-btn"
          onClick={() => void exportArtForPhotoshop()}
          disabled={designs.length === 0}
        >
          <Download size={16} /> Save to Photoshop
        </button>
        <a className="sticker-job-btn" href="/shop/connect-drive">
          <HardDrive size={16} /> Connect to Google Drive
        </a>
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
      </div>

      <div className="builder-topbar">
        <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
        <div className="title-block">
          <h1>DTF Sticker Maker</h1>
          <p className="lead">UV DTF stickers — 22 in wide, length from 12 in. Crop, size, cut, and export.</p>
          <p className="sublead">Crop and clean art, then export print PNG + cutter PLT (fixed 2.5 mm Square Cut).</p>
        </div>
        <ShopNav current="sticker-maker" hideConnectDrive />
      </div>

      <ol className="how-to" aria-label="How to make stickers">
        {HOW_TO_STEPS.map((step) => (
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
              title="Cut"
              hint="Cut = fixed 2.5 mm Square Cut on every image. Or No Cut."
            />
            <div className="sticker-cut-option-row" role="radiogroup" aria-label="Cut or No Cut">
              <label className={`sticker-cut-choice ${cutEnabled ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="job-cut"
                  checked={cutEnabled}
                  onChange={() => setCuttingOn(true)}
                />
                <strong>Cut</strong>
                <span>Square Cut · 2.5 mm on every image</span>
              </label>
              <label className={`sticker-cut-choice ${!cutEnabled ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="job-cut"
                  checked={!cutEnabled}
                  onChange={() => setCuttingOn(false)}
                />
                <strong>No Cut</strong>
                <span>Print only — no knife path</span>
              </label>
            </div>
            {cutEnabled && (
              <p className="sticker-cut-fixed-note">
                <Scissors size={14} /> UV DTF uses a standard 2.5 mm Square Cut.
              </p>
            )}
          </div>

          <div className="sticker-job-bar">
            <button type="button" className="sticker-job-btn" onClick={() => void saveJobFile()}>
              <Save size={16} /> Save Job
            </button>
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
              const artW = getDesignWidth(design)
              const artH = getDesignHeight(design)
              const finishedW = artW + borderIn * 2
              const finishedH = artH + borderIn * 2
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
                    {cutEnabled && (
                      <div className="sticker-image-cut">
                        <span className="sticker-image-cut-label">Cut</span>
                        <span className="sticker-image-cut-fixed">
                          <span aria-hidden="true">▢</span> Square Cut · 2.5 mm
                        </span>
                        <small>
                          Finished size: {finishedW.toFixed(2)}" × {finishedH.toFixed(2)}"
                        </small>
                      </div>
                    )}
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
              confirmLabel="Confirm & Build Stickers"
            />
          )}
        </section>

        <aside className="order-panel panel">
          <div id="step-5" className="order-title">
            <span className="guide-num">5</span>
            <div>
              <h2>Length & build</h2>
              <p className="order-hint">
                UV DTF is 22 in wide (never wider). Length starts at 12 in. Cut / No Cut is set in step 2.
              </p>
            </div>
          </div>

          <div className="sticker-media-size">
            <span className="precut-button-title">
              <Maximize2 size={18} /> UV DTF media
            </span>
            <div className="sticker-size-fields">
              <label>
                Width (in)
                <input
                  type="number"
                  min={UV_DTF_MEDIA_WIDTH_IN}
                  max={UV_DTF_MEDIA_WIDTH_IN}
                  step="0.25"
                  value={mediaWidthIn}
                  disabled
                  readOnly
                  aria-label="UV DTF width locked at 22 inches"
                />
              </label>
              <label>
                Length (in)
                <input
                  type="number"
                  min={MIN_UV_LENGTH_IN}
                  max={MAX_MEDIA_HEIGHT_IN}
                  step="0.25"
                  value={mediaHeightIn}
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 0
                    setUvLengthIn(clampUvLength(raw || MIN_UV_LENGTH_IN))
                  }}
                />
              </label>
            </div>
            <small>
              {`Width is locked at ${UV_DTF_MEDIA_WIDTH_IN} in (never exceeds). Minimum length ${MIN_UV_LENGTH_IN} in. Length grows on the roll if stickers need more film.`}
            </small>
          </div>

          <div className="sticker-cut-summary">
            <span className="precut-button-title">
              <Scissors size={18} /> Cut
            </span>
            <strong>{cutLabel}</strong>
            {cutEnabled && <small>Fixed Square Cut · 2.5 mm on every image.</small>}
            {!cutEnabled && <small>Toggle Cut in step 2 under Customer name.</small>}
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
            <Metric label="Product" value="UV DTF" icon={<Sticker size={22} />} green />
            <Metric label="Media size" value={sheetLabelText} icon={<Maximize2 size={21} />} green />
            <Metric label="Cut" value={cutLabel} icon={<Scissors size={22} />} green />
            <div className="price-breakdown">
              <strong>{sheetName}</strong>
              <span>
                UV DTF stickers · {sheetLabelText} · {cutLabel}
              </span>
              {shapesBusy && <span>Adding cut line…</span>}
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
                  <img
                    className="sheet-final-preview"
                    src={sheetPreviewUrl}
                    alt="Sticker sheet preview"
                  />
                  <CutShapeOverlay
                    shapes={cutShapes}
                    marks={cutMarks}
                    sheetWidthIn={mediaWidthIn}
                    sheetHeightIn={printHeight}
                  />
                </span>
              </button>
            ) : cutEnabled && cutShapes.length > 0 ? (
              <div
                className="cut-preview-only"
                style={{ aspectRatio: `${mediaWidthIn} / ${Math.max(printHeight, 1)}` }}
              >
                <CutShapeOverlay
                  shapes={cutShapes}
                  marks={cutMarks}
                  sheetWidthIn={mediaWidthIn}
                  sheetHeightIn={printHeight}
                />
              </div>
            ) : (
              <div className="mini-sheet preview-placeholder">
                {previewPieces.length ? (
                  shapesBusy && cutEnabled ? (
                    <div className="preview-empty">Adding cut line…</div>
                  ) : (
                    ''
                  )
                ) : (
                  <div className="preview-empty">Add stickers</div>
                )}
              </div>
            )}
            <span className="dimension vertical">{billedLength} in</span>
            <button
              className="build-button"
              disabled={
                previewBusy ||
                saving ||
                designs.length === 0 ||
                !customerName.trim()
              }
              onClick={() => void previewStickerSheet()}
            >
              <Eye size={18} /> {previewBusy ? 'Building preview…' : 'Preview Sticker Sheet'}
            </button>
            {previewing && pagePreviewUrls.length > 0 && (
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
                {sheetLabelText} · {totalTransfers} pieces · {cutLabel} · Ready
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
                  setDriveFolderId(null)
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
