'use client'

import { Handle, Position } from '@xyflow/react'
import type { Phase } from '@/lib/parseVault'

type Props = {
  data: {
    phase: Phase
    isActive?: boolean
  }
}

export default function PhaseNode({ data }: Props) {
  const { phase, isActive } = data
  const pct = phase.totalTasks > 0 ? Math.round((phase.doneTasks / phase.totalTasks) * 100) : 0
  const statusColor = pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-600'

  return (
    <div
      className={`w-56 rounded-xl p-4 border cursor-pointer transition-all duration-200 select-none
        ${isActive
          ? 'bg-gray-700 border-emerald-500 shadow-lg shadow-emerald-900/30'
          : 'bg-gray-800 border-gray-600 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/20'
        }`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />

      <div className="text-white font-semibold text-sm leading-tight mb-2">{phase.label}</div>

      <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span>{phase.doneTasks}/{phase.totalTasks} tasks</span>
        <span className="text-gray-500">{pct}%</span>
      </div>

      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${statusColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!isActive && (
        <div className="text-xs text-gray-500 mt-2">Click to explore →</div>
      )}

      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
}
