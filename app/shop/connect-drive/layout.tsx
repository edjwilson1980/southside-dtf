import { Suspense } from 'react'

export default function ConnectDriveLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="cutter-test"><p className="lede">Loading Drive connect…</p></main>}>{children}</Suspense>
}
