'use client'

import { Handle, Position } from '@xyflow/react'
import type { ArchNode } from '@/lib/parseVault'

const typeStyles: Record<ArchNode['type'], { bg: string; border: string; label: string; dot: string }> = {
  client:    { bg: 'bg-blue-950',   border: 'border-blue-700',  label: 'text-blue-300',  dot: 'bg-blue-400' },
  framework: { bg: 'bg-violet-950', border: 'border-violet-600',label: 'text-violet-300',dot: 'bg-violet-400' },
  page:      { bg: 'bg-indigo-950', border: 'border-indigo-600',label: 'text-indigo-300',dot: 'bg-indigo-400' },
  service:   { bg: 'bg-amber-950',  border: 'border-amber-700', label: 'text-amber-300', dot: 'bg-amber-400' },
  database:  { bg: 'bg-emerald-950',border: 'border-emerald-700',label:'text-emerald-300',dot:'bg-emerald-400'},
}

const typeLabel: Record<ArchNode['type'], string> = {
  client: 'Client',
  framework: 'Framework',
  page: 'Page',
  service: 'Service',
  database: 'Database',
}

export default function ArchNodeComponent({ data }: { data: { node: ArchNode; isSelected: boolean } }) {
  const { node, isSelected } = data
  const s = typeStyles[node.type] ?? typeStyles.service

  return (
    <div
      className={`
        w-44 rounded-lg border px-4 py-3 cursor-pointer transition-all select-none
        ${s.bg} ${isSelected ? 'border-white shadow-lg shadow-white/10' : s.border}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-600 !border-gray-500" />

      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <span className={`text-[10px] font-medium uppercase tracking-wider ${s.label}`}>
          {typeLabel[node.type]}
        </span>
      </div>
      <div className="text-white font-semibold text-sm leading-tight">{node.label}</div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !border-gray-500" />
    </div>
  )
}
