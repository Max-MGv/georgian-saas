import { createClient } from '@/lib/supabase/client'
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from '@/lib/demoTenant'

/**
 * Signs the browser in as the demo winery's admin.
 *
 * Three places need this — the role-switcher banner (DemoModeBanner), the front
 * door interstitial (DemoFrontDoor) and the login-page shortcut
 * (DemoLoginShortcut) — so it lives here rather than being copied. The demo
 * admin credentials are deliberately not a secret: anonymous visitors are meant
 * to land in that account. See lib/demoTenant.ts.
 *
 * Client-side only: it drives the browser's own Supabase session, which is what
 * the admin panel reads on the next navigation.
 */
export async function signInAsDemoAdmin(): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_ADMIN_EMAIL,
    password: DEMO_ADMIN_PASSWORD,
  })
  return { ok: !error }
}
