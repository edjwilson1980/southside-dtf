import { SHEET_WIDTH_IN, piecePrintSize } from '@/lib/compose-sheet'
import { cutPlt } from '@/lib/cut-layout'
import {
  createCustomerDriveFolder,
  downloadDriveFileBytes,
  uploadBufferToFolder,
  uploadCutterFileToFolder,
  upsertTextFileInFolder,
} from '@/lib/google-drive'
import { parsePrintWidthInches } from '@/lib/image-utils'
import { nextRevision } from '@/lib/project/conflict'
import { projectDriveAppProperties } from '@/lib/project/driveTags'
import { projectJsonFileName } from '@/lib/project/file-name'
import { coercePlacementAndSize } from '@/lib/project/restore'
import { signProjectJsonContent } from '@/lib/project/sign'
import { PROJECT_FORMAT, type ProjectImageRef, type SspProject } from '@/lib/project/types'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { MAX_SHEET_LENGTH_IN, paginateGangSheet, partLabel, type SheetPage } from '@/lib/sheet-pages'
import { placements, recommendedSize, sizeOptions } from '@/lib/shop-sizes'
import { BUILDER_VERSION } from '@/lib/version'
import { composeGangSheetNode } from './compose-sheet-node'
import { trimArt } from './trim-node'

/** The shop's clock, for job stamps (servers run on UTC). */
export const SHOP_TIME_ZONE = 'America/Chicago'

export class IngestError extends Error {}

type Design = {
  key: string
  name: string
  placement: string
  size: string
  customWidth: string
  customHeight: string
  quantity: number
  keepUpright: boolean
  art: { png: Buffer; width: number; height: number }
  sizeIn: { w: number; h: number }
}

export type IngestSheet = {
  id: string
  url: string
  name: string
  /** Ladder tier this sheet is billed at (≤ 200). */
  lengthIn: number
  ppi: number
  widthPx: number
  heightPx: number
}

export type IngestCut = { id: string; url: string; name: string } | null

export type IngestResult = {
  folderId: string
  folderUrl: string
  /** Sheet 1 — kept so callers that expect one sheet keep working. */
  sheet: IngestSheet
  cut: IngestCut
  /**
   * Every sheet of the job ("1 of 3", "2 of 3"…). Jobs longer than 200 in are
   * split onto separate sheets, each its own print file, cut file and billed line.
   */
  sheets: Array<{ sheetIndex: string; sheet: IngestSheet; cut: IngestCut; transfers: number; price: number }>
  sheetCount: number
  /** Sum of per-sheet tiers (500 in → 200 + 200 + 100). */
  billedLengthIn: number
  /** e.g. "2 × 200 in + 100 in". */
  breakdown: string
  projectFileId: string | null
  projectFileUrl: string | null
  transfers: number
}

/** Same rule as the shop's sheetPxPerIn(14000, 150): 150 ppi, less for very long sheets. */
export function sheetPpi(printHeightIn: number, maxEdgePx = 14000, preferred = 150) {
  return Math.max(24, Math.min(preferred, Math.floor(maxEdgePx / Math.max(printHeightIn, SHEET_WIDTH_IN))))
}

async function artBytes(image: ProjectImageRef): Promise<Buffer | null> {
  if (image.dataUrl?.startsWith('data:')) return Buffer.from(image.dataUrl.slice(image.dataUrl.indexOf(',') + 1), 'base64')
  for (const id of [image.processed?.driveFileId, image.driveFileId, image.original?.driveFileId]) {
    if (!id) continue
    try {
      return (await downloadDriveFileBytes(id)).bytes
    } catch {
      // try the next copy
    }
  }
  return null
}

