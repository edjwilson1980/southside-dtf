import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { frameAncestorsHeaderValue } from '@/lib/embed'

/**
 * Allow the customer builder to be embedded on the WordPress storefront.
 * Shop tools stay noindex via their layout; framing is still limited to known hosts.
 */
export function middleware(_req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestorsHeaderValue()}`)
  // Prefer CSP frame-ancestors; omit X-Frame-Options so allowed parents can embed.
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
