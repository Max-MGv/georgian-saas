'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'

/**
 * Pinned guided-tour checklist for the Vineworks Demo tenant. Renders nothing
 * for every other tenant. See [[Plan-DemoSite]] — "Guided checklist overlay".
 *
 * A cold visitor landing on an unfamiliar live product doesn't know what
 * they're supposed to do with it. This gives them a short, concrete path and
 * checks steps off automatically as they actually do them (rather than
 * requiring a manual click), so it reads as "watching your own progress"
 * instead of a to-do list you have to manage yourself.
 *
 * Storage is per-browser (localStorage) — resets if the visitor clears site
 * data or switches devices, which is fine for a demo.
 */

const STORAGE_KEY = 'vineworks-demo-checklist'
const BOOKED_EVENT = 'vineworks-demo:booked'

type ChecklistState = {
  browsed: boolean
  booked: boolean
  admin: boolean
  sawOrder: boolean
  collapsed: boolean
}

const EMPTY_STATE: ChecklistState = { browsed: false, booked: false, admin: false, sawOrder: false, collapsed: false }

function loadState(): ChecklistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    return { ...EMPTY_STATE, ...JSON.parse(raw) }
  } catch {
    return EMPTY_STATE
  }
}

function saveState(state: ChecklistState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable (private mode, etc.) — checklist just won't persist
  }
}

export default function DemoChecklist({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const [state, setState] = useState<ChecklistState | null>(null)

  const isDemo = tenantId === DEMO_TENANT_ID

  useEffect(() => {
    if (!isDemo) return
    setState(loadState())
  }, [isDemo])

  useEffect(() => {
    if (!isDemo || !pathname) return
    setState(prev => {
      const base = prev ?? EMPTY_STATE
      const next: ChecklistState = {
        ...base,
        browsed: base.browsed || pathname === '/wines',
        admin: base.admin || pathname.startsWith('/admin'),
        sawOrder: base.sawOrder || pathname === '/admin/orders',
      }
      if (next !== base) saveState(next)
      return next
    })
  }, [isDemo, pathname])

  useEffect(() => {
    if (!isDemo) return
    function onBooked() {
      setState(prev => {
        const next = { ...(prev ?? EMPTY_STATE), booked: true }
        saveState(next)
        return next
      })
    }
    window.addEventListener(BOOKED_EVENT, onBooked)
    return () => window.removeEventListener(BOOKED_EVENT, onBooked)
  }, [isDemo])

  if (!isDemo || !state) return null

  const steps = [
    { done: state.browsed, label: 'Browse the wine list', href: '/wines' },
    { done: state.booked, label: 'Book a tasting or order some wine' },
    { done: state.admin, label: 'Switch to "Winery Admin View" (top bar)' },
    { done: state.sawOrder, label: 'See it land in Orders' },
  ]
  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length

  function toggleCollapsed() {
    setState(prev => {
      const next = { ...(prev ?? EMPTY_STATE), collapsed: !(prev?.collapsed) }
      saveState(next)
      return next
    })
  }

  if (state.collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        style={{
          position: 'fixed',
          bottom: 'calc(16px + var(--cart-bar-offset, 0px))',
          left: '16px',
          zIndex: 90,
          backgroundColor: '#1e1b4b',
          color: '#e0e7ff',
          border: '1px solid #3730a3',
          borderRadius: '999px',
          padding: '10px 16px',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        }}
      >
        🍷 Tour {doneCount}/{steps.length}
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + var(--cart-bar-offset, 0px))',
        left: '16px',
        zIndex: 90,
        width: '260px',
        backgroundColor: '#1e1b4b',
        color: '#e0e7ff',
        border: '1px solid #3730a3',
        borderRadius: '12px',
        padding: '14px 16px',
        fontSize: '0.8rem',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong style={{ fontSize: '0.8rem' }}>
          {allDone ? '🎉 Tour complete' : '🍷 Try the demo'}
        </strong>
        <button
          onClick={toggleCollapsed}
          aria-label="Minimize"
          style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '2px 4px' }}
        >
          ✕
        </button>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map((step, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', opacity: step.done ? 0.6 : 1 }}>
            <span
              style={{
                flexShrink: 0,
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                border: '1px solid #6366f1',
                backgroundColor: step.done ? '#4f46e5' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                marginTop: '1px',
              }}
            >
              {step.done ? '✓' : i + 1}
            </span>
            {step.href && !step.done ? (
              <a href={step.href} style={{ color: '#e0e7ff', textDecoration: step.done ? 'line-through' : 'underline' }}>
                {step.label}
              </a>
            ) : (
              <span style={{ textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function dispatchDemoBooked() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BOOKED_EVENT))
}
