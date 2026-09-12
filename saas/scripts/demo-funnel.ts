/**
 * Prints what visitors actually did on demo.vineworks.ge.
 *
 * The reading half of the demo analytics built 2026-09-12 (Plan-DemoFlowFixes'
 * second deferred item). Deliberately a script and not an admin dashboard: a
 * first version that answers the four questions in a day is worth more than a
 * polished page in a week, and until the numbers are big enough to argue about,
 * a terminal is a fine place to read them.
 *
 * Usage, from `saas/`:
 *   npx tsx scripts/demo-funnel.ts          # last 30 days
 *   npx tsx scripts/demo-funnel.ts 7        # last 7 days
 *
 * Counts are by **session** (one browser tab's visit), not by event: "9 people
 * started the tour" is the useful sentence, "started the tour 14 times" is not.
 * See lib/demoAnalytics.ts for what a session is and why it identifies nobody.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** Which tenant's events to read. Matches NEXT_PUBLIC_DEMO_TENANT_ID. */
const DEMO_TENANT_ID = process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? 'cmtvgl6e60000vl6w9se65t86'

function bar(n: number, of: number, width = 28): string {
  if (of <= 0) return ''
  const filled = Math.round((n / of) * width)
  return '█'.repeat(filled) + '·'.repeat(width - filled)
}

function pct(n: number, of: number): string {
  if (of <= 0) return '  —  '
  return `${((n / of) * 100).toFixed(0).padStart(3)}%`
}

async function main() {
  const days = Number(process.argv[2] ?? 30)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await db.demoEvent.findMany({
    where: { tenantId: DEMO_TENANT_ID, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  })

  if (events.length === 0) {
    console.log(`\nNo demo events in the last ${days} days.`)
    console.log('If that is a surprise, check that the demo tenant id matches this database.\n')
    return
  }

  /** sessions that produced at least one event of this name */
  const sessionsWith = (name: string) =>
    new Set(events.filter(e => e.name === name).map(e => e.sessionId))

  const allSessions = new Set(events.map(e => e.sessionId))
  const visits = allSessions.size

  console.log(`\n  demo.vineworks.ge — last ${days} days`)
  console.log(`  ${events.length} events across ${visits} visits\n`)

  // ── The front door ────────────────────────────────────────────────────────
  console.log('  WHICH PATH THEY TOOK')
  const paths = new Map<string, Set<string>>()
  for (const e of events.filter(e => e.name === 'front_door_path')) {
    const path = String((e.props as { path?: string } | null)?.path ?? 'unknown')
    if (!paths.has(path)) paths.set(path, new Set())
    paths.get(path)!.add(e.sessionId)
  }
  const doorSeen = [...paths.values()].reduce((n, s) => n + s.size, 0)
  for (const [path, sessions] of [...paths.entries()].sort((a, b) => b[1].size - a[1].size)) {
    console.log(`    ${path.padEnd(8)} ${String(sessions.size).padStart(4)}  ${pct(sessions.size, doorSeen)}  ${bar(sessions.size, doorSeen)}`)
  }
  if (doorSeen === 0) console.log('    (nobody reached the front door — it only shows at the site root, once per browser)')

  // ── The tour ──────────────────────────────────────────────────────────────
  const started = sessionsWith('tour_started')
  const completed = sessionsWith('tour_completed')
  const abandoned = sessionsWith('tour_abandoned')
  console.log('\n  THE TOUR')
  console.log(`    started    ${String(started.size).padStart(4)}  ${pct(started.size, visits)} of visits`)
  console.log(`    completed  ${String(completed.size).padStart(4)}  ${pct(completed.size, started.size)} of those who started`)
  console.log(`    abandoned  ${String(abandoned.size).padStart(4)}  ${pct(abandoned.size, started.size)} of those who started`)

  const autoStarts = events.filter(e => e.name === 'tour_started' && (e.props as { auto?: boolean } | null)?.auto === true)
  console.log(`    (${autoStarts.length} of ${events.filter(e => e.name === 'tour_started').length} starts were the automatic one on the "I run a winery" path)`)

  // Where it loses people. The whole reason tour_abandoned carries a step.
  const byStep = new Map<number, number>()
  for (const e of events.filter(e => e.name === 'tour_abandoned')) {
    const step = Number((e.props as { step?: number } | null)?.step ?? 0)
    byStep.set(step, (byStep.get(step) ?? 0) + 1)
  }
  if (byStep.size > 0) {
    console.log('\n  WHERE THE TOUR LOSES THEM')
    const worst = Math.max(...byStep.values())
    for (const [step, n] of [...byStep.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    step ${step}   ${String(n).padStart(4)}  ${bar(n, worst)}`)
    }
  }

  // ── Reaching the things that sell ─────────────────────────────────────────
  const reachedLive = new Set(events.filter(e => e.name === 'page_view' && e.route === '/live').map(e => e.sessionId))
  console.log('\n  DID THEY REACH WHAT SELLS')
  console.log(`    /live (the mirror)   ${String(reachedLive.size).padStart(4)}  ${pct(reachedLive.size, visits)} of visits`)
  console.log(`    opened Explore       ${String(sessionsWith('explore_opened').size).padStart(4)}  ${pct(sessionsWith('explore_opened').size, visits)} of visits`)
  console.log(`    placed a booking     ${String(sessionsWith('booking_placed').size).padStart(4)}  ${pct(sessionsWith('booking_placed').size, visits)} of visits`)

  // ── The two conversion actions ────────────────────────────────────────────
  console.log('\n  THE ASK (step 7)')
  console.log(`    "try it yourself" → /live   ${String(sessionsWith('cta_live_mirror').size).padStart(4)}`)
  console.log(`    emailed max@vineworks.ge    ${String(sessionsWith('cta_email').size).padStart(4)}   ← the only unambiguous lead`)

  // ── What they cared about ─────────────────────────────────────────────────
  const labels = new Map<string, number>()
  for (const e of events.filter(e => e.name === 'capability_clicked')) {
    const label = String((e.props as { label?: string } | null)?.label ?? 'unknown')
    labels.set(label, (labels.get(label) ?? 0) + 1)
  }
  if (labels.size > 0) {
    console.log('\n  WHICH CAPABILITIES THEY PICKED')
    for (const [label, n] of [...labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${String(n).padStart(3)}  ${label}`)
    }
  }

  // ── Most-visited routes ───────────────────────────────────────────────────
  const routes = new Map<string, number>()
  for (const e of events.filter(e => e.name === 'page_view')) {
    routes.set(e.route ?? '?', (routes.get(e.route ?? '?') ?? 0) + 1)
  }
  console.log('\n  MOST-VISITED SCREENS')
  for (const [route, n] of [...routes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(4)}  ${route}`)
  }
  console.log()
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
