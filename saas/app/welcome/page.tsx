import { headers } from 'next/headers'
import { Noto_Sans_Georgian } from 'next/font/google'
import WelcomeLanding from '@/components/WelcomeLanding'

/**
 * vineworks.ge — the platform's front page.
 *
 * Reached by `proxy.ts`'s no-tenant rule: any domain that resolves to no tenant
 * sends every public route here. So this is what a stranger sees when they type
 * the company's own address, and until 2026-09-13 it was a three-card
 * placeholder that did not link to the demo. See `components/WelcomeLanding`
 * for what replaced it and why the copy lives in `lib/welcomeCopy`.
 *
 * ── The font, and why it is loaded here and not in the root layout ──
 * The root layout loads Geist with the **latin** subset only. Every Georgian
 * character on this page would fall through to whatever the browser happens to
 * have, which on Windows is a different weight and rhythm from the Latin around
 * it — visible immediately on a page that is Georgian by default. Noto Sans
 * Georgian carries both scripts, so the page stays in one voice when the
 * toggle is flipped.
 *
 * It is scoped to this route rather than added to `app/layout.tsx` because that
 * layout is shared by every tenant's public site and both admin panels; a font
 * added there is a font every one of them downloads.
 */

const georgian = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
})

/**
 * Both languages in one title, because it cannot follow the toggle: this is
 * resolved on the server, and a client-side `document.title` write loses a race
 * with Next's own metadata pass (see the note in `WelcomeLanding`).
 */
export const metadata = {
  title: 'Vineworks — ღვინის მარნის ონლაინ სისტემა · The winery platform',
  description:
    'ჯავშნები, ღვინის შეკვეთები და ადმინ პანელი ქართული მარნებისთვის. Bookings, wine orders and an admin panel for Georgian wineries.',
}

export default async function WelcomePage() {
  const h = await headers()
  const platformLogo = h.get('x-platform-logo')
  const platformLogoAlt = h.get('x-platform-logo-alt') || 'Vineworks'

  return (
    <div className={georgian.className}>
      <WelcomeLanding platformLogo={platformLogo} platformLogoAlt={platformLogoAlt} />
    </div>
  )
}
