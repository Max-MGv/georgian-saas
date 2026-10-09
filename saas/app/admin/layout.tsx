import type { Metadata } from 'next'
import { headers } from 'next/headers'

// The admin panel's own iOS bookmark icon + name, so it can't be mistaken for the
// public site's (app/layout.tsx) on a home screen. See app/touch-icon/route.tsx.
export async function generateMetadata(): Promise<Metadata> {
  const displayName = (await headers()).get('x-tenant-name') ?? 'Your Winery'
  return {
    icons: { apple: '/touch-icon?v=admin' },
    appleWebApp: { title: `${displayName} Admin` },
  }
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
