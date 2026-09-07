'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/** Parent store origin allowed for postMessage (WordPress / WooCommerce). */
export const DEFAULT_STORE_ORIGIN = 'https://southsidedtf.com'

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
  fileName: string
  fileUrl?: string
  sheetIndex: string
  /** Builder-packed sheet vs customer-uploaded file. */
  sheetType?: 'built' | 'uploaded'
  sourceWidthIn?: number
  sourceHeightIn?: number
  scaleFactor?: number
  effectiveDpi?: number
  dpiSource?: 'file' | 'assumed' | 'customer'
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the gang sheet file.'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Bridge between the embedded builder iframe and the southsidedtf.com store page.
 * Cart work is done by the WordPress plugin via postMessage — no cross-origin fetches.
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
    async (blob: Blob, payload: GangSheetCartPayload): Promise<AddToCartResult> => {
      if (typeof window === 'undefined') {
        return { ok: false, error: 'Cart bridge is only available in the browser.' }
      }
      if (!inIframe()) {
        return { ok: false, error: 'Add to Cart is only available inside the store page.' }
      }

      setStatus('sending')
      setError(null)

      const requestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `ssgs-${Date.now()}`

      let fileBase64: string
      try {
        fileBase64 = await blobToBase64(blob)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not prepare the gang sheet file.'
        setStatus('error')
        setError(message)
        return { ok: false, error: message }
      }

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
            mimeType: blob.type || 'image/png',
            fileBase64,
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
