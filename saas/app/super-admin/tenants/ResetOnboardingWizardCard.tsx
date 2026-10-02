'use client'

import { useState } from 'react'
import { resetOnboardingWizardNow } from '@/app/actions/onboardingWizardReset'

/**
 * "Reset onboarding wizard tenant" — the manual SQL
 * `playwright/notes/10-onboarding-wizard.md` always told a maintainer to run
 * by hand before every `onboarding-wizard.spec.ts` run, now a button
 * (Plan-PlaywrightSuiteHardening Chunk 6, 2026-10-02).
 *
 * Two-step by design, same reasoning as the demo/staging cards: deletes rows
 * with no undo, and a single mis-click next to the tenant list shouldn't be
 * able to do that.
 */

const C = {
  surface: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#64748b',
  danger: '#b91c1c',
  dangerText: '#fecaca',
  ok: '#34d399',
}

export default function ResetOnboardingWizardCard({ tenantName }: { tenantName: string }) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    const res = await resetOnboardingWizardNow()
    setBusy(false)
    setArming(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const { prices, companies, wines, settings } = res.deleted
    setResult(
      `Reset ${res.tenant}: deleted ${prices} price tiers, ${companies} companies, ${wines} wines `
      + `and ${settings} onboarding/contact/payment settings. The Individuals company and the tenant's `
      + `own setup (theme, domain) were left as they were — ready for the wizard to run again.`
    )
  }

  return (
    <div
      className="rounded-xl border p-5 mt-8"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: C.text }}>Reset onboarding wizard tenant</h2>
          <p className="text-xs mt-1 max-w-prose" style={{ color: C.muted }}>
            Clears <strong style={{ color: C.text }}>{tenantName}</strong> back to a fresh, unlaunched state —
            removes its companies, wines, Individuals pricing, and onboarding/contact/payment settings, so
            the setup wizard gates and prompts render as if nobody had been through it yet. Required before
            every run of <code>onboarding-wizard.spec.ts</code>.
          </p>
        </div>

        {arming ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={run}
              disabled={busy}
              className="text-sm px-4 py-2 rounded-lg font-medium whitespace-nowrap"
              style={{ backgroundColor: C.danger, color: '#fff', cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Resetting…' : 'Yes — reset the wizard'}
            </button>
            <button
              onClick={() => setArming(false)}
              disabled={busy}
              className="text-sm px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, cursor: busy ? 'default' : 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setArming(true); setResult(null); setError(null) }}
            className="text-sm px-4 py-2 rounded-lg font-medium whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: 'transparent', color: C.dangerText, border: `1px solid ${C.danger}` }}
          >
            Reset onboarding wizard tenant
          </button>
        )}
      </div>

      {result && <p className="text-xs mt-3" style={{ color: C.ok }}>{result}</p>}
      {error && <p className="text-xs mt-3" style={{ color: C.dangerText }}>Couldn&apos;t reset: {error}</p>}
      {!result && !error && (
        <p className="text-xs mt-3" style={{ color: C.faint }}>
          Safe on any other database: this looks the onboarding-wizard tenant up by slug and refuses if it
          isn&apos;t there.
        </p>
      )}
    </div>
  )
}
