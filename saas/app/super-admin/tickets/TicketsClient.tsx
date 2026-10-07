'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TicketListItem } from '@/lib/ticketService'
import {
  CLOSE_REASON_LABEL, PRIORITY_LABEL, PRIORITY_RANK, SOURCE_LABEL, STATUS_LABEL, TICKET_AREAS, TICKET_CLOSE_REASONS,
  TICKET_PRIORITIES, TICKET_SOURCES, TICKET_STATUSES, TICKET_TYPES, TYPE_LABEL,
  type TicketCloseReasonValue, type TicketPriorityValue, type TicketStatusValue, type TicketTypeValue,
} from '@/lib/tickets'
import { bulkCreateTickets, createTicketAction, moveTicket } from '@/app/actions/tickets'
import { C, Chip, EnvBanner, PlainChip, PriorityDot, STATUS_TONE, TYPE_TONE, age, buttonStyle, ghostButtonStyle, inputStyle } from './ui'

type View = 'board' | 'list'
type GroupBy = 'none' | 'tenant' | 'type' | 'priority' | 'area' | 'status'
type SortBy = 'updated' | 'priority' | 'number' | 'status'

const VIEW_KEY = 'tickets.view'
const NO_TENANT = '__none'

function loadPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  } catch { return fallback }
}
function savePref(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* private window etc. */ }
}

const byPriorityThenRecent = (a: TicketListItem, b: TicketListItem) =>
  PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || +new Date(b.updatedAt) - +new Date(a.updatedAt)

