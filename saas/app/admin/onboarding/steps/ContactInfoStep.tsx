'use client'

import { useState, useEffect } from 'react'
import { Phone, Mail, MapPin, Map as MapIcon } from 'lucide-react'
import { saveOnboardingContactInfo } from '@/app/actions/onboarding'
import { updateSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import { C } from './shared'

type Field = 'phone' | 'email' | 'address'

// Exported so PaymentInfoStep.tsx can reuse the exact same autosave-on-blur
// field UI for its bank-transfer fields, per the "don't invent a new field
// component" instruction — one field component, two steps.
export function FieldRow({ icon: Icon, value, onChange, onSaved, placeholder }: {
  icon: typeof Phone
  value: string
  onChange: (v: string) => void
  onSaved: (v: string) => Promise<void>
  placeholder: string
}) {
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(value)

  return (
    <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5" style={{ borderColor: C.border }}>
      <Icon size={16} style={{ color: C.muted }} className="flex-shrink-0" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={async () => {
          if (value === lastSaved) return
          setSaving(true)
          await onSaved(value)
          setLastSaved(value)
          setSaving(false)
        }}
        placeholder={placeholder}
        className="flex-1 text-sm outline-none bg-transparent"
        style={{ color: C.text }}
      />
      {saving && <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>…</span>}
    </div>
  )
}

export default function ContactInfoStep({ locale, initialContact, initialMapsEmbedUrl, onDoneChange }: {
  locale: string
  initialContact: { phone: string; email: string; address: string }
  initialMapsEmbedUrl: string
  onDoneChange?: (done: boolean) => void
}) {
  const at = (key: string) => adminT(locale, key)
  const [phone, setPhone] = useState(initialContact.phone)
  const [email, setEmail] = useState(initialContact.email)
  const [address, setAddress] = useState(initialContact.address)
  const [mapsEmbedUrl, setMapsEmbedUrl] = useState(initialMapsEmbedUrl)

  useEffect(() => {
    onDoneChange?.(Boolean(phone.trim() || email.trim() || address.trim()))
  }, [phone, email, address, onDoneChange])

  async function save(field: Field, value: string) {
    await saveOnboardingContactInfo(field, value)
  }

  return (
    <div>
      <p className="font-medium mb-4" style={{ color: C.text }}>{at('onboarding.contact.title')}</p>
      <div className="space-y-2.5">
        <FieldRow icon={Phone} value={phone} onChange={setPhone} onSaved={v => save('phone', v)} placeholder={at('onboarding.contact.phonePlaceholder')} />
        <FieldRow icon={Mail} value={email} onChange={setEmail} onSaved={v => save('email', v)} placeholder={at('onboarding.contact.emailPlaceholder')} />
        <FieldRow icon={MapPin} value={address} onChange={setAddress} onSaved={v => save('address', v)} placeholder={at('onboarding.contact.addressPlaceholder')} />
      </div>

      {/* Maps embed — tracked separately (mapsEmbedSet) and never gates this
          step's done-state, same rule as today: any one of phone/email/address
          already satisfies the step. */}
      <p className="text-xs font-semibold uppercase tracking-wide mt-5 mb-2" style={{ color: C.muted }}>
        {at('onboarding.contact.mapsEmbedLabel')}
      </p>
      <FieldRow
        icon={MapIcon}
        value={mapsEmbedUrl}
        onChange={setMapsEmbedUrl}
        onSaved={v => updateSetting('maps_embed_url', v)}
        placeholder={at('onboarding.contact.mapsEmbedPlaceholder')}
      />
      <p className="text-xs mt-1.5" style={{ color: C.faint }}>{at('onboarding.contact.mapsEmbedHint')}</p>
    </div>
  )
}
