'use client'

/**
 * The parts of a ticket that hold our thinking (Plan-TicketsV2 Tier 2): editable text sections
 * (Request / Analysis / Solution), questions waiting for Max with one-tap answers, the decisions taken,
 * links, the test checklist, and where the work is live.
 */

import { useState, type ReactNode } from 'react'
import {
  Bug as BugIcon, Check, CircleDashed, ExternalLink, FileText, GitCommitHorizontal, Link2, MessageCircleQuestion, Pencil, Plus,
  Mail, Rocket, Send, Server, SquareCheck, Ticket as TicketIcon, UserRound, X, type LucideIcon,
} from 'lucide-react'
import { LINK_KINDS, LINK_KIND_LABEL, LIVE_LABEL, type LinkKind, type LiveStage, type TenantVisibleStatus, type TicketLink } from '@/lib/tickets'
import type { TicketDetail as Ticket } from '@/lib/ticketService'
import { C, ActorIcon, age, buttonStyle, fullDate, ghostButtonStyle, inputStyle } from './ui'
import Markdown from './Markdown'

export const sectionTitle = (t: ReactNode) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>{t}</div>
)
export const actorName = (a: string) => ({ max: 'Max', claude: 'Claude', reporter: 'Reporter', system: 'System' } as Record<string, string>)[a] ?? a

// ── Where is it live ─────────────────────────────────────────────────────

export const LIVE_ICON: Record<LiveStage, LucideIcon> = { NONE: CircleDashed, STAGING: Server, PRODUCTION: Rocket }
export const LIVE_COLOR: Record<LiveStage, string> = { NONE: C.faint, STAGING: '#fbbf24', PRODUCTION: '#86efac' }
export const LIVE_OPTIONS = (['NONE', 'STAGING', 'PRODUCTION'] as const).map(v => ({ value: v, label: LIVE_LABEL[v], icon: LIVE_ICON[v], color: LIVE_COLOR[v] }))

// ── Editable text section ────────────────────────────────────────────────

export function TextSection({ title, icon: I, value, hint, placeholder, emptyLabel, busy, onSave, onOpenTicket, children }: {
  title: string
  icon?: LucideIcon
  value: string
  hint?: string
  placeholder: string
  emptyLabel: string
  busy: boolean
  /** Resolves true when saved; the editor closes then. */
  onSave: (v: string) => Promise<boolean>
  onOpenTicket: (n: number) => void
  children?: ReactNode
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const save = async () => { if (draft !== null && (await onSave(draft))) setDraft(null) }
  return (
    <section style={{ marginTop: 20 }}>
      {sectionTitle(<>
        {I && <I size={13} aria-hidden />}{title}
        {draft === null && value && (
          <button onClick={() => setDraft(value)} aria-label={`Edit ${title.toLowerCase()}`} title={`Edit ${title.toLowerCase()}`} style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 2, display: 'inline-flex' }}><Pencil size={13} /></button>
        )}
      </>)}
      {draft !== null ? (
        <div>
          <textarea
            autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={7} aria-label={title} placeholder={placeholder}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
            }}
            style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5, fontSize: 14 }}
          />
          <div className="flex gap-2 mt-2">
            <button style={buttonStyle} disabled={busy} onClick={() => void save()}><Check size={14} aria-hidden /> Save</button>
            <button style={ghostButtonStyle} onClick={() => setDraft(null)}><X size={14} aria-hidden /> Cancel</button>
          </div>
        </div>
      ) : value ? (
        <div onDoubleClick={() => setDraft(value)}>
          {hint && <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>{hint}</div>}
          <Markdown text={value} onTicket={onOpenTicket} />
        </div>
      ) : (
        <button onClick={() => setDraft('')} style={{ ...ghostButtonStyle, borderStyle: 'dashed', width: '100%', justifyContent: 'center', color: C.faint }}><Plus size={14} aria-hidden /> {emptyLabel}</button>
      )}
      {children}
    </section>
  )
}

// ── Questions waiting for an answer ──────────────────────────────────────

export type QuestionItem = { id: string; text: string; options: string[]; actor: string; createdAt: string }

export function OpenQuestions({ questions, busy, onAnswer, onOpenTicket }: {
  questions: QuestionItem[]
  busy: boolean
  onAnswer: (questionId: string, answer: { choice?: string; text?: string }) => Promise<boolean>
  onOpenTicket: (n: number) => void
}) {
  if (questions.length === 0) return null
  return (
    <div className="flex flex-col gap-3" style={{ marginTop: 16 }}>
      {questions.map(q => <QuestionCard key={q.id} q={q} busy={busy} onAnswer={onAnswer} onOpenTicket={onOpenTicket} />)}
    </div>
  )
}

