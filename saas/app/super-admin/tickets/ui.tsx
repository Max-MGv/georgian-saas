'use client'

/** Shared look for the ticket screens - matches the rest of super-admin's dark theme. Icons: Plan-TicketsV2 1.4. */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Bot, Bug, CircleCheck, CircleDashed, CircleDot, CircleSlash, Cog, Download, FlaskConical, Inbox, Lightbulb,
  Megaphone, OctagonAlert, PenLine, Store, SignalHigh, SignalLow, SignalMedium, Sparkles, SquareCheck, User, type LucideIcon,
} from 'lucide-react'
import {
  CLOSE_REASON_LABEL, PRIORITY_LABEL, SOURCE_LABEL, STATUS_LABEL, TICKET_CLOSE_REASONS, TYPE_LABEL,
  type TicketCloseReasonValue, type TicketPriorityValue, type TicketSourceValue, type TicketStatusValue, type TicketTypeValue,
} from '@/lib/tickets'

export const C = {
  bg: '#0b1120',
  card: '#111827',
  cardHover: '#162033',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#64748b',
  accent: '#818cf8',
}

type Tone = { bg: string; border: string; color: string }

export const STATUS_TONE: Record<TicketStatusValue, Tone> = {
  INBOX: { bg: '#1e1b4b', border: '#3730a3', color: '#a5b4fc' },
  BACKLOG: { bg: '#1e293b', border: '#334155', color: '#cbd5e1' },
  IN_PROGRESS: { bg: '#422006', border: '#78350f', color: '#fbbf24' },
  REVIEW: { bg: '#042f2e', border: '#0f766e', color: '#5eead4' },
  DONE: { bg: '#052e16', border: '#14532d', color: '#86efac' },
  CLOSED: { bg: '#18181b', border: '#3f3f46', color: '#a1a1aa' },
}

export const TYPE_TONE: Record<TicketTypeValue, Tone> = {
  BUG: { bg: '#450a0a', border: '#7f1d1d', color: '#fca5a5' },
  FEATURE: { bg: '#082f49', border: '#0c4a6e', color: '#7dd3fc' },
  TASK: { bg: '#2e1065', border: '#4c1d95', color: '#c4b5fd' },
  IDEA: { bg: '#422006', border: '#713f12', color: '#fde047' },
}

export const PRIORITY_COLOR: Record<TicketPriorityValue, string> = {
  URGENT: '#f87171',
  HIGH: '#fb923c',
  NORMAL: '#94a3b8',
  LOW: '#64748b',
}

export const STATUS_ICON: Record<TicketStatusValue, LucideIcon> = {
  INBOX: Inbox, BACKLOG: CircleDashed, IN_PROGRESS: CircleDot, REVIEW: FlaskConical, DONE: CircleCheck, CLOSED: CircleSlash,
}
export const TYPE_ICON: Record<TicketTypeValue, LucideIcon> = { BUG: Bug, FEATURE: Sparkles, TASK: SquareCheck, IDEA: Lightbulb }
export const PRIORITY_ICON: Record<TicketPriorityValue, LucideIcon> = { URGENT: OctagonAlert, HIGH: SignalHigh, NORMAL: SignalMedium, LOW: SignalLow }
export const SOURCE_ICON: Record<TicketSourceValue, LucideIcon> = { WIDGET: Megaphone, MANUAL: PenLine, ASSISTANT: Bot, IMPORT: Download, PRODUCTION: Store }
export const SOURCE_HINT: Record<TicketSourceValue, string> = {
  WIDGET: 'Sent with the report button', MANUAL: 'Added by you', ASSISTANT: 'Added by Claude', IMPORT: 'Imported from the vault',
  PRODUCTION: 'A client report, copied from the production board',
}

/** Who did something on the timeline. */
export function ActorIcon({ actor, size = 13 }: { actor: string; size?: number }) {
  if (actor === 'max') return <User size={size} aria-hidden />
  if (actor === 'reporter') return <Megaphone size={size} aria-hidden />
  if (actor === 'system') return <Cog size={size} aria-hidden />
  return <Bot size={size} aria-hidden /> // claude, or an API token's name
}

/** An icon with a tooltip and a name for screen readers - the word is never lost, just not printed. */
export function Ico({ icon: I, label, color, size = 15 }: { icon: LucideIcon; label: string; color?: string; size?: number }) {
  return (
    <span title={label} aria-label={label} role="img" style={{ display: 'inline-flex', alignItems: 'center', color, flexShrink: 0 }}>
      <I size={size} aria-hidden />
    </span>
  )
}

export const TypeIcon = ({ type, size }: { type: TicketTypeValue; size?: number }) =>
  <Ico icon={TYPE_ICON[type]} label={TYPE_LABEL[type]} color={TYPE_TONE[type].color} size={size} />
