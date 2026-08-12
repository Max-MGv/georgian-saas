'use client'

import { useState } from 'react'
import Link from 'next/link'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { t } from '@/lib/t'

function SocialIcons({ email, phone, facebook, instagram }: { email: string; phone: string; facebook: string; instagram: string }) {
  // Only render icons that actually have a destination — a blank tenant gets none
  if (!phone && !email && !facebook && !instagram) return null
  return (
    <div className="flex items-center gap-4">
      {phone && (
        <a href={`tel:${phone.replace(/\s/g, '')}`} title={phone} className="opacity-70 hover:opacity-100 transition-opacity">
          <svg width="17" height="17" viewBox="0 0 512 512" fill="var(--color-brand)">
            <circle cx="286" cy="136" r="15"/><circle cx="346" cy="136" r="15"/><circle cx="406" cy="136" r="15"/>
            <path d="m337.213 481c24.695 0 44.787-20.187 44.787-45v-60c0-6.453-4.127-12.182-10.246-14.227l-89.787-30c-4.396-1.468-9.219-.823-13.074 1.746l-38.183 25.455c-40.978-19.444-89.411-67.448-108.675-107.698l25.446-38.169c2.569-3.854 3.214-8.68 1.746-13.074l-30-89.787c-2.045-6.12-7.774-10.246-14.227-10.246h-60c-24.813 0-45 20.091-45 44.787 0 82.877 37.684 167.936 103.39 233.367 65.634 65.36 150.86 102.846 233.823 102.846zm-292.213-351h49.197l24.25 72.576-25.927 38.89c-2.74 4.11-3.281 9.305-1.446 13.891 9.975 24.937 29.937 52.984 56.208 78.975 26.098 25.819 54.282 45.563 79.361 55.594 4.585 1.834 9.782 1.293 13.891-1.446l38.891-25.927 72.575 24.25v49.197c0 8.411-6.495 15-14.787 15-157.913 0-307.213-148.814-307.213-306.213 0-8.292 6.589-14.787 15-14.787z"/>
            <path d="m280.26 299.858c5.604 2.322 12.057 1.038 16.347-3.251l55.606-55.607h53.787c58.448 0 106-47.103 106-105s-47.552-105-106-105h-120c-57.897 0-105 47.103-105 105 0 52.805 39.183 96.631 90 103.932v46.068c0 6.067 3.655 11.536 9.26 13.858zm-69.26-163.858c0-41.355 33.645-75 75-75h120c41.906 0 76 33.645 76 75s-34.094 75-76 75h-60c-3.979 0-7.794 1.58-10.606 4.393l-34.394 34.394v-23.787c0-8.284-6.716-15-15-15-41.355 0-75-33.645-75-75z"/>
          </svg>
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} title={email} className="opacity-70 hover:opacity-100 transition-opacity">
          <svg width="17" height="17" viewBox="0 0 512 512" fill="var(--color-brand)">
            <path d="M467,61H45C20.218,61,0,81.196,0,106v300c0,24.72,20.128,45,45,45h422c24.72,0,45-20.128,45-45V106    C512,81.28,491.872,61,467,61z M460.786,91L256.954,294.833L51.359,91H460.786z M30,399.788V112.069l144.479,143.24L30,399.788z     M51.213,421l144.57-144.57l50.657,50.222c5.864,5.814,15.327,5.795,21.167-0.046L317,277.213L460.787,421H51.213z M482,399.787    L338.213,256L482,112.212V399.787z"/>
          </svg>
        </a>
      )}
      {facebook && (
        <a href={facebook} target="_blank" rel="noopener noreferrer" title="Facebook" className="opacity-70 hover:opacity-100 transition-opacity">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="var(--color-brand)">
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
          </svg>
        </a>
      )}
      {instagram && (
        <a href={instagram} target="_blank" rel="noopener noreferrer" title="Instagram" className="opacity-70 hover:opacity-100 transition-opacity">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="var(--color-brand)">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
          </svg>
        </a>
      )}
    </div>
  )
}

export default function SiteNav({ locale, navContent = {}, logoUrl, logoAlt = '', tenantName = '', wineOrdersOn = false, contactEmail = '', contactPhone = '', contactFacebook = '', contactInstagram = '' }: { locale: string; navContent?: Record<string, string>; logoUrl?: string | null; logoAlt?: string; tenantName?: string; wineOrdersOn?: boolean; contactEmail?: string; contactPhone?: string; contactFacebook?: string; contactInstagram?: string }) {
  const [open, setOpen] = useState(false)

  const navLinks = [
    { href: '/',        label: navContent['nav_home']    || t(locale, 'nav.home') },
    { href: '/about',   label: navContent['nav_about']   || t(locale, 'nav.about') },
    ...(wineOrdersOn ? [{ href: '/wines', label: navContent['nav_wines'] || t(locale, 'nav.wines') }] : []),
    { href: '/contact', label: navContent['nav_contact'] || t(locale, 'nav.contact') },
  ]
  const bookLabel = navContent['nav_book'] || t(locale, 'nav.book')

  return (
    <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: 'var(--site-header)', borderColor: 'var(--site-border)' }}>
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo — falls back to the tenant's name as styled text, never another brand's mark */}
        <Link href="/" onClick={() => setOpen(false)}>
          {logoUrl ? (
            <img src={logoUrl} alt={logoAlt} style={{ height: '48px', width: 'auto' }} />
          ) : (
            <span className="font-serif text-xl font-semibold tracking-wide" style={{ color: 'var(--color-brand)' }}>
              {tenantName}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className={`hidden md:flex items-center ${locale === 'ka' ? 'gap-4' : 'gap-6'}`}>
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} className="text-sm font-medium whitespace-nowrap hover:opacity-70 transition-opacity" style={{ color: 'var(--site-muted)' }}>
              {l.label}
            </Link>
          ))}
          <Link href="/#book" className="btn-wine text-sm font-semibold whitespace-nowrap px-5 py-2 rounded-lg">
            {bookLabel}
          </Link>
          <span className="w-px h-5" style={{ backgroundColor: 'var(--site-border)' }} />
          <LocaleSwitcher locale={locale} />
          <span className="w-px h-5" style={{ backgroundColor: 'var(--site-border)' }} />
          <SocialIcons email={contactEmail} phone={contactPhone} facebook={contactFacebook} instagram={contactInstagram} />
        </nav>

        {/* Mobile: social icons + hamburger */}
        <div className="flex md:hidden items-center gap-4">
          <SocialIcons email={contactEmail} phone={contactPhone} facebook={contactFacebook} instagram={contactInstagram} />
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            className="p-1 rounded transition-opacity hover:opacity-70"
            style={{ color: 'var(--site-text)' }}
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
        <div className="md:hidden border-t px-6 py-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--site-header)', borderColor: 'var(--site-border)' }}>
          {navLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-base font-medium py-1"
              style={{ color: 'var(--site-muted)' }}
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
