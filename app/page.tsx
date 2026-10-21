'use client'

import { DESIGN_ACCEPT, DESIGN_ACCEPT_LABEL, isAcceptedDesignFile } from '@/lib/accepted-uploads'
import { prepareEditableUpload } from '@/lib/rasterize-upload'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Baby, Check, Copy, Eye, FileImage, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Ruler, Scissors, Shirt, Sparkles, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
import { PrecutOfferModal } from '@/components/precut-offer-modal'
import { SheetPreviewModal } from '@/components/sheet-preview-modal'
import { composeGangSheet, piecePrintSize, ART_INSET_IN, SHEET_WIDTH_IN, type PlacedSheetPiece } from '@/lib/compose-sheet'
import { paginateGangSheet, partLabel, type SheetPage } from '@/lib/sheet-pages'
import { type LayoutPiece } from '@/components/sheet-layout-overlay'
import { BUILDER_VERSION } from '@/lib/version'
import { CutBoxOverlay } from '@/components/cut-box-overlay'
import { MARK_SECTION_IN, cutPlt } from '@/lib/cut-layout'
import { trimEmptySpace } from '@/lib/crop-image'
import { parsePrintWidthInches, printDpi, qualityFromDpi, readImageSize } from '@/lib/image-utils'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { isEmbedSearchParam } from '@/lib/embed'
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { autoSaveProjectJson } from '@/lib/project/auto-save'
import { imagesFromUploadedArt, prepareDesignArtUploads, type DesignArtInput } from '@/lib/project/images'
import { slugify, useStoreBridge, type GangSheetCartPayload, type GangSheetCartSheet } from '@/lib/ssgs-cart-bridge'
import { PrintPressPanel, type PrintPressDesignOption } from '@/components/print-press-panel'
import { CartProgressOverlay, type CartProgress } from '@/components/cart-progress-overlay'
import {
  newPrintPressLine,
  pressSheetFileName,
  printPressCartSummary,
  printPressDesignDemand,
  printPressProblem,
  printPressTotals,
  type PrintPressLine,
} from '@/lib/print-press'
import { generatePressSheetPdf, pressSheetThumbFromUrl, type PressSheetSheet } from '@/lib/press-sheet-pdf'
import { generateImageListPdf, imageListFileName, imageListThumbFromUrl, type ImageListImage } from '@/lib/image-list-pdf'

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

