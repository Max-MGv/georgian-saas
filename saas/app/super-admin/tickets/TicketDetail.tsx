'use client'

/**
 * One ticket, shown in the side panel over the board (Plan-TicketsV2 Tier 1). Everything is shown once:
 * the status is a single coloured control, title and description are read mode until you press the
 * pencil, images open in the viewer, field edits collapse into one quiet line on the timeline.
 */

import { useRef, useState, type ReactNode } from 'react'
import {
  Building2, Check, ChevronDown, ChevronRight, FlaskConical, ImagePlus, Info, Lightbulb, MapPin, MessageCircleQuestion, Pencil,
  RotateCcw, Search, Send, Undo2, X,
} from 'lucide-react'
import type { TicketDetail as Ticket } from '@/lib/ticketService'
import {
  CLOSE_REASON_LABEL, LIVE_LABEL, MAX_TITLE, PRIORITY_LABEL, SOURCE_LABEL, STATUS_LABEL, TICKET_AREAS, TYPE_LABEL, liveStage, parseSteps,
  safeHttpUrl, type TicketCloseReasonValue, type TicketStatusValue,
} from '@/lib/tickets'
import {
  addTicketLink, answerTicketQuestion, commentOnTicket, emailTicketReporters, moveTicket, postReviewCard, removeTicketLink,
  sendTicketBack, setTicketClientReply, setTicketLive,
  updateTicketFields, uploadTicketAttachment, verifyTicket,
} from '@/app/actions/tickets'
import {
  C, CloseReasonDialog, PRIORITY_ICON, PRIORITY_COLOR, PRIORITY_OPTIONS, Picker, SOURCE_HINT, STATUS_ICON, STATUS_OPTIONS, STATUS_TONE,
  SourceIcon, StatusPill, TYPE_ICON, TYPE_OPTIONS, TYPE_TONE, ActorIcon, age, buttonStyle, fullDate, ghostButtonStyle, inputStyle,
} from './ui'
import Markdown from './Markdown'
import Lightbox from '@/components/Lightbox'
import {
  ClientSection, Decisions, LIVE_COLOR, LIVE_ICON, LIVE_OPTIONS, Links, OpenQuestions, TestChecklist, TextSection, actorName, sectionTitle,
  type DecisionItem, type QuestionItem,
} from './TicketSections'

type Result = { ok: true } | { error: string }
type ReviewMeta = { changed?: string; howToTest?: string; steps?: string[]; url?: string; leftOver?: string; commit?: string }
type Ev = Ticket['events'][number]

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** Open questions and the decisions taken so far, from the timeline (Plan-TicketsV2 2.2). */
function questionsAndDecisions(events: Ev[]): { open: QuestionItem[]; decisions: DecisionItem[] } {
  const answers = new Map<string, Ev>()
  for (const e of events) if (e.kind === 'ANSWER') { const q = (e.meta as { questionId?: string } | null)?.questionId; if (q) answers.set(q, e) }
  const open: QuestionItem[] = []
  const decisions: DecisionItem[] = []
  for (const e of events) {
    if (e.kind === 'QUESTION') {
      const a = answers.get(e.id)
      if (a) decisions.push({ id: a.id, question: e.body, answer: a.body, actor: a.actor, createdAt: a.createdAt })
      else open.push({ id: e.id, text: e.body, options: (e.meta as { options?: string[] } | null)?.options ?? [], actor: e.actor, createdAt: e.createdAt })
    }
    if (e.kind === 'DECISION') decisions.push({ id: e.id, answer: e.body, actor: e.actor, createdAt: e.createdAt })
  }
  decisions.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  return { open, decisions }
}