export const PriorityIcon = ({ priority, size }: { priority: TicketPriorityValue; size?: number }) =>
  <Ico icon={PRIORITY_ICON[priority]} label={`${PRIORITY_LABEL[priority]} priority`} color={PRIORITY_COLOR[priority]} size={size} />
export const SourceIcon = ({ source, size }: { source: TicketSourceValue; size?: number }) =>
  <Ico icon={SOURCE_ICON[source]} label={`${SOURCE_LABEL[source]} - ${SOURCE_HINT[source]}`} color={C.faint} size={size} />

export function StatusPill({ status, closeReason, compact }: { status: TicketStatusValue; closeReason?: TicketCloseReasonValue | null; compact?: boolean }) {
  const tone = STATUS_TONE[status]
  const I = STATUS_ICON[status]
  const text = STATUS_LABEL[status] + (closeReason ? ` · ${CLOSE_REASON_LABEL[closeReason]}` : '')
  return (
    <span title={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: compact ? '2px 6px' : '3px 9px', borderRadius: 999, backgroundColor: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, whiteSpace: 'nowrap' }}>
      <I size={13} aria-hidden />{compact ? <span className="sr-only">{text}</span> : text}
    </span>
  )
}

export function Chip({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
        backgroundColor: tone.bg, border: `1px solid ${tone.border}`, color: tone.color,
      }}
    >
      {children}
    </span>
  )
}

export function PlainChip({ children, title }: { children: ReactNode; title?: string }) {
  return <Chip tone={{ bg: '#0f172a', border: C.border, color: C.muted }} title={title}>{children}</Chip>
}

export const inputStyle: CSSProperties = {
  backgroundColor: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontSize: 13, padding: '7px 10px', outline: 'none', minWidth: 0,
}

