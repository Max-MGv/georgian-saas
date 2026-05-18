import fs from 'fs'
import path from 'path'

const VAULT_PATH = process.env.VAULT_PATH ?? path.join(process.cwd(), '..', 'vault')

export type Task = {
  id: string
  label: string
  done: boolean
}

export type Section = {
  id: string
  label: string
  tasks: Task[]
  detailMarkdown: string
}

export type Phase = {
  id: string
  label: string
  sections: Section[]
  totalTasks: number
  doneTasks: number
}

export type VaultData = {
  phases: Phase[]
  lastUpdated: string
}

export type ArchNode = {
  id: string
  label: string
  type: 'client' | 'auth' | 'framework' | 'page' | 'tool' | 'subpage' | 'service' | 'database'
  connectsTo: string[]
  detailMarkdown: string
}

export type ArchData = {
  nodes: ArchNode[]
}

export type OverviewNode = {
  id: string
  label: string
  type: 'user' | 'repo' | 'host' | 'backend'
  connectsTo: string[]
  detailMarkdown: string
}

export type OverviewData = {
  nodes: OverviewNode[]
}

function readVaultFile(filename: string): string {
  try {
    return fs.readFileSync(path.join(VAULT_PATH, filename), 'utf-8')
  } catch {
    return ''
  }
}

function extractSectionContent(markdown: string, heading: string): string {
  const lines = markdown.split('\n')
  let capturing = false
  let depth = 0
  const result: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const currentDepth = headingMatch[1].length
      const currentText = headingMatch[2].replace(/\*\*/g, '').trim()
      if (currentText.toLowerCase() === heading.toLowerCase()) {
        capturing = true
        depth = currentDepth
        result.push(line)
        continue
      }
      if (capturing && currentDepth <= depth) break
    }
    if (capturing) result.push(line)
  }

  return result.join('\n').trim()
}

