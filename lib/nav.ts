/**
 * Top menu config (SPEC Part D). Labels live here so they can be renamed
 * without touching components. Empty href → "Coming soon" (never a broken link).
 *
 * Defaults match this app's routes (`/shop`, `/shop/sticker-maker`, `/shop/halftone`).
 * Override with NEXT_PUBLIC_NAV_* env vars when tools move to separate apps.
 */

export type TopMenuKey = 'shop-builder' | 'dtf-stickers' | 'vinyl' | 'halftone'

export type TopMenuItem = {
  key: TopMenuKey
  label: string
  /** Absolute or app-relative URL. Undefined / empty = not live yet. */
  href?: string
}

function envUrl(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const TOP_MENU: TopMenuItem[] = [
  {
    key: 'shop-builder',
    label: 'Shop Builder',
    href: envUrl('NEXT_PUBLIC_NAV_SHOP_BUILDER_URL') ?? '/shop',
  },
  {
    key: 'dtf-stickers',
    label: 'DTF Stickers',
    href: envUrl('NEXT_PUBLIC_NAV_DTF_STICKERS_URL') ?? '/shop/sticker-maker',
  },
  {
    key: 'vinyl',
    label: 'Vinyl Stickers',
    href: envUrl('NEXT_PUBLIC_NAV_VINYL_URL'),
  },
  {
    key: 'halftone',
    label: 'Halftone Generator',
    href: envUrl('NEXT_PUBLIC_NAV_HALFTONE_URL') ?? '/shop/halftone',
  },
]

/** Resolve which menu key is active for the current pathname. */
export function topMenuKeyForPath(pathname: string): TopMenuKey | null {
  const path = pathname.replace(/\/$/, '') || '/'
  if (path === '/shop/sticker-maker' || path.startsWith('/shop/sticker-maker/')) {
    return 'dtf-stickers'
  }
  if (path === '/shop/halftone' || path.startsWith('/shop/halftone/')) {
    return 'halftone'
  }
  if (path === '/shop' || path.startsWith('/shop/')) {
    return 'shop-builder'
  }
  if (path === '/builder' || path.startsWith('/builder/')) {
    return 'shop-builder'
  }
  if (path === '/stickers' || path.startsWith('/stickers/')) {
    return 'dtf-stickers'
  }
  return null
}
