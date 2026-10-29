/**
 * T-318 Chunk 3 — link basics: lifetime, "open link", reuse, reconcile window, and (with --flitt) one
 * real call to the Flitt TEST merchant. (Plan-AdminCardPayments §7 Chunk 3.)
 *
 *   Part A  lifetime read back from the reference: `-topup-7d-…` lives 7 days, an older `-topup-…`
 *           10 h; findOpenAdminLink returns the newest link that can still be paid and ignores settled,
 *           reversed, expired, declined and non-admin payments (back-dated rows).
 *   Part B  startTopUpCheckout / startWineTopUpCheckout hand back the open link for the SAME amount
 *           instead of making a second one (no Flitt call on that path).
 *   Part C  the reconcile job's window: guest checkout 7 days, admin link 9, nothing younger than 1 h.
 *   Part D  (--flitt) createCheckout with `lifetime: 604800` + `lang: 'ka'` against the test merchant:
 *           Flitt accepts it. Creates one unpaid test checkout at Flitt; writes nothing to our DB.
 *
 * Throwaway rows on the DEV database (deleted at the end) → needs --write; dry run without it.
 *
 * Run: npx tsx scripts/test-link-basics.ts --write [--flitt]
 */
import { db } from '../lib/db'
import { createCheckout } from '../lib/payments/flitt'
import {
  ADMIN_LINK_LIFETIME_SECONDS, adminLinkExpiresAt, adminLinkLifetimeMs, findOpenAdminLink, isAdminLinkPayment, linkEmailRefusal,
  reconcileCandidateWhere,
} from '../lib/payments/openLink'
import { mintTopUpFlittOrderId, pickCheckoutLocale, startTopUpCheckout, startWineTopUpCheckout } from '../lib/payments/topUpCheckout'
import { seedStageColumns } from '../lib/statusWrite'
import { asTetri } from '../lib/money'

