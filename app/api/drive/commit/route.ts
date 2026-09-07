import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import {
  createCustomerDriveFolder,
  isGoogleDriveConfigured,
  uploadBufferToFolder,
  uploadCutterFileToFolder,
} from '@/lib/google-drive'

export const runtime = 'nodejs'
/** Large sheets need room for fetch + resumable PUT. */
export const maxDuration = 60

type CommitSheet = {
  lineItemId?: number
  fileUrl?: string
  customerName?: string
  sheetIndex?: string
  sheetType?: string
  size?: string
  transfers?: string | number
  precut?: string
  jobStamp?: string
  printFileName?: string
  cutterFileName?: string
  cutterContent?: string
}

type CommitBody = {
  orderId?: number | string
  orderNumber?: string
  paidAt?: string
  customer?: { name?: string; email?: string; phone?: string }
  sheets?: CommitSheet[]
}

function secretsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function guessMime(name: string, contentType: string | null) {
  const fromHeader = (contentType || '').split(';')[0]?.trim()
  if (fromHeader && fromHeader !== 'application/octet-stream') return fromHeader
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff'
  if (lower.endsWith('.plt')) return 'text/plain'
  return 'application/octet-stream'
}

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const path = new URL(url).pathname
    const base = path.split('/').pop() || ''
    return decodeURIComponent(base) || fallback
  } catch {
    return fallback
  }
}

export async function POST(req: Request) {
  try {
    const expected = process.env.SSGS_COMMIT_SECRET?.trim()
    if (!expected) {
      return NextResponse.json({ error: 'SSGS_COMMIT_SECRET is not configured.' }, { status: 503 })
    }
    const provided = req.headers.get('x-ssgs-secret')?.trim() || ''
    if (!provided || !secretsMatch(provided, expected)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'Google Drive is not configured.' }, { status: 503 })
    }

    const body = (await req.json()) as CommitBody
    const sheets = Array.isArray(body.sheets) ? body.sheets : []
    if (sheets.length === 0) {
      return NextResponse.json({ error: 'No sheets to commit.' }, { status: 400 })
    }

    const orderNumber = String(body.orderNumber ?? body.orderId ?? '').trim() || 'order'
    const billingName = String(body.customer?.name ?? '').trim()
    const files: Array<{ lineItemId: number; driveUrl: string; folderUrl?: string }> = []

    for (const sheet of sheets) {
      const lineItemId = Number(sheet.lineItemId)
      const fileUrl = String(sheet.fileUrl ?? '').trim()
      if (!Number.isFinite(lineItemId) || lineItemId <= 0 || !fileUrl) {
        throw new Error('Each sheet needs a lineItemId and fileUrl.')
      }

      const customerName =
        String(sheet.customerName ?? '').trim() || billingName || 'Customer'
      const stamp =
        String(sheet.jobStamp ?? '').trim() ||
        `${orderNumber}-${lineItemId}`

      const fetched = await fetch(fileUrl, { redirect: 'follow' })
      if (!fetched.ok) {
        throw new Error(`Could not fetch staged file for line ${lineItemId}: HTTP ${fetched.status}`)
      }
      const buffer = Buffer.from(await fetched.arrayBuffer())
      if (buffer.length < 32) {
        throw new Error(`Staged file for line ${lineItemId} was empty or unreadable.`)
      }

      const fallbackName = `sheet-${lineItemId}.png`
      const printName =
        String(sheet.printFileName ?? '').trim() ||
        fileNameFromUrl(fileUrl, fallbackName)
      const mimeType = guessMime(printName, fetched.headers.get('content-type'))

      const folder = await createCustomerDriveFolder(customerName, stamp)
      const uploaded = await uploadBufferToFolder(folder.folderId, printName, buffer, mimeType)

      const cutterName = String(sheet.cutterFileName ?? '').trim()
      const cutterContent = String(sheet.cutterContent ?? '')
      if (cutterName && cutterContent) {
        await uploadCutterFileToFolder(folder.folderId, cutterName, cutterContent)
      }

      files.push({
        lineItemId,
        driveUrl: uploaded.webViewLink,
        folderUrl: folder.folderUrl,
      })
    }

    return NextResponse.json({ files })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not commit sheets to Google Drive.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
