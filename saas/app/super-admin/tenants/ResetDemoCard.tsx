'use client'

import { useState } from 'react'
import { resetDemoNow } from '@/app/actions/demoReset'

/**
 * "Reset demo now" — Plan-DemoFlowFixes Chunk 8, task 8.2.
 *
 * The demo rebuilds itself at 03:00 UTC. This is the same rebuild on demand,
 * for the minute before a sales call, after a morning of visitors have clicked
 * through it. It calls the same `seedDemoTenant` the cron does.
 *
 * Two-step by design: the first click arms, the second commits. It deletes and
 * rebuilds rows in the production database, and a single mis-click next to the
 * tenant list should not be able to do that. It also reports what it did rather
 * than flashing a tick, because "did that work?" is the only question anyone
 * has after pressing it.
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

export default function ResetDemoCard({ tenantName }: { tenantName: string }) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    const res = await resetDemoNow()
    setBusy(false)
    setArming(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setResult(
      `Rebuilt ${res.tenant}: ${res.created.bookings} bookings and ${res.created.wineOrders} wine orders `
      + `(${res.totals.bookings} bookings total, ${res.totals.revenue.toLocaleString('en-US')}₾) in `
      + `${(res.elapsedMs / 1000).toFixed(1)}s. The setup wizard is back to a fresh account.`
    )
  }

  return (
    <div
      className="rounded-xl border p-5 mt-8"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: C.text }}>Reset the sales demo</h2>
          <p className="text-xs mt-1 max-w-prose" style={{ color: C.muted }}>
            Wipes and rebuilds <strong style={{ color: C.text }}>{tenantName}</strong> — the same
            rebuild the 03:00 UTC job runs, on demand. Every visitor booking, status change and
            wine order is deleted and the curated data is regenerated, along with a fresh setup
            wizard. Takes a few seconds.
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
              {busy ? 'Rebuilding…' : 'Yes — delete and rebuild'}
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
            Reset demo now
          </button>
        )}
      </div>

      {result && <p className="text-xs mt-3" style={{ color: C.ok }}>{result}</p>}
      {error && <p className="text-xs mt-3" style={{ color: C.dangerText }}>Couldn&apos;t reset: {error}</p>}
      {!result && !error && (
        <p className="text-xs mt-3" style={{ color: C.faint }}>
          Safe on any other database: the rebuild looks the demo up by slug and refuses if it
          isn&apos;t there.
        </p>
      )}
    </div>
  )
}