function cuttingFeeEach(transferCount: number) {
  if (transferCount <= 0) return 0
  if (transferCount <= 24) return 0.5
  if (transferCount <= 99) return 0.25
  if (transferCount <= 249) return 0.2
  if (transferCount <= 499) return 0.15
  return 0.1
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
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const designListRef = useRef<HTMLDivElement>(null)
  const [designs, setDesigns] = useState<Design[]>([])
  /** Confirmation shown at the dropzone so an upload is never silent. */
  const [addNotice, setAddNotice] = useState<{ count: number; names: string[] } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  /** Stage of the Add to Cart run, shown in a blocking progress card so a long
   *  build or upload never looks frozen. Null when nothing is in flight. */
  const [cartProgress, setCartProgress] = useState<CartProgress | null>(null)
  const [cartStartedAt, setCartStartedAt] = useState(0)
  const [cartAnchorTop, setCartAnchorTop] = useState<number | null>(null)
  const lastPointerY = useRef<number | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)
  const [sheetPreviewUrls, setSheetPreviewUrls] = useState<string[]>([])
  const [previewPage, setPreviewPage] = useState(0)
  const sheetPreviewUrl = sheetPreviewUrls[previewPage] ?? sheetPreviewUrls[0] ?? null
  const [previewing, setPreviewing] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false)
  const [jobStamp, setJobStamp] = useState('')
  const [cutOut, setCutOut] = useState(false)
  /** Print & Press add-on: labor to press the transfers onto the customer's garments. */
  const [ppEnabled, setPpEnabled] = useState(false)
  const [ppNamesOn, setPpNamesOn] = useState(false)
  const [ppLines, setPpLines] = useState<PrintPressLine[]>(() => [newPrintPressLine(1)])
  const [precutOfferOpen, setPrecutOfferOpen] = useState(false)
  const [precutOfferDeclinedFor, setPrecutOfferDeclinedFor] = useState<string | null>(null)
  const [pendingCartAfterCut, setPendingCartAfterCut] = useState(false)
  const previewGen = useRef(0)
  const precutCartKickoff = useRef(false)

  // Where the customer last clicked, in document coordinates — the progress card is
  // placed there because inside the store iframe "centre of the page" can be far
  // below (or above) what they are looking at.
  useEffect(() => {
    const remember = (event: PointerEvent) => {
      lastPointerY.current = event.clientY + window.scrollY
    }
    window.addEventListener('pointerdown', remember, { capture: true, passive: true })
    return () => window.removeEventListener('pointerdown', remember, { capture: true })
  }, [])

  // The "Added — taking you to your cart" card stays up while the store page
  // redirects; if that never happens, let the page back out from under it.
  useEffect(() => {
    if (cartProgress?.step !== 'done') return
    const id = window.setTimeout(() => setCartProgress(null), 8000)
    return () => window.clearTimeout(id)
  }, [cartProgress?.step])

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
  }, [embed, reportHeight, designs.length, cutOut, ppEnabled, ppLines.length, ppNamesOn, built, previewing, sheetPreviewOpen, saveError, cartStatus, addNotice, addError])

  /** Scroll the design list into view. In the store iframe the page itself does not
   *  scroll, so ask the parent to move instead. */
  function revealDesigns() {
    const node = designListRef.current
    if (!node) return
    try {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      node.scrollIntoView()
    }
    if (typeof window === 'undefined') return
    let framed = false
    try {
      framed = window.self !== window.top
    } catch {
      framed = true
    }
    if (!framed) return
    const top = node.getBoundingClientRect().top + window.scrollY
    window.parent.postMessage({ source: 'southside-gangsheet', type: 'scroll-to', top }, '*')
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    if (incoming.length === 0) return
    setAddNotice(null)
    if (!customerName.trim()) {
      setAddError('Enter your name in step 1 first, then drop your artwork here.')
      return
    }
    const accepted = incoming.filter((file) => isAcceptedDesignFile(file))
    const skipped = incoming.length - accepted.length
    if (accepted.length === 0) {
      setAddError(`That file type will not print. Upload a ${DESIGN_ACCEPT_LABEL.replace(/ · /g, ', ')}.`)
      return
    }
    setAddError(
      skipped > 0
        ? `${skipped} file${skipped === 1 ? '' : 's'} skipped — only ${DESIGN_ACCEPT_LABEL} can be printed.`
        : null,
    )

    const prepared = []
    for (const file of accepted) {
      try {
        prepared.push(await prepareEditableUpload(file))
      } catch (err) {
        setAddError(err instanceof Error ? err.message : `Could not read ${file.name}.`)
      }
    }
    if (prepared.length === 0) return

    const additions = prepared.map((item, index) => {
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
        originalUrl: item.editUrl,
        previewUrl: item.editUrl,
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

    setAddNotice({ count: additions.length, names: additions.map((design) => design.name) })
    if (typeof window !== 'undefined') {
      window.setTimeout(() => revealDesigns(), 60)
    }

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
  /**
   * Print & Press decides how many of each design the gang sheet needs: a logo
   * on the front of 50 shirts is 50 transfers. Designs the garment lines use
   * follow that count; anything else keeps the customer's own quantity.
   */
  const ppDemand = printPressDesignDemand(ppEnabled ? ppLines : [])
  const designQuantity = (design: Design) => (ppEnabled ? ppDemand.get(design.id) || design.quantity : design.quantity)
  const ppTotals = printPressTotals(ppLines, ppNamesOn)
  const ppProblem = ppEnabled ? printPressProblem(ppLines, ppNamesOn, designs.map((design) => design.id)) : null
  const ppLabor = ppEnabled ? ppTotals.labor : 0
  // Print & Press always ships pre-cut; the crew's labor price covers the cutting.
  const cutOutActive = cutOut || ppEnabled
  const totalTransfers = designs.reduce((sum, design) => sum + designQuantity(design), 0)
  const previewPieces = designs.flatMap((design) => Array.from({ length: designQuantity(design) }, () => design))
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
    // Rides through the packer so the press sheet can say which sheet each design is on.
    designId: design.id,
  }))
  /**
   * Pack onto as many 200 in sheets as the job needs. Every sheet is its own
   * print file, cut file, and cart line (200 + 200 + 100 for 500 in of art).
   */
  const pagination = paginateGangSheet(pieceInputs, { cutOut: cutOutActive })
  const pages = pagination.pages
  const sheetCount = pagination.sheetCount
  const activePage = pages[Math.min(previewPage, Math.max(0, pages.length - 1))]
  const sheetLayout = activePage?.layout ?? { pieces: [] as PlacedSheetPiece[], rotatedCount: 0 }
  // Full film length of the sheet being shown (leading + trailing insets).
  const printHeight = activePage?.printHeight ?? ART_INSET_IN * 2
  const cutMarks = activePage?.markBounds ?? []
  const billedLength = pagination.billedLength
  const pageBilledLength = activePage?.billedLength ?? sheetOptions[0].length
  const cutBoxes = activePage?.cutBoxes ?? []
  const cutTooTall = pages.some((page) => page.cutTooTall)
  const tooLargeCount = pagination.tooLarge.length
  const layoutPieces: LayoutPiece[] = sheetLayout.pieces.map((piece) => ({
    xIn: piece.xIn,
    yIn: piece.yIn,
    widthIn: piece.widthIn,
    heightIn: piece.heightIn,
  }))
  const rotatedCount = pagination.rotatedCount
  const filmSavedIn = pagination.filmSavedIn
  const rotateSaveMessage =
    rotatedCount > 0 && filmSavedIn > 0.05
      ? `Turned ${rotatedCount} design${rotatedCount === 1 ? '' : 's'} a quarter turn to fit more across — saves ${filmSavedIn.toFixed(1)} in of film.`
      : null
  const layoutKey = designs.map((design) => [
    design.id, designQuantity(design), design.size, design.placement, design.keepUpright,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|') + `|cut:${cutOutActive ? '1' : '0'}`
  const designFingerprint = designs.map((design) => [
    design.id, designQuantity(design), design.size, design.placement,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|')
  const sheet = {
    label:
      sheetCount > 1
        ? `${sheetCount} sheets · ${pagination.breakdown}`
        : (activePage?.label ?? sheetLabel(sheetOptions[0].length)),
    price: pagination.price,
    breakdown: pagination.breakdown,
  }
  // Fill readout describes the last sheet — that is where the next design lands.
  const lastPage = pages[pages.length - 1]
  const chargeableArtIn = Math.max(0, (lastPage?.billableHeightIn ?? 0) - 1.5)
  const lengthLeftIn = Math.max(0, (lastPage?.billedLength ?? 0) - chargeableArtIn)
  const fillPercent = lastPage ? Math.min(100, Math.round((chargeableArtIn / lastPage.billedLength) * 100)) : 0
  const sheetFillMessage =
    designs.length === 0
      ? null
      : lengthLeftIn <= 1
        ? `Sheet${sheetCount > 1 ? ` ${sheetCount}` : ''} is full — more designs will start a new sheet`
        : `${sheetCount > 1 ? `Sheet ${sheetCount} of ${sheetCount}` : 'Sheet'} is ${fillPercent}% full, about ${lengthLeftIn < 10 ? lengthLeftIn.toFixed(1).replace(/\.0$/, '') : Math.round(lengthLeftIn)}in of length left`
  const sheetName = customerName.trim() || 'Gang Sheet'
  const cutRate = cuttingFeeEach(totalTransfers)
  const offeredCutFee = totalTransfers > 0 ? cutRate * totalTransfers : 0
  // With Print & Press the cut is included — the labor line pays for it.
  const cutFee = cutOutActive && !ppEnabled && totalTransfers > 0 ? offeredCutFee : 0
  // Self-serve builder: no layout/build fee. That fee is only for the done-for-you
  // "I Don't Know How to Build a Gangsheet" path (/send).
  const subtotal = sheet.price + cutFee + ppLabor
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
   * Swap the artwork on a design the customer has already set up, keeping its
   * placement, size, quantity and notes. Deleting and re-adding loses all of
   * that, which is what customers were having to do.
   */
  async function replaceDesignArtwork(id: number, file: File) {
    if (!isAcceptedDesignFile(file)) {
      setAddError(`Upload a ${DESIGN_ACCEPT_LABEL.replace(/ · /g, ', ')} file.`)
      return
    }
    setAddError(null)
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
                // New measured size from the replacement file — never reuse the old aspect.
                pixelWidth: prepared.measured.pixelWidth,
                pixelHeight: prepared.measured.pixelHeight,
              }
            : item,
        )
        if (target) revokeUnusedUrls([target.originalUrl, target.previewUrl], next)
        return next
      })
      setAddNotice({ count: 1, names: [prepared.sourceFile.name] })
      if (prepared.editUrl) void trimUploadedDesign(id, prepared.editUrl)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : `Could not read ${file.name}.`)
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
    setPreviewPage(0)
    setSheetPreviewUrls((urls) => {
      for (const url of urls) URL.revokeObjectURL(url)
      return []
    })
  }, [layoutKey, customerName])

  function sheetPxPerIn(page: SheetPage<(typeof pieceInputs)[number]>, maxEdge: number, preferred: number) {
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(page.printHeight, SHEET_WIDTH_IN))))
  }

  async function composeSheetPage(
    page: SheetPage<(typeof pieceInputs)[number]>,
    pxPerIn: number,
    label: string,
    mapCmyk = false,
  ) {
    if (page.layout.pieces.length === 0) throw new Error('Add a design before previewing the gang sheet.')
    return composeGangSheet({
      pieces: page.layout.pieces,
      sheetLengthIn: page.printHeight,
      pxPerIn,
      label,
      mapCmyk,
      marks: cutOutActive ? page.marks : [],
      startArrow: cutOutActive ? page.startArrow : [],
    })
  }

  /** Label printed on the sheet: `Customer 10/17 1530 (200) 2 of 3`. */
  function pageJobName(page: SheetPage<(typeof pieceInputs)[number]>, stamp: string) {
    return sheetJobName(customerName.trim(), page.billedLength, stamp, { index: page.index, count: sheetCount })
  }

  async function previewGangSheet() {
    if (!customerName.trim() || designs.length === 0 || previewBusy || saving) return
    if (pages.length === 0) {
      setSaveError('Add a design before previewing the gang sheet.')
      return
    }
    if (sheetPreviewUrls.length > 0 && previewing) {
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
      for (const page of pages) {
        const blob = await composeSheetPage(page, sheetPxPerIn(page, 3600, 72), pageJobName(page, stamp))
        if (gen !== previewGen.current) {
          for (const url of urls) URL.revokeObjectURL(url)
          return
        }
        urls.push(URL.createObjectURL(blob))
      }
      setSheetPreviewUrls((old) => {
        for (const url of old) URL.revokeObjectURL(url)
        return urls
      })
      setPreviewPage(0)
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
    setUploadProgress(0)
    setDriveFolderUrl(null)
    setCartStartedAt(Date.now())
    setCartAnchorTop(lastPointerY.current)
    setCartProgress({ step: 'compose', fraction: 0 })
    // Let the card paint before the first (heavy, synchronous) canvas compose.
    await new Promise((resolve) => window.setTimeout(resolve, 30))
    try {
      if (pages.length === 0) throw new Error('Add a design before adding the gang sheet to your cart.')
      if (tooLargeCount > 0) {
        throw new Error(`${tooLargeCount} design${tooLargeCount === 1 ? ' is' : 's are'} too large for a ${SHEET_WIDTH_IN} × 200 in sheet. Shrink it to continue.`)
      }
      if (ppProblem) throw new Error(ppProblem)
      const stamp = jobStamp || sheetStamp()
      const who = customerName.trim()
      const cartSlug = slugify(who)
      const designInfo = (id: number) => {
        const design = designs.find((item) => item.id === id)
        return design ? { number: design.designNumber, name: design.name } : undefined
      }
      const ppSummary = ppEnabled ? printPressCartSummary(ppLines, ppNamesOn, designInfo) : undefined

      // One print PNG per sheet, each labelled "N of M" on the film and in its
      // file name, so a 500 in job is three sheets (200 + 200 + 100), not one.
      const sheetFiles: Array<{
        page: SheetPage<(typeof pieceInputs)[number]>
        printName: string
        cutName?: string
        plt?: string
        png: Blob
      }> = []
      for (const page of pages) {
        const part = { index: page.index, count: sheetCount }
        const printName = sheetFileName(who, page.billedLength, stamp, part)
        setCartProgress({
          step: 'compose',
          detail: sheetCount > 1 ? `Sheet ${page.index + 1} of ${sheetCount} · ${page.billedLength} in` : `${SHEET_WIDTH_IN} × ${page.billedLength} in · ${page.transfers} transfers`,
          fraction: page.index / sheetCount,
        })
        await new Promise((resolve) => window.setTimeout(resolve, 0))
        const png = await composeSheetPage(page, sheetPxPerIn(page, 14000, 150), pageJobName(page, stamp), true)
        let plt: string | undefined
        let cutName: string | undefined
        if (cutOutActive) {
          plt = cutPlt(page.layout.pieces, page.printHeight)
          if (!plt) throw new Error(`Could not build the cutter PLT for sheet ${partLabel(page.index, sheetCount)}.`)
          cutName = sheetCutFileName(who, page.billedLength, stamp, part)
        }
        sheetFiles.push({ page, printName, cutName, plt, png })
      }

      // Browser → Google Drive directly (chunked). WordPress only gets the Drive links.
      // The first PLT rides the session; any others go up as small text files.
      const [firstCut, ...otherCuts] = sheetFiles.filter((file) => file.plt)
      const cutterFile = firstCut?.plt && firstCut.cutName
        ? { name: firstCut.cutName, content: firstCut.plt, mimeType: 'text/plain' }
        : undefined
      const extraCutUploads = otherCuts.map((file) => ({
        name: file.cutName as string,
        mimeType: 'text/plain',
        blob: new Blob([file.plt as string], { type: 'text/plain' }),
      }))

      // Each design's art goes up in the same batch as the print PNG. The store page
      // redirects to the cart the moment WooCommerce accepts the line, so anything
      // still in flight after add-to-cart is lost — the art must land before that.
      const artInputs: DesignArtInput[] = designs.map((design) => {
        const printSize = piecePrintSize({
          placement: design.placement,
          size: design.size,
          customWidth: design.customWidth,
          customHeight: design.customHeight,
          pixelWidth: design.pixelWidth,
          pixelHeight: design.pixelHeight,
          widthIn: parsePrintWidthInches(design.size, design.placement, design.customWidth),
        })
        return {
          id: design.id,
          name: design.name,
          previewUrl: design.previewUrl,
          originalUrl: design.originalUrl,
          placement: design.placement,
          size: design.size,
          customWidth: design.customWidth,
          customHeight: design.customHeight,
          quantity: designQuantity(design),
          keepUpright: design.keepUpright,
          pixelWidth: design.pixelWidth,
          pixelHeight: design.pixelHeight,
          sizeIn: { w: printSize.widthIn, h: printSize.heightIn },
        }
      })
      setCartProgress({ step: 'art', detail: `${designs.length} design${designs.length === 1 ? '' : 's'}` })
      const artPlan = await prepareDesignArtUploads(artInputs)

      // Print & Press: the press sheet PDF goes up in the same batch as the sheets
      // and cut files, so the crew's paperwork is in the job folder before checkout.
      const pressSheetSheets: PressSheetSheet[] = sheetFiles.map((file) => {
        const counts = new Map<number, number>()
        for (const piece of file.page.layout.pieces as Array<{ designId?: number }>) {
          if (piece.designId === undefined) continue
          counts.set(piece.designId, (counts.get(piece.designId) ?? 0) + 1)
        }
        return {
          label: partLabel(file.page.index, sheetCount),
          billedLengthIn: file.page.billedLength,
          transfers: file.page.transfers,
          printFileName: file.printName,
          cutFileName: file.cutName,
          pieces: [...counts.entries()]
            .map(([designId, qty]) => {
              const design = designs.find((item) => item.id === designId)
              return { designNumber: design?.designNumber ?? 0, name: design?.name ?? 'Design', qty }
            })
            .sort((a, b) => a.designNumber - b.designNumber),
        }
      })
      // Every job gets an image list: each design's number, picture, printed size
      // and quantity, so a reprint never means reopening the project.
      setCartProgress({ step: 'paperwork', detail: `${designs.length} image${designs.length === 1 ? '' : 's'}` })
      const listImages: ImageListImage[] = []
      for (const [index, design] of designs.entries()) {
        const size = getDesignSize(design)
        const uploadPos = artPlan.indexByUpload.indexOf(index)
        listImages.push({
          number: design.designNumber,
          name: design.name,
          widthIn: Math.round(size.widthIn * 100) / 100,
          heightIn: Math.round(size.heightIn * 100) / 100,
          quantity: designQuantity(design),
          placement: design.placement,
          sizeLabel: design.placement === 'Custom' ? undefined : design.size,
          pixelWidth: design.pixelWidth,
          pixelHeight: design.pixelHeight,
          artFileName: uploadPos >= 0 ? artPlan.uploads[uploadPos]?.name : undefined,
          thumb: await imageListThumbFromUrl(design.previewUrl),
        })
      }
      const imageListUpload = {
        name: imageListFileName(who, stamp),
        mimeType: 'application/pdf',
        blob: await generateImageListPdf({
          customerName: who,
          stamp,
          images: listImages,
          sheets: pressSheetSheets,
          cutOut: cutOutActive,
          printPress: Boolean(ppSummary),
        }),
      }

      let pressSheetUpload: { name: string; mimeType: string; blob: Blob } | undefined
      if (ppSummary) {
        setCartProgress({ step: 'paperwork', detail: `Press sheet · ${ppSummary.garments} garments · ${ppSummary.lines.length} line${ppSummary.lines.length === 1 ? '' : 's'}` })
        const pressDesigns = []
        for (const design of designs) {
          const size = getDesignSize(design)
          pressDesigns.push({
            number: design.designNumber,
            name: design.name,
            widthIn: Math.round(size.widthIn * 100) / 100,
            heightIn: Math.round(size.heightIn * 100) / 100,
            thumb: await pressSheetThumbFromUrl(design.previewUrl),
          })
        }
        const pdf = await generatePressSheetPdf({
          customerName: who,
          stamp,
          summary: ppSummary,
          designs: pressDesigns,
          sheets: pressSheetSheets,
          gangSheetPrice: sheet.price,
        })
        pressSheetUpload = { name: pressSheetFileName(who, stamp), mimeType: 'application/pdf', blob: pdf }
      }

      // Print PNGs stay first, in sheet order — sheet 1's id is the cart's Drive link.
      const driveFiles = [
        ...sheetFiles.map((file) => ({ name: file.printName, mimeType: 'image/png', blob: file.png })),
        ...extraCutUploads,
        imageListUpload,
        ...(pressSheetUpload ? [pressSheetUpload] : []),
        ...artPlan.uploads,
      ]
      const uploadBytes = driveFiles.reduce((sum, file) => sum + file.blob.size, 0)
      const uploadLabel = `${driveFiles.length + (cutterFile ? 1 : 0)} files · ${(uploadBytes / (1024 * 1024)).toFixed(1)} MB`
      setCartProgress({ step: 'upload', detail: `${uploadLabel} · creating your job folder`, fraction: 0 })
      const drive = await uploadJobToGoogleDrive({
        customerName: who,
        stamp,
        files: driveFiles,
        cutterFile,
        onProgress: (fraction) => {
          setUploadProgress(fraction)
          setCartProgress({ step: 'upload', detail: uploadLabel, fraction })
        },
      })
      setDriveFolderUrl(drive.folderUrl)
      setCartProgress({ step: 'record' })

      const uploadedByName = new Map(drive.files.map((file) => [file.name, file]))
      const imageListFile = uploadedByName.get(imageListUpload.name)
      const imageListRecord = imageListFile
        ? { fileName: imageListUpload.name, url: imageListFile.webViewLink, fileId: imageListFile.id }
        : { fileName: imageListUpload.name }
      if (ppSummary && pressSheetUpload) {
        const uploaded = uploadedByName.get(pressSheetUpload.name)
        if (uploaded) {
          ppSummary.pressSheetUrl = uploaded.webViewLink
          ppSummary.pressSheetFileId = uploaded.id
          ppSummary.pressSheetFileName = pressSheetUpload.name
        }
      }
      const cartSheets: GangSheetCartSheet[] = sheetFiles.map((file) => {
        const uploaded = uploadedByName.get(file.printName)
        if (!uploaded) {
          throw new Error(`Could not save sheet ${partLabel(file.page.index, sheetCount)} to our print queue. Please try again.`)
        }
        const cut = file.cutName ? uploadedByName.get(file.cutName) : undefined
        // Pre-cut is billed per transfer, so each sheet carries the fee for its own pieces.
        // Print & Press jobs are cut too, but the labor line covers it — no fee here.
        const sheetPrecut = cutOutActive && !ppEnabled ? Math.round(cutRate * file.page.transfers * 100) / 100 : 0
        return {
          sheetHeightIn: Math.round(file.page.printedHeightIn * 100) / 100,
          billableHeightIn: file.page.billedLength,
          fileUrl: uploaded.webViewLink,
          driveFileId: uploaded.id,
          fileName: sheetCount > 1 ? `${cartSlug}-gangsheet-${file.page.index + 1}-of-${sheetCount}.png` : `${cartSlug}-gangsheet.png`,
          printFileName: file.printName,
          sheetIndex: partLabel(file.page.index, sheetCount),
          transfers: file.page.transfers,
          precutTotal: sheetPrecut,
          cutFileUrl: cut?.webViewLink,
          cutFileName: file.cutName,
        }
      })

      /** SPEC E3: project JSON with design art ids, written before the cart redirect. */
      try {
        await autoSaveProjectJson({
          folderId: drive.folderId,
          source: 'customer-site',
          name: who,
          customer: { name: who },
          product: {
            printType: 'dtf',
            rollWidthIn: SHEET_WIDTH_IN,
            widthIn: SHEET_WIDTH_IN,
            heightIn: billedLength,
            sheetCount,
            sheets: cartSheets.map((item) => ({
              sheetIndex: item.sheetIndex,
              billedLengthIn: item.billableHeightIn,
              printFileName: item.printFileName,
              cutFileName: item.cutFileName,
              transfers: item.transfers,
            })),
            imageList: imageListRecord,
            ...(ppSummary ? { printPress: ppSummary } : {}),
          },
          cut: { enabled: cutOutActive },
          fromUpload: true,
          images: imagesFromUploadedArt(artInputs, artPlan, drive.files),
        })
      } catch (err) {
        // The order still goes through; staff can rebuild from the Drive folder.
        console.error('[project] customer-site project JSON failed', err)
      }

      // One request carries every sheet: the store page redirects to the cart as
      // soon as WooCommerce accepts the first line, so separate requests would be lost.
      const first = cartSheets[0]
      const payload: GangSheetCartPayload = {
        customerName: who,
        sheetWidthIn: SHEET_WIDTH_IN,
        sheetHeightIn: first.sheetHeightIn,
        billableHeightIn: first.billableHeightIn,
        quantity: 1,
        designs: designs.length,
        transfers: first.transfers,
        precut: cutOutActive,
        precutTotal: first.precutTotal,
        buildFee: 0,
        fileName: first.fileName,
        fileUrl: first.fileUrl,
        driveFileId: first.driveFileId,
        sheetIndex: first.sheetIndex,
        sheetType: 'built',
        jobStamp: stamp,
        printFileName: first.printFileName,
        sheets: cartSheets,
        ...(ppSummary ? { printPress: ppSummary } : {}),
      }
      setCartProgress({ step: 'cart', detail: sheetCount > 1 ? `${sheetCount} sheet lines${ppSummary ? ' + Print & Press labor' : ''}` : ppSummary ? 'Sheet + Print & Press labor' : undefined })
      const result = await addToCart(payload)
      if (!result.ok) throw new Error(result.error)

      setBuilt(true)
      setSheetPreviewOpen(false)
      setPrecutOfferOpen(false)
      // Stays up while the store page moves to the cart (cleared by the timer above).
      setCartProgress({ step: 'done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add this sheet to the cart.'
      setSaveError(message)
      setPendingCartAfterCut(false)
      setPrecutOfferOpen(false)
      // The failure shows on the card itself — the preview modal may still be
      // covering the message under the Add to Cart button.
      setCartProgress({ step: 'error', detail: message })
    } finally {
      setSaving(false)
      setUploadProgress(null)
    }
  }

  function requestAddToCart() {
    if (!customerName.trim() || designs.length === 0 || saving || cartStatus === 'sending' || pendingCartAfterCut) return
    if (ppProblem) {
      setSaveError(ppProblem)
      setSheetPreviewOpen(false)
      return
    }
    // Print & Press is already pre-cut (included), so there is nothing to offer.
    if (!cutOutActive && offeredCutFee > 0 && precutOfferDeclinedFor !== designFingerprint) {
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
          <GuideHeading number={2} title="Upload your design" hint="Drop a PNG, JPG, PDF, or SVG here, or click to choose a file from your computer." />
        </div>
        <button className={`dropzone ${dragging ? 'dragging' : ''} ${!customerName.trim() ? 'customer-required-disabled' : ''}`} aria-disabled={!customerName.trim()} title={!customerName.trim() ? 'Enter a customer name first' : undefined} onClick={() => { if (customerName.trim()) inputRef.current?.click() }} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files) }}><Upload size={48} strokeWidth={1.7} /><strong>Drop your artwork here</strong><span>{DESIGN_ACCEPT_LABEL}</span><small>Click a design to blow it up, check quality, and upscale it</small></button>
        <input ref={inputRef} className="sr-only" type="file" multiple accept={DESIGN_ACCEPT} onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} /><input ref={replaceInputRef} className="sr-only" type="file" accept={DESIGN_ACCEPT} onChange={(e) => { const file = e.target.files?.[0]; if (file && replaceTargetId !== null) void replaceDesignArtwork(replaceTargetId, file); setReplaceTargetId(null); e.target.value = '' }} />
        {addError && <p className="upload-notice-error" role="alert">{addError}</p>}
        {addNotice && (
          <div className="upload-notice" role="status" aria-live="polite">
            <span className="upload-notice-icon"><Check size={18} /></span>
            <div className="upload-notice-body">
              <strong>
                {addNotice.count} design{addNotice.count === 1 ? '' : 's'} added — you now have {designs.length}
              </strong>
              <span>{addNotice.names.join(', ')}</span>
            </div>
            <button type="button" className="upload-notice-jump" onClick={() => revealDesigns()}>
              See your designs
            </button>
          </div>
        )}
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
        <div className="design-list" ref={designListRef}>{designs.map((design) => <div className="design-row" key={design.id}><div className="drag-handle">⋮<br />⋮</div><button type="button" className={`thumb ${design.previewUrl ? 'has-art' : design.color}`} disabled={!design.previewUrl} onClick={() => design.previewUrl && setInspectId(design.id)} aria-label={`Inspect ${design.name}`}>{design.previewUrl ? <img src={design.previewUrl} alt="" /> : <><ImageIcon size={24} /><small>ARTWORK</small></>}<span className="thumb-status">Click to inspect</span></button><div className="design-name"><strong>{design.name}</strong>{(() => { const dpi = printDpi(design.pixelWidth, getDesignWidth(design)); const quality = qualityFromDpi(dpi); return <span className={quality.tone === 'good' ? 'quality' : quality.tone === 'poor' ? 'quality-warn' : 'transparent'}>{quality.tone === 'good' ? <Check size={13} /> : null}{dpi ? `${dpi} DPI · ${quality.label}` : 'Click art to check quality'}</span> })()}{design.enhanced && <span className="quality">Upscaled</span>}<button type="button" className="compare-link" disabled={!design.previewUrl} onClick={() => setInspectId(design.id)}>View large · Upscale</button></div><label className="object-type">What are you printing?<select aria-label={`What are you printing for ${design.name}`} value={design.placement} onChange={(e) => { const nextPlacement = e.target.value; updateDesign(design.id, { placement: nextPlacement, size: nextPlacement === 'Custom' ? '0 × 0 in' : (sizeOptions[nextPlacement as keyof typeof sizeOptions] ?? sizeOptions.default)[0], customWidth: nextPlacement === 'Custom' ? '' : design.customWidth, customHeight: nextPlacement === 'Custom' ? '' : design.customHeight }) }}>{placements.map((option) => <option key={option}>{option}</option>)}</select></label>{design.placement === 'Custom' ? <div className="custom-dimensions"><span>Custom image size (max {SHEET_WIDTH_IN} in wide × 199 in high)</span><div><label>Width (in)<input aria-label={`Custom width for ${design.name}`} type="number" min="0.25" max={SHEET_WIDTH_IN} step="0.25" placeholder="Width" value={design.customWidth} onChange={(e) => { const width = Math.min(SHEET_WIDTH_IN, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(width); updateDesign(design.id, { customWidth: value, size: `${value || '0'} × ${design.customHeight || '0'} in` }) }} /></label><label>Height (in)<input aria-label={`Custom height for ${design.name}`} type="number" min="0.25" max="199" step="0.25" placeholder="Height" value={design.customHeight} onChange={(e) => { const height = Math.min(199, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(height); updateDesign(design.id, { customHeight: value, size: `${design.customWidth || '0'} × ${value || '0'} in` }) }} /></label></div></div> : <label>Size<select aria-label={`Print size for ${design.name}`} value={design.size} onChange={(e) => updateDesign(design.id, { size: e.target.value })}>{(sizeOptions[design.placement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <option key={option}>{option}</option>)}</select></label>}{ppEnabled && (ppDemand.get(design.id) ?? 0) > 0 ? <label>Quantity<div className="number-input"><input aria-label={`Quantity for ${design.name} (set by Print & Press)`} type="number" value={designQuantity(design)} readOnly disabled /></div><span className="pp-locked">Set by Print &amp; Press garments</span></label> : <label>Quantity<div className="number-input"><button aria-label="Decrease design quantity" onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}><Minus size={13} /></button><input aria-label={`Quantity for ${design.name}`} type="number" min="1" step="1" value={design.quantity} onChange={(event) => updateDesign(design.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /><button aria-label="Increase design quantity" onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}><Plus size={13} /></button></div></label>}<div className="design-actions-stack"><button type="button" className="row-action" title="Replace artwork" aria-label={`Replace artwork for ${design.name}`} onClick={() => startReplace(design.id)}><Replace size={15} /></button><button type="button" className="row-action" title="Duplicate this design" aria-label={`Duplicate ${design.name}`} onClick={() => setDuplicateTargetId(design.id)}><Copy size={15} /></button><button type="button" className={`row-action${design.keepUpright ? " upright" : ""}`} aria-pressed={design.keepUpright} title={design.keepUpright ? "Keep this design upright" : "Allow turning to fit more across"} aria-label={design.keepUpright ? `Keep ${design.name} upright` : `Allow turning ${design.name}`} onClick={() => updateDesign(design.id, { keepUpright: !design.keepUpright })}><RotateCw size={15} /></button><button type="button" className="row-action danger" title="Remove design" aria-label={`Remove ${design.name}`} onClick={() => removeDesign(design.id)}><Trash2 size={15} /></button></div></div>)}</div>
        <div className="design-footer-actions"><button className="add-design" disabled={!customerName.trim()} onClick={() => { if (customerName.trim()) inputRef.current?.click() }}><Plus size={20} /> Add Another Design</button><button className="duplicate-design" disabled={designs.length === 0} onClick={duplicateLatestDesign}><Copy size={18} /> Duplicate Design</button></div>
        <PrintPressPanel
          enabled={ppEnabled}
          onToggle={(next) => { setPpEnabled(next); setSaveError(null) }}
          namesOn={ppNamesOn}
          onNamesChange={setPpNamesOn}
          lines={ppLines}
          onLinesChange={(update) => setPpLines((lines) => update(lines))}
          designs={designs.map((design): PrintPressDesignOption => {
            const size = getDesignSize(design)
            return {
              id: design.id,
              number: design.designNumber,
              name: design.name,
              previewUrl: design.previewUrl,
              sizeLabel: `${Math.round(size.widthIn * 100) / 100} × ${Math.round(size.heightIn * 100) / 100} in`,
              widthIn: size.widthIn,
            }
          })}
          totals={ppTotals}
          demand={ppDemand}
          problem={ppProblem}
        />
        {duplicateTargetId !== null && <div className="duplicate-picker"><div><strong>What are you printing?</strong><span>Choose the garment or placement for this copy.</span></div><div className="duplicate-picker-options">{placements.map((item) => <button key={item} type="button" onClick={() => duplicateDesign(duplicateTargetId, item)}><PlacementIcon placement={item} /><span>{item}</span></button>)}</div><button className="cancel-duplicate" type="button" onClick={() => setDuplicateTargetId(null)}>Cancel</button></div>}
        {sizeGuidePlacement && <div className="size-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSizeGuidePlacement(null) }}><section className="size-popup" role="dialog" aria-modal="true" aria-labelledby="size-popup-title"><div className="size-popup-header"><div><span className="eyebrow">Recommended sizes</span><h2 id="size-popup-title">{sizeGuidePlacement}</h2><p>These are the max print sizes for this placement. Choose the matching size in the size menu.</p></div><button className="size-popup-close" aria-label="Close recommended sizes" onClick={() => setSizeGuidePlacement(null)}>×</button></div><div className="size-recommendations">{(sizeOptions[sizeGuidePlacement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <div key={option} className="size-recommendation"><strong>{option.split(' · ')[0]}</strong><span>{option.includes(' · ') ? option.split(' · ')[1] : option}</span></div>)}</div><button className="size-popup-done" onClick={() => setSizeGuidePlacement(null)}>Continue</button></section></div>}
        {inspectDesign && <DesignInspector design={inspectDesign} onClose={() => setInspectId(null)} onApply={(previewUrl) => applyInspectedDesign(inspectDesign.id, previewUrl)} />}
        {sheetPreviewOpen && sheetPreviewUrl && (
          <SheetPreviewModal
            url={sheetPreviewUrl}
            sheetLabel={sheetCount > 1 ? `${sheetName} · ${partLabel(activePage?.index ?? 0, sheetCount)} · ${activePage?.label ?? ''}` : sheet.label}
            sheetLengthIn={pageBilledLength}
            totalTransfers={activePage?.transfers ?? totalTransfers}
            saving={saving}
            onClose={() => setSheetPreviewOpen(false)}
            onConfirm={() => requestAddToCart()}
            cutBoxes={cutBoxes}
            cutMarks={cutMarks}
            printHeightIn={printHeight}
            cutOut={cutOutActive}
            audience="customer"
            layoutPieces={layoutPieces}
            pageIndex={activePage?.index ?? 0}
            pageCount={sheetCount}
            onPageChange={setPreviewPage}
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
          className={`precut-button ${cutOutActive ? 'selected' : ''}`}
          aria-pressed={cutOutActive}
          disabled={ppEnabled}
          onClick={() => setCutOut((value) => !value)}
        >
          <span className="precut-button-title">
            <Scissors size={18} />
            Pre-cut DTFs
            {ppEnabled ? <em>Included</em> : cutOut ? <em>On</em> : null}
          </span>
          <small>
            {ppEnabled
              ? 'Included with Print & Press — every transfer is cut out at no extra charge.'
              : 'Optional: we cut each transfer out for you. Rate drops as quantity goes up.'}
          </small>
        </button>
        {cutOut && !ppEnabled && (
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
        {tooLargeCount > 0 && (
          <p className="save-error">{tooLargeCount} design{tooLargeCount === 1 ? ' is' : 's are'} too large for a {SHEET_WIDTH_IN} × 200 in sheet. Shrink {tooLargeCount === 1 ? 'it' : 'them'} to continue.</p>
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
            <strong>{sheetName} · {sheetCount === 1 ? '1 of 1' : `${sheetCount} sheets`}</strong>
            <span>{sheet.breakdown}{sheetCount > 1 ? ` = $${sheet.price.toFixed(2)}` : ''}</span>
            {cutOut && !ppEnabled && totalTransfers > 0 && (
              <span>Pre-cut: {totalTransfers} × ${cutRate.toFixed(2)} = ${cutFee.toFixed(2)}</span>
            )}
            {ppEnabled && (
              <>
                <span className="pp-breakdown-included">Pre-cut: included with Print &amp; Press</span>
                <span>
                  Print &amp; Press: {ppTotals.garments} garments × ${ppTotals.tier.firstSide.toFixed(2)}
                  {ppTotals.doublePress > 0 ? ` + ${ppTotals.doublePress} × $${ppTotals.tier.secondSide.toFixed(2)}` : ''}
                  {ppTotals.personalized > 0 ? ` + ${ppTotals.personalized} names × $0.50` : ''} = ${ppLabor.toFixed(2)}
                </span>
              </>
            )}
            {sheetCount > 1 && (
              <div className="sheet-line-prices">
                {pages.map((page) => (
                  <span key={page.index}>
                    {sheetName} · {partLabel(page.index, sheetCount)} · {page.label} · ${page.price.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
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
          {sheetCount > 1 && (
            <div className="sheet-page-tabs" role="group" aria-label="Sheets">
              {pages.map((page) => (
                <button
                  key={page.index}
                  type="button"
                  className={page.index === (activePage?.index ?? 0) ? 'selected' : ''}
                  onClick={() => setPreviewPage(page.index)}
                >
                  {partLabel(page.index, sheetCount)} · {page.billedLength} in
                </button>
              ))}
            </div>
          )}
          {sheetPreviewUrl ? (
            <button type="button" className="sheet-final-preview-button" onClick={() => setSheetPreviewOpen(true)}>
              <span className="sheet-final-preview-wrap">
                <img className="sheet-final-preview" src={sheetPreviewUrl} alt="Gang sheet preview" />
                {cutOutActive && (
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
          <span className="dimension vertical">{pageBilledLength} in</span>
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
              {cartStatus === 'sending' || saving || pendingCartAfterCut
                ? uploadProgress != null
                  ? `Uploading to Drive… ${Math.round(uploadProgress * 100)}%`
                  : 'Adding to cart…'
                : 'Add to Cart'}
            </button>
          )}
          {uploadProgress != null && (
            <div className="upload-progress" aria-live="polite">
              <div className="upload-progress-bar" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
            </div>
          )}
          {cartStatus === 'error' && cartError && (
            <p className="save-error">{cartError}</p>
          )}
          {saveError && <p className="save-error">{saveError}</p>}
        </div>
        {built && (
          <div className="built-card">
            <div className="built-title"><span><Check size={21} /></span><strong>Added to your cart.</strong></div>
            <p>
              {sheet.label} · {totalTransfers} transfers · We will print{cutOutActive ? ' and cut' : ''}{ppEnabled ? ' and press' : ''} your
              {sheetCount > 1 ? ` ${sheetCount} sheets.` : ' sheet.'}
            </p>
            {driveFolderUrl && (
              <a className="drive-link" href={driveFolderUrl} target="_blank" rel="noreferrer">
                Open your job folder in Google Drive
              </a>
            )}
            <button onClick={() => { setBuilt(false); setDriveFolderUrl(null) }}>Build another sheet <span>›</span></button>
          </div>
        )}
        <p className="builder-version">Builder v{BUILDER_VERSION}</p>
      </aside>
    </div>
    {cartProgress && (
      <CartProgressOverlay
        progress={cartProgress}
        startedAt={cartStartedAt}
        sheetCount={sheetCount}
        cutOut={cutOutActive}
        pressSheet={ppEnabled}
        framed={embed}
        anchorTop={cartAnchorTop}
        onClose={() => setCartProgress(null)}
      />
    )}
  </main>
}

function Metric({ label, value, icon, green }: { label: string; value: string | number; icon: React.ReactNode; green?: boolean }) { return <div className="metric"><span>{label}</span><strong className={green ? 'green-text' : ''}>{value}</strong><i>{icon}</i></div> }
