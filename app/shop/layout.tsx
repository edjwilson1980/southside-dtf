import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Shop Gang Sheet Tools | South Side DTF',
  description:
    'Internal South Side DTF production tools — gang sheet building, cut files, registration marks, and cutter tests.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children
}