export default function TicketDetail({ t, tenants, onChanged, onOpenTicket }: {
  t: Ticket
  tenants: { id: string; name: string }[]
  /** Re-read the ticket (and the board) after a change. Controls stay locked until it resolves. */
  onChanged: () => Promise<void>
  onOpenTicket: (n: number) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [note, setNote] = useState('')
  const [showHandOver, setShowHandOver] = useState(false)
  const [card, setCard] = useState({ changed: '', howToTest: '', leftOver: '', commit: '' })
  const [closing, setClosing] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRetry = useRef(false)

  async function run(fn: () => Promise<Result>, after?: () => void): Promise<boolean> {
    if (busy) return false
    setBusy(true); setError(null)
    try {
      const res = await fn()
      if ('error' in res) { setError(res.error); return false }
      after?.()
      await onChanged()
      return true
    } catch {
      setError('Something went wrong. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const patch = (p: Parameters<typeof updateTicketFields>[1], after?: () => void) => run(() => updateTicketFields(t.number, p), after)
  const changeStatus = (s: TicketStatusValue) => {
    if (s === t.status) return
    if (s === 'CLOSED') { setClosing(true); return }
    void run(() => moveTicket(t.number, s))
  }

  async function uploadFiles(files: File[]) {
    const images = files.filter(f => IMAGE_TYPES.includes(f.type))
    if (images.length === 0) { if (files.length) setError('Only PNG, JPEG, WebP or GIF images can be attached.'); return }
    const tooBig = images.find(f => f.size > MAX_IMAGE_BYTES)
    if (tooBig) { setError(`${tooBig.name || 'Image'} is too large (max 4 MB).`); return }
    setError(null); setUploading(images.length)
    try {
      for (const f of images) {
        const fd = new FormData(); fd.set('number', String(t.number)); fd.set('file', f)
        const res = await uploadTicketAttachment(fd)
        if ('error' in res) { setError(res.error); break }
        setUploading(n => n - 1)
      }
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(0)
      await onChanged()
    }
  }

  const finished = t.status === 'DONE' || t.status === 'CLOSED'
  const reviews = t.events.filter(e => e.kind === 'REVIEW')
  const latestReview = reviews[reviews.length - 1]
  const qd = questionsAndDecisions(t.events)
  const live = liveStage(t)
  const tenantName = (id: string | null) => (id ? tenants.find(x => x.id === id)?.name ?? 'Unknown tenant' : null)
  const images = t.attachments.filter(a => a.signedUrl).map(a => ({ src: a.signedUrl!, name: a.fileName }))

  return (
    <div
      style={{ color: C.text, position: 'relative' }}
      onPaste={e => {
        const files = Array.from(e.clipboardData.files)
        if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); void uploadFiles(files) }
      }}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); void uploadFiles(Array.from(e.dataTransfer.files)) } }}
    >
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, border: '2px dashed #6366f1', borderRadius: 12, backgroundColor: 'rgba(49,46,129,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#e0e7ff', pointerEvents: 'none' }}>
          Drop images to attach
        </div>
      )}

      {/* ── Title ─────────────────────────────────────────────── */}
      {editingTitle === null ? (
        <div className="flex items-start gap-2 group">
          <h2 onClick={() => setEditingTitle(t.title)} style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, margin: 0, flex: 1, cursor: 'text', wordBreak: 'break-word' }} title="Click to edit">{t.title}</h2>
          <button onClick={() => setEditingTitle(t.title)} aria-label="Edit title" title="Edit title" style={{ ...ghostButtonStyle, border: 'none', padding: 6 }}><Pencil size={15} /></button>
        </div>
      ) : (
        <div>
          {/* A text area, not an input: titles run up to 140 characters and must wrap on a phone. */}
          <textarea
            autoFocus value={editingTitle} maxLength={MAX_TITLE} rows={2} aria-label="Title"
            onChange={e => setEditingTitle(e.target.value.split('\n').join(' '))}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (editingTitle.trim()) void patch({ title: editingTitle }, () => setEditingTitle(null)) }
              if (e.key === 'Escape') { e.stopPropagation(); setEditingTitle(null) }
            }}
            style={{ ...inputStyle, width: '100%', fontSize: 19, fontWeight: 700, resize: 'none', lineHeight: 1.3 }}
          />
          <SaveCancel busy={busy} disabled={!editingTitle.trim()} onSave={() => void patch({ title: editingTitle }, () => setEditingTitle(null))} onCancel={() => setEditingTitle(null)} />
        </div>
      )}

      {/* ── Fields: each one shown once, as an icon control ─────── */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Picker label="Status" value={t.status} options={STATUS_OPTIONS} onChange={changeStatus} disabled={busy}
          buttonStyle={{ backgroundColor: STATUS_TONE[t.status].bg, borderColor: STATUS_TONE[t.status].border, color: STATUS_TONE[t.status].color, fontWeight: 700, borderRadius: 999 }}>
          {(() => { const I = STATUS_ICON[t.status]; return <I size={14} aria-hidden /> })()}
          {STATUS_LABEL[t.status]}{t.closeReason ? ` · ${CLOSE_REASON_LABEL[t.closeReason]}` : ''}
          <ChevronDown size={13} aria-hidden />
        </Picker>
        <Picker label={`Priority: ${PRIORITY_LABEL[t.priority]}`} value={t.priority} options={PRIORITY_OPTIONS} onChange={v => void patch({ priority: v })} disabled={busy}>
          {(() => { const I = PRIORITY_ICON[t.priority]; return <I size={15} color={PRIORITY_COLOR[t.priority]} aria-hidden /> })()}
          <span style={{ color: C.muted }}>{PRIORITY_LABEL[t.priority]}</span>
        </Picker>
        <Picker label={`Type: ${TYPE_LABEL[t.type]}`} value={t.type} options={TYPE_OPTIONS} onChange={v => void patch({ type: v })} disabled={busy}>
          {(() => { const I = TYPE_ICON[t.type]; return <I size={15} color={TYPE_TONE[t.type].color} aria-hidden /> })()}
          <span style={{ color: C.muted }}>{TYPE_LABEL[t.type]}</span>
        </Picker>
        <Picker label="Area" value={t.area ?? '__none'} disabled={busy}
          options={[{ value: '__none', label: 'No area' }, ...TICKET_AREAS.map(a => ({ value: a as string, label: a })), ...(t.area && !(TICKET_AREAS as readonly string[]).includes(t.area) ? [{ value: t.area, label: t.area }] : [])]}
          onChange={v => void patch({ area: v === '__none' ? null : v })}>
          <MapPin size={14} color={C.faint} aria-hidden /><span style={{ color: t.area ? C.muted : C.faint }}>{t.area ?? 'Area'}</span>
        </Picker>
        <Picker label="Tenant" value={t.tenantId ?? '__none'} disabled={busy}
          options={[{ value: '__none', label: 'Internal (no tenant)' }, ...tenants.map(x => ({ value: x.id, label: x.name }))]}
          onChange={v => void patch({ tenantId: v === '__none' ? null : v })} buttonStyle={{ maxWidth: 220 }}>
          <Building2 size={14} color={C.faint} aria-hidden />
          <span style={{ color: t.tenantName ? C.muted : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tenantName ?? 'Internal'}</span>
        </Picker>
        <Picker label={`Where is it live: ${LIVE_LABEL[live]}`} value={live} options={LIVE_OPTIONS} disabled={busy}
          onChange={v => void run(() => setTicketLive(t.number, v))}
          buttonStyle={{ borderColor: live === 'NONE' ? C.border : LIVE_COLOR[live] + '66' }}>
          {(() => { const I = LIVE_ICON[live]; return <I size={14} color={LIVE_COLOR[live]} aria-hidden /> })()}
          <span style={{ color: live === 'NONE' ? C.faint : LIVE_COLOR[live] }}>{LIVE_LABEL[live]}</span>
        </Picker>
      </div>
      {error && <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }} role="alert">{error}</div>}

      {/* ── Questions waiting for Max: answer with one tap ── */}
      <OpenQuestions questions={qd.open} busy={busy} onOpenTicket={onOpenTicket}
        onAnswer={(questionId, answer) => run(() => answerTicketQuestion(t.number, questionId, answer))} />

      {/* ── Waiting for Max: the latest hand-over as a checklist + Verify / Send back ── */}
      {t.status === 'REVIEW' && (
        <div style={{ marginTop: 16, borderRadius: 12, border: '1px solid #0f766e', backgroundColor: '#052b2a', padding: 14 }}>
          <div className="flex items-center gap-2" style={{ fontWeight: 700, color: '#5eead4', marginBottom: 8 }}>
            <FlaskConical size={16} aria-hidden /> Ready to test — waiting for you
          </div>
          {latestReview && (() => {
            const m = latestReview.meta as ReviewMeta | null
            if (!m) return <Markdown text={latestReview.body} onTicket={onOpenTicket} />
            const steps = m.steps?.length ? m.steps : parseSteps(m.howToTest ?? '')
            return (
              <>
                <ReviewCard meta={{ changed: m.changed }} fallback="" onOpenTicket={onOpenTicket} />
                {steps.length > 0 && <TestChecklist reviewId={latestReview.id} steps={steps} url={m.url} onFail={line => setNote(n => (n.trim() ? n.trimEnd() + '\n' + line : line))} />}
                <ReviewCard meta={{ leftOver: m.leftOver, commit: m.commit }} fallback="" onOpenTicket={onOpenTicket} />
              </>
            )
          })()}
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (needed to send back, optional when verifying)" style={{ ...inputStyle, width: '100%', resize: 'vertical', marginTop: 10 }} aria-label="Review note" />
          <div className="flex flex-wrap gap-2 mt-2">
            <button style={{ ...buttonStyle, backgroundColor: '#15803d', borderColor: '#16a34a' }} disabled={busy} onClick={() => void run(() => verifyTicket(t.number, note), () => setNote(''))}><Check size={15} aria-hidden /> Works — Done</button>
            <button style={{ ...ghostButtonStyle, color: '#fca5a5', borderColor: '#7f1d1d' }} disabled={busy} onClick={() => void run(() => sendTicketBack(t.number, note), () => setNote(''))}><Undo2 size={15} aria-hidden /> Not fixed — send back</button>
          </div>
        </div>
      )}

      {/* ── The ticket as a short document: Request → Analysis → Solution (+ decisions) → Links ── */}
      <TextSection title="Request" value={t.description} busy={busy} onOpenTicket={onOpenTicket}
        hint={t.source === 'WIDGET' || t.source === 'PRODUCTION' ? 'The reporter’s own words' : undefined} emptyLabel="Add a description"
        placeholder={'What is this about? Steps, expected vs actual, links…\nTip: "- " makes a list, `code`, **bold**, T-12 links a ticket.'}
        onSave={v => patch({ description: v })} />
      <TextSection title="Analysis" icon={Search} value={t.analysis} busy={busy} onOpenTicket={onOpenTicket} emptyLabel="Add the analysis"
        placeholder={'What is really going on? Root cause, what we found, options considered…'}
        onSave={v => patch({ analysis: v })} />
      <TextSection title="Solution" icon={Lightbulb} value={t.solution} busy={busy} onOpenTicket={onOpenTicket} emptyLabel="Add the agreed solution"
        placeholder={'What we agreed to do (or did), and why this way.'}
        onSave={v => patch({ solution: v })}>
        <Decisions items={qd.decisions} onOpenTicket={onOpenTicket} />
      </TextSection>
      <Links links={t.links} titles={t.linkedTitles} busy={busy} onOpenTicket={onOpenTicket}
        onAdd={l => run(() => addTicketLink(t.number, l))} onRemove={l => void run(() => removeTicketLink(t.number, l))} />
      {(t.source === 'WIDGET' || t.source === 'PRODUCTION' || t.reports.length > 0) && (
        <ClientSection t={t} busy={busy} onOpenTicket={onOpenTicket}
          onSaveReply={v => run(() => setTicketClientReply(t.number, v))}
          onEmail={() => run(() => emailTicketReporters(t.number))} />
      )}

      {/* ── Images ─────────────────────────────────────────────── */}
      <section style={{ marginTop: 20 }}>
        {sectionTitle(<>Images {t.attachments.length > 0 && <span style={{ color: C.muted }}>{t.attachments.length}</span>}</>)}
        <div className="flex flex-wrap gap-2">
          {t.attachments.map(a => {
            const i = images.findIndex(im => im.src === a.signedUrl)
            return a.signedUrl ? (
              <button key={a.id} onClick={() => setViewer(i)} title={`${a.fileName} — click to view`} aria-label={`View image ${a.fileName}`}
                style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', background: '#0f172a', width: 120, height: 90 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.signedUrl} alt={a.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  // Image links expire after an hour: if a panel was left open, fetch fresh ones (once).
                  onError={() => { if (!imageRetry.current) { imageRetry.current = true; void onChanged() } }} />
              </button>
            ) : <div key={a.id} title={a.fileName} style={{ width: 120, height: 90, borderRadius: 8, border: `1px dashed ${C.border}`, fontSize: 11, color: C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6 }}>unavailable</div>
          })}
          <button
            onClick={() => fileRef.current?.click()} disabled={busy || uploading > 0}
            title="Add images — or paste (Ctrl+V) / drop them anywhere on the ticket" aria-label="Add images"
            style={{ width: 120, height: 90, borderRadius: 8, border: `1px dashed #334155`, background: 'transparent', color: C.faint, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11 }}
          >
            <ImagePlus size={20} aria-hidden />{uploading > 0 ? `Uploading ${uploading}…` : 'Add · paste · drop'}
          </button>
          <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void uploadFiles(f) }} />
        </div>
      </section>

      {/* ── Hand over for testing (when someone other than Claude did the work) ── */}
      {!finished && t.status !== 'REVIEW' && (
        <section style={{ marginTop: 20 }}>
          {!showHandOver ? (
            <button style={{ ...ghostButtonStyle, color: '#5eead4', borderColor: '#134e4a' }} onClick={() => setShowHandOver(true)}><FlaskConical size={15} aria-hidden /> Mark ready to test…</button>
          ) : (
            <div className="flex flex-col gap-2" style={{ border: `1px solid #134e4a`, borderRadius: 12, padding: 12 }}>
              {sectionTitle(<><FlaskConical size={13} /> Hand over for testing</>)}
              <textarea value={card.changed} onChange={e => setCard({ ...card, changed: e.target.value })} rows={3} placeholder="What changed?" style={{ ...inputStyle, resize: 'vertical' }} aria-label="What changed" />
              <textarea value={card.howToTest} onChange={e => setCard({ ...card, howToTest: e.target.value })} rows={3} placeholder="How to test it (steps, which tenant / URL)" style={{ ...inputStyle, resize: 'vertical' }} aria-label="How to test" />
              <textarea value={card.leftOver} onChange={e => setCard({ ...card, leftOver: e.target.value })} rows={2} placeholder="Left over (optional)" style={{ ...inputStyle, resize: 'vertical' }} aria-label="Left over" />
              <input value={card.commit} onChange={e => setCard({ ...card, commit: e.target.value })} placeholder="Commit (optional)" style={inputStyle} aria-label="Commit" />
              <div className="flex gap-2">
                <button style={buttonStyle} disabled={busy} onClick={() => void run(() => postReviewCard(t.number, card), () => { setShowHandOver(false); setCard({ changed: '', howToTest: '', leftOver: '', commit: '' }) })}>Move to Ready to test</button>
                <button style={ghostButtonStyle} onClick={() => setShowHandOver(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Timeline ───────────────────────────────────────────── */}
      <section style={{ marginTop: 24 }}>
        {sectionTitle('Activity')}
        <Timeline events={t.events} tenantName={tenantName} latestReviewId={t.status === 'REVIEW' ? latestReview?.id : undefined} onOpenTicket={onOpenTicket} />
        <div style={{ marginTop: 14 }}>
          <textarea
            value={comment} onChange={e => setComment(e.target.value)} rows={3} aria-label="New comment"
            placeholder="Add a comment… (Ctrl+Enter sends)"
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) void run(() => commentOnTicket(t.number, comment), () => setComment('')) }}
            style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
          />
          <div className="mt-2 flex justify-end">
            <button style={{ ...buttonStyle, opacity: comment.trim() ? 1 : 0.5 }} disabled={busy || !comment.trim()} onClick={() => void run(() => commentOnTicket(t.number, comment), () => setComment(''))}><Send size={14} aria-hidden /> Comment</button>
          </div>
        </div>
      </section>

      {/* ── Details: the rarely needed facts, folded away ────────── */}
      <details style={{ marginTop: 24, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}><Info size={14} aria-hidden /> Details{t.reports.length > 0 ? ' & original report' : ''}</summary>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginTop: 10 }}>
          <div className="flex items-center gap-2"><SourceIcon source={t.source} /> {SOURCE_LABEL[t.source]} — {SOURCE_HINT[t.source]}</div>
          <div>Created {fullDate(t.createdAt)}{t.createdBy ? ` by ${actorName(t.createdBy)}` : ''}</div>
          <div>Updated {fullDate(t.updatedAt)}{t.closedAt ? ` · finished ${fullDate(t.closedAt)}` : ''}</div>
          <LabelsEditor labels={t.labels} busy={busy} onSave={labels => void patch({ labels })} />
          {t.reports.map(r => {
            const url = safeHttpUrl(r.pageUrl)
            const crumbs = Array.isArray(r.breadcrumbs) ? (r.breadcrumbs as { type: string; target: string; path: string }[]) : []
            return (
              <div key={r.id} style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
                <div><strong>Report from</strong> {r.surface} · {fullDate(r.createdAt)}</div>
                <div><strong>By:</strong> {r.submitterEmail ?? 'Anonymous'}</div>
                <div style={{ wordBreak: 'break-all' }}><strong>Page:</strong> {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>{url}</a> : '(invalid URL)'}</div>
                {r.userAgent && <div style={{ wordBreak: 'break-all' }}><strong>Browser:</strong> {r.userAgent}</div>}
                {crumbs.length > 0 && (
                  <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: C.faint, listStyle: 'decimal' }}>
                    {crumbs.map((c, i) => <li key={i}>{c.type} · {c.target} <span style={{ opacity: 0.7 }}>({c.path})</span></li>)}
                  </ol>
                )}
              </div>
            )
          })}
        </div>
      </details>

      {closing && (
        <CloseReasonDialog title={t.title} onCancel={() => setClosing(false)}
          onPick={(r, dup) => { setClosing(false); void run(() => moveTicket(t.number, 'CLOSED', r, dup ?? null)) }} />
      )}
      {viewer !== null && images.length > 0 && (
        <Lightbox images={images} index={Math.min(viewer, images.length - 1)} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}

function SaveCancel({ busy, disabled, onSave, onCancel }: { busy: boolean; disabled?: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2 mt-2">
      <button style={{ ...buttonStyle, opacity: disabled ? 0.5 : 1 }} disabled={busy || disabled} onClick={onSave}><Check size={14} aria-hidden /> Save</button>
      <button style={ghostButtonStyle} onClick={onCancel}><X size={14} aria-hidden /> Cancel</button>
    </div>
  )
}

function LabelsEditor({ labels, busy, onSave }: { labels: string[]; busy: boolean; onSave: (l: string[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        Labels: {labels.length ? labels.map(l => <span key={l} style={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 7px' }}>{l}</span>) : <span style={{ color: C.faint }}>none</span>}
        <button onClick={() => setDraft(labels.join(', '))} aria-label="Edit labels" title="Edit labels" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', display: 'inline-flex' }}><Pencil size={12} /></button>
      </div>
    )
  }
  const save = () => { const next = draft.split(',').map(s => s.trim()).filter(Boolean); setDraft(null); if (next.join(',') !== labels.join(',')) onSave(next) }
  return (
    <div className="flex items-center gap-2">
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="labels, comma separated" aria-label="Labels"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) } }}
        style={{ ...inputStyle, flex: 1, maxWidth: 320, fontSize: 12 }} />
      <button style={{ ...ghostButtonStyle, padding: '5px 8px' }} disabled={busy} onClick={save} aria-label="Save labels"><Check size={13} /></button>
    </div>
  )
}

function ReviewCard({ meta, fallback, onOpenTicket }: { meta: ReviewMeta | null; fallback: string; onOpenTicket: (n: number) => void }) {
  if (!meta) return <Markdown text={fallback} onTicket={onOpenTicket} />
  const row = (label: string, text?: string) => text ? (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <Markdown text={text} onTicket={onOpenTicket} />
    </div>
  ) : null
  return (
    <div style={{ fontSize: 13 }}>
      {row('What changed', meta.changed)}
      {row('How to test', meta.howToTest)}
      {row('Left over', meta.leftOver)}
      {meta.commit && row('Commit', meta.commit)}
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────

type Item = { kind: 'event'; ev: Ev } | { kind: 'fields'; actor: string; events: Ev[] }

/** Consecutive field edits by the same person within 15 minutes become one quiet line. */
function groupEvents(events: Ev[]): Item[] {
  const out: Item[] = []
  for (const ev of events) {
    const prev = out[out.length - 1]
    if (ev.kind === 'FIELD' && prev?.kind === 'fields' && prev.actor === ev.actor &&
      +new Date(ev.createdAt) - +new Date(prev.events[prev.events.length - 1].createdAt) < 15 * 60 * 1000) {
      prev.events.push(ev)
    } else if (ev.kind === 'FIELD') out.push({ kind: 'fields', actor: ev.actor, events: [ev] })
    else out.push({ kind: 'event', ev })
  }
  return out
}

const statusOf = (v: string | null) => (v ? v.split(':')[0] as TicketStatusValue : null)
const reasonOf = (v: string | null) => (v?.includes(':') ? v.split(':')[1] as TicketCloseReasonValue : null)

function Timeline({ events, tenantName, latestReviewId, onOpenTicket }: {
  events: Ev[]; tenantName: (id: string | null) => string | null; latestReviewId?: string; onOpenTicket: (n: number) => void
}) {
  const items = groupEvents(events)
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {items.map((it, i) => it.kind === 'fields'
        ? <FieldGroup key={it.events[0].id} actor={it.actor} events={it.events} tenantName={tenantName} />
        : <EventRow key={it.ev.id} ev={it.ev} first={i === 0} shownAbove={it.ev.id === latestReviewId} onOpenTicket={onOpenTicket} />)}
    </div>
  )
}

function Who({ actor, when }: { actor: string; when: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: C.faint }}>
      <ActorIcon actor={actor} /><strong style={{ color: C.muted, fontWeight: 600 }}>{actorName(actor)}</strong>
      <span title={fullDate(when)} suppressHydrationWarning>· {age(when)}</span>
    </span>
  )
}

