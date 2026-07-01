'use client'

import { Handle, Position } from '@xyflow/react'
import type { ArchNode } from '@/lib/parseArchitecture'

const TYPE_STYLES: Record<string, { border: string; badge: string; badgeText: string }> = {
  client:    { border: '#3b82f6', badge: '#1e3a5f', badgeText: '#93c5fd' },
  framework: { border: '#a855f7', badge: '#2e1065', badgeText: '#c4b5fd' },
  service:   { border: '#14b8a6', badge: '#134e4a', badgeText: '#5eead4' },
  auth:      { border: '#f59e0b', badge: '#451a03', badgeText: '#fcd34d' },
  database:  { border: '#22c55e', badge: '#14532d', badgeText: '#86efac' },
  page:      { border: '#0ea5e9', badge: '#0c4a6e', badgeText: '#7dd3fc' },
  tool:      { border: '#f97316', badge: '#431407', badgeText: '#fdba74' },
  subpage:   { border: '#6b7280', badge: '#1f2937', badgeText: '#9ca3af' },
}

type Props = {
  data: { node: ArchNode; isSelected?: boolean }
}

export default function ArchNode({ data }: Props) {
  const { node, isSelected } = data
  const style = TYPE_STYLES[node.type] ?? TYPE_STYLES.service

  return (
    <div
      style={{
        width: 180,
        background: isSelected ? '#1f2937' : '#111827',
        border: `1px solid ${isSelected ? style.border : '#374151'}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        boxShadow: isSelected ? `0 0 0 1px ${style.border}40` : 'none',
        transition: 'border-color 0.15s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
          background: style.badge, color: style.badgeText, whiteSpace: 'nowrap',
        }}>
          {node.type}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, color: '#f9fafb', lineHeight: 1.35 }}>
        {node.label}
      </div>

      <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6 }}>
        Click for details →
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
