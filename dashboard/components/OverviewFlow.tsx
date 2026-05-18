'use client'

import { useState, useMemo } from 'react'
import { ReactFlow, Background, Controls, BackgroundVariant, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OverviewData, OverviewNode } from '@/lib/parseVault'

const typeStyles: Record<OverviewNode['type'], { bg: string; border: string; accent: string; dot: string; label: string }> = {
  user:    { bg: 'bg-blue-950',    border: 'border-blue-700',   accent: 'text-blue-300',    dot: 'bg-blue-400',    label: 'USER' },
  repo:    { bg: 'bg-gray-900',    border: 'border-gray-600',   accent: 'text-gray-300',    dot: 'bg-gray-400',    label: 'REPOSITORY' },
  host:    { bg: 'bg-violet-950',  border: 'border-violet-600', accent: 'text-violet-300',  dot: 'bg-violet-400',  label: 'HOSTING' },
  backend: { bg: 'bg-emerald-950', border: 'border-emerald-700',accent: 'text-emerald-300', dot: 'bg-emerald-400', label: 'BACKEND' },
}

import { Handle, Position } from '@xyflow/react'

function OverviewNodeComponent({ data }: { data: { node: OverviewNode; isSelected: boolean } }) {
  const { node, isSelected } = data
  const s = typeStyles[node.type] ?? typeStyles.host

  return (
    <div className={`
      w-52 rounded-xl border-2 px-5 py-4 cursor-pointer transition-all select-none
      ${s.bg} ${isSelected ? 'border-white shadow-lg shadow-white/10' : s.border}
    `}>
      <Handle type="target" position={Position.Left} className="!bg-gray-600 !border-gray-500" />
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <span className={`text-[10px] font-medium uppercase tracking-wider ${s.accent}`}>{s.label}</span>
      </div>
      <div className="text-white font-bold text-base leading-tight">{node.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-gray-600 !border-gray-500" />
    </div>
  )
}

const nodeTypes = { overview: OverviewNodeComponent }

// Fixed positions for the 4 nodes: GitHub → Vercel → Supabase, Browser below Vercel
const POSITIONS: Record<string, { x: number; y: number }> = {
  github:   { x: 0,   y: 80 },
  vercel:   { x: 320, y: 80 },
  supabase: { x: 640, y: 80 },
  browser:  { x: 320, y: 260 },
}

export default function OverviewFlow({ data }: { data: OverviewData }) {
  const [selected, setSelected] = useState<OverviewNode | null>(null)

  const { nodes, edges } = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    const nodes: Node[] = data.nodes.map(n => ({
      id: n.id,
      type: 'overview',
      position: POSITIONS[n.id] ?? { x: 0, y: 0 },
      data: { node: n, isSelected: selected?.id === n.id },
    }))

    const edges: Edge[] = []
    for (const n of data.nodes) {
      for (const target of n.connectsTo) {
        const targetId = target.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        if (data.nodes.find(x => x.id === targetId)) {
          edges.push({
            id: `e-${n.id}-${targetId}`,
            source: n.id,
            target: targetId,
            style: { stroke: '#4b5563', strokeWidth: 2 },
            animated: n.id === 'github', // animate deploy arrow
          })
        }
      }
    }

    return { nodes, edges }
  }, [data, selected])

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    const found = data.nodes.find(n => n.id === node.id)
    setSelected(prev => prev?.id === found?.id ? null : (found ?? null))
  }

  return (
    <div className="flex-1 relative flex">
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnScroll
          zoomOnScroll
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1f2937" />
          <Controls className="[&>button]:bg-gray-800 [&>button]:border-gray-700 [&>button]:text-gray-300 [&>button:hover]:bg-gray-700" />
        </ReactFlow>
      </div>

      {/* Detail panel */}
      <div className={`
        absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-800
        transform transition-transform duration-200 overflow-y-auto
        ${selected ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {selected && (
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  {typeStyles[selected.type]?.label}
                </p>
                <h2 className="text-white text-xl font-bold">{selected.label}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-500 hover:text-white transition-colors mt-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {selected.connectsTo.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {selected.connectsTo.map(t => (
                  <span key={t} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">→ {t}</span>
                ))}
              </div>
            )}

            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.detailMarkdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
