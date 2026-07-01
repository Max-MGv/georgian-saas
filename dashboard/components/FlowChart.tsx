'use client'

import { useState, useMemo } from 'react'
import { ReactFlow, Background, Controls, BackgroundVariant, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import PhaseNode from './PhaseNode'
import FeatureNode from './FeatureNode'
import ArchNode from './ArchNode'
import DetailPanel from './DetailPanel'
import PricingPanel from './PricingPanel'
import type { VaultData, Phase, Section } from '@/lib/parseVault'
import type { ArchData, ArchNode as ArchNodeType } from '@/lib/parseArchitecture'

const nodeTypes = {
  phase: PhaseNode,
  feature: FeatureNode,
  arch: ArchNode,
}

const PHASE_W = 224
const PHASE_GAP = 80
const SECTION_W = 176
const SECTION_GAP = 50
const ARCH_W = 180
const ARCH_H = 90

// Column assignment by node type for arch layout
const TYPE_COL: Record<string, number> = {
  client: 0, page: 0,
  framework: 1, auth: 1,
  service: 2,
  database: 3,
  subpage: 4, tool: 4,
}

function buildArchLayout(nodes: ArchNodeType[]): { nodes: Node[]; edges: Edge[] } {
  const colCounts: Record<number, number> = {}
  const flowNodes: Node[] = nodes.map(n => {
    const col = TYPE_COL[n.type] ?? 2
    const row = colCounts[col] ?? 0
    colCounts[col] = row + 1
    return {
      id: n.id,
      type: 'arch',
      position: { x: col * (ARCH_W + 80), y: row * (ARCH_H + 40) },
      data: { node: n },
    }
  })

  const labelToId = Object.fromEntries(nodes.map(n => [n.label.toLowerCase(), n.id]))
  const flowEdges: Edge[] = []
  for (const n of nodes) {
    for (const target of n.connectsTo) {
      const targetId = labelToId[target.toLowerCase()]
      if (targetId) {
        flowEdges.push({
          id: `e-${n.id}-${targetId}`,
          source: n.id,
          target: targetId,
          style: { stroke: '#374151', strokeWidth: 1.5 },
          animated: false,
        })
      }
    }
  }

  return { nodes: flowNodes, edges: flowEdges }
}

export default function FlowChart({ data, arch }: { data: VaultData; arch: ArchData }) {
  const [tab, setTab] = useState<'roadmap' | 'architecture'>('roadmap')
  const [view, setView] = useState<'overview' | 'phase'>('overview')
  const [activePhase, setActivePhase] = useState<Phase | null>(null)
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedArchNode, setSelectedArchNode] = useState<ArchNodeType | null>(null)
  const [archPanelOpen, setArchPanelOpen] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)

  function openPhase(phase: Phase) {
    setActivePhase(phase)
    setView('phase')
    setSelectedSection(null)
    setPanelOpen(false)
  }

  function openSection(section: Section) {
    setSelectedSection(section)
    setPanelOpen(true)
  }

  function backToOverview() {
    setView('overview')
    setActivePhase(null)
    setPanelOpen(false)
    setSelectedSection(null)
  }

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    if (tab === 'architecture') {
      const archNode = arch.nodes.find(n => n.id === node.id)
      if (archNode) {
        setSelectedArchNode(archNode)
        setArchPanelOpen(true)
      }
      return
    }
    if (view === 'overview') {
      const phase = data.phases.find(p => p.id === node.id)
      if (phase) openPhase(phase)
    } else {
      if (node.id === activePhase?.id) return
      const section = activePhase?.sections.find(s => s.id === node.id)
      if (section) openSection(section)
    }
  }

  const { nodes, edges } = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    if (tab === 'architecture') {
      return buildArchLayout(arch.nodes.map(n => ({
        ...n,
        isSelected: selectedArchNode?.id === n.id,
      })) as ArchNodeType[])
    }

    if (view === 'overview') {
      const n: Node[] = data.phases.map((phase, i) => ({
        id: phase.id,
        type: 'phase',
        position: { x: i * (PHASE_W + PHASE_GAP), y: 0 },
        data: { phase },
      }))
      const e: Edge[] = data.phases.slice(0, -1).map((phase, i) => ({
        id: `e-${phase.id}-${data.phases[i + 1].id}`,
        source: phase.id,
        target: data.phases[i + 1].id,
        style: { stroke: '#4b5563', strokeWidth: 2 },
      }))
      return { nodes: n, edges: e }
    }

    if (!activePhase) return { nodes: [], edges: [] }

    const sections = activePhase.sections
    const totalW = sections.length * SECTION_W + (sections.length - 1) * SECTION_GAP
    const centerX = 300
    const startX = centerX - totalW / 2

    const phaseNode: Node = {
      id: activePhase.id,
      type: 'phase',
      position: { x: centerX - PHASE_W / 2, y: 0 },
      data: { phase: activePhase, isActive: true },
    }

    const sectionNodes: Node[] = sections.map((section, i) => ({
      id: section.id,
      type: 'feature',
      position: { x: startX + i * (SECTION_W + SECTION_GAP), y: 180 },
      data: {
        section,
        isSelected: selectedSection?.id === section.id,
      },
    }))

    const e: Edge[] = sections.map(section => ({
      id: `e-${activePhase.id}-${section.id}`,
      source: activePhase.id,
      target: section.id,
      style: { stroke: '#374151', strokeWidth: 1.5 },
    }))

    return { nodes: [phaseNode, ...sectionNodes], edges: e }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, view, activePhase?.id, selectedSection?.id, selectedArchNode?.id, data, arch])

  return (
    <div className="w-screen h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-12 flex items-center gap-3 px-5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        {tab === 'roadmap' && view === 'phase' ? (
          <>
            <button
              onClick={backToOverview}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Overview
            </button>
            <span className="text-gray-700">/</span>
            <span className="text-white text-sm font-medium">{activePhase?.label}</span>
          </>
        ) : (
          <>
            <span className="text-white text-sm font-semibold">Georgian SaaS</span>
            <span className="text-gray-600 text-xs ml-1">— Project Dashboard</span>

            {/* Tab switcher */}
            <div className="flex items-center gap-1 ml-4 bg-gray-800 rounded-lg p-0.5">
              {(['roadmap', 'architecture'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setPanelOpen(false); setArchPanelOpen(false) }}
                  className={`text-xs px-3 py-1 rounded-md transition-colors capitalize ${
                    tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => { setPricingOpen(o => !o); setArchPanelOpen(false) }}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              pricingOpen ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            Pricing model
          </button>
          <span className="text-xs text-gray-600">Last updated: {data.lastUpdated}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          key={tab === 'architecture' ? 'arch' : view === 'overview' ? 'overview' : activePhase?.id}
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

        {/* Roadmap detail panel */}
        <DetailPanel
          section={selectedSection}
          open={panelOpen && tab === 'roadmap'}
          onClose={() => setPanelOpen(false)}
        />

        {/* Architecture detail panel */}
        {archPanelOpen && selectedArchNode && tab === 'architecture' && (
          <div className="absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-700 z-20 flex flex-col transition-transform duration-300">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold text-base">{selectedArchNode.label}</h2>
                <span className="text-xs text-gray-500 capitalize">{selectedArchNode.type}</span>
              </div>
              <button onClick={() => setArchPanelOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none transition-colors" aria-label="Close panel">×</button>
            </div>
            {selectedArchNode.connectsTo.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-800">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Connects to</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedArchNode.connectsTo.map(c => (
                    <span key={c} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 rounded border border-gray-700">{c}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
              {selectedArchNode.detail || <span className="text-gray-600">No detail available.</span>}
            </div>
          </div>
        )}

        {/* Pricing panel */}
        <PricingPanel open={pricingOpen} onClose={() => setPricingOpen(false)} />
      </div>
    </div>
  )
}
