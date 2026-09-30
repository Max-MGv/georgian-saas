'use client'

import { useState } from 'react'
import { clearStagingDataNow } from '@/app/actions/stagingWipe'

/**
 * "Clear staging data" — wipe-only counterpart to ResetDemoCard. Deletes
 * bookings, wine orders, companies, menu items and masterclass items on
 * Staging Winery and stops there — no reseed. For testing flows against a
 * clean setup instead of a rebuilt fixture set.
 *
 * Two-step by design, same reasoning as the demo card: deletes rows with no
 * undo, and a single mis-click next to the tenant list shouldn't be able to
 * do that.
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

export default function ClearStagingDataCard({ tenantName }: { tenantName: string }) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    const res = await clearStagingDataNow()
    setBusy(false)
    setArming(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const { orders, wineOrders, companies, payments } = res.deleted
    setResult(
      `Cleared ${res.tenant}: deleted ${orders} bookings, ${wineOrders} wine orders, ${companies} companies `
      + `and ${payments} payments. Wines, settings and site content were left as they were.`
    )
  }

  return (
    <div
      className="rounded-xl border p-5 mt-8"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: C.text }}>Clear staging data</h2>
          <p className="text-xs mt-1 max-w-prose" style={{ color: C.muted }}>
            Deletes every booking, wine order, company and payment on <strong style={{ color: C.text }}>{tenantName}</strong> —
            no reseed. Wines, settings and site content are left alone, so the tenant stays configured, just empty. Use
            this to test a flow against a clean slate instead of amid fixture data.
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
              {busy ? 'Clearing…' : 'Yes — delete, no reseed'}
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
            Clear staging data
          </button>
        )}
      </div>

      {result && <p className="text-xs mt-3" style={{ color: C.ok }}>{result}</p>}
      {error && <p className="text-xs mt-3" style={{ color: C.dangerText }}>Couldn&apos;t clear: {error}</p>}
      {!result && !error && (
        <p className="text-xs mt-3" style={{ color: C.faint }}>
          Safe on any other database: this looks the staging tenant up by slug and refuses if it isn&apos;t there.
        </p>
      )}
    </div>
  )
}
