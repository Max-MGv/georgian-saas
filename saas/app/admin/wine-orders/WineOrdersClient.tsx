'use client'

import { useState, useTransition } from 'react'
import { updateWineOrderStatus } from '@/app/actions/wineOrders'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
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
  cancelled: 'Cancelled',
}

function StatusStepper({ orderId, status, onUpdate }: {
  orderId: string
  status: string
  onUpdate: (id: string, status: string) => void
}) {
  const isCancelled = status === 'cancelled'
  const currentIdx = STAGES.indexOf(status as Stage)

  return (
    <div className="flex flex-col gap-3">
      {/* 3-step stepper */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const isDone = !isCancelled && currentIdx >= i
          const isActive = !isCancelled && currentIdx === i
          return (
            <div key={stage} className="flex items-center">
              <button
                onClick={() => !isDone && onUpdate(orderId, stage)}
                disabled={isCancelled || isDone}
                title={isDone ? undefined : `Move to ${STAGE_LABELS[stage]}`}
                className="flex flex-col items-center gap-1 group"
                style={{ cursor: isCancelled || isDone ? 'default' : 'pointer' }}
              >
                <div
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    borderColor: isDone ? C.wine : isCancelled ? '#d1b9a0' : C.border,
                    backgroundColor: isDone ? C.wine : '#fff9f3',
                    color: isDone ? 'white' : isCancelled ? '#d1b9a0' : C.faint,
                  }}
                >
                  {isDone && !isActive ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className="text-xs font-medium whitespace-nowrap"
                  style={{ color: isActive ? C.wine : isDone ? C.muted : isCancelled ? '#d1b9a0' : C.faint }}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </button>
              {i < STAGES.length - 1 && (
                <div
                  className="h-0.5 w-8 mx-1 mb-4 flex-shrink-0 transition-colors"
                  style={{ backgroundColor: !isCancelled && currentIdx > i ? C.wine : '#e0d4c0' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Advance / Cancel controls */}
      <div className="flex gap-2 flex-wrap">
        {!isCancelled && currentIdx < STAGES.length - 1 && (
          <button
            onClick={() => onUpdate(orderId, STAGES[currentIdx + 1])}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
            style={{ backgroundColor: C.wine }}
          >
            Mark as {STAGE_LABELS[STAGES[currentIdx + 1]]}
          </button>
        )}
        {!isCancelled ? (
          <button
            onClick={() => onUpdate(orderId, 'cancelled')}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium"
            style={{ borderColor: '#e53e3e', color: '#e53e3e' }}
          >
            Cancel order
          </button>
        ) : (
          <button
            onClick={() => onUpdate(orderId, 'pending')}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium"
            style={{ borderColor: C.border, color: C.muted }}
          >
            Restore to Pending
          </button>
        )}
      </div>
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

        return (
          <div
            key={order.id}
            className="rounded-xl border p-5"
            style={{
              backgroundColor: C.bg,
              borderColor: isCancelled ? '#f0d8d8' : C.border,
              opacity: isCancelled ? 0.75 : 1,
            }}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold" style={{ color: C.text }}>{order.businessName}</p>
                  {isCancelled && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Cancelled</span>
                  )}
                </div>
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

            {/* Wines + total */}
            <div className="flex flex-wrap gap-2 mb-3">
              {wines.map(w => (
                <span key={w.id} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted, backgroundColor: '#f5efe6' }}>
                  {w.name} × {w.quantity}
                </span>
              ))}
              {order.totalAmount != null && (
                <span className="text-xs px-2 py-1 rounded border font-semibold" style={{ borderColor: '#c9b99a', color: C.wine, backgroundColor: '#fdf7ef' }}>
                  Total: {order.totalAmount}₾
                </span>
              )}
            </div>

            {/* Contact info */}
            <div className="grid sm:grid-cols-2 gap-1 text-sm mb-4" style={{ color: C.muted }}>
              <p>📍 {order.address}</p>
              {order.workingHours && <p>🕐 {order.workingHours}</p>}
              <p>👤 {order.contactName}</p>
              <p>📞 {order.contactPhone}</p>
            </div>

            {/* Status stepper */}
            <div className="pt-3 border-t" style={{ borderColor: C.border }}>
              <StatusStepper orderId={order.id} status={order.status} onUpdate={handleUpdate} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
