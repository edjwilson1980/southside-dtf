'use client'

type ShopNavProps = {
  current?: 'shop' | 'sticker-maker' | 'halftone' | 'connect-drive' | 'customer'
  /** Hide Connect Drive when the page already has a dedicated Drive button. */
  hideConnectDrive?: boolean
}

const LINKS: { href: string; label: string; key: NonNullable<ShopNavProps['current']> }[] = [
  { href: '/shop', label: 'Shop builder', key: 'shop' },
  { href: '/shop/sticker-maker', label: 'Sticker Maker', key: 'sticker-maker' },
  { href: '/shop/halftone', label: 'Halftone generator', key: 'halftone' },
  { href: '/shop/connect-drive', label: 'Connect Drive', key: 'connect-drive' },
  { href: '/', label: 'Customer builder', key: 'customer' },
]

export function ShopNav({ current, hideConnectDrive = false }: ShopNavProps) {
  const links = hideConnectDrive
    ? LINKS.filter((link) => link.key !== 'connect-drive')
    : LINKS
  return (
    <nav className="shop-nav" aria-label="Shop tools">
      {links.map((link) => (
        <a
          key={link.href}
          className="shop-nav-link"
          href={link.href}
          aria-current={current === link.key ? 'page' : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}
