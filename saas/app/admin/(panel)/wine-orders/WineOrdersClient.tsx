'use client'

import { useState, useEffect, useRef, useMemo, useTransition } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { updateWineOrderStatus } from '@/app/actions/wineOrders'
import PackingView, { type PackingOrder, type PackingLayoutType, type BoxMode } from './PackingView'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

const STATUS_COLOR: Record<string, { border: string; pill: string; pillText: string; label: string }> = {
  pending:   { border: '#ca8a04', pill: '#fef9c3', pillText: '#713f12', label: 'Pending' },
  confirmed: { border: '#2563eb', pill: '#dbeafe', pillText: '#1e3a8a', label: 'Confirmed' },
  paid:      { border: '#16a34a', pill: '#dcfce7', pillText: '#14532d', label: 'Paid' },
  delivered: { border: '#7c3aed', pill: '#ede9fe', pillText: '#4c1d95', label: 'Delivered' },
  cancelled: { border: '#dc2626', pill: '#fee2e2', pillText: '#7f1d1d', label: 'Cancelled' },
}

type WineSelection = { id: string; name: string; quantity: number; price?: number }

type WineOrder = {
  id: string
  businessName: string
  llcName: string | null
  llcId: string | null
  address: string
  workingHours: string | null
  contactName: string
  contactPhone: string
  wines: unknown
  totalAmount: number | null
  discountPercent: number | null
  displayTotal: number | null
  totalEstimated: boolean
  status: string
  createdAt: Date | string
}

const STAGES = ['pending', 'confirmed', 'paid', 'delivered'] as const
type Stage = typeof STAGES[number]
const STAGE_LABELS: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', paid: 'Paid', delivered: 'Delivered',
}

const ALL_STATUSES = ['pending', 'confirmed', 'paid', 'delivered', 'cancelled'] as const
const STATUS_FILTER_OPTIONS = [...ALL_STATUSES] as const

type Mode = 'cards' | 'table' | 'pack'
type PendingChange = { orderId: string; toStatus: string }

// ── Icons ──────────────────────────────────────────────────────────────

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 5h5a4 4 0 1 1 0 8H4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 5l2.5-2.5M2 5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── StepButton ─────────────────────────────────────────────────────────

function StepButton({ label, index, isDone, isActive, isClickable, panelHovered, onClick, tooltip }: {
  label: string; index: number; isDone: boolean; isActive: boolean
  isClickable: boolean; panelHovered: boolean; onClick: () => void; tooltip?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tooltip}
      className="flex items-center gap-2.5"
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <div
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
        style={{
          borderColor: isDone ? C.wine : panelHovered && isClickable ? '#8a4a30' : C.border,
          backgroundColor: isDone ? C.wine : hovered && isClickable ? '#fdf0e8' : '#fff9f3',
          transform: hovered && isClickable ? 'scale(1.45)' : 'scale(1)',
          boxShadow: isActive
            ? `0 0 0 4px ${C.wine}22, 0 0 0 7px ${C.wine}12`
            : hovered && isClickable ? `0 0 0 6px ${C.wine}35` : undefined,
        }}
      >
        {isDone && !isActive ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="text-xs font-semibold" style={{ color: isDone ? 'white' : C.faint }}>{index + 1}</span>
        )}
      </div>
      <span
        className="transition-all duration-150"
        style={{
          color: hovered && isClickable ? C.wine : isActive ? C.wine : isDone ? C.muted : C.faint,
          fontSize: isActive ? '0.875rem' : '0.72rem',
          fontWeight: isActive ? 800 : hovered && isClickable ? 600 : 400,
          opacity: !isActive && !hovered ? 0.55 : 1,
        }}
      >
        {label}
      </span>
    </button>
  )
}

// ── VerticalStepper (cards only) ───────────────────────────────────────

