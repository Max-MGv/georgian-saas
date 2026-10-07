/**
 * The single place that changes tickets (Plan-Tickets.md). The super-admin server
 * actions and the token API both go through here, so the rules - a reason is
 * required to close, every change leaves a timeline event, the tenant-visible
 * BugReport status follows the ticket - cannot drift between the two.
 *
 * No auth in this file: callers (requireSuperAdmin / API token) own that.
 * Plain `db` is correct: Ticket* tables are outside tenant RLS by design.
 */

import { db } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase/service'
import type { Prisma, TicketStatus, TicketType, TicketPriority, TicketSource, TicketCloseReason } from '@prisma/client'
import {
  MAX_COMMENT, MAX_DESCRIPTION, MAX_TITLE, TENANT_STATUS_FOR, TICKET_CLOSE_REASONS, TICKET_PRIORITIES,
  TICKET_STATUSES, TICKET_TYPES, type TicketStatusValue,
} from '@/lib/tickets'

type Tx = Prisma.TransactionClient

/** A rule violation the caller can show to a person (not a crash). */
export class TicketError extends Error {}

function clean(s: unknown, max: number): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : ''
}

function cleanLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return []
  const out = new Set<string>()
  for (const l of labels) {
    const v = typeof l === 'string' ? l.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30) : ''
    if (v) out.add(v)
    if (out.size >= 10) break
  }
  return [...out]
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new TicketError(`Invalid ${what}.`)
}

export type NewTicketInput = {
  title: string
  description?: string
  type?: TicketType
  priority?: TicketPriority
  status?: TicketStatus
  area?: string | null
  labels?: string[]
  tenantId?: string | null
  source: TicketSource
  createdBy: string
  externalRef?: string | null
  /** Written as the first timeline entry. */
  createdNote?: string
}

/** A ticket can only START in these; Ready to test needs a review card, Done needs Max, Closed needs a reason. */
const STARTING_STATUSES = ['INBOX', 'BACKLOG', 'IN_PROGRESS'] as const

async function assertTenantExists(tx: Tx | typeof db, tenantId: string | null | undefined) {
  if (!tenantId) return
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!t) throw new TicketError('Unknown tenant.')
}

export async function createTicket(input: NewTicketInput, tx: Tx | typeof db = db) {
  const title = clean(input.title, MAX_TITLE)
  if (!title) throw new TicketError('A ticket needs a title.')
  if (input.status) oneOf(input.status, STARTING_STATUSES, 'starting status (use Inbox, Backlog or In progress)')
  await assertTenantExists(tx, input.tenantId)
  const ticket = await tx.ticket.create({
    data: {
      title,
      description: clean(input.description, MAX_DESCRIPTION),
      type: input.type ? oneOf(input.type, TICKET_TYPES, 'type') : 'BUG',
      priority: input.priority ? oneOf(input.priority, TICKET_PRIORITIES, 'priority') : 'NORMAL',
      status: input.status ? oneOf(input.status, TICKET_STATUSES, 'status') : 'INBOX',
      area: input.area ? clean(input.area, 40) || null : null,
      labels: cleanLabels(input.labels),
      tenantId: input.tenantId || null,
      source: input.source,
      createdBy: input.createdBy,
      externalRef: input.externalRef || null,
      events: {
        create: [{ kind: 'CREATED', body: clean(input.createdNote, MAX_COMMENT), actor: input.createdBy }],
      },
    },
  })
  return ticket
}

async function syncTenantVisibleStatus(tx: Tx, ticketId: string, status: TicketStatusValue) {
  await tx.bugReport.updateMany({ where: { ticketId }, data: { status: TENANT_STATUS_FOR[status] } })
}

async function load(tx: Tx | typeof db, id: string) {
  const t = await tx.ticket.findUnique({ where: { id } })
  if (!t) throw new TicketError('Ticket not found.')
  return t
}

export async function changeStatus(
  id: string,
  to: TicketStatusValue,
  actor: string,
  opts: { closeReason?: TicketCloseReason | null; note?: string; kind?: 'STATUS' | 'VERIFIED' | 'SENT_BACK' | 'REVIEW'; meta?: Prisma.InputJsonValue } = {},
) {
  oneOf(to, TICKET_STATUSES, 'status')
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    let reason: TicketCloseReason | null = null
    if (to === 'CLOSED') {
      if (!opts.closeReason) throw new TicketError('A reason is required to close a ticket.')
      reason = oneOf(opts.closeReason, TICKET_CLOSE_REASONS, 'close reason')
    }
    const finished = to === 'DONE' || to === 'CLOSED'
    const reasonChanged = to === 'CLOSED' && t.status === 'CLOSED' && t.closeReason !== reason
    const noop = t.status === to && !opts.kind && !reasonChanged
    let updated = t
    if (!noop) {
      // Optimistic concurrency: the write only lands if the ticket is still in the status we read.
      // Without it, two people (or Max and the assistant) moving the same ticket at once would both
      // "succeed", the last write would win, and both timeline entries would claim the same "from".
      const res = await tx.ticket.updateMany({
        where: { id, status: t.status },
        data: {
          status: to,
          closeReason: reason,
          closedAt: finished ? (t.closedAt && (t.status === 'DONE' || t.status === 'CLOSED') ? t.closedAt : new Date()) : null,
        },
      })
      if (res.count === 0) throw new TicketError('This ticket was changed by someone else a moment ago - reload and try again.')
      updated = await load(tx, id)
    }
    if (!noop) {
      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          kind: opts.kind ?? 'STATUS',
          body: clean(opts.note, MAX_COMMENT),
          fromValue: t.status + (t.closeReason ? `:${t.closeReason}` : ''),
          toValue: to + (reason ? `:${reason}` : ''),
          actor,
          meta: opts.meta,
        },
      })
    }
    await syncTenantVisibleStatus(tx, id, to)
    return updated
  })
}