export default function TicketsClient({
  tickets, tenants, env,
}: {
  tickets: TicketListItem[]
  tenants: { id: string; name: string }[]
  env: 'PRODUCTION' | 'STAGING' | 'LOCAL'
}) {
  const router = useRouter()
  // Optimistic moves are kept as a small overlay on the server's list and thrown away as soon as a
  // fresh list arrives ("adjust state during render", the pattern React documents for this), instead
  // of copying props into state from an effect.
  const [overrides, setOverrides] = useState<Record<string, Partial<TicketListItem>>>({})
  const [seenTickets, setSeenTickets] = useState(tickets)
  if (seenTickets !== tickets) { setSeenTickets(tickets); setOverrides({}) }
  const items = useMemo(() => tickets.map(t => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)), [tickets, overrides])

  const [view, setView] = useState<View>('board')
  // Reads localStorage, which only exists in the browser: the server renders 'board', then the saved choice is applied once mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setView(loadPref<View>(VIEW_KEY, ['board', 'list'], 'board')), [])
  const changeView = (v: View) => { setView(v); savePref(VIEW_KEY, v) }

  // Default = everything, all tenants combined (tenant is a filter, never a separate board).
  const [q, setQ] = useState('')
  const [tenant, setTenant] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [priority, setPriority] = useState('ALL')
  const [area, setArea] = useState('ALL')
  const [source, setSource] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [sortBy, setSortBy] = useState<SortBy>('updated')
  const [showClosed, setShowClosed] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<TicketListItem | null>(null)
  const [closeReason, setCloseReason] = useState<TicketCloseReasonValue>('WONT_FIX')
  useEffect(() => {
    if (!closing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setClosing(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closing])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter(t => {
      if (tenant === NO_TENANT ? t.tenantId !== null : tenant !== 'ALL' && t.tenantId !== tenant) return false
      if (type !== 'ALL' && t.type !== type) return false
      if (priority !== 'ALL' && t.priority !== priority) return false
      if (area !== 'ALL' && t.area !== area) return false
      if (source !== 'ALL' && t.source !== source) return false
      if (status !== 'ALL' && t.status !== status) return false
      if (needle) {
        const hay = `t-${t.number} ${t.title} ${t.area ?? ''} ${t.labels.join(' ')} ${t.tenantName ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [items, q, tenant, type, priority, area, source, status])

  const reviewCount = items.filter(t => t.status === 'REVIEW').length
  const openCount = items.filter(t => t.status !== 'DONE' && t.status !== 'CLOSED').length
  const anyFilter = [tenant, type, priority, area, source, status].some(v => v !== 'ALL') || q.trim() !== ''

  async function move(t: TicketListItem, to: TicketStatusValue, reason?: TicketCloseReasonValue) {
    if (t.status === to) return
    if (to === 'CLOSED' && !reason) { setClosing(t); setCloseReason('WONT_FIX'); return }
    setError(null)
    setOverrides(prev => ({ ...prev, [t.id]: { status: to, closeReason: to === 'CLOSED' ? (reason ?? null) : null, updatedAt: new Date().toISOString() } }))
    const res = await moveTicket(t.number, to, reason ?? null)
    if ('error' in res) setError(res.error)
    router.refresh()
  }

  return (
    <div style={{ color: C.text }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold">Tickets</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            {openCount} open · <span style={{ color: reviewCount ? '#5eead4' : C.muted }}>{reviewCount} ready to test</span> · {items.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <EnvBanner env={env} />
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {(['board', 'list'] as const).map(v => (
              <button key={v} onClick={() => changeView(v)} style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                backgroundColor: view === v ? '#312e81' : C.card, color: view === v ? '#e0e7ff' : C.muted,
              }}>{v === 'board' ? 'Board' : 'List'}</button>
            ))}
          </div>
        </div>
      </div>

      <QuickAdd tenants={tenants} onDone={() => router.refresh()} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setStatus(status === 'REVIEW' ? 'ALL' : 'REVIEW')}
          style={{
            ...ghostButtonStyle, fontWeight: 700,
            borderColor: status === 'REVIEW' ? '#0f766e' : C.border,
            backgroundColor: status === 'REVIEW' ? '#042f2e' : 'transparent',
            color: reviewCount > 0 ? '#5eead4' : C.muted,
          }}
          title="Work that is finished and waiting for you to verify"
        >
          Ready to test · {reviewCount}
        </button>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, T-number, label…"
          style={{ ...inputStyle, flex: '1 1 180px', maxWidth: 280 }} aria-label="Search tickets"
        />
        <Select value={tenant} onChange={setTenant} label="Tenant" options={[['ALL', 'All tenants'], [NO_TENANT, 'No tenant (internal)'], ...tenants.map(t => [t.id, t.name] as [string, string])]} />
        <Select value={type} onChange={setType} label="Type" options={[['ALL', 'All types'], ...TICKET_TYPES.map(v => [v, TYPE_LABEL[v]] as [string, string])]} />
        <Select value={priority} onChange={setPriority} label="Priority" options={[['ALL', 'All priorities'], ...TICKET_PRIORITIES.map(v => [v, PRIORITY_LABEL[v]] as [string, string])]} />
        <Select value={area} onChange={setArea} label="Area" options={[['ALL', 'All areas'], ...TICKET_AREAS.map(v => [v, v] as [string, string])]} />
        <Select value={source} onChange={setSource} label="Source" options={[['ALL', 'All sources'], ...TICKET_SOURCES.map(v => [v, SOURCE_LABEL[v]] as [string, string])]} />
        {view === 'list' && (
          <>
            <Select value={status} onChange={setStatus} label="Status" options={[['ALL', 'All statuses'], ...TICKET_STATUSES.map(v => [v, STATUS_LABEL[v]] as [string, string])]} />
            <Select value={groupBy} onChange={v => setGroupBy(v as GroupBy)} label="Group by" options={[['none', 'No grouping'], ['tenant', 'Group: tenant'], ['type', 'Group: type'], ['priority', 'Group: priority'], ['area', 'Group: area'], ['status', 'Group: status']]} />
            <Select value={sortBy} onChange={v => setSortBy(v as SortBy)} label="Sort" options={[['updated', 'Sort: recent'], ['priority', 'Sort: priority'], ['number', 'Sort: newest #'], ['status', 'Sort: status']]} />
            <label style={{ fontSize: 12, color: C.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> show done / closed
            </label>
          </>
        )}
        {anyFilter && (
          <button style={ghostButtonStyle} onClick={() => { setQ(''); setTenant('ALL'); setType('ALL'); setPriority('ALL'); setArea('ALL'); setSource('ALL'); setStatus('ALL') }}>Clear</button>
        )}
      </div>

      {error && <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ alignItems: 'flex-start' }}>
          {TICKET_STATUSES.map(s => {
            const col = filtered.filter(t => t.status === s).sort(byPriorityThenRecent)
            const collapsible = s === 'DONE' || s === 'CLOSED'
            const isOpen = !collapsible || expanded.has(s)
            return (
              <div
                key={s}
                onDragOver={e => { if (dragId) { e.preventDefault(); setOverCol(s) } }}
                onDragLeave={() => setOverCol(c => (c === s ? null : c))}
                onDrop={e => {
                  e.preventDefault(); setOverCol(null)
                  const t = items.find(x => x.id === dragId); setDragId(null)
                  if (t) void move(t, s)
                }}
                style={{
                  flex: `0 0 ${isOpen ? 272 : 180}px`, backgroundColor: overCol === s ? '#162033' : C.card, borderRadius: 12,
                  border: `1px solid ${overCol === s ? '#6366f1' : C.border}`, padding: 10, minHeight: 90,
                }}
              >
                <div className="flex items-center justify-between mb-2" style={{ gap: 6 }}>
                  <Chip tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Chip>
                  <span style={{ fontSize: 12, color: C.faint }}>{col.length}</span>
                  {collapsible && (
                    <button
                      onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n })}
                      style={{ marginLeft: 'auto', fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}
                    >{isOpen ? 'hide' : 'show'}</button>
                  )}
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-2" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                    {col.length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: '6px 2px' }}>Nothing here</div>}
                    {col.map(t => (
                      <Card key={t.id} t={t} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null) }} onMove={to => void move(t, to)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <ListView items={filtered} groupBy={groupBy} sortBy={sortBy} showClosed={showClosed || status === 'DONE' || status === 'CLOSED'} onMove={(t, to) => void move(t, to)} />
      )}

      {closing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => setClosing(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Close T-${closing.number}`} onClick={e => e.stopPropagation()} style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, width: 'min(420px, 100%)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Close T-{closing.number}?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>{closing.title}</div>
            <select aria-label="Reason for closing" autoFocus value={closeReason} onChange={e => setCloseReason(e.target.value as TicketCloseReasonValue)} style={{ ...inputStyle, width: '100%', marginBottom: 14 }}>
              {TICKET_CLOSE_REASONS.map(r => <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button style={ghostButtonStyle} onClick={() => setClosing(null)}>Cancel</button>
              <button style={buttonStyle} onClick={() => { const t = closing; setClosing(null); void move(t, 'CLOSED', closeReason) }}>Close ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 190 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Card({ t, onDragStart, onDragEnd, onMove }: { t: TicketListItem; onDragStart: () => void; onDragEnd: () => void; onMove: (to: TicketStatusValue) => void }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); onDragStart() }}
      onDragEnd={onDragEnd}
      style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, cursor: 'grab' }}
    >
      <Link href={`/super-admin/tickets/${t.number}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div className="flex items-center gap-2 mb-1" style={{ fontSize: 11, color: C.faint }}>
          <span style={{ fontWeight: 700, color: C.muted }}>T-{t.number}</span>
          <PriorityDot priority={t.priority} />
          {/* "5m" depends on the current time: server and browser render a moment apart, so this text is allowed to differ. */}
          <span style={{ marginLeft: 'auto' }} suppressHydrationWarning>{age(t.updatedAt)}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{t.title}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <Chip tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Chip>
          {t.tenantName && <PlainChip title="Tenant">{t.tenantName}</PlainChip>}
          {t.area && <PlainChip title="Area">{t.area}</PlainChip>}
          {t.attachmentCount > 0 && <PlainChip title="Attachments">📎 {t.attachmentCount}</PlainChip>}
          {t.commentCount > 0 && <PlainChip title="Comments">💬 {t.commentCount}</PlainChip>}
        </div>
      </Link>
      {/* Works on a phone, where there is no drag-and-drop. */}
      <select
        value={t.status} onChange={e => onMove(e.target.value as TicketStatusValue)} aria-label={`Status of T-${t.number}`}
        style={{ ...inputStyle, marginTop: 8, width: '100%', padding: '4px 6px', fontSize: 12, cursor: 'pointer' }}
      >
        {TICKET_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    </div>
  )
}

function ListView({
  items, groupBy, sortBy, showClosed, onMove,
}: { items: TicketListItem[]; groupBy: GroupBy; sortBy: SortBy; showClosed: boolean; onMove: (t: TicketListItem, to: TicketStatusValue) => void }) {
  const statusOrder = (s: TicketStatusValue) => TICKET_STATUSES.indexOf(s)
  const visible = items.filter(t => showClosed || (t.status !== 'DONE' && t.status !== 'CLOSED'))
  const sorted = [...visible].sort((a, b) => {
    if (sortBy === 'priority') return byPriorityThenRecent(a, b)
    if (sortBy === 'number') return b.number - a.number
    if (sortBy === 'status') return statusOrder(a.status) - statusOrder(b.status) || byPriorityThenRecent(a, b)
    return +new Date(b.updatedAt) - +new Date(a.updatedAt)
  })

  const keyOf = (t: TicketListItem): [string, string] => {
    switch (groupBy) {
      case 'tenant': return [(t.tenantName ?? '~~~').toLowerCase(), t.tenantName ?? 'No tenant (internal)']
      case 'type': return [String(TICKET_TYPES.indexOf(t.type)), TYPE_LABEL[t.type]]
      case 'priority': return [String(5 - PRIORITY_RANK[t.priority]), PRIORITY_LABEL[t.priority]]
      case 'area': return [t.area ?? '~', t.area ?? 'No area']
      case 'status': return [String(statusOrder(t.status)), STATUS_LABEL[t.status]]
      default: return ['', '']
    }
  }
  const groups = new Map<string, { label: string; rows: TicketListItem[] }>()
  for (const t of sorted) {
    const [k, label] = keyOf(t)
    if (!groups.has(k)) groups.set(k, { label, rows: [] })
    groups.get(k)!.rows.push(t)
  }
  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))

  if (sorted.length === 0) return <div style={{ color: C.faint, fontSize: 14, padding: '24px 4px' }}>No tickets match.</div>

  return (
    <div className="flex flex-col gap-5">
      {ordered.map(([k, g]) => (
        <div key={k}>
          {groupBy !== 'none' && <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 2px 8px' }}>{g.label} · {g.rows.length}</div>}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', backgroundColor: C.card }}>
            {g.rows.map((t, i) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5" style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 46 }}>T-{t.number}</span>
                <PriorityDot priority={t.priority} />
                <Link href={`/super-admin/tickets/${t.number}`} style={{ flex: '1 1 240px', minWidth: 0, color: C.text, textDecoration: 'none', fontSize: 14, fontWeight: 600, wordBreak: 'break-word' }}>{t.title}</Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Chip>
                  {t.tenantName && <PlainChip title="Tenant">{t.tenantName}</PlainChip>}
                  {t.area && <PlainChip title="Area">{t.area}</PlainChip>}
                  {t.attachmentCount > 0 && <PlainChip>📎 {t.attachmentCount}</PlainChip>}
                  <span style={{ fontSize: 11, color: C.faint, minWidth: 34, textAlign: 'right' }} suppressHydrationWarning>{age(t.updatedAt)}</span>
                  <select value={t.status} onChange={e => onMove(t, e.target.value as TicketStatusValue)} aria-label={`Status of T-${t.number}`}
                    style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, cursor: 'pointer', color: STATUS_TONE[t.status].color, borderColor: STATUS_TONE[t.status].border }}>
                    {TICKET_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuickAdd({ tenants, onDone }: { tenants: { id: string; name: string }[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState(false)
  const [more, setMore] = useState(false)
  const [type, setType] = useState<TicketTypeValue>('TASK')
  const [priority, setPriority] = useState<TicketPriorityValue>('NORMAL')
  const [area, setArea] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    if (busy || !title.trim()) return
    setBusy(true); setMsg(null)
    const shared = { type, priority, area: area || null, tenantId: tenantId || null }
    const res = bulk
      ? await bulkCreateTickets(title.split('\n'), shared)
      : await createTicketAction({ title: title.trim().split('\n')[0], description: description || title.trim().split('\n').slice(1).join('\n'), ...shared })
    setBusy(false)
    if ('error' in res) { setMsg(res.error); return }
    setTitle(''); setDescription('')
    setMsg(bulk && 'numbers' in res ? `Added ${res.numbers.length} tickets` : 'Added')
    setTimeout(() => setMsg(null), 2500)
    onDone()
  }

  return (
    <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div className="flex flex-wrap items-start gap-2">
        {bulk ? (
          <textarea value={title} onChange={e => setTitle(e.target.value)} rows={4} placeholder={'One ticket per line…\nFix the thing\nAdd the other thing'} style={{ ...inputStyle, flex: '1 1 260px', resize: 'vertical' }} aria-label="Bulk add tickets" />
        ) : (
          <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit() }} placeholder="+ Add a ticket — type a title and press Enter" style={{ ...inputStyle, flex: '1 1 260px' }} aria-label="New ticket title" />
        )}
        <button style={{ ...buttonStyle, opacity: busy || !title.trim() ? 0.5 : 1 }} disabled={busy || !title.trim()} onClick={() => void submit()}>{bulk ? 'Add all' : 'Add'}</button>
        <button style={ghostButtonStyle} onClick={() => setMore(m => !m)}>{more ? 'Fewer options' : 'Options'}</button>
        <button style={ghostButtonStyle} onClick={() => setBulk(b => !b)}>{bulk ? 'Single' : 'Bulk'}</button>
        {msg && <span style={{ fontSize: 12, color: msg === 'Added' || msg.startsWith('Added') ? '#86efac' : '#fca5a5', alignSelf: 'center' }}>{msg}</span>}
      </div>
      {more && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <select value={type} onChange={e => setType(e.target.value as TicketTypeValue)} style={inputStyle} aria-label="Type">{TICKET_TYPES.map(v => <option key={v} value={v}>{TYPE_LABEL[v]}</option>)}</select>
          <select value={priority} onChange={e => setPriority(e.target.value as TicketPriorityValue)} style={inputStyle} aria-label="Priority">{TICKET_PRIORITIES.map(v => <option key={v} value={v}>{PRIORITY_LABEL[v]}</option>)}</select>
          <select value={area} onChange={e => setArea(e.target.value)} style={inputStyle} aria-label="Area"><option value="">No area</option>{TICKET_AREAS.map(v => <option key={v} value={v}>{v}</option>)}</select>
          <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={inputStyle} aria-label="Tenant"><option value="">No tenant (internal)</option>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {!bulk && <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, flex: '1 1 220px' }} aria-label="Description" />}
        </div>
      )}
    </div>
  )
}
