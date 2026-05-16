'use client'

import { useState, useMemo } from 'react'
import { ReactFlow, Background, Controls, BackgroundVariant, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import PhaseNode from './PhaseNode'
import FeatureNode from './FeatureNode'
import DetailPanel from './DetailPanel'
import type { VaultData, Phase, Section } from '@/lib/parseVault'

const nodeTypes = {
  phase: PhaseNode,
  feature: FeatureNode,
}

const PHASE_W = 224  // node width
const PHASE_GAP = 80 // gap between phase nodes
const SECTION_W = 176
const SECTION_GAP = 50

export default function FlowChart({ data }: { data: VaultData }) {
  const [view, setView] = useState<'overview' | 'phase'>('overview')
  const [activePhase, setActivePhase] = useState<Phase | null>(null)
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

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
    if (view === 'overview') {
      const phase = data.phases.find(p => p.id === node.id)
      if (phase) openPhase(phase)
    } else {
      if (node.id === activePhase?.id) return
      const section = activePhase?.sections.find(s => s.id === node.id)
      if (section) openSection(section)
    }
  }

  const { nodes, edges } = useMemo((): { nodes: Node[], edges: Edge[] } => {
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
  }, [view, activePhase?.id, selectedSection?.id, data])

  return (
    <div className="w-screen h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-12 flex items-center gap-3 px-5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        {view === 'phase' ? (
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
          </>
        )}

        <div className="ml-auto text-xs text-gray-600">
          Last updated: {data.lastUpdated}
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative">
        <ReactFlow
          key={view === 'overview' ? 'overview' : activePhase?.id}
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
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#1f2937"
          />
          <Controls
            className="[&>button]:bg-gray-800 [&>button]:border-gray-700 [&>button]:text-gray-300 [&>button:hover]:bg-gray-700"
          />
        </ReactFlow>

        <DetailPanel
          section={selectedSection}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      </div>
    </div>
  )
}
