'use client'

import { useState, useTransition } from 'react'
import { updateSetting } from '@/app/actions/settings'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type Props = {
  settings: { show_company_price_after_booking: boolean; enable_enhanced_company_booking: boolean; invoice_detailed: boolean }
  payment: {
    payment_recipient_name: string
    payment_personal_number: string
    payment_bank_name: string
    payment_bank_code: string
    payment_iban: string
  }
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

export default function SettingsClient({ settings, payment }: Props) {
  const [showPrice, setShowPrice] = useState(settings.show_company_price_after_booking)
  const [enhancedBooking, setEnhancedBooking] = useState(settings.enable_enhanced_company_booking)
  const [invoiceDetailed, setInvoiceDetailed] = useState(settings.invoice_detailed)
  const [paymentFields, setPaymentFields] = useState(payment)
  const [isPending, startTransition] = useTransition()
  const [savedKey, setSavedKey] = useState<string | null>(null)

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

  const paymentRows: { key: keyof typeof paymentFields; label: string; placeholder: string }[] = [
    { key: 'payment_recipient_name',   label: 'მიმღების სახელი',    placeholder: 'e.g. ი/მ ელენე ხუნდაძე' },
    { key: 'payment_personal_number',  label: 'პირადი ნომერი',      placeholder: 'e.g. 01001040828' },
    { key: 'payment_bank_name',        label: 'მიმღები ბანკი',      placeholder: 'e.g. ს.ბ "თიბისი ბანკი"' },
    { key: 'payment_bank_code',        label: 'ბანკის კოდი',        placeholder: 'e.g. TBCBGE22' },
    { key: 'payment_iban',             label: 'მიმღების ანგარიში',  placeholder: 'e.g. GE65TB7183445064300079' },
  ]

  return (
    <div className="space-y-6">

      {/* Booking toggles */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
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
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>გადახდის რეკვიზიტები — Payment Details</p>
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

    </div>
  )
}
