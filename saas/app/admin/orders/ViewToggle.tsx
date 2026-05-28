'use client'

import { useRouter, usePathname } from 'next/navigation'

const C = { border: '#e0d4c0', muted: '#6b5a47', wine: '#7c1d23', inputBg: '#fffdf9' }

type Props = {
  view: 'table' | 'calendar'
  params: { dateFrom?: string; dateTo?: string; companyId?: string; status?: string }
}

export default function ViewToggle({ view, params }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function switchTo(v: 'table' | 'calendar') {
    const sp = new URLSearchParams()
    if (params.dateFrom)  sp.set('dateFrom',  params.dateFrom)
    if (params.dateTo)    sp.set('dateTo',    params.dateTo)
    if (params.companyId) sp.set('companyId', params.companyId)
    if (params.status)    sp.set('status',    params.status)
    if (v === 'calendar') sp.set('view', 'calendar')
    router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname)
  }

  const base = {
    fontSize: '0.75rem', fontWeight: 500,
    padding: '6px 10px', cursor: 'pointer', transition: 'all 0.1s',
  }

  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <button
        onClick={() => switchTo('table')}
        style={{ ...base, border: 'none', borderRight: `1px solid ${C.border}`,
          backgroundColor: view === 'table' ? C.wine : C.inputBg,
          color: view === 'table' ? '#fff' : C.muted }}
      >
        Table
      </button>
      <button
        onClick={() => switchTo('calendar')}
        style={{ ...base, border: 'none',
          backgroundColor: view === 'calendar' ? C.wine : C.inputBg,
          color: view === 'calendar' ? '#fff' : C.muted }}
      >
        Calendar
      </button>
    </div>
  )
}
