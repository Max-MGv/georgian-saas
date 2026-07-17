import { headers } from 'next/headers'

export default async function ComingSoonPage() {
  const h = await headers()
  const displayName = h.get('x-tenant-name') ?? 'Your Winery'
  const logoUrl = h.get('x-tenant-logo')
  const logoAlt = h.get('x-tenant-logo-alt') || displayName

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center" style={{ backgroundColor: '#fff9f3' }}>
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={logoAlt} style={{ height: 56, width: 'auto' }} />
      )}
      <div>
        <h1 className="text-2xl font-medium" style={{ color: '#1c1008' }}>{displayName}</h1>
        <p className="mt-2 text-sm" style={{ color: '#6b5a47' }}>Our site is coming soon. Please check back shortly.</p>
      </div>
    </main>
  )
}
