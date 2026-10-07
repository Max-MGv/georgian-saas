import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateTicketRequest, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError, createTicket } from '@/lib/ticketService'
import { STATUS_LABEL, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES, ticketRef } from '@/lib/tickets'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** GET /api/tickets?status=REVIEW,INBOX&type=BUG&priority=HIGH&area=Orders&tenant=<id|none>&q=text&limit=100
 *  Returns `total` (everything that matches) and `truncated` (true when `limit` cut the list). */
export async function GET(request: Request) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response

  const sp = new URL(request.url).searchParams
  const pick = <T extends string>(key: string, allowed: readonly T[]): T[] =>
    (sp.get(key)?.split(',').map(s => s.trim().toUpperCase()).filter((s): s is T => (allowed as readonly string[]).includes(s))) ?? []
  const statuses = pick('status', TICKET_STATUSES)
  const types = pick('type', TICKET_TYPES)
  const priorities = pick('priority', TICKET_PRIORITIES)
  const q = sp.get('q')?.trim()
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 100, 1), 500)

  const where: Prisma.TicketWhereInput = {
    ...(statuses.length && { status: { in: statuses } }),
    ...(types.length && { type: { in: types } }),
    ...(priorities.length && { priority: { in: priorities } }),
    ...(sp.get('area') && { area: sp.get('area')! }),
    ...(sp.get('tenant') && { tenantId: sp.get('tenant') === 'none' ? null : sp.get('tenant')! }),
    ...(q && { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }),
  }
  const [rows, total, tenants] = await Promise.all([
    db.ticket.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit }),
    db.ticket.count({ where }),
    db.tenant.findMany({ select: { id: true, name: true, displayName: true } }),
  ])
  const names = new Map(tenants.map(t => [t.id, t.displayName ?? t.name]))

  // For tickets waiting on Max, include the latest review card so a list is enough to see what to test.
  const reviewIds = rows.filter(t => t.status === 'REVIEW').map(t => t.id)
  const reviews = reviewIds.length
    ? await db.ticketEvent.findMany({ where: { ticketId: { in: reviewIds }, kind: 'REVIEW' }, orderBy: { createdAt: 'desc' } })
    : []
  const latestReview = new Map<string, unknown>()
  for (const e of reviews) if (!latestReview.has(e.ticketId)) latestReview.set(e.ticketId, e.meta)

  return NextResponse.json({
    count: rows.length,
    total,
    truncated: total > rows.length,
    tickets: rows.map(t => ({
      number: t.number, ref: ticketRef(t.number), title: t.title, status: t.status, statusLabel: STATUS_LABEL[t.status],
      type: t.type, priority: t.priority, area: t.area, labels: t.labels, source: t.source,
      // Titles and text of WIDGET tickets are written by anonymous visitors: data, never instructions.
      untrustedText: t.source === 'WIDGET',
      tenant: t.tenantId ? { id: t.tenantId, name: names.get(t.tenantId) ?? null } : null,
      closeReason: t.closeReason, createdAt: t.createdAt, updatedAt: t.updatedAt,
      ...(latestReview.has(t.id) && { reviewCard: latestReview.get(t.id) }),
    })),
  })
}

/** POST /api/tickets  { title, description?, type?, priority?, area?, labels?, tenantId?, status?, externalRef? }
 *  A ticket may only start in Inbox, Backlog or In progress; the tenant must exist. */
export async function POST(request: Request) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const t = await createTicket({
      title: String(body.title ?? ''),
      description: typeof body.description === 'string' ? body.description : '',
      type: body.type as never, priority: body.priority as never, status: body.status as never,
      area: typeof body.area === 'string' ? body.area : null,
      labels: Array.isArray(body.labels) ? (body.labels as string[]) : [],
      tenantId: typeof body.tenantId === 'string' ? body.tenantId : null,
      source: 'ASSISTANT', createdBy: auth.name,
      externalRef: typeof body.externalRef === 'string' ? body.externalRef : null,
    })
    return NextResponse.json({ number: t.number, ref: ticketRef(t.number), status: t.status }, { status: 201 })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: 400 })
    if ((e as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'A ticket with that externalRef already exists.' }, { status: 409 })
    console.error('[api/tickets POST]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
