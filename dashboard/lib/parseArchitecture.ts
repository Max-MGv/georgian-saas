import fs from 'fs'
import path from 'path'

const VAULT_PATH = process.env.VAULT_PATH || 'C:\\Users\\Max\\Desktop\\claude-projects\\georgian-saas\\vault'

export type ArchNode = {
  id: string
  label: string
  type: string
  connectsTo: string[]
  detail: string
}

export type ArchData = {
  nodes: ArchNode[]
}

export function parseArchitecture(): ArchData {
  let content = ''
  try {
    content = fs.readFileSync(path.join(VAULT_PATH, 'Architecture.md'), 'utf-8')
  } catch {
    return { nodes: [] }
  }

  const nodes: ArchNode[] = []
  const lines = content.split('\n')

  let current: ArchNode | null = null
  let inProperties = true
  let detailLines: string[] = []

  function flush() {
    if (!current) return
    current.detail = detailLines.join('\n').trim()
    nodes.push(current)
    current = null
    detailLines = []
    inProperties = true
  }

  for (const line of lines) {
    // New node heading
    const headingMatch = line.match(/^## (.+)/)
    if (headingMatch) {
      flush()
      current = { id: headingMatch[1].trim().toLowerCase().replace(/\s+/g, '-'), label: headingMatch[1].trim(), type: 'service', connectsTo: [], detail: '' }
      inProperties = true
      continue
    }

    if (!current) continue

    // HR separator ends property block
    if (line.trim() === '---') {
      inProperties = false
      continue
    }

    if (inProperties) {
      const typeProp = line.match(/^- type:\s*(.+)/)
      if (typeProp) { current.type = typeProp[1].trim(); continue }

      const connectsProp = line.match(/^- connects-to:\s*(.*)/)
      if (connectsProp) {
        const val = connectsProp[1].trim()
        current.connectsTo = val ? val.split(',').map(s => s.trim()).filter(Boolean) : []
        inProperties = false
        continue
      }
    }

    detailLines.push(line)
  }
  flush()

  return { nodes }
}
