'use client'

import { useState, useTransition } from 'react'
import { updateSetting } from '@/app/actions/settings'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type Props = {
  settings: {
    show_company_price_after_booking: boolean
  }
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
      style={{ backgroundColor: enabled ? C.wine : '#d1c4b0' }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

function SettingRow({ label, description, value, settingKey, onSave }: {
  label: string
  description: string
  value: boolean
  settingKey: string
  onSave: (key: string, value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4 border-b last:border-b-0"
      style={{ borderColor: C.border, backgroundColor: C.bg }}>
      <div>
        <p className="text-sm font-medium" style={{ color: C.text }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: C.faint }}>{description}</p>
      </div>
      <div className="flex-shrink-0">
        <Toggle enabled={value} onChange={v => onSave(settingKey, v)} disabled={false} />
      </div>
    </div>
  )
}

export default function SettingsClient({ settings }: Props) {
  const [values, setValues] = useState(settings)
  const [isPending, startTransition] = useTransition()
  const [savedKey, setSavedKey] = useState<string | null>(null)

  function handleSave(key: string, value: boolean) {
    setValues(prev => ({ ...prev, [key]: value }))
    startTransition(async () => {
      await updateSetting(key, value ? 'true' : 'false')
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  return (
    <div>
      <SettingRow
        label="Show price after company booking"
        description="When on, the booking confirmation screen shows the total price for company bookings. Turn off to keep rates private — price is still sent in the confirmation email."
        value={values.show_company_price_after_booking}
        settingKey="show_company_price_after_booking"
        onSave={handleSave}
      />
      {isPending && (
        <p className="text-xs px-5 py-2" style={{ color: C.faint }}>Saving…</p>
      )}
      {savedKey && !isPending && (
        <p className="text-xs px-5 py-2" style={{ color: '#16a34a' }}>✓ Saved</p>
      )}
    </div>
  )
}
