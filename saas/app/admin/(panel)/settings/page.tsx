import { getSetting } from '@/app/actions/settings'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { headers } from 'next/headers'
import { adminT } from '@/lib/adminT'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const [
    showCompanyPrice,
    enhancedBooking,
    invoiceDetailed,
    hideCompanyDropdown,
    recipientName,
    personalNumber,
    bankName,
    bankCode,
    iban,
    invoiceEmailMessage,
    minGuestsTasting,
    minGuestsTastingLunch,
    blockedDates,
    defaultLocale,
    mapsEmbedUrl,
    contactEmail,
    contactPhone,
    contactAddress,
    contactFacebook,
    contactInstagram,
    adminLanguage,
    h,
  ] = await Promise.all([
    getSetting('show_company_price_after_booking'),
    getSetting('enable_enhanced_company_booking'),
    getSetting('invoice_detailed'),
    getSetting('hide_company_dropdown'),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
    getSetting('invoice_email_message'),
    getSetting('min_guests_tasting'),
    getSetting('min_guests_tasting_lunch'),
    getBlockedDates(),
    getSetting('default_locale'),
    getSetting('maps_embed_url'),
    getSetting('contact_email'),
    getSetting('contact_phone'),
    getSetting('contact_address'),
    getSetting('contact_facebook'),
    getSetting('contact_instagram'),
    getSetting('admin_language'),
    headers(),
  ])

  const logoUrl = h.get('x-tenant-logo') ?? null
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const faviconUrl = h.get('x-tenant-favicon') ?? null

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>{adminT(adminLanguage || 'en', 'nav.settings')}</h1>
      </div>

      <SettingsClient
        settings={{
          show_company_price_after_booking: showCompanyPrice === 'true',
          enable_enhanced_company_booking: enhancedBooking === 'true',
          invoice_detailed: invoiceDetailed === 'true',
          hide_company_dropdown: hideCompanyDropdown === 'true',
        }}
        payment={{
          payment_recipient_name: recipientName,
          payment_personal_number: personalNumber,
          payment_bank_name: bankName,
          payment_bank_code: bankCode,
          payment_iban: iban,
        }}
        invoiceEmailMessage={invoiceEmailMessage}
        minGuestsTasting={minGuestsTasting}
        minGuestsTastingLunch={minGuestsTastingLunch}
        blockedDates={blockedDates}
        defaultLocale={defaultLocale ?? 'en'}
        mapsEmbedUrl={mapsEmbedUrl}
        logoUrl={logoUrl}
        logoAlt={logoAlt}
        faviconUrl={faviconUrl}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        contactAddress={contactAddress}
        contactFacebook={contactFacebook}
        contactInstagram={contactInstagram}
        adminLanguage={adminLanguage || 'en'}
      />
    </div>
  )
}