if (!process.argv.includes('--write')) {
  console.log('Dry run (no --write): would create throwaway booking / wine-order / payment rows on the DEV database,')
  console.log('test the open-link helper, link reuse and the reconcile window, then delete them.')
  console.log('Add --write to run it; add --flitt for one real call to the Flitt test merchant.')
  process.exit(0)
}

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-lnk-' + Date.now()
const HOUR = 3600_000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(Date.now() - ms)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  const orderIds: string[] = []
  const wineIds: string[] = []
  try {
    // ── Part A ───────────────────────────────────────────────────────────────────
    console.log('\nPart A — lifetime and the open link\n')
    const minted = mintTopUpFlittOrderId('ord1')
    check('a freshly minted reference is an admin link and tagged 7d', isAdminLinkPayment(minted) && minted.includes('-topup-7d-'), minted)
    check('…and lives 7 days', adminLinkLifetimeMs(minted) === ADMIN_LINK_LIFETIME_SECONDS * 1000)
    check('an old-style reference (no 7d tag) lives 10 h', adminLinkLifetimeMs('ord1-topup-abc-def') === 10 * HOUR)
    check('a guest checkout reference is not an admin link', !isAdminLinkPayment('ord1') && !isAdminLinkPayment(null))
    const base = new Date('2026-10-01T10:00:00Z')
    check('expiry = created + lifetime', adminLinkExpiresAt(base, minted).getTime() === base.getTime() + 7 * DAY)

    const order = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: PREFIX, totalPrice: 20000, paidAt: ago(3 * DAY),
        ...seedStageColumns('booking', 'CONFIRMED', ago(5 * DAY)),
      },
    })
    orderIds.push(order.id)
    const mk = (suffix: string, f: { ref: string; age: number; status?: string; settled?: boolean; reversed?: boolean; amount?: number }) =>
      db.payment.create({
        data: {
          tenantId: TENANT, orderId: order.id, provider: 'flitt', providerPaymentId: `${PREFIX}-${suffix}`,
          checkoutUrl: `https://pay.example.invalid/${suffix}`, flittOrderId: f.ref, amount: f.amount ?? 5000, status: f.status ?? 'created',
          createdAt: ago(f.age), settledAt: f.settled ? ago(f.age) : null, reversedAt: f.reversed ? new Date() : null,
        },
      })
    // 10000 already recorded, plus the settled 5000 link row created below → 15000 of 20000 paid, balance 5000
    await db.payment.create({ data: { tenantId: TENANT, orderId: order.id, provider: 'manual', status: 'recorded', amount: 10000, settledAt: ago(3 * DAY) } })

    check('no payments yet → no open link', (await findOpenAdminLink(db, { orderId: order.id })) === null)
    await mk('expired7', { ref: `${order.id}-topup-7d-aa-bb`, age: 8 * DAY })
    await mk('old10h', { ref: `${order.id}-topup-cc-dd`, age: 11 * HOUR })
    await mk('settled', { ref: `${order.id}-topup-7d-ee-ff`, age: 1 * DAY, settled: true, status: 'approved' })
    await mk('declined', { ref: `${order.id}-topup-7d-gg-hh`, age: 1 * DAY, status: 'declined' })
    await mk('guest', { ref: order.id, age: 1 * HOUR })
    check('expired 7-day link, 11-h-old old-style link, settled, declined and a guest checkout → none is open',
      (await findOpenAdminLink(db, { orderId: order.id })) === null)

    await mk('old2h', { ref: `${order.id}-topup-ii-jj`, age: 2 * HOUR, amount: 4000 })
    const o1 = await findOpenAdminLink(db, { orderId: order.id })
    check('a 2-h-old old-style link is still open (10 h)', o1?.amount === 4000, JSON.stringify(o1))
    await mk('open6d', { ref: `${order.id}-topup-7d-kk-ll`, age: 6 * DAY, amount: 5000 })
    const o2 = await findOpenAdminLink(db, { orderId: order.id })
    check('a 6-day-old 7-day link is open; the newest open link wins (2 h beats 6 d)', o2?.amount === 4000)
    await db.payment.deleteMany({ where: { providerPaymentId: `${PREFIX}-old2h` } })
    const o3 = await findOpenAdminLink(db, { orderId: order.id })
    check('without it, the 6-day-old 7-day link is the open one', o3?.amount === 5000 && o3.expiresAt.getTime() > Date.now())
    await db.payment.updateMany({ where: { providerPaymentId: `${PREFIX}-open6d` }, data: { status: 'processing' } })
    check('a link whose payment is in flight ("processing") still counts as open', (await findOpenAdminLink(db, { orderId: order.id }))?.amount === 5000)

    // ── Part B ───────────────────────────────────────────────────────────────────
    console.log('\nPart B — the same amount again returns the open link (no second one)\n')
    // Two open links of different amounts: asking for the OLDER one's amount must find it, not the newest (blind test, 2026-10-29).
    await mk('newer3000', { ref: `${order.id}-topup-7d-oo-pp`, age: 1 * HOUR, amount: 3000 })
    check('with a newer 3000 link open, the newest open link is the 3000 one', (await findOpenAdminLink(db, { orderId: order.id }))?.amount === 3000)
    check('…but asking for the 5000 amount finds the older 5000 link', (await findOpenAdminLink(db, { orderId: order.id }, { amount: 5000 }))?.amount === 5000)
    check('…and an amount with no open link finds none', (await findOpenAdminLink(db, { orderId: order.id }, { amount: 4242 })) === null)
    const before = await db.payment.count({ where: { orderId: order.id } })
    const again = await startTopUpCheckout({ orderId: order.id, tenantId: TENANT, amount: asTetri(5000), orderDesc: 'zz' })
    check('booking: same amount → the existing link back, marked reused',
      'success' in again && again.reused === true && again.checkoutUrl === 'https://pay.example.invalid/open6d' && again.paymentId.length > 0, JSON.stringify(again))
    check('…with its expiry', 'success' in again && new Date(again.expiresAt).getTime() > Date.now() + 0.9 * DAY)
    check('…and no new Payment row was created', (await db.payment.count({ where: { orderId: order.id } })) === before)

    const wine = await db.wineOrder.create({
      data: {
        tenantId: TENANT, businessName: `ZZ ${PREFIX}`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
        totalAmount: 3000, deliveryFee: 1500, paidAt: ago(3 * DAY), ...seedStageColumns('wineOrder', 'CONFIRMED', ago(5 * DAY)),
      },
    })
    wineIds.push(wine.id)
    await db.payment.create({ data: { tenantId: TENANT, wineOrderId: wine.id, provider: 'manual', status: 'recorded', amount: 3000, settledAt: ago(3 * DAY) } })
    await db.payment.create({
      data: {
        tenantId: TENANT, wineOrderId: wine.id, provider: 'flitt', providerPaymentId: `${PREFIX}-wl`, checkoutUrl: 'https://pay.example.invalid/wl',
        flittOrderId: `${wine.id}-topup-7d-mm-nn`, amount: 1500, status: 'created', createdAt: ago(1 * DAY),
      },
    })
    const wAgain = await startWineTopUpCheckout({ wineOrderId: wine.id, tenantId: TENANT, amount: asTetri(1500), orderDesc: 'zz' })
    check('wine order: same amount → the existing link back, marked reused', 'success' in wAgain && wAgain.reused === true && wAgain.checkoutUrl === 'https://pay.example.invalid/wl', JSON.stringify(wAgain))

    // ── Part B2: language + the email guard (pure rules) ─────────────────────────
    console.log('\nPart B2 — Flitt page language and the link-email guard\n')
    check('winery default ka, admin language never set → Georgian page (the fallback used to be dead)', pickCheckoutLocale({ default_locale: 'ka' }) === 'ka')
    check('admin language stored as en beats a ka winery default', pickCheckoutLocale({ admin_language: 'en', default_locale: 'ka' }) === 'en')
    check('admin language ka → Georgian', pickCheckoutLocale({ admin_language: 'ka' }) === 'ka')
    check('nothing stored → English', pickCheckoutLocale({}) === 'en')
    const L = (age: number, ref: string, settled = false) => ({ settledAt: settled ? new Date() : null, createdAt: ago(age), flittOrderId: ref })
    check('email guard: an open 7-day link may be emailed', linkEmailRefusal(L(1 * DAY, 'x-topup-7d-a-b'), 'CONFIRMED') === null)
    check('email guard: a paid link may not', /already been paid/.test(linkEmailRefusal(L(1 * HOUR, 'x-topup-7d-a-b', true), 'CONFIRMED') ?? ''))
    check('email guard: an expired link may not', /expired/.test(linkEmailRefusal(L(8 * DAY, 'x-topup-7d-a-b'), 'CONFIRMED') ?? ''))
    check('email guard: an old-style link older than 10 h may not', /expired/.test(linkEmailRefusal(L(11 * HOUR, 'x-topup-a-b'), 'CONFIRMED') ?? ''))
    check('email guard: a cancelled order may not', /cancelled/.test(linkEmailRefusal(L(1 * HOUR, 'x-topup-7d-a-b'), 'CANCELLED') ?? ''))

    // ── Part C ───────────────────────────────────────────────────────────────────
    console.log('\nPart C — reconcile window\n')
    const mkR = (suffix: string, ref: string | null, age: number) =>
      db.payment.create({
        data: {
          tenantId: TENANT, orderId: order.id, provider: 'flitt', providerPaymentId: `${PREFIX}-r-${suffix}`, flittOrderId: ref,
          amount: 100, status: 'created', createdAt: ago(age),
        },
      })
    await mkR('guest30m', order.id, 30 * 60_000)
    await mkR('guest3d', order.id, 3 * DAY)
    await mkR('guest8d', order.id, 8 * DAY)
    await mkR('link30m', `${order.id}-topup-7d-x-y`, 30 * 60_000)
    await mkR('link8d', `${order.id}-topup-7d-x-z`, 8 * DAY)
    await mkR('link10d', `${order.id}-topup-7d-x-w`, 10 * DAY)
    const hits = (await db.payment.findMany({ where: { ...reconcileCandidateWhere(Date.now()), providerPaymentId: { startsWith: `${PREFIX}-r-` } } }))
      .map(p => p.providerPaymentId!.replace(`${PREFIX}-r-`, '')).sort()
    check('asked about: guest checkout 3 d and admin link 8 d', JSON.stringify(hits) === JSON.stringify(['guest3d', 'link8d']), JSON.stringify(hits))
    check('left alone: younger than 1 h; guest checkout 8 d (past 7); admin link 10 d (past 9)', !hits.includes('guest30m') && !hits.includes('link30m') && !hits.includes('guest8d') && !hits.includes('link10d'))

    // ── Part D ───────────────────────────────────────────────────────────────────
    if (process.argv.includes('--flitt')) {
      console.log('\nPart D — real call to the Flitt TEST merchant (lifetime 7 d, Georgian)\n')
      const t = await db.tenant.findUnique({ where: { id: TENANT }, select: { flittMerchantId: true, flittSecretKey: true } })
      if (!t?.flittMerchantId || !t.flittSecretKey) throw new Error('Staging Winery has no Flitt credentials')
      const result = await createCheckout({
        merchantId: t.flittMerchantId, password: t.flittSecretKey,
        orderId: `${PREFIX}-flitt-${Date.now().toString(36)}`, amount: asTetri(100), orderDesc: 'T-318 chunk 3 lifetime check (unpaid, ignore)',
        responseUrl: 'https://staging.vineworks.ge/api/payments/flitt/return', serverCallbackUrl: 'https://staging.vineworks.ge/api/payments/flitt/callback',
        lang: 'ka', lifetime: ADMIN_LINK_LIFETIME_SECONDS, merchantData: TENANT,
      })
      check('Flitt accepts lifetime 604800 + lang ka and returns a checkout link', 'checkoutUrl' in result, JSON.stringify(result))
      if ('checkoutUrl' in result) console.log(`  checkout (unpaid, no DB row, open it to see the page): ${result.checkoutUrl}`)
      const tooLong = await createCheckout({
        merchantId: t.flittMerchantId, password: t.flittSecretKey,
        orderId: `${PREFIX}-flitt2-${Date.now().toString(36)}`, amount: asTetri(100), orderDesc: 'T-318 chunk 3 lifetime control (unpaid, ignore)',
        responseUrl: 'https://staging.vineworks.ge/api/payments/flitt/return', serverCallbackUrl: 'https://staging.vineworks.ge/api/payments/flitt/callback',
        lifetime: 69_120_001, merchantData: TENANT,
      })
      console.log(`  (control) a lifetime above Flitt's maximum 69120000 → ${'error' in tooLong ? 'refused: ' + tooLong.error : 'accepted (Flitt does not enforce the maximum?)'}`)
    }
  } finally {
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.wineOrder.deleteMany({ where: { id: { in: wineIds } } })
    const left = await db.payment.count({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    check('cleanup: no throwaway rows remain', left === 0, `payments=${left}`)
  }

  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error('ERROR:', e); process.exitCode = 1 }).finally(() => db.$disconnect())
