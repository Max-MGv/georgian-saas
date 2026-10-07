'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketDetail } from '@/lib/ticketService'
import {
  CLOSE_REASON_LABEL, PRIORITY_LABEL, SOURCE_LABEL, STATUS_LABEL, TICKET_AREAS, TICKET_CLOSE_REASONS, TICKET_PRIORITIES,
  TICKET_STATUSES, TICKET_TYPES, TYPE_LABEL, safeHttpUrl,
  type TicketCloseReasonValue, type TicketPriorityValue, type TicketStatusValue, type TicketTypeValue,
} from '@/lib/tickets'
import {
  commentOnTicket, moveTicket, postReviewCard, sendTicketBack, updateTicketFields, uploadTicketAttachment, verifyTicket,
} from '@/app/actions/tickets'
import { C, Chip, EnvBanner, PlainChip, STATUS_TONE, TYPE_TONE, buttonStyle, fullDate, ghostButtonStyle, inputStyle } from '../ui'

type Env = 'PRODUCTION' | 'STAGING' | 'LOCAL'

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  CREATED: { label: 'Created', color: '#818cf8' },
  COMMENT: { label: 'Comment', color: '#94a3b8' },
  STATUS: { label: 'Status', color: '#fbbf24' },
  FIELD: { label: 'Edited', color: '#64748b' },
  REVIEW: { label: 'Ready to test', color: '#5eead4' },
  VERIFIED: { label: 'Verified', color: '#86efac' },
  SENT_BACK: { label: 'Sent back', color: '#fca5a5' },
  REPORT_LINKED: { label: 'Report linked', color: '#818cf8' },
}

const label = (t: string) => <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>{t}</div>
const card = { backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 } as const

