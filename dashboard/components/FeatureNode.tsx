'use client'

import { Handle, Position } from '@xyflow/react'
import type { Section } from '@/lib/parseVault'

type Props = {
  data: {
    section: Section
    isSelected?: boolean
  }
}

export default function FeatureNode({ data }: Props) {
  const { section, isSelected } = data
  const done = section.tasks.filter(t => t.done).length
  const total = section.tasks.length
  const allDone = total > 0 && done === total
  const inProgress = done > 0 && !allDone

  const dotColor = allDone ? 'bg-emerald-400' : inProgress ? 'bg-amber-400' : 'bg-gray-500'

  return (
    <div
      className={`w-44 rounded-lg px-4 py-3 border cursor-pointer transition-all duration-200 select-none
        ${isSelected
          ? 'bg-gray-700 border-blue-400 shadow-lg shadow-blue-900/30'
          : 'bg-gray-800 border-gray-600 hover:border-blue-400 hover:shadow-md hover:shadow-blue-900/20'
        }`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-white text-sm font-medium leading-tight">{section.label}</span>
      </div>

      {total > 0 && (
        <div className="text-gray-400 text-xs">{done}/{total} done</div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}
