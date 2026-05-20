import Link from 'next/link'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5efe6', color: '#1c1008' }}>

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#f5efe6', borderColor: '#e0d4c0' }}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight" style={{ color: '#1c1008' }}>
            Nikalas Marani
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/about" className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: '#6b5a47' }}>
              About
            </Link>
            <Link href="/contact" className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: '#6b5a47' }}>
              Contact
            </Link>
            <Link
              href="/#book"
              className="btn-wine text-sm font-semibold px-5 py-2 rounded-lg"
            >
              Book a Visit
            </Link>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-8 text-center text-sm" style={{ borderColor: '#e0d4c0', color: '#a89070' }}>
        <p>Kardanakhi, Gurjaani · +995 599 96 33 17 · nikalasmarani@gmail.com</p>
        <p className="mt-1">48-hour cancellation policy applies.</p>
      </footer>

    </div>
  )
}
