import { NextResponse } from 'next/server'
import { DEFAULT_STORE_ORIGIN } from '@/lib/ssgs-cart-bridge'

export const runtime = 'nodejs'

/**
 * Proxy Woo Upload Gangsheet sizes so the browser never needs CORS to the store.
 * Prices still come from WooCommerce — this route does not invent them.
 */
export async function GET() {
  try {
    const origin = (process.env.NEXT_PUBLIC_STORE_ORIGIN?.trim() || DEFAULT_STORE_ORIGIN).replace(/\/$/, '')
    const res = await fetch(`${origin}/wp-json/ssdtf/v1/upload-sizes`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    })
    const json = await res.json()
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
