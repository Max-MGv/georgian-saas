import { getAllSettings } from '@/app/actions/settings'
import { settingValue } from '@/lib/settings'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { getPaymentCredentials } from '@/app/actions/paymentCredentials'
import { headers } from 'next/headers'
import { adminT } from '@/lib/adminT'
import PaymentSetupBanner from '../PaymentSetupBanner'
import SettingsClient from './SettingsClient'
import ContactRolesPanel from './ContactRolesPanel'
import WineOrderSettingsPanel from './WineOrderSettingsPanel'
import { getTenantId } from '@/lib/tenant'
import { loadWineOrderDelivery } from '@/lib/wineOrderDelivery'
import { listContactRoles } from '@/app/actions/contactRoles'

export default async function SettingsPage() {
  // All of this tenant's settings in ONE database read (T-79). This page used to make one round
  // trip per key — 34 of them — which on a dev machine was most of its ~5 s load and crowded the
  // connection pool. Same answer per key as getSetting(): the stored value, else the default.
  const tenantId = await getTenantId()
  const [settings, blockedDates, contactRoles, h] = await Promise.all([
    getAllSettings(tenantId),
    getBlockedDates(),
    listContactRoles(),
    headers(),
  ])
  const get = (key: string) => settingValue(settings, key)
  const showCompanyPrice = get('show_company_price_after_booking')
  const enhancedBooking = get('enable_enhanced_company_booking')
  const invoiceDetailed = get('invoice_detailed')
  const hideCompanyDropdown = get('hide_company_dropdown')
  const showAdminHints = get('show_admin_hints')
  const recipientName = get('payment_recipient_name')
  const personalNumber = get('payment_personal_number')
  const bankName = get('payment_bank_name')
  const bankCode = get('payment_bank_code')
  const iban = get('payment_iban')
  const minGuestsTasting = get('min_guests_tasting')
  const minGuestsTastingLunch = get('min_guests_tasting_lunch')
  const maxGuestsTasting = get('max_guests_tasting')
  const maxGuestsTastingLunch = get('max_guests_tasting_lunch')
  const companyMinTastingOnly = get('min_guests_company_tasting_only')
  const companyMinLunchOnly = get('min_guests_company_lunch_only')
  const companyMinTastingLunch = get('min_guests_company_tasting_lunch')
  const bookingLeadSplit = get('booking_lead_split')
  const bookingLeadHours = get('booking_lead_hours')
  const bookingLeadHoursTasting = get('booking_lead_hours_tasting')
  const bookingLeadHoursTastingLunch = get('booking_lead_hours_tasting_lunch')
  const visitDurationTasting = get('visit_duration_tasting')
  const visitDurationTastingLunch = get('visit_duration_tasting_lunch')
  const workingHoursCustom = get('working_hours_custom')
  const workingHoursOpen = get('working_hours_open')
  const workingHoursClose = get('working_hours_close')
  const workingHoursDaysJson = get('working_hours_days_json')
  const defaultLocale = get('default_locale')
  const mapsEmbedUrl = get('maps_embed_url')
  const contactEmail = get('contact_email')
  const contactPhone = get('contact_phone')
  const contactAddress = get('contact_address')
  const contactFacebook = get('contact_facebook')
  const contactInstagram = get('contact_instagram')
  const adminLanguage = get('admin_language')
  const personCodesEnabled = get('person_codes_enabled')

  const logoUrl = h.get('x-tenant-logo') ?? null
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const faviconUrl = h.get('x-tenant-favicon') ?? null

  // Module flag comes from the proxy header, same source the site layout uses.
  // Tenants without the module never get the credentials section — and never get
  // the lookup either. getPaymentCredentials returns `secretKeySet`, never the key.
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  const onlinePaymentOn = h.get('x-tenant-modules-online-payment') === 'true'
  // Wine-order rules + delivery zones (T-8). Only for tenants with the module; read here as four
  // named keys + the zone list — never the whole settings map (MaintenanceNotes §9).
  // Both lookups at once: each is a database round trip, and they do not depend on each other.
  const [credentials, wineRules] = await Promise.all([
    onlinePaymentOn ? getPaymentCredentials() : null,
    wineOrdersOn ? loadWineOrderDelivery(tenantId) : null,
  ])

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{adminT(adminLanguage || 'en', 'nav.settings')}</h1>
      </div>

      {/* Credentials half is explained in the section below, so this instance only
          covers the pricing half (Plan-OnlinePayment §7.3). */}
      <PaymentSetupBanner checks={['pricing']} />

      <SettingsClient
        settings={{
          show_company_price_after_booking: showCompanyPrice === 'true',
          enable_enhanced_company_booking: enhancedBooking === 'true',
          invoice_detailed: invoiceDetailed === 'true',
          hide_company_dropdown: hideCompanyDropdown === 'true',
          show_admin_hints: showAdminHints === 'true',
          person_codes_enabled: personCodesEnabled === 'true',
        }}
        payment={{
          payment_recipient_name: recipientName,
          payment_personal_number: personalNumber,
          payment_bank_name: bankName,
          payment_bank_code: bankCode,
          payment_iban: iban,
        }}
        onlinePayment={credentials ? {
          merchantId: credentials.merchantId,
          secretKeySet: credentials.secretKeySet,
          paymentEnabledIndividuals: credentials.paymentEnabledIndividuals,
          paymentEnabledCompanies: credentials.paymentEnabledCompanies,
          paymentEnabledWineOrders: credentials.paymentEnabledWineOrders,
        } : null}
        minGuestsTasting={minGuestsTasting}
        minGuestsTastingLunch={minGuestsTastingLunch}
        maxGuestsTasting={maxGuestsTasting}
        maxGuestsTastingLunch={maxGuestsTastingLunch}
        companyMinTastingOnly={companyMinTastingOnly}
        companyMinLunchOnly={companyMinLunchOnly}
        companyMinTastingLunch={companyMinTastingLunch}
        bookingLeadSplit={bookingLeadSplit}
        bookingLeadHours={bookingLeadHours}
        bookingLeadHoursTasting={bookingLeadHoursTasting}
        bookingLeadHoursTastingLunch={bookingLeadHoursTastingLunch}
        visitDurationTasting={visitDurationTasting}
        visitDurationTastingLunch={visitDurationTastingLunch}
        workingHoursCustom={workingHoursCustom}
        workingHoursOpen={workingHoursOpen}
        workingHoursClose={workingHoursClose}
        workingHoursDaysJson={workingHoursDaysJson}
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

      {/* Contact types (Plan-ContactRoles Chunk 4). A sibling of SettingsClient rather than a
          section inside it — that file is already ~1560 lines and this is self-contained. */}
      <ContactRolesPanel
        roles={contactRoles}
        locale={adminLanguage || 'en'}
        wineOrdersOn={wineOrdersOn}
      />

      {/* Wine orders — minimum, pickup, delivery zones (T-8). Sibling panel, like the one above. */}
      {wineRules && (
        <WineOrderSettingsPanel
          rules={wineRules.rules}
          zones={wineRules.zones}
          onlinePaymentOn={onlinePaymentOn}
          locale={adminLanguage || 'en'}
        />
      )}
    </div>
  )
}
