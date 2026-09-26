import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Keep out of `@/lib/ssgs-cart-bridge` — that file is `'use client'` and Turbopack will not expose string consts to route handlers. */
const FALLBACK_STORE_ORIGIN = 'https://southsidedtf.com'

/**
 * Proxy Woo Upload Gangsheet sizes so the browser never needs CORS to the store.
 * Prices still come from WooCommerce — this route does not invent them.
 */
export async function GET() {
  try {
    const origin = (process.env.NEXT_PUBLIC_STORE_ORIGIN?.trim() || FALLBACK_STORE_ORIGIN).replace(/\/$/, '')
    const res = await fetch(`${origin}/wp-json/ssdtf/v1/upload-sizes`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    })
    const text = await res.text()
    let json: { message?: string; error?: string; sizes?: unknown }
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      return NextResponse.json(
        {
          error:
            'Store blocked the price lookup (bot protection or plugin not deployed). Deploy southside-gangsheet 1.22 and allow /wp-json/ssdtf/v1/upload-sizes.',
        },
        { status: 502 },
      )
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: json?.message || json?.error || 'Could not load Upload Gangsheet prices.' },
        { status: res.status },
      )
    }
    return NextResponse.json(json)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load Upload Gangsheet prices.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
