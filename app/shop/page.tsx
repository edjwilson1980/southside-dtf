'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Baby, Check, Copy, Eye, FileImage, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Ruler, Scissors, Shirt, Sparkles, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
import { SheetPreviewModal } from '@/components/sheet-preview-modal'
import { composeGangSheet, packSheetBestGutter, piecePrintSize, ART_INSET_IN, CUT_ART_START_IN, SHEET_WIDTH_IN } from '@/lib/compose-sheet'
import { pieceKey, type LayoutPiece } from '@/components/sheet-layout-overlay'
import { BUILDER_VERSION } from '@/lib/version'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { CUT_GUTTER_IN, CUT_MARGIN_IN, MARK_CLEARANCE_IN, MARK_SECTION_IN, cutPlt, cutPreviewBoxes, registrationMarkBounds, registrationMarkRects, startMarkArrowPoints } from '@/lib/cut-layout'
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
  turned: boolean
  preset?: { placement: string; size: string; customWidth: string; customHeight: string }
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
/** Printable width, so the label matches what actually lands on the film. */
function sheetLabel(lengthIn: number) {
  return `${SHEET_WIDTH_IN} × ${lengthIn} in`
}

const sheetOptions = [
  { length: 12, price: 8 },
  { length: 24, price: 15 },
  { length: 36, price: 24 },
  { length: 48, price: 30 },
  { length: 60, price: 40 },
  { length: 72, price: 48 },
  { length: 100, price: 60 },
  { length: 120, price: 70 },
  { length: 150, price: 90 },
  { length: 200, price: 115 },
].map((option) => ({ ...option, label: sheetLabel(option.length) }))

function billedSheetLength(artLength: number) {
  const chargeable = Math.max(0, artLength - 1.5)
  const safeLength = Math.max(12, Math.ceil(chargeable - 1e-9))
  const fullSheets = Math.floor(safeLength / 200)
  const remainder = safeLength % 200
  if (remainder === 0) return Math.max(12, fullSheets * 200)
  const remainderSheet = sheetOptions.find((option) => remainder <= option.length) ?? sheetOptions[sheetOptions.length - 1]
  return fullSheets * 200 + remainderSheet.length
}

function cuttingFeeEach(transferCount: number) {
  if (transferCount <= 0) return 0
  if (transferCount <= 24) return 0.5
  if (transferCount <= 99) return 0.25
  if (transferCount <= 249) return 0.2
  if (transferCount <= 499) return 0.15
  return 0.1
}

