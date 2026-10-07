// Reproduction run for vault/BugReports-2026-10-05. Read-only: logs in, navigates, taps, screenshots.
const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/Max/Desktop/claude-projects/georgian-saas'
const { chromium, devices } = require(ROOT + '/saas/node_modules/@playwright/test')
const OUT = ROOT + '/vault/BugReports-2026-10-05/repro'
fs.mkdirSync(OUT, { recursive: true })

function creds() {
  const t = fs.readFileSync(ROOT + '/credentials.txt', 'utf-8')
  const h = t.indexOf('Admin panel login (Supabase Auth — dev project, for staging /admin):')
  const s = t.slice(h, h + 400)
  return { email: s.match(/Email:\s*(\S+)/)[1], password: s.match(/Password:\s*(\S+)/)[1] }
}

const BASE = 'http://localhost:3000'
const log = (k, v) => console.log(k.padEnd(34), typeof v === 'string' ? v : JSON.stringify(v))

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 13'] }) // 390x844, touch, mobile UA
  const page = await ctx.newPage()
  page.setDefaultTimeout(90000)

  const c = creds()
  await page.goto(BASE + '/admin/login')
  await page.locator('input[type="email"]').fill(c.email)
  await page.locator('input[type="password"]').fill(c.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(/\/admin\/orders/, { timeout: 120000 })
  log('login', 'ok ' + page.url())

  // ── 1 + 2: Settings ───────────────────────────────────────────────
  await page.goto(BASE + '/admin/settings', { waitUntil: 'networkidle' })
  const vw = await page.evaluate(() => window.innerWidth)
  log('viewport', vw)
  const rows = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('p')].find(p => /payment details/i.test(p.textContent || ''))
    const card = hdr && hdr.closest('.rounded-xl')
    if (!card) return 'card not found'
    return [...card.querySelectorAll('.divide-y > div')].map(r => {
      const label = r.querySelector('label')
      const box = r.querySelector('.flex-1')
      const btn = r.querySelector('button')
      const f = box && box.firstElementChild
      const R = e => e ? (({ left, right, width }) => ({ l: Math.round(left), r: Math.round(right), w: Math.round(width) }))(e.getBoundingClientRect()) : null
      return { label: label && label.textContent, field: R(f), editBtn: R(btn), rowScrollW: r.scrollWidth, rowClientW: r.clientWidth }
    })
  })
  log('payment rows', rows)
  log('doc scrollWidth', await page.evaluate(() => document.documentElement.scrollWidth))
  const payCard = page.locator('p', { hasText: /payment details/i }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await payCard.scrollIntoViewIfNeeded()
  await payCard.screenshot({ path: OUT + '/1-settings-payment-details.png' })

  // click Edit on the IBAN row to see the edit state too
  const ibanRowBtn = payCard.locator('.divide-y > div').nth(4).locator('button')
  await ibanRowBtn.click()
  await page.waitForTimeout(300)
  await payCard.screenshot({ path: OUT + '/1b-settings-iban-editing.png' })
  const ibanEdit = await page.evaluate(() => {
    const i = document.activeElement
    const r = i.getBoundingClientRect()
    return { tag: i.tagName, right: Math.round(r.right), width: Math.round(r.width), minContent: i.scrollWidth }
  })
  log('iban input while editing', ibanEdit)

  const closed = page.locator('p', { hasText: /^Closed Days$/i }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await closed.scrollIntoViewIfNeeded()
  await closed.screenshot({ path: OUT + '/2-settings-closed-days.png' })
  log('closed days date input', await closed.locator('input[type="date"]').evaluate(i => ({ value: i.value, placeholder: i.getAttribute('placeholder'), ariaLabel: i.getAttribute('aria-label'), id: i.id, hasLabel: !!(i.labels && i.labels.length), w: Math.round(i.getBoundingClientRect().width) })))

  // ── 3: Orders calendar tap ────────────────────────────────────────
  await page.goto(BASE + '/admin/orders?view=calendar', { waitUntil: 'networkidle' })
  const dayBtn = page.locator('button', { has: page.locator('span.rounded-full') }).filter({ hasText: /^\d+\s*\d+$/ }).first()
  const n = await dayBtn.count()
  log('calendar days with bookings', n)
  if (n) {
    const startUrl = page.url()
    const box = await dayBtn.boundingBox()
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    const snaps = []
    for (const ms of [120, 350, 700, 1500]) {
      await page.waitForTimeout(ms === 120 ? 120 : ms - [120, 350, 700, 1500][[120, 350, 700, 1500].indexOf(ms) - 1])
      snaps.push({ t: ms, popover: await page.locator('div.absolute.z-50.rounded-xl').count(), url: page.url().replace(BASE, '') })
    }
    log('start url', startUrl.replace(BASE, ''))
    log('tap timeline (popover count, url)', snaps)
  }

  // ── 4: Wine orders — Pack on phone ────────────────────────────────
  await page.goto(BASE + '/admin/wine-orders', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Pack/ }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: OUT + '/4-wine-pack.png' })
  log('pack layout', await page.evaluate(() => {
    const side = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '300px')
    const main = side && side.previousElementSibling
    const R = e => e ? Math.round(e.getBoundingClientRect().width) : null
    return { viewport: window.innerWidth, sidePanelW: R(side), listColW: R(main), docScrollW: document.documentElement.scrollWidth }
  }))

  // ── 5: Wine orders — delivered + unpaid dims ─────────────────────
  await page.getByRole('button', { name: /^Cards$/ }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Delivered$/ }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: OUT + '/6-wine-cards-delivered.png' })
  log('delivered card opacities', await page.evaluate(() => [...document.querySelectorAll('div.rounded-xl.border.overflow-hidden')].slice(0, 6).map(d => ({ opacity: d.style.opacity, paidMark: /₾✓|Paid/.test(d.innerText), text: d.innerText.split('\n')[0] }))))

  // ── 6: Wine orders — Board + filters ─────────────────────────────
  await page.getByRole('button', { name: /^Board$/ }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Filters/ }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + '/7-wine-board-filters.png' })
  log('board date inputs', await page.evaluate(() => [...document.querySelectorAll('input[type="date"]')].filter(i => i.offsetParent).map(i => ({ value: i.value, title: i.title, ariaLabel: i.getAttribute('aria-label'), labelled: !!(i.labels && i.labels.length) }))))

  // ── 7: Companies list height ─────────────────────────────────────
  await page.goto(BASE + '/admin/companies', { waitUntil: 'networkidle' })
  await page.screenshot({ path: OUT + '/8-companies.png' })
  log('company row heights', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^(Edit|Delete)$/.test((b.textContent || '').trim())).slice(0, 4).map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))))
  log('rows (first 3) heights', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^Edit$/.test((b.textContent || '').trim())).slice(0, 3).map(b => { const r = b.closest('div.border-b, li, div'); let e = b; for (let i = 0; i < 6 && e; i++) { if (e.parentElement && e.parentElement.children.length > 3) break; e = e.parentElement } return e ? Math.round(e.getBoundingClientRect().height) : null })))

  // ── 5b: Orders list (the screenshot-5 card) ──────────────────────
  await page.goto(BASE + '/admin/orders?view=list', { waitUntil: 'networkidle' })
  await page.screenshot({ path: OUT + '/5-orders-list.png' })

  await browser.close()
  console.log('DONE')
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
