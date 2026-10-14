'use client'

/**
 * A deliberately small Markdown subset for ticket text (Plan-TicketsV2 1.5): paragraphs, line breaks,
 * "- " / "1. " lists, **bold**, `code`, [text](url), bare http(s) links, T-12 references and commit hashes.
 * It builds React elements, never HTML strings - ticket text can come from anonymous visitors, so
 * nothing in it may become markup or a non-http link.
 */

import type { ReactNode } from 'react'
import { safeHttpUrl } from '@/lib/tickets'
import { C } from './ui'

const REPO_COMMIT_URL = 'https://github.com/Max-MGv/georgian-saas/commit/'

// One pass over a line: the first alternative that matches at a position wins.
const INLINE = /(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\bT-\d{1,7}\b)|(\b[0-9a-f]{7,40}\b)/g

export function inline(text: string, onTicket?: (n: number) => void): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [all, bold, code, mdLink, url, ticket, sha] = m
    const k = out.length
    if (bold) out.push(<strong key={k}>{bold.slice(2, -2)}</strong>)
    else if (code) out.push(<code key={k} style={codeStyle}>{code.slice(1, -1)}</code>)
    else if (mdLink) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(mdLink)!
      const safe = safeHttpUrl(href)
      out.push(safe ? <a key={k} href={safe} target="_blank" rel="noopener noreferrer" style={linkStyle}>{label}</a> : mdLink)
    } else if (url) {
      const safe = safeHttpUrl(url)
      out.push(safe ? <a key={k} href={safe} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, wordBreak: 'break-all' }}>{url}</a> : url)
    } else if (ticket) {
      const n = Number(ticket.slice(2))
      out.push(
        <a key={k} href={`/super-admin/tickets?t=${n}`} style={linkStyle}
          onClick={onTicket ? e => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); onTicket(n) } } : undefined}>{ticket}</a>,
      )
    } else if (sha && /[a-f]/.test(sha) && /\d/.test(sha)) {
      // Looks like a commit (hex with letters AND digits, so plain words and numbers are left alone).
      out.push(<a key={k} href={REPO_COMMIT_URL + sha} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, ...codeStyle }}>{sha}</a>)
    } else out.push(all)
    last = m.index + all.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ text, onTicket }: { text: string; onTicket?: (n: number) => void }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const bullet = /^\s*[-*•]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i])) {
        items.push(lines[i].replace(ordered ? numbered : bullet, ''))
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={blocks.length} style={{ margin: '4px 0', paddingLeft: 20, listStyle: ordered ? 'decimal' : 'disc' }}>
          {items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it, onTicket)}</li>)}
        </Tag>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !numbered.test(lines[i])) { para.push(lines[i]); i++ }
    blocks.push(
      <p key={blocks.length} style={{ margin: '0 0 8px' }}>
        {para.map((p, j) => <span key={j}>{j > 0 && <br />}{inline(p, onTicket)}</span>)}
      </p>,
    )
  }
  return <div style={{ fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word' }}>{blocks}</div>
}

const linkStyle = { color: C.accent, textDecoration: 'underline', textUnderlineOffset: 2 } as const
const codeStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.88em', backgroundColor: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 4px' } as const
