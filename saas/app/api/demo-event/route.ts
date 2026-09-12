import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withTenantDb } from '@/lib/db'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { DEMO_EVENT_NAMES, type DemoEventName } from '@/lib/demoEventNames'

/**
 * Records one thing a visitor did on demo.vineworks.ge.
 *
 * Built 2026-09-12, the second deferred item of [[DemoSite/Plan-DemoFlowFixes]].
 * Every conversion figure that shaped this demo came from a vendor's blog rather
 * than from the site itself (Research-DemoPatterns.md's Caveat); this is what
 * replaces those guesses with counts.
 *
 * ## Why a route handler and not a server action
 *
 * It was a server action first, and that was wrong in a way that only showed up
 * under test: **Next runs server actions from one client strictly in sequence.**
 * An analytics write — a cold module compile, then a transaction to a database
 * in eu-central-1 — therefore sat in front of the *visitor's own* next action.
 * The front door's "I run a winery" sign-in stalled behind a page-view counter,
 * which is exactly the failure analytics must never cause: the measurement
 * changing the thing it measures. A plain `fetch` to a route handler is
 * unordered, concurrent, and can be sent with `keepalive` so it survives the
 * navigation that triggered it.
 *
 * ## The tenant gate lives here, on the server
 *
 * Each call site is already a demo-only component, but that is a convention and
 * conventions drift — a shared component picking this up later, or a demo
 * component being reused, would silently start recording a real winery's
 * visitors. The tenant comes from the request's own `x-tenant-id` header (set by
 * `proxy.ts`, which runs on `/api` too), and anything that is not the demo
 * tenant is dropped. The body cannot name a tenant; there is no value a caller
 * could send that would make this write for somebody else.
 *
 * ## What it deliberately is not
 *
 * **Not authenticated, and it cannot be.** The visitors it measures are
 * anonymous strangers. That means someone who finds the endpoint can post junk
 * events for the demo tenant. The damage is bounded on purpose — the event name
 * must be one of a fixed vocabulary, `props` is capped, no other table is
 * touched, and the only casualty of abuse is the accuracy of a sales demo's own
 * counters. That is an acceptable trade for a public sandbox; it would not be
 * for anything a winery relies on, which is why this table holds nothing else.
 *
 * **Not a mail path.** MaintenanceNotes §11's suppression of outbound mail for
 * the demo tenant is load-bearing, and nothing here goes near `sendTenantEmail`.
 * This is instrumentation, not notification.
 *
 * Always answers 204, whatever happened. A browser beacon has nothing useful to
 * do with an error, and a demo that surfaced a failed counter to a prospect
 * would be worse than one that quietly lost a count.
 */

export const dynamic = 'force-dynamic'

/** Cap on `props`, so a bad (or hostile) call site cannot write an essay. */
const MAX_PROPS_BYTES = 500
const MAX_ROUTE_LENGTH = 200
const MAX_SESSION_LENGTH = 64

export async function POST(request: Request) {
  try {
    // The gate. Not a convenience check — the only thing standing between this
    // table and a real winery's visitors.
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId || tenantId !== DEMO_TENANT_ID) return new NextResponse(null, { status: 204 })

    const body = await request.json() as {
      name?: unknown
      props?: unknown
      route?: unknown
      sessionId?: unknown
    }

    const name = typeof body.name === 'string' ? body.name : ''
    if (!DEMO_EVENT_NAMES.includes(name as DemoEventName)) return new NextResponse(null, { status: 204 })

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    if (!sessionId || sessionId.length > MAX_SESSION_LENGTH) return new NextResponse(null, { status: 204 })

    let props: Prisma.InputJsonValue | undefined
    if (body.props && typeof body.props === 'object' && !Array.isArray(body.props)) {
      const serialised = JSON.stringify(body.props)
      // Oversized props are dropped, but the event itself is still recorded — a
      // counted event with no detail beats an uncounted one.
      if (serialised.length <= MAX_PROPS_BYTES) props = body.props as Prisma.InputJsonValue
    }

    const route = typeof body.route === 'string' ? body.route.slice(0, MAX_ROUTE_LENGTH) : null

    await withTenantDb(tenantId, tx =>
      tx.demoEvent.create({
        data: { tenantId, name, props: props ?? undefined, route, sessionId },
      }),
    )
  } catch {
    // Deliberately silent — see the note above.
  }
  return new NextResponse(null, { status: 204 })
}