export type ReviewCard = { changed: string; howToTest: string; leftOver?: string; commit?: string }

/** Claude (or Max) says the work is done: ticket moves to "Ready to test" with a structured card. */
export async function postReview(id: string, card: ReviewCard, actor: string) {
  const changed = clean(card.changed, MAX_COMMENT)
  const howToTest = clean(card.howToTest, MAX_COMMENT)
  if (!changed || !howToTest) throw new TicketError('A review card needs "what changed" and "how to test".')
  const meta = { changed, howToTest, leftOver: clean(card.leftOver, MAX_COMMENT), commit: clean(card.commit, 100) }
  return changeStatus(id, 'REVIEW', actor, { kind: 'REVIEW', note: changed, meta })
}

export async function verify(id: string, actor: string, note?: string) {
  return changeStatus(id, 'DONE', actor, { kind: 'VERIFIED', note })
}

export async function sendBack(id: string, note: string, actor: string) {
  if (!clean(note, MAX_COMMENT)) throw new TicketError('Say what is still wrong when sending a ticket back.')
  return changeStatus(id, 'IN_PROGRESS', actor, { kind: 'SENT_BACK', note })
}

export async function addComment(id: string, body: string, actor: string) {
  const text = clean(body, MAX_COMMENT)
  if (!text) throw new TicketError('Write something first.')
  await load(db, id)
  return db.$transaction(async tx => {
    const ev = await tx.ticketEvent.create({ data: { ticketId: id, kind: 'COMMENT', body: text, actor } })
    await tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } })
    return ev
  })
}

export type TicketPatch = {
  title?: string
  description?: string
  type?: TicketType
  priority?: TicketPriority
  area?: string | null
  labels?: string[]
  tenantId?: string | null
}

export async function updateFields(id: string, patch: TicketPatch, actor: string) {
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    const data: Prisma.TicketUpdateInput = {}
    const events: { body: string; from?: string; to?: string }[] = []

    if (patch.title !== undefined) {
      const v = clean(patch.title, MAX_TITLE)
      if (!v) throw new TicketError('A ticket needs a title.')
      if (v !== t.title) { data.title = v; events.push({ body: 'title changed', from: t.title, to: v }) }
    }
    if (patch.description !== undefined) {
      const v = clean(patch.description, MAX_DESCRIPTION)
      if (v !== t.description) { data.description = v; events.push({ body: 'description edited' }) }
    }
    if (patch.type !== undefined) {
      const v = oneOf(patch.type, TICKET_TYPES, 'type')
      if (v !== t.type) { data.type = v; events.push({ body: 'type changed', from: t.type, to: v }) }
    }
    if (patch.priority !== undefined) {
      const v = oneOf(patch.priority, TICKET_PRIORITIES, 'priority')
      if (v !== t.priority) { data.priority = v; events.push({ body: 'priority changed', from: t.priority, to: v }) }
    }
    if (patch.area !== undefined) {
      const v = patch.area ? clean(patch.area, 40) || null : null
      if (v !== t.area) { data.area = v; events.push({ body: 'area changed', from: t.area ?? '—', to: v ?? '—' }) }
    }
    if (patch.labels !== undefined) {
      const v = cleanLabels(patch.labels)
      if (v.join(',') !== t.labels.join(',')) { data.labels = v; events.push({ body: 'labels changed', from: t.labels.join(', ') || '—', to: v.join(', ') || '—' }) }
    }
    if (patch.tenantId !== undefined) {
      const v = patch.tenantId || null
      await assertTenantExists(tx, v)
      if (v !== t.tenantId) { data.tenantId = v; events.push({ body: 'tenant changed', from: t.tenantId ?? '—', to: v ?? '—' }) }
    }
    if (events.length === 0) return t
    const updated = await tx.ticket.update({ where: { id }, data })
    await tx.ticketEvent.createMany({
      data: events.map(e => ({ ticketId: id, kind: 'FIELD', body: e.body, fromValue: e.from ?? null, toValue: e.to ?? null, actor })),
    })
    return updated
  })
}

