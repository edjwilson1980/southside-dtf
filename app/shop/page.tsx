'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Baby, Check, Copy, Eye, FileImage, Image as ImageIcon, Maximize2,
  Minus, Plus, Replace, RotateCw, Ruler, Scissors, Shirt, Sparkles, Trash2, Upload,
} from 'lucide-react'
import { DesignInspector } from '@/components/design-inspector'
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
import { uploadJobToGoogleDrive } from '@/lib/upload-to-drive'
import { DESIGN_ACCEPT, DESIGN_ACCEPT_LABEL, isAcceptedDesignFile } from '@/lib/accepted-uploads'
import { prepareEditableUpload } from '@/lib/rasterize-upload'
import { ShopTopBar } from '@/components/shop-top-bar'
import { saveProjectWithArt } from '@/lib/project/auto-save'
import { restoreDesignsFromProject } from '@/lib/project/restore'
import type { ProjectSource, SspProject } from '@/lib/project/types'
import { placements, recommendedSize, sizeOptions } from '@/lib/shop-sizes'

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
  /** Set when Drive art is missing — staff should replace this design's artwork. */
  needsReupload?: boolean
}
const sizeGuideUrl = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/DTF%20size%20chart%20%20front2-SIpj1XrVDRyRDtQhaACxzNHj5geNxv.png'
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
  const [sizeGuidePlacement, setSizeGuidePlacement] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [inspectId, setInspectId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null)
  const [projectSaving, setProjectSaving] = useState(false)
  const [sheetPreviewUrls, setSheetPreviewUrls] = useState<string[]>([])
  const [previewPage, setPreviewPage] = useState(0)
  const sheetPreviewUrl = sheetPreviewUrls[previewPage] ?? sheetPreviewUrls[0] ?? null
  const [previewing, setPreviewing] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false)
  const [jobStamp, setJobStamp] = useState('')
  const [cutOut, setCutOut] = useState(false)
  const [projectId, setProjectId] = useState<string | undefined>(undefined)
  const [projectRevision, setProjectRevision] = useState<number | undefined>(undefined)
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | undefined>(undefined)
  const [projectSource, setProjectSource] = useState<ProjectSource>('shop-builder')
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const previewGen = useRef(0)
  /** After Reopen Project, build the gang-sheet preview once designs are ready. */
  const pendingAutoPreview = useRef(false)
  /**
   * Customer the current project id / folder belong to. A project is one customer's
   * job — when staff type a different name, the next save must start a new project
   * instead of writing into the previous customer's folder under their id.
   */
  const projectOwner = useRef<string | null>(null)

  function ownerKey(name: string) {
    return name.trim().toLowerCase()
  }

  useEffect(() => {
    if (projectOwner.current === null) return
    if (ownerKey(customerName) === projectOwner.current) return
    projectOwner.current = null
    setProjectId(undefined)
    setProjectRevision(undefined)
    setProjectCreatedAt(undefined)
    setProjectSource('shop-builder')
    setDriveFolderId(null)
    setDriveFolderUrl(null)
    setProjectStatus(null)
  }, [customerName])

  async function loadProject(project: SspProject, meta?: { folderId?: string; fileId?: string }) {
    const ownerName = project.customer?.name || project.name || ''
    projectOwner.current = ownerKey(ownerName)
    if (ownerName) setCustomerName(ownerName)
    if (typeof project.cut?.enabled === 'boolean') setCutOut(Boolean(project.cut.enabled))
    setProjectId(project.projectId)
    setProjectRevision(project.revision)
    setProjectCreatedAt(project.createdAt)
    setProjectSource(project.source || 'shop-builder')
    if (meta?.folderId) {
      setDriveFolderId(meta.folderId)
      setDriveFolderUrl(`https://drive.google.com/drive/folders/${meta.folderId}`)
    }
    setProjectStatus('Loading project art…')
    setSaveError(null)
    const { designs: nextDesigns, missingArtCount } = await restoreDesignsFromProject(project.images, {
      placements,
      sizeOptions,
      recommendedSize,
    })
    setDesigns((current) => {
      for (const design of current) {
        revokeUnusedUrls([design.originalUrl, design.previewUrl], nextDesigns)
      }
      return nextDesigns
    })
    setBuilt(false)
    setPreviewing(false)
    const label = project.name || project.customer?.name || project.projectId
    if (missingArtCount > 0) {
      setProjectStatus(
        `Reopened “${label}” — ${missingArtCount} design${missingArtCount === 1 ? '' : 's'} need re-upload`,
      )
      setSaveError(
        `${missingArtCount} design${missingArtCount === 1 ? '' : 's'} could not load artwork from Drive. Use Replace on those rows, then Preview again.`,
      )
      pendingAutoPreview.current = nextDesigns.some((design) => design.previewUrl)
    } else {
      setProjectStatus(`Reopened “${label}” ✓`)
      pendingAutoPreview.current = nextDesigns.length > 0
    }
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
  /**
   * Pack onto as many 200 in sheets as the job needs. Every sheet is its own
   * print file, cut file, and billed line (200 + 200 + 100 for 500 in of art).
   */
  const pagination = paginateGangSheet(pieceInputs, { cutOut })
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
    design.id, design.quantity, design.size, design.placement, design.keepUpright,
    design.customWidth, design.customHeight, design.previewUrl,
    design.pixelWidth, design.pixelHeight,
  ].join(':')).join('|') + `|cut:${cutOut ? '1' : '0'}`
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

  useEffect(() => {
    if (!pendingAutoPreview.current) return
    if (!customerName.trim() || designs.length === 0 || previewBusy || saving) return
    if (!designs.some((design) => design.previewUrl)) {
      pendingAutoPreview.current = false
      return
    }
    pendingAutoPreview.current = false
    void previewGangSheet()
    // previewGangSheet closes over latest layout; run once designs settle after reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, customerName, designs.length])

  type PiecePage = SheetPage<(typeof pieceInputs)[number]>

  function sheetPxPerIn(page: PiecePage, maxEdge: number, preferred: number) {
    return Math.max(24, Math.min(preferred, Math.floor(maxEdge / Math.max(page.printHeight, SHEET_WIDTH_IN))))
  }

  async function composeSheetPage(page: PiecePage, pxPerIn: number, label: string, mapCmyk = false) {
    if (page.layout.pieces.length === 0) throw new Error('Add a design before previewing the gang sheet.')
    return composeGangSheet({
      pieces: page.layout.pieces,
      sheetLengthIn: page.printHeight,
      pxPerIn,
      label,
      mapCmyk,
      marks: cutOut ? page.marks : [],
      startArrow: cutOut ? page.startArrow : [],
    })
  }

  /** Label printed on the sheet: `Customer 10/17 1530 (200) 2 of 3`. */
  function pageJobName(page: PiecePage, stamp: string) {
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

  function designArtInputs() {
    return designs.map((design) => {
      const printSize = getDesignSize(design)
      return {
        id: design.id,
        name: design.name,
        previewUrl: design.previewUrl,
        originalUrl: design.originalUrl,
        placement: design.placement,
        size: design.size,
        customWidth: design.customWidth,
        customHeight: design.customHeight,
        quantity: design.quantity,
        keepUpright: design.keepUpright,
        pixelWidth: design.pixelWidth,
        pixelHeight: design.pixelHeight,
        sizeIn: { w: printSize.widthIn, h: printSize.heightIn },
      }
    })
  }

  /**
   * Write `{Customer}.ssp.json` to Drive. Creates the job folder when none exists
   * yet (Save Project before a build). Never throws — reports via status/error.
   */
  async function saveProjectJsonToDrive(options: {
    folderId?: string
    fromUpload: boolean
    heightIn: number
  }): Promise<boolean> {
    const name = customerName.trim()
    try {
      const saved = await saveProjectWithArt({
        folderId: options.folderId || driveFolderId || undefined,
        createFolder: options.folderId || driveFolderId ? undefined : { customerName: name, stamp: sheetStamp() },
        source: projectSource === 'customer-site' ? 'customer-site' : 'shop-builder',
        projectId,
        revision: projectRevision,
        createdAt: projectCreatedAt,
        name,
        customer: { name },
        product: {
          printType: 'dtf',
          rollWidthIn: SHEET_WIDTH_IN,
          widthIn: SHEET_WIDTH_IN,
          heightIn: options.heightIn,
          sheetCount,
          sheets: pages.map((page) => ({
            sheetIndex: partLabel(page.index, sheetCount),
            billedLengthIn: page.billedLength,
            transfers: page.transfers,
          })),
        },
        cut: { enabled: cutOut },
        designs: designArtInputs(),
        fromUpload: options.fromUpload,
      })
      projectOwner.current = ownerKey(name)
      setProjectId(saved.projectId)
      setProjectRevision(saved.revision)
      setProjectCreatedAt(saved.payload.createdAt)
      setDriveFolderId(saved.folderId)
      setDriveFolderUrl(saved.folderUrl)
      const when = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      setProjectStatus(`Saved ${saved.fileName} · ${when} ✓`)
      if (saved.artError) {
        setSaveError(`Project JSON saved, but design art did not upload: ${saved.artError}`)
      }
      return true
    } catch (err) {
      setProjectStatus('Not saved')
      setSaveError(
        err instanceof Error
          ? `Project JSON could not be written to Drive: ${err.message}`
          : 'Project JSON could not be written to Drive.',
      )
      return false
    }
  }

  async function saveProjectNow() {
    if (!customerName.trim() || projectSaving) return
    setProjectSaving(true)
    setSaveError(null)
    setProjectStatus('Saving project…')
    try {
      await saveProjectJsonToDrive({ fromUpload: false, heightIn: billedLength })
    } finally {
      setProjectSaving(false)
    }
  }

  async function buildAndStore() {
    if (!customerName.trim() || designs.length === 0 || saving || !previewing) return
    setSaving(true)
    setSaveError(null)
    setDriveFolderUrl(null)
    setProjectStatus(null)
    try {
      if (pages.length === 0) throw new Error('Add a design before building the gang sheet.')
      if (tooLargeCount > 0) {
        throw new Error(`${tooLargeCount} design${tooLargeCount === 1 ? ' is' : 's are'} too large for a ${SHEET_WIDTH_IN} × 200 in sheet.`)
      }
      const stamp = jobStamp || sheetStamp()
      const who = customerName.trim()

      // One PNG (+ one PLT) per sheet, each labelled "N of M" on the film and in
      // its file name so the press and the cutter PC stay matched.
      const printFiles: Array<{ name: string; mimeType: string; blob: Blob }> = []
      const pltFiles: Array<{ name: string; content: string }> = []
      for (const page of pages) {
        const part = { index: page.index, count: sheetCount }
        const fileName = sheetFileName(who, page.billedLength, stamp, part)
        const png = await composeSheetPage(page, sheetPxPerIn(page, 14000, 150), pageJobName(page, stamp), true)
        if (printFiles.length > 0) await wait(200)
        downloadBlob(png, fileName)
        printFiles.push({ name: fileName, mimeType: 'image/png', blob: png })

        if (cutOut) {
          const plt = cutPlt(page.layout.pieces, page.printHeight)
          if (!plt) throw new Error(`Could not build the cutter PLT for sheet ${partLabel(page.index, sheetCount)}.`)
          const cutName = sheetCutFileName(who, page.billedLength, stamp, part)
          // Shop still downloads PLT locally for the cutter PC.
          await wait(200)
          downloadBlob(new Blob([plt], { type: 'text/plain' }), cutName)
          pltFiles.push({ name: cutName, content: plt })
        }
      }

      /** SPEC E2: every shop project gets a Drive folder + project.ssp.json. */
      const [firstPlt, ...otherPlts] = pltFiles
      const drive = await uploadJobToGoogleDrive({
        customerName: who,
        stamp,
        files: [
          ...printFiles,
          ...otherPlts.map((file) => ({
            name: file.name,
            mimeType: 'text/plain',
            blob: new Blob([file.content], { type: 'text/plain' }),
          })),
        ],
        cutterFile: firstPlt ? { name: firstPlt.name, content: firstPlt.content, mimeType: 'text/plain' } : undefined,
      })
      setDriveFolderUrl(drive.folderUrl)
      setDriveFolderId(drive.folderId)

      await saveProjectJsonToDrive({ folderId: drive.folderId, fromUpload: true, heightIn: billedLength })

      setBuilt(true)
      setSheetPreviewOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not build the gang sheet.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="builder-shell">
    <ShopTopBar
      onOpenProject={(project, meta) => void loadProject(project, meta)}
      onSaveProject={() => void saveProjectNow()}
      saveDisabled={!customerName.trim() || projectSaving || saving}
      saving={projectSaving}
    />
    {projectStatus && <p className="project-status-banner" aria-live="polite">{projectStatus}</p>}
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
        <div className="design-list">{designs.map((design) => <div className="design-row" key={design.id}><div className="drag-handle">⋮<br />⋮</div><button type="button" className={`thumb ${design.previewUrl ? 'has-art' : design.color}`} disabled={!design.previewUrl} onClick={() => design.previewUrl && setInspectId(design.id)} aria-label={`Inspect ${design.name}`}>{design.previewUrl ? <img src={design.previewUrl} alt="" /> : <><ImageIcon size={24} /><small>{design.needsReupload ? 'RE-UPLOAD' : 'ARTWORK'}</small></>}<span className="thumb-status">{design.needsReupload ? 'Replace artwork' : 'Click to inspect'}</span></button><div className="design-name"><strong>{design.name}</strong>{design.needsReupload ? <span className="quality-warn">Re-upload this image</span> : (() => { const dpi = printDpi(design.pixelWidth, getDesignWidth(design)); const quality = qualityFromDpi(dpi); return <span className={quality.tone === 'good' ? 'quality' : quality.tone === 'poor' ? 'quality-warn' : 'transparent'}>{quality.tone === 'good' ? <Check size={13} /> : null}{dpi ? `${dpi} DPI · ${quality.label}` : 'Click art to check quality'}</span> })()}{design.enhanced && <span className="quality">Upscaled</span>}<button type="button" className="compare-link" disabled={!design.previewUrl} onClick={() => setInspectId(design.id)}>View large · Upscale</button></div><label className="object-type">What are you printing?<select aria-label={`What are you printing for ${design.name}`} value={design.placement} onChange={(e) => { const nextPlacement = e.target.value; updateDesign(design.id, { placement: nextPlacement, size: nextPlacement === 'Custom' ? '0 × 0 in' : (sizeOptions[nextPlacement as keyof typeof sizeOptions] ?? sizeOptions.default)[0], customWidth: nextPlacement === 'Custom' ? '' : design.customWidth, customHeight: nextPlacement === 'Custom' ? '' : design.customHeight }) }}>{placements.map((option) => <option key={option}>{option}</option>)}</select></label>{design.placement === 'Custom' ? <div className="custom-dimensions"><span>Custom image size (max {SHEET_WIDTH_IN} in wide × 199 in high)</span><div><label>Width (in)<input aria-label={`Custom width for ${design.name}`} type="number" min="0.25" max={SHEET_WIDTH_IN} step="0.25" placeholder="Width" value={design.customWidth} onChange={(e) => { const width = Math.min(SHEET_WIDTH_IN, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(width); updateDesign(design.id, { customWidth: value, size: `${value || '0'} × ${design.customHeight || '0'} in` }) }} /></label><label>Height (in)<input aria-label={`Custom height for ${design.name}`} type="number" min="0.25" max="199" step="0.25" placeholder="Height" value={design.customHeight} onChange={(e) => { const height = Math.min(199, Math.max(0, Number(e.target.value) || 0)); const value = e.target.value === '' ? '' : String(height); updateDesign(design.id, { customHeight: value, size: `${design.customWidth || '0'} × ${value || '0'} in` }) }} /></label></div></div> : <label>Size<select aria-label={`Print size for ${design.name}`} value={design.size} onChange={(e) => updateDesign(design.id, { size: e.target.value })}>{(sizeOptions[design.placement as keyof typeof sizeOptions] ?? sizeOptions.default).map((option) => <option key={option}>{option}</option>)}</select></label>}<label>Quantity<div className="number-input"><button aria-label="Decrease design quantity" onClick={() => updateDesign(design.id, { quantity: Math.max(1, design.quantity - 1) })}><Minus size={13} /></button><input aria-label={`Quantity for ${design.name}`} type="number" min="1" step="1" value={design.quantity} onChange={(event) => updateDesign(design.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /><button aria-label="Increase design quantity" onClick={() => updateDesign(design.id, { quantity: design.quantity + 1 })}><Plus size={13} /></button></div></label><div className="design-actions-stack"><button type="button" className="row-action" title="Replace artwork" aria-label={`Replace artwork for ${design.name}`} onClick={() => startReplace(design.id)}><Replace size={15} /></button><button type="button" className="row-action" title="Duplicate this design" aria-label={`Duplicate ${design.name}`} onClick={() => setDuplicateTargetId(design.id)}><Copy size={15} /></button><button type="button" className={`row-action${design.keepUpright ? " upright" : ""}`} aria-pressed={design.keepUpright} title={design.keepUpright ? "Keep this design upright" : "Allow turning to fit more across"} aria-label={design.keepUpright ? `Keep ${design.name} upright` : `Allow turning ${design.name}`} onClick={() => updateDesign(design.id, { keepUpright: !design.keepUpright })}><RotateCw size={15} /></button><button type="button" className="row-action danger" title="Remove design" aria-label={`Remove ${design.name}`} onClick={() => removeDesign(design.id)}><Trash2 size={15} /></button></div></div>)}</div>
        <div className="design-footer-actions"><button className="add-design" disabled={!customerName.trim()} onClick={() => { if (customerName.trim()) inputRef.current?.click() }}><Plus size={20} /> Add Another Design</button><button className="duplicate-design" disabled={designs.length === 0} onClick={duplicateLatestDesign}><Copy size={18} /> Duplicate Design</button></div>
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
            onConfirm={() => void buildAndStore()}
            cutBoxes={cutBoxes}
            cutMarks={cutMarks}
            printHeightIn={printHeight}
            cutOut={cutOut}
            audience="shop"
            layoutPieces={layoutPieces}
            pageIndex={activePage?.index ?? 0}
            pageCount={sheetCount}
            onPageChange={setPreviewPage}
            confirmLabel={sheetCount > 1 ? `Confirm & Build ${sheetCount} Gang Sheets` : undefined}
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
            {cutOut && totalTransfers > 0 && (
              <span>Pre-cut: {totalTransfers} × ${cutRate.toFixed(2)} = ${cutFee.toFixed(2)}</span>
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
          <span className="dimension vertical">{pageBilledLength} in</span>
          <button className="build-button" disabled={previewBusy || saving || designs.length === 0 || !customerName.trim()} onClick={() => void previewGangSheet()}>
            <Eye size={18} /> {previewBusy ? 'Building preview…' : sheetCount > 1 ? `Preview ${sheetCount} Gang Sheets` : 'Preview Gang Sheet'}
          </button>
          {previewing && sheetPreviewUrl && (
            <button className="confirm-button" disabled={saving} onClick={() => void buildAndStore()}>
              <Check size={18} /> {saving ? (cutOut ? 'Saving to Drive…' : 'Building…') : sheetCount > 1 ? `Confirm & Build ${sheetCount} Gang Sheets` : 'Confirm & Build Gang Sheet'}
            </button>
          )}
          {saveError && <p className="save-error">{saveError}</p>}
        </div>
        {built && (
          <div className="built-card">
            <div className="built-title"><span><Check size={21} /></span><strong>Your gang sheet is built.</strong></div>
            <p>{sheet.label} · {totalTransfers} transfers · {sheetCount > 1 ? `${sheetCount} print files${cutOut ? ` + ${sheetCount} cut files` : ''} downloaded` : 'Ready to review'}</p>
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