function getGangSheet(length: number) {
  const billedLength = billedSheetLength(length)
  const fullSheets = Math.floor(billedLength / 200)
  const remainder = billedLength % 200
  const remainderSheet = remainder > 0 ? sheetOptions.find((option) => option.length === remainder) ?? sheetOptions[sheetOptions.length - 1] : null
  const price = fullSheets * 115 + (remainderSheet?.price ?? 0)
  return {
    length: billedLength,
    label: sheetLabel(billedLength),
    price,
    breakdown: fullSheets > 0 && remainderSheet ? `${fullSheets} × 200 in + ${remainderSheet.length} in` : fullSheets > 0 ? `${fullSheets} × 200 in` : remainderSheet?.label ?? sheetLabel(12),
  }
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
  { id: 'step-5', number: 5, title: 'Check out your gang sheet', detail: 'Preview it, then confirm to download.' },
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
  const [adjustFocusKey, setAdjustFocusKey] = useState<string | null>(null)
  const [previewRefreshing, setPreviewRefreshing] = useState(false)
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
  const [cutOut, setCutOut] = useState(false)
  const previewGen = useRef(0)
  const adjustingRef = useRef(false)

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
        turned: false,
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
  const previewPieces = designs.flatMap((design) =>
    Array.from({ length: design.quantity }, (_, copyIndex) => ({
      ...design,
      designId: design.id,
      copyIndex,
    })),
  )
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
    designId: design.designId,
    copyIndex: design.copyIndex,
    name: design.name,
    previewUrl: design.previewUrl,
    widthIn: getDesignWidth(design),
    heightIn: getDesignHeight(design),
    allowRotate: !design.keepUpright,
    forceRotate: design.turned,
  }))
  /** What the sheet would cost with nothing turned — for the saving readout. */
  const uprightLayout = packSheetBestGutter(pieceInputs, {
    packWidthIn: SHEET_WIDTH_IN,
    startYIn: ART_INSET_IN,
    rotatePolicy: 'none' as const,
  })
  // Billable packing ignores pre-cut gutters/insets — pre-cut must not inflate sheet price.
  const billableLayout = packSheetBestGutter(pieceInputs, {
    packWidthIn: SHEET_WIDTH_IN,
    startYIn: ART_INSET_IN,
  })
  const sheetLayout = cutOut
    ? packSheetBestGutter(pieceInputs, {
        packWidthIn: SHEET_WIDTH_IN - MARK_CLEARANCE_IN * 2,
        startYIn: CUT_ART_START_IN,
        sideInsetIn: MARK_CLEARANCE_IN,
        minGutterIn: CUT_GUTTER_IN,
      })
    : billableLayout
  const billableHeightIn = Math.max(0, billableLayout.contentEndY - ART_INSET_IN)
  const printedHeightIn = cutOut
    ? Math.max(0, sheetLayout.contentEndY - CUT_ART_START_IN)
    : billableHeightIn
  // Full film length for PNG / PLT / overlays (leading + trailing insets).
  const printHeight = cutOut
    ? sheetLayout.contentEndY + CUT_ART_START_IN
    : sheetLayout.contentEndY + ART_INSET_IN
  const cutMarkRects = cutOut ? registrationMarkRects(printHeight, SHEET_WIDTH_IN, sheetLayout.pieces) : []
  const cutMarks = cutOut ? registrationMarkBounds(printHeight, SHEET_WIDTH_IN, sheetLayout.pieces) : []
  const startArrow = cutMarks.find((mark) => mark.first)
  const startArrowPoints = startArrow ? startMarkArrowPoints(startArrow) : []
  const billedLength = billedSheetLength(billableHeightIn)
  const cutBoxes = cutOut ? cutPreviewBoxes(sheetLayout.pieces, SHEET_WIDTH_IN, printHeight) : []
  const cutTooTall = cutOut && sheetLayout.pieces.some((piece) => piece.heightIn + CUT_MARGIN_IN * 2 > MARK_SECTION_IN)
  const layoutPieces: LayoutPiece[] = sheetLayout.pieces.map((piece) => ({
    designId: piece.designId,
    copyIndex: piece.copyIndex,
    name: piece.name,
    xIn: piece.xIn,
    yIn: piece.yIn,
    widthIn: piece.widthIn,
    heightIn: piece.heightIn,
    rotated: piece.rotated,
  }))
  const rotatedCount = sheetLayout.rotatedCount
  const filmSavedIn = Math.max(0, uprightLayout.contentBottom - billableLayout.contentBottom)
  const rotateSaveMessage =
    rotatedCount > 0 && filmSavedIn > 0.05
      ? `Turned ${rotatedCount} design${rotatedCount === 1 ? '' : 's'} a quarter turn to fit more across — saves ${filmSavedIn.toFixed(1)} in of film.`
      : null
  const layoutKey = designs.map((design) => [
    design.id, design.quantity, design.size, design.placement, design.keepUpright, design.turned,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|') + `|cut:${cutOut ? '1' : '0'}`
  const sheet = getGangSheet(billableHeightIn)
  const chargeableArtIn = Math.max(0, billableHeightIn - 1.5)
  const lengthLeftIn = Math.max(0, billedLength - chargeableArtIn)
  const fillPercent = billedLength > 0 ? Math.min(100, Math.round((chargeableArtIn / billedLength) * 100)) : 0
  const sheetFillMessage =
    designs.length === 0
      ? null
      : lengthLeftIn <= 1
        ? 'Sheet is full — more designs will start a second sheet'
        : `Sheet is ${fillPercent}% full, about ${lengthLeftIn < 10 ? lengthLeftIn.toFixed(1).replace(/\.0$/, '') : Math.round(lengthLeftIn)}in of length left`
  const sheetCount = Math.max(1, Math.ceil(billedLength / 200))
  const sheetName = customerName.trim() || 'Gang Sheet'
  const cutRate = cuttingFeeEach(totalTransfers)
  const cutFee = cutOut && totalTransfers > 0 ? cutRate * totalTransfers : 0
  const subtotal = sheet.price + cutFee
  const total = subtotal.toFixed(2)
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


  function rememberPreset(design: Design): Design {
    if (design.preset) return design
    return {
      ...design,
      preset: {
        placement: design.placement,
        size: design.size,
        customWidth: design.customWidth,
        customHeight: design.customHeight,
      },
    }
  }

  function clampScaledSize(widthIn: number, heightIn: number, factor: number) {
    const aspect = widthIn > 0 ? heightIn / widthIn : 1
    let nextW = widthIn * factor
    let nextH = heightIn * factor
    if (nextW > SHEET_WIDTH_IN) {
      nextW = SHEET_WIDTH_IN
      nextH = nextW * aspect
    }
    if (nextH > 199) {
      nextH = 199
      nextW = aspect > 0 ? nextH / aspect : nextW
    }
    if (nextW < 0.5) {
      nextW = 0.5
      nextH = nextW * aspect
    }
    if (nextH < 0.5) {
      nextH = 0.5
      nextW = aspect > 0 ? nextH / aspect : nextW
    }
    if (nextW > SHEET_WIDTH_IN) {
      nextW = SHEET_WIDTH_IN
      nextH = nextW * aspect
    }
    return {
      widthIn: Math.round(nextW * 100) / 100,
      heightIn: Math.round(nextH * 100) / 100,
    }
  }

  function applyCustomSize(design: Design, widthIn: number, heightIn: number): Design {
    const width = String(widthIn)
    const height = String(heightIn)
    return {
      ...rememberPreset(design),
      placement: 'Custom',
      customWidth: width,
      customHeight: height,
      size: `${width} × ${height} in`,
    }
  }


  function adjustCopy(designId: number, _copyIndex: number, mutate: (design: Design) => Design) {
    adjustingRef.current = true
    let focusKey: string | null = null
    setDesigns((items) => {
      const source = items.find((item) => item.id === designId)
      if (!source) {
        adjustingRef.current = false
        return items
      }
      if (source.quantity <= 1) {
        const next = mutate(rememberPreset(source))
        focusKey = pieceKey({ designId: next.id, copyIndex: 0 })
        return items.map((item) => (item.id === designId ? next : item))
      }
      const nextId = Math.max(0, ...items.map((item) => item.id)) + 1
      const edited = mutate({
        ...rememberPreset(source),
        id: nextId,
        quantity: 1,
        designNumber: source.designNumber,
      })
      focusKey = pieceKey({ designId: nextId, copyIndex: 0 })
      return items.flatMap((item) => {
        if (item.id !== designId) return [item]
        return [{ ...item, quantity: item.quantity - 1 }, edited]
      })
    })
    if (focusKey) setAdjustFocusKey(focusKey)
  }

  function resizePiece(designId: number, copyIndex: number, factor: number) {
    adjustCopy(designId, copyIndex, (design) => {
      const size = getDesignSize(design)
      const next = clampScaledSize(size.widthIn, size.heightIn, factor)
      return applyCustomSize(design, next.widthIn, next.heightIn)
    })
  }

  function turnPiece(designId: number, copyIndex: number, rotated: boolean) {
    adjustCopy(designId, copyIndex, (design) => ({
      ...rememberPreset(design),
      turned: rotated,
      keepUpright: rotated ? false : true,
    }))
  }

  function resetPiece(designId: number, copyIndex: number) {
    adjustCopy(designId, copyIndex, (design) => {
      const preset = design.preset
      if (!preset) {
        return { ...design, turned: false, keepUpright: false }
      }
      return {
        ...design,
        placement: preset.placement,
        size: preset.size,
        customWidth: preset.customWidth,
        customHeight: preset.customHeight,
        turned: false,
        keepUpright: false,
        preset: undefined,
      }
    })
  }

  const duplicateLatestDesign = () => {
    const latest = designs[designs.length - 1]
    if (latest) setDuplicateTargetId(latest.id)
  }

  useEffect(() => {
    if (adjustingRef.current) {
      const timer = window.setTimeout(() => {
        void redrawSheetPreview()
      }, 260)
      return () => window.clearTimeout(timer)
    }
    previewGen.current += 1
    setPreviewing(false)
    setSheetPreviewOpen(false)
    setJobStamp('')
    setBuilt(false)
    setAdjustFocusKey(null)
    setSheetPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
  }, [layoutKey, customerName])

  function sheetPxPerIn(maxEdge: number, preferred: number) {
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(printHeight, SHEET_WIDTH_IN))))
  }

  async function composeCurrentSheet(pxPerIn: number, label: string, mapCmyk = false) {
    if (sheetLayout.pieces.length === 0) throw new Error('Add a design before previewing the gang sheet.')
    return composeGangSheet({
      pieces: sheetLayout.pieces,
      sheetLengthIn: printHeight,
      pxPerIn,
      label,
      mapCmyk,
      marks: cutOut ? cutMarkRects : [],
      startArrow: cutOut ? startArrowPoints : [],
    })
  }


  async function redrawSheetPreview() {
    if (designs.length === 0) {
      adjustingRef.current = false
      return
    }
    const stamp = jobStamp || sheetStamp()
    const label = sheetJobName(customerName.trim(), billedLength, stamp)
    const gen = ++previewGen.current
    setPreviewRefreshing(true)
    try {
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
      setSaveError(err instanceof Error ? err.message : 'Could not preview the gang sheet.')
    } finally {
      if (gen === previewGen.current) {
        setPreviewRefreshing(false)
        adjustingRef.current = false
      }
    }
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
      setSaveError(err instanceof Error ? err.message : 'Could not preview the gang sheet.')
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
      const png = await composeCurrentSheet(sheetPxPerIn(14000, 150), label, true)
      downloadBlob(png, fileName)
      if (cutOut) {
        const plt = cutPlt(sheetLayout.pieces, printHeight)
        if (!plt) throw new Error('Could not build the cutter PLT for this sheet.')
        const cutName = sheetCutFileName(customerName.trim(), billedLength, stamp)
        // Shop still downloads PLT locally for the cutter PC.
        await wait(200)
        downloadBlob(new Blob([plt], { type: 'text/plain' }), cutName)
        const drive = await uploadJobToGoogleDrive({
          customerName: customerName.trim(),
          stamp,
          files: [{ name: fileName, mimeType: 'image/png', blob: png }],
          cutterFile: { name: cutName, content: plt, mimeType: 'text/plain' },
        })
        setDriveFolderUrl(drive.folderUrl)
      }

      setBuilt(true)
      setSheetPreviewOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not build the gang sheet.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="builder-shell">
    <div className="builder-topbar">
      <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
      <div className="title-block">
        <h1>Shop Gang Sheet Tools</h1>
        <p className="lead">Production builder with cut files and marks.</p>
        <p className="sublead">Internal shop app — advanced features stay here, not on the customer builder.</p>
      </div>
      <nav className="shop-nav" aria-label="Shop tools">
        <a className="shop-nav-link" href="/">Customer builder</a>
        <a className="shop-nav-link" href="/shop/halftone">Halftone generator</a>
        <a className="shop-nav-link" href="/shop/cutter-test">Cutter test</a>
        <a className="shop-nav-link" href="/shop/connect-drive">Connect Drive</a>
      </nav>
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
        <div className="design-list">{designs.map((design) => <div className="design-row" key={design.id}><div className="drag-handle">⋮<br />⋮</div><button type="button" className={`thumb ${design.previewUrl ? 'has-art' : design.color}`} disabled={!design.previewUrl} onClick={() => design.previewUrl && setInspectId(design.id)} aria-label={`Inspect ${design.name}`}>{design.previewUrl ? <img src={design.previewUrl} alt="" /> : <><ImageIcon size={24} /><small>ARTWORK</small></>}<span className="thumb-status">Click to inspect</span></button><div className="design-name"><strong>{design.name}</strong>{(() => { const dpi = printDpi(design.pixelWidth, getDesignWidth(design)); const quality = qualityFromDpi(dpi); return <span className={quality.tone === 'good' ? 'quality' : quality.tone === 'poor' ? 'quality-warn' : 'transparent'}>{quality.tone === 'good' ? <Check size={13} /> : null}{dpi ? `${dpi} DPI · ${quality.label}` : 'Click art to check quality'}</span> })()}{design.enhanced && <span className="quality">Upscaled</span>}<button type="button" className="compare-link" disabled={!design.previewUrl} onClick={() => setInspectId(design.id)}>View large · Upscale</button></div><label className="object-type">What are you printing?<select aria-label={`What are you printing for ${design.name}`} value={design.placement} onChange={(e) => { const nextPlacement = e.target.value; updateDesign(design.id, { placement: nextPlacement, size: nextPlacement === 'Custom' ? '0 × 0 in' : (sizeOptions[nextPlacement as keyof typeof sizeOptions] ?? sizeOptions.default)[0], customWidth: nextPlacement === 'Custom' ? '' : design.customWidth, customHeight: nextPlacement === 'Custom' ? '' : design.customHeight }) }}>{placements.map((option) => <option key={option}>{option}</option>)}</select></label>{design.placement === 'Custom' ? <div className="custom-dimensions"><span>Custom image size (max {SHEET_WIDTH_IN} in wide × 199 in high)</span><div><label>Width (in)<input aria-label={`Custom width for ${design.name}`} type="number" min="0.25" max={SHEET_WIDTH_IN} step="0.25" placeholder="Width" value={design.customWidth} onChange={(e) => { const width = Math.min(SHEET_WIDTH_IN, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(width); updateDesign(design.id, { customWidth: value, size: `${value || '0'} × ${design.customHeight || '0'} in` }) }} /></label><label>Height (in)<input aria-label={`Custom height for ${design.name}`} type="number" min="0.25" max="199" step="0.25" placeholder="Height" value={design.customHeight} onChange={(e) => { const height = Math.min(199, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(height); updateDesign(design.id, { customHeight: value, size: `${design.customWidth || '0'} × ${value || '0'} in` }) }} /></label></div></div> : <label>Size<select aria-label={`Print size for ${design.name}`} value={design.size} onChange={(e) => updateDesign(design.id, { size: e.target.value })}>{(sizeOptions[design.placement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <option key={option}>{option}</option>)}</select></label>}<label>Quantity<div className="number-input"><button aria-label="Decrease design quantity" onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}><Minus size={13} /></button><input aria-label={`Quantity for ${design.name}`} type="number" min="1" step="1" value={design.quantity} onChange={(event) => updateDesign(design.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /><button aria-label="Increase design quantity" onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}><Plus size={13} /></button></div></label><div className="design-actions-stack"><button type="button" className="row-action" title="Replace artwork" aria-label={`Replace artwork for ${design.name}`} onClick={() => startReplace(design.id)}><Replace size={15} /></button><button type="button" className="row-action" title="Duplicate this design" aria-label={`Duplicate ${design.name}`} onClick={() => setDuplicateTargetId(design.id)}><Copy size={15} /></button><button type="button" className={`row-action${design.keepUpright ? " upright" : ""}`} aria-pressed={design.keepUpright} title={design.keepUpright ? "Keep this design upright" : "Allow turning to fit more across"} aria-label={design.keepUpright ? `Keep ${design.name} upright` : `Allow turning ${design.name}`} onClick={() => updateDesign(design.id, { keepUpright: !design.keepUpright, turned: design.keepUpright ? design.turned : false })}><RotateCw size={15} /></button><button type="button" className="row-action danger" title="Remove design" aria-label={`Remove ${design.name}`} onClick={() => removeDesign(design.id)}><Trash2 size={15} /></button></div></div>)}</div>
        <div className="design-footer-actions"><button className="add-design" disabled={!customerName.trim()} onClick={() => { if (customerName.trim()) inputRef.current?.click() }}><Plus size={20} /> Add Another Design</button><button className="duplicate-design" disabled={designs.length === 0} onClick={duplicateLatestDesign}><Copy size={18} /> Duplicate Design</button></div>
        {duplicateTargetId !== null && <div className="duplicate-picker"><div><strong>What are you printing?</strong><span>Choose the garment or placement for this copy.</span></div><div className="duplicate-picker-options">{placements.map((item) => <button key={item} type="button" onClick={() => duplicateDesign(duplicateTargetId, item)}><PlacementIcon placement={item} /><span>{item}</span></button>)}</div><button className="cancel-duplicate" type="button" onClick={() => setDuplicateTargetId(null)}>Cancel</button></div>}
        {sizeGuidePlacement && <div className="size-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSizeGuidePlacement(null) }}><section className="size-popup" role="dialog" aria-modal="true" aria-labelledby="size-popup-title"><div className="size-popup-header"><div><span className="eyebrow">Recommended sizes</span><h2 id="size-popup-title">{sizeGuidePlacement}</h2><p>These are the max print sizes for this placement. Choose the matching size in the size menu.</p></div><button className="size-popup-close" aria-label="Close recommended sizes" onClick={() => setSizeGuidePlacement(null)}>×</button></div><div className="size-recommendations">{(sizeOptions[sizeGuidePlacement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <div key={option} className="size-recommendation"><strong>{option.split(' · ')[0]}</strong><span>{option.includes(' · ') ? option.split(' · ')[1] : option}</span></div>)}</div><button className="size-popup-done" onClick={() => setSizeGuidePlacement(null)}>Continue</button></section></div>}
        {inspectDesign && <DesignInspector design={inspectDesign} onClose={() => setInspectId(null)} onApply={(previewUrl) => applyInspectedDesign(inspectDesign.id, previewUrl)} />}
        {sheetPreviewOpen && sheetPreviewUrl && (
          <SheetPreviewModal
            url={sheetPreviewUrl}
            sheetLabel={sheet.label}
            sheetLengthIn={billedLength}
            totalTransfers={totalTransfers}
            saving={saving}
            onClose={() => setSheetPreviewOpen(false)}
            onConfirm={() => void buildAndStore()}
            cutBoxes={cutBoxes}
            cutMarks={cutMarks}
            printHeightIn={printHeight}
            cutOut={cutOut}
            audience="shop"
            layoutPieces={layoutPieces}
            onResizePiece={resizePiece}
            onTurnPiece={turnPiece}
            onResetPiece={resetPiece}
            adjustFocusKey={adjustFocusKey}
            refreshing={previewRefreshing}
          />
        )}
      </section>

      <aside className="order-panel panel">
        <div id="step-5" className="order-title">
          <span className="guide-num">5</span>
          <div>
            <h2>Check out your gang sheet</h2>
            <p className="order-hint">Look at the preview, then confirm to download the print file.</p>
          </div>
        </div>
        <button
          type="button"
          className={`precut-button ${cutOut ? 'selected' : ''}`}
          aria-pressed={cutOut}
          onClick={() => setCutOut((value) => !value)}
        >
          <span className="precut-button-title">
            <Scissors size={18} />
            Pre-cut DTFs
            {cutOut ? <em>On</em> : null}
          </span>
          <small>We cut each transfer out for you. Rate drops as quantity goes up.</small>
        </button>
        {cutOut && (
          <div className="precut-rates">
            <table>
              <thead>
                <tr><th>Transfers</th><th>Cutting fee</th></tr>
              </thead>
              <tbody>
                <tr className={totalTransfers >= 1 && totalTransfers <= 24 ? 'current' : ''}><td>1–24</td><td>$0.50 each</td></tr>
                <tr className={totalTransfers >= 25 && totalTransfers <= 99 ? 'current' : ''}><td>25–99</td><td>$0.25 each</td></tr>
                <tr className={totalTransfers >= 100 && totalTransfers <= 249 ? 'current' : ''}><td>100–249</td><td>$0.20 each</td></tr>
                <tr className={totalTransfers >= 250 && totalTransfers <= 499 ? 'current' : ''}><td>250–499</td><td>$0.15 each</td></tr>
                <tr className={totalTransfers >= 500 ? 'current' : ''}><td>500+</td><td>$0.10 each</td></tr>
              </tbody>
            </table>
          </div>
        )}
        {cutTooTall && (
          <p className="save-error">A design is taller than {MARK_SECTION_IN} in with its cut box, so the cutter cannot finish it in one pass. Shorten it or turn Pre-cut DTFs off.</p>
        )}
        {rotateSaveMessage && (
          <p className="rotate-save-note" aria-live="polite">{rotateSaveMessage}</p>
        )}
        <div className="metrics">
          <Metric label="Designs" value={designs.length} icon={<ImageIcon size={24} />} />
          <Metric label="Total Transfers" value={totalTransfers} icon={<Shirt size={25} />} />
          <Metric label="Recommended Gang Sheet" value={sheet.label} icon={<Maximize2 size={21} />} green />
          <div className="estimated-price">
            <Metric label="Estimated Price" value={`$${total}`} icon={<Sparkles size={22} />} green />
            <span className="tax-estimate">Estimated tax (11%): ${(Number(total) * 0.11).toFixed(2)}</span>
          </div>
          <div className="price-breakdown">
            <strong>{sheetName} · {sheetCount === 1 ? '1 of 1' : `1 of ${sheetCount}`}</strong>
            <span>{sheet.breakdown}</span>
            {cutOut && totalTransfers > 0 && (
              <span>Pre-cut: {totalTransfers} × ${cutRate.toFixed(2)} = ${cutFee.toFixed(2)}</span>
            )}
            {sheetCount > 1 && <div className="sheet-part-names">{Array.from({ length: sheetCount }, (_, index) => <span key={index}>{sheetName} · {index + 1} of {sheetCount}</span>)}</div>}
          </div>
        </div>
        <div className="preview-heading"><strong>Gang sheet</strong></div>
        {sheetFillMessage && (
          <p className="sheet-fill-readout" aria-live="polite">
            {sheetFillMessage}
            <span className="sheet-fill-bar" aria-hidden="true">
              <span style={{ width: `${fillPercent}%` }} />
            </span>
          </p>
        )}
        <div className="sheet-preview">
          <span className="dimension horizontal">22 in</span>
          {sheetPreviewUrl ? (
            <button type="button" className="sheet-final-preview-button" onClick={() => setSheetPreviewOpen(true)}>
              <span className="sheet-final-preview-wrap">
                <img className="sheet-final-preview" src={sheetPreviewUrl} alt="Gang sheet preview" />
                {cutOut && (
                  <CutBoxOverlay
                    boxes={cutBoxes}
                    marks={cutMarks}
                    sheetWidthIn={SHEET_WIDTH_IN}
                    sheetHeightIn={printHeight}
                  />
                )}
              </span>
            </button>
          ) : (
            <div className="mini-sheet preview-placeholder">{previewPieces.length ? '' : <div className="preview-empty">Add designs</div>}</div>
          )}
          <span className="dimension vertical">{billedLength} in</span>
          <button className="build-button" disabled={previewBusy || saving || designs.length === 0 || !customerName.trim()} onClick={() => void previewGangSheet()}>
            <Eye size={18} /> {previewBusy ? 'Building preview…' : 'Preview Gang Sheet'}
          </button>
          {previewing && sheetPreviewUrl && (
            <button className="confirm-button" disabled={saving} onClick={() => void buildAndStore()}>
              <Check size={18} /> {saving ? (cutOut ? 'Saving to Drive…' : 'Building…') : 'Confirm & Build Gang Sheet'}
            </button>
          )}
          {saveError && <p className="save-error">{saveError}</p>}
        </div>
        {built && (
          <div className="built-card">
            <div className="built-title"><span><Check size={21} /></span><strong>Your gang sheet is built.</strong></div>
            <p>{sheet.label} · {totalTransfers} transfers · Ready to review</p>
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
