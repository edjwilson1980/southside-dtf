'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/** Parent store origin allowed for postMessage (WordPress / WooCommerce). */
export const DEFAULT_STORE_ORIGIN = 'https://southsidedtf.com'

/**
 * One sheet of a multi-sheet job. Jobs longer than 200 in are packed onto
 * separate sheets ("1 of 3", "2 of 3"…), each with its own print file, its own
 * cut file and its own cart line billed on the ladder.
 */
export type GangSheetCartSheet = {
  /** Actual printed film length for this sheet. */
  sheetHeightIn: number
  /** Ladder tier this sheet is billed at (≤ 200). */
  billableHeightIn: number
  /** Google Drive link for this sheet's print PNG. */
  fileUrl: string
  driveFileId?: string
  fileName: string
  printFileName?: string
  /** "2 of 3" */
  sheetIndex: string
  transfers: number
  /** Pre-cut fee charged on this sheet (the job total is split across sheets). */
  precutTotal: number
  /** Drive link for this sheet's cutter PLT, when pre-cut is on. */
  cutFileUrl?: string
  cutFileName?: string
  /** Uploaded-file sheets: per-file source size and scaling (override the job-level values). */
  sourceWidthIn?: number
  sourceHeightIn?: number
  scaleFactor?: number
  effectiveDpi?: number
  dpiSource?: 'file' | 'assumed' | 'customer'
}

export type GangSheetCartPayload = {
  customerName: string
  sheetWidthIn: number
  /** Actual printed film length (includes pre-cut spacing when on). */
  sheetHeightIn: number
  /** Length priced / variation-matched as if pre-cut were off. */
  billableHeightIn: number
  quantity: number
  designs: number
  transfers: number
  precut: boolean
  precutTotal: number
  /**
   * Layout/build fee ($5 ≤100 in, $10 ≥101 in). Only for sheetType `intake`
   * (done-for-you). Self-serve builder must send 0 / omit.
   */
  buildFee?: number
  fileName: string
  /** Google Drive link — required. File bytes never go through WordPress. */
  fileUrl: string
  driveFileId?: string
  sheetIndex: string
  /** Builder-packed sheet vs customer-uploaded file. */
  sheetType?: 'built' | 'uploaded' | 'intake'
  /**
   * Film type. `uv-dtf` routes the line to the UV DTF sticker product in
   * WooCommerce (plugin 1.23+). Omit / `dtf` for standard transfers.
   */
  printType?: 'dtf' | 'uv-dtf'
  /** UV DTF only — spec A7 Cut / No Cut for the whole job (fixed 2.5 mm Square Cut). */
  cutEnabled?: boolean
  cutMm?: number
  sourceWidthIn?: number
  sourceHeightIn?: number
  scaleFactor?: number
  effectiveDpi?: number
  dpiSource?: 'file' | 'assumed' | 'customer'
  jobStamp?: string
  printFileName?: string
  /**
   * Multi-sheet jobs (plugin 1.24+): one cart line per entry, each billed on
   * its own tier. The top-level fields describe sheet 1 so older plugins still
   * add at least that line. Sent in a single request because the store page
   * redirects to the cart on the first successful add.
   */
  sheets?: GangSheetCartSheet[]
}

export type StoreBridgeStatus = 'idle' | 'sending' | 'error' | 'sent'

export type AddToCartResult =
  | { ok: true; cartUrl?: string }
  | { ok: false; error: string }

type CartResultMessage = {
  source: 'southside-gangsheet'
  type: 'add-to-cart-result'
  requestId: string
  ok: boolean
  cartUrl?: string
  error?: string
}

function storeOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_STORE_ORIGIN?.trim()
  return (fromEnv || DEFAULT_STORE_ORIGIN).replace(/\/$/, '')
}

function storeOrigins(): string[] {
  const primary = storeOrigin()
  const origins = new Set<string>([primary])
  try {
    const url = new URL(primary)
    if (url.hostname.startsWith('www.')) {
      origins.add(`${url.protocol}//${url.hostname.slice(4)}`)
    } else {
      origins.add(`${url.protocol}//www.${url.hostname}`)
    }
  } catch {
    // keep primary only
  }
  return [...origins]
}

function isAllowedStoreOrigin(origin: string) {
  return storeOrigins().includes(origin)
}

function inIframe() {
  try {
    return typeof window !== 'undefined' && window.self !== window.top
  } catch {
    return true
  }
}

function isDriveFileUrl(url: string) {
  try {
    const host = new URL(url).hostname
    return host === 'drive.google.com' || host.endsWith('.google.com')
  } catch {
    return false
  }
}

/**
 * Bridge between the embedded builder iframe and the southsidedtf.com store page.
 * Only small JSON crosses to WordPress — the artwork must already be on Google Drive.
 */
export function useStoreBridge() {
  const origin = useMemo(() => storeOrigin(), [])
  const [embedded, setEmbedded] = useState(false)
  const [status, setStatus] = useState<StoreBridgeStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEmbedded(inIframe())
  }, [])

  const reportHeight = useCallback(
    (root?: Element | null) => {
      if (typeof window === 'undefined' || !inIframe()) return
      const height = Math.max(
        root instanceof HTMLElement ? root.scrollHeight : 0,
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      )
      window.parent.postMessage(
        { source: 'southside-gangsheet', type: 'resize', height },
        '*',
      )
    },
    [origin],
  )

  const addToCart = useCallback(
    async (payload: GangSheetCartPayload): Promise<AddToCartResult> => {
      if (typeof window === 'undefined') {
        return { ok: false, error: 'Cart bridge is only available in the browser.' }
      }
      if (!inIframe()) {
        return { ok: false, error: 'Add to Cart is only available inside the store page.' }
      }
      if (!payload.fileUrl || !isDriveFileUrl(payload.fileUrl)) {
        return { ok: false, error: 'Missing Google Drive file link for this sheet.' }
      }

      setStatus('sending')
      setError(null)

      const requestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `ssgs-${Date.now()}`

      return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', onMessage)
          const message = 'Timed out waiting for the store to add this sheet to the cart.'
          setStatus('error')
          setError(message)
          resolve({ ok: false, error: message })
        }, 120_000)

        function onMessage(event: MessageEvent) {
          if (!isAllowedStoreOrigin(event.origin)) return
          const data = event.data as CartResultMessage | null
          if (!data || data.source !== 'southside-gangsheet' || data.type !== 'add-to-cart-result') return
          if (data.requestId !== requestId) return
          window.clearTimeout(timeout)
          window.removeEventListener('message', onMessage)
          if (data.ok) {
            setStatus('sent')
            setError(null)
            resolve({ ok: true, cartUrl: data.cartUrl })
            return
          }
          const message = data.error || 'Could not add this sheet to the cart.'
          setStatus('error')
          setError(message)
          resolve({ ok: false, error: message })
        }

        window.addEventListener('message', onMessage)
        window.parent.postMessage(
          {
            source: 'southside-gangsheet',
            type: 'add-to-cart',
            requestId,
            payload,
            fileName: payload.fileName,
          },
          '*',
        )
      })
    },
    [origin],
  )

  return { embedded, addToCart, status, error, reportHeight, storeOrigin: origin }
}

export function slugify(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'customer'
}
