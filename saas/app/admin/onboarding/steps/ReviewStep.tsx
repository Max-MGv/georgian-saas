'use client'

import { useState } from 'react'
import { PartyPopper } from 'lucide-react'
import { launchTenant } from '@/app/actions/onboarding'
import { adminT } from '@/lib/adminT'
import { C, StatusIcon, type StepKey } from './shared'

export default function ReviewStep({ locale, items, onJump, initialLaunchedAt, readyToLaunch, onLaunched }: {
  locale: string
  items: { key: StepKey; labelKey: string; done: boolean }[]
  onJump: (key: StepKey) => void
  initialLaunchedAt: string | null
  readyToLaunch: boolean
  onLaunched: () => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const [launchedAt, setLaunchedAt] = useState(initialLaunchedAt)
  const [launching, setLaunching] = useState(false)

  const requiredKeys: StepKey[] = ['companies', 'wines', 'payment']
  const optionalKeys: StepKey[] = ['bookingDetails', 'contact', 'photos']

  async function handleLaunch() {
    setLaunching(true)
    const result = await launchTenant()
    setLaunchedAt(result.launchedAt)
    onLaunched()
    setLaunching(false)
  }

  function row(item: { key: StepKey; labelKey: string; done: boolean }, optional: boolean) {
    return (
      <button
        key={item.key}
        onClick={() => onJump(item.key)}
        className="w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left"
        style={{ borderColor: C.border, backgroundColor: '#fffdf9' }}
      >
        {item.done ? (
          <StatusIcon symbol="✓" title={at('onboarding.review.done')} bg="#f0fdf4" color="#15803d" border="#bbf7d0" />
        ) : optional ? (
          <StatusIcon symbol="○" title={at('onboarding.review.optional')} bg="#f3f4f6" color="#6b7280" border="#d1d5db" />
        ) : (
          <StatusIcon symbol="⚠" title={at('onboarding.review.pending')} bg="#fff7ed" color="#b45309" border="#fdba74" />
        )}
        <span className="text-sm flex-1" style={{ color: C.text }}>{at(item.labelKey)}</span>
        {optional && !item.done && (
          <span className="text-xs" style={{ color: C.muted }}>{at('onboarding.review.optional')}</span>
        )}
      </button>
    )
  }

  return (
    <div>
      <p className="font-medium mb-4" style={{ color: C.text }}>{at('onboarding.review.title')}</p>

      <div className="space-y-2 mb-6">
        {items.filter(i => requiredKeys.includes(i.key)).map(i => row(i, false))}
        {items.filter(i => optionalKeys.includes(i.key)).map(i => row(i, true))}
      </div>

      <div className="rounded-xl border p-5 text-center" style={{ borderColor: C.border, backgroundColor: '#fffdf9' }}>
        {launchedAt ? (
          <>
            <PartyPopper size={24} className="mx-auto mb-2" style={{ color: C.wine }} />
            <p className="text-sm mb-4" style={{ color: C.muted }}>
              {at('onboarding.review.launchedAt', { date: new Date(launchedAt).toLocaleDateString(locale === 'ka' ? 'ka-GE' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) })}
            </p>
          </>
        ) : null}
        <button
          onClick={handleLaunch}
          disabled={launching}
          className="px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
          style={readyToLaunch || launchedAt
            ? { backgroundColor: C.wine, color: 'white' }
            : { backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}` }}
        >
          {launching ? at('onboarding.review.launching') : launchedAt ? at('onboarding.review.launchAgain') : at('onboarding.review.launchButton')}
        </button>
      </div>
    </div>
  )
}
