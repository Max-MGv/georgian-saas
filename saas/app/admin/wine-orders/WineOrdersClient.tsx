'use client'

import { useState, useTransition } from 'react'
import { updateWineOrderStatus } from '@/app/actions/wineOrders'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
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
  displayTotal: number | null
  totalEstimated: boolean
  status: string
  createdAt: Date
}

const STAGES = ['pending', 'confirmed', 'paid', 'delivered'] as const
type Stage = typeof STAGES[number]
const STAGE_LABELS: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', paid: 'Paid', delivered: 'Delivered' }

const FILTER_OPTIONS = ['all', 'pending', 'confirmed', 'paid', 'delivered', 'cancelled'] as const
type Filter = typeof FILTER_OPTIONS[number]

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M11 3.5l-.7 7.3a.5.5 0 0 1-.5.45H4.2a.5.5 0 0 1-.5-.45L3 3.5"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 5h5a4 4 0 1 1 0 8H4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 5l2.5-2.5M2 5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VerticalStepper({ orderId, status, onUpdate }: {
  orderId: string
  status: string
  onUpdate: (id: string, status: string) => void
}) {
  const [panelHovered, setPanelHovered] = useState(false)
  const isCancelled = status === 'cancelled'
  const currentIdx = STAGES.indexOf(status as Stage)
  const sc = STATUS_COLOR[status] ?? STATUS_COLOR.pending

  return (
    <div
      className="flex flex-col items-center gap-0"
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
            onClick={() => onUpdate(orderId, 'pending')}
            className="mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium transition-all duration-150 hover:opacity-90"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            <UndoIcon /> Undo
          </button>
        </>
      ) : (
        <>
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
                    onClick={() => isClickable && onUpdate(orderId, stage)}
                    tooltip={isClickable ? (i < currentIdx ? `Revert to ${STAGE_LABELS[stage]}` : `Advance to ${STAGE_LABELS[stage]}`) : undefined}
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
        </>
      )}
    </div>
  )
}

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
          boxShadow: isActive ? `0 0 0 4px ${C.wine}22, 0 0 0 7px ${C.wine}12` : hovered && isClickable ? `0 0 0 6px ${C.wine}35` : undefined,
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
          letterSpacing: isActive ? '0.01em' : undefined,
        }}
      >
        {label}
      </span>
    </button>
  )
}

export default function WineOrdersClient({ orders: initial }: { orders: WineOrder[] }) {
  const [orders, setOrders] = useState<WineOrder[]>(initial)
  const [filter, setFilter] = useState<Filter>('all')
  const [, startTransition] = useTransition()

  function handleUpdate(id: string, status: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    startTransition(async () => {
      await updateWineOrderStatus(id, status)
    })
  }

  const visible = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: '#a89070' }}>
        No wine orders yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(f => {
          const isActive = filter === f
          const sc = f === 'all' ? null : STATUS_COLOR[f]
          const activeBg = sc ? sc.border : C.wine
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="font-medium rounded-full transition-all duration-150"
              style={{
                backgroundColor: isActive ? activeBg : '#fff',
                color: isActive ? '#fff' : C.faint,
                border: `1px solid ${isActive ? activeBg : C.border}`,
                fontSize: isActive ? '0.8rem' : '0.72rem',
                padding: isActive ? '0.3rem 0.85rem' : '0.2rem 0.7rem',
              }}
            >
              {f === 'all' ? 'All' : STATUS_COLOR[f].label}
            </button>
          )
        })}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-12 text-sm" style={{ color: '#a89070' }}>
          No {filter} orders.
        </div>
      )}

      {visible.map(order => {
        const wines = order.wines as WineSelection[]
        const isCancelled = order.status === 'cancelled'
        const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.pending

        return (
          <div
            key={order.id}
            className="rounded-xl border overflow-hidden flex"
            style={{
              backgroundColor: C.bg,
              borderColor: C.border,
              opacity: isCancelled ? 0.75 : 1,
              borderRightWidth: 4,
              borderRightColor: sc.border,
            }}
          >
            {/* Col 1 — name, company, tags, address, contact */}
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
                <p>&#128100; {order.contactName}</p>
              </div>
            </div>

            {/* Col 2 — amount, hours, phone */}
            <div className="flex-shrink-0 flex flex-col justify-center items-center gap-1 px-6 text-sm border-l"
              style={{ color: C.muted, borderColor: C.border, minWidth: 160 }}>
              <p className="font-bold leading-none" style={{ fontSize: '1.35rem', color: order.displayTotal != null ? C.wine : C.faint }}>
                {order.displayTotal != null
                  ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾`
                  : '—'}
              </p>
              {order.workingHours && <p>&#128336; {order.workingHours}</p>}
              <p>&#128222; {order.contactPhone}</p>
            </div>

            {/* Col 3 — vertical stepper */}
            <div
              className="flex-shrink-0 flex items-center p-5 pl-4 border-l"
              style={{ borderColor: C.border, backgroundColor: '#fdf8f2' }}
            >
              <VerticalStepper orderId={order.id} status={order.status} onUpdate={handleUpdate} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
