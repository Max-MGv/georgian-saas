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
  LINK_KINDS, MAX_LINKS, MAX_OPTION, MAX_OPTIONS, parseSteps, type LiveStage, type TenantVisibleStatus, type TicketLink,
  MAX_COMMENT, MAX_DESCRIPTION, MAX_TITLE, tenantStatusFor, displayRef, TICKET_CLOSE_REASONS, TICKET_PRIORITIES,
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

/** Rewrites what the reporters of this ticket see on My Reports (lib/tickets.ts tenantStatusFor). Call after
 *  anything that changes the status, the close reason or the live-on-production marker. */
async function syncTenantVisibleStatus(tx: Tx, ticketId: string) {
  const t = await tx.ticket.findUnique({ where: { id: ticketId }, select: { status: true, closeReason: true, liveOnProductionAt: true } })
  if (!t) return
  await tx.bugReport.updateMany({ where: { ticketId }, data: { status: tenantStatusFor(t) } })
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
  opts: {
    closeReason?: TicketCloseReason | null; note?: string; kind?: 'STATUS' | 'VERIFIED' | 'SENT_BACK' | 'REVIEW'; meta?: Prisma.InputJsonValue
    /** Closing as Duplicate: the original ticket's number. Its reporters move there (Plan-TicketsV2 3.3). */
    duplicateOf?: number | null
  } = {},
) {
  oneOf(to, TICKET_STATUSES, 'status')
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    let reason: TicketCloseReason | null = null
    if (to === 'CLOSED') {
      if (!opts.closeReason) throw new TicketError('A reason is required to close a ticket.')
      reason = oneOf(opts.closeReason, TICKET_CLOSE_REASONS, 'close reason')
    }
    if (opts.duplicateOf != null) {
      if (reason !== 'DUPLICATE') throw new TicketError('"Duplicate of" only goes with closing as Duplicate.')
      await mergeInto(tx, t, opts.duplicateOf, actor)
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
    await syncTenantVisibleStatus(tx, id)
    return updated
  })
}

/**
 * Closing a ticket as a duplicate of another: its reports (the people who reported it) move to the original, so
 * they see the original's progress instead of "Won't fix"; both tickets get a link to each other and the original's
 * timeline says where the reports came from.
 */
async function mergeInto(tx: Tx, dup: { id: string; number: number; links: Prisma.JsonValue }, originalNumber: number, actor: string) {
  if (!Number.isInteger(originalNumber) || originalNumber < 1) throw new TicketError('"Duplicate of" must be a ticket number.')
  if (originalNumber === dup.number) throw new TicketError('A ticket cannot be a duplicate of itself.')
  const original = await tx.ticket.findUnique({ where: { number: originalNumber } })
  if (!original) throw new TicketError(`T-${originalNumber} does not exist.`)
  if (original.status === 'CLOSED') throw new TicketError(`T-${originalNumber} is closed itself - pick the ticket that is still being worked on.`)
  const moved = await tx.bugReport.updateMany({ where: { ticketId: dup.id }, data: { ticketId: original.id } })
  const dupLinks = Array.isArray(dup.links) ? (dup.links as TicketLink[]) : []
  const origLinks = Array.isArray(original.links) ? (original.links as TicketLink[]) : []
  if (!dupLinks.some(l => l.kind === 'ticket' && l.ref === String(original.number))) {
    await tx.ticket.update({ where: { id: dup.id }, data: { links: [...dupLinks, { kind: 'ticket', ref: String(original.number), label: 'Duplicate of' }] } })
  }
  if (!origLinks.some(l => l.kind === 'ticket' && l.ref === String(dup.number))) {
    await tx.ticket.update({ where: { id: original.id }, data: { links: [...origLinks, { kind: 'ticket', ref: String(dup.number), label: 'Duplicate' }] } })
  }
  await tx.ticketEvent.create({
    data: {
      ticketId: original.id, kind: 'REPORT_LINKED', actor,
      body: `T-${dup.number} was closed as a duplicate of this ticket${moved.count ? ` - ${moved.count} report(s) moved here; their reporters now follow this ticket` : ''}.`,
    },
  })
  await syncTenantVisibleStatus(tx, original.id)
}

export type ReviewCard = { changed: string; howToTest: string; leftOver?: string; commit?: string; steps?: string[]; url?: string }

