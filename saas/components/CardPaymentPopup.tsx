'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { QRCodeSVG } from 'qrcode.react'
import { adminT } from '@/lib/adminT'
import { asTetri, formatTetri } from '@/lib/money'
import { formatLinkMoment } from '@/lib/formatLinkMoment'

/**
 * The "Card" step of "How was this paid?" (T-318 Chunk 5, mockup board 3/4).
 *
 * Choosing Card does NOT record anything: it asks the guest to pay. This popup makes (or re-opens — one
 * open link per order) the card link for the full amount still owed, shows it as a QR code with Copy /
 * Email / Open, and then asks the server every few seconds whether the order is Paid yet. When Flitt's
 * confirmation marks it Paid (settle.ts) the popup flips to "Paid by card" by itself and tells its parent
 * (`onPaid`). Closing it cancels nothing — a link cannot be cancelled, it just expires.
 *
 * One component for every place an admin takes money: the caller supplies what differs (how to start the
 * link, how to ask "paid yet?", whether e-mail is possible). No second copy of this logic anywhere.
 */
export type CardLink = {
  checkoutUrl: string
  paymentId: string
  /** Tetri. */
  amount: number
  /** ISO — when the link stops working. */
  expiresAt: string
  /** An already-open link for the same amount was handed back instead of a new one. */
  reused: boolean
  canEmail: boolean
}

type Phase = 'loading' | 'waiting' | 'paid' | 'expired' | 'error'

const POLL_MS = 3000

