/**
 * Before/after screenshots for release notes (vault/Plan-ReleaseNotes.md). Takes the SAME page, at the same size,
 * from two running copies of the app - the old build ("before") and the new one ("after") - and saves two PNGs,
 * ready for `tix release image <entryId> <file> --kind BEFORE|AFTER --pair N --viewport desktop|phone`.
 *
 *   npx tsx scripts/release-shots.ts --path /admin/settings --before http://localhost:3001 --after http://localhost:3000 \
 *        [--viewport desktop|phone] [--out ./release-shots] [--name settings] [--full] [--wait 1500] [--click "Text to click"]
 *
 * Rules (Max, 2026-10-15): screenshots come from the test / demo winery only, never real customer data - so both
 * copies must run against the DEV database (local servers: the old commit in a separate checkout on another port,
 * the new one as usual). Admin pages log in with the dev super-admin test login from credentials.txt.
 * The bug-report button and the Next.js dev badge are hidden so they do not end up in the picture.
 */
import fs from 'fs'
import path from 'path'
import { chromium, type Page } from '@playwright/test'
import { getSuperAdminCredentials } from '../tests/helpers/credentials'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const has = (name: string) => process.argv.includes(`--${name}`)

const HIDE = `
  [aria-label="Report a bug or feature request"], nextjs-portal, [data-nextjs-toast] { display: none !important; }
  /* Logged in as the super-admin test user: hide the "Platform" button clients never have. */
  a[href="/super-admin"] { display: none !important; }
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
`

async function shot(base: string, file: string, opts: { pagePath: string; phone: boolean; full: boolean; wait: number; click?: string }) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext(opts.phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  if (opts.pagePath.startsWith('/admin') || opts.pagePath.startsWith('/super-admin')) await login(page, base)
  await page.goto(base + opts.pagePath, { waitUntil: 'networkidle', timeout: 150_000 })
  await page.addStyleTag({ content: HIDE })
  if (opts.click) { await page.getByText(opts.click, { exact: false }).first().click(); await page.waitForLoadState('networkidle') }
  await page.waitForTimeout(opts.wait)
  await page.screenshot({ path: file, fullPage: opts.full })
  await browser.close()
}

async function login(page: Page, base: string) {
  const { email, password } = getSuperAdminCredentials()
  await page.goto(`${base}/admin/login`, { timeout: 150_000 })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 90_000 })
}

async function main() {
  const pagePath = arg('path')
  const before = arg('before')
  const after = arg('after')
  if (!pagePath || !after) {
    console.log('usage: release-shots.ts --path /admin/x --after http://localhost:3000 [--before http://localhost:3001] [--viewport phone] [--out dir] [--name x] [--full] [--wait ms] [--click "text"]')
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
  const opts = { pagePath, phone: viewport === 'phone', full: has('full'), wait: Number(arg('wait', '1200')), click: arg('click') }
  if (before) { const f = path.join(out, `${name}-${viewport}-before.png`); await shot(before, f, opts); console.log('before:', f) }
  const f = path.join(out, `${name}-${viewport}-after.png`); await shot(after, f, opts); console.log('after: ', f)
}
main().catch(e => { console.error(e); process.exit(1) })