/**
 * Claude (or Max) says the work is done: ticket moves to "Ready to test" with a structured card.
 * The card lives in `meta` only (the event body stays empty, so it is never stored or shown twice).
 * "How to test" is also kept as separate steps for the checklist (Plan-TicketsV2 2.4). A card with a
 * commit means the work is on `staging` (Rule 0: every change goes there first), so the ticket is marked live there.
 */
export async function postReview(id: string, card: ReviewCard, actor: string) {
  const changed = clean(card.changed, MAX_COMMENT)
  const howToTest = clean(card.howToTest, MAX_COMMENT)
  if (!changed || !howToTest) throw new TicketError('A review card needs "what changed" and "how to test".')
  const given = Array.isArray(card.steps) ? card.steps.map(s => clean(s, 500)).filter(Boolean).slice(0, 20) : []
  const url = card.url ? safeUrl(card.url) : null
  if (card.url && !url) throw new TicketError('The test link must be an http(s) address.')
  const meta = {
    changed, howToTest, steps: given.length ? given : parseSteps(howToTest), ...(url && { url }),
    leftOver: clean(card.leftOver, MAX_COMMENT), commit: clean(card.commit, 100),
  }
  const updated = await changeStatus(id, 'REVIEW', actor, { kind: 'REVIEW', meta })
  if (meta.commit && !updated.liveOnStagingAt) await setLive(id, 'STAGING', actor)
  return updated
}

function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null
  try { const u = new URL(v.trim()); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null } catch { return null }
}

// ── Tickets v2: questions, decisions, links, where-is-it-live (Plan-TicketsV2 Tier 2) ─────────

/** A question that waits for an answer (usually Claude asking Max). Optional one-tap answer buttons. */
export async function askQuestion(id: string, question: string, options: unknown, actor: string) {
  const text = clean(question, MAX_COMMENT)
  if (!text) throw new TicketError('Write the question first.')
  const opts = Array.isArray(options) ? [...new Set(options.map(o => clean(o, MAX_OPTION)).filter(Boolean))].slice(0, MAX_OPTIONS) : []
  await load(db, id)
  return db.$transaction(async tx => {
    const ev = await tx.ticketEvent.create({ data: { ticketId: id, kind: 'QUESTION', body: text, actor, meta: { options: opts } } })
    await tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } })
    return ev
  })
}

/**
 * Answers one open question. The answer is recorded as a decision (who, when). `choice` must be one of the
 * question's buttons; free text can be added to it or stand alone. Answering twice is refused, also when two
 * answers race (the check and the write share a transaction that locks the question row).
 */
