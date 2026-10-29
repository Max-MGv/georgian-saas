'use client'

import { useState } from 'react'
import { adminT } from '@/lib/adminT'
import type { StatusChangeResult } from '@/lib/statusRefusal'

/**
 * One red, dismissible notice for a status change the server refused or that failed
 * (T-318 R2, decision 5 on the Card-payments mockup, board 6).
 *
 * Before this, every caller of `changeBookingStatus` / `changeWineOrderStatus` threw the
 * result away and kept its optimistic patch, so a refusal looked like success until the
 * next refresh. The callers now (1) put the row back the way it was and (2) show this.
 * Covers the refusals that did not exist before (no price, nothing to pay) and the ones
 * that were always silently swallowed ("Order not found", "Failed to update status").
 */
type Subject = 'booking' | 'wine'

export type StatusNoticeState =
  | { kind: 'noPrice' | 'nothingToPay' | 'failed'; subject: Subject; who: string }
  | null

export function useStatusNotice() {
  const [notice, setNotice] = useState<StatusNoticeState>(null)

  /**
   * Feed it the server's result. Returns true when the change did NOT go through, so the
   * caller can put its optimistic patch back. `who` is the guest / customer name, shown in
   * brackets so the sentence needs no Georgian name inflection.
   */
  function report(result: StatusChangeResult, subject: Subject, who?: string | null): boolean {
    if ('success' in result) {
      setNotice(null)
      return false
    }
    const kind = result.code === 'NO_PRICE' ? 'noPrice' : result.code === 'NOTHING_TO_PAY' ? 'nothingToPay' : 'failed'
    setNotice({ kind, subject, who: (who ?? '').trim() })
    return true
  }

  return { notice, report, dismiss: () => setNotice(null) }
}

export function StatusChangeNotice({ notice, onDismiss, locale, className }: {
  notice: StatusNoticeState
  onDismiss: () => void
  locale: string
  className?: string
}) {
  if (!notice) return null
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const who = notice.who ? ` (${notice.who})` : ''
  const [title, body] =
    notice.kind === 'noPrice'
      ? [at('statusNotice.noPrice.title'), at(notice.subject === 'wine' ? 'statusNotice.noPrice.wine' : 'statusNotice.noPrice.booking', { who })]
      : notice.kind === 'nothingToPay'
        ? [at('statusNotice.nothingToPay.title'), at('statusNotice.nothingToPay.body', { who })]
        : [at('statusNotice.failed.title'), at('statusNotice.failed.body')]

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-snug ${className ?? ''}`}
      style={{ backgroundColor: '#fdecea', borderColor: '#f0b4ae', color: '#8a1c16' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" />
      </svg>
      <span><b>{title}</b> {body}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto shrink-0 px-1 text-xs font-semibold underline"
        style={{ minHeight: 40, minWidth: 44, background: 'none', border: 0, color: 'inherit' }}
      >
        {at('statusNotice.dismiss')}
      </button>
    </div>
  )
}