export const buttonStyle: CSSProperties = {
  backgroundColor: '#4f46e5', border: '1px solid #6366f1', color: '#fff', borderRadius: 8,
  fontSize: 13, fontWeight: 600, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

export const ghostButtonStyle: CSSProperties = {
  backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8,
  fontSize: 13, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

/** Square icon-only button (the label is the tooltip and the accessible name). */
export function IconButton({ icon: I, label, onClick, active, disabled, size = 16, style }: {
  icon: LucideIcon; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; size?: number; style?: CSSProperties
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active}
      style={{
        width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${active ? '#6366f1' : C.border}`, backgroundColor: active ? '#312e81' : 'transparent', color: active ? '#e0e7ff' : C.muted,
        opacity: disabled ? 0.5 : 1, flexShrink: 0, ...style,
      }}
    >
      <I size={size} aria-hidden />
    </button>
  )
}

/** "3d", "5h", "just now" */
export function age(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 90) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 90) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 36) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 60) return `${d}d`
  return `${Math.floor(d / 30)}mo`
}

// timeZone is pinned (the winery's zone, same convention as OrdersTable): without it the server renders in UTC and the
// browser in the viewer's zone, the text differs, and React logs a hydration error (#418) on every ticket page.
export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tbilisi' })
}

/** Small environment pill so the two boards are never confused (the full sentence is the tooltip). */
export function EnvPill({ env }: { env: 'PRODUCTION' | 'STAGING' | 'LOCAL' }) {
  const tone = env === 'PRODUCTION'
    ? { bg: '#450a0a', border: '#991b1b', color: '#fecaca', hint: 'Production - real customer data' }
    : env === 'STAGING'
      ? { bg: '#422006', border: '#92400e', color: '#fde68a', hint: 'Staging - test data, everything here is yours' }
      : { bg: '#1e1b4b', border: '#3730a3', color: '#c7d2fe', hint: 'Local - dev database' }
  return (
    <span title={tone.hint} style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 9px' }}>
      {env}
    </span>
  )
}

// ── Picker: a small menu of options with icons (status, priority, type, area, tenant, "move to") ─────

export type PickerOption<V extends string> = { value: V; label: string; icon?: LucideIcon; color?: string }

/**
 * The menu is `position: fixed`, measured from the button, so it is never clipped by a scrolling board
 * column or the side panel. Esc / a click outside / scrolling the page closes it.
 */
export function Picker<V extends string>({ value, options, onChange, label, children, disabled, buttonStyle: bStyle }: {
  value: V | null
  options: PickerOption<V>[]
  onChange: (v: V) => void
  label: string
  children: ReactNode
  disabled?: boolean
  buttonStyle?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  function toggle() {
    if (open) { setOpen(false); return }
    const r = btn.current!.getBoundingClientRect()
    const width = 220
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const wanted = Math.min(options.length * 36 + 12, 360)
    const useBelow = below >= Math.min(wanted, 200) || below >= above
    const maxH = Math.max(120, Math.min(wanted, useBelow ? below : above))
    setPos({
      top: useBelow ? r.bottom + 4 : r.top - 4 - maxH,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      maxH,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
    requestAnimationFrame(() => (items().find(b => b.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus())
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        const list = items(); const i = list.indexOf(document.activeElement as HTMLButtonElement)
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
      }
    }
    const onScroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn} type="button" disabled={disabled} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={e => { e.stopPropagation(); toggle() }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '5px 9px', cursor: disabled ? 'default' : 'pointer', minWidth: 0, ...bStyle }}
      >
        {children}
      </button>
      {open && pos && (
        <div
          ref={menu} role="menu" aria-label={label} onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 220, maxHeight: pos.maxH, overflowY: 'auto', zIndex: 9300, backgroundColor: '#0f172a', border: `1px solid #334155`, borderRadius: 10, padding: 4, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
        >
          {options.map(o => {
            const I = o.icon
            const selected = o.value === value
            return (
              <button
                key={o.value} type="button" role="menuitemradio" aria-checked={selected}
                onClick={() => { setOpen(false); if (!selected) onChange(o.value) }}
                className="ticket-menu-item"
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, color: o.color ?? C.text, backgroundColor: selected ? '#1e293b' : 'transparent', fontWeight: selected ? 700 : 400 }}
              >
                {I ? <I size={15} aria-hidden /> : <span style={{ width: 15 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>{o.label}</span>
              </button>
            )
          })}
          <style>{'.ticket-menu-item:hover,.ticket-menu-item:focus-visible{background-color:#1e293b !important;outline:none}'}</style>
        </div>
      )}
    </>
  )
}

// ── Closing needs a reason: one tap on the reason closes the ticket ───────────────────────────────

/**
 * Closing needs a reason: one tap on it closes the ticket. "Duplicate" asks one more thing - which ticket it
 * duplicates - because the reporters are moved there and follow that ticket instead (Plan-TicketsV2 3.3).
 */
export function CloseReasonDialog({ title, onPick, onCancel }: {
  title: string
  onPick: (r: TicketCloseReasonValue, duplicateOf?: number) => void
  onCancel: () => void
}) {
  const [dup, setDup] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])
  const hint: Record<TicketCloseReasonValue, string> = {
    WONT_FIX: 'We decided not to do it',
    DUPLICATE: 'Another ticket covers it',
    NOT_REPRODUCIBLE: 'Could not make it happen',
    OBSOLETE: 'No longer relevant',
  }
  const dupNumber = dup !== null ? Number(dup.trim().replace(/^[tT]-/, '')) : NaN
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9100, padding: 16 }} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Close this ticket - why?" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, width: 'min(400px, 100%)' }}>
        <div style={{ fontWeight: 700, marginBottom: 2, color: C.text }}>{dup === null ? 'Close this ticket — why?' : 'Duplicate of which ticket?'}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {dup === null ? (
          <div className="flex flex-col gap-2">
            {TICKET_CLOSE_REASONS.map((r, i) => (
              <button key={r} autoFocus={i === 0} onClick={() => (r === 'DUPLICATE' ? setDup('') : onPick(r))} style={{ ...ghostButtonStyle, justifyContent: 'space-between', color: C.text, padding: '10px 12px' }}>
                <strong>{CLOSE_REASON_LABEL[r]}</strong><span style={{ fontSize: 12, color: C.faint }}>{hint[r]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <input autoFocus value={dup} onChange={e => setDup(e.target.value)} placeholder="T-12" aria-label="Original ticket number"
              onKeyDown={e => { if (e.key === 'Enter' && Number.isInteger(dupNumber) && dupNumber > 0) onPick('DUPLICATE', dupNumber) }}
              style={{ ...inputStyle, width: '100%', fontSize: 15 }} />
            <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Its reporters move to that ticket and see its progress instead of &ldquo;closed&rdquo;.</div>
            <div className="flex gap-2 justify-end mt-3">
              <button style={ghostButtonStyle} onClick={() => setDup(null)}>Back</button>
              <button style={{ ...buttonStyle, opacity: Number.isInteger(dupNumber) && dupNumber > 0 ? 1 : 0.5 }} disabled={!(Number.isInteger(dupNumber) && dupNumber > 0)} onClick={() => onPick('DUPLICATE', dupNumber)}>Close as duplicate</button>
            </div>
          </div>
        )}
        {dup === null && <div className="flex justify-end mt-3"><button style={ghostButtonStyle} onClick={onCancel}>Cancel</button></div>}
      </div>
    </div>
  )
}

export const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as TicketStatusValue[]).map(s => ({ value: s, label: STATUS_LABEL[s], icon: STATUS_ICON[s], color: STATUS_TONE[s].color }))
export const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as TicketTypeValue[]).map(t => ({ value: t, label: TYPE_LABEL[t], icon: TYPE_ICON[t], color: TYPE_TONE[t].color }))
export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as TicketPriorityValue[]).map(p => ({ value: p, label: PRIORITY_LABEL[p], icon: PRIORITY_ICON[p], color: PRIORITY_COLOR[p] }))
