import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'

// Module-level cache: domain → tenantId (persists for the lifetime of the server process)
const tenantCache = new Map<string, string | null>()
const db = new PrismaClient()

async function resolveTenantId(host: string): Promise<string | null> {
  // Strip port (e.g. "localhost:3000" → "localhost", "winery2.local:3000" → "winery2.local")
  const domain = host.split(':')[0]

  // Localhost fallback — use DEFAULT_TENANT_ID from env
  if (domain === 'localhost' || domain === '127.0.0.1') {
    return process.env.DEFAULT_TENANT_ID ?? null
  }

  if (tenantCache.has(domain)) return tenantCache.get(domain)!

  const tenant = await db.tenant.findUnique({ where: { domain } })
  const tenantId = tenant?.id ?? process.env.DEFAULT_TENANT_ID ?? null
  tenantCache.set(domain, tenantId)
  return tenantId
}

export async function proxy(request: NextRequest) {
  // ── Tenant resolution ──────────────────────────────────────────────────────
  const host = request.headers.get('host') ?? ''
  const tenantId = await resolveTenantId(host)

  // Clone request headers and inject tenantId
  const requestHeaders = new Headers(request.headers)
  if (tenantId) {
    requestHeaders.set('x-tenant-id', tenantId)
  }

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

  if (isAdminRoute && !isLoginPage && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