export default function TicketDetailClient({ ticket: t, tenants, env }: { ticket: TicketDetail; tenants: { id: string; name: string }[]; env: Env }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState(t.title)
  const [description, setDescription] = useState(t.description)
  const [labels, setLabels] = useState(t.labels.join(', '))
  const [comment, setComment] = useState('')
  const [note, setNote] = useState('')
  const [showReview, setShowReview] = useState(false)
  const [card1, setCard1] = useState({ changed: '', howToTest: '', leftOver: '', commit: '' })
  const [closing, setClosing] = useState(false)
  const [closeReason, setCloseReason] = useState<TicketCloseReasonValue>('WONT_FIX')
  const fileRef = useRef<HTMLInputElement>(null)

  async function run(fn: () => Promise<{ ok: true } | { error: string }>, after?: () => void) {
    if (busy) return
    setBusy(true); setError(null)
    const res = await fn()
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    after?.()
    router.refresh()
  }

  const patch = (p: Parameters<typeof updateTicketFields>[1]) => run(() => updateTicketFields(t.number, p))
  const changeStatus = (s: TicketStatusValue) => {
    if (s === t.status) return
    if (s === 'CLOSED') { setClosing(true); return }
    void run(() => moveTicket(t.number, s))
  }

  const finished = t.status === 'DONE' || t.status === 'CLOSED'

  return (
    <div style={{ color: C.text }}>
      <div className="mb-4"><EnvBanner env={env} /></div>

      {/* Title + chips */}
      <div style={{ ...card, marginBottom: 16 }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() && title !== t.title) void patch({ title }) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          aria-label="Title" maxLength={140}
          style={{ ...inputStyle, width: '100%', fontSize: 20, fontWeight: 700, padding: '6px 8px', backgroundColor: 'transparent', borderColor: 'transparent' }}
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Chip tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}{t.closeReason ? ` · ${CLOSE_REASON_LABEL[t.closeReason]}` : ''}</Chip>
          <select value={t.status} onChange={e => changeStatus(e.target.value as TicketStatusValue)} style={{ ...inputStyle, cursor: 'pointer' }} aria-label="Status">
            {TICKET_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select value={t.priority} onChange={e => void patch({ priority: e.target.value as TicketPriorityValue })} style={{ ...inputStyle, cursor: 'pointer' }} aria-label="Priority">
            {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]} priority</option>)}
          </select>
          <select value={t.type} onChange={e => void patch({ type: e.target.value as TicketTypeValue })} style={{ ...inputStyle, cursor: 'pointer', color: TYPE_TONE[t.type].color }} aria-label="Type">
            {TICKET_TYPES.map(v => <option key={v} value={v}>{TYPE_LABEL[v]}</option>)}
          </select>
          <select value={t.area ?? ''} onChange={e => void patch({ area: e.target.value || null })} style={{ ...inputStyle, cursor: 'pointer' }} aria-label="Area">
            <option value="">No area</option>
            {TICKET_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            {t.area && !(TICKET_AREAS as readonly string[]).includes(t.area) && <option value={t.area}>{t.area}</option>}
          </select>
          <select value={t.tenantId ?? ''} onChange={e => void patch({ tenantId: e.target.value || null })} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 200 }} aria-label="Tenant">
            <option value="">No tenant (internal)</option>
            {tenants.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <PlainChip title="Where this ticket came from">{SOURCE_LABEL[t.source]}</PlainChip>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <input
            value={labels} onChange={e => setLabels(e.target.value)} placeholder="labels, comma separated"
            onBlur={() => { const next = labels.split(',').map(s => s.trim()).filter(Boolean); if (next.join(',') !== t.labels.join(',')) void patch({ labels: next }) }}
            style={{ ...inputStyle, flex: '1 1 220px', maxWidth: 360, fontSize: 12 }} aria-label="Labels"
          />
          <span style={{ fontSize: 12, color: C.faint }}>
            Created {fullDate(t.createdAt)}{t.createdBy ? ` by ${t.createdBy}` : ''} · updated {fullDate(t.updatedAt)}{t.closedAt ? ` · closed ${fullDate(t.closedAt)}` : ''}
          </span>
        </div>
        {error && <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }} role="alert">{error}</div>}
      </div>

      {/* Review queue actions */}
      {t.status === 'REVIEW' && (
        <div style={{ ...card, marginBottom: 16, borderColor: '#0f766e', backgroundColor: '#052b2a' }}>
          <div style={{ fontWeight: 700, color: '#5eead4', marginBottom: 6 }}>Ready to test — waiting for you</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (required to send back, optional when verifying)" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} aria-label="Review note" />
          <div className="flex flex-wrap gap-2 mt-2">
            <button style={buttonStyle} disabled={busy} onClick={() => void run(() => verifyTicket(t.number, note), () => setNote(''))}>✔ Verified — mark Done</button>
            <button style={{ ...ghostButtonStyle, color: '#fca5a5', borderColor: '#7f1d1d' }} disabled={busy} onClick={() => void run(() => sendTicketBack(t.number, note), () => setNote(''))}>↩ Not fixed — send back</button>
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        {/* Left: the ticket itself */}
        <div className="flex flex-col gap-4">
          <div style={card}>
            {label('Description')}
            <textarea
              value={description} onChange={e => setDescription(e.target.value)} rows={7} aria-label="Description"
              placeholder="What is this about? Steps, expected vs actual, links…"
              style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
            />
            {description !== t.description && (
              <div className="flex gap-2 mt-2">
                <button style={buttonStyle} disabled={busy} onClick={() => void patch({ description })}>Save description</button>
                <button style={ghostButtonStyle} onClick={() => setDescription(t.description)}>Revert</button>
              </div>
            )}
          </div>

          <div style={card}>
            <div className="flex items-center justify-between">
              {label(`Screenshots & images (${t.attachments.length})`)}
              <button style={ghostButtonStyle} disabled={busy} onClick={() => fileRef.current?.click()}>+ Add image</button>
              <input
                ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
                onChange={async e => {
                  const f = e.target.files?.[0]; e.target.value = ''
                  if (!f) return
                  if (f.size > 4 * 1024 * 1024) { setError('Image is too large (max 4 MB).'); return }
                  const fd = new FormData(); fd.set('number', String(t.number)); fd.set('file', f)
                  await run(() => uploadTicketAttachment(fd))
                }}
              />
            </div>
            {t.attachments.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint }}>No images yet.</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {t.attachments.map(a => a.signedUrl ? (
                  <a key={a.id} href={a.signedUrl} target="_blank" rel="noopener noreferrer" title={a.fileName}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.signedUrl} alt={a.fileName} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, border: `1px solid ${C.border}`, display: 'block' }} />
                  </a>
                ) : <PlainChip key={a.id}>{a.fileName} (unavailable)</PlainChip>)}
              </div>
            )}
          </div>

          {t.reports.length > 0 && (
            <details style={card}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.muted }}>
                Original report{t.reports.length > 1 ? `s (${t.reports.length})` : ''} — technical context
              </summary>
              {t.reports.map(r => {
                const url = safeHttpUrl(r.pageUrl)
                const crumbs = Array.isArray(r.breadcrumbs) ? (r.breadcrumbs as { type: string; target: string; path: string; timestamp: number }[]) : []
                return (
                  <div key={r.id} style={{ marginTop: 12, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                    <div><strong>Surface:</strong> {r.surface} · <strong>Submitted:</strong> {fullDate(r.createdAt)}</div>
                    <div><strong>By:</strong> {r.submitterEmail ?? 'Anonymous'}</div>
                    <div style={{ wordBreak: 'break-all' }}><strong>Page:</strong> {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>{url}</a> : '(invalid URL)'}</div>
                    {r.userAgent && <div style={{ wordBreak: 'break-all' }}><strong>Browser:</strong> {r.userAgent}</div>}
                    {crumbs.length > 0 && (
                      <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: C.faint }}>
                        {crumbs.map((c, i) => <li key={i}>{c.type} · {c.target} <span style={{ opacity: 0.7 }}>({c.path})</span></li>)}
                      </ol>
                    )}
                  </div>
                )
              })}
            </details>
          )}
        </div>

        {/* Right: timeline */}
        <div className="flex flex-col gap-4">
          {!finished && t.status !== 'REVIEW' && (
            <div style={card}>
              {!showReview ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div style={{ fontSize: 13, color: C.muted }}>Finished the work? Hand it over with a review card.</div>
                  <button style={buttonStyle} onClick={() => setShowReview(true)}>Mark ready to test…</button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {label('Review card — becomes the ticket’s “ready to test” entry')}
                  <textarea value={card1.changed} onChange={e => setCard1({ ...card1, changed: e.target.value })} rows={3} placeholder="What changed? (files, behaviour)" style={{ ...inputStyle, resize: 'vertical' }} aria-label="What changed" />
                  <textarea value={card1.howToTest} onChange={e => setCard1({ ...card1, howToTest: e.target.value })} rows={3} placeholder="How to test it (steps, which tenant / URL)" style={{ ...inputStyle, resize: 'vertical' }} aria-label="How to test" />
                  <textarea value={card1.leftOver} onChange={e => setCard1({ ...card1, leftOver: e.target.value })} rows={2} placeholder="Left over / follow-ups (optional)" style={{ ...inputStyle, resize: 'vertical' }} aria-label="Left over" />
                  <input value={card1.commit} onChange={e => setCard1({ ...card1, commit: e.target.value })} placeholder="Commit (optional)" style={inputStyle} aria-label="Commit" />
                  <div className="flex gap-2">
                    <button style={buttonStyle} disabled={busy} onClick={() => void run(() => postReviewCard(t.number, card1), () => { setShowReview(false); setCard1({ changed: '', howToTest: '', leftOver: '', commit: '' }) })}>Move to Ready to test</button>
                    <button style={ghostButtonStyle} onClick={() => setShowReview(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={card}>
            {label('Timeline')}
            <div className="flex flex-col gap-3">
              {t.events.map(ev => {
                const k = KIND_STYLE[ev.kind] ?? { label: ev.kind, color: C.muted }
                const meta = (ev.meta ?? null) as null | { changed?: string; howToTest?: string; leftOver?: string; commit?: string }
                return (
                  <div key={ev.id} style={{ borderLeft: `3px solid ${k.color}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 11, color: C.faint }}>
                      <span style={{ color: k.color, fontWeight: 700 }}>{k.label}</span> · {ev.actor} · {fullDate(ev.createdAt)}
                    </div>
                    {(ev.kind === 'STATUS' || ev.kind === 'VERIFIED' || ev.kind === 'SENT_BACK' || ev.kind === 'REVIEW') && ev.fromValue && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                        {STATUS_LABEL[ev.fromValue as TicketStatusValue] ?? ev.fromValue} → {STATUS_LABEL[ev.toValue?.split(':')[0] as TicketStatusValue] ?? ev.toValue}
                        {ev.toValue?.includes(':') ? ` (${CLOSE_REASON_LABEL[ev.toValue.split(':')[1] as TicketCloseReasonValue] ?? ev.toValue.split(':')[1]})` : ''}
                      </div>
                    )}
                    {ev.kind === 'FIELD' && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{ev.body}{ev.fromValue || ev.toValue ? `: ${ev.fromValue ?? ''} → ${ev.toValue ?? ''}` : ''}</div>}
                    {ev.kind === 'REVIEW' && meta ? (
                      <div style={{ marginTop: 6, backgroundColor: '#052b2a', border: '1px solid #0f766e', borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        <div><strong style={{ color: '#5eead4' }}>What changed:</strong> {meta.changed}</div>
                        <div style={{ marginTop: 6 }}><strong style={{ color: '#5eead4' }}>How to test:</strong> {meta.howToTest}</div>
                        {meta.leftOver ? <div style={{ marginTop: 6 }}><strong style={{ color: '#5eead4' }}>Left over:</strong> {meta.leftOver}</div> : null}
                        {meta.commit ? <div style={{ marginTop: 6 }}><strong style={{ color: '#5eead4' }}>Commit:</strong> <code>{meta.commit}</code></div> : null}
                      </div>
                    ) : (ev.kind !== 'FIELD' && ev.body) ? (
                      <div style={{ fontSize: 14, marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{ev.body}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-4">
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Add a comment — what we tried, what we fixed, what’s left…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} aria-label="New comment" />
              <div className="mt-2"><button style={{ ...buttonStyle, opacity: comment.trim() ? 1 : 0.5 }} disabled={busy || !comment.trim()} onClick={() => void run(() => commentOnTicket(t.number, comment), () => setComment(''))}>Comment</button></div>
            </div>
          </div>
        </div>
      </div>

      {closing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, width: 'min(420px, 100%)' }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Close this ticket — why?</div>
            <select value={closeReason} onChange={e => setCloseReason(e.target.value as TicketCloseReasonValue)} style={{ ...inputStyle, width: '100%', marginBottom: 14 }}>
              {TICKET_CLOSE_REASONS.map(r => <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button style={ghostButtonStyle} onClick={() => setClosing(false)}>Cancel</button>
              <button style={buttonStyle} onClick={() => { setClosing(false); void run(() => moveTicket(t.number, 'CLOSED', closeReason)) }}>Close ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