function QuestionCard({ q, busy, onAnswer, onOpenTicket }: {
  q: QuestionItem; busy: boolean
  onAnswer: (questionId: string, answer: { choice?: string; text?: string }) => Promise<boolean>
  onOpenTicket: (n: number) => void
}) {
  const [text, setText] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  const send = (c?: string) => void onAnswer(q.id, { choice: c ?? choice ?? undefined, text })
  return (
    <div style={{ borderRadius: 12, border: '1px solid #6d28d9', backgroundColor: '#1e1033', padding: 14 }}>
      <div className="flex items-center gap-2" style={{ fontWeight: 700, color: '#c4b5fd', marginBottom: 6 }}>
        <MessageCircleQuestion size={16} aria-hidden /> Question for you
        <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12, color: C.faint, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ActorIcon actor={q.actor} /> {actorName(q.actor)} · <span title={fullDate(q.createdAt)} suppressHydrationWarning>{age(q.createdAt)}</span>
        </span>
      </div>
      <Markdown text={q.text} onTicket={onOpenTicket} />
      {q.options.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {q.options.map(o => (
            <button key={o} disabled={busy} aria-pressed={choice === o}
              // One tap answers, unless you have started typing a note to go with it - then the tap selects and "Answer" sends both.
              onClick={() => (text.trim() ? setChoice(c => (c === o ? null : o)) : send(o))}
              style={{ ...ghostButtonStyle, color: '#e9d5ff', borderColor: choice === o ? '#a78bfa' : '#5b21b6', backgroundColor: choice === o ? '#4c1d95' : 'transparent', fontWeight: 600 }}>
              {o}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder={q.options.length ? 'Or write your own answer / add a note…' : 'Your answer…'} aria-label="Your answer"
          onKeyDown={e => { if (e.key === 'Enter' && (text.trim() || choice)) send() }}
          style={{ ...inputStyle, flex: 1 }} />
        <button style={{ ...buttonStyle, backgroundColor: '#6d28d9', borderColor: '#7c3aed', opacity: text.trim() || choice ? 1 : 0.5 }} disabled={busy || (!text.trim() && !choice)} onClick={() => send()}>Answer</button>
      </div>
    </div>
  )
}

// ── Decisions (answered questions + decisions recorded from chat) ─────────

export type DecisionItem = { id: string; question?: string; answer: string; actor: string; createdAt: string }

export function Decisions({ items, onOpenTicket }: { items: DecisionItem[]; onOpenTicket: (n: number) => void }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Decisions</div>
      <ul className="flex flex-col gap-2" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map(d => (
          <li key={d.id} className="flex gap-2" style={{ fontSize: 13 }}>
            <Check size={15} color="#86efac" style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
            <div style={{ minWidth: 0, flex: 1 }}>
              {d.question && <div style={{ fontSize: 12, color: C.faint }}>{d.question.length > 160 ? d.question.slice(0, 157) + '…' : d.question}</div>}
              <Markdown text={d.answer} onTicket={onOpenTicket} />
              <div style={{ fontSize: 11, color: C.faint }}>{actorName(d.actor)} · {fullDate(d.createdAt)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Links ────────────────────────────────────────────────────────────────

const LINK_ICON: Record<LinkKind, LucideIcon> = { plan: FileText, commit: GitCommitHorizontal, bug: BugIcon, ticket: TicketIcon, url: Link2 }
const REPO = 'https://github.com/Max-MGv/georgian-saas/commit/'

export function Links({ links, titles, busy, onAdd, onRemove, onOpenTicket }: {
  links: TicketLink[]
  titles: Record<string, string>
  busy: boolean
  onAdd: (l: TicketLink) => Promise<boolean>
  onRemove: (l: TicketLink) => void
  onOpenTicket: (n: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<LinkKind>('ticket')
  const [ref, setRef] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const add = async () => { if (ref.trim() && (await onAdd({ kind, ref: ref.trim() }))) { setRef(''); setAdding(false) } }
  const placeholder: Record<LinkKind, string> = { ticket: 'T-12', plan: 'vault/Plan-Something.md', commit: 'f1ff942', bug: 'KnownBugs number, e.g. 81', url: 'https://…' }

  return (
    <section style={{ marginTop: 20 }}>
      {sectionTitle(<><Link2 size={13} aria-hidden /> Links</>)}
      <div className="flex flex-wrap items-center gap-2">
        {links.map(l => {
          const I = LINK_ICON[l.kind]
          const key = `${l.kind}:${l.ref}`
          const text = l.kind === 'ticket' ? `T-${l.ref}${titles[l.ref] ? ` · ${titles[l.ref]}` : ''}` : l.kind === 'bug' ? `KnownBugs #${l.ref}` : l.label ?? l.ref
          const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', fontSize: 12, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 6px 4px 10px', backgroundColor: '#0f172a', textDecoration: 'none' } as const
          const body = <><I size={13} color={C.muted} aria-hidden /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{text}</span></>
          return (
            <span key={key} style={chip} title={`${LINK_KIND_LABEL[l.kind]}: ${l.ref}`}>
              {l.kind === 'ticket' ? (
                <a href={`/super-admin/tickets?t=${l.ref}`} onClick={e => { if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); onOpenTicket(Number(l.ref)) } }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.accent, textDecoration: 'none', minWidth: 0 }}>{body}</a>
              ) : l.kind === 'commit' || l.kind === 'url' ? (
                <a href={l.kind === 'commit' ? REPO + l.ref : l.ref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.accent, textDecoration: 'none', minWidth: 0 }}>{body}</a>
              ) : (
                // A vault path or a KnownBugs number lives on this computer, not on the web: one tap copies it.
                <button onClick={() => { void navigator.clipboard?.writeText(l.ref).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1200) }) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.text, cursor: 'copy', padding: 0, minWidth: 0 }} title="Copy">
                  {body}{copied === key && <span style={{ color: '#86efac' }}>copied</span>}
                </button>
              )}
              <button onClick={() => onRemove(l)} disabled={busy} aria-label={`Remove link ${text}`} title="Remove link" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', display: 'inline-flex', padding: 2 }}><X size={12} /></button>
            </span>
          )
        })}
        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ ...ghostButtonStyle, padding: '4px 10px', fontSize: 12, borderStyle: 'dashed' }}><Plus size={13} aria-hidden /> Link</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2" style={{ width: '100%' }}>
            <select value={kind} onChange={e => setKind(e.target.value as LinkKind)} aria-label="Link type" style={inputStyle}>
              {LINK_KINDS.map(k => <option key={k} value={k}>{LINK_KIND_LABEL[k]}</option>)}
            </select>
            <input autoFocus value={ref} onChange={e => setRef(e.target.value)} placeholder={placeholder[kind]} aria-label="Link target"
              onKeyDown={e => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') { e.stopPropagation(); setAdding(false) } }}
              style={{ ...inputStyle, flex: '1 1 180px' }} />
            <button style={buttonStyle} disabled={busy || !ref.trim()} onClick={() => void add()}>Add</button>
            <button style={ghostButtonStyle} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        )}
      </div>
    </section>
  )
}