export async function answerQuestion(id: string, questionId: string, input: { choice?: string; text?: string }, actor: string) {
  const text = clean(input.text, MAX_COMMENT)
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "TicketEvent" WHERE id = ${questionId} AND "ticketId" = ${id} AND kind = 'QUESTION' FOR UPDATE`
    if (rows.length === 0) throw new TicketError('Question not found.')
    const q = await tx.ticketEvent.findUniqueOrThrow({ where: { id: questionId } })
    const options = ((q.meta as { options?: string[] } | null)?.options) ?? []
    const choice = input.choice ? clean(input.choice, MAX_OPTION) : ''
    if (choice && !options.includes(choice)) throw new TicketError('That is not one of the answers offered.')
    if (!choice && !text) throw new TicketError('Pick an answer or write one.')
    const already = await tx.ticketEvent.findFirst({ where: { ticketId: id, kind: 'ANSWER', meta: { path: ['questionId'], equals: questionId } } })
    if (already) throw new TicketError('This question has already been answered.')
    const body = [choice, text].filter(Boolean).join(' — ')
    const ev = await tx.ticketEvent.create({ data: { ticketId: id, kind: 'ANSWER', body, actor, meta: { questionId, ...(choice && { choice }) } } })
    await tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } })
    return ev
  })
}

/** A decision taken elsewhere (in chat, on a call) written onto the ticket so it is not lost in comments. */
export async function addDecision(id: string, decision: string, actor: string) {
  const text = clean(decision, MAX_COMMENT)
  if (!text) throw new TicketError('Write the decision first.')
  await load(db, id)
  return db.$transaction(async tx => {
    const ev = await tx.ticketEvent.create({ data: { ticketId: id, kind: 'DECISION', body: text, actor } })
    await tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } })
    return ev
  })
}

function cleanLink(raw: unknown): TicketLink {
  const r = (raw ?? {}) as Record<string, unknown>
  const kind = oneOf(r.kind, LINK_KINDS, 'link kind')
  let ref = clean(r.ref, 300)
  if (!ref) throw new TicketError('A link needs something to point at.')
  if (kind === 'url' && !safeUrl(ref)) throw new TicketError('A web link must be an http(s) address.')
  if (kind === 'url') ref = safeUrl(ref)!
  if (kind === 'commit' && !/^[0-9a-f]{7,40}$/i.test(ref)) throw new TicketError('A commit is 7 to 40 hex characters.')
  if (kind === 'ticket') {
    const n = Number(ref.replace(/^t-/i, ''))
    if (!Number.isInteger(n) || n < 1 || n > 2_000_000_000) throw new TicketError('A related ticket is a number like T-12.')
    ref = String(n)
  }
  if (kind === 'bug') ref = ref.replace(/^#/, '')
  const label = clean(r.label, 80)
  return { kind, ref, ...(label && { label }) }
}

const sameLink = (a: TicketLink, b: TicketLink) => a.kind === b.kind && a.ref.toLowerCase() === b.ref.toLowerCase()
const readLinks = (v: unknown): TicketLink[] => (Array.isArray(v) ? (v as TicketLink[]) : [])

/** Adds a link. A related ticket is linked both ways, so each ticket shows the other. */
export async function addLink(id: string, raw: unknown, actor: string) {
  const link = cleanLink(raw)
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    const links = readLinks(t.links)
    if (links.some(l => sameLink(l, link))) return t
    if (links.length >= MAX_LINKS) throw new TicketError(`A ticket can have at most ${MAX_LINKS} links.`)
    if (link.kind === 'ticket') {
      if (Number(link.ref) === t.number) throw new TicketError('A ticket cannot be related to itself.')
      const other = await tx.ticket.findUnique({ where: { number: Number(link.ref) } })
      if (!other) throw new TicketError(`T-${link.ref} does not exist.`)
      const back: TicketLink = { kind: 'ticket', ref: String(t.number) }
      const otherLinks = readLinks(other.links)
      if (!otherLinks.some(l => sameLink(l, back)) && otherLinks.length < MAX_LINKS) {
        await tx.ticket.update({ where: { id: other.id }, data: { links: [...otherLinks, back] } })
        await tx.ticketEvent.create({ data: { ticketId: other.id, kind: 'FIELD', body: 'link added', toValue: `T-${t.number}`, actor } })
      }
    }
    const updated = await tx.ticket.update({ where: { id }, data: { links: [...links, link] } })
    await tx.ticketEvent.create({ data: { ticketId: id, kind: 'FIELD', body: 'link added', toValue: link.kind === 'ticket' ? `T-${link.ref}` : link.ref, actor } })
    return updated
  })
}

export async function removeLink(id: string, raw: unknown, actor: string) {
  const r = (raw ?? {}) as Record<string, unknown>
  const kind = oneOf(r.kind, LINK_KINDS, 'link kind')
  const ref = clean(r.ref, 300).replace(/^t-/i, '')
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    const links = readLinks(t.links)
    const next = links.filter(l => !(l.kind === kind && l.ref.toLowerCase() === ref.toLowerCase()))
    if (next.length === links.length) return t
    if (kind === 'ticket') {
      const other = await tx.ticket.findUnique({ where: { number: Number(ref) } })
      if (other) {
        const otherNext = readLinks(other.links).filter(l => !(l.kind === 'ticket' && l.ref === String(t.number)))
        await tx.ticket.update({ where: { id: other.id }, data: { links: otherNext } })
      }
    }
    const updated = await tx.ticket.update({ where: { id }, data: { links: next } })
    await tx.ticketEvent.create({ data: { ticketId: id, kind: 'FIELD', body: 'link removed', fromValue: kind === 'ticket' ? `T-${ref}` : ref, actor } })
    return updated
  })
}

/** Where the work is live. Production implies staging (everything goes to staging first). */
export async function setLive(id: string, stage: LiveStage, actor: string) {
  oneOf(stage, ['NONE', 'STAGING', 'PRODUCTION'] as const, 'live stage')
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    const now = new Date()
    const data = stage === 'NONE'
      ? { liveOnStagingAt: null, liveOnProductionAt: null }
      : stage === 'STAGING'
        ? { liveOnStagingAt: t.liveOnStagingAt ?? now, liveOnProductionAt: null }
        : { liveOnStagingAt: t.liveOnStagingAt ?? now, liveOnProductionAt: t.liveOnProductionAt ?? now }
    const before: LiveStage = t.liveOnProductionAt ? 'PRODUCTION' : t.liveOnStagingAt ? 'STAGING' : 'NONE'
    if (before === stage) return t
    const updated = await tx.ticket.update({ where: { id }, data })
    await tx.ticketEvent.create({ data: { ticketId: id, kind: 'FIELD', body: 'live changed', fromValue: before, toValue: stage, actor } })
    // Live on production is what turns a reporter's status into "Resolved" (Plan-TicketsV2 3.2).
    await syncTenantVisibleStatus(tx, id)
    return updated
  })
}

// ── Tickets v2 Tier 3: the client side ───────────────────────────────────

/** Our message to the people who reported this ticket - shown on their My Reports page (Plan-TicketsV2 3.1). */
export async function setClientReply(id: string, reply: string, actor: string) {
  const text = clean(reply, MAX_COMMENT)
  return db.$transaction(async tx => {
    const t = await load(tx, id)
    if (text === t.clientReply) return t
    const updated = await tx.ticket.update({ where: { id }, data: { clientReply: text, clientReplyAt: text ? new Date() : null } })
    await tx.ticketEvent.create({ data: { ticketId: id, kind: 'CLIENT_REPLY', body: text, actor } })
    return updated
  })
}

/** Recorded after the "email the reporter" button sent its email(s). The email itself is sent by the caller. */
export async function markClientNotified(id: string, recipients: string[], actor: string) {
  await db.$transaction(async tx => {
    await tx.ticket.update({ where: { id }, data: { clientNotifiedAt: new Date() } })
    await tx.ticketEvent.create({ data: { ticketId: id, kind: 'CLIENT_EMAILED', body: `Emailed ${recipients.length} reporter(s).`, actor } })
  })
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

/**
 * A client closes their own report from My Reports (T-301): they found the answer, or were mistaken.
 * Only the person who sent it, and only while it is still open for them (New / In progress).
 * - Alone on its ticket: the ticket is closed as Obsolete, the timeline says the reporter did it.
 * - Merged with duplicates: the others still need the ticket, so only this report leaves it (closed for this
 *   reporter, noted on the timeline) and the ticket stays open.
 * - A ticket already verified Done (fixed, waiting to go live) is not withdrawable - that work is finished.
 */
export async function withdrawReport(reportId: string, userId: string) {
  const r = await db.bugReport.findFirst({ where: { id: reportId, submitterUserId: userId }, select: { id: true, status: true, ticketId: true } })
  if (!r) throw new TicketError('Report not found.')
  if (r.status !== 'NEW' && r.status !== 'IN_PROGRESS') throw new TicketError('This report is already closed.')
  if (!r.ticketId) {
    await db.bugReport.update({ where: { id: r.id }, data: { status: 'CLOSED' } })
    return
  }
  const t = await load(db, r.ticketId)
  if (t.status === 'DONE') throw new TicketError('This one is already fixed and waiting to go live.')
  const others = await db.bugReport.count({ where: { ticketId: t.id, id: { not: r.id } } })
  if (others === 0) {
    await changeStatus(t.id, 'CLOSED', 'reporter', { closeReason: 'OBSOLETE', note: 'Closed by the reporter from My Reports (found the answer or was mistaken).' })
    return
  }
  await db.$transaction(async tx => {
    await tx.bugReport.update({ where: { id: r.id }, data: { ticketId: null, status: 'CLOSED' } })
    await tx.ticketEvent.create({ data: { ticketId: t.id, kind: 'COMMENT', body: 'One of the reporters closed their own report from My Reports. The ticket stays open for the others.', actor: 'reporter' } })
    await tx.ticket.update({ where: { id: t.id }, data: { updatedAt: new Date() } })
  })
}

export type TicketPatch = {
  title?: string
  description?: string
  analysis?: string
  solution?: string
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
    if (patch.analysis !== undefined) {
      const v = clean(patch.analysis, MAX_DESCRIPTION)
      if (v !== t.analysis) { data.analysis = v; events.push({ body: 'analysis edited' }) }
    }
    if (patch.solution !== undefined) {
      const v = clean(patch.solution, MAX_DESCRIPTION)
      if (v !== t.solution) { data.solution = v; events.push({ body: 'solution edited' }) }
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
  /** "T-42", or "P-12" for a client report copied from production (displayRef). */
  ref: string
  /** Questions still waiting for an answer (Plan-TicketsV2 2.2). */
  openQuestions: number
  hasSolution: boolean
  liveOnStagingAt: string | null
  liveOnProductionAt: string | null
}

async function tenantNames(): Promise<Map<string, string>> {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, displayName: true } })
  return new Map(tenants.map(t => [t.id, t.displayName ?? t.name]))
}

export async function listTickets(): Promise<TicketListItem[]> {
  const [rows, names, qa] = await Promise.all([
    db.ticket.findMany({
      orderBy: { updatedAt: 'desc' },
      omit: { description: true, analysis: true, links: true },
      include: { _count: { select: { attachments: true, events: { where: { kind: 'COMMENT' } } } } },
    }),
    tenantNames(),
    // One answer per question is enforced by answerQuestion, so open = questions - answers.
    db.ticketEvent.groupBy({ by: ['ticketId', 'kind'], where: { kind: { in: ['QUESTION', 'ANSWER'] } }, _count: { _all: true } }),
  ])
  const open = new Map<string, number>()
  for (const g of qa) open.set(g.ticketId, (open.get(g.ticketId) ?? 0) + (g.kind === 'QUESTION' ? 1 : -1) * g._count._all)
  return rows.map(t => ({
    id: t.id, number: t.number, title: t.title, type: t.type, status: t.status, priority: t.priority,
    area: t.area, labels: t.labels, tenantId: t.tenantId, tenantName: t.tenantId ? (names.get(t.tenantId) ?? 'Unknown tenant') : null,
    source: t.source, closeReason: t.closeReason, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    attachmentCount: t._count.attachments, commentCount: t._count.events, ref: displayRef(t),
    openQuestions: Math.max(0, open.get(t.id) ?? 0), hasSolution: t.solution.trim() !== '',
    liveOnStagingAt: t.liveOnStagingAt?.toISOString() ?? null, liveOnProductionAt: t.liveOnProductionAt?.toISOString() ?? null,
  }))
}

export type TicketDetail = TicketListItem & {
  description: string
  analysis: string
  solution: string
  links: TicketLink[]
  /** Titles of the tickets in `links`, so a related ticket shows its name, not just its number. */
  linkedTitles: Record<string, string>
  /** Tier 3: what the reporters see, our message to them, and (production) the copy to staging. */
  clientStatus: TenantVisibleStatus
  clientReply: string
  clientReplyAt: string | null
  clientNotifiedAt: string | null
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

  const links = Array.isArray(t.links) ? (t.links as TicketLink[]) : []
  const relatedNumbers = links.filter(l => l.kind === 'ticket').map(l => Number(l.ref)).filter(n => Number.isInteger(n))
  const related = relatedNumbers.length
    ? await db.ticket.findMany({ where: { number: { in: relatedNumbers } }, select: { number: true, title: true } })
    : []
  const answered = new Set(t.events.filter(e => e.kind === 'ANSWER').map(e => (e.meta as { questionId?: string } | null)?.questionId))

  return {
    id: t.id, number: t.number, title: t.title, type: t.type, status: t.status, priority: t.priority, area: t.area, labels: t.labels,
    tenantId: t.tenantId, tenantName: t.tenantId ? (names.get(t.tenantId) ?? 'Unknown tenant') : null, source: t.source, closeReason: t.closeReason,
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    attachmentCount: t.attachments.length, commentCount: t.events.filter(e => e.kind === 'COMMENT').length,
    openQuestions: t.events.filter(e => e.kind === 'QUESTION' && !answered.has(e.id)).length, hasSolution: t.solution.trim() !== '',
    liveOnStagingAt: t.liveOnStagingAt?.toISOString() ?? null, liveOnProductionAt: t.liveOnProductionAt?.toISOString() ?? null,
    analysis: t.analysis, solution: t.solution, links, linkedTitles: Object.fromEntries(related.map(r => [String(r.number), r.title])),
    ref: displayRef(t), clientStatus: tenantStatusFor(t), clientReply: t.clientReply, clientReplyAt: t.clientReplyAt?.toISOString() ?? null,
    clientNotifiedAt: t.clientNotifiedAt?.toISOString() ?? null,
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
