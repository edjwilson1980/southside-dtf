'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Baby, Check, Copy, Eye, FileImage, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Ruler, Scissors, Shirt, Sparkles, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
import { SheetPreviewModal } from '@/components/sheet-preview-modal'
import { ShopNav } from '@/components/shop-nav'
import { CutShapeOverlay } from '@/components/cut-shape-overlay'
import { composeGangSheet, packSheetBestGutter, piecePrintSize, ART_INSET_IN, CUT_ART_START_IN, SHEET_WIDTH_IN } from '@/lib/compose-sheet'
import { type LayoutPiece } from '@/components/sheet-layout-overlay'
import { BUILDER_VERSION } from '@/lib/version'
import { CUT_GUTTER_IN, MARK_CLEARANCE_IN, registrationMarkBounds, registrationMarkRects, startMarkArrowPoints } from '@/lib/cut-layout'
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
  placement: string
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
const logoUrl = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SSP%20Logo%20%28Black%20Outline%29-A5PrDBPZRDhydxNxRumbsTUFufpLv9.png'
const sizeGuideUrl = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/DTF%20size%20chart%20%20front2-SIpj1XrVDRyRDtQhaACxzNHj5geNxv.png'
const placements = ['Left Chest', 'Toddler Shirt', 'Youth Shirt', 'Adult Shirt', 'Hoodie Front', 'Hoodie Back', 'Hat', 'Sleeve', 'Custom']
const sizeOptions = {
  'Left Chest': ['Youth Left Chest · 3 × 3 in', 'Standard Left Chest · 3.75 × 3.75 in', 'Oversized Left Chest · 4.5 × 4.5 in'],
  'Toddler Shirt': ['2T · 5.5 × 6 in', '3T · 6 × 6.5 in', '4T · 6.5 × 7 in', '5T · 6.5 × 7 in'],
  'Youth Shirt': ['XS · 7.5 × 8 in', 'Small · 8.5 × 9 in', 'Medium · 9.25 × 10 in', 'Large · 9.75 × 11 in'],
  'Adult Shirt': ['Small · 10 × 12 in', 'Medium · 10.5 × 12 in', 'Large · 10.5 × 12 in', 'XL · 10.5 × 12 in', '2XL · 12.5 × 13 in', '3XL · 13.5 × 14 in'],
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
const MIN_PAGE_IN = 4
const MAX_PAGE_WIDTH_IN = SHEET_WIDTH_IN
const MAX_PAGE_HEIGHT_IN = 200

function clampPageWidth(value: number) {
  return Math.min(MAX_PAGE_WIDTH_IN, Math.max(MIN_PAGE_IN, value))
}

function clampPageHeight(value: number) {
  return Math.min(MAX_PAGE_HEIGHT_IN, Math.max(MIN_PAGE_IN, value))
}

function pageLabel(widthIn: number, heightIn: number) {
  return `${widthIn.toFixed(2).replace(/\.00$/, '')} × ${heightIn.toFixed(2).replace(/\.00$/, '')} in`
}

function PlacementIcon({ placement }: { placement: string }) {
  if (placement === 'Left Chest') return <span className="pocket-icon" aria-hidden="true"><span /></span>
  if (placement === 'Hoodie Front' || placement === 'Hoodie Back') return <span className={`hoodie-icon ${placement === 'Hoodie Back' ? 'back' : ''}`} aria-hidden="true"><span className="hood" /><span className="hoodie-body" /><span className="hoodie-pocket" /></span>
  if (placement === 'Toddler Shirt') return <Baby size={34} strokeWidth={1.4} />
  if (placement === 'Hat') return <span className="baseball-hat-icon" aria-hidden="true"><span className="hat-crown" /><span className="hat-brim" /></span>
  if (placement === 'Sleeve') return <Ruler size={32} strokeWidth={1.4} />
  if (placement === 'Custom') return <Sparkles size={32} strokeWidth={1.4} />
  return <Shirt size={34} strokeWidth={1.4} />
}

function recommendedSize(type: string) {
  if (type === 'Left Chest') return 'Standard Left Chest · 3.75 × 3.75 in'
  if (type === 'Youth Shirt') return 'Small · 8.5 × 9 in'
  if (type === 'Toddler Shirt') return '4T · 6.5 × 7 in'
  if (type === 'Adult Shirt') return 'Medium · 10.5 × 12 in'
  if (type === 'Hoodie Front') return 'Medium · 10.5 × 11 in'
  if (type === 'Hoodie Back') return 'Medium · 10.5 × 12 in'
  if (type === 'Hat') return 'Medium · 4 in'
  return '10.5 in'
}

const howToSteps = [
  { id: 'step-1', number: 1, title: 'Customer name', detail: 'Type the customer name first.' },
  { id: 'step-2', number: 2, title: 'Upload your design', detail: 'Drop or click to add artwork.' },
  { id: 'step-3', number: 3, title: 'What are you printing?', detail: 'Pick the shirt, hoodie, hat, or custom size.' },
  { id: 'step-4', number: 4, title: 'Set sizes and edit', detail: 'Choose the print size, quantity, and fix the art if needed.' },
  { id: 'step-5', number: 5, title: 'Page size & cut', detail: 'Set page W×H, pick box / circle / contour cut, then build.' },
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

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [designs, setDesigns] = useState<Design[]>([])
  const [placement, setPlacement] = useState('Adult Shirt')
  const [dragging, setDragging] = useState(false)
  const [built, setBuilt] = useState(false)
  const [duplicateTargetId, setDuplicateTargetId] = useState<number | null>(null)
  const [replaceTargetId, setReplaceTargetId] = useState<number | null>(null)
  const [sizeGuidePlacement, setSizeGuidePlacement] = useState<string | null>(null)
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
  const [pageWidthIn, setPageWidthIn] = useState(SHEET_WIDTH_IN)
  const [pageHeightIn, setPageHeightIn] = useState(24)
  const [cutShapes, setCutShapes] = useState<CutShape[]>([])
  const [shapesBusy, setShapesBusy] = useState(false)
  const previewGen = useRef(0)

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
        placement,
        size: recommendedSize(placement),
        customWidth: '',
        customHeight: '',
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

    setDesigns((current) => {
      const next = [...current, ...additions.map((design, index) => ({ ...design, designNumber: current.length + index + 1 }))]
      return next
    })

    for (const design of additions) {
      if (!design.originalUrl) continue
      void trimUploadedDesign(design.id, design.originalUrl)
    }
  }

  async function trimUploadedDesign(id: number, sourceUrl: string) {
    try {
      const result = await trimEmptySpace(sourceUrl)
      setDesigns((items) => items.map((item) => {
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
      }))
    } catch {
      readImageSize(sourceUrl).then((size) => {
        setDesigns((items) => items.map((item) => item.id === id ? { ...item, pixelWidth: size.width, pixelHeight: size.height } : item))
      })
    }
  }
  const totalTransfers = designs.reduce((sum, design) => sum + design.quantity, 0)
  const previewPieces = designs.flatMap((design) => Array.from({ length: design.quantity }, () => design))
  /**
   * The chosen size is the box the design may fill. The printed size is the
   * artwork fitted inside it, so nothing is ever stretched and the packer only
   * reserves the film the art actually covers.
   */
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
  const packWidthIn = Math.max(MIN_PAGE_IN, pageWidthIn - MARK_CLEARANCE_IN * 2)
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
  const printHeight = Math.max(pageHeightIn, sheetLayout.contentEndY + CUT_ART_START_IN)
  const pageOverflow = contentHeightIn + CUT_ART_START_IN * 2 > pageHeightIn + 1e-6
  const cutMarkRects = registrationMarkRects(printHeight, pageWidthIn, sheetLayout.pieces)
  const cutMarks = registrationMarkBounds(printHeight, pageWidthIn, sheetLayout.pieces)
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
  const layoutKey = designs.map((design) => [
    design.id, design.quantity, design.size, design.placement, design.keepUpright,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|') + `|cut:${cutMode}|page:${pageWidthIn}x${pageHeightIn}`
  const sheetLabelText = pageLabel(pageWidthIn, billedLength)
  const fillPercent =
    pageHeightIn > 0 ? Math.min(100, Math.round((printHeight / pageHeightIn) * 100)) : 0
  const sheetFillMessage =
    designs.length === 0
      ? null
      : pageOverflow
        ? `Art needs ${printHeight.toFixed(1)} in — taller than the ${pageHeightIn} in page. Sheet length grew to fit.`
        : `Page is ${fillPercent}% used (${printHeight.toFixed(1)} of ${pageHeightIn} in)`
  const sheetName = customerName.trim() || 'Custom Cut'
  const currentGuideStep = !customerName.trim() ? 1 : designs.length === 0 ? 2 : !previewing && !built ? 4 : 5
  const updateDesign = (id: number, patch: Partial<Design>) => setDesigns((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  const duplicateDesign = (sourceId: number, nextPlacement: string) => {
    const source = designs.find((design) => design.id === sourceId)
    if (!source) return
    const nextSize = (sizeOptions[nextPlacement as keyof typeof sizeOptions] ?? sizeOptions.default)[0]
    setDesigns((items) => {
      const nextId = Math.max(0, ...items.map((item) => item.id)) + 1
      return [...items, { ...source, id: nextId, designNumber: source.designNumber, placement: nextPlacement, size: nextSize, customWidth: nextPlacement === 'Custom' ? '' : source.customWidth, customHeight: nextPlacement === 'Custom' ? '' : source.customHeight, quantity: 1 }]
    })
    setDuplicateTargetId(null)
  }
  const removeDesign = (id: number) => {
    setDesigns((items) => {
      const target = items.find((item) => item.id === id)
      const remaining = items.filter((item) => item.id !== id)
      if (target) revokeUnusedUrls([target.originalUrl, target.previewUrl], remaining)
      return remaining
    })
    setInspectId((current) => current === id ? null : current)
  }
  const applyInspectedDesign = (id: number, previewUrl: string) => {
    setDesigns((items) => items.map((item) => {
      if (item.id !== id) return item
      if (item.previewUrl !== item.originalUrl && item.previewUrl !== previewUrl) {
        revokeUnusedUrls([item.previewUrl], items.filter((other) => other.id !== id).concat([{ ...item, previewUrl }]))
      }
      return { ...item, previewUrl, enhanced: previewUrl !== item.originalUrl }
    }))
    setInspectId(null)
    readImageSize(previewUrl).then((size) => {
      setDesigns((items) => items.map((item) => item.id === id ? { ...item, pixelWidth: size.width, pixelHeight: size.height } : item))
    })
  }
  const inspectDesign = designs.find((design) => design.id === inspectId && design.previewUrl)

  /**
   * Swap the artwork on a design that is already set up, keeping its placement,
   * size, quantity and notes.
   */
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
    if (latest) setDuplicateTargetId(latest.id)
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
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(printHeight, pageWidthIn))))
  }

  async function refreshCutShapes() {
    if (sheetLayout.pieces.length === 0) {
      setCutShapes([])
      return []
    }
    setShapesBusy(true)
    try {
      const shapes = await buildCutShapes(sheetLayout.pieces, cutMode, pageWidthIn, printHeight)
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
      sheetWidthIn: pageWidthIn,
      pxPerIn,
      label,
      mapCmyk,
      marks: cutMarkRects,
      startArrow: startArrowPoints,
    })
  }


  async function previewGangSheet() {
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
      setSaveError(err instanceof Error ? err.message : 'Could not preview the cut sheet.')
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
      const plt = cutPltForShapes(shapes, printHeight, pageWidthIn, sheetLayout.pieces)
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
      setSaveError(err instanceof Error ? err.message : 'Could not build the cut sheet.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="builder-shell">
    <div className="builder-topbar">
      <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
      <div className="title-block">
        <h1>Custom Cut Product</h1>
        <p className="lead">Staff builder for the new cut product — box, circle, or cut-around-object.</p>
        <p className="sublead">Set a custom page width × height, pack designs, and export print PNG + cutter PLT.</p>
      </div>
      <ShopNav current="custom-cut" />
    </div>
    <ol className="how-to" aria-label="How to build your gang sheet">
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
        <div className="inline-guide">
          <img src={sizeGuideUrl} alt="DTF design size guide for toddler, youth, and adult shirts" />
          <div className="inline-guide-copy">
            <span className="eyebrow">Live size chart</span>
            <h2>{placement} max sizes</h2>
            <p>Pick a garment below to update this chart. Hoodie Front uses the new max width × height sizes.</p>
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
              id={`size-chart-${placement.replace(/\s+/g, '-').toLowerCase()}`}
              className="live-size-section selected"
            >
              <header>
                <h3>{placement === 'Custom' ? 'Custom sizes' : placement}</h3>
                <span>Max print size</span>
              </header>
              <div className="size-recommendations">
                {(sizeOptions[placement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => (
                  <div key={option} className="size-recommendation">
                    <strong>{option.split(' · ')[0]}</strong>
                    <span>{option.includes(' · ') ? option.split(' · ')[1] : option}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        <div id="step-1" className="guide-block">
          <GuideHeading number={1} title="Customer name" hint="Type the customer name before you upload anything." />
          <label className="customer-name-field workspace-customer-name">Customer name <span className="required-field">Required</span><input required type="text" maxLength={80} placeholder="Enter customer name before uploading" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
        </div>
        <div id="step-2" className="guide-block">
          <GuideHeading number={2} title="Upload your design" hint="Drop a PNG, JPG, PDF, or SVG here, or click to choose a file from your computer." />
        </div>
        <button className={`dropzone ${dragging ? 'dragging' : ''} ${!customerName.trim() ? 'customer-required-disabled' : ''}`} aria-disabled={!customerName.trim()} title={!customerName.trim() ? 'Enter a customer name first' : undefined} onClick={() => { if (customerName.trim()) inputRef.current?.click() }} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files) }}><Upload size={48} strokeWidth={1.7} /><strong>Drop your artwork here</strong><span>{DESIGN_ACCEPT_LABEL}</span><small>Click a design to blow it up, check quality, and upscale it</small></button>
        <input ref={inputRef} className="sr-only" type="file" multiple accept={DESIGN_ACCEPT} onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} /><input ref={replaceInputRef} className="sr-only" type="file" accept={DESIGN_ACCEPT} onChange={(e) => { const file = e.target.files?.[0]; if (file && replaceTargetId !== null) void replaceDesignArtwork(replaceTargetId, file); setReplaceTargetId(null); e.target.value = '' }} />
        <div className="divider" />
        <div id="step-3" className="guide-block">
          <GuideHeading number={3} title="What are you printing?" hint="Tap the garment or placement that matches this design." />
        </div>
        <div className="placement-grid">{placements.map((item) => <button key={item} className={`placement-card ${placement === item ? 'selected' : ''}`} onClick={() => setPlacement(item)}><span className="icon-guide-trigger" role="button" tabIndex={0} aria-label={`Show recommended sizes for ${item}`} onClick={(event) => { event.stopPropagation(); setSizeGuidePlacement(item) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setSizeGuidePlacement(item) } }}><PlacementIcon placement={item} /></span><span>{item}</span>{item === 'Adult Shirt' && <em>POPULAR</em>}</button>)}</div>
        <div id="step-4" className="guide-block design-heading">
          <GuideHeading number={4} title="Set sizes and edit" hint="Pick the print size and quantity. Click the picture if you need to crop, clean, or check quality." />
          <h2 className="design-count">Your designs ({designs.length})</h2>
        </div>
        {designs.length === 0 && <div className="empty-designs"><FileImage size={24} /><span>Your uploaded designs will appear here.</span></div>}
        <div className="design-list">{designs.map((design) => <div className="design-row" key={design.id}><div className="drag-handle">⋮<br />⋮</div><button type="button" className={`thumb ${design.previewUrl ? 'has-art' : design.color}`} disabled={!design.previewUrl} onClick={() => design.previewUrl && setInspectId(design.id)} aria-label={`Inspect ${design.name}`}>{design.previewUrl ? <img src={design.previewUrl} alt="" /> : <><ImageIcon size={24} /><small>ARTWORK</small></>}<span className="thumb-status">Click to inspect</span></button><div className="design-name"><strong>{design.name}</strong>{(() => { const dpi = printDpi(design.pixelWidth, getDesignWidth(design)); const quality = qualityFromDpi(dpi); return <span className={quality.tone === 'good' ? 'quality' : quality.tone === 'poor' ? 'quality-warn' : 'transparent'}>{quality.tone === 'good' ? <Check size={13} /> : null}{dpi ? `${dpi} DPI · ${quality.label}` : 'Click art to check quality'}</span> })()}{design.enhanced && <span className="quality">Upscaled</span>}<button type="button" className="compare-link" disabled={!design.previewUrl} onClick={() => setInspectId(design.id)}>View large · Upscale</button></div><label className="object-type">What are you printing?<select aria-label={`What are you printing for ${design.name}`} value={design.placement} onChange={(e) => { const nextPlacement = e.target.value; updateDesign(design.id, { placement: nextPlacement, size: nextPlacement === 'Custom' ? '0 × 0 in' : (sizeOptions[nextPlacement as keyof typeof sizeOptions] ?? sizeOptions.default)[0], customWidth: nextPlacement === 'Custom' ? '' : design.customWidth, customHeight: nextPlacement === 'Custom' ? '' : design.customHeight }) }}>{placements.map((option) => <option key={option}>{option}</option>)}</select></label>{design.placement === 'Custom' ? <div className="custom-dimensions"><span>Custom image size (max {SHEET_WIDTH_IN} in wide × 199 in high)</span><div><label>Width (in)<input aria-label={`Custom width for ${design.name}`} type="number" min="0.25" max={SHEET_WIDTH_IN} step="0.25" placeholder="Width" value={design.customWidth} onChange={(e) => { const width = Math.min(SHEET_WIDTH_IN, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(width); updateDesign(design.id, { customWidth: value, size: `${value || '0'} × ${design.customHeight || '0'} in` }) }} /></label><label>Height (in)<input aria-label={`Custom height for ${design.name}`} type="number" min="0.25" max="199" step="0.25" placeholder="Height" value={design.customHeight} onChange={(e) => { const height = Math.min(199, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(height); updateDesign(design.id, { customHeight: value, size: `${design.customWidth || '0'} × ${value || '0'} in` }) }} /></label></div></div> : <label>Size<select aria-label={`Print size for ${design.name}`} value={design.size} onChange={(e) => updateDesign(design.id, { size: e.target.value })}>{(sizeOptions[design.placement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <option key={option}>{option}</option>)}</select></label>}<label>Quantity<div className="number-input"><button aria-label="Decrease design quantity" onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}><Minus size={13} /></button><input aria-label={`Quantity for ${design.name}`} type="number" min="1" step="1" value={design.quantity} onChange={(event) => updateDesign(design.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /><button aria-label="Increase design quantity" onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}><Plus size={13} /></button></div></label><div className="design-actions-stack"><button type="button" className="row-action" title="Replace artwork" aria-label={`Replace artwork for ${design.name}`} onClick={() => startReplace(design.id)}><Replace size={15} /></button><button type="button" className="row-action" title="Duplicate this design" aria-label={`Duplicate ${design.name}`} onClick={() => setDuplicateTargetId(design.id)}><Copy size={15} /></button><button type="button" className={`row-action${design.keepUpright ? " upright" : ""}`} aria-pressed={design.keepUpright} title={design.keepUpright ? "Keep this design upright" : "Allow turning to fit more across"} aria-label={design.keepUpright ? `Keep ${design.name} upright` : `Allow turning ${design.name}`} onClick={() => updateDesign(design.id, { keepUpright: !design.keepUpright })}><RotateCw size={15} /></button><button type="button" className="row-action danger" title="Remove design" aria-label={`Remove ${design.name}`} onClick={() => removeDesign(design.id)}><Trash2 size={15} /></button></div></div>)}</div>
        <div className="design-footer-actions"><button className="add-design" disabled={!customerName.trim()} onClick={() => { if (customerName.trim()) inputRef.current?.click() }}><Plus size={20} /> Add Another Design</button><button className="duplicate-design" disabled={designs.length === 0} onClick={duplicateLatestDesign}><Copy size={18} /> Duplicate Design</button></div>
        {duplicateTargetId !== null && <div className="duplicate-picker"><div><strong>What are you printing?</strong><span>Choose the garment or placement for this copy.</span></div><div className="duplicate-picker-options">{placements.map((item) => <button key={item} type="button" onClick={() => duplicateDesign(duplicateTargetId, item)}><PlacementIcon placement={item} /><span>{item}</span></button>)}</div><button className="cancel-duplicate" type="button" onClick={() => setDuplicateTargetId(null)}>Cancel</button></div>}
        {sizeGuidePlacement && <div className="size-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSizeGuidePlacement(null) }}><section className="size-popup" role="dialog" aria-modal="true" aria-labelledby="size-popup-title"><div className="size-popup-header"><div><span className="eyebrow">Recommended sizes</span><h2 id="size-popup-title">{sizeGuidePlacement}</h2><p>These are the max print sizes for this placement. Choose the matching size in the size menu.</p></div><button className="size-popup-close" aria-label="Close recommended sizes" onClick={() => setSizeGuidePlacement(null)}>×</button></div><div className="size-recommendations">{(sizeOptions[sizeGuidePlacement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <div key={option} className="size-recommendation"><strong>{option.split(' · ')[0]}</strong><span>{option.includes(' · ') ? option.split(' · ')[1] : option}</span></div>)}</div><button className="size-popup-done" onClick={() => setSizeGuidePlacement(null)}>Continue</button></section></div>}
        {inspectDesign && <DesignInspector design={inspectDesign} onClose={() => setInspectId(null)} onApply={(previewUrl) => applyInspectedDesign(inspectDesign.id, previewUrl)} />}
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
            sheetWidthIn={pageWidthIn}
            cutOut
            audience="shop"
            layoutPieces={layoutPieces}
          />
        )}
      </section>

      <aside className="order-panel panel">
        <div id="step-5" className="order-title">
          <span className="guide-num">5</span>
          <div>
            <h2>Page size, cut type &amp; build</h2>
            <p className="order-hint">Set the page, pick how we cut, preview, then confirm for PNG + PLT.</p>
          </div>
        </div>
        <div className="custom-cut-page-size">
          <span className="precut-button-title"><Maximize2 size={18} /> Page size</span>
          <div className="custom-cut-size-fields">
            <label>
              Width (in)
              <input
                type="number"
                min={MIN_PAGE_IN}
                max={MAX_PAGE_WIDTH_IN}
                step="0.25"
                value={pageWidthIn}
                onChange={(e) => setPageWidthIn(clampPageWidth(Number(e.target.value) || MIN_PAGE_IN))}
              />
            </label>
            <label>
              Height (in)
              <input
                type="number"
                min={MIN_PAGE_IN}
                max={MAX_PAGE_HEIGHT_IN}
                step="0.25"
                value={pageHeightIn}
                onChange={(e) => setPageHeightIn(clampPageHeight(Number(e.target.value) || MIN_PAGE_IN))}
              />
            </label>
          </div>
          <small>Max printable width is {MAX_PAGE_WIDTH_IN} in. Height grows automatically if art needs more film.</small>
        </div>

        <div className="custom-cut-modes" role="group" aria-label="Cut type">
          <span className="precut-button-title"><Scissors size={18} /> Cut type</span>
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
          <p className="save-error">A cut shape is taller than one cutter pass. Shorten the design or reduce page packing.</p>
        )}
        {rotateSaveMessage && (
          <p className="rotate-save-note" aria-live="polite">{rotateSaveMessage}</p>
        )}
        <div className="metrics">
          <Metric label="Designs" value={designs.length} icon={<ImageIcon size={24} />} />
          <Metric label="Total Transfers" value={totalTransfers} icon={<Shirt size={25} />} />
          <Metric label="Page size" value={sheetLabelText} icon={<Maximize2 size={21} />} green />
          <Metric label="Cut type" value={CUT_MODES.find((mode) => mode.value === cutMode)?.label ?? cutMode} icon={<Scissors size={22} />} green />
          <div className="price-breakdown">
            <strong>{sheetName}</strong>
            <span>{sheetLabelText} · {cutMode} cut</span>
            {shapesBusy && <span>Tracing cut paths…</span>}
          </div>
        </div>
        <div className="preview-heading"><strong>Cut sheet</strong></div>
        {sheetFillMessage && (
          <p className="sheet-fill-readout" aria-live="polite">
            {sheetFillMessage}
            <span className="sheet-fill-bar" aria-hidden="true">
              <span style={{ width: `${fillPercent}%` }} />
            </span>
          </p>
        )}
        <div className="sheet-preview">
          <span className="dimension horizontal">{pageWidthIn} in</span>
          {sheetPreviewUrl ? (
            <button type="button" className="sheet-final-preview-button" onClick={() => setSheetPreviewOpen(true)}>
              <span className="sheet-final-preview-wrap">
                <img className="sheet-final-preview" src={sheetPreviewUrl} alt="Cut sheet preview" />
                <CutShapeOverlay
                  shapes={cutShapes}
                  marks={cutMarks}
                  sheetWidthIn={pageWidthIn}
                  sheetHeightIn={printHeight}
                />
              </span>
            </button>
          ) : (
            <div className="mini-sheet preview-placeholder">{previewPieces.length ? '' : <div className="preview-empty">Add designs</div>}</div>
          )}
          <span className="dimension vertical">{billedLength} in</span>
          <button className="build-button" disabled={previewBusy || saving || designs.length === 0 || !customerName.trim()} onClick={() => void previewGangSheet()}>
            <Eye size={18} /> {previewBusy ? 'Building preview…' : 'Preview Cut Sheet'}
          </button>
          {previewing && sheetPreviewUrl && (
            <button className="confirm-button" disabled={saving || shapesBusy} onClick={() => void buildAndStore()}>
              <Check size={18} /> {saving ? 'Saving to Drive…' : 'Confirm & Build Cut Sheet'}
            </button>
          )}
          {saveError && <p className="save-error">{saveError}</p>}
        </div>
        {built && (
          <div className="built-card">
            <div className="built-title"><span><Check size={21} /></span><strong>Your cut sheet is built.</strong></div>
            <p>{sheetLabelText} · {totalTransfers} transfers · {cutMode} cut · Ready</p>
            {driveFolderUrl && (
              <a className="drive-link" href={driveFolderUrl} target="_blank" rel="noreferrer">
                Open job folder in Google Drive (print PNG + cutter PLT)
              </a>
            )}
            <button onClick={() => { setBuilt(false); setDriveFolderUrl(null) }}>Review &amp; Add to Cart <span>›</span></button>
          </div>
        )}
        <p className="builder-version">Builder v{BUILDER_VERSION}</p>
      </aside>
    </div>

  </main>
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

function Metric({ label, value, icon, green }: { label: string; value: string | number; icon: React.ReactNode; green?: boolean }) { return <div className="metric"><span>{label}</span><strong className={green ? 'green-text' : ''}>{value}</strong><i>{icon}</i></div> }