function FieldGroup({ actor, events, tenantName }: { actor: string; events: Ev[]; tenantName: (id: string | null) => string | null }) {
  const [open, setOpen] = useState(false)
  // "title changed" -> "title", "image attached: x.png" -> "images"
  const summary = [...new Set(events.map(e => (e.body.startsWith('image attached') ? 'images' : e.body.split(' ')[0])))].join(', ')
  const show = (field: string, v: string | null) => (field.startsWith('tenant') && v && v !== '—' ? tenantName(v) ?? v : v)
  return (
    <div style={{ fontSize: 12, color: C.faint }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'none', border: 'none', padding: 0, color: C.faint, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <Who actor={actor} when={events[events.length - 1].createdAt} /> <span>updated {summary}</span>
      </button>
      {open && (
        <ul style={{ margin: '4px 0 0 26px', listStyle: 'disc' }}>
          {events.map(e => (
            <li key={e.id} style={{ wordBreak: 'break-word' }}>
              {e.body}{e.fromValue || e.toValue ? `: ${show(e.body, e.fromValue) ?? ''} → ${show(e.body, e.toValue) ?? ''}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EventRow({ ev, first, shownAbove, onOpenTicket }: { ev: Ev; first: boolean; shownAbove: boolean; onOpenTicket: (n: number) => void }) {
  const to = statusOf(ev.toValue)
  const reason = reasonOf(ev.toValue)
  const line = (children: ReactNode, color?: string) => (
    <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12, color: color ?? C.faint }}>
      <Who actor={ev.actor} when={ev.createdAt} />{children}
    </div>
  )
  const body = ev.body ? <div style={{ marginTop: 4, paddingLeft: 20 }}><Markdown text={ev.body} onTicket={onOpenTicket} /></div> : null

  switch (ev.kind) {
    case 'CREATED':
      return <div>{line(<span>created this ticket</span>)}{!first || ev.body ? body : null}</div>
    case 'COMMENT':
      return (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', backgroundColor: '#0f172a' }}>
          <Who actor={ev.actor} when={ev.createdAt} />
          <div style={{ marginTop: 4 }}><Markdown text={ev.body} onTicket={onOpenTicket} /></div>
        </div>
      )
    case 'STATUS':
      return <div>{line(<>moved to {to ? <StatusPill status={to} closeReason={reason} /> : ev.toValue}</>)}{body}</div>
    case 'REVIEW':
      return (
        <div>
          {line(<span style={{ color: '#5eead4', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FlaskConical size={13} aria-hidden /> handed over for testing{shownAbove ? ' (shown above)' : ''}</span>)}
          {!shownAbove && (
            <details style={{ marginTop: 4, paddingLeft: 20 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: C.muted }}>Show the hand-over note</summary>
              <ReviewCard meta={ev.meta as ReviewMeta | null} fallback={ev.body} onOpenTicket={onOpenTicket} />
            </details>
          )}
        </div>
      )
    case 'VERIFIED':
      return <div>{line(<span style={{ color: '#86efac', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} aria-hidden /> verified it works → Done</span>)}{body}</div>
    case 'QUESTION':
      return (
        <div style={{ borderLeft: '3px solid #6d28d9', paddingLeft: 10 }}>
          {line(<span style={{ color: '#c4b5fd', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageCircleQuestion size={13} aria-hidden /> asked</span>)}
          <div style={{ marginTop: 4 }}><Markdown text={ev.body} onTicket={onOpenTicket} /></div>
        </div>
      )
    case 'ANSWER':
      return <div>{line(<span style={{ color: '#c4b5fd' }}>answered</span>)}{body}</div>
    case 'CLIENT_REPLY':
      return <div>{line(<span style={{ color: '#7dd3fc' }}>{ev.body ? 'wrote to the client' : 'removed the message to the client'}</span>)}{body}</div>
    case 'CLIENT_EMAILED':
      return <div>{line(<span style={{ color: '#7dd3fc' }}>emailed the client</span>)}{body}</div>
    case 'DECISION':
      return <div>{line(<span style={{ color: '#86efac', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} aria-hidden /> recorded a decision</span>)}{body}</div>
    case 'SENT_BACK':
      return <div>{line(<span style={{ color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: 4 }}><RotateCcw size={13} aria-hidden /> sent it back</span>)}{body}</div>
    default:
      return <div>{line(<span>{ev.kind.toLowerCase().replace(/_/g, ' ')}</span>)}{body}</div>
  }
}
