'use client'

import { useState, useEffect } from 'react'
import { createMenuItem } from '@/app/actions/menuItems'
import { createMasterclassItem } from '@/app/actions/masterclassItems'
import { setOffersFoodAddons, setOffersMasterclasses } from '@/app/actions/onboarding'
import { UNIT_LABELS, MASTERCLASS_UNITS, type MasterclassUnit } from '@/lib/masterclass'
import { adminT } from '@/lib/adminT'
import { C, SmallField } from './shared'

export type WizardMenuItem = { id: string; name: string; type: 'VEGETABLE' | 'MEAT' }
export type WizardMasterclassItem = { id: string; name: string; unitType: MasterclassUnit; pricePerUnit: number }

/**
 * Two independent qualifying questions stacked in one step — food add-ons and
 * masterclasses — each mirroring CompaniesStep.tsx's yes/no qualifying pattern
 * and added-list UX exactly, just against MenuItem/MasterclassItem instead of
 * Company. Kept as one file rather than two because the two categories share
 * nothing but the pattern, and the step as a whole is what OnboardingWizard
 * mounts/tracks.
 */
export default function BookingDetailsStep({
  locale,
  initialOffersFoodAddons,
  initialOffersMasterclasses,
  initialMenuItems,
  initialMasterclassItems,
  onDoneChange,
}: {
  locale: string
  initialOffersFoodAddons: 'yes' | 'no' | null
  initialOffersMasterclasses: 'yes' | 'no' | null
  initialMenuItems: WizardMenuItem[]
  initialMasterclassItems: WizardMasterclassItem[]
  onDoneChange?: (done: boolean) => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)

  const [foodAnswer, setFoodAnswer] = useState(initialOffersFoodAddons)
  const [menuItems, setMenuItems] = useState(initialMenuItems)
  const [masterclassAnswer, setMasterclassAnswer] = useState(initialOffersMasterclasses)
  const [masterclassItems, setMasterclassItems] = useState(initialMasterclassItems)

  useEffect(() => {
    const foodDone = foodAnswer === 'no' || (foodAnswer === 'yes' && menuItems.length > 0)
    const masterclassDone = masterclassAnswer === 'no' || (masterclassAnswer === 'yes' && masterclassItems.length > 0)
    onDoneChange?.(foodDone && masterclassDone)
  }, [foodAnswer, menuItems.length, masterclassAnswer, masterclassItems.length, onDoneChange])

  return (
    <div>
      <FoodAddonsSection
        at={at}
        answer={foodAnswer}
        onAnswer={setFoodAnswer}
        items={menuItems}
        onItemAdded={item => setMenuItems(prev => [...prev, item])}
      />
      <div className="my-6 border-t" style={{ borderColor: C.border }} />
      <MasterclassesSection
        at={at}
        answer={masterclassAnswer}
        onAnswer={setMasterclassAnswer}
        items={masterclassItems}
        onItemAdded={item => setMasterclassItems(prev => [...prev, item])}
      />
    </div>
  )
}

type At = (key: string, vars?: Record<string, string | number>) => string

