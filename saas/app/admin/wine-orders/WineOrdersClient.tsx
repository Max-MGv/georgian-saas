'use client'

import { useState, useTransition } from 'react'
import { updateWineOrderStatus } from '@/app/actions/wineOrders'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

const STATUS_COLOR: Record<string, { border: string; pill: string; pillText: string; label: string }> = {
  pending:   { border: '#d97706', pill: '#fef3c7', pillText: '#92400e', label: 'Pending' },
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
  status: string
  createdAt: Date
}

const STAGES = ['pending', 'confirmed', 'paid'] as const
type Stage = typeof STAGES[number]

const STAGE_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  paid: 'Paid',
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M11 3.5l-.7 7.3a.5.5 0 0 1-.5.45H4.2a.5.5 0 0 1-.5-.45L3 3.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 5h5a4 4 0 1 1 0 8H4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 5l2.5-2.5M2 5l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VerticalStepper({ orderId, status, onUpdate }: {
  orderId: string
  status: string
  onUpdate: (id: string, status: string) => void
}) {
  const isCancelled = status === 'cancelled'
  const currentIdx = STAGES.indexOf(status as Stage)
  const sc = STATUS_COLOR[status] ?? STATUS_COLOR.pending

  return (
    <div className="flex flex-col items-start gap-0" style={{ minWidth: 110 }}>

      {/* Current status pill */}
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full mb-3 self-start"
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
          <button
            onClick={() => onUpdate(orderId, 'pending')}
            title="Undo cancellation"
            className="mt-3 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:opacity-80"
            style={{ borderColor: C.border, color: C.muted }}
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
            const dotColor = isDone ? C.wine : C.border
            return (
              <div key={stage} className="flex flex-col items-start">
                <button
                  onClick={() => isClickable && onUpdate(orderId, stage)}
                  title={
                    isClickable
                      ? i < currentIdx
                        ? `↩ Revert to ${STAGE_LABELS[stage]}`
                        : `→ Advance to ${STAGE_LABELS[stage]}`
                      : undefined
                  }
                  disabled={!isClickable}
                  className="flex items-center gap-2.5 group"
                  style={{ cursor: isClickable ? 'pointer' : 'default' }}
                >
                  <div
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
                    style={{
                      borderColor: dotColor,
                      backgroundColor: isDone ? C.wine : '#fff9f3',
                      boxShadow: isActive ? `0 0 0 3px ${C.wine}22` : undefined,
                    }}
                  >
                    {isDone && !isActive ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5 4.5-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: isDone ? 'white' : C.faint }}>{i + 1}</span>
                    )}
                  </div>
                  <span
                    className="transition-colors duration-150"
                    style={{
                      color: isActive ? C.wine : isDone ? C.muted : C.faint,
                      fontSize: isActive ? '0.8rem' : '0.75rem',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                </button>
                {i < STAGES.length - 1 && (
                  <div
                    className="w-0.5 h-4 ml-3 my-0.5 transition-colors duration-150"
                    style={{ backgroundColor: currentIdx > i ? C.wine : '#e0d4c0' }}
                  />
                )}
              </div>
            )
          })}

          <button
            onClick={() => onUpdate(orderId, 'cancelled')}
            title="Cancel order"
            className="mt-3 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:border-red-300 hover:text-red-500"
            style={{ borderColor: C.border, color: C.faint }}
          >
            <TrashIcon /> Cancel
          </button>
        </>
      )}
    </div>
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
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-bold" style={{ color: C.text }}>{order.businessName}</p>
                  {order.llcName && (
                    <p className="text-sm" style={{ color: C.muted }}>{order.llcName}{order.llcId ? ` · ${order.llcId}` : ''}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: '#f5efe6', color: C.faint }}>
                    #{order.id.slice(0, 8)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.faint }}>
                    {new Date(order.createdAt).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>

              {/* Wines */}
              <div className="flex flex-wrap gap-2 mb-1">
                {wines.map(w => (
                  <span key={w.id} className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.muted, backgroundColor: '#f5efe6' }}>
                    {w.name} × {w.quantity}
                  </span>
                ))}
              </div>

              {/* Total — always shown */}
              <p className="text-xs mb-3" style={{ color: order.totalAmount != null ? C.wine : C.faint, fontWeight: order.totalAmount != null ? 600 : 400 }}>
                {order.totalAmount != null ? `Total: ${order.totalAmount}₾` : 'Total: —'}
              </p>

              {/* Contact info */}
              <div className="grid sm:grid-cols-2 gap-1 text-sm" style={{ color: C.muted }}>
                <p>📍 {order.address}</p>
                {order.workingHours && <p>🕐 {order.workingHours}</p>}
                <p>👤 {order.contactName}</p>
                <p>📞 {order.contactPhone}</p>
              </div>
            </div>

            {/* Right — vertical stepper */}
            <div className="flex-shrink-0 p-5 pl-4 border-l" style={{ borderColor: C.border, backgroundColor: '#fdf8f2' }}>
              <VerticalStepper orderId={order.id} status={order.status} onUpdate={handleUpdate} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
