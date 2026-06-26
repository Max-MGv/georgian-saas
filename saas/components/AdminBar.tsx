'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/app/actions/locale'

type Props = { locale: string }

export default function AdminBar({ locale }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleLocale(next: string) {
    if (next === locale) return
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <div
      className="w-full flex items-center justify-between px-4 py-1.5 text-xs"
      style={{ backgroundColor: '#2d1010', color: '#f0d0c0', zIndex: 60, position: 'relative' }}
    >
      <span style={{ color: '#c9a090' }}>✎ Edit mode — click any text to edit</span>
      <div className="flex items-center gap-1">
        <span style={{ color: '#c9a090', marginRight: 4 }}>Language:</span>
        {(['en', 'ka'] as const).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => handleLocale(l)}
            disabled={isPending}
            className="px-2 py-0.5 rounded text-xs font-semibold uppercase transition-all"
            style={{
              backgroundColor: locale === l ? 'var(--color-brand)' : 'transparent',
              color: locale === l ? '#fff' : '#c9a090',
              border: `1px solid ${locale === l ? 'var(--color-brand)' : '#5a3030'}`,
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
