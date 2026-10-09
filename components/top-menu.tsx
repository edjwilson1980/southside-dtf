'use client'

import { usePathname } from 'next/navigation'
import { TOP_MENU, topMenuKeyForPath, type TopMenuKey } from '@/lib/nav'

type TopMenuProps = {
  /** Force active key (overrides path detection). */
  active?: TopMenuKey
}

export function TopMenu({ active }: TopMenuProps) {
  const pathname = usePathname() || '/'
  const current = active ?? topMenuKeyForPath(pathname)

  return (
    <nav className="top-menu" aria-label="Main tools">
      <div className="top-menu-inner">
        {TOP_MENU.map((item) => {
          const isActive = current === item.key
          const href = item.href
          const live = Boolean(href)

          if (!live) {
            return (
              <span
                key={item.key}
                className="top-menu-item coming-soon"
                title="Coming soon"
                aria-disabled="true"
              >
                {item.label}
              </span>
            )
          }

          return (
            <a
              key={item.key}
              href={href}
              className={`top-menu-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
