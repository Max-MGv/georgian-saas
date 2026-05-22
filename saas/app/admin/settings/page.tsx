import { getSetting } from '@/app/actions/settings'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const showCompanyPrice = await getSetting('show_company_price_after_booking')

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Settings</h1>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e0d4c0' }}>

        {/* Section header */}
        <div className="px-5 py-3 border-b" style={{ backgroundColor: '#f5efe6', borderColor: '#e0d4c0' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>Booking</p>
        </div>

        <SettingsClient
          settings={{
            show_company_price_after_booking: showCompanyPrice === 'true',
          }}
        />

      </div>
    </div>
  )
}