export async function addAttachmentRow(
  ticketId: string,
  a: { storagePath: string; bucket: string; fileName: string; mimeType: string; sizeBytes: number },
) {
  return db.ticketAttachment.create({ data: { ticketId, ...a } })
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** What the token API may do to a ticket's status (Plan-Tickets.md + review 2026-10-07).
 *  The assistant plans and hands over; it does not reopen what Max verified, close what a
 *  customer reported (they would see "Won't fix"), or skip the review card. */
export function assertApiStatusChange(ticket: { status: TicketStatus; source: TicketSource }, to: TicketStatusValue) {
  if (to === 'DONE') throw new TicketError('Only Max can mark a ticket Done - post a review card instead.')
  if (to === 'REVIEW') throw new TicketError('Use the review endpoint to move a ticket to Ready to test (it needs a review card).')
  if (ticket.status === 'DONE' || ticket.status === 'CLOSED') throw new TicketError('This ticket is already finished - ask Max to reopen it.')
  if (to === 'CLOSED' && ticket.source === 'WIDGET') throw new TicketError('Reporter tickets are closed by Max (the reporter sees the result).')
}

export type TicketListItem = {
  id: string
  number: number
  title: string
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  area: string | null
  labels: string[]
  tenantId: string | null
  tenantName: string | null
  source: TicketSource
  closeReason: TicketCloseReason | null
  createdAt: string
  updatedAt: string
  attachmentCount: number
  commentCount: number
}

async function tenantNames(): Promise<Map<string, string>> {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, displayName: true } })
  return new Map(tenants.map(t => [t.id, t.displayName ?? t.name]))
}

export async function listTickets(): Promise<TicketListItem[]> {
  const [rows, names] = await Promise.all([
    db.ticket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { attachments: true, events: { where: { kind: 'COMMENT' } } } } },
    }),
    tenantNames(),
  ])
  return rows.map(t => ({
    id: t.id, number: t.number, title: t.title, type: t.type, status: t.status, priority: t.priority,
    area: t.area, labels: t.labels, tenantId: t.tenantId, tenantName: t.tenantId ? (names.get(t.tenantId) ?? 'Unknown tenant') : null,
    source: t.source, closeReason: t.closeReason, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    attachmentCount: t._count.attachments, commentCount: t._count.events,
  }))
}

export type TicketDetail = TicketListItem & {
  description: string
  createdBy: string | null
  externalRef: string | null
  closedAt: string | null
  events: { id: string; kind: string; body: string; fromValue: string | null; toValue: string | null; actor: string; meta: unknown; createdAt: string }[]
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; signedUrl: string | null; createdAt: string }[]
  reports: { id: string; surface: string; pageUrl: string; userAgent: string | null; submitterEmail: string | null; breadcrumbs: unknown; createdAt: string }[]
}

export async function getTicketByNumber(number: number): Promise<TicketDetail | null> {
  const t = await db.ticket.findUnique({
    where: { number },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
      reports: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!t) return null
  const names = t.tenantId ? await tenantNames() : new Map<string, string>()

  const supabase = createServiceClient()
  const attachments = await Promise.all(t.attachments.map(async a => {
    // A flaky storage call (timeout, reset) must never take the whole ticket page down:
    // the image just shows as "unavailable" and the rest of the ticket still renders.
    let signedUrl: string | null = null
    try {
      const { data } = await supabase.storage.from(a.bucket).createSignedUrl(a.storagePath, 60 * 60)
      signedUrl = data?.signedUrl ?? null
    } catch (e) {
      console.error('[getTicketByNumber] signed URL failed', a.id, e instanceof Error ? e.message : e)
    }
    return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, signedUrl, createdAt: a.createdAt.toISOString() }
  }))

  return {
    id: t.id, number: t.number, title: t.title, type: t.type, status: t.status, priority: t.priority, area: t.area, labels: t.labels,
    tenantId: t.tenantId, tenantName: t.tenantId ? (names.get(t.tenantId) ?? 'Unknown tenant') : null, source: t.source, closeReason: t.closeReason,
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    attachmentCount: t.attachments.length, commentCount: t.events.filter(e => e.kind === 'COMMENT').length,
    description: t.description, createdBy: t.createdBy, externalRef: t.externalRef, closedAt: t.closedAt?.toISOString() ?? null,
    events: t.events.map(e => ({ id: e.id, kind: e.kind, body: e.body, fromValue: e.fromValue, toValue: e.toValue, actor: e.actor, meta: e.meta, createdAt: e.createdAt.toISOString() })),
    attachments,
    reports: t.reports.map(r => ({ id: r.id, surface: r.surface, pageUrl: r.pageUrl, userAgent: r.userAgent, submitterEmail: r.submitterEmail, breadcrumbs: r.breadcrumbs, createdAt: r.createdAt.toISOString() })),
  }
}

export async function findIdByNumber(number: number): Promise<string> {
  const t = await db.ticket.findUnique({ where: { number }, select: { id: true } })
  if (!t) throw new TicketError('Ticket not found.')
  return t.id
}
