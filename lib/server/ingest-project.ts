import { ART_INSET_IN, CUT_ART_START_IN, SHEET_WIDTH_IN, packSheetBestGutter, piecePrintSize } from '@/lib/compose-sheet'
import { CUT_GUTTER_IN, MARK_CLEARANCE_IN, cutPlt, registrationMarkBounds, registrationMarkRects, startMarkArrowPoints } from '@/lib/cut-layout'
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
import { billedSheetLength } from '@/lib/sheet-pricing'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
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

export type IngestResult = {
  folderId: string
  folderUrl: string
  sheet: { id: string; url: string; name: string; lengthIn: number; ppi: number; widthPx: number; heightPx: number }
  cut: { id: string; url: string; name: string } | null
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

/** The shop's layout, step for step (app/shop/page.tsx: pieces, packing, lengths, marks). */
export function layoutSheet(designs: Design[], cutOut: boolean) {
  const pieceInputs = designs.flatMap((d) =>
    Array.from({ length: d.quantity }, () => ({ previewUrl: d.key, widthIn: d.sizeIn.w, heightIn: d.sizeIn.h, allowRotate: !d.keepUpright })),
  )
  const billableLayout = packSheetBestGutter(pieceInputs, { packWidthIn: SHEET_WIDTH_IN, startYIn: ART_INSET_IN })
  const sheetLayout = cutOut
    ? packSheetBestGutter(pieceInputs, {
        packWidthIn: SHEET_WIDTH_IN - MARK_CLEARANCE_IN * 2,
        startYIn: CUT_ART_START_IN,
        sideInsetIn: MARK_CLEARANCE_IN,
        minGutterIn: CUT_GUTTER_IN,
      })
    : billableLayout
  if (sheetLayout.unplaced?.length) throw new IngestError(`${sheetLayout.unplaced.length} design(s) are too wide for the sheet.`)
  const billableHeightIn = Math.max(0, billableLayout.contentEndY - ART_INSET_IN)
  const printHeight = cutOut ? sheetLayout.contentEndY + CUT_ART_START_IN : sheetLayout.contentEndY + ART_INSET_IN
  const marks = cutOut ? registrationMarkRects(printHeight, SHEET_WIDTH_IN, sheetLayout.pieces) : []
  const bounds = cutOut ? registrationMarkBounds(printHeight, SHEET_WIDTH_IN, sheetLayout.pieces) : []
  const start = bounds.find((mark) => mark.first)
  return {
    pieces: sheetLayout.pieces,
    printHeight,
    billedLength: billedSheetLength(billableHeightIn),
    marks,
    startArrow: start ? startMarkArrowPoints(start) : [],
    transfers: pieceInputs.length,
  }
}

/** Server Confirm & Build: project → print PNG (+ PLT) → new Drive job folder + signed project JSON. */
export async function ingestProject(project: SspProject, options: { stamp?: string; now?: Date } = {}): Promise<IngestResult> {
  if (project?.format !== PROJECT_FORMAT) throw new IngestError('Not a South Side gang sheet project.')
  const customerName = (project.customer?.name || project.name || '').trim()
  if (!customerName) throw new IngestError('The project has no customer name.')
  const cutOut = Boolean(project.cut?.enabled)

  const designs = await designsFromProject(project)
  const layout = layoutSheet(designs, cutOut)
  const ppi = sheetPpi(layout.printHeight)
  const stamp = options.stamp || sheetStamp(options.now ?? new Date(), SHOP_TIME_ZONE)
  const label = sheetJobName(customerName, layout.billedLength, stamp)
  const fileName = sheetFileName(customerName, layout.billedLength, stamp)

  const png = await composeGangSheetNode({
    pieces: layout.pieces,
    art: new Map(designs.map((d) => [d.key, d.art])),
    sheetLengthIn: layout.printHeight,
    pxPerIn: ppi,
    label,
    mapCmyk: true,
    marks: layout.marks,
    startArrow: layout.startArrow,
  })

  const folder = await createCustomerDriveFolder(customerName, stamp)
  const sheetFile = await uploadBufferToFolder(folder.folderId, fileName, png, 'image/png')

  let cut: IngestResult['cut'] = null
  if (cutOut) {
    const plt = cutPlt(layout.pieces, layout.printHeight)
    if (!plt) throw new IngestError('Could not build the cutter PLT for this sheet.')
    const cutName = sheetCutFileName(customerName, layout.billedLength, stamp)
    const file = await uploadCutterFileToFolder(folder.folderId, cutName, plt, 'text/plain')
    cut = { id: file.id, url: file.webViewLink, name: cutName }
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
    product: { ...(project.product ?? {}), widthIn: SHEET_WIDTH_IN, rollWidthIn: SHEET_WIDTH_IN, heightIn: layout.billedLength },
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

  const heightPx = Math.round(layout.printHeight * ppi)
  return {
    folderId: folder.folderId,
    folderUrl: folder.folderUrl,
    sheet: { id: sheetFile.id, url: sheetFile.webViewLink, name: fileName, lengthIn: layout.billedLength, ppi, widthPx: Math.round(SHEET_WIDTH_IN * ppi), heightPx },
    cut,
    projectFileId,
    projectFileUrl,
    transfers: layout.transfers,
  }
}
