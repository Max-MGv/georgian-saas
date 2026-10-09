import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { resolveTenantTheme } from '@/lib/themePresets'
import { LOGO_MONOGRAMS, monogramSvg } from '@/lib/touchIconMonograms'

/**
 * The tenant's apple-touch-icon — what iOS shows for a Safari bookmark or a
 * home-screen shortcut. Linked from app/layout.tsx (public site) and
 * app/admin/layout.tsx (`?v=admin`).
 *
 * Per tenant, from the proxy's x-tenant-* headers: colours from the tenant's theme,
 * the mark from LOGO_MONOGRAMS when its logo has one, its initials otherwise. The
 * admin variant is inverted and labelled so the two bookmarks can't be confused.
 *
 * No `.png` in the path on purpose: proxy.ts skips image extensions, and without
 * the proxy there would be no tenant headers here.
 */
export async function GET(req: NextRequest) {
  const admin = req.nextUrl.searchParams.get('v') === 'admin'
  const themeHeader = req.headers.get('x-tenant-theme')
  const theme = themeHeader
    ? (JSON.parse(decodeURIComponent(themeHeader)) as ReturnType<typeof resolveTenantTheme>)
    : resolveTenantTheme(null)
  const monogram = LOGO_MONOGRAMS[req.headers.get('x-tenant-logo') ?? '']
  const initials = (req.headers.get('x-tenant-name') ?? '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || 'W'

  const bg = admin ? theme.brand : theme.bg
  const fg = admin ? theme.bg : theme.brand
  const markWidth = admin ? 96 : 108
  const [, , markW = 1, markH = 1] = (monogram?.viewBox ?? '0 0 1 1').split(' ').map(Number)

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: bg, position: 'relative' }}>
        {!admin && (
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12, bottom: 12, border: `2px solid ${fg}`, borderRadius: 30, opacity: 0.35, display: 'flex' }} />
        )}
        {monogram ? (
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders <img>, not next/image
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(monogramSvg(monogram, fg))}`}
            width={markWidth}
            height={Math.round((markWidth * markH) / markW)}
            alt=""
          />
        ) : (
          <div style={{ display: 'flex', fontSize: admin ? 64 : 76, fontWeight: 700, color: fg, letterSpacing: 2 }}>{initials}</div>
        )}
        {admin && (
          <div style={{ display: 'flex', marginTop: 14, fontSize: 19, fontWeight: 700, letterSpacing: 5, color: fg }}>ADMIN</div>
        )}
      </div>
    ),
    {
      width: 180,
      height: 180,
      // Per host on Vercel's CDN, so each tenant caches its own; a theme change shows within a day.
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}
