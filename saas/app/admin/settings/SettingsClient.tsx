'use client'

import { useState, useTransition } from 'react'
import { updateSetting } from '@/app/actions/settings'
import { addBlockedDate, removeBlockedDate } from '@/app/actions/blockedDates'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type Props = {
  settings: { show_company_price_after_booking: boolean; enable_enhanced_company_booking: boolean; invoice_detailed: boolean }
  defaultLocale: string
  payment: {
    payment_recipient_name: string
    payment_personal_number: string
    payment_bank_name: string
    payment_bank_code: string
    payment_iban: string
  }
  invoiceEmailMessage: string
  minGuestsTasting: string
  minGuestsTastingLunch: string
  blockedDates?: { id: string; date: string; reason: string | null }[]
  mapsEmbedUrl: string
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

export default function SettingsClient({ settings, defaultLocale: initialDefaultLocale, payment, invoiceEmailMessage, minGuestsTasting, minGuestsTastingLunch, blockedDates: initialBlockedDates = [], mapsEmbedUrl: initialMapsEmbedUrl }: Props) {
  const [defaultLocale, setDefaultLocale] = useState(initialDefaultLocale ?? 'en')
  const [showPrice, setShowPrice] = useState(settings.show_company_price_after_booking)
  const [enhancedBooking, setEnhancedBooking] = useState(settings.enable_enhanced_company_booking)
  const [invoiceDetailed, setInvoiceDetailed] = useState(settings.invoice_detailed)
  const [paymentFields, setPaymentFields] = useState(payment)
  const [emailMessage, setEmailMessage] = useState(invoiceEmailMessage)
  const [minTasting, setMinTasting] = useState(minGuestsTasting)
  const [minTastingLunch, setMinTastingLunch] = useState(minGuestsTastingLunch)
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates)
  const [mapsEmbedUrl, setMapsEmbedUrl] = useState(initialMapsEmbedUrl)
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [savedKey, setSavedKey] = useState<string | null>(null)

  function handleDefaultLocale(locale: string) {
    setDefaultLocale(locale)
    startTransition(async () => {
      await updateSetting('default_locale', locale)
      setSavedKey('default_locale')
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

  function handlePaymentBlur(key: keyof typeof paymentFields) {
    startTransition(async () => {
      await updateSetting(key, paymentFields[key])
      setSavedKey(key)
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

  function handleMapsEmbedUrlBlur() {
    startTransition(async () => {
      await updateSetting('maps_embed_url', mapsEmbedUrl)
      setSavedKey('maps_embed_url')
      setTimeout(() => setSavedKey(null), 2000)
    })
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

  const paymentRows: { key: keyof typeof paymentFields; label: string; placeholder: string }[] = [
    { key: 'payment_recipient_name',   label: 'Recipient name',    placeholder: 'e.g. I/E Elene Khundadze' },
    { key: 'payment_personal_number',  label: 'Personal ID number', placeholder: 'e.g. 01001040828' },
    { key: 'payment_bank_name',        label: 'Recipient bank',     placeholder: 'e.g. JSC TBC Bank' },
    { key: 'payment_bank_code',        label: 'Bank code',          placeholder: 'e.g. TBCBGE22' },
    { key: 'payment_iban',             label: 'Recipient IBAN',     placeholder: 'e.g. GE65TB7183445064300079' },
  ]

  return (
    <div className="space-y-6">

      {/* Default Language */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Language</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>Default language shown to visitors who have not set a preference.</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4" style={{ backgroundColor: C.bg }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>Default site language</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>Visitors can still switch language using the EN / KA toggle in the nav.</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'default_locale' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ Saved</span>
            )}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: C.border }}>
              {(['en', 'ka'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleDefaultLocale(l)}
                  className="px-4 py-1.5 text-sm font-semibold uppercase transition-colors"
                  style={{
                    backgroundColor: defaultLocale === l ? '#7c1d23' : C.bg,
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

      {/* Booking toggles */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Booking</p>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4 border-b"
          style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>Show price after company booking</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              When on, the booking confirmation screen shows the total price for company bookings. Turn off to keep rates private.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'show_company_price_after_booking' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ Saved</span>
            )}
            <Toggle enabled={showPrice} onChange={handleToggle} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4 border-b"
          style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>Enhanced company booking form</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              When on, company bookings on the public site show split guest counts, hot dish selection, and masterclass add-ons.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'enable_enhanced_company_booking' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ Saved</span>
            )}
            <Toggle enabled={enhancedBooking} onChange={handleEnhancedToggle} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6 px-5 py-4"
          style={{ backgroundColor: C.bg }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.text }}>Detailed invoice</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              When on, printed invoices show split guest counts, masterclass lines, and extras. When off, invoices show the total only.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {savedKey === 'invoice_detailed' && !isPending && (
              <span className="text-xs" style={{ color: '#16a34a' }}>✓ Saved</span>
            )}
            <Toggle enabled={invoiceDetailed} onChange={handleInvoiceDetailedToggle} />
          </div>
        </div>
      </div>

      {/* Payment details */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Payment Details</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>Shown on printed invoices. Changes apply to all future prints.</p>
        </div>
        <div className="divide-y" style={{ borderColor: C.border }}>
          {paymentRows.map(({ key, label, placeholder }) => (
            <div key={key} className="flex items-center gap-4 px-5 py-3" style={{ backgroundColor: C.bg }}>
              <label className="text-sm w-48 flex-shrink-0" style={{ color: C.muted }}>{label}</label>
              <div className="flex-1 flex items-center gap-2">
                <input
                  style={inputStyle}
                  value={paymentFields[key]}
                  placeholder={placeholder}
                  onChange={e => setPaymentFields(prev => ({ ...prev, [key]: e.target.value }))}
                  onBlur={() => handlePaymentBlur(key)}
                />
                {savedKey === key && !isPending && (
                  <span className="text-xs flex-shrink-0" style={{ color: '#16a34a' }}>✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Emails */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Emails</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>
            Default message included in invoice emails. You can edit it before each send.
          </p>
        </div>
        <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
          <label className="text-sm block mb-2" style={{ color: C.muted }}>Default invoice message</label>
          <div className="flex items-start gap-2">
            <textarea
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={emailMessage}
              placeholder="e.g. Thank you for your visit! Please find your invoice below."
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
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Booking Rules</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>Minimum guest counts enforced on the public booking form.</p>
        </div>
        <div className="divide-y" style={{ borderColor: C.border }}>
          {([
            { key: 'min_guests_tasting', label: 'Wine Tasting minimum', value: minTasting, set: setMinTasting, onBlur: handleMinTastingBlur },
            { key: 'min_guests_tasting_lunch', label: 'Tasting + Lunch minimum', value: minTastingLunch, set: setMinTastingLunch, onBlur: handleMinTastingLunchBlur },
          ] as const).map(row => (
            <div key={row.key} className="flex items-center gap-4 px-5 py-3" style={{ backgroundColor: C.bg }}>
              <label className="text-sm w-48 flex-shrink-0" style={{ color: C.muted }}>{row.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={200}
                  style={{ ...inputStyle, width: 80 }}
                  value={row.value}
                  onChange={e => row.set(e.target.value)}
                  onBlur={row.onBlur}
                />
                <span className="text-xs" style={{ color: C.faint }}>guests</span>
                {savedKey === row.key && !isPending && (
                  <span className="text-xs" style={{ color: '#16a34a' }}>✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Page */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Contact Page</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>
            Map shown in the &ldquo;How to Find Us&rdquo; section. Paste the embed URL from Google Maps → Share → Embed a map → copy the <code style={{ fontSize: '0.7rem' }}>src</code> value.
          </p>
        </div>
        <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
          <label className="text-sm block mb-2" style={{ color: C.muted }}>Google Maps embed URL</label>
          <div className="flex items-start gap-2">
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.75rem' }}
              value={mapsEmbedUrl}
              placeholder="https://www.google.com/maps/embed?pb=..."
              onChange={e => setMapsEmbedUrl(e.target.value)}
              onBlur={handleMapsEmbedUrlBlur}
            />
            {savedKey === 'maps_embed_url' && !isPending && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓</span>
            )}
          </div>
        </div>
      </div>

      {/* Closed Days */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Closed Days</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>Dates when the winery is closed. Customers cannot book these dates.</p>
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
              placeholder="Reason (optional)"
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              value={newBlockReason}
              onChange={e => setNewBlockReason(e.target.value)}
            />
            <button
              type="button"
              onClick={handleAddBlockedDate}
              disabled={!newBlockDate || isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{ backgroundColor: '#7c1d23', opacity: !newBlockDate || isPending ? 0.5 : 1 }}
            >
              Block date
            </button>
          </div>
          {/* List */}
          {blockedDates.length === 0 ? (
            <p className="text-xs" style={{ color: C.faint }}>No closed days set.</p>
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