/** Rows → editable designs, exactly as Reopen Project does (coerce sizes, trim art). */
export async function designsFromProject(project: SspProject): Promise<Design[]> {
  const images = project.images ?? []
  if (!images.length) throw new IngestError('The project has no designs.')
  const out: Design[] = []
  for (const [index, image] of images.entries()) {
    const bytes = await artBytes(image)
    if (!bytes) throw new IngestError(`Design ${index + 1} (${image.name || 'unnamed'}) has no artwork.`)
    const art = await trimArt(bytes)
    const coerced = coercePlacementAndSize(image, { placements, sizeOptions, recommendedSize })
    const printed = piecePrintSize({
      ...coerced,
      pixelWidth: art.width,
      pixelHeight: art.height,
      widthIn: parsePrintWidthInches(coerced.size, coerced.placement, coerced.customWidth),
    })
    out.push({
      key: `art-${index}`,
      name: image.name || image.fileName || `Design ${index + 1}`,
      ...coerced,
      quantity: Math.max(1, image.quantity || 1),
      keepUpright: Boolean(image.keepUpright),
      art: { png: art.png, width: art.width, height: art.height },
      sizeIn: { w: printed.widthIn, h: printed.heightIn },
    })
  }
  return out
}

type PieceInput = { previewUrl: string; widthIn: number; heightIn: number; allowRotate: boolean }
export type IngestPage = SheetPage<PieceInput>

/**
 * The shop's layout, step for step (lib/sheet-pages.ts): pack onto as many
 * 200 in sheets as the job needs, each its own print file and billed line.
 */
export function layoutSheets(designs: Design[], cutOut: boolean) {
  const pieceInputs: PieceInput[] = designs.flatMap((d) =>
    Array.from({ length: d.quantity }, () => ({ previewUrl: d.key, widthIn: d.sizeIn.w, heightIn: d.sizeIn.h, allowRotate: !d.keepUpright })),
  )
  const pagination = paginateGangSheet(pieceInputs, { cutOut })
  if (pagination.tooLarge.length) {
    throw new IngestError(`${pagination.tooLarge.length} design(s) are too large for a ${SHEET_WIDTH_IN} × ${MAX_SHEET_LENGTH_IN} in sheet.`)
  }
  if (pagination.pages.length === 0) throw new IngestError('The project has no designs to place.')
  return pagination
}

/** Sheet 1 in the shape older callers expect, plus the full set of pages. */
export function layoutSheet(designs: Design[], cutOut: boolean) {
  const pagination = layoutSheets(designs, cutOut)
  const first = pagination.pages[0]
  return {
    pieces: first.layout.pieces,
    printHeight: first.printHeight,
    billedLength: first.billedLength,
    marks: first.marks,
    startArrow: first.startArrow,
    transfers: first.transfers,
    pages: pagination.pages,
    sheetCount: pagination.sheetCount,
    totalBilledLength: pagination.billedLength,
    breakdown: pagination.breakdown,
  }
}

