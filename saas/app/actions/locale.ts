'use server'
import { cookies } from 'next/headers'

export async function setLocale(locale: string) {
  const store = await cookies()
  store.set('site_locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
}
