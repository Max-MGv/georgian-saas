'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resolveMyBugReport } from '@/app/actions/bugReports'

export type CloseReportLabels = { close: string; confirm: string; yes: string; cancel: string; error: string }

/** T-301: lets the person who sent a report close it themselves (they found the answer, or were mistaken). Two steps, so a slip of the finger does not close it. */
export default function CloseReportButton({ reportId, labels }: { reportId: string; labels: CloseReportLabels }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [pendingNow, startTransition] = useTransition()
  const pending = pendingNow || done

  const run = () => startTransition(async () => {
    const res = await resolveMyBugReport(reportId)
    if ('error' in res) { setMessage(res.error || labels.error); return }
    // Stay in the "closing" state until the refreshed list replaces this card (the button disappears with the status).
    setDone(true)
    router.refresh()
  })

  if (!asking) {
    return (
      <button type="button" onClick={() => { setMessage(''); setAsking(true) }} className="text-xs font-semibold underline" style={{ color: 'var(--site-muted)' }}>
        {labels.close}
      </button>
    )
  }
  return (
    <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--site-bg)', border: '1px solid var(--site-border)' }}>
      <p style={{ color: 'var(--site-text)' }}>{labels.confirm}</p>
      {message && <p className="mt-1.5 text-xs" style={{ color: '#b91c1c' }}>{message}</p>}
      <div className="flex gap-2 mt-2.5">
        <button type="button" onClick={run} disabled={pending} className="btn-wine px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60">{labels.yes}</button>
        <button type="button" onClick={() => setAsking(false)} disabled={pending} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--site-border)', color: 'var(--site-muted)' }}>{labels.cancel}</button>
      </div>
    </div>
  )
}
