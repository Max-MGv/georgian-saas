/**
 * Shared, dependency-free pieces of the internal ticket tool (Plan-Tickets.md).
 * Safe to import from client components: no database, no server APIs.
 */

export const TICKET_STATUSES = ['INBOX', 'BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CLOSED'] as const
export type TicketStatusValue = (typeof TICKET_STATUSES)[number]

export const TICKET_TYPES = ['BUG', 'FEATURE', 'TASK', 'IDEA'] as const
export type TicketTypeValue = (typeof TICKET_TYPES)[number]

export const TICKET_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const
export type TicketPriorityValue = (typeof TICKET_PRIORITIES)[number]

export const TICKET_SOURCES = ['WIDGET', 'MANUAL', 'ASSISTANT', 'IMPORT', 'PRODUCTION'] as const
export type TicketSourceValue = (typeof TICKET_SOURCES)[number]

export const TICKET_CLOSE_REASONS = ['WONT_FIX', 'DUPLICATE', 'NOT_REPRODUCIBLE', 'OBSOLETE'] as const
export type TicketCloseReasonValue = (typeof TICKET_CLOSE_REASONS)[number]

/** Event kinds written to TicketEvent.kind. */
export const TICKET_EVENT_KINDS = ['CREATED', 'COMMENT', 'STATUS', 'FIELD', 'REVIEW', 'VERIFIED', 'SENT_BACK', 'REPORT_LINKED', 'QUESTION', 'ANSWER', 'DECISION', 'CLIENT_REPLY', 'CLIENT_EMAILED'] as const
export type TicketEventKind = (typeof TICKET_EVENT_KINDS)[number]

/** Where the ticket lives, for filtering. A fixed list; `area` is text so adding one needs no migration. */
export const TICKET_AREAS = [
  'Orders', 'Wine orders', 'Companies', 'Settings', 'Booking form', 'Payments',
  'Public site', 'Admin', 'Super-admin', 'Emails', 'Demo', 'Infrastructure', 'Other',
] as const

export const STATUS_LABEL: Record<TicketStatusValue, string> = {
  INBOX: 'Inbox',
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In progress',
  REVIEW: 'Ready to test',
  DONE: 'Done',
  CLOSED: 'Closed',
}

export const TYPE_LABEL: Record<TicketTypeValue, string> = { BUG: 'Bug', FEATURE: 'Feature', TASK: 'Task', IDEA: 'Idea' }
export const PRIORITY_LABEL: Record<TicketPriorityValue, string> = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' }
export const SOURCE_LABEL: Record<TicketSourceValue, string> = { WIDGET: 'Widget', MANUAL: 'Manual', ASSISTANT: 'Claude', IMPORT: 'Import', PRODUCTION: 'Client (production)' }
export const CLOSE_REASON_LABEL: Record<TicketCloseReasonValue, string> = {
  WONT_FIX: "Won't fix", DUPLICATE: 'Duplicate', NOT_REPRODUCIBLE: 'Not reproducible', OBSOLETE: 'Obsolete',
}

/** Higher number sorts first. */
export const PRIORITY_RANK: Record<TicketPriorityValue, number> = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }

/**
 * What a TENANT sees on /admin/my-reports for a report that belongs to a ticket.
 * BugReport.status keeps its four old values so that page needs no change; the
 * ticket is authoritative and this mapping is applied whenever it moves.
 */
export type TenantVisibleStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'WONT_FIX' | 'CLOSED'

/**
 * Since Tickets v2 Tier 3 (Plan-TicketsV2 3.2-3.3) this depends on more than the status:
 * - **Resolved only when the fix is live on production** (a ticket verified on staging still reads "In progress" to the client),
 *   and a ticket marked live on production reads "Resolved" even before Max closes it as Done;
 * - Closed as Won't fix → "Won't fix"; as Obsolete / Not reproducible → "Closed" (not "won't fix", which says we refused);
 *   a Duplicate's reports are moved to the original ticket, so they follow that one.
 */
export function tenantStatusFor(t: { status: TicketStatusValue; closeReason: TicketCloseReasonValue | null; liveOnProductionAt: Date | string | null }): TenantVisibleStatus {
  if (t.status === 'CLOSED') return t.closeReason === 'WONT_FIX' ? 'WONT_FIX' : 'CLOSED'
  if (t.liveOnProductionAt) return 'RESOLVED'
  if (t.status === 'INBOX' || t.status === 'BACKLOG') return 'NEW'
  return 'IN_PROGRESS'
}

/** The inverse, used once when old reports are turned into tickets. */
export const TICKET_STATUS_FOR_REPORT: Record<TenantVisibleStatus, TicketStatusValue> = {
  NEW: 'INBOX',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'DONE',
  WONT_FIX: 'CLOSED',
  CLOSED: 'CLOSED',
}

