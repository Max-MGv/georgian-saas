import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getSetting } from '@/app/actions/settings'

export async function getSiteContext() {
  const [supabase, cookieStore, defaultLocale] = await Promise.all([
    createClient(),
    cookies(),
    getSetting('default_locale'),
  ])
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = !!user
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  return { isAdmin, locale }
}