function VerticalStepper({ orderId, status, onRequestChange, pendingToStatus, onConfirm, onCancel }: {
  orderId: string
  status: string
  onRequestChange: (toStatus: string) => void
  pendingToStatus?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [panelHovered, setPanelHovered] = useState(false)
  const isCancelled = status === 'cancelled'
  const currentIdx = STAGES.indexOf(status as Stage)

  return (
    <div
      className="flex flex-col"
      style={{ minWidth: 115 }}
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
    >
      {isCancelled ? (
        <>
          <div className="flex flex-col items-start">
            {STAGES.map((stage, i) => (
              <div key={stage} className="flex flex-col items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: '#d1b9a0', backgroundColor: '#f5efe6' }}>
                    <span className="text-xs" style={{ color: '#d1b9a0' }}>{i + 1}</span>
                  </div>
                  <span className="text-xs" style={{ color: '#d1b9a0' }}>{STAGE_LABELS[stage]}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="w-0.5 h-4 ml-3 my-0.5" style={{ backgroundColor: '#e8ddd0' }} />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => onRequestChange('pending')}
            className="mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            <UndoIcon /> Undo
          </button>
        </>
      ) : (
        <div className="flex flex-col items-start">
          {STAGES.map((stage, i) => {
            const isDone = currentIdx >= i
            const isActive = currentIdx === i
            const isClickable = i !== currentIdx
            return (
              <div key={stage} className="flex flex-col items-start">
                <StepButton
                  label={STAGE_LABELS[stage]}
                  index={i}
                  isDone={isDone}
                  isActive={isActive}
                  isClickable={isClickable}
                  panelHovered={panelHovered}
                  onClick={() => isClickable && onRequestChange(stage)}
                  tooltip={isClickable
                    ? (i < currentIdx ? `Revert to ${STAGE_LABELS[stage]}` : `Advance to ${STAGE_LABELS[stage]}`)
                    : undefined}
                />
                {i < STAGES.length - 1 && (
                  <div
                    className="w-0.5 h-4 ml-3 my-0.5 transition-colors duration-150"
                    style={{ backgroundColor: currentIdx > i ? C.wine : '#e0d4c0' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
      {pendingToStatus && (
        <div className="mt-2 pt-2 border-t flex items-center gap-1.5 text-xs" style={{ borderColor: C.border }}>
          <span style={{ color: C.muted, flex: 1 }}>
            → {STATUS_COLOR[pendingToStatus]?.label ?? pendingToStatus}?
          </span>
          <button onClick={onConfirm} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#16a34a' }}>✓</button>
          <button onClick={onCancel} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#dc2626' }}>✗</button>
        </div>
      )}
    </div>
  )
}

// ── FilterBar ──────────────────────────────────────────────────────────

function FilterBar({ filters, onToggleFilter, onClearFilters, search, onSearch, dateFrom, onDateFrom, dateTo, onDateTo }: {
  filters: Set<string>; onToggleFilter: (f: string) => void; onClearFilters: () => void
  search: string; onSearch: (s: string) => void
  dateFrom: string; onDateFrom: (d: string) => void
  dateTo: string; onDateTo: (d: string) => void
}) {
  const hasExtra = search || dateFrom || dateTo
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={onClearFilters}
          className="font-medium rounded-full transition-all duration-150"
          style={{
            backgroundColor: filters.size === 0 ? C.wine : '#fff',
            color: filters.size === 0 ? '#fff' : C.faint,
            border: `1px solid ${filters.size === 0 ? C.wine : C.border}`,
            fontSize: filters.size === 0 ? '0.8rem' : '0.72rem',
            padding: filters.size === 0 ? '0.3rem 0.85rem' : '0.2rem 0.7rem',
          }}
        >
          All
        </button>
        {STATUS_FILTER_OPTIONS.map(f => {
          const isActive = filters.has(f)
          const sc = STATUS_COLOR[f]
          return (
            <button
              key={f}
              onClick={() => onToggleFilter(f)}
              className="font-medium rounded-full transition-all duration-150"
              style={{
                backgroundColor: isActive ? sc.border : '#fff',
                color: isActive ? '#fff' : C.faint,
                border: `1px solid ${isActive ? sc.border : C.border}`,
                fontSize: isActive ? '0.8rem' : '0.72rem',
                padding: isActive ? '0.3rem 0.85rem' : '0.2rem 0.7rem',
              }}
            >
              {sc.label}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search company…"
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: C.border, color: C.text, backgroundColor: '#fff', minWidth: 160 }}
        />
        <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)} title="From"
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: C.border, color: dateFrom ? C.text : C.faint, backgroundColor: '#fff' }}
        />
        <span className="text-xs" style={{ color: C.faint }}>→</span>
        <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)} title="To"
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: C.border, color: dateTo ? C.text : C.faint, backgroundColor: '#fff' }}
        />
        {hasExtra && (
          <button onClick={() => { onSearch(''); onDateFrom(''); onDateTo('') }}
            className="text-xs px-2.5 py-1.5 rounded-lg border"
            style={{ borderColor: C.border, color: C.faint, backgroundColor: '#fff' }}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── TableView (Orders-page style) ──────────────────────────────────────

function TableView({ orders, pendingChange, onRequestChange, onConfirm, onCancel }: {
  orders: WineOrder[]
  pendingChange: PendingChange | null
  onRequestChange: (orderId: string, toStatus: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!statusMenuId) return
    function handler() { setStatusMenuId(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [statusMenuId])

  if (orders.length === 0) {
    return <p className="text-center py-12 text-sm" style={{ color: C.faint }}>No orders match the filters.</p>
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: C.border }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: 580 }}>
        <thead>
          <tr style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>Company</th>
            <th className="text-right px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>Amount</th>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>Date</th>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>Status</th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: '#ffffff' }}>
          {orders.map((order, i) => {
            const wines = order.wines as WineSelection[]
            const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.pending
            const isInactive = order.status === 'delivered' || order.status === 'cancelled'
            const isPending = pendingChange?.orderId === order.id
            const isLast = i === orders.length - 1

            return (
              <tr
                key={order.id}
                className="hover:bg-amber-50 transition-colors"
                style={{
                  borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                  borderLeft: `4px solid ${sc.border}`,
                  opacity: isInactive ? 0.6 : 1,
                  transition: 'opacity 0.3s, background-color 0.15s',
                }}
              >
                {/* Company + wines */}
                <td className="px-4 py-3">
                  <p className="font-semibold" style={{ color: C.text }}>{order.businessName}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {wines.map(w => (
                      <span key={w.id} className="text-xs px-1.5 py-0.5 rounded border"
                        style={{ borderColor: C.border, color: C.muted, backgroundColor: '#f5efe6' }}>
                        {w.name} × {w.quantity}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Amount */}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="font-medium" style={{ color: order.displayTotal != null ? C.wine : C.faint }}>
                    {order.displayTotal != null
                      ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾`
                      : '—'}
                  </span>
                  {order.discountPercent && order.discountPercent > 0 && (
                    <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                      −{order.discountPercent}%
                    </span>
                  )}
                </td>

                {/* Date */}
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.muted, fontSize: '0.8rem' }}>
                  {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                </td>

                {/* Status — dropdown pill + inline confirm */}
                <td className="px-4 py-3">
                  <div className="relative">
                    <button
                      onClick={e => { e.stopPropagation(); setStatusMenuId(statusMenuId === order.id ? null : order.id) }}
                      className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap"
                      style={{ backgroundColor: sc.pill, color: sc.pillText, border: `1px solid ${sc.border}44` }}
                    >
                      {sc.label} ▾
                    </button>
                    {statusMenuId === order.id && (
                      <div
                        className="absolute left-0 z-20 rounded-xl border shadow-lg py-1 mt-1"
                        style={{ minWidth: 150, backgroundColor: C.bg, borderColor: C.border }}
                        onClick={e => e.stopPropagation()}
                      >
                        {ALL_STATUSES.map(s => (
                          <button
                            key={s}
                            onClick={() => { setStatusMenuId(null); onRequestChange(order.id, s) }}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                            style={{
                              color: s === order.status ? STATUS_COLOR[s].pillText : C.text,
                              fontWeight: s === order.status ? 600 : 400,
                              backgroundColor: s === order.status ? STATUS_COLOR[s].pill : 'transparent',
                            }}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: STATUS_COLOR[s].border }} />
                            {STATUS_COLOR[s].label}
                          </button>
                        ))}
                      </div>
                    )}
                    {isPending && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                        <span style={{ color: C.muted }}>
                          → {STATUS_COLOR[pendingChange.toStatus]?.label ?? pendingChange.toStatus}?
                        </span>
                        <button onClick={onConfirm} className="px-2 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: '#16a34a' }}>✓</button>
                        <button onClick={onCancel} className="px-2 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: '#dc2626' }}>✗</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── PackingTable ───────────────────────────────────────────────────────

function PackingTable({ orders, selected, onToggle, onToggleAll }: {
  orders: WineOrder[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (check: boolean) => void
}) {
  const allChecked = orders.length > 0 && orders.every(o => selected.has(o.id))
  const someChecked = !allChecked && orders.some(o => selected.has(o.id))

  if (orders.length === 0) {
    return <p className="text-center py-12 text-sm" style={{ color: C.faint }}>No orders match the filters.</p>
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: C.border }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: 520 }}>
        <thead>
          <tr style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <th className="px-4 py-3 text-left w-10">
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked }}
                onChange={e => onToggleAll(e.target.checked)}
                className="cursor-pointer"
              />
            </th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: C.muted }}>Company</th>
            <th className="text-right px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>Bottles</th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: C.muted }}>Status</th>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>Date</th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: '#ffffff' }}>
          {orders.map((order, i) => {
            const wines = order.wines as WineSelection[]
            const bottles = wines.reduce((s, w) => s + w.quantity, 0)
            const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.pending
            const isSelected = selected.has(order.id)
            const isLast = i === orders.length - 1
            return (
              <tr
                key={order.id}
                onClick={() => onToggle(order.id)}
                className="transition-colors"
                style={{
                  borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                  borderLeft: `4px solid ${sc.border}`,
                  backgroundColor: isSelected ? '#fffbf5' : '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={() => onToggle(order.id)} className="cursor-pointer" />
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold" style={{ color: C.text }}>{order.businessName}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {wines.map(w => (
                      <span key={w.id} className="text-xs px-1.5 py-0.5 rounded border"
                        style={{ borderColor: C.border, color: C.muted, backgroundColor: '#f5efe6' }}>
                        {w.name} × {w.quantity}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: C.wine }}>{bottles}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: sc.pill, color: sc.pillText }}>
                    {sc.label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.muted, fontSize: '0.8rem' }}>
                  {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export default function WineOrdersClient({ orders: initial }: { orders: WineOrder[] }) {
  const [orders, setOrders] = useState<WineOrder[]>(initial)
  const [mode, setMode] = useState<Mode>('cards')
  const [filters, setFilters] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [boxMode, setBoxMode] = useState<BoxMode>('six')
  const [packingLayout, setPackingLayout] = useState<PackingLayoutType>('a')
  const [recentlyInactive, setRecentlyInactive] = useState<Set<string>>(new Set())
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listRef] = useAutoAnimate({ duration: 400 })
  const [, startTransition] = useTransition()

  // Pre-select confirmed+paid on entering pack mode
  useEffect(() => {
    if (mode === 'pack') {
      setSelected(new Set(
        orders.filter(o => o.status === 'confirmed' || o.status === 'paid').map(o => o.id)
      ))
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (filters.size > 0 && !filters.has(o.status)) return false
    if (search && !o.businessName.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && new Date(o.createdAt) < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo && new Date(o.createdAt) > new Date(dateTo + 'T23:59:59')) return false
    return true
  }), [orders, filters, search, dateFrom, dateTo])

  const cardsVisible = useMemo(() => [...filteredOrders].sort((a, b) => {
    const aI = (a.status === 'delivered' || a.status === 'cancelled') && !recentlyInactive.has(a.id)
    const bI = (b.status === 'delivered' || b.status === 'cancelled') && !recentlyInactive.has(b.id)
    return Number(aI) - Number(bI)
  }), [filteredOrders, recentlyInactive])

  const selectedOrders = useMemo(() =>
    orders.filter(o => selected.has(o.id)) as unknown as PackingOrder[],
    [orders, selected]
  )

  function handleUpdate(id: string, status: string) {
    const prev = orders.find(o => o.id === id)
    const wasActive = prev && prev.status !== 'delivered' && prev.status !== 'cancelled'
    const isNowInactive = status === 'delivered' || status === 'cancelled'
    setOrders(p => p.map(o => o.id === id ? { ...o, status } : o))
    if (wasActive && isNowInactive) {
      setRecentlyInactive(s => new Set([...s, id]))
      setTimeout(() => setRecentlyInactive(s => { const n = new Set(s); n.delete(id); return n }), 520)
    }
    startTransition(async () => { await updateWineOrderStatus(id, status) })
  }

  function requestChange(orderId: string, toStatus: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPendingChange({ orderId, toStatus })
    timerRef.current = setTimeout(() => setPendingChange(null), 5000)
  }

  function confirmChange() {
    if (!pendingChange) return
    if (timerRef.current) clearTimeout(timerRef.current)
    handleUpdate(pendingChange.orderId, pendingChange.toStatus)
    setPendingChange(null)
  }

  function cancelChange() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPendingChange(null)
  }

  function toggleOrder(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll(check: boolean) {
    setSelected(check ? new Set(filteredOrders.map(o => o.id)) : new Set())
  }

  if (orders.length === 0) {
    return <div className="text-center py-20 text-sm" style={{ color: '#a89070' }}>No wine orders yet.</div>
  }

  const modeToggle = (
    <div className="flex gap-0.5 rounded-lg p-0.5 mb-5 self-start" style={{ backgroundColor: '#f0e8dc' }}>
      {(['cards', 'table', 'pack'] as const).map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className="text-sm px-4 py-1.5 rounded-md font-medium transition-all"
          style={{
            backgroundColor: mode === m ? '#fff' : 'transparent',
            color: mode === m ? C.wine : C.faint,
            fontWeight: mode === m ? 700 : 400,
            boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
          }}
        >
          {m === 'pack' ? '📦 Pack' : m.charAt(0).toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  )

  function toggleFilter(f: string) {
    setFilters(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  const filterBar = (
    <FilterBar
      filters={filters} onToggleFilter={toggleFilter} onClearFilters={() => setFilters(new Set())}
      search={search} onSearch={setSearch}
      dateFrom={dateFrom} onDateFrom={setDateFrom}
      dateTo={dateTo} onDateTo={setDateTo}
    />
  )

  // ── Cards ───────────────────────────────────────────────────

  if (mode === 'cards') {
    return (
      <div className="flex flex-col">
        {modeToggle}
        {filterBar}
        {cardsVisible.length === 0 && (
          <p className="text-center py-12 text-sm" style={{ color: C.faint }}>No orders match the filters.</p>
        )}
        <div className="flex flex-col gap-4" ref={listRef}>
          {cardsVisible.map(order => {
            const wines = order.wines as WineSelection[]
            const isInactive = order.status === 'cancelled' || order.status === 'delivered'
            const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.pending
            const isPending = pendingChange?.orderId === order.id
            const isSelected = selected.has(order.id)
            return (
              <div
                key={order.id}
                className="rounded-xl border overflow-hidden flex flex-col md:flex-row"
                style={{
                  backgroundColor: C.bg, borderColor: C.border,
                  opacity: isInactive ? 0.55 : 1, transition: 'opacity 0.45s ease',
                  borderLeftWidth: 4, borderLeftColor: sc.border,
                }}
              >
                {/* Col 1 — name, wines, address */}
                <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
                  <div>
                    <p className="font-bold mb-1" style={{ color: C.text }}>{order.businessName}</p>
                    <p className="text-sm mb-3" style={{ color: C.muted, minHeight: '1.25rem' }}>
                      {order.llcName ? `${order.llcName}${order.llcId ? ` · ${order.llcId}` : ''}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {wines.map(w => (
                        <span key={w.id} className="text-xs px-2 py-1 rounded border"
                          style={{ borderColor: C.border, color: C.muted, backgroundColor: '#f5efe6' }}>
                          {w.name} &times; {w.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-sm mt-3" style={{ color: C.muted }}>
                    <p>&#128205; {order.address}</p>
                    {order.workingHours && <p>&#128336; {order.workingHours}</p>}
                  </div>
                </div>

                {/* Col 2 — amount, contact, pack toggle */}
                <div
                  className="flex-shrink-0 flex flex-col justify-center items-center gap-1.5 px-6 py-4 text-sm border-t md:border-t-0 md:border-l"
                  style={{ color: C.muted, borderColor: C.border, minWidth: 160 }}
                >
                  <p className="font-bold leading-none" style={{ fontSize: '1.35rem', color: order.displayTotal != null ? C.wine : C.faint }}>
                    {order.displayTotal != null ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾` : '—'}
                  </p>
                  {order.discountPercent && order.discountPercent > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                      −{order.discountPercent}%
                    </span>
                  )}
                  <p>&#128100; {order.contactName}</p>
                  <p>&#128222; {order.contactPhone}</p>
                  <button
                    onClick={() => toggleOrder(order.id)}
                    className="mt-1 text-xs px-3 py-1 rounded-full font-medium border transition-all duration-150"
                    style={{
                      backgroundColor: isSelected ? C.wine : 'transparent',
                      color: isSelected ? '#fff' : C.faint,
                      borderColor: isSelected ? C.wine : C.border,
                    }}
                  >
                    {isSelected ? '✓ In pack' : '+ Pack'}
                  </button>
                </div>

                {/* Col 3 — stepper */}
                <div
                  className="flex-shrink-0 flex items-center p-5 pl-4 border-t md:border-t-0 md:border-l"
                  style={{ borderColor: C.border, backgroundColor: '#fdf8f2' }}
                >
                  <VerticalStepper
                    orderId={order.id}
                    status={order.status}
                    onRequestChange={toStatus => requestChange(order.id, toStatus)}
                    pendingToStatus={isPending ? pendingChange.toStatus : undefined}
                    onConfirm={confirmChange}
                    onCancel={cancelChange}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Table ───────────────────────────────────────────────────

  if (mode === 'table') {
    return (
      <div className="flex flex-col">
        {modeToggle}
        {filterBar}
        <TableView
          orders={filteredOrders}
          pendingChange={pendingChange}
          onRequestChange={requestChange}
          onConfirm={confirmChange}
          onCancel={cancelChange}
        />
      </div>
    )
  }

  // ── Pack ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {modeToggle}
      {filterBar}
      <PackingView
        selectedOrders={selectedOrders}
        boxMode={boxMode}
        onBoxModeChange={setBoxMode}
        layout={packingLayout}
        onLayoutChange={setPackingLayout}
      >
        <PackingTable
          orders={filteredOrders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered')}
          selected={selected}
          onToggle={toggleOrder}
          onToggleAll={toggleAll}
        />
      </PackingView>
    </div>
  )
}