function getLastProgressDate(content: string): string {
  const match = content.match(/## (\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : 'Not started'
}

export function parseVault(): VaultData {
  const roadmapContent = readVaultFile('Roadmap.md')
  const featuresContent = readVaultFile('MVP Features.md')
  const progressContent = readVaultFile('Progress Log.md')

  const phases: Phase[] = []
  let currentPhase: Phase | null = null
  let currentSection: Section | null = null
  let currentSectionLines: string[] = []

  function flushSection() {
    if (!currentSection || !currentPhase) return
    const featureDetail = extractSectionContent(featuresContent, currentSection.label)
    currentSection.detailMarkdown = featureDetail || currentSectionLines.join('\n').trim()
    currentPhase.sections.push(currentSection)
    currentSection = null
    currentSectionLines = []
  }

  function flushPhase() {
    flushSection()
    if (!currentPhase) return
    currentPhase.totalTasks = currentPhase.sections.reduce((sum, s) => sum + s.tasks.length, 0)
    currentPhase.doneTasks = currentPhase.sections.reduce((sum, s) => sum + s.tasks.filter(t => t.done).length, 0)
    phases.push(currentPhase)
    currentPhase = null
  }

  for (const line of roadmapContent.split('\n')) {
    // Phase heading: ## Phase 0 — ... or ## v1 — ... or ## v1.1 — ...
    const phaseMatch = line.match(/^## ((?:Phase\s+\d+|v[\d.]+)\s*[—–-].+)/)
    if (phaseMatch) {
      flushPhase()
      const label = phaseMatch[1].trim()
      const versionPart = label.match(/(?:Phase\s+\d+|v[\d.]+)/)?.[0] ?? label
      currentPhase = {
        id: versionPart.toLowerCase().replace(/[\s.]+/g, '_'),
        label,
        sections: [],
        totalTasks: 0,
        doneTasks: 0,
      }
      continue
    }

    if (!currentPhase) continue

    // Section heading: ### Setup
    const sectionMatch = line.match(/^### (.+)/)
    if (sectionMatch) {
      flushSection()
      const label = sectionMatch[1].trim()
      currentSection = {
        id: `${currentPhase.id}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        label,
        tasks: [],
        detailMarkdown: '',
      }
      currentSectionLines = [line]
      continue
    }

    // Task lines directly under a phase (no section heading) — auto-create "Features" section
    const isTask = /^[ \t]*(?:-|\d+\.)\s+\[([x ])\]/.test(line)
    if (isTask && !currentSection) {
      currentSection = {
        id: `${currentPhase.id}_features`,
        label: 'Features',
        tasks: [],
        detailMarkdown: '',
      }
      currentSectionLines = []
    }

    if (!currentSection) continue
    currentSectionLines.push(line)

    const taskMatch = line.match(/^[ \t]*(?:-|\d+\.)\s+\[([x ])\]\s+(.+)/)
    if (taskMatch) {
      const done = taskMatch[1] === 'x'
      const label = taskMatch[2]
        .replace(/\*\*/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s*[—–].*$/, '')
        .trim()
      currentSection.tasks.push({
        id: `${currentSection.id}_${currentSection.tasks.length}`,
        label,
        done,
      })
    }
  }

  flushPhase()

  return { phases, lastUpdated: getLastProgressDate(progressContent) }
}

export function parseArchitecture(): ArchData {
  const content = readVaultFile('Architecture.md')
  const nodes: ArchNode[] = []

  // Split on --- separators (ignore frontmatter block)
  const sections = content.split(/\n---\n/)

  for (const section of sections) {
    const lines = section.trim().split('\n')
    const headingLine = lines.find(l => /^## .+/.test(l) && !l.startsWith('# '))
    if (!headingLine) continue

    const label = headingLine.replace(/^## /, '').trim()
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_')

    let type: ArchNode['type'] = 'service'
    let connectsTo: string[] = []
    const detailLines: string[] = []
    let pastProperties = false

    for (const line of lines) {
      if (line === headingLine) continue
      const typeMatch = line.match(/^- type:\s*(.+)/)
      const connectsMatch = line.match(/^- connects-to:\s*(.*)/)

      if (typeMatch) {
        type = typeMatch[1].trim() as ArchNode['type']
        continue
      }
      if (connectsMatch) {
        const val = connectsMatch[1].trim()
        connectsTo = val ? val.split(',').map(s => s.trim()).filter(Boolean) : []
        continue
      }
      if (line.startsWith('- ')) continue // skip other bullet props
      if (!pastProperties && line.trim() === '') { pastProperties = true; continue }
      if (pastProperties || (!line.startsWith('-') && !line.startsWith('#'))) {
        pastProperties = true
        detailLines.push(line)
      }
    }

    nodes.push({ id, label, type, connectsTo, detailMarkdown: detailLines.join('\n').trim() })
  }

  return { nodes }
}

export function parseSystemOverview(): OverviewData {
  const content = readVaultFile('SystemOverview.md')
  const nodes: OverviewNode[] = []

  const sections = content.split(/\n---\n/)

  for (const section of sections) {
    const lines = section.trim().split('\n')
    const headingLine = lines.find(l => /^## .+/.test(l))
    if (!headingLine) continue

    const label = headingLine.replace(/^## /, '').trim()
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_')

    let type: OverviewNode['type'] = 'host'
    let connectsTo: string[] = []
    const detailLines: string[] = []
    let pastProperties = false

    for (const line of lines) {
      if (line === headingLine) continue
      const typeMatch = line.match(/^- type:\s*(.+)/)
      const connectsMatch = line.match(/^- connects-to:\s*(.*)/)

      if (typeMatch) { type = typeMatch[1].trim() as OverviewNode['type']; continue }
      if (connectsMatch) {
        const val = connectsMatch[1].trim()
        connectsTo = val ? val.split(',').map(s => s.trim()).filter(Boolean) : []
        continue
      }
      if (line.startsWith('- ')) continue
      if (!pastProperties && line.trim() === '') { pastProperties = true; continue }
      if (pastProperties || (!line.startsWith('-') && !line.startsWith('#'))) {
        pastProperties = true
        detailLines.push(line)
      }
    }

    nodes.push({ id, label, type, connectsTo, detailMarkdown: detailLines.join('\n').trim() })
  }

  return { nodes }
}