/** "T-42". (There used to be a "P-12" form for client reports copied from the production board; that copy was cancelled 2026-10-27.) */
export function displayRef(t: { number: number; externalRef?: string | null }): string {
  return `T-${t.number}`
}

// ── Tickets v2 (Plan-TicketsV2 Tier 2) ─────────────────────────────────────

/** Links on a ticket: a vault plan, a commit, a KnownBugs number, another ticket, or any web page. */
export const LINK_KINDS = ['plan', 'commit', 'bug', 'ticket', 'url'] as const
export type LinkKind = (typeof LINK_KINDS)[number]
export type TicketLink = { kind: LinkKind; ref: string; label?: string }
export const LINK_KIND_LABEL: Record<LinkKind, string> = { plan: 'Plan / note', commit: 'Commit', bug: 'Known bug', ticket: 'Related ticket', url: 'Web link' }
export const MAX_LINKS = 30

/** Where the work is live (derived from Ticket.liveOnStagingAt / liveOnProductionAt). */
export type LiveStage = 'NONE' | 'STAGING' | 'PRODUCTION'
export const LIVE_LABEL: Record<LiveStage, string> = { NONE: 'Not shipped', STAGING: 'On staging', PRODUCTION: 'Live on production' }
export function liveStage(t: { liveOnStagingAt: Date | string | null; liveOnProductionAt: Date | string | null }): LiveStage {
  return t.liveOnProductionAt ? 'PRODUCTION' : t.liveOnStagingAt ? 'STAGING' : 'NONE'
}

/** Answer buttons on a question. */
export const MAX_OPTIONS = 6
export const MAX_OPTION = 80

/**
 * "How to test" as separate steps for the checklist: one step per line, or - when it is one long line -
 * split at "1) … 2) …" / "1. … 2. …" markers. A text with no structure stays one step.
 */
export function parseSteps(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out = lines.length > 1 ? lines : (lines[0] ?? '').split(/\s+(?=\d{1,2}[.)]\s)/)
  const marker = /^(?:[-*•]|\d{1,2}[.)])\s+/
  // "On staging: 1) … 2) …" - the unnumbered lead-in is not a step of its own; it belongs with step 1.
  if (out.length > 1 && !marker.test(out[0]) && out.slice(1).every(l => marker.test(l))) {
    out.splice(0, 2, `${out[0].trim()} ${out[1].replace(marker, '')}`)
  }
  return out.map(l => l.replace(marker, '').trim()).filter(Boolean).slice(0, 20)
}

export const MAX_TITLE = 140
export const MAX_DESCRIPTION = 20000
export const MAX_COMMENT = 10000

/**
 * A readable title from free text: first non-empty line, whitespace collapsed,
 * cut at a word boundary. Used for widget reports until someone retitles them.
 */
export function deriveTitle(text: string, max = 80): string {
  const firstLine = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0) ?? ''
  const clean = firstLine.replace(/\s+/g, ' ')
  if (!clean) return 'Untitled report'
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}

/** "T-42" */
export function ticketRef(number: number): string {
  return `T-${number}`
}

/** Which environment a request host belongs to, so the two boards are never confused. */
export function environmentFromHost(host: string | null | undefined): 'PRODUCTION' | 'STAGING' | 'LOCAL' {
  const h = (host ?? '').split(':')[0].toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'LOCAL'
  if (h === 'staging.vineworks.ge' || h.startsWith('staging.') || h.includes('-git-staging-')) return 'STAGING'
  return 'PRODUCTION'
}

/** Allowed screenshot / attachment types. SVG is deliberately NOT here (it can carry script). */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Checks the first bytes really are the image type claimed, not just the client-supplied MIME. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  return null
}

/** Only http(s) URLs may be stored or linked: `javascript:` etc. would run in the admin's session. */
export function safeHttpUrl(value: string, maxLength = 2000): string | null {
  if (!value || value.length > maxLength) return null
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Escape text for inclusion in HTML (notification emails). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** The widget's click trail, cut to a safe shape: it is stored and shown to the super-admin, and it comes from the visitor. */
export function sanitizeBreadcrumbs(value: unknown): { type: string; target: string; path: string; timestamp: number }[] {
  if (!Array.isArray(value)) return []
  const out: { type: string; target: string; path: string; timestamp: number }[] = []
  for (const c of value.slice(-25)) {
    if (!c || typeof c !== 'object') continue
    const { type, target, path, timestamp } = c as Record<string, unknown>
    if (typeof type !== 'string' || typeof target !== 'string' || typeof path !== 'string') continue
    out.push({
      type: type.slice(0, 20), target: target.slice(0, 200), path: path.slice(0, 300),
      timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0,
    })
  }
  return out
}
