'use client'

type ShopNavProps = {
  current?: 'shop' | 'sticker-maker' | 'halftone' | 'cutter-test' | 'connect-drive' | 'customer'
}

const LINKS: { href: string; label: string; key: NonNullable<ShopNavProps['current']> }[] = [
  { href: '/shop', label: 'Shop builder', key: 'shop' },
  { href: '/shop/sticker-maker', label: 'Sticker Maker', key: 'sticker-maker' },
  { href: '/shop/halftone', label: 'Halftone generator', key: 'halftone' },
  { href: '/shop/cutter-test', label: 'Cutter test', key: 'cutter-test' },
  { href: '/shop/connect-drive', label: 'Connect Drive', key: 'connect-drive' },
  { href: '/', label: 'Customer builder', key: 'customer' },
]

export function ShopNav({ current }: ShopNavProps) {
  return (
    <nav className="shop-nav" aria-label="Shop tools">
      {LINKS.map((link) => (
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
