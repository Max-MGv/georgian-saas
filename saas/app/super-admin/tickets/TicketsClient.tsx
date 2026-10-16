'use client'

/**
 * The ticket board / list (Plan-TicketsV2 Tier 1). A ticket opens in a side panel over the board
 * (`?t=12`), so you never lose your place: Esc, ✕, a click outside or the browser's Back closes it.
 * Every filter lives in the URL (Back keeps it, a link can share it); the common ones are one-tap views.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type RefObject } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronDown, ChevronUp, Ellipsis, Eye, EyeOff, Hourglass, ImagePlus, LayoutGrid, Link2, List, ListFilter, ListPlus, Megaphone,
  Bug, Search, SlidersHorizontal, X, Inbox, Rocket, MessageCircleQuestion, Server,
} from 'lucide-react'
import type { TicketDetail as Ticket, TicketListItem } from '@/lib/ticketService'
import {
  PRIORITY_LABEL, PRIORITY_RANK, SOURCE_LABEL, STATUS_LABEL, TICKET_AREAS, TICKET_PRIORITIES, TICKET_SOURCES,
  TICKET_STATUSES, TICKET_TYPES, TYPE_LABEL, ticketRef,
  type TicketCloseReasonValue, type TicketPriorityValue, type TicketStatusValue, type TicketTypeValue,
} from '@/lib/tickets'
import { bulkCreateTickets, createTicketAction, getTicket, moveTicket, uploadTicketAttachment } from '@/app/actions/tickets'
import {
  C, CloseReasonDialog, EnvPill, IconButton, PRIORITY_OPTIONS, Picker, PriorityIcon, STATUS_ICON, STATUS_OPTIONS, STATUS_TONE,
  SourceIcon, StatusPill, TYPE_OPTIONS, TypeIcon, age, buttonStyle, ghostButtonStyle, inputStyle,
} from './ui'
import TicketDetail from './TicketDetail'

type Mode = 'board' | 'list'
type Preset = 'all' | 'waiting' | 'reports' | 'bugs' | 'release'
type GroupBy = 'none' | 'tenant' | 'type' | 'priority' | 'area' | 'status'
type SortBy = 'updated' | 'priority' | 'number' | 'status'
type Env = 'PRODUCTION' | 'STAGING' | 'LOCAL'

const MODE_KEY = 'tickets.view'
const NO_TENANT = '__none'
const FILTER_KEYS = ['type', 'priority', 'area', 'source', 'tenant', 'status'] as const

const isOpen = (t: { status: TicketStatusValue }) => t.status !== 'DONE' && t.status !== 'CLOSED'
const byPriorityThenRecent = (a: TicketListItem, b: TicketListItem) =>
  PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || +new Date(b.updatedAt) - +new Date(a.updatedAt)

const PRESETS: { id: Preset; label: string; hint: string; icon: typeof Inbox; test: (t: TicketListItem) => boolean }[] = [
  { id: 'all', label: 'All', hint: 'Every ticket', icon: Inbox, test: () => true },
  { id: 'waiting', label: 'Waiting for me', hint: 'Work to test, and questions waiting for your answer', icon: Hourglass, test: t => t.status === 'REVIEW' || t.openQuestions > 0 },
  { id: 'reports', label: 'Reports', hint: 'Sent with the report button - here, or by a client on production (P-)', icon: Megaphone, test: t => t.source === 'WIDGET' || t.source === 'PRODUCTION' },
  { id: 'bugs', label: 'Open bugs', hint: 'Bugs not yet done or closed', icon: Bug, test: t => t.type === 'BUG' && isOpen(t) },
  { id: 'release', label: 'Next release', hint: 'On staging, not yet on production - what the next production update would ship', icon: Rocket, test: t => !!t.liveOnStagingAt && !t.liveOnProductionAt && t.status !== 'CLOSED' },
]

function typingIn(el: EventTarget | null) {
  const e = el as HTMLElement | null
  return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' || e.isContentEditable)
}

export default function TicketsClient({ tickets, tenants, env }: { tickets: TicketListItem[]; tenants: { id: string; name: string }[]; env: Env }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  // Optimistic moves are kept as a small overlay on the server's list and thrown away as soon as a
  // fresh list arrives ("adjust state during render", the pattern React documents for this).
  const [overrides, setOverrides] = useState<Record<string, Partial<TicketListItem>>>({})
  const [seenTickets, setSeenTickets] = useState(tickets)
  if (seenTickets !== tickets) { setSeenTickets(tickets); setOverrides({}) }
  const items = useMemo(() => tickets.map(t => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)), [tickets, overrides])

  // ── URL state ────────────────────────────────────────────────────────
  const setParams = useCallback((patch: Record<string, string | null>, push = false) => {
    const p = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') p.delete(k); else p.set(k, v) }
    const qs = p.toString()
    window.history[push ? 'pushState' : 'replaceState'](null, '', qs ? `?${qs}` : window.location.pathname)
  }, [])

  const [savedMode, setSavedMode] = useState<Mode>('board')
  // localStorage only exists in the browser: the server renders 'board', the saved choice applies once mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const v = window.localStorage.getItem(MODE_KEY); if (v === 'board' || v === 'list') setSavedMode(v) } catch { /* private window */ } }, [])
  const mode: Mode = sp.get('v') === 'list' || sp.get('v') === 'board' ? (sp.get('v') as Mode) : savedMode
  const changeMode = (m: Mode) => { setSavedMode(m); try { window.localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ } setParams({ v: m }) }

  const preset = (PRESETS.find(p => p.id === sp.get('f'))?.id ?? 'all') as Preset
  const f = Object.fromEntries(FILTER_KEYS.map(k => [k, sp.get(k) ?? 'ALL'])) as Record<(typeof FILTER_KEYS)[number], string>
  const groupBy = (sp.get('group') ?? 'none') as GroupBy
  const sortBy = (sp.get('sort') ?? 'updated') as SortBy
  const showClosed = sp.get('closed') === '1'
  const openNumber = Number(sp.get('t')?.replace(/^t-/i, '')) || null

  // The search box keeps its own state (typing must never lag), mirrored into the URL.
  const [q, setQ] = useState(() => sp.get('q') ?? '')
  const updateQ = (v: string) => { setQ(v); setParams({ q: v || null }) }
  const [showFilters, setShowFilters] = useState(false)
  const activeFilters = FILTER_KEYS.filter(k => f[k] !== 'ALL').length

  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<TicketListItem | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const presetTest = PRESETS.find(p => p.id === preset)!.test
    return items.filter(t => {
      if (!presetTest(t)) return false
      if (f.tenant === NO_TENANT ? t.tenantId !== null : f.tenant !== 'ALL' && t.tenantId !== f.tenant) return false
      if (f.type !== 'ALL' && t.type !== f.type) return false
      if (f.priority !== 'ALL' && t.priority !== f.priority) return false
      if (f.area !== 'ALL' && t.area !== f.area) return false
      if (f.source !== 'ALL' && t.source !== f.source) return false
      if (f.status !== 'ALL' && t.status !== f.status) return false
      if (needle) {
        const hay = `t-${t.number} ${t.ref} ${t.title} ${t.area ?? ''} ${t.labels.join(' ')} ${t.tenantName ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [items, q, preset, f.tenant, f.type, f.priority, f.area, f.source, f.status])

  const counts = Object.fromEntries(PRESETS.map(p => [p.id, items.filter(p.test).length])) as Record<Preset, number>
  const openCount = items.filter(isOpen).length

  // What is on screen, in screen order - the panel's ↑ ↓ step through exactly this.
  const listRows = useMemo(() => sortRows(filtered.filter(t => showClosed || f.status !== 'ALL' || isOpen(t)), sortBy), [filtered, showClosed, f.status, sortBy])
  const orderedVisible = useMemo(() => {
    if (mode === 'list') return groupRows(listRows, groupBy).flatMap(([, g]) => g.rows)
    return TICKET_STATUSES.flatMap(s => {
      const collapsible = s === 'DONE' || s === 'CLOSED'
      return !collapsible || expanded.has(s) ? filtered.filter(t => t.status === s).sort(byPriorityThenRecent) : []
    })
  }, [mode, listRows, groupBy, filtered, expanded])

  // ── Opening / closing the panel ────────────────────────────────────────
  const pushedPanel = useRef(false)
  const openTicket = useCallback((n: number) => {
    if (openNumber === null) { pushedPanel.current = true; setParams({ t: String(n) }, true) }
    else setParams({ t: String(n) })
  }, [openNumber, setParams])
  const closePanel = useCallback(() => {
    // If we added the history entry, step back over it so Back/Forward stay clean; otherwise (a shared link) just drop ?t.
    if (pushedPanel.current) { pushedPanel.current = false; window.history.back() } else setParams({ t: null })
  }, [setParams])
  const navIndex = openNumber === null ? -1 : orderedVisible.findIndex(t => t.number === openNumber)
  const step = useCallback((d: number) => {
    if (navIndex < 0) return
    const next = orderedVisible[navIndex + d]
    if (next) setParams({ t: String(next.number) })
  }, [orderedVisible, navIndex, setParams])

  // Keyboard: / search · c new ticket · j/k next/previous · Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-ticket-panel])') || document.querySelector('[role="menu"]')) return
      if (e.key === 'Escape' && openNumber !== null) { e.preventDefault(); closePanel() }
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'c' && openNumber === null) { e.preventDefault(); addRef.current?.focus() }
      else if ((e.key === 'j' || e.key === 'k') && openNumber !== null) { e.preventDefault(); step(e.key === 'j' ? 1 : -1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNumber, closePanel, step])

  async function move(t: TicketListItem, to: TicketStatusValue, reason?: TicketCloseReasonValue, duplicateOf?: number) {
    if (t.status === to) return
    if (to === 'CLOSED' && !reason) { setClosing(t); return }
    setError(null)
    setOverrides(prev => ({ ...prev, [t.id]: { status: to, closeReason: to === 'CLOSED' ? (reason ?? null) : null, updatedAt: new Date().toISOString() } }))
    const res = await moveTicket(t.number, to, reason ?? null, duplicateOf ?? null)
    if ('error' in res) setError(res.error)
    startTransition(() => router.refresh())
  }

  const refreshBoard = useCallback(() => startTransition(() => router.refresh()), [router])
  const filterSelect = (key: (typeof FILTER_KEYS)[number], label: string, options: [string, string][]) => (
    <select value={f[key]} onChange={e => setParams({ [key]: e.target.value === 'ALL' ? null : e.target.value })} aria-label={label} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 200 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  return (
    <div style={{ color: C.text }}>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Tickets</h1>
          <EnvPill env={env} />
          <span style={{ fontSize: 13, color: C.faint }}>{openCount} open · {items.length} total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton icon={LayoutGrid} label="Board" active={mode === 'board'} onClick={() => changeMode('board')} />
          <IconButton icon={List} label="List" active={mode === 'list'} onClick={() => changeMode('list')} />
        </div>
      </div>

      <QuickAdd tenants={tenants} inputRef={addRef} onDone={refreshBoard} onOpen={openTicket} />

      {/* ── One-tap views + search + filter ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {PRESETS.map(p => {
          const I = p.icon
          const on = preset === p.id
          const urgent = p.id === 'waiting' && counts.waiting > 0
          return (
            <button key={p.id} title={p.hint} aria-pressed={on} onClick={() => setParams({ f: p.id === 'all' ? null : p.id })}
              style={{
                ...ghostButtonStyle, fontWeight: 600, padding: '6px 11px',
                borderColor: on ? '#6366f1' : urgent ? '#0f766e' : C.border,
                backgroundColor: on ? '#312e81' : 'transparent',
                color: on ? '#e0e7ff' : urgent ? '#5eead4' : C.muted,
              }}>
              <I size={15} aria-hidden /> <span className="hidden sm:inline">{p.label}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>{counts[p.id]}</span>
            </button>
          )
        })}
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 300 }}>
          <Search size={14} color={C.faint} style={{ position: 'absolute', left: 9, top: 10 }} aria-hidden />
          <input ref={searchRef} value={q} onChange={e => updateQ(e.target.value)} placeholder="Search  ( / )" aria-label="Search tickets"
            onKeyDown={e => { if (e.key === 'Escape') { updateQ(''); (e.target as HTMLInputElement).blur() } }}
            style={{ ...inputStyle, width: '100%', paddingLeft: 28 }} />
        </div>
        <button onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters} title="Filters" aria-label="Filters"
          style={{ ...ghostButtonStyle, padding: '6px 10px', borderColor: activeFilters || showFilters ? '#6366f1' : C.border, color: activeFilters ? '#c7d2fe' : C.muted }}>
          <ListFilter size={15} aria-hidden />{activeFilters > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{activeFilters}</span>}
        </button>
        {mode === 'list' && (
          <IconButton icon={showClosed ? EyeOff : Eye} label={showClosed ? 'Hide done / closed' : 'Show done / closed'} active={showClosed} onClick={() => setParams({ closed: showClosed ? null : '1' })} />
        )}
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-4" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, backgroundColor: C.card }}>
          {filterSelect('type', 'Type', [['ALL', 'All types'], ...TICKET_TYPES.map(v => [v, TYPE_LABEL[v]] as [string, string])])}
          {filterSelect('priority', 'Priority', [['ALL', 'All priorities'], ...TICKET_PRIORITIES.map(v => [v, PRIORITY_LABEL[v]] as [string, string])])}
          {filterSelect('area', 'Area', [['ALL', 'All areas'], ...TICKET_AREAS.map(v => [v, v] as [string, string])])}
          {filterSelect('tenant', 'Tenant', [['ALL', 'All tenants'], [NO_TENANT, 'Internal (no tenant)'], ...tenants.map(t => [t.id, t.name] as [string, string])])}
          {filterSelect('source', 'Source', [['ALL', 'All sources'], ...TICKET_SOURCES.map(v => [v, SOURCE_LABEL[v]] as [string, string])])}
          {filterSelect('status', 'Status', [['ALL', 'All statuses'], ...TICKET_STATUSES.map(v => [v, STATUS_LABEL[v]] as [string, string])])}
          {mode === 'list' && (
            <>
              <select value={groupBy} onChange={e => setParams({ group: e.target.value === 'none' ? null : e.target.value })} aria-label="Group by" style={{ ...inputStyle, cursor: 'pointer' }}>
                {[['none', 'No grouping'], ['tenant', 'Group: tenant'], ['type', 'Group: type'], ['priority', 'Group: priority'], ['area', 'Group: area'], ['status', 'Group: status']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={sortBy} onChange={e => setParams({ sort: e.target.value === 'updated' ? null : e.target.value })} aria-label="Sort" style={{ ...inputStyle, cursor: 'pointer' }}>
                {[['updated', 'Sort: recent'], ['priority', 'Sort: priority'], ['number', 'Sort: newest #'], ['status', 'Sort: status']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>
          )}
          {(activeFilters > 0 || q) && (
            <button style={ghostButtonStyle} onClick={() => { setQ(''); setParams({ q: null, ...Object.fromEntries(FILTER_KEYS.map(k => [k, null])) }) }}><X size={14} aria-hidden /> Clear</button>
          )}
        </div>
      )}

      {error && <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 10 }} role="alert">{error}</div>}

      {mode === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ alignItems: 'flex-start' }}>
          {TICKET_STATUSES.map(s => {
            const col = filtered.filter(t => t.status === s).sort(byPriorityThenRecent)
            const collapsible = s === 'DONE' || s === 'CLOSED'
            const colOpen = !collapsible || expanded.has(s)
            const I = STATUS_ICON[s]
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
                  flex: `0 0 ${colOpen ? 272 : 150}px`, backgroundColor: overCol === s ? '#162033' : C.card, borderRadius: 12,
                  border: `1px solid ${overCol === s ? '#6366f1' : C.border}`, padding: 10, minHeight: 90,
                }}
              >
                <div className="flex items-center mb-2" style={{ gap: 6, color: STATUS_TONE[s].color, fontSize: 13, fontWeight: 700 }}>
                  <I size={15} aria-hidden /> {STATUS_LABEL[s]}
                  <span style={{ fontSize: 12, color: C.faint, fontWeight: 500 }}>{col.length}</span>
                  {collapsible && (
                    <button
                      onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n })}
                      aria-label={colOpen ? `Hide ${STATUS_LABEL[s]}` : `Show ${STATUS_LABEL[s]}`} title={colOpen ? 'Hide' : 'Show'}
                      style={{ marginLeft: 'auto', color: C.faint, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}
                    >{colOpen ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  )}
                </div>
                {colOpen && (
                  <div className="flex flex-col gap-2" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                    {col.length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: '6px 2px' }}>Nothing here</div>}
                    {col.map(t => (
                      <Card key={t.id} t={t} active={t.number === openNumber} onOpen={() => openTicket(t.number)}
                        onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null) }} onMove={to => void move(t, to)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <ListView rows={listRows} groupBy={groupBy} openNumber={openNumber} onOpen={openTicket} onMove={(t, to) => void move(t, to)} />
      )}

      {openNumber !== null && (
        <Panel
          number={openNumber} listItem={items.find(t => t.number === openNumber) ?? null} tenants={tenants}
          onClose={closePanel} onStep={step} hasPrev={navIndex > 0} hasNext={navIndex >= 0 && navIndex < orderedVisible.length - 1}
          onOpenTicket={openTicket} onBoardChanged={refreshBoard}
        />
      )}

      {closing && (
        <CloseReasonDialog title={`${closing.ref} · ${closing.title}`} onCancel={() => setClosing(null)}
          onPick={(r, dup) => { const t = closing; setClosing(null); void move(t, 'CLOSED', r, dup) }} />
      )}
    </div>
  )
}

// ── Side panel ────────────────────────────────────────────────────────────

function Panel({ number, listItem, tenants, onClose, onStep, hasPrev, hasNext, onOpenTicket, onBoardChanged }: {
  number: number; listItem: TicketListItem | null; tenants: { id: string; name: string }[]
  onClose: () => void; onStep: (d: number) => void; hasPrev: boolean; hasNext: boolean
  onOpenTicket: (n: number) => void; onBoardChanged: () => void
}) {
  const [copied, setCopied] = useState(false)
  // The page behind must not scroll while the panel is open (phones especially).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(2,6,23,0.55)' }} aria-hidden />
      <div
        role="dialog" aria-modal="true" aria-label={`Ticket ${listItem?.ref ?? ticketRef(number)}`} data-ticket-panel
        className="ticket-panel"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(760px, 100vw)', backgroundColor: C.bg, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center gap-2" style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.card }}>
          <strong style={{ fontSize: 14, color: C.muted }}>{listItem?.ref ?? ticketRef(number)}</strong>
          {listItem && <SourceIcon source={listItem.source} />}
          <div style={{ marginLeft: 'auto' }} className="flex items-center gap-1.5">
            <IconButton icon={ChevronUp} label="Previous ticket (k)" disabled={!hasPrev} onClick={() => onStep(-1)} />
            <IconButton icon={ChevronDown} label="Next ticket (j)" disabled={!hasNext} onClick={() => onStep(1)} />
            <IconButton icon={Link2} label={copied ? 'Link copied' : 'Copy link'} active={copied} onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/super-admin/tickets?t=${number}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
            }} />
            <IconButton icon={X} label="Close (Esc)" onClick={onClose} size={18} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 40px' }}>
          <PanelBody key={number} number={number} listItem={listItem} tenants={tenants} onOpenTicket={onOpenTicket} onBoardChanged={onBoardChanged} />
        </div>
      </div>
      <style>{'@keyframes ticketPanelIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}.ticket-panel{animation:ticketPanelIn .16s ease-out}@media (prefers-reduced-motion:reduce){.ticket-panel{animation:none}}'}</style>
    </div>
  )
}

function PanelBody({ number, listItem, tenants, onOpenTicket, onBoardChanged }: {
  number: number; listItem: TicketListItem | null; tenants: { id: string; name: string }[]
  onOpenTicket: (n: number) => void; onBoardChanged: () => void
}) {
  const [detail, setDetail] = useState<Ticket | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const req = useRef(0)

  const load = useCallback(async () => {
    const id = ++req.current
    try {
      const d = await getTicket(number)
      if (id !== req.current) return
      if (d) { setDetail(d); setLoadError(null) } else setLoadError(`${ticketRef(number)} does not exist.`)
    } catch {
      if (id === req.current) setLoadError('Could not load the ticket. Check your connection and try again.')
    }
  }, [number])
  // First load: the result is applied in a callback (and dropped if another load started since).
  useEffect(() => {
    const id = ++req.current
    getTicket(number).then(
      d => { if (id !== req.current) return; if (d) setDetail(d); else setLoadError(`${ticketRef(number)} does not exist.`) },
      () => { if (id === req.current) setLoadError('Could not load the ticket. Check your connection and try again.') },
    )
  }, [number])

  if (detail) {
    return <TicketDetail t={detail} tenants={tenants} onOpenTicket={onOpenTicket} onChanged={async () => { onBoardChanged(); await load() }} />
  }
  if (loadError) return <div role="alert" style={{ color: '#fca5a5', fontSize: 14 }}>{loadError} <button style={{ ...ghostButtonStyle, marginLeft: 8 }} onClick={() => void load()}>Retry</button></div>
  // While loading, show what the board already knows so the panel is never empty.
  return (
    <div aria-busy="true">
      <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, margin: 0 }}>{listItem?.title ?? 'Loading…'}</h2>
      {listItem && <div className="mt-3"><StatusPill status={listItem.status} closeReason={listItem.closeReason} /></div>}
      <div style={{ marginTop: 20, height: 80, borderRadius: 10, backgroundColor: C.card, opacity: 0.6 }} />
    </div>
  )
}

// ── Board card ───────────────────────────────────────────────────────────

function MoveMenu({ t, onMove }: { t: TicketListItem; onMove: (to: TicketStatusValue) => void }) {
  return (
    <Picker label={`Move ${t.ref}`} value={t.status} options={STATUS_OPTIONS} onChange={onMove}
      buttonStyle={{ border: 'none', padding: 4, color: C.faint }}>
      <Ellipsis size={16} aria-hidden />
    </Picker>
  )
}

function Card({ t, active, onOpen, onDragStart, onDragEnd, onMove }: {
  t: TicketListItem; active: boolean; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; onMove: (to: TicketStatusValue) => void
}) {
  return (
    <div
      draggable onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onOpen() }}
      onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); onDragStart() }}
      onDragEnd={onDragEnd}
      className="ticket-card"
      style={{ backgroundColor: active ? '#1e1b4b' : C.bg, border: `1px solid ${active ? '#6366f1' : C.border}`, borderRadius: 10, padding: '9px 10px', cursor: 'pointer' }}
    >
      <div className="flex items-center gap-2" style={{ fontSize: 11, color: C.faint }}>
        <span style={{ fontWeight: 700, color: C.muted }}>{t.ref}</span>
        <PriorityIcon priority={t.priority} size={14} />
        <TypeIcon type={t.type} size={14} />
        {(t.source === 'WIDGET' || t.source === 'PRODUCTION') && <SourceIcon source={t.source} size={13} />}
        <Signals t={t} />
        {/* "5m" depends on the current time: server and browser render a moment apart, so this text may differ. */}
        <span style={{ marginLeft: 'auto' }} suppressHydrationWarning>{age(t.updatedAt)}</span>
        <span onClick={e => e.stopPropagation()}><MoveMenu t={t} onMove={onMove} /></span>
      </div>
      {/* A real link for middle-click / ctrl-click and screen readers; a plain click opens the panel. */}
      <a href={`?t=${t.number}`} onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault() } }}
        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', color: C.text, textDecoration: 'none', fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginTop: 4 }}>
        {t.title}
      </a>
      {(t.tenantName || t.area || t.attachmentCount > 0 || t.commentCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5" style={{ fontSize: 11, color: C.faint }}>
          {t.tenantName && <span title="Tenant" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tenantName}</span>}
          {t.area && <span title="Area">{t.area}</span>}
          {t.attachmentCount > 0 && <span title={`${t.attachmentCount} image(s)`}>📎 {t.attachmentCount}</span>}
          {t.commentCount > 0 && <span title={`${t.commentCount} comment(s)`}>💬 {t.commentCount}</span>}
        </div>
      )}
      <style>{'.ticket-card:hover{border-color:#334155 !important}'}</style>
    </div>
  )
}

/** The two things worth seeing at a glance on a card: a question waiting for Max, and where the work is live. */
function Signals({ t }: { t: TicketListItem }) {
  return (
    <>
      {t.openQuestions > 0 && (
        <span title={`${t.openQuestions} question(s) waiting for your answer`} role="img" aria-label="Question waiting for you"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#c4b5fd', fontWeight: 700 }}>
          <MessageCircleQuestion size={14} aria-hidden />{t.openQuestions > 1 ? t.openQuestions : ''}
        </span>
      )}
      {t.liveOnProductionAt
        ? <span title="Live on production" role="img" aria-label="Live on production" style={{ display: 'inline-flex', color: '#86efac' }}><Rocket size={13} aria-hidden /></span>
        : t.liveOnStagingAt
          ? <span title="On staging, not yet on production" role="img" aria-label="On staging" style={{ display: 'inline-flex', color: '#fbbf24' }}><Server size={13} aria-hidden /></span>
          : null}
    </>
  )
}

// ── List ─────────────────────────────────────────────────────────────────

function sortRows(rows: TicketListItem[], sortBy: SortBy) {
  const statusOrder = (s: TicketStatusValue) => TICKET_STATUSES.indexOf(s)
  return [...rows].sort((a, b) => {
    if (sortBy === 'priority') return byPriorityThenRecent(a, b)
    if (sortBy === 'number') return b.number - a.number
    if (sortBy === 'status') return statusOrder(a.status) - statusOrder(b.status) || byPriorityThenRecent(a, b)
    return +new Date(b.updatedAt) - +new Date(a.updatedAt)
  })
}

function groupRows(rows: TicketListItem[], groupBy: GroupBy): [string, { label: string; rows: TicketListItem[] }][] {
  const keyOf = (t: TicketListItem): [string, string] => {
    switch (groupBy) {
      case 'tenant': return [(t.tenantName ?? '~~~').toLowerCase(), t.tenantName ?? 'Internal (no tenant)']
      case 'type': return [String(TICKET_TYPES.indexOf(t.type)), TYPE_LABEL[t.type]]
      case 'priority': return [String(5 - PRIORITY_RANK[t.priority]), PRIORITY_LABEL[t.priority]]
      case 'area': return [t.area ?? '~', t.area ?? 'No area']
      case 'status': return [String(TICKET_STATUSES.indexOf(t.status)), STATUS_LABEL[t.status]]
      default: return ['', '']
    }
  }
  const groups = new Map<string, { label: string; rows: TicketListItem[] }>()
  for (const t of rows) {
    const [k, label] = keyOf(t)
    if (!groups.has(k)) groups.set(k, { label, rows: [] })
    groups.get(k)!.rows.push(t)
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
}

function ListView({ rows, groupBy, openNumber, onOpen, onMove }: {
  rows: TicketListItem[]; groupBy: GroupBy; openNumber: number | null; onOpen: (n: number) => void; onMove: (t: TicketListItem, to: TicketStatusValue) => void
}) {
  if (rows.length === 0) return <div style={{ color: C.faint, fontSize: 14, padding: '24px 4px' }}>No tickets match.</div>
  return (
    <div className="flex flex-col gap-5">
      {groupRows(rows, groupBy).map(([k, g]) => (
        <div key={k}>
          {groupBy !== 'none' && <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 2px 8px' }}>{g.label} · {g.rows.length}</div>}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', backgroundColor: C.card }}>
            {g.rows.map((t, i) => (
              <div key={t.id} onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onOpen(t.number) }} className="flex items-center gap-3 ticket-row"
                style={{ padding: '9px 12px', borderTop: i ? `1px solid ${C.border}` : 'none', cursor: 'pointer', backgroundColor: t.number === openNumber ? '#1e1b4b' : undefined }}>
                <StatusPill status={t.status} closeReason={t.closeReason} compact />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 42, flexShrink: 0 }}>{t.ref}</span>
                <PriorityIcon priority={t.priority} size={14} />
                <TypeIcon type={t.type} size={14} />
                <Signals t={t} />
                <a href={`?t=${t.number}`} onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) e.preventDefault() }}
                  style={{ flex: 1, minWidth: 0, color: C.text, textDecoration: 'none', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</a>
                <span className="hidden md:inline" style={{ fontSize: 11, color: C.faint, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tenantName ?? ''}</span>
                {t.attachmentCount > 0 && <span className="hidden sm:inline" style={{ fontSize: 11, color: C.faint }}>📎 {t.attachmentCount}</span>}
                <span style={{ fontSize: 11, color: C.faint, minWidth: 30, textAlign: 'right' }} suppressHydrationWarning>{age(t.updatedAt)}</span>
                <span onClick={e => e.stopPropagation()}><MoveMenu t={t} onMove={to => onMove(t, to)} /></span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <style>{'.ticket-row:hover{background-color:#162033}'}</style>
    </div>
  )
}

// ── Quick add ────────────────────────────────────────────────────────────

function QuickAdd({ tenants, inputRef, onDone, onOpen }: {
  tenants: { id: string; name: string }[]; inputRef: RefObject<HTMLInputElement | null>; onDone: () => void; onOpen: (n: number) => void
}) {
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState(false)
  const [more, setMore] = useState(false)
  const [type, setType] = useState<TicketTypeValue>('TASK')
  const [priority, setPriority] = useState<TicketPriorityValue>('NORMAL')
  const [area, setArea] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<{ file: File; url: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; number?: number; error?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: File[]) => {
    const ok = list.filter(f => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type) && f.size <= 4 * 1024 * 1024)
    if (ok.length < list.length) setMsg({ text: 'Only PNG/JPEG/WebP/GIF up to 4 MB', error: true })
    setFiles(prev => [...prev, ...ok.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, 6))
  }
  const removeFile = (i: number) => setFiles(prev => { URL.revokeObjectURL(prev[i].url); return prev.filter((_, j) => j !== i) })

  async function submit() {
    if (busy || !title.trim()) return
    setBusy(true); setMsg(null)
    try {
      const shared = { type, priority, area: area || null, tenantId: tenantId || null }
      if (bulk) {
        const res = await bulkCreateTickets(title.split('\n'), shared)
        if ('error' in res) { setMsg({ text: res.error, error: true }); return }
        setMsg({ text: `Added ${res.numbers.length} tickets` })
      } else {
        const res = await createTicketAction({ title: title.trim().split('\n')[0], description: description || title.trim().split('\n').slice(1).join('\n'), ...shared })
        if ('error' in res) { setMsg({ text: res.error, error: true }); return }
        for (const { file } of files) {
          const fd = new FormData(); fd.set('number', String(res.number)); fd.set('file', file)
          const up = await uploadTicketAttachment(fd)
          if ('error' in up) { setMsg({ text: `${ticketRef(res.number)} added, but an image failed: ${up.error}`, number: res.number, error: true }); break }
        }
        setMsg(m => m ?? { text: `Added ${ticketRef(res.number)}`, number: res.number })
      }
      setTitle(''); setDescription(''); files.forEach(f => URL.revokeObjectURL(f.url)); setFiles([])
      setTimeout(() => setMsg(m => (m && !m.error ? null : m)), 5000)
      onDone()
    } catch {
      setMsg({ text: 'Something went wrong. Please try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, marginBottom: 14 }}
      onPaste={e => { const f = Array.from(e.clipboardData.files); if (!bulk && f.some(x => x.type.startsWith('image/'))) { e.preventDefault(); addFiles(f) } }}>
      <div className="flex items-start gap-2">
        {bulk ? (
          <textarea value={title} onChange={e => setTitle(e.target.value)} rows={4} placeholder={'One ticket per line…\nFix the thing\nAdd the other thing'} style={{ ...inputStyle, flex: 1, resize: 'vertical' }} aria-label="Bulk add tickets" />
        ) : (
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
            placeholder="+ New ticket  ( c )" style={{ ...inputStyle, flex: 1, fontSize: 14 }} aria-label="New ticket title" />
        )}
        {!bulk && <IconButton icon={ImagePlus} label="Attach images (or paste one)" onClick={() => fileRef.current?.click()} />}
        <IconButton icon={SlidersHorizontal} label={more ? 'Fewer options' : 'More options'} active={more} onClick={() => setMore(m => !m)} />
        <IconButton icon={ListPlus} label={bulk ? 'Back to one ticket' : 'Add many (one per line)'} active={bulk} onClick={() => setBulk(b => !b)} />
        <button style={{ ...buttonStyle, opacity: busy || !title.trim() ? 0.5 : 1 }} disabled={busy || !title.trim()} onClick={() => void submit()}>{bulk ? 'Add all' : 'Add'}</button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>
      {files.length > 0 && !bulk && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <div key={f.url} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.file.name} style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, display: 'block' }} />
              <button onClick={() => removeFile(i)} aria-label={`Remove ${f.file.name}`} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 999, border: 'none', backgroundColor: '#334155', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {more && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Picker label={`Type: ${TYPE_LABEL[type]}`} value={type} options={TYPE_OPTIONS} onChange={setType}><TypeIcon type={type} /> <span style={{ color: C.muted }}>{TYPE_LABEL[type]}</span></Picker>
          <Picker label={`Priority: ${PRIORITY_LABEL[priority]}`} value={priority} options={PRIORITY_OPTIONS} onChange={setPriority}><PriorityIcon priority={priority} /> <span style={{ color: C.muted }}>{PRIORITY_LABEL[priority]}</span></Picker>
          <select value={area} onChange={e => setArea(e.target.value)} style={inputStyle} aria-label="Area"><option value="">No area</option>{TICKET_AREAS.map(v => <option key={v} value={v}>{v}</option>)}</select>
          <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} aria-label="Tenant"><option value="">Internal (no tenant)</option>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {!bulk && <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, flex: '1 1 220px' }} aria-label="Description" />}
        </div>
      )}
      {msg && (
        <div style={{ fontSize: 12, marginTop: 6, color: msg.error ? '#fca5a5' : '#86efac' }} role="status">
          {msg.text}
          {msg.number && <button onClick={() => onOpen(msg.number!)} style={{ marginLeft: 8, background: 'none', border: 'none', color: C.accent, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>open</button>}
        </div>
      )}
    </div>
  )
}
