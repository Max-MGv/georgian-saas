'use client'

import { useRouter, usePathname } from 'next/navigation'
import { adminT } from '@/lib/adminT'

const C = { border: 'var(--site-border)', muted: 'var(--site-muted)', wine: 'var(--color-brand)', inputBg: 'var(--site-surface)' }

type View = 'table' | 'list' | 'calendar'

type Props = {
  view: View
  params: { dateFrom?: string; dateTo?: string; companyId?: string; status?: string; nationality?: string }
  locale?: string
}

export default function ViewToggle({ view, params, locale = 'en' }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const at = (key: string) => adminT(locale, key)

  function switchTo(v: View) {
    const sp = new URLSearchParams()
    if (params.dateFrom)    sp.set('dateFrom',    params.dateFrom)
    if (params.dateTo)      sp.set('dateTo',      params.dateTo)
    if (params.companyId)   sp.set('companyId',   params.companyId)
    if (params.status)      sp.set('status',      params.status)
    if (params.nationality) sp.set('nationality', params.nationality)
    if (v !== 'table') sp.set('view', v)
    router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname)
  }

  const base = {
    fontSize: '0.75rem', fontWeight: 500,
    padding: '6px 10px', cursor: 'pointer', transition: 'all 0.1s',
  }

  const options: { v: View; labelKey: string }[] = [
    { v: 'table', labelKey: 'orders.view.table' },
    { v: 'list', labelKey: 'orders.view.list' },
    { v: 'calendar', labelKey: 'orders.view.calendar' },
  ]

  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {options.map((opt, i) => (
        <button
          key={opt.v}
          onClick={() => switchTo(opt.v)}
          className="min-h-10 md:min-h-0"
          style={{ ...base, border: 'none', borderRight: i < options.length - 1 ? `1px solid ${C.border}` : 'none',
            backgroundColor: view === opt.v ? C.wine : C.inputBg,
            color: view === opt.v ? '#fff' : C.muted }}
        >
          {at(opt.labelKey)}
        </button>
      ))}
    </div>
  )
}
