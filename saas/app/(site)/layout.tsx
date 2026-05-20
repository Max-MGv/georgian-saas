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
            <Link href="/" className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: '#6b5a47' }}>
              Home
            </Link>
            <Link href="/about" className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: '#6b5a47' }}>
              About
            </Link>
            <Link href="/wines" className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: '#6b5a47' }}>
              Order Wine
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

            {/* Divider */}
            <span className="w-px h-5 self-center" style={{ backgroundColor: '#e0d4c0' }} />

            {/* Contact & social icons */}
            <div className="flex items-center gap-3">
              <a href="tel:+995599963317" title="+995 599 96 33 17" className="opacity-70 hover:opacity-100 transition-opacity">
                <img src="/icons/phone.svg" alt="Phone" width={17} height={17} />
              </a>
              <a href="mailto:nikalasmarani@gmail.com" title="nikalasmarani@gmail.com" className="opacity-70 hover:opacity-100 transition-opacity">
                <img src="/icons/envelope.svg" alt="Email" width={17} height={17} />
              </a>
              <a href="https://www.facebook.com/nikalasmarani/" target="_blank" rel="noopener noreferrer" title="Facebook" className="opacity-70 hover:opacity-100 transition-opacity">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#9b090c">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/nikalas_marani/" target="_blank" rel="noopener noreferrer" title="Instagram" className="opacity-70 hover:opacity-100 transition-opacity">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#9b090c">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
              </a>
            </div>
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
