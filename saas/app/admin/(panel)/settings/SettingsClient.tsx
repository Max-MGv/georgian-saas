'use client'

import { useState, useTransition, useRef } from 'react'
import { updateSetting } from '@/app/actions/settings'
import { addBlockedDate, removeBlockedDate } from '@/app/actions/blockedDates'
import { uploadTenantLogo, uploadTenantFavicon, saveTenantLogo, saveTenantFavicon } from '@/app/actions/uploadLogo'
import { updatePaymentCredentials, clearPaymentSecretKey, updatePaymentSectionToggles } from '@/app/actions/paymentCredentials'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

type Props = {
  settings: { show_company_price_after_booking: boolean; enable_enhanced_company_booking: boolean; invoice_detailed: boolean; hide_company_dropdown: boolean; show_admin_hints: boolean }
  defaultLocale: string
  payment: {
    payment_recipient_name: string
    payment_personal_number: string
    payment_bank_name: string
    payment_bank_code: string
    payment_iban: string
  }
  /**
   * Flitt card-payment credentials. `null` when the online-payment module is off
   * for this tenant — the whole section is then not rendered at all.
   * Deliberately carries `secretKeySet: boolean` and never the key itself: this
   * object is serialised into the page, so the value must not be in it.
   */
  onlinePayment: {
    merchantId: string
    secretKeySet: boolean
    paymentEnabledIndividuals: boolean
    paymentEnabledCompanies: boolean
    paymentEnabledWineOrders: boolean
  } | null
  invoiceEmailMessage: string
  minGuestsTasting: string
  minGuestsTastingLunch: string
  blockedDates?: { id: string; date: string; reason: string | null }[]
  mapsEmbedUrl: string
  logoUrl?: string | null
  logoAlt?: string
  faviconUrl?: string | null
  contactEmail: string
  contactPhone: string
  contactAddress: string
  contactFacebook: string
  contactInstagram: string
  adminLanguage: string
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      style={{ backgroundColor: enabled ? C.wine : '#d1c4b0' }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

const inputStyle = {
  backgroundColor: '#fffdf9',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: '0.875rem',
  color: C.text,
  outline: 'none',
  width: '100%',
}

export default function SettingsClient({ settings, defaultLocale: initialDefaultLocale, payment, onlinePayment, invoiceEmailMessage, minGuestsTasting, minGuestsTastingLunch, blockedDates: initialBlockedDates = [], mapsEmbedUrl: initialMapsEmbedUrl, logoUrl: initialLogoUrl = null, logoAlt: initialLogoAlt = '', faviconUrl: initialFaviconUrl = null, contactEmail: initialContactEmail = '', contactPhone: initialContactPhone = '', contactAddress: initialContactAddress = '', contactFacebook: initialContactFacebook = '', contactInstagram: initialContactInstagram = '', adminLanguage: initialAdminLanguage = 'en' }: Props) {
  const [defaultLocale, setDefaultLocale] = useState(initialDefaultLocale ?? 'en')
  const [adminLanguage, setAdminLanguage] = useState(initialAdminLanguage)
  const at = (key: string) => adminT(adminLanguage, key)
  const [showAdminHints, setShowAdminHints] = useState(settings.show_admin_hints)
  const [showPrice, setShowPrice] = useState(settings.show_company_price_after_booking)
  const [enhancedBooking, setEnhancedBooking] = useState(settings.enable_enhanced_company_booking)
  const [invoiceDetailed, setInvoiceDetailed] = useState(settings.invoice_detailed)
  const [hideCompanyDropdown, setHideCompanyDropdown] = useState(settings.hide_company_dropdown)
  const [paymentFields, setPaymentFields] = useState(payment)
  const [flittMerchantId, setFlittMerchantId] = useState(onlinePayment?.merchantId ?? '')
  const [flittSecretKeySet, setFlittSecretKeySet] = useState(onlinePayment?.secretKeySet ?? false)
  // Section toggles (#148) — independent per-section on/off for taking online
  // payment. Default true matches Tenant's Prisma default: absent onlinePayment
  // (module off) never renders these, so the fallback value is inert either way.
  const [paymentEnabledIndividuals, setPaymentEnabledIndividuals] = useState(onlinePayment?.paymentEnabledIndividuals ?? true)
  const [paymentEnabledCompanies, setPaymentEnabledCompanies] = useState(onlinePayment?.paymentEnabledCompanies ?? true)
  const [paymentEnabledWineOrders, setPaymentEnabledWineOrders] = useState(onlinePayment?.paymentEnabledWineOrders ?? true)
  // Draft only. The stored key is never sent to the browser, so this starts empty
  // on every load and an empty draft means "leave the saved key alone".
  const [flittSecretDraft, setFlittSecretDraft] = useState('')
  const [flittClearConfirm, setFlittClearConfirm] = useState(false)
  const [emailMessage, setEmailMessage] = useState(invoiceEmailMessage)
  const [minTasting, setMinTasting] = useState(minGuestsTasting)
  const [minTastingLunch, setMinTastingLunch] = useState(minGuestsTastingLunch)
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates)
  const [mapsEmbedUrl, setMapsEmbedUrl] = useState(initialMapsEmbedUrl)
  const [mapsEditMode, setMapsEditMode] = useState(false)
  const [mapsDraft, setMapsDraft] = useState(initialMapsEmbedUrl)
  const [mapsError, setMapsError] = useState<string | null>(null)
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [logoAlt, setLogoAlt] = useState(initialLogoAlt)
  const [faviconUrl, setFaviconUrl] = useState<string | null>(initialFaviconUrl)
  const [logoUploading, setLogoUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const [contactEmail, setContactEmail] = useState(initialContactEmail)
  const [contactPhone, setContactPhone] = useState(initialContactPhone)
  const [contactAddress, setContactAddress] = useState(initialContactAddress)
  const [contactFacebook, setContactFacebook] = useState(initialContactFacebook)
  const [contactInstagram, setContactInstagram] = useState(initialContactInstagram)
  const [paymentEditing, setPaymentEditing] = useState<string | null>(null)
  const [altEditing, setAltEditing] = useState(false)
  const [bookingRulesEditing, setBookingRulesEditing] = useState<string | null>(null)
  const [contactOpen, setContactOpen] = useState(true)
  const [contactEditing, setContactEditing] = useState<string | null>(null)

  function handleDefaultLocale(locale: string) {
    setDefaultLocale(locale)
    startTransition(async () => {
      await updateSetting('default_locale', locale)
      setSavedKey('default_locale')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleAdminLanguage(locale: string) {
    setAdminLanguage(locale)
    startTransition(async () => {
      await updateSetting('admin_language', locale)
      setSavedKey('admin_language')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleAdminHintsToggle(value: boolean) {
    setShowAdminHints(value)
    startTransition(async () => {
      await updateSetting('show_admin_hints', value ? 'true' : 'false')
      setSavedKey('show_admin_hints')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleToggle(value: boolean) {
    setShowPrice(value)
    startTransition(async () => {
      await updateSetting('show_company_price_after_booking', value ? 'true' : 'false')
      setSavedKey('show_company_price_after_booking')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleEnhancedToggle(value: boolean) {
    setEnhancedBooking(value)
    startTransition(async () => {
      await updateSetting('enable_enhanced_company_booking', value ? 'true' : 'false')
      setSavedKey('enable_enhanced_company_booking')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleInvoiceDetailedToggle(value: boolean) {
    setInvoiceDetailed(value)
    startTransition(async () => {
      await updateSetting('invoice_detailed', value ? 'true' : 'false')
      setSavedKey('invoice_detailed')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleHideDropdownToggle(value: boolean) {
    setHideCompanyDropdown(value)
    startTransition(async () => {
      await updateSetting('hide_company_dropdown', value ? 'true' : 'false')
      setSavedKey('hide_company_dropdown')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handlePaymentBlur(key: keyof typeof paymentFields) {
    startTransition(async () => {
      await updateSetting(key, paymentFields[key])
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleFlittMerchantIdBlur() {
    startTransition(async () => {
      await updatePaymentCredentials({ merchantId: flittMerchantId })
      setSavedKey('flitt_merchant_id')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleFlittSecretSave() {
    const key = flittSecretDraft.trim()
    if (!key) return
    startTransition(async () => {
      await updatePaymentCredentials({ merchantId: flittMerchantId, secretKey: key })
      setFlittSecretDraft('')
      setFlittSecretKeySet(true)
      setSavedKey('flitt_secret_key')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  // Section toggles (#148) always save all three together — mirrors how
  // updatePaymentCredentials already saves merchantId+secretKey as one write.
  function handlePaymentSectionToggle(
    field: 'paymentEnabledIndividuals' | 'paymentEnabledCompanies' | 'paymentEnabledWineOrders',
    value: boolean
  ) {
    const next = {
      paymentEnabledIndividuals: field === 'paymentEnabledIndividuals' ? value : paymentEnabledIndividuals,
      paymentEnabledCompanies: field === 'paymentEnabledCompanies' ? value : paymentEnabledCompanies,
      paymentEnabledWineOrders: field === 'paymentEnabledWineOrders' ? value : paymentEnabledWineOrders,
    }
    setPaymentEnabledIndividuals(next.paymentEnabledIndividuals)
    setPaymentEnabledCompanies(next.paymentEnabledCompanies)
    setPaymentEnabledWineOrders(next.paymentEnabledWineOrders)
    startTransition(async () => {
      await updatePaymentSectionToggles(next)
      setSavedKey(field)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleFlittSecretClear() {
    setFlittClearConfirm(false)
    startTransition(async () => {
      await clearPaymentSecretKey()
      setFlittSecretDraft('')
      setFlittSecretKeySet(false)
      setSavedKey('flitt_secret_key')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleEmailMessageBlur() {
    startTransition(async () => {
      await updateSetting('invoice_email_message', emailMessage)
      setSavedKey('invoice_email_message')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleMinTastingBlur() {
    const val = Math.max(parseInt(minTasting) || 1, 1)
    setMinTasting(String(val))
    startTransition(async () => {
      await updateSetting('min_guests_tasting', String(val))
      setSavedKey('min_guests_tasting')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleMapsSave() {
    const trimmed = mapsDraft.trim()
    if (!trimmed.startsWith('https://www.google.com/maps/embed')) {
      setMapsError(at('settings.contactPage.mapError'))
      return
    }
    setMapsError(null)
    setMapsEmbedUrl(trimmed)
    setMapsEditMode(false)
    startTransition(async () => {
      await updateSetting('maps_embed_url', trimmed)
      setSavedKey('maps_embed_url')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleMapsCancel() {
    setMapsDraft(mapsEmbedUrl)
    setMapsError(null)
    setMapsEditMode(false)
  }

  function handleMinTastingLunchBlur() {
    const val = Math.max(parseInt(minTastingLunch) || 1, 1)
    setMinTastingLunch(String(val))
    startTransition(async () => {
      await updateSetting('min_guests_tasting_lunch', String(val))
      setSavedKey('min_guests_tasting_lunch')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handlePaymentSave(key: keyof typeof paymentFields) {
    setPaymentEditing(null)
    startTransition(async () => {
      await updateSetting(key, paymentFields[key])
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleAltTextSave() {
    if (!logoUrl) return
    setAltEditing(false)
    startTransition(async () => {
      await saveTenantLogo(logoUrl, logoAlt)
      setSavedKey('logo_alt')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  function handleBookingRuleSave(key: 'min_guests_tasting' | 'min_guests_tasting_lunch') {
    setBookingRulesEditing(null)
    if (key === 'min_guests_tasting') {
      const val = String(Math.max(parseInt(minTasting) || 1, 1))
      setMinTasting(val)
      startTransition(async () => {
        await updateSetting('min_guests_tasting', val)
        setSavedKey('min_guests_tasting')
        setTimeout(() => setSavedKey(null), 2000)
      })
    } else {
      const val = String(Math.max(parseInt(minTastingLunch) || 1, 1))
      setMinTastingLunch(val)
      startTransition(async () => {
        await updateSetting('min_guests_tasting_lunch', val)
        setSavedKey('min_guests_tasting_lunch')
        setTimeout(() => setSavedKey(null), 2000)
      })
    }
  }

  function handleAddBlockedDate() {
    if (!newBlockDate) return
    startTransition(async () => {
      const result = await addBlockedDate(newBlockDate, newBlockReason || undefined)
      if (result) {
        setBlockedDates(prev => [...prev, result].sort((a, b) => a.date.localeCompare(b.date)))
        setNewBlockDate('')
        setNewBlockReason('')
      }
    })
  }

  function handleRemoveBlockedDate(id: string) {
    startTransition(async () => {
      await removeBlockedDate(id)
      setBlockedDates(prev => prev.filter(d => d.id !== id))
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBrandingError(null)
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadTenantLogo(fd)
      setLogoUrl(url)
      await saveTenantLogo(url, logoAlt)
      setSavedKey('logo')
      setTimeout(() => setSavedKey(null), 2000)
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleLogoAltBlur() {
    if (!logoUrl) return
    startTransition(async () => {
      await saveTenantLogo(logoUrl, logoAlt)
      setSavedKey('logo_alt')
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBrandingError(null)
    setFaviconUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadTenantFavicon(fd)
      setFaviconUrl(url)
      await saveTenantFavicon(url)
      setSavedKey('favicon')
      setTimeout(() => setSavedKey(null), 2000)
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setFaviconUploading(false)
    }
  }

  function handleContactSave(key: 'contact_email' | 'contact_phone' | 'contact_address' | 'contact_facebook' | 'contact_instagram', value: string) {
    setContactEditing(null)
    startTransition(async () => {
      await updateSetting(key, value)
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  const paymentRows: { key: keyof typeof paymentFields; label: string; placeholder: string }[] = [
    { key: 'payment_recipient_name',   label: at('settings.payment.recipientName'),   placeholder: at('settings.payment.recipientNamePh') },
    { key: 'payment_personal_number',  label: at('settings.payment.personalNumber'),  placeholder: at('settings.payment.personalNumberPh') },
    { key: 'payment_bank_name',        label: at('settings.payment.bankName'),        placeholder: at('settings.payment.bankNamePh') },
    { key: 'payment_bank_code',        label: at('settings.payment.bankCode'),        placeholder: at('settings.payment.bankCodePh') },
    { key: 'payment_iban',             label: at('settings.payment.iban'),            placeholder: at('settings.payment.ibanPh') },
  ]

  // Both halves are required before anything is ever charged — see
  // lib/payments/shouldTakePayment. Anything less and the guest just books.
  const flittReady = Boolean(flittMerchantId.trim()) && flittSecretKeySet

  return (
    <div className="space-y-6">

      {/* Admin Panel Language */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.adminLanguage.sectionTitle')}</p>
            <HelpHint text={at('help.settings.languageDistinction')} />
          </div>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.adminLanguage.sectionHint')}</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4" style={{ backgroundColor: C.bg }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.adminLanguage.fieldLabel')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.adminLanguage.fieldHint')}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'admin_language' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: C.border }}>
              {(['en', 'ka'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleAdminLanguage(l)}
                  className="px-4 py-1.5 text-sm font-semibold uppercase transition-colors"
                  style={{
                    backgroundColor: adminLanguage === l ? 'var(--color-brand)' : C.bg,
                    color: adminLanguage === l ? '#fff' : C.muted,
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Default Language */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.language.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.language.sectionHint')}</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4" style={{ backgroundColor: C.bg }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.language.fieldLabel')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.language.fieldHint')}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'default_locale' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: C.border }}>
              {(['en', 'ka'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleDefaultLocale(l)}
                  className="px-4 py-1.5 text-sm font-semibold uppercase transition-colors"
                  style={{
                    backgroundColor: defaultLocale === l ? 'var(--color-brand)' : C.bg,
                    color: defaultLocale === l ? '#fff' : C.muted,
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Guide hints */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.guideHints.sectionTitle')}</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4" style={{ backgroundColor: C.bg }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.guideHints.fieldLabel')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.guideHints.fieldHint')}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'show_admin_hints' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <Toggle enabled={showAdminHints} onChange={handleAdminHintsToggle} />
          </div>
        </div>
      </div>

      {/* Booking toggles */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.booking.sectionTitle')}</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4 border-b"
          style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.booking.showPrice.label')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              {at('settings.booking.showPrice.hint')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'show_company_price_after_booking' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <Toggle enabled={showPrice} onChange={handleToggle} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4 border-b"
          style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.booking.enhanced.label')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              {at('settings.booking.enhanced.hint')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'enable_enhanced_company_booking' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <Toggle enabled={enhancedBooking} onChange={handleEnhancedToggle} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4 border-b"
          style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.booking.detailedInvoice.label')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              {at('settings.booking.detailedInvoice.hint')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'invoice_detailed' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <Toggle enabled={invoiceDetailed} onChange={handleInvoiceDetailedToggle} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4"
          style={{ backgroundColor: C.bg }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.booking.hideDropdown.label')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              {at('settings.booking.hideDropdown.hint')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'hide_company_dropdown' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
            )}
            <Toggle enabled={hideCompanyDropdown} onChange={handleHideDropdownToggle} />
          </div>
        </div>
      </div>

      {/* Payment details */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.payment.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.payment.sectionHint')}</p>
        </div>
        <div className="divide-y" style={{ borderColor: C.border }}>
          {paymentRows.map(({ key, label, placeholder }) => {
            const isEditing = paymentEditing === key
            return (
              <div key={key} className="flex items-center gap-4 px-5 py-3" style={{ backgroundColor: C.bg }}>
                <label className="text-sm w-48 flex-shrink-0" style={{ color: C.muted }}>{label}</label>
                <div className="flex-1 flex items-center gap-2">
                  {isEditing ? (
                    <input
                      style={inputStyle}
                      value={paymentFields[key]}
                      placeholder={placeholder}
                      autoFocus
                      onChange={e => setPaymentFields(prev => ({ ...prev, [key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Escape') setPaymentEditing(null) }}
                    />
                  ) : (
                    <div style={{ ...inputStyle, flex: 1, cursor: 'default' }}>
                      {paymentFields[key]
                        ? <span style={{ color: C.text }}>{paymentFields[key]}</span>
                        : <span style={{ color: C.faint, fontStyle: 'italic' }}>{placeholder}</span>
                      }
                    </div>
                  )}
                  {isEditing ? (
                    <button type="button" onClick={() => handlePaymentSave(key)} title={at('settings.common.save')}
                      className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity" style={{ color: '#9b090c' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                      </svg>
                    </button>
                  ) : (
                    <button type="button" onClick={() => setPaymentEditing(key)} title={at('settings.common.edit')}
                      className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity" style={{ color: '#9b090c' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  )}
                  {savedKey === key && !isPending && (
                    <span className="text-xs flex-shrink-0" style={{ color: '#16a34a' }}>{at('settings.saved')}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Card payments (Flitt). Rendered only for tenants whose online-payment
          module is on — the page passes null otherwise, so a tenant without the
          module never sees a payment gateway section at all. */}
      {onlinePayment && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.onlinePayment.sectionTitle')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.onlinePayment.sectionHint')}</p>
          </div>
          <div className="px-5 py-4 space-y-4" style={{ backgroundColor: C.bg }}>

            {/* Plain-language state. Never claims payments are live unless both
                halves are actually stored. */}
            <div
              className="rounded-lg px-4 py-3"
              style={flittReady
                ? { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }
                : { backgroundColor: '#fff7ed', border: '1px solid #fdba74' }}
            >
              <p className="text-sm font-medium" style={{ color: flittReady ? '#166534' : '#9a3412' }}>
                {at(flittReady ? 'settings.onlinePayment.readyTitle' : 'settings.onlinePayment.pendingTitle')}
              </p>
              <p className="text-xs mt-1" style={{ color: flittReady ? '#15803d' : '#7c2d12' }}>
                {at(flittReady ? 'settings.onlinePayment.readyBody' : 'settings.onlinePayment.pendingBody')}
              </p>
            </div>

            {/* Merchant ID — ordinary text, saved on blur */}
            <div>
              <label className="text-xs block mb-1 font-medium" style={{ color: C.muted }}>{at('settings.onlinePayment.merchantId')}</label>
              <div className="flex items-center gap-2">
                <input
                  style={inputStyle}
                  value={flittMerchantId}
                  placeholder={at('settings.onlinePayment.merchantIdPh')}
                  onChange={e => setFlittMerchantId(e.target.value)}
                  onBlur={handleFlittMerchantIdBlur}
                />
                {savedKey === 'flitt_merchant_id' && !isPending && (
                  <span className="text-xs flex-shrink-0" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
                )}
              </div>
              <p className="text-xs mt-1" style={{ color: C.faint }}>{at('settings.onlinePayment.merchantIdHint')}</p>
            </div>

            {/* Secret key — set-only. The stored value is never sent here, so the
                field always starts empty and blank means "keep what's saved". */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-medium" style={{ color: C.muted }}>{at('settings.onlinePayment.secretKey')}</label>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={flittSecretKeySet
                    ? { backgroundColor: '#dcfce7', color: '#166534' }
                    : { backgroundColor: '#f5efe6', color: C.faint }}
                >
                  {at(flittSecretKeySet ? 'settings.onlinePayment.statusSet' : 'settings.onlinePayment.statusNotSet')}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="password"
                  autoComplete="new-password"
                  style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                  value={flittSecretDraft}
                  placeholder={at('settings.onlinePayment.secretKeyPh')}
                  onChange={e => setFlittSecretDraft(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleFlittSecretSave}
                  disabled={!flittSecretDraft.trim() || isPending}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white flex-shrink-0"
                  style={{ backgroundColor: C.wine, opacity: !flittSecretDraft.trim() || isPending ? 0.5 : 1 }}
                >
                  {isPending ? at('settings.common.saving') : at('settings.onlinePayment.saveKey')}
                </button>
                {savedKey === 'flitt_secret_key' && !isPending && (
                  <span className="text-xs flex-shrink-0" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
                )}
              </div>
              <p className="text-xs mt-1" style={{ color: C.faint }}>{at('settings.onlinePayment.secretKeyHint')}</p>

              {flittSecretKeySet && (
                flittClearConfirm ? (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs" style={{ color: '#b91c1c' }}>{at('settings.onlinePayment.clearConfirm')}</span>
                    <button
                      type="button"
                      onClick={handleFlittSecretClear}
                      disabled={isPending}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                      style={{ backgroundColor: '#b91c1c', opacity: isPending ? 0.6 : 1 }}
                    >
                      {at('settings.onlinePayment.clear')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlittClearConfirm(false)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ border: `1px solid ${C.border}`, color: C.muted, backgroundColor: '#fffdf9' }}
                    >
                      {at('settings.common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFlittClearConfirm(true)}
                    className="text-xs mt-2 px-3 py-1.5 rounded-lg font-medium"
                    style={{ border: `1px solid ${C.border}`, color: '#b91c1c', backgroundColor: '#fffdf9' }}
                  >
                    {at('settings.onlinePayment.clear')}
                  </button>
                )
              )}
            </div>

            <div className="h-px" style={{ backgroundColor: C.border }} />

            {/* Section toggles (#148) — independent per-section on/off for taking
                online payment. Deliberately unrelated to show_company_price_after_booking:
                that setting only controls whether a company sees its price, never
                whether payment is taken (Feature 148 §5). */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>{at('settings.onlinePayment.sections.title')}</p>
              <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.onlinePayment.sections.hint')}</p>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.onlinePayment.sections.individuals')}</p>
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.onlinePayment.sections.individualsHint')}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {savedKey === 'paymentEnabledIndividuals' && !isPending && (
                  <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
                )}
                <Toggle enabled={paymentEnabledIndividuals} onChange={v => handlePaymentSectionToggle('paymentEnabledIndividuals', v)} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.onlinePayment.sections.companies')}</p>
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.onlinePayment.sections.companiesHint')}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {savedKey === 'paymentEnabledCompanies' && !isPending && (
                  <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
                )}
                <Toggle enabled={paymentEnabledCompanies} onChange={v => handlePaymentSectionToggle('paymentEnabledCompanies', v)} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium" style={{ color: C.text }}>{at('settings.onlinePayment.sections.wineOrders')}</p>
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.onlinePayment.sections.wineOrdersHint')}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {savedKey === 'paymentEnabledWineOrders' && !isPending && (
                  <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
                )}
                <Toggle enabled={paymentEnabledWineOrders} onChange={v => handlePaymentSectionToggle('paymentEnabledWineOrders', v)} />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Emails */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.emails.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>
            {at('settings.emails.sectionHint')}
          </p>
        </div>
        <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
          <label className="text-sm block mb-2" style={{ color: C.muted }}>{at('settings.emails.fieldLabel')}</label>
          <div className="flex items-start gap-2">
            <textarea
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={emailMessage}
              placeholder={at('settings.emails.placeholder')}
              onChange={e => setEmailMessage(e.target.value)}
              onBlur={handleEmailMessageBlur}
            />
            {savedKey === 'invoice_email_message' && !isPending && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓</span>
            )}
          </div>
        </div>
      </div>

      {/* Booking Rules */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.bookingRules.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.bookingRules.sectionHint')}</p>
        </div>
        <div className="divide-y" style={{ borderColor: C.border }}>
          {([
            { key: 'min_guests_tasting' as const,       label: at('settings.bookingRules.tastingMin'),     value: minTasting,     set: setMinTasting },
            { key: 'min_guests_tasting_lunch' as const, label: at('settings.bookingRules.tastingLunchMin'), value: minTastingLunch, set: setMinTastingLunch },
          ]).map(row => {
            const isEditing = bookingRulesEditing === row.key
            return (
              <div key={row.key} className="flex items-center gap-4 px-5 py-3" style={{ backgroundColor: C.bg }}>
                <label className="text-sm w-48 flex-shrink-0" style={{ color: C.muted }}>{row.label}</label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <input
                      type="number" min={1} max={200}
                      style={{ ...inputStyle, width: 80 }}
                      value={row.value}
                      autoFocus
                      onChange={e => row.set(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setBookingRulesEditing(null) }}
                    />
                  ) : (
                    <div style={{ ...inputStyle, width: 80, cursor: 'default', textAlign: 'center' }}>
                      <span style={{ color: C.text }}>{row.value}</span>
                    </div>
                  )}
                  <span className="text-xs" style={{ color: C.faint }}>{at('settings.bookingRules.guests')}</span>
                  {isEditing ? (
                    <button type="button" onClick={() => handleBookingRuleSave(row.key)} title={at('settings.common.save')}
                      className="p-1 rounded hover:opacity-70 transition-opacity" style={{ color: '#9b090c' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                      </svg>
                    </button>
                  ) : (
                    <button type="button" onClick={() => setBookingRulesEditing(row.key)} title={at('settings.common.edit')}
                      className="p-1 rounded hover:opacity-70 transition-opacity" style={{ color: '#9b090c' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  )}
                  {savedKey === row.key && !isPending && (
                    <span className="text-xs" style={{ color: '#16a34a' }}>{at('settings.saved')}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Contact Page */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.contactPage.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>
            {at('settings.contactPage.sectionHint')}
          </p>
        </div>
        <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm" style={{ color: C.muted }}>{at('settings.contactPage.mapLabel')}</label>
            <div className="flex items-center gap-2">
              {savedKey === 'maps_embed_url' && !isPending && (
                <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
              )}
              {!mapsEditMode && (
                <button
                  type="button"
                  onClick={() => { setMapsDraft(mapsEmbedUrl); setMapsEditMode(true) }}
                  className="text-xs px-3 py-1 rounded-lg font-medium"
                  style={{ backgroundColor: '#f5efe6', border: `1px solid ${C.border}`, color: C.muted }}
                >
                  {at('settings.common.edit')}
                </button>
              )}
            </div>
          </div>

          {mapsEditMode ? (
            <div className="space-y-2">
              <textarea
                rows={3}
                autoFocus
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.75rem',
                  borderColor: mapsError ? '#b91c1c' : C.border }}
                value={mapsDraft}
                placeholder={at('settings.contactPage.mapPlaceholder')}
                onChange={e => { setMapsDraft(e.target.value); setMapsError(null) }}
              />
              {mapsError && (
                <p className="text-xs" style={{ color: '#b91c1c' }}>{mapsError}</p>
              )}
              <p className="text-xs" style={{ color: C.faint }}>
                {at('settings.contactPage.mapHelp').split('{src}')[0]}<code style={{ fontSize: '0.7rem' }}>src="…"</code>{at('settings.contactPage.mapHelp').split('{src}')[1]}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleMapsSave}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ backgroundColor: C.wine, opacity: isPending ? 0.6 : 1 }}
                >
                  {isPending ? at('settings.common.saving') : at('settings.common.save')}
                </button>
                <button
                  type="button"
                  onClick={handleMapsCancel}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ border: `1px solid ${C.border}`, color: C.muted, backgroundColor: '#fffdf9' }}
                >
                  {at('settings.common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="rounded-lg px-3 py-2.5 text-xs break-all"
              style={{ backgroundColor: '#f5efe6', border: `1px solid ${C.border}`,
                fontFamily: 'monospace', color: C.faint, lineHeight: 1.6 }}
            >
              {mapsEmbedUrl || <span style={{ fontStyle: 'italic' }}>{at('settings.contactPage.noUrlSet')}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.branding.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>
            {at('settings.branding.sectionHint')}
          </p>
        </div>
        <div className="px-5 py-4 space-y-5" style={{ backgroundColor: C.bg }}>
          {brandingError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
              {brandingError}
            </p>
          )}

          {/* Logo */}
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: C.text }}>{at('settings.branding.logoLabel')}</p>
            <p className="text-xs mb-3" style={{ color: C.faint }}>{at('settings.branding.logoHint')}</p>
            <div className="flex items-center gap-3 flex-wrap">
              {logoUrl && (
                <div className="rounded-lg px-3 py-2 border" style={{ backgroundColor: '#fffdf9', borderColor: C.border }}>
                  <img src={logoUrl} alt={logoAlt || 'Logo'} style={{ height: 40, width: 'auto', display: 'block' }} />
                </div>
              )}
              <input ref={logoInputRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
                style={{ display: 'none' }} onChange={handleLogoUpload} />
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => logoInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: '#f5efe6', border: `1px solid ${C.border}`, color: C.muted, opacity: logoUploading ? 0.6 : 1 }}
              >
                {logoUploading ? at('settings.branding.uploading') : logoUrl ? at('settings.branding.replaceLogo') : at('settings.branding.uploadLogo')}
              </button>
              {savedKey === 'logo' && !logoUploading && (
                <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
              )}
            </div>
            {logoUrl && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs flex-shrink-0" style={{ color: C.muted }}>{at('settings.branding.altTextLabel')}</label>
                  {altEditing ? (
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      value={logoAlt}
                      placeholder={at('settings.branding.altTextPh')}
                      autoFocus
                      onChange={e => setLogoAlt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setAltEditing(false) }}
                    />
                  ) : (
                    <div style={{ ...inputStyle, flex: 1, cursor: 'default' }}>
                      {logoAlt
                        ? <span style={{ color: C.text }}>{logoAlt}</span>
                        : <span style={{ color: C.faint, fontStyle: 'italic' }}>{at('settings.branding.altTextDefaultPh')}</span>
                      }
                    </div>
                  )}
                  {altEditing ? (
                    <button type="button" onClick={handleAltTextSave} title={at('settings.common.save')}
                      className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity" style={{ color: '#9b090c' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                      </svg>
                    </button>
                  ) : (
                    <button type="button" onClick={() => setAltEditing(true)} title={at('settings.common.edit')}
                      className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity" style={{ color: '#9b090c' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  )}
                </div>
                {savedKey === 'logo_alt' && !isPending && (
                  <p className="text-xs mt-1" style={{ color: '#16a34a' }}>{at('settings.saved')}</p>
                )}
              </div>
            )}
          </div>

          {/* Favicon */}
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: C.text }}>{at('settings.branding.faviconLabel')}</p>
            <p className="text-xs mb-3" style={{ color: C.faint }}>{at('settings.branding.faviconHint')}</p>
            <div className="flex items-center gap-3 flex-wrap">
              {faviconUrl && (
                <img src={faviconUrl} alt="Favicon" style={{ width: 32, height: 32, borderRadius: 4 }} />
              )}
              <input ref={faviconInputRef} type="file" accept="image/x-icon,image/png,image/svg+xml"
                style={{ display: 'none' }} onChange={handleFaviconUpload} />
              <button
                type="button"
                disabled={faviconUploading}
                onClick={() => faviconInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: '#f5efe6', border: `1px solid ${C.border}`, color: C.muted, opacity: faviconUploading ? 0.6 : 1 }}
              >
                {faviconUploading ? at('settings.branding.uploading') : faviconUrl ? at('settings.branding.replaceFavicon') : at('settings.branding.uploadFavicon')}
              </button>
              {savedKey === 'favicon' && !faviconUploading && (
                <span className="text-xs" style={{ color: '#16a34a' }}>✓ {at('settings.saved')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <button
          type="button"
          onClick={() => setContactOpen(o => !o)}
          className="w-full px-5 py-3 border-b flex items-center justify-between"
          style={{ backgroundColor: '#f5efe6', borderColor: C.border }}
        >
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.contactInfo.sectionTitle')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.contactInfo.sectionHint')}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transform: contactOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: C.faint }}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {contactOpen && (
          <div className="px-5 py-4 space-y-4" style={{ backgroundColor: C.bg }}>

            {([
              { key: 'contact_email',     label: at('settings.contactInfo.email'),     hint: at('settings.contactInfo.emailHint'),     placeholder: at('settings.contactInfo.emailPh'),     value: contactEmail,     set: setContactEmail },
              { key: 'contact_phone',     label: at('settings.contactInfo.phone'),     hint: at('settings.contactInfo.phoneHint'),     placeholder: at('settings.contactInfo.phonePh'),     value: contactPhone,     set: setContactPhone },
              { key: 'contact_address',   label: at('settings.contactInfo.address'),   hint: at('settings.contactInfo.addressHint'),   placeholder: at('settings.contactInfo.addressPh'),   value: contactAddress,   set: setContactAddress },
              { key: 'contact_facebook',  label: at('settings.contactInfo.facebook'),  hint: at('settings.contactInfo.facebookHint'),  placeholder: at('settings.contactInfo.facebookPh'),  value: contactFacebook,  set: setContactFacebook },
              { key: 'contact_instagram', label: at('settings.contactInfo.instagram'), hint: at('settings.contactInfo.instagramHint'), placeholder: at('settings.contactInfo.instagramPh'), value: contactInstagram, set: setContactInstagram },
            ] as const).map(({ key, label, hint, placeholder, value, set }) => {
              const isEditing = contactEditing === key
              return (
                <div key={key}>
                  <label className="text-xs block mb-1 font-medium" style={{ color: C.muted }}>{label}</label>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <input
                        style={inputStyle}
                        value={value}
                        autoFocus
                        onChange={e => set(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setContactEditing(null) }}
                      />
                    ) : (
                      <div style={{ ...inputStyle, flex: 1, cursor: 'default' }}>
                        {value
                          ? <span style={{ color: C.text }}>{value}</span>
                          : <span style={{ color: C.faint, fontStyle: 'italic' }}>{placeholder}</span>
                        }
                      </div>
                    )}

                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => handleContactSave(key, value)}
                        title={at('settings.common.save')}
                        className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ color: '#9b090c' }}
                      >
                        {/* return arrow ↵ */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 10 4 15 9 20"/>
                          <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setContactEditing(key)}
                        title={at('settings.common.edit')}
                        className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ color: '#9b090c' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {savedKey === key && !isPending
                    ? <p className="text-xs mt-1" style={{ color: '#16a34a' }}>{at('settings.saved')}</p>
                    : <p className="text-xs mt-1" style={{ color: C.faint }}>{hint}</p>
                  }
                </div>
              )
            })}

          </div>
        )}
      </div>

      {/* Closed Days */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>{at('settings.closedDays.sectionTitle')}</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('settings.closedDays.sectionHint')}</p>
        </div>
        <div className="px-5 py-4 space-y-4" style={{ backgroundColor: C.bg }}>
          {/* Add form */}
          <div className="flex gap-2 flex-wrap">
            <input
              type="date"
              style={{ ...inputStyle, width: 'auto' }}
              value={newBlockDate}
              onChange={e => setNewBlockDate(e.target.value)}
            />
            <input
              type="text"
              placeholder={at('settings.closedDays.reasonPh')}
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              value={newBlockReason}
              onChange={e => setNewBlockReason(e.target.value)}
            />
            <button
              type="button"
              onClick={handleAddBlockedDate}
              disabled={!newBlockDate || isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{ backgroundColor: 'var(--color-brand)', opacity: !newBlockDate || isPending ? 0.5 : 1 }}
            >
              {at('settings.closedDays.blockDate')}
            </button>
          </div>
          {/* List */}
          {blockedDates.length === 0 ? (
            <p className="text-xs" style={{ color: C.faint }}>{at('settings.closedDays.none')}</p>
          ) : (
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: C.border }}>
              {blockedDates.map(d => (
                <div key={d.id} className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: '#fffdf9' }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: C.text }}>
                      {new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    {d.reason && <span className="ml-2 text-xs" style={{ color: C.faint }}>{d.reason}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveBlockedDate(d.id)}
                    disabled={isPending}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
                    style={{ color: '#b91c1c' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
