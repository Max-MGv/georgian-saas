'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/app/actions/locale'

type Props = { locale: string }

export default function LocaleSwitcher({ locale }: Props) {
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
    <div className="flex items-center gap-0.5">
      {(['en', 'ka'] as const).map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span className="mx-1 text-xs" style={{ color: '#c9b99a' }}>|</span>}
          <button
            type="button"
            onClick={() => handleLocale(l)}
            disabled={isPending}
            className="text-xs font-semibold uppercase transition-opacity hover:opacity-70"
            style={{
              color: locale === l ? 'var(--color-brand)' : '#a89070',
              fontWeight: locale === l ? 700 : 400,
            }}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  )
}