function FoodAddonsSection({ at, answer, onAnswer, items, onItemAdded }: {
  at: At
  answer: 'yes' | 'no' | null
  onAnswer: (v: 'yes' | 'no') => void
  items: WizardMenuItem[]
  onItemAdded: (item: WizardMenuItem) => void
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'VEGETABLE' | 'MEAT'>('VEGETABLE')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function answer_(value: 'yes' | 'no') {
    setSaving(true)
    await setOffersFoodAddons(value)
    onAnswer(value)
    setSaving(false)
  }

  async function handleAdd() {
    if (!name.trim()) { setError(at('onboarding.bookingDetails.nameRequired')); return }
    setLoading(true)
    setError('')
    const created = await createMenuItem({ name, type })
    onItemAdded({ id: created.id, name: created.name, type: created.type as 'VEGETABLE' | 'MEAT' })
    setName('')
    setLoading(false)
  }

  return (
    <div>
      {answer === null && (
        <div>
          <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.bookingDetails.foodQuestion')}</p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.bookingDetails.foodHint')}</p>
          <div className="flex gap-3">
            <button
              disabled={saving}
              onClick={() => answer_('yes')}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.wine }}
            >
              {at('onboarding.bookingDetails.qualifyYes')}
            </button>
            <button
              disabled={saving}
              onClick={() => answer_('no')}
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
              style={{ borderColor: C.border, color: C.text }}
            >
              {at('onboarding.bookingDetails.qualifyNo')}
            </button>
          </div>
        </div>
      )}

      {answer === 'no' && (
        <div>
          <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.bookingDetails.skippedTitle')}</p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.bookingDetails.foodSkippedBody')}</p>
          <button onClick={() => answer_('yes')} className="text-sm underline" style={{ color: C.muted }}>
            {at('onboarding.companies.changeAnswer')}
          </button>
        </div>
      )}

      {answer === 'yes' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium" style={{ color: C.text }}>{at('onboarding.bookingDetails.foodAddTitle')}</p>
            <button onClick={() => answer_('no')} className="text-xs underline" style={{ color: C.muted }}>
              {at('onboarding.companies.changeAnswer')}
            </button>
          </div>
          <p className="text-sm mb-3" style={{ color: C.muted }}>{at('onboarding.bookingDetails.foodAddHint')}</p>

          <div className="flex flex-wrap items-end gap-2 mb-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={at('onboarding.bookingDetails.dishNamePlaceholder')}
              className="px-3 py-2 rounded-lg border text-sm flex-1 min-w-[160px]"
              style={{ borderColor: C.border }}
            />
            <div className="flex gap-1.5">
              {(['VEGETABLE', 'MEAT'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="text-xs font-medium px-3 py-2 rounded-lg border"
                  style={type === t
                    ? { backgroundColor: C.wine, borderColor: C.wine, color: 'white' }
                    : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
                >
                  {at(t === 'VEGETABLE' ? 'menuItems.sections.vegetable' : 'menuItems.sections.meat')}
                </button>
              ))}
            </div>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: C.wine }}
            >
              {loading ? at('onboarding.companies.adding') : at('menuItems.addDish')}
            </button>
          </div>
          {error && <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{error}</p>}

          {items.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                {at('onboarding.companies.addedList')}
              </p>
              <ul className="space-y-1.5">
                {items.map(i => (
                  <li key={i.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }}>
                    <span className="flex-1" style={{ color: C.text }}>{i.name}</span>
                    <span style={{ color: C.muted }}>{at(i.type === 'VEGETABLE' ? 'menuItems.sections.vegetable' : 'menuItems.sections.meat')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MasterclassesSection({ at, answer, onAnswer, items, onItemAdded }: {
  at: At
  answer: 'yes' | 'no' | null
  onAnswer: (v: 'yes' | 'no') => void
  items: WizardMasterclassItem[]
  onItemAdded: (item: WizardMasterclassItem) => void
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [unitType, setUnitType] = useState<MasterclassUnit>('PER_PERSON')
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function answer_(value: 'yes' | 'no') {
    setSaving(true)
    await setOffersMasterclasses(value)
    onAnswer(value)
    setSaving(false)
  }

  async function handleAdd() {
    if (!name.trim()) { setError(at('onboarding.bookingDetails.nameRequired')); return }
    const priceNum = Number(price)
    if (price.trim() === '' || !Number.isFinite(priceNum) || priceNum <= 0) {
      setError(at('onboarding.bookingDetails.priceRequired'))
      return
    }
    setLoading(true)
    setError('')
    const created = await createMasterclassItem({ name, unitType, pricePerUnit: priceNum })
    onItemAdded({ id: created.id, name: created.name, unitType: created.unitType as MasterclassUnit, pricePerUnit: created.pricePerUnit })
    setName('')
    setPrice('')
    setLoading(false)
  }

  return (
    <div>
      {answer === null && (
        <div>
          <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.bookingDetails.masterclassQuestion')}</p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.bookingDetails.masterclassHint')}</p>
          <div className="flex gap-3">
            <button
              disabled={saving}
              onClick={() => answer_('yes')}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.wine }}
            >
              {at('onboarding.bookingDetails.qualifyYes')}
            </button>
            <button
              disabled={saving}
              onClick={() => answer_('no')}
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
              style={{ borderColor: C.border, color: C.text }}
            >
              {at('onboarding.bookingDetails.qualifyNo')}
            </button>
          </div>
        </div>
      )}

      {answer === 'no' && (
        <div>
          <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.bookingDetails.skippedTitle')}</p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.bookingDetails.masterclassSkippedBody')}</p>
          <button onClick={() => answer_('yes')} className="text-sm underline" style={{ color: C.muted }}>
            {at('onboarding.companies.changeAnswer')}
          </button>
        </div>
      )}

      {answer === 'yes' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium" style={{ color: C.text }}>{at('onboarding.bookingDetails.masterclassAddTitle')}</p>
            <button onClick={() => answer_('no')} className="text-xs underline" style={{ color: C.muted }}>
              {at('onboarding.companies.changeAnswer')}
            </button>
          </div>
          <p className="text-sm mb-3" style={{ color: C.muted }}>{at('onboarding.bookingDetails.masterclassAddHint')}</p>

          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={at('onboarding.bookingDetails.masterclassNamePlaceholder')}
            className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
            style={{ borderColor: C.border }}
          />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {MASTERCLASS_UNITS.map(u => (
              <button
                key={u}
                type="button"
                onClick={() => setUnitType(u)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border"
                style={unitType === u
                  ? { backgroundColor: C.wine, borderColor: C.wine, color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
              >
                {UNIT_LABELS[u]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <SmallField label={at('onboarding.bookingDetails.priceLabel')} value={price} onChange={setPrice} width={140} />
            <button
              onClick={handleAdd}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: C.wine }}
            >
              {loading ? at('onboarding.companies.adding') : at('onboarding.bookingDetails.addMasterclassButton')}
            </button>
          </div>
          {error && <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{error}</p>}

          {items.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                {at('onboarding.companies.addedList')}
              </p>
              <ul className="space-y-1.5">
                {items.map(i => (
                  <li key={i.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }}>
                    <span className="flex-1" style={{ color: C.text }}>{i.name}</span>
                    <span style={{ color: C.muted }}>{UNIT_LABELS[i.unitType]} · {i.pricePerUnit}₾</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
