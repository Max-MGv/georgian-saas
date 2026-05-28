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

const STAGES = ['pending', 'confirmed', 'paid'] as const
type Stage = typeof STAGES[number]
const STAGE_LABELS: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', paid: 'Paid' }

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
      className="flex flex-col items-start gap-0 h-full"
      style={{ minWidth: 115 }}
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
    >
      {/* Status pill */}
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full mb-4 self-start transition-all duration-150"
        style={{ backgroundColor: sc.pill, color: sc.pillText }}
      >
        {sc.label}
      </span>

      {isCancelled ? (
        <>
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

          {/* Undo — prominent */}
          <button
            onClick={() => onUpdate(orderId, 'pending')}
            className="mt-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium transition-all duration-150 hover:opacity-90"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            <UndoIcon /> Undo
          </button>
        </>
      ) : (
        <>
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
                  tooltip={isClickable ? (i < currentIdx ? `↩ Revert to ${STAGE_LABELS[stage]}` : `→ Advance to ${STAGE_LABELS[stage]}`) : undefined}
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

          {/* Cancel — red text, no fill */}
          <button
            onClick={() => onUpdate(orderId, 'cancelled')}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium transition-opacity duration-150 hover:opacity-70"
            style={{ color: '#dc2626' }}
          >
            <TrashIcon /> Cancel order
          </button>
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

  const dotScale = hovered && isClickable ? 'scale(1.2)' : 'scale(1)'
  const dotShadow = isActive
    ? `0 0 0 4px ${C.wine}22`
    : hovered && isClickable
      ? `0 0 0 3px ${C.wine}18`
      : undefined

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tooltip}
      className="flex items-center gap-2.5 group"
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <div
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
        style={{
          borderColor: isDone ? C.wine : panelHovered && isClickable ? '#b08060' : C.border,
          backgroundColor: isDone ? C.wine : '#fff9f3',
          transform: dotScale,
          boxShadow: dotShadow,
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
          fontSize: isActive ? '0.8rem' : '0.75rem',
          fontWeight: isActive ? 700 : 400,
        }}
      >
        {label}
      </span>
    </button>
  )
}

export default function WineOrdersClient({ orders: initial }: { orders: WineOrder[] }) {
  const [orders, setOrders] = useState<WineOrder[]>(initial)
  const [, startTransition] = useTransition()

  function handleUpdate(id: string, status: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    startTransition(async () => {
      await updateWineOrderStatus(id, status)
    })
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: '#a89070' }}>
        No wine orders yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map(order => {
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
              borderLeftWidth: 4,
              borderLeftColor: sc.border,
            }}
          >
            {/* Left — order info */}
            <div className="flex-1 min-w-0 p-5">
              {/* Header — 2×2 feel: name|total on row 1, details|id·date on row 2 */}
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <p className="font-bold" style={{ color: C.text }}>{order.businessName}</p>
                <p className="font-bold text-base flex-shrink-0" style={{ color: C.wine }}>
                  {order.displayTotal != null
                    ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾`
                    : <span style={{ color: C.faint, fontWeight: 400, fontSize: '0.875rem' }}>—</span>}
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <p className="text-sm" style={{ color: C.muted }}>
                  {order.llcName ? `${order.llcName}${order.llcId ? ` · ${order.llcId}` : ''}` : ' '}
                </p>
                <p className="text-xs font-mono flex-shrink-0" style={{ color: C.faint }}>
                  #{order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleDateString('en-GB')}
                </p>
              </div>

              {/* Wines */}
              <div className="flex flex-wrap gap-2 mb-3">
                {wines.map(w => (
                  <span key={w.id} className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.muted, backgroundColor: '#f5efe6' }}>
                    {w.name} × {w.quantity}
                  </span>
                ))}
              </div>

              {/* Contact info */}
              <div className="grid sm:grid-cols-2 gap-1 text-sm" style={{ color: C.muted }}>
                <p>📍 {order.address}</p>
                {order.workingHours && <p>🕐 {order.workingHours}</p>}
                <p>👤 {order.contactName}</p>
                <p>📞 {order.contactPhone}</p>
              </div>
            </div>

            {/* Right — vertical stepper */}
            <div
              className="flex-shrink-0 p-5 pl-4 border-l transition-colors duration-150"
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
