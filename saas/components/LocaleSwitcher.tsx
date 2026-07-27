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
    <div
      className="flex items-center gap-0.5 rounded-full border transition-opacity"
      style={{ borderColor: 'var(--site-border)', padding: 2, opacity: isPending ? 0.5 : 1 }}
    >
      {(['en', 'ka'] as const).map(l => (
        <button
          key={l}
          type="button"
          onClick={() => handleLocale(l)}
          disabled={isPending}
          className="text-xs font-semibold uppercase rounded-full transition-colors"
          style={{
            padding: '3px 9px',
            backgroundColor: locale === l ? 'var(--color-brand)' : 'transparent',
            color: locale === l ? 'var(--site-surface)' : 'var(--site-secondary)',
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
