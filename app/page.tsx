'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Baby, Check, Copy, Eye, FileImage, Image as ImageIcon, Maximize2,
  Minus, Plus, Ruler, Scissors, Shirt, Sparkles, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
import { PrecutOfferModal } from '@/components/precut-offer-modal'
import { SheetPreviewModal } from '@/components/sheet-preview-modal'
import { composeGangSheet, packSheetBestGutter, pieceHeightInches, ART_INSET_IN, CUT_ART_START_IN, SHEET_WIDTH_IN } from '@/lib/compose-sheet'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { CUT_GUTTER_IN, CUT_MARGIN_IN, MARK_CLEARANCE_IN, MARK_SECTION_IN, cutPlt, cutPreviewBoxes, registrationMarkBounds, registrationMarkRects, startMarkArrowPoints } from '@/lib/cut-layout'
import { trimEmptySpace } from '@/lib/crop-image'
import { parsePrintWidthInches, printDpi, qualityFromDpi, readImageSize } from '@/lib/image-utils'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { isEmbedSearchParam } from '@/lib/embed'
import { slugify, useStoreBridge, type GangSheetCartPayload } from '@/lib/ssgs-cart-bridge'

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
  { id: 'step-1', number: 1, title: 'Your name', detail: 'Enter your name so we can label your sheet.' },
  { id: 'step-2', number: 2, title: 'Upload your design', detail: 'Drop or click to add artwork.' },
  { id: 'step-3', number: 3, title: 'What are you printing?', detail: 'Pick the shirt, hoodie, hat, or custom size.' },
  { id: 'step-4', number: 4, title: 'Set sizes and edit', detail: 'Choose the print size, quantity, and fix the art if needed.' },
  { id: 'step-5', number: 5, title: 'Review & order', detail: 'Check the layout, then add it to your cart.' },
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
  return (
    <Suspense fallback={<main className="builder-shell"><p className="sublead">Loading builder…</p></main>}>
      <HomeBuilder />
    </Suspense>
  )
}