// ── The client side (Tier 3) ─────────────────────────────────────────────

const CLIENT_SEES: Record<TenantVisibleStatus, { label: string; color: string }> = {
  NEW: { label: 'Received', color: '#a5b4fc' },
  IN_PROGRESS: { label: 'In progress', color: '#fbbf24' },
  RESOLVED: { label: 'Resolved', color: '#86efac' },
  WONT_FIX: { label: "Won't fix", color: '#a1a1aa' },
  CLOSED: { label: 'Closed', color: '#a1a1aa' },
}

/**
 * Who reported it, what they see on their My Reports page right now, our message to them, and the "email them"
 * button (the only way they are ever emailed - Max, 2026-10-15).
 */
export function ClientSection({ t, busy, onSaveReply, onEmail, onOpenTicket }: {
  t: Ticket
  busy: boolean
  onSaveReply: (v: string) => Promise<boolean>
  onEmail: () => Promise<boolean>
  onOpenTicket: (n: number) => void
}) {
  const [confirmEmail, setConfirmEmail] = useState(false)
  const emails = [...new Set(t.reports.map(r => r.submitterEmail).filter((e): e is string => !!e))]
  const sees = CLIENT_SEES[t.clientStatus]
  const doneNotLive = t.status === 'DONE' && !t.liveOnProductionAt
  return (
    <section style={{ marginTop: 20, border: '1px solid #1e3a5f', borderRadius: 12, padding: 14, backgroundColor: '#0b1628' }}>
      {sectionTitle(<><UserRound size={13} aria-hidden /> Client</>)}
      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 13, color: C.muted }}>
        <span>{t.reports.length ? (emails.length ? emails.join(', ') : 'An anonymous visitor') : 'No report linked'} sees on My Reports:</span>
        <strong style={{ color: sees.color }}>{sees.label}</strong>
        {doneNotLive && <span style={{ fontSize: 12, color: C.faint }}>— stays &ldquo;In progress&rdquo; until the fix is live on production</span>}
      </div>
      <TextSection title="Message to the client" value={t.clientReply} busy={busy} onOpenTicket={onOpenTicket}
        hint={t.clientReplyAt ? `Shown on their My Reports page · ${fullDate(t.clientReplyAt)}` : undefined}
        emptyLabel="Write a message to the client" placeholder={'What we did, or why not - in their language. It appears under their report.'}
        onSave={onSaveReply} />
      {emails.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
          {!confirmEmail ? (
            <button style={ghostButtonStyle} disabled={busy} onClick={() => setConfirmEmail(true)}><Mail size={14} aria-hidden /> Email the reporter</button>
          ) : (
            <>
              <span style={{ fontSize: 13, color: C.text }}>Send &ldquo;{sees.label}&rdquo;{t.clientReply ? ' and your message' : ''} to {emails.join(', ')}?</span>
              <button style={buttonStyle} disabled={busy} onClick={() => void onEmail().then(ok => { if (ok) setConfirmEmail(false) })}><Send size={14} aria-hidden /> Send</button>
              <button style={ghostButtonStyle} onClick={() => setConfirmEmail(false)}>Cancel</button>
            </>
          )}
          {t.clientNotifiedAt && <span style={{ fontSize: 12, color: C.faint }}>Last emailed {fullDate(t.clientNotifiedAt)}</span>}
        </div>
      )}
    </section>
  )
}

