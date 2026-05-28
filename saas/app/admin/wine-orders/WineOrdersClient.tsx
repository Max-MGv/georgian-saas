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
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M11 3.5l-.7 7.3a.5.5 0 0 1-.5.45H4.2a.5.5 0 0 1-.5-.45L3 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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

  return (
    <div className="flex flex-col items-center gap-0" style={{ minWidth: 90 }}>
      {isCancelled ? (
        /* Cancelled state — faded stepper + undo */
        <>
          {STAGES.map((stage, i) => (
            <div key={stage} className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: '#d1b9a0', backgroundColor: '#f5efe6' }}
                >
                  <span className="text-xs" style={{ color: '#d1b9a0' }}>{i + 1}</span>
                </div>
                <span className="text-xs w-16" style={{ color: '#d1b9a0' }}>{STAGE_LABELS[stage]}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="w-0.5 h-5 ml-[-46px]" style={{ backgroundColor: '#e8ddd0' }} />
              )}
            </div>
          ))}
          <button
            onClick={() => onUpdate(orderId, 'pending')}
            title="Undo cancellation — restore to Pending"
            className="mt-4 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-opacity hover:opacity-70"
            style={{ borderColor: C.border, color: C.muted }}
          >
            <UndoIcon /> Undo
          </button>
        </>
      ) : (
        /* Normal stepper — all stages clickable */
        <>
          {STAGES.map((stage, i) => {
            const isDone = currentIdx >= i
            const isActive = currentIdx === i
            const isClickable = i !== currentIdx
            return (
              <div key={stage} className="flex flex-col items-center">
                <button
                  onClick={() => isClickable && onUpdate(orderId, stage)}
                  title={isClickable ? (i < currentIdx ? `Revert to ${STAGE_LABELS[stage]}` : `Advance to ${STAGE_LABELS[stage]}`) : undefined}
                  className="flex items-center gap-2 group"
                  style={{ cursor: isClickable ? 'pointer' : 'default' }}
                >
                  <div
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                    style={{
                      borderColor: isDone ? C.wine : C.border,
                      backgroundColor: isDone ? C.wine : '#fff9f3',
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
                    className="text-xs font-medium w-16 text-left transition-colors"
                    style={{ color: isActive ? C.wine : isDone ? C.muted : C.faint }}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                </button>
                {i < STAGES.length - 1 && (
                  <div
                    className="w-0.5 h-5 transition-colors"
                    style={{
                      marginLeft: '-46px',
                      backgroundColor: currentIdx > i ? C.wine : '#e0d4c0',
                    }}
                  />
                )}
              </div>
            )
          })}

          {/* Trash — cancel order */}
          <button
            onClick={() => onUpdate(orderId, 'cancelled')}
            title="Cancel order"
            className="mt-4 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-opacity hover:opacity-70"
            style={{ borderColor: '#e0d4c0', color: C.faint }}
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

        return (
          <div
            key={order.id}
            className="rounded-xl border p-5 flex gap-5"
            style={{
              backgroundColor: C.bg,
              borderColor: isCancelled ? '#f0d8d8' : C.border,
              opacity: isCancelled ? 0.75 : 1,
            }}
          >
            {/* Left — order info */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold" style={{ color: C.text }}>{order.businessName}</p>
                    {isCancelled && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#fde8e8', color: '#c53030' }}>Cancelled</span>
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
              <div className="grid sm:grid-cols-2 gap-1 text-sm" style={{ color: C.muted }}>
                <p>📍 {order.address}</p>
                {order.workingHours && <p>🕐 {order.workingHours}</p>}
                <p>👤 {order.contactName}</p>
                <p>📞 {order.contactPhone}</p>
              </div>
            </div>

            {/* Right — vertical stepper */}
            <div className="flex-shrink-0 flex items-start pt-1 pl-4 border-l" style={{ borderColor: C.border }}>
              <VerticalStepper orderId={order.id} status={order.status} onUpdate={handleUpdate} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
