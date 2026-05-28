import { getSetting } from '@/app/actions/settings'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const [
    showCompanyPrice,
    enhancedBooking,
    invoiceDetailed,
    recipientName,
    personalNumber,
    bankName,
    bankCode,
    iban,
  ] = await Promise.all([
    getSetting('show_company_price_after_booking'),
    getSetting('enable_enhanced_company_booking'),
    getSetting('invoice_detailed'),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
  ])

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Settings</h1>
      </div>

      <div className="space-y-6">

        {/* Booking section */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e0d4c0' }}>
          <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: '#e0d4c0' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Booking</p>
          </div>
          <SettingsClient
            settings={{
              show_company_price_after_booking: showCompanyPrice === 'true',
              enable_enhanced_company_booking: enhancedBooking === 'true',
              invoice_detailed: invoiceDetailed === 'true',
            }}
            payment={{
              payment_recipient_name: recipientName,
              payment_personal_number: personalNumber,
              payment_bank_name: bankName,
              payment_bank_code: bankCode,
              payment_iban: iban,
            }}
          />
        </div>

      </div>
    </div>
  )
}
