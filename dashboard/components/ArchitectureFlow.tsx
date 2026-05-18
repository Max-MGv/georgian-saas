'use client'

import { useState, useMemo } from 'react'
import { ReactFlow, Background, Controls, BackgroundVariant, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ArchNodeComponent from './ArchNode'
import OverviewFlow from './OverviewFlow'
import type { ArchData, ArchNode, OverviewData } from '@/lib/parseVault'

const nodeTypes = { arch: ArchNodeComponent }

const LAYER_ORDER: Record<ArchNode['type'], number> = {
  client: 0,
  auth: 1,
  framework: 2,
  page: 3,
  tool: 3,
  subpage: 4,
  service: 5,
  database: 6,
}

const NODE_W = 176
const NODE_H = 80
const H_GAP = 60
const V_GAP = 80

function layoutNodes(archNodes: ArchNode[]): Node[] {
  const byLayer: Record<number, ArchNode[]> = {}
  for (const n of archNodes) {
    const layer = LAYER_ORDER[n.type] ?? 3
    if (!byLayer[layer]) byLayer[layer] = []
    byLayer[layer].push(n)
  }

  const result: Node[] = []
  for (const [layerStr, nodes] of Object.entries(byLayer)) {
    const layer = Number(layerStr)
    const totalW = nodes.length * NODE_W + (nodes.length - 1) * H_GAP
    const startX = 400 - totalW / 2
    const y = layer * (NODE_H + V_GAP)
    nodes.forEach((n, i) => {
      result.push({
        id: n.id,
        type: 'arch',
        position: { x: startX + i * (NODE_W + H_GAP), y },
        data: { node: n, isSelected: false },
      })
    })
  }
  return result
}

function SubTabs({ view, onChange }: { view: 'overview' | 'detailed'; onChange: (v: 'overview' | 'detailed') => void }) {
  return (
    <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0">
      <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5">
        {(['overview', 'detailed'] as const).map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
              view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ArchitectureFlow({ data, overview }: { data: ArchData; overview: OverviewData }) {
  const [archView, setArchView] = useState<'overview' | 'detailed'>('overview')
  const [selected, setSelected] = useState<ArchNode | null>(null)

  const { nodes, edges } = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    const positioned = layoutNodes(data.nodes)

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
            animated: false,
          })
        }
      }
    }

    const nodesWithSelection = positioned.map(n => ({
      ...n,
      data: { ...n.data, isSelected: selected?.id === n.id },
    }))

    return { nodes: nodesWithSelection, edges }
  }, [data, selected])

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    const archNode = data.nodes.find(n => n.id === node.id)
    setSelected(prev => prev?.id === archNode?.id ? null : (archNode ?? null))
  }

  if (archView === 'overview') {
    return (
      <div className="flex-1 flex flex-col">
        <SubTabs view={archView} onChange={setArchView} />
        <OverviewFlow data={overview} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <SubTabs view={archView} onChange={(v) => { setArchView(v); setSelected(null) }} />
      <div className="flex-1 relative flex">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
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
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{selected.type}</p>
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
                    <span key={t} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                      → {t}
                    </span>
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
    </div>
  )
}
