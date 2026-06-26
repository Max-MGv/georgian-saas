'use client'

import { useState } from 'react'
import Link from 'next/link'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { t } from '@/lib/t'

function SocialIcons({ email, phone, facebook, instagram }: { email: string; phone: string; facebook: string; instagram: string }) {
  return (
    <div className="flex items-center gap-4">
      <a href={`tel:${phone.replace(/\s/g, '')}`} title={phone} className="opacity-70 hover:opacity-100 transition-opacity">
        <img src="/icons/phone.svg" alt="Phone" width={17} height={17} />
      </a>
      <a href={`mailto:${email}`} title={email} className="opacity-70 hover:opacity-100 transition-opacity">
        <img src="/icons/envelope.svg" alt="Email" width={17} height={17} />
      </a>
      <a href={facebook} target="_blank" rel="noopener noreferrer" title="Facebook" className="opacity-70 hover:opacity-100 transition-opacity">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#9b090c">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      </a>
      <a href={instagram} target="_blank" rel="noopener noreferrer" title="Instagram" className="opacity-70 hover:opacity-100 transition-opacity">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#9b090c">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
        </svg>
      </a>
    </div>
  )
}

export default function SiteNav({ locale, navContent = {}, logoUrl, logoAlt = 'Nikalas Marani', contactEmail = 'nikalasmarani@gmail.com', contactPhone = '+995 599 96 33 17', contactFacebook = 'https://www.facebook.com/nikalasmarani/', contactInstagram = 'https://www.instagram.com/nikalas_marani/' }: { locale: string; navContent?: Record<string, string>; logoUrl?: string | null; logoAlt?: string; contactEmail?: string; contactPhone?: string; contactFacebook?: string; contactInstagram?: string }) {
  const [open, setOpen] = useState(false)

  const navLinks = [
    { href: '/',        label: navContent['nav_home']    || t(locale, 'nav.home') },
    { href: '/about',   label: navContent['nav_about']   || t(locale, 'nav.about') },
    { href: '/wines',   label: navContent['nav_wines']   || t(locale, 'nav.wines') },
    { href: '/contact', label: navContent['nav_contact'] || t(locale, 'nav.contact') },
  ]
  const bookLabel = navContent['nav_book'] || t(locale, 'nav.book')

  return (
    <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#f5efe6', borderColor: '#e0d4c0' }}>
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" onClick={() => setOpen(false)}>
          <img src={logoUrl ?? '/icons/logo-dark.svg'} alt={logoAlt} style={{ height: '48px', width: 'auto' }} />
        </Link>

        {/* Desktop nav */}
        <nav className={`hidden md:flex items-center ${locale === 'ka' ? 'gap-4' : 'gap-6'}`}>
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: '#6b5a47' }}>
              {l.label}
            </Link>
          ))}
          <Link href="/#book" className="btn-wine text-sm font-semibold px-5 py-2 rounded-lg">
            {bookLabel}
          </Link>
          <span className="w-px h-5" style={{ backgroundColor: '#e0d4c0' }} />
          <LocaleSwitcher locale={locale} />
          <span className="w-px h-5" style={{ backgroundColor: '#e0d4c0' }} />
          <SocialIcons email={contactEmail} phone={contactPhone} facebook={contactFacebook} instagram={contactInstagram} />
        </nav>

        {/* Mobile: social icons + hamburger */}
        <div className="flex md:hidden items-center gap-4">
          <SocialIcons email={contactEmail} phone={contactPhone} facebook={contactFacebook} instagram={contactInstagram} />
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            className="p-1 rounded transition-opacity hover:opacity-70"
            style={{ color: '#1c1008' }}
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="md:hidden border-t px-6 py-4 flex flex-col gap-4" style={{ backgroundColor: '#f5efe6', borderColor: '#e0d4c0' }}>
          {navLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-base font-medium py-1"
              style={{ color: '#6b5a47' }}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/#book"
            onClick={() => setOpen(false)}
            className="btn-wine text-sm font-semibold px-5 py-3 rounded-lg text-center mt-1"
          >
            {bookLabel}
          </Link>
          <div className="pt-1">
            <LocaleSwitcher locale={locale} />
          </div>
        </div>
      )}
    </header>
  )
}
