/**
 * Before/after screenshots for release notes (vault/Plan-ReleaseNotes.md). Takes the SAME view, at the same size,
 * from two running copies of the app - the old build ("before") and the new one ("after") - and saves two PNGs,
 * ready for `tix release image <entryId> <file> --kind BEFORE|AFTER --pair N --viewport desktop|phone`.
 *
 *   npx tsx scripts/release-shots.ts --path /admin/settings --before http://localhost:3001 --after http://localhost:3002 \
 *        [--viewport desktop|phone] [--focus "Payment details"] [--click "Pack"] [--select "Silk Road Journeys"] [--full]
 *        [--out ./release-shots] [--name settings] [--wait 1500] [--height 760]
 *
 * Readable pictures (Max, 2026-10-15: "unreadable"): shots are taken at 2x pixels; a desktop view is 1100px wide
 * instead of a full monitor; `--focus "text"` crops to the card / section that contains that text (plus a margin)
 * instead of the whole page, so the change is big enough to read; on a phone it scrolls there and keeps the phone
 * frame (`--height` px tall).
 *
 * Rules (Max, 2026-10-15): screenshots come from the test / demo winery only, never real customer data - so both
 * copies must run against the DEV database (local servers). Admin pages log in with the dev super-admin test login.
 * The bug-report button, the Next.js dev badge and the super-admin "Platform" button are hidden.
 */
import fs from 'fs'
import path from 'path'
import { chromium, type Page } from '@playwright/test'
import { getSuperAdminCredentials } from '../tests/helpers/credentials'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const args = (name: string) => process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]] : []))
const has = (name: string) => process.argv.includes(`--${name}`)

const HIDE = `
  [aria-label="Report a bug or feature request"], nextjs-portal, [data-nextjs-toast] { display: none !important; }
  a[href="/super-admin"] { display: none !important; }
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
`

type Opts = { pagePath: string; phone: boolean; full: boolean; wait: number; clicks: string[]; selects: string[]; focus?: string; height: number }

async function shot(base: string, file: string, o: Opts) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: 390, height: o.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1100, height: o.height }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  if (o.pagePath.startsWith('/admin') || o.pagePath.startsWith('/super-admin')) await login(page, base)
  await page.goto(base + o.pagePath, { waitUntil: 'networkidle', timeout: 180_000 })
  await page.addStyleTag({ content: HIDE })
  for (const c of o.clicks) {
    // A tab or button first (its name may carry an icon, e.g. '📦 Pack'), else any text.
    const btn = page.getByRole('button', { name: c }).or(page.getByRole('tab', { name: c })).first()
    if (await btn.count()) await btn.click({ timeout: 30_000 }); else await page.getByText(c, { exact: true }).first().click({ timeout: 30_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
  }
  for (const label of o.selects) {
    // The dropdown that offers this option (e.g. a test company's name), set to it.
    await page.locator('select', { has: page.locator('option', { hasText: label }) }).first().selectOption({ label }, { timeout: 30_000 })
    await page.waitForTimeout(800)
  }
  await page.waitForTimeout(o.wait)
  if (o.focus) {
    const target = page.getByText(o.focus, { exact: false }).first()
    await target.scrollIntoViewIfNeeded({ timeout: 30_000 })
    if (o.phone) {
      // Keep the phone frame: put the focused part near the top of the screen.
      await target.evaluate(el => { const y = el.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo(0, Math.max(0, y)) })
      await page.waitForTimeout(300)
      await page.screenshot({ path: file })
    } else {
      // Crop to the nearest card / section around the text (the first ancestor at least 300px wide and 80px tall).
      const box = await target.evaluate(el => {
        let n: HTMLElement | null = el as HTMLElement
        while (n && n.parentElement) {
          const r = n.getBoundingClientRect()
          if (r.width >= 300 && r.height >= 80) break
          n = n.parentElement
        }
        const r = (n ?? (el as HTMLElement)).getBoundingClientRect()
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
      })
      const m = 16
      await page.screenshot({ path: file, fullPage: true, clip: { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: Math.min(box.width + 2 * m, 1100), height: Math.min(box.height + 2 * m, 1400) } })
    }
  } else {
    await page.screenshot({ path: file, fullPage: o.full })
  }
  await browser.close()
}

async function login(page: Page, base: string) {
  const { email, password } = getSuperAdminCredentials()
  await page.goto(`${base}/admin/login`, { timeout: 180_000 })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 120_000 })
}

async function main() {
  const pagePath = arg('path')
  const before = arg('before')
  const after = arg('after')
  if (!pagePath || !after) {
    console.log('usage: release-shots.ts --path /admin/x --after http://localhost:3002 [--before http://localhost:3001] [--viewport phone] [--focus "text"] [--click "text"]... [--out dir] [--name x] [--full] [--wait ms] [--height px]')
    process.exit(2)
  }
  for (const u of [before, after]) {
    if (u && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) {
      // Production would mean real customers' data in a picture that clients see; staging/production hosts are refused on purpose.
      console.error(`Refusing ${u}: use local servers on the dev database (test / demo winery only).`)
      process.exit(2)
    }
  }
  const out = path.resolve(arg('out', './release-shots')!)
  fs.mkdirSync(out, { recursive: true })
  const name = arg('name', pagePath.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'page')!
  const viewport = arg('viewport', 'desktop') === 'phone' ? 'phone' : 'desktop'
  const o: Opts = {
    pagePath, phone: viewport === 'phone', full: has('full'), wait: Number(arg('wait', '1200')), clicks: args('click'), selects: args('select'), focus: arg('focus'),
    height: Number(arg('height', viewport === 'phone' ? '760' : '820')),
  }
  if (before) { const f = path.join(out, `${name}-${viewport}-before.png`); await shot(before, f, o); console.log('before:', f) }
  const f = path.join(out, `${name}-${viewport}-after.png`); await shot(after, f, o); console.log('after: ', f)
}
main().catch(e => { console.error(e); process.exit(1) })
