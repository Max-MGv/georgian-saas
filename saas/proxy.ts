import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'

interface TenantInfo {
  tenantId: string | null
  brandColor: string
  brandHover: string
}

// Module-level cache: domain → tenant info (persists for the lifetime of the server process)
const tenantCache = new Map<string, TenantInfo>()

async function resolveTenant(host: string): Promise<TenantInfo> {
  // Strip port (e.g. "localhost:3000" → "localhost", "winery2.local:3000" → "winery2.local")
  const domain = host.split(':')[0]
  const isLocal = domain === 'localhost' || domain === '127.0.0.1'
  const cacheKey = isLocal ? '__localhost__' : domain

  if (tenantCache.has(cacheKey)) return tenantCache.get(cacheKey)!

  let tenant = null
  if (isLocal) {
    const defaultId = process.env.DEFAULT_TENANT_ID
    if (defaultId) tenant = await db.tenant.findUnique({ where: { id: defaultId } })
  } else {
    tenant = await db.tenant.findUnique({ where: { domain } })
  }

  const theme = (tenant?.theme as { primaryColor?: string; primaryHover?: string } | null) ?? {}
  const info: TenantInfo = {
    tenantId: tenant?.id ?? process.env.DEFAULT_TENANT_ID ?? null,
    brandColor: theme.primaryColor ?? '#7c1d23',
    brandHover: theme.primaryHover ?? '#9b2429',
  }
  tenantCache.set(cacheKey, info)
  return info
}

export async function proxy(request: NextRequest) {
  // ── Tenant resolution ──────────────────────────────────────────────────────
  const host = request.headers.get('host') ?? ''
  const { tenantId, brandColor, brandHover } = await resolveTenant(host)

  // Clone request headers and inject tenant info
  const requestHeaders = new Headers(request.headers)
  if (tenantId) requestHeaders.set('x-tenant-id', tenantId)
  requestHeaders.set('x-tenant-brand', brandColor)
  requestHeaders.set('x-tenant-brand-hover', brandHover)

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // ── Supabase auth (cookies) ────────────────────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => requestHeaders.set(`cookie`, `${name}=${value}`))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── Admin auth guard ───────────────────────────────────────────────────────
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isLoginPage = request.nextUrl.pathname === '/admin/login'

  if (isAdminRoute && !isLoginPage) {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    // Super admins can access any tenant; tenant admins must match this domain
    const isSuperAdmin = user.app_metadata?.role === 'super_admin'
    if (!isSuperAdmin && user.app_metadata?.tenantId !== tenantId) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  if (isLoginPage && user) {
    const isSuperAdmin = user.app_metadata?.role === 'super_admin'
    const belongsHere = isSuperAdmin || user.app_metadata?.tenantId === tenantId
    if (belongsHere) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
