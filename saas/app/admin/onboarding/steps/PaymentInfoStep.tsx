'use client'

import { useState, useEffect } from 'react'
import { User, Hash, Landmark, CreditCard } from 'lucide-react'
import { updateSetting } from '@/app/actions/settings'
import { updatePaymentCredentials } from '@/app/actions/paymentCredentials'
import { adminT } from '@/lib/adminT'
import { C } from './shared'
import { FieldRow } from './ContactInfoStep'

export type PaymentFields = {
  recipientName: string
  personalNumber: string
  bankName: string
  bankCode: string
  iban: string
}

type At = (key: string, vars?: Record<string, string | number>) => string

/**
 * Bank-transfer fields always shown (used by sendInvoiceEmail for any invoice,
 * regardless of module) plus an optional Flitt card-payment sub-section shown
 * only when modulesOnlinePayment is on. Only payment_iban gates this step's
 * done-state / readyToLaunch — see onboarding.ts's paymentInfoStepDone.
 */
export default function PaymentInfoStep({
  locale,
  initialPayment,
  onlinePaymentModuleOn,
  initialOnlinePayment,
  onDoneChange,
}: {
  locale: string
  initialPayment: PaymentFields
  onlinePaymentModuleOn: boolean
  initialOnlinePayment: { merchantId: string; secretKeySet: boolean } | null
  onDoneChange?: (done: boolean) => void
}) {
  const at: At = (key, vars) => adminT(locale, key, vars)
  const [recipientName, setRecipientName] = useState(initialPayment.recipientName)
  const [personalNumber, setPersonalNumber] = useState(initialPayment.personalNumber)
  const [bankName, setBankName] = useState(initialPayment.bankName)
  const [bankCode, setBankCode] = useState(initialPayment.bankCode)
  const [iban, setIban] = useState(initialPayment.iban)

  useEffect(() => {
    onDoneChange?.(Boolean(iban.trim()))
  }, [iban, onDoneChange])

  return (
    <div>
      <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.payment.title')}</p>
      <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.payment.hint')}</p>

      <div className="space-y-2.5">
        <FieldRow icon={User} value={recipientName} onChange={setRecipientName}
          onSaved={v => updateSetting('payment_recipient_name', v)}
          placeholder={at('settings.payment.recipientNamePh')} />
        <FieldRow icon={Hash} value={personalNumber} onChange={setPersonalNumber}
          onSaved={v => updateSetting('payment_personal_number', v)}
          placeholder={at('settings.payment.personalNumberPh')} />
        <FieldRow icon={Landmark} value={bankName} onChange={setBankName}
          onSaved={v => updateSetting('payment_bank_name', v)}
          placeholder={at('settings.payment.bankNamePh')} />
        <FieldRow icon={Hash} value={bankCode} onChange={setBankCode}
          onSaved={v => updateSetting('payment_bank_code', v)}
          placeholder={at('settings.payment.bankCodePh')} />
        <FieldRow icon={CreditCard} value={iban} onChange={setIban}
          onSaved={v => updateSetting('payment_iban', v)}
          placeholder={at('settings.payment.ibanPh')} />
      </div>

      {onlinePaymentModuleOn && (
        <FlittSection at={at} initial={initialOnlinePayment ?? { merchantId: '', secretKeySet: false }} />
      )}
    </div>
  )
}

function FlittSection({ at, initial }: { at: At; initial: { merchantId: string; secretKeySet: boolean } }) {
  const [merchantId, setMerchantId] = useState(initial.merchantId)
  const [lastSavedMerchant, setLastSavedMerchant] = useState(initial.merchantId)
  const [secretKeySet, setSecretKeySet] = useState(initial.secretKeySet)
  const [secretDraft, setSecretDraft] = useState('')
  const [savingMerchant, setSavingMerchant] = useState(false)
  const [savingSecret, setSavingSecret] = useState(false)

  async function handleMerchantBlur() {
    if (merchantId === lastSavedMerchant) return
    setSavingMerchant(true)
    await updatePaymentCredentials({ merchantId })
    setLastSavedMerchant(merchantId)
    setSavingMerchant(false)
  }

  async function handleSecretSave() {
    if (!secretDraft.trim()) return
    setSavingSecret(true)
    await updatePaymentCredentials({ merchantId, secretKey: secretDraft })
    setSecretKeySet(true)
    setSecretDraft('')
    setSavingSecret(false)
  }

  return (
    <div className="mt-6 rounded-xl border p-4" style={{ borderColor: C.border, backgroundColor: '#fffdf9' }}>
      <div className="flex items-center gap-2 mb-1">
        <p className="font-medium text-sm" style={{ color: C.text }}>{at('onboarding.payment.flittTitle')}</p>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f5efe6', color: C.faint }}>
          {at('onboarding.payment.flittOptional')}
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: C.muted }}>{at('onboarding.payment.flittHint')}</p>

      <div className="space-y-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: C.muted }}>{at('settings.onlinePayment.merchantId')}</label>
          <div className="flex items-center gap-2">
            <input
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              onBlur={handleMerchantBlur}
              placeholder={at('settings.onlinePayment.merchantIdPh')}
              className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: C.border, color: C.text, backgroundColor: '#fff' }}
            />
            {savingMerchant && <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>…</span>}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs" style={{ color: C.muted }}>{at('settings.onlinePayment.secretKey')}</label>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={secretKeySet ? { backgroundColor: '#dcfce7', color: '#166534' } : { backgroundColor: '#f5efe6', color: C.faint }}
            >
              {at(secretKeySet ? 'settings.onlinePayment.statusSet' : 'settings.onlinePayment.statusNotSet')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="password"
              autoComplete="new-password"
              value={secretDraft}
              onChange={e => setSecretDraft(e.target.value)}
              placeholder={at('settings.onlinePayment.secretKeyPh')}
              className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: C.border, color: C.text, backgroundColor: '#fff' }}
            />
            <button
              onClick={handleSecretSave}
              disabled={!secretDraft.trim() || savingSecret}
              className="text-xs px-3 py-2 rounded-lg font-medium text-white disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: C.wine }}
            >
              {savingSecret ? at('settings.common.saving') : at('settings.onlinePayment.saveKey')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