function HomeBuilder() {
  const searchParams = useSearchParams()
  const embedParam = isEmbedSearchParam(searchParams.get('embed'))
  const { embedded, addToCart, status: cartStatus, error: cartError, reportHeight } = useStoreBridge()
  const embed = embedParam || embedded
  const shellRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [designs, setDesigns] = useState<Design[]>([])
  const [placement, setPlacement] = useState('Adult Shirt')
  const [dragging, setDragging] = useState(false)
  const [built, setBuilt] = useState(false)
  const [duplicateTargetId, setDuplicateTargetId] = useState<number | null>(null)
  const [sizeGuidePlacement, setSizeGuidePlacement] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [inspectId, setInspectId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false)
  const [jobStamp, setJobStamp] = useState('')
  const [cutOut, setCutOut] = useState(false)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)
  const [precutOfferOpen, setPrecutOfferOpen] = useState(false)
  const [precutOfferDeclinedFor, setPrecutOfferDeclinedFor] = useState<string | null>(null)
  const [pendingCartAfterCut, setPendingCartAfterCut] = useState(false)
  const previewGen = useRef(0)
  const precutCartKickoff = useRef(false)

  useEffect(() => {
    if (!embed) return
    const post = () => reportHeight(shellRef.current)
    post()
    const root = shellRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => post())
    observer.observe(root)
    window.addEventListener('load', post)
    return () => {
      observer.disconnect()
      window.removeEventListener('load', post)
    }
  }, [embed, reportHeight, designs.length, cutOut, built, previewing, sheetPreviewOpen, saveError, cartStatus])

  function addFiles(list: FileList | File[]) {
    if (!customerName.trim()) return
    const accepted = Array.from(list).filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf')
    const additions = accepted.map((file, index) => {
      const originalUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      return {
        id: Date.now() + index,
        designNumber: 0,
        name: file.name,
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
        pixelWidth: 0,
        pixelHeight: 0,
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
  const getDesignWidth = (design: Design) => parsePrintWidthInches(design.size, design.placement, design.customWidth)
  const getDesignHeight = (design: Design) => pieceHeightInches({
    placement: design.placement,
    size: design.size,
    customHeight: design.customHeight,
    pixelWidth: design.pixelWidth,
    pixelHeight: design.pixelHeight,
    widthIn: getDesignWidth(design),
  })
  const pieceInputs = previewPieces.map((design) => ({
    previewUrl: design.previewUrl,
    widthIn: getDesignWidth(design),
    heightIn: getDesignHeight(design),
  }))
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
  const layoutKey = designs.map((design) => [
    design.id, design.quantity, design.size, design.placement,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|') + `|cut:${cutOut ? '1' : '0'}`
  const designFingerprint = designs.map((design) => [
    design.id, design.quantity, design.size, design.placement,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|')
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
  const offeredCutFee = totalTransfers > 0 ? cutRate * totalTransfers : 0
  const cutFee = cutOut && totalTransfers > 0 ? offeredCutFee : 0
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
    setDriveFolderUrl(null)
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

  async function addSheetToStoreCart() {
    if (!customerName.trim() || designs.length === 0 || saving || cartStatus === 'sending') return
    setSaving(true)
    setSaveError(null)
    setDriveFolderUrl(null)
    try {
      const stamp = jobStamp || sheetStamp()
      const label = sheetJobName(customerName.trim(), billedLength, stamp)
      const printName = sheetFileName(customerName.trim(), billedLength, stamp)
      const cartFileName = `${slugify(customerName.trim())}-gangsheet.png`
      const png = await composeCurrentSheet(sheetPxPerIn(14000, 150), label, true)

      // Always upload to Drive before cart — fail closed if we get no Drive file link.
      let cutterFile: { name: string; content: string; mimeType: string } | undefined
      if (cutOut) {
        const pltText = cutPlt(sheetLayout.pieces, printHeight)
        if (!pltText) throw new Error('Could not build the cutter PLT for this sheet.')
        cutterFile = {
          name: sheetCutFileName(customerName.trim(), billedLength, stamp),
          content: pltText,
          mimeType: 'text/plain',
        }
      }

      const drive = await uploadJobToGoogleDrive({
        customerName: customerName.trim(),
        stamp,
        files: [{ name: printName, mimeType: 'image/png', blob: png }],
        cutterFile,
      })
      setDriveFolderUrl(drive.folderUrl)

      const driveLink =
        drive.webViewLink ??
        drive.fileUrl ??
        (drive.fileId ? `https://drive.google.com/file/d/${drive.fileId}/view` : null)

      if (!driveLink) {
        throw new Error('Could not save your sheet to our print queue. Please try again.')
      }

      // One print-ready export covers the full packed sheet; sheetCount is the roll billing split.
      for (let index = 0; index < sheetCount; index += 1) {
        const payload: GangSheetCartPayload = {
          customerName: customerName.trim(),
          sheetWidthIn: SHEET_WIDTH_IN,
          sheetHeightIn: printedHeightIn,
          billableHeightIn,
          quantity: 1,
          designs: designs.length,
          transfers: totalTransfers,
          precut: cutOut,
          precutTotal: cutFee,
          fileName: sheetCount > 1 ? cartFileName.replace(/\.png$/i, `-${index + 1}.png`) : cartFileName,
          fileUrl: driveLink,
          sheetIndex: `${index + 1} of ${sheetCount}`,
        }
        const result = await addToCart(png, payload)
        if (!result.ok) throw new Error(result.error)
      }

      setBuilt(true)
      setSheetPreviewOpen(false)
      setPrecutOfferOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add this sheet to the cart.')
      setPendingCartAfterCut(false)
      setPrecutOfferOpen(false)
    } finally {
      setSaving(false)
    }
  }

  function requestAddToCart() {
    if (!customerName.trim() || designs.length === 0 || saving || cartStatus === 'sending' || pendingCartAfterCut) return
    if (!cutOut && offeredCutFee > 0 && precutOfferDeclinedFor !== designFingerprint) {
      setPrecutOfferOpen(true)
      return
    }
    void addSheetToStoreCart()
  }

  function acceptPrecutOffer() {
    if (saving || cartStatus === 'sending' || pendingCartAfterCut) return
    setCutOut(true)
    setPendingCartAfterCut(true)
  }

  function declinePrecutOffer() {
    if (saving || cartStatus === 'sending' || pendingCartAfterCut) return
    setPrecutOfferDeclinedFor(designFingerprint)
    setPrecutOfferOpen(false)
    void addSheetToStoreCart()
  }

  function cancelPrecutOffer() {
    if (saving || cartStatus === 'sending' || pendingCartAfterCut) return
    setPrecutOfferOpen(false)
  }

  useEffect(() => {
    if (!pendingCartAfterCut || !cutOut || saving || cartStatus === 'sending') return
    if (precutCartKickoff.current) return
    precutCartKickoff.current = true
    setPendingCartAfterCut(false)
    void addSheetToStoreCart().finally(() => {
      precutCartKickoff.current = false
    })
    // Wait for cutOut layout (layoutKey) before composing the print file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCartAfterCut, cutOut, layoutKey])

  return <main ref={shellRef} className={`builder-shell${embed ? ' embed-mode' : ''}`}>
    {embed ? (
      <div className="embed-bar">
        <strong>Build your gang sheet</strong>
        <a href="/" target="_blank" rel="noreferrer">Open full page</a>
      </div>
    ) : (
      <div className="builder-topbar">
        <img src={logoUrl} alt="South Side DTF" className="brand-logo" />
        <div className="title-block">
          <h1>Build My Gangsheet</h1>
          <p className="lead">No gang sheet experience needed.</p>
          <p className="sublead">Follow the numbered steps. We pack and size your designs for South Side DTF.</p>
        </div>
      </div>
    )}
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
          <GuideHeading number={1} title="Your name" hint="Enter your name before you upload anything. We use it to label your sheet." />
          <label className="customer-name-field workspace-customer-name">Your name <span className="required-field">Required</span><input required type="text" maxLength={80} placeholder="Enter your name before uploading" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
        </div>
        <div id="step-2" className="guide-block">
          <GuideHeading number={2} title="Upload your design" hint="Drop a PNG or JPG here, or click to choose a file from your computer." />
        </div>
        <button className={`dropzone ${dragging ? 'dragging' : ''} ${!customerName.trim() ? 'customer-required-disabled' : ''}`} aria-disabled={!customerName.trim()} title={!customerName.trim() ? 'Enter a customer name first' : undefined} onClick={() => { if (customerName.trim()) inputRef.current?.click() }} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}><Upload size={48} strokeWidth={1.7} /><strong>Drop your artwork here</strong><span>PNG · JPG · JPEG</span><small>Click a design to blow it up, check quality, and upscale it</small></button>
        <input ref={inputRef} className="sr-only" type="file" multiple accept="image/png,image/jpeg,application/pdf" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
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
        <div className="design-list">{designs.map((design) => <div className="design-row" key={design.id}><div className="drag-handle">⋮<br />⋮</div><button type="button" className={`thumb ${design.previewUrl ? 'has-art' : design.color}`} disabled={!design.previewUrl} onClick={() => design.previewUrl && setInspectId(design.id)} aria-label={`Inspect ${design.name}`}>{design.previewUrl ? <img src={design.previewUrl} alt="" /> : <><ImageIcon size={24} /><small>ARTWORK</small></>}<span className="thumb-status">Click to inspect</span></button><div className="design-name"><strong>{design.name}</strong>{(() => { const dpi = printDpi(design.pixelWidth, getDesignWidth(design)); const quality = qualityFromDpi(dpi); return <span className={quality.tone === 'good' ? 'quality' : quality.tone === 'poor' ? 'quality-warn' : 'transparent'}>{quality.tone === 'good' ? <Check size={13} /> : null}{dpi ? `${dpi} DPI · ${quality.label}` : 'Click art to check quality'}</span> })()}{design.enhanced && <span className="quality">Upscaled</span>}<button type="button" className="compare-link" disabled={!design.previewUrl} onClick={() => setInspectId(design.id)}>View large · Upscale</button></div><label className="object-type">What are you printing?<select aria-label={`What are you printing for ${design.name}`} value={design.placement} onChange={(e) => { const nextPlacement = e.target.value; updateDesign(design.id, { placement: nextPlacement, size: nextPlacement === 'Custom' ? '0 × 0 in' : (sizeOptions[nextPlacement as keyof typeof sizeOptions] ?? sizeOptions.default)[0], customWidth: nextPlacement === 'Custom' ? '' : design.customWidth, customHeight: nextPlacement === 'Custom' ? '' : design.customHeight }) }}>{placements.map((option) => <option key={option}>{option}</option>)}</select></label>{design.placement === 'Custom' ? <div className="custom-dimensions"><span>Custom image size (max {SHEET_WIDTH_IN} in wide × 199 in high)</span><div><label>Width (in)<input aria-label={`Custom width for ${design.name}`} type="number" min="0.25" max={SHEET_WIDTH_IN} step="0.25" placeholder="Width" value={design.customWidth} onChange={(e) => { const width = Math.min(SHEET_WIDTH_IN, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(width); updateDesign(design.id, { customWidth: value, size: `${value || '0'} × ${design.customHeight || '0'} in` }) }} /></label><label>Height (in)<input aria-label={`Custom height for ${design.name}`} type="number" min="0.25" max="199" step="0.25" placeholder="Height" value={design.customHeight} onChange={(e) => { const height = Math.min(199, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(height); updateDesign(design.id, { customHeight: value, size: `${design.customWidth || '0'} × ${value || '0'} in` }) }} /></label></div></div> : <label>Size<select aria-label={`Print size for ${design.name}`} value={design.size} onChange={(e) => updateDesign(design.id, { size: e.target.value })}>{(sizeOptions[design.placement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <option key={option}>{option}</option>)}</select></label>}<label>Quantity<div className="number-input"><button aria-label="Decrease design quantity" onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}><Minus size={13} /></button><input aria-label={`Quantity for ${design.name}`} type="number" min="1" step="1" value={design.quantity} onChange={(event) => updateDesign(design.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /><button aria-label="Increase design quantity" onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}><Plus size={13} /></button></div></label><button className="delete-button" aria-label={`Remove ${design.name}`} onClick={() => removeDesign(design.id)}><Trash2 size={17} /></button></div>)}</div>
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
            onConfirm={() => requestAddToCart()}
            cutBoxes={cutBoxes}
            cutMarks={cutMarks}
            printHeightIn={printHeight}
            cutOut={cutOut}
            audience="customer"
          />
        )}
        <PrecutOfferModal
          open={precutOfferOpen}
          transfers={totalTransfers}
          rateEach={cutRate}
          precutTotal={offeredCutFee}
          sheetPrice={sheet.price}
          busy={saving || cartStatus === 'sending' || pendingCartAfterCut}
          onAccept={acceptPrecutOffer}
          onDecline={declinePrecutOffer}
          onCancel={cancelPrecutOffer}
        />
      </section>

      <aside className="order-panel panel">
        <div id="step-5" className="order-title">
          <span className="guide-num">5</span>
          <div>
            <h2>Your gang sheet</h2>
            <p className="order-hint">Preview the layout, add pre-cut if you want, then add it to your cart.</p>
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
          <small>Optional: we cut each transfer out for you. Rate drops as quantity goes up.</small>
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
            <button
              type="button"
              className="confirm-button cart-button"
              disabled={saving || cartStatus === 'sending' || designs.length === 0 || !customerName.trim() || pendingCartAfterCut}
              onClick={() => requestAddToCart()}
            >
              <Check size={18} />
              {cartStatus === 'sending' || saving || pendingCartAfterCut ? 'Adding to cart…' : 'Add to Cart'}
            </button>
          )}
          {cartStatus === 'error' && cartError && (
            <p className="save-error">{cartError}</p>
          )}
          {saveError && <p className="save-error">{saveError}</p>}
        </div>
        {built && (
          <div className="built-card">
            <div className="built-title"><span><Check size={21} /></span><strong>Added to your cart.</strong></div>
            <p>{sheet.label} · {totalTransfers} transfers · We will print{cutOut ? ' and cut' : ''} your sheet.</p>
            {driveFolderUrl && (
              <a className="drive-link" href={driveFolderUrl} target="_blank" rel="noreferrer">
                Open your job folder in Google Drive (print PNG + cutter PLT)
              </a>
            )}
            <button onClick={() => { setBuilt(false); setDriveFolderUrl(null) }}>Build another sheet <span>›</span></button>
          </div>
        )}
      </aside>
    </div>

  </main>
}

function Metric({ label, value, icon, green }: { label: string; value: string | number; icon: React.ReactNode; green?: boolean }) { return <div className="metric"><span>{label}</span><strong className={green ? 'green-text' : ''}>{value}</strong><i>{icon}</i></div> }
