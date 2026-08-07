'use client'

import { Check, type LucideIcon } from 'lucide-react'
import { C, type StepKey } from './shared'

export type StepNavItem = {
  key: StepKey
  icon: LucideIcon
  label: string
  done: boolean
}

/**
 * Progress row with a short always-visible label under each icon — not a
 * "Step X of Y" counter, but not hover-only either (multi-step forms with
 * 5+ steps read better with labeled indicators than bare icons, per the
 * redesign research — see vault/Plan-OnboardingFlow.md).
 * Linear-forward: only steps up to `furthestIndex` are clickable, so a user
 * can go back to review/edit an earlier step but can't skip ahead of where
 * they've actually reached.
 */
export default function StepNav({ steps, current, furthestIndex, onSelect }: {
  steps: StepNavItem[]
  current: StepKey
  furthestIndex: number
  onSelect: (key: StepKey) => void
}) {
  return (
    <div className="flex items-start mb-6" role="tablist">
      {steps.map((step, i) => {
        const isCurrent = step.key === current
        const reachable = i <= furthestIndex
        const Icon = step.icon
        return (
          <div key={step.key} className="relative flex flex-col items-center gap-1.5 flex-1 min-w-0">
            {i < steps.length - 1 && (
              <div
                className="absolute h-px"
                style={{ top: 17, left: '50%', width: '100%', backgroundColor: i < furthestIndex ? '#15803d' : C.border, zIndex: 0 }}
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-label={step.label}
              disabled={!reachable}
              onClick={() => reachable && onSelect(step.key)}
              className="relative z-10 inline-flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 transition-colors disabled:cursor-not-allowed"
              style={
                step.done
                  ? { backgroundColor: '#15803d', color: 'white', border: '1px solid #15803d' }
                  : isCurrent
                  ? { backgroundColor: C.bg, color: C.wine, border: `2px solid ${C.wine}` }
                  : reachable
                  ? { backgroundColor: C.bg, color: C.muted, border: `1px solid ${C.border}` }
                  : { backgroundColor: 'transparent', color: '#c9bda8', border: `1px solid ${C.border}` }
              }
            >
              {step.done ? <Check size={16} /> : <Icon size={16} />}
            </button>
            <span
              className="text-[11px] font-semibold text-center w-full break-words px-0.5"
              style={{ color: isCurrent ? C.wine : step.done ? '#15803d' : C.faint }}
            >
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