/** Server Confirm & Build: project → print PNG (+ PLT) → new Drive job folder + signed project JSON. */
export async function ingestProject(project: SspProject, options: { stamp?: string; now?: Date } = {}): Promise<IngestResult> {
  if (project?.format !== PROJECT_FORMAT) throw new IngestError('Not a South Side gang sheet project.')
  const customerName = (project.customer?.name || project.name || '').trim()
  if (!customerName) throw new IngestError('The project has no customer name.')
  const cutOut = Boolean(project.cut?.enabled)

  const designs = await designsFromProject(project)
  const pagination = layoutSheets(designs, cutOut)
  const sheetCount = pagination.sheetCount
  const stamp = options.stamp || sheetStamp(options.now ?? new Date(), SHOP_TIME_ZONE)
  const art = new Map(designs.map((d) => [d.key, d.art]))

  const folder = await createCustomerDriveFolder(customerName, stamp)

  // One PNG (+ one PLT) per sheet, labelled "N of M" on the film and in the name.
  const sheets: IngestResult['sheets'] = []
  for (const page of pagination.pages) {
    const part = { index: page.index, count: sheetCount }
    const ppi = sheetPpi(page.printHeight)
    const label = sheetJobName(customerName, page.billedLength, stamp, part)
    const fileName = sheetFileName(customerName, page.billedLength, stamp, part)
    const png = await composeGangSheetNode({
      pieces: page.layout.pieces,
      art,
      sheetLengthIn: page.printHeight,
      pxPerIn: ppi,
      label,
      mapCmyk: true,
      marks: page.marks,
      startArrow: page.startArrow,
    })
    const sheetFile = await uploadBufferToFolder(folder.folderId, fileName, png, 'image/png')

    let cut: IngestCut = null
    if (cutOut) {
      const plt = cutPlt(page.layout.pieces, page.printHeight)
      if (!plt) throw new IngestError(`Could not build the cutter PLT for sheet ${partLabel(page.index, sheetCount)}.`)
      const cutName = sheetCutFileName(customerName, page.billedLength, stamp, part)
      const file = await uploadCutterFileToFolder(folder.folderId, cutName, plt, 'text/plain')
      cut = { id: file.id, url: file.webViewLink, name: cutName }
    }

    sheets.push({
      sheetIndex: partLabel(page.index, sheetCount),
      sheet: {
        id: sheetFile.id,
        url: sheetFile.webViewLink,
        name: fileName,
        lengthIn: page.billedLength,
        ppi,
        widthPx: Math.round(SHEET_WIDTH_IN * ppi),
        heightPx: Math.round(page.printHeight * ppi),
      },
      cut,
      transfers: page.transfers,
      price: page.price,
    })
  }

  // Each design's trimmed art next to the sheet, so Reopen Project can load it.
  const images: ProjectImageRef[] = []
  for (const [index, d] of designs.entries()) {
    const artName = `art-${index + 1}-${d.name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 40) || `design-${index + 1}`}.png`
    let driveFileId: string | undefined
    try {
      driveFileId = (await uploadBufferToFolder(folder.folderId, artName, d.art.png, 'image/png')).id
    } catch {
      driveFileId = undefined
    }
    const source = project.images?.[index] ?? {}
    const { dataUrl: _drop, ...rest } = source
    images.push({
      ...rest,
      name: d.name,
      fileName: artName,
      placement: d.placement,
      size: d.size,
      customWidth: d.customWidth,
      customHeight: d.customHeight,
      quantity: d.quantity,
      keepUpright: d.keepUpright,
      pixelWidth: d.art.width,
      pixelHeight: d.art.height,
      sizeIn: d.sizeIn,
      ...(driveFileId
        ? {
            driveFileId,
            original: { driveFileId, pxW: d.art.width, pxH: d.art.height },
            processed: { driveFileId, pxW: d.art.width, pxH: d.art.height },
          }
        : {}),
    })
  }

  const now = (options.now ?? new Date()).toISOString()
  const doc: SspProject = {
    ...project,
    updatedAt: now,
    lastUploadAt: now,
    revision: nextRevision(project.revision),
    product: {
      ...(project.product ?? {}),
      widthIn: SHEET_WIDTH_IN,
      rollWidthIn: SHEET_WIDTH_IN,
      heightIn: pagination.billedLength,
      sheetCount,
      sheets: sheets.map((item) => ({
        sheetIndex: item.sheetIndex,
        billedLengthIn: item.sheet.lengthIn,
        printFileName: item.sheet.name,
        cutFileName: item.cut?.name,
        transfers: item.transfers,
      })),
    },
    images,
    // Keep where it came from (e.g. the Mockup Pro order number).
    orderRefs: project.orderRefs ?? [],
    codeVersion: { ...(project.codeVersion ?? {}), builder: BUILDER_VERSION },
  }
  delete (doc as { sig?: string }).sig
  const orderRef = (project.orderRefs?.[0] ?? {}) as { orderNumber?: string }
  let projectFileId: string | null = null
  let projectFileUrl: string | null = null
  try {
    const written = await upsertTextFileInFolder(
      folder.folderId,
      projectJsonFileName(doc.name),
      signProjectJsonContent(JSON.stringify(doc, null, 2)),
      'application/json',
      projectDriveAppProperties({ projectId: doc.projectId, source: doc.source, customer: doc.customer, updatedAt: now, orderId: orderRef.orderNumber ?? null }),
    )
    projectFileId = written.id ?? null
    projectFileUrl = written.webViewLink ?? null
  } catch {
    // The sheet is what matters; the project JSON is a convenience for reopening.
  }

  return {
    folderId: folder.folderId,
    folderUrl: folder.folderUrl,
    sheet: sheets[0].sheet,
    cut: sheets[0].cut,
    sheets,
    sheetCount,
    billedLengthIn: pagination.billedLength,
    breakdown: pagination.breakdown,
    projectFileId,
    projectFileUrl,
    transfers: sheets.reduce((sum, item) => sum + item.transfers, 0),
  }
}