export default function CardPaymentPopup({ locale, subject, start, isPaid, sendEmail, note, onPaid, onClose }: {
  locale: string
  subject: 'booking' | 'wine'
  /** Make or re-open the link. */
  start: () => Promise<({ success: true } & CardLink) | { error: string }>
  /** Is the order Paid yet? (read-only; asked every few seconds while waiting). */
  isPaid: () => Promise<boolean>
  /** E-mail the link to the guest. Leave out where that is not offered (wine orders for now, T-322). */
  sendEmail?: (paymentId: string) => Promise<{ success: true } | { error: string }>
  /** An amber line above the amount (wine: "Delivery fee not set yet — this charges the wines only."). */
  note?: string
  /** Called once, the moment the payment is seen as confirmed. */
  onPaid: () => void
  onClose: () => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const [phase, setPhase] = useState<Phase>('loading')
  const [link, setLink] = useState<CardLink | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [mailError, setMailError] = useState('')
  const alive = useRef(true)
  const paidReported = useRef(false)
  const onPaidRef = useRef(onPaid)
  const startRef = useRef(start)
  const isPaidRef = useRef(isPaid)

  useEffect(() => {
    // Latest callbacks, read by the effects below without re-running them on every parent render.
    onPaidRef.current = onPaid
    startRef.current = start
    isPaidRef.current = isPaid
  })

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  /** Ask for the link and show the outcome. Sets state only after the await. */
  async function load() {
    let result: Awaited<ReturnType<typeof start>>
    try {
      result = await startRef.current()
    } catch {
      result = { error: '' } // expired session / dropped connection — the generic line below
    }
    if (!alive.current) return
    if ('error' in result) {
      setError(result.error)
      setPhase('error')
      return
    }
    setLink(result)
    setPhase(new Date(result.expiresAt).getTime() <= Date.now() ? 'expired' : 'waiting')
  }

  /** Retry / "Make a new link": back to the loading state first. */
  function begin() {
    setPhase('loading'); setError(''); setCopied(false); setMailState('idle'); setMailError('')
    void load()
  }

  // Make the link when the popup opens (the state is already 'loading'). Once only: in development React runs
  // mount effects twice, and a second concurrent request would hand back the first one's link marked "already open".
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // While waiting: ask whether it is paid; stop at expiry. Nothing runs in a hidden tab.
  useEffect(() => {
    if (phase !== 'waiting' || !link) return
    let stopped = false
    const tick = async () => {
      if (stopped || document.hidden) return
      try {
        if (await isPaidRef.current()) {
          if (stopped || !alive.current) return
          setPhase('paid')
          if (!paidReported.current) { paidReported.current = true; onPaidRef.current() }
        }
      } catch {
        // A dropped request is not an answer — try again next tick.
      }
    }
    const timer = setInterval(tick, POLL_MS)
    const left = new Date(link.expiresAt).getTime() - Date.now()
    const expiry = setTimeout(() => { if (!stopped) setPhase('expired') }, Math.max(0, Math.min(left, 2_000_000_000)))
    return () => { stopped = true; clearInterval(timer); clearTimeout(expiry) }
  }, [phase, link])

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.checkoutUrl)
      setCopied(true)
      setTimeout(() => { if (alive.current) setCopied(false) }, 3000)
    } catch {
      // Clipboard can be blocked — the QR and Open link still work.
    }
  }

  async function email() {
    if (!link || !sendEmail) return
    setMailState('sending'); setMailError('')
    let r: Awaited<ReturnType<NonNullable<typeof sendEmail>>>
    try { r = await sendEmail(link.paymentId) } catch { r = { error: at('cardPay.failed') } }
    if (!alive.current) return
    if ('error' in r) { setMailState('idle'); setMailError(r.error); return }
    setMailState('sent')
  }

  const money = link ? formatTetri(asTetri(link.amount)) : ''
  const border = '1px solid var(--site-border)'
  const btn = { border, color: 'var(--site-text)' } as const
  const primary = { backgroundColor: 'var(--color-brand)', color: '#fff' } as const
  const btnClass = 'text-xs px-3 rounded font-medium'
  const btnH = { minHeight: 40 } as const

  return (
    <Dialog.Root open onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        <Dialog.Popup
          style={{
            position: 'fixed', zIndex: 1001, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 360px)', maxHeight: '92vh', overflowY: 'auto',
            backgroundColor: 'var(--site-surface)', color: 'var(--site-text)', border, borderRadius: 16, padding: 20,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)', textAlign: 'center',
          }}
        >
          {phase === 'paid' ? (
            <>
              <Dialog.Title className="text-sm font-semibold mb-1">{at('cardPay.paidTitle')}</Dialog.Title>
              <Dialog.Description className="text-xs mb-4" style={{ color: 'var(--site-secondary)' }}>
                {at(subject === 'wine' ? 'cardPay.paidBody.wine' : 'cardPay.paidBody.booking', { amount: money })}
              </Dialog.Description>
              <button onClick={onClose} className={btnClass} style={{ ...primary, ...btnH }}>{at('cardPay.done')}</button>
            </>
          ) : (
            <>
              <Dialog.Title className="text-sm font-semibold mb-1">{at('cardPay.title')}</Dialog.Title>

              {phase === 'loading' && (
                <Dialog.Description className="text-xs my-6" style={{ color: 'var(--site-secondary)' }}>{at('cardPay.loading')}</Dialog.Description>
              )}

              {phase === 'error' && (
                <>
                  <Dialog.Description className="text-xs mb-3" style={{ color: '#8a1c16' }}>
                    <b>{at('cardPay.failed')}</b>{error ? ` ${error}` : ''}
                  </Dialog.Description>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={begin} className={btnClass} style={{ ...btn, ...btnH }}>{at('cardPay.newLink')}</button>
                    <button onClick={onClose} className={btnClass} style={{ ...primary, ...btnH }}>{at('cardPay.close')}</button>
                  </div>
                </>
              )}

              {(phase === 'waiting' || phase === 'expired') && link && (
                <>
                  <Dialog.Description className="text-xs mb-3" style={{ color: 'var(--site-secondary)' }}>
                    {phase === 'waiting' ? at('cardPay.hint') : ''}
                  </Dialog.Description>
                  {phase === 'waiting' && note && (
                    <p role="note" className="text-xs rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: '#fdf3dc', border: '1px solid #e8c777', color: '#5c3d05', textAlign: 'left' }}>{note}</p>
                  )}
                  {phase === 'waiting' && link.reused && (
                    <p role="note" className="text-xs rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: '#e4eefb', border: '1px solid #a9c3ea', color: '#1e3a6b', textAlign: 'left' }}>
                      {at('cardPay.reused', { amount: money })}
                    </p>
                  )}
                  {phase === 'waiting' && !link.reused && (
                    <p className="text-sm mb-3" style={{ color: 'var(--site-text)' }}>
                      <span className="text-xs block" style={{ color: 'var(--site-secondary)' }}>{at('cardPay.amount')}</span>
                      <b style={{ fontSize: '1.25rem' }}>{money}</b>
                    </p>
                  )}
                  <div
                    role="img"
                    aria-label={at('cardPay.qrAria')}
                    style={{ display: 'inline-block', backgroundColor: '#ffffff', padding: 12, borderRadius: 12, border, opacity: phase === 'expired' ? 0.25 : 1 }}
                  >
                    <QRCodeSVG value={link.checkoutUrl} size={200} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000" aria-hidden="true" />
                  </div>
                  <p className="text-xs mt-3 mb-1 font-semibold" style={{ color: phase === 'expired' ? '#8a1c16' : 'var(--site-text)' }}>
                    {phase === 'waiting' ? `● ${at('cardPay.waiting')}` : at('cardPay.expiredTitle')}
                  </p>
                  <p className="text-xs mb-4" style={{ color: 'var(--site-secondary)' }}>
                    {phase === 'waiting'
                      ? at('cardPay.validUntil', { date: formatLinkMoment(link.expiresAt, locale) })
                      : at('cardPay.expiredBody', { date: formatLinkMoment(link.expiresAt, locale), amount: money })}
                  </p>

                  {phase === 'waiting' ? (
                    <>
                      <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                        <button onClick={copy} className={btnClass} style={{ ...btn, ...btnH }}>{copied ? at('cardPay.copied') : at('cardPay.copy')}</button>
                        {sendEmail && link.canEmail && (
                          <button onClick={email} disabled={mailState === 'sending'} className={`${btnClass} disabled:opacity-50`} style={{ backgroundColor: '#16a34a', color: '#fff', ...btnH }}>
                            {mailState === 'sent' ? at('cardPay.emailSent') : at('cardPay.email')}
                          </button>
                        )}
                      </div>
                      {sendEmail && !link.canEmail && <p className="text-xs mb-2" style={{ color: 'var(--site-secondary)' }}>{at('cardPay.noEmail')}</p>}
                      {mailError && <p role="alert" className="text-xs mb-2" style={{ color: '#8a1c16' }}>{mailError}</p>}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <a href={link.checkoutUrl} target="_blank" rel="noopener noreferrer" className={`${btnClass} inline-flex items-center`} style={{ ...btn, ...btnH }}>{at('cardPay.open')}</a>
                        <button onClick={onClose} className={btnClass} style={{ ...primary, ...btnH }}>{at('cardPay.close')}</button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button onClick={begin} className={btnClass} style={{ ...btn, ...btnH }}>{at('cardPay.newLink')}</button>
                      <button onClick={onClose} className={btnClass} style={{ ...primary, ...btnH }}>{at('cardPay.close')}</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