// ── Test checklist ───────────────────────────────────────────────────────

type Mark = 'ok' | 'fail'

/**
 * Tick each step as you test (✓ / ✗). Ticks are remembered on this device for this hand-over only
 * (browser storage) - they are a testing aid, not part of the ticket. ✗ writes the step into the
 * send-back note, so "Not fixed" says exactly what failed.
 */
export function TestChecklist({ reviewId, steps, url, onFail }: { reviewId: string; steps: string[]; url?: string; onFail: (line: string) => void }) {
  const key = `tickets.check.${reviewId}`
  const [marks, setMarks] = useState<Record<number, Mark>>(() => {
    try { return JSON.parse(window.localStorage.getItem(key) ?? '{}') } catch { return {} }
  })
  const mark = (i: number, m: Mark) => {
    const next = { ...marks }
    if (next[i] === m) delete next[i]; else next[i] = m
    setMarks(next)
    try { window.localStorage.setItem(key, JSON.stringify(next)) } catch { /* private window */ }
    if (next[i] === 'fail') onFail(`Step ${i + 1} failed: ${steps[i]} — `)
  }
  const done = steps.filter((_, i) => marks[i]).length
  return (
    <div style={{ marginTop: 8 }}>
      <div className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 700, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <SquareCheck size={13} aria-hidden /> How to test <span style={{ color: C.faint, fontWeight: 500 }}>{done}/{steps.length}</span>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, color: '#5eead4', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><ExternalLink size={13} aria-hidden /> Open the page</a>}
      </div>
      <ol style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }} className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2" style={{ fontSize: 13, opacity: marks[i] === 'ok' ? 0.65 : 1 }}>
            <span style={{ color: C.faint, width: 18, flexShrink: 0, textAlign: 'right', paddingTop: 3 }}>{i + 1}.</span>
            <div style={{ flex: 1, minWidth: 0, textDecoration: marks[i] === 'ok' ? 'line-through' : 'none' }}><Markdown text={s} /></div>
            <button onClick={() => mark(i, 'ok')} aria-pressed={marks[i] === 'ok'} aria-label={`Step ${i + 1} works`} title="Works"
              style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${marks[i] === 'ok' ? '#16a34a' : '#134e4a'}`, backgroundColor: marks[i] === 'ok' ? '#14532d' : 'transparent', color: '#86efac' }}><Check size={15} /></button>
            <button onClick={() => mark(i, 'fail')} aria-pressed={marks[i] === 'fail'} aria-label={`Step ${i + 1} fails`} title="Doesn't work"
              style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${marks[i] === 'fail' ? '#dc2626' : '#3f1d1d'}`, backgroundColor: marks[i] === 'fail' ? '#7f1d1d' : 'transparent', color: '#fca5a5' }}><X size={15} /></button>
          </li>
        ))}
      </ol>
    </div>
  )
}
