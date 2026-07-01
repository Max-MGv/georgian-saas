import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'

interface TenantInfo {
  tenantId: string | null
  brandColor: string
  brandHover: string
  logoUrl: string | null
  logoAlt: string
  faviconUrl: string | null
  displayName: string
  cachedAt: number
}

interface PlatformInfo {
  logoUrl: string | null
  logoAlt: string
  cachedAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Module-level cache: domain → tenant info
const tenantCache = new Map<string, TenantInfo>()
let platformCache: PlatformInfo | null = null

async function resolvePlatform(): Promise<PlatformInfo> {
  if (platformCache && Date.now() - platformCache.cachedAt < CACHE_TTL_MS) return platformCache
  const config = await db.platformConfig.findUnique({ where: { id: 'platform' } })
  platformCache = {
    logoUrl: config?.logoUrl ?? null,
    logoAlt: config?.logoAlt ?? '',
    cachedAt: Date.now(),
  }
  return platformCache
}

async function resolveTenant(host: string): Promise<TenantInfo> {
  // Strip port (e.g. "localhost:3000" → "localhost", "winery2.local:3000" → "winery2.local")
  const domain = host.split(':')[0]
  const isLocal = domain === 'localhost' || domain === '127.0.0.1'
  const cacheKey = isLocal ? '__localhost__' : domain

  const cached = tenantCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached

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
    logoUrl: tenant?.logoUrl ?? null,
    logoAlt: tenant?.logoAlt ?? tenant?.displayName ?? tenant?.name ?? '',
    faviconUrl: tenant?.faviconUrl ?? null,
    displayName: tenant?.displayName ?? tenant?.name ?? 'Your Winery',
    cachedAt: Date.now(),
  }
  tenantCache.set(cacheKey, info)
  return info
}

export async function proxy(request: NextRequest) {
  // ── Tenant resolution ──────────────────────────────────────────────────────
  const host = request.headers.get('host') ?? ''
  const [{ tenantId, brandColor, brandHover, logoUrl, logoAlt, faviconUrl, displayName }, platform] =
    await Promise.all([resolveTenant(host), resolvePlatform()])

  // Clone request headers and inject tenant info
  const requestHeaders = new Headers(request.headers)
  if (tenantId) requestHeaders.set('x-tenant-id', tenantId)
  requestHeaders.set('x-tenant-brand', brandColor)
  requestHeaders.set('x-tenant-brand-hover', brandHover)
  requestHeaders.set('x-tenant-name', displayName)
  requestHeaders.set('x-tenant-logo-alt', logoAlt)
  if (logoUrl) requestHeaders.set('x-tenant-logo', logoUrl)
  if (faviconUrl) requestHeaders.set('x-tenant-favicon', faviconUrl)
  if (platform.logoUrl) requestHeaders.set('x-platform-logo', platform.logoUrl)
  requestHeaders.set('x-platform-logo-alt', platform.logoAlt)

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

  // ── Auth guards ────────────────────────────────────────────────────────────
  const isSuperAdmin = user?.app_metadata?.role === 'super_admin'
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isSuperAdminRoute = request.nextUrl.pathname.startsWith('/super-admin')
  const isLoginPage = request.nextUrl.pathname === '/admin/login'

  // /super-admin — only for super_admin users
  if (isSuperAdminRoute) {
    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))
    if (!isSuperAdmin) return NextResponse.redirect(new URL('/admin', request.url))
  }

  // /admin — for super admins and matching tenant admins
  if (isAdminRoute && !isLoginPage) {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    if (!isSuperAdmin && user.app_metadata?.tenantId !== tenantId) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  if (isLoginPage && user) {
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
