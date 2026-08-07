'use client'

import { useState, useEffect } from 'react'
import { createOnboardingWine } from '@/app/actions/onboarding'
import { adminT } from '@/lib/adminT'
import { C } from './shared'

export type WizardWine = {
  id: string
  name: string
  color: string
  year: number
  price: number
}

type WineType = 'RED' | 'WHITE' | 'AMBER' | 'ROSE'
type Sweetness = 'DRY' | 'SEMI_DRY' | 'SEMI_SWEET' | 'SWEET'

const WINE_TYPES: WineType[] = ['RED', 'WHITE', 'AMBER', 'ROSE']
const SWEETNESS_LEVELS: Sweetness[] = ['DRY', 'SEMI_DRY', 'SEMI_SWEET', 'SWEET']
const TYPE_COLOR: Record<WineType, string> = { RED: '#7c1d23', WHITE: '#e8d9a0', AMBER: '#c97f2b', ROSE: '#e8a0ab' }

export default function WineStep({ locale, wineDetailLevel, initialWines, onDoneChange }: {
  locale: string
  wineDetailLevel: 'PRODUCT' | 'VINTAGE'
  initialWines: WizardWine[]
  onDoneChange?: (done: boolean) => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const isProductMode = wineDetailLevel === 'PRODUCT'

  const [wines, setWines] = useState(initialWines)
  const [name, setName] = useState('')
  const [wineType, setWineType] = useState<WineType>('RED')
  const [sweetness, setSweetness] = useState<Sweetness>('DRY')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    onDoneChange?.(wines.length > 0)
  }, [wines.length, onDoneChange])

  async function handleAdd() {
    if (!name.trim()) { setError(at('onboarding.wines.nameRequired')); return }
    const yearNum = Number(year)
    const priceNum = Number(price)
    if (!Number.isFinite(yearNum) || yearNum < 1900) { setError(at('onboarding.wines.priceRequired')); return }
    if (price.trim() === '' || !Number.isFinite(priceNum) || priceNum <= 0) { setError(at('onboarding.wines.priceRequired')); return }

    setLoading(true)
    setError('')
    const result = await createOnboardingWine(
      isProductMode ? { name, wineType, sweetness } : { name },
      { year: yearNum, price: priceNum }
    )
    if ('error' in result) {
      setError(result.error ?? '')
    } else {
      setWines(prev => [...prev, {
        id: result.wine.id,
        name: result.wine.name,
        color: isProductMode ? TYPE_COLOR[wineType] : TYPE_COLOR.RED,
        year: yearNum,
        price: priceNum,
      }])
      setName('')
      setPrice('')
    }
    setLoading(false)
  }

  return (
    <div>
      <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.wines.title')}</p>
      <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.wines.hint')}</p>

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={at('onboarding.wines.namePlaceholder')}
        className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
        style={{ borderColor: C.border }}
      />

      {isProductMode && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {WINE_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setWineType(t)}
                className="flex items-center gap-1.5 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full border"
                style={wineType === t
                  ? { backgroundColor: TYPE_COLOR[t], borderColor: TYPE_COLOR[t], color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: TYPE_COLOR[t] }} />
                {at(`wines.type.${t}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {SWEETNESS_LEVELS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSweetness(s)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border"
                style={sweetness === s
                  ? { backgroundColor: C.wine, borderColor: C.wine, color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
              >
                {at(`wines.sweetness.${s}`)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex flex-col gap-1" style={{ width: 100 }}>
          <span className="text-xs" style={{ color: C.muted }}>{at('onboarding.wines.yearLabel')}</span>
          <input value={year} onChange={e => setYear(e.target.value)} type="number"
            className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: C.border }} />
        </label>
        <label className="flex flex-col gap-1" style={{ width: 140 }}>
          <span className="text-xs" style={{ color: C.muted }}>{at('onboarding.wines.priceLabel')}</span>
          <input value={price} onChange={e => setPrice(e.target.value)} type="number"
            className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: C.border }} />
        </label>
        <button
          onClick={handleAdd}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
          style={{ backgroundColor: C.wine }}
        >
          {loading ? at('onboarding.wines.adding') : at('onboarding.wines.addButton')}
        </button>
      </div>
      {error && <p className="text-sm mb-4" style={{ color: '#b91c1c' }}>{error}</p>}

      {wines.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
            {at('onboarding.wines.addedList')}
          </p>
          <ul className="space-y-1.5">
            {wines.map(w => (
              <li key={w.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                <span className="flex-1" style={{ color: C.text }}>{w.name}</span>
                <span style={{ color: C.muted }}>{w.year} · {w.price}₾</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
