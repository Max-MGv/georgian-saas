'use client'

/** Shared look for the ticket screens - matches the rest of super-admin's dark theme. */

import type { CSSProperties, ReactNode } from 'react'
import type { TicketPriorityValue, TicketStatusValue, TicketTypeValue } from '@/lib/tickets'

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
  NORMAL: '#64748b',
  LOW: '#334155',
}

export function Chip({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
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

export function PriorityDot({ priority, withLabel }: { priority: TicketPriorityValue; withLabel?: string }) {
  return (
    <span title={`Priority: ${withLabel ?? priority}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: PRIORITY_COLOR[priority], display: 'inline-block' }} />
      {withLabel}
    </span>
  )
}

export const inputStyle: CSSProperties = {
  backgroundColor: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontSize: 13, padding: '7px 10px', outline: 'none', minWidth: 0,
}

export const buttonStyle: CSSProperties = {
  backgroundColor: '#4f46e5', border: '1px solid #6366f1', color: '#fff', borderRadius: 8,
  fontSize: 13, fontWeight: 600, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
}

export const ghostButtonStyle: CSSProperties = {
  backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8,
  fontSize: 13, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
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

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Environment banner shown on every ticket screen so the two boards are never confused. */
export function EnvBanner({ env }: { env: 'PRODUCTION' | 'STAGING' | 'LOCAL' }) {
  const tone = env === 'PRODUCTION'
    ? { bg: '#450a0a', border: '#991b1b', color: '#fecaca', text: 'PRODUCTION — real customer data' }
    : env === 'STAGING'
      ? { bg: '#422006', border: '#92400e', color: '#fde68a', text: 'STAGING — test data (everything here is yours)' }
      : { bg: '#1e1b4b', border: '#3730a3', color: '#c7d2fe', text: 'LOCAL — dev database' }
  return (
    <div style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '5px 12px' }}>
      {tone.text}
    </div>
  )
}
