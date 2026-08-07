'use client'

import { useState, useEffect } from 'react'
import { createOnboardingCompany, addIndividualsPriceTier, setWorksWithCompanies, type OnboardingStatus, type OnboardingTier } from '@/app/actions/onboarding'
import { createPrice } from '@/app/actions/prices'
import { adminT } from '@/lib/adminT'
import { C, SmallField } from './shared'
import HelpHint from '@/components/HelpHint'

export type Company = {
  id: string
  name: string
  accessCode: string | null
  prices: { pricePerPerson: number }[]
  contactInfoSet: boolean
}

function buildTierFromFields(mode: 'simple' | 'detailed', fields: {
  price: string
  minGuests: string
  maxGuests: string
  tastingPP: string
  tastingLunchPP: string
  flatFee: string
}): OnboardingTier | null {
  if (mode === 'simple') {
    const priceNum = Number(fields.price)
    if (fields.price.trim() === '' || !Number.isFinite(priceNum) || priceNum <= 0) return null
    return { minGuests: 1, maxGuests: 999, pricePerPerson: priceNum, tastingLunchPricePerPerson: priceNum, registrationPrice: 0 }
  }
  const min = Number(fields.minGuests)
  const max = Number(fields.maxGuests)
  const tasting = Number(fields.tastingPP)
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null
  if (fields.tastingPP.trim() === '' || !Number.isFinite(tasting) || tasting <= 0) return null
  return {
    minGuests: min,
    maxGuests: max,
    pricePerPerson: tasting,
    tastingLunchPricePerPerson: fields.tastingLunchPP.trim() === '' ? tasting : Number(fields.tastingLunchPP),
    registrationPrice: fields.flatFee.trim() === '' ? 0 : Number(fields.flatFee),
  }
}

// Shows the actual rate, not just how many tiers exist — "2 tiers" confirms
// pricing was set but not whether it's sane; the lowest tier's amount lets an
// admin sanity-check at a glance, same data already loaded client-side.
function tierSummary(at: (key: string, vars?: Record<string, string | number>) => string, prices: { pricePerPerson: number }[]): string | null {
  if (prices.length === 0) return null
  const lowest = Math.min(...prices.map(p => p.pricePerPerson))
  return prices.length === 1
    ? at('onboarding.companies.tierSummaryOne', { amount: lowest })
    : at('onboarding.companies.tierSummaryMany', { n: prices.length, amount: lowest })
}

function statusHint(at: (key: string) => string, company: Company): string {
  return company.contactInfoSet
    ? at('onboarding.companies.statusHintWithContact')
    : at('onboarding.companies.statusHintNoContact')
}

export default function CompaniesStep({
  locale,
  initialStatus,
  initialCompanies,
  individualsCompanyId,
  initialIndividualsPrices,
  bookingModuleOn,
  wineOrdersModuleOn,
  onDoneChange,
}: {
  locale: string
  initialStatus: OnboardingStatus
  initialCompanies: Company[]
  individualsCompanyId: string
  initialIndividualsPrices: { pricePerPerson: number }[]
  bookingModuleOn: boolean
  wineOrdersModuleOn: boolean
  onDoneChange?: (done: boolean) => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)

  function priceSummary(prices: { pricePerPerson: number }[]): string | null {
    return tierSummary(at, prices)
  }

  const [worksWithCompanies, setWorks] = useState(initialStatus.worksWithCompanies)
  const [companies, setCompanies] = useState(initialCompanies)
  const [individualsPrices, setIndividualsPrices] = useState(initialIndividualsPrices)
  const individualsSet = individualsPrices.length > 0

  useEffect(() => {
    const companiesStepDone = worksWithCompanies === 'no' || (worksWithCompanies === 'yes' && companies.length > 0)
    onDoneChange?.(companiesStepDone && individualsSet)
  }, [worksWithCompanies, companies.length, individualsSet, onDoneChange])

  // Only ask when both modules are on — with just one, the answer is obvious
  // and asking would just be extra clicking. Defaults to Bookings when both
  // are available, matching this step's pre-existing single-module behavior.
  const askModules = bookingModuleOn && wineOrdersModuleOn
  const [addAsBooking, setAddAsBooking] = useState(bookingModuleOn || !wineOrdersModuleOn)
  const [addAsWineOrder, setAddAsWineOrder] = useState(!bookingModuleOn && wineOrdersModuleOn)

  const [mode, setMode] = useState<'simple' | 'detailed'>('simple')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [minGuests, setMinGuests] = useState('1')
  const [maxGuests, setMaxGuests] = useState('10')
  const [tastingPP, setTastingPP] = useState('')
  const [tastingLunchPP, setTastingLunchPP] = useState('')
  const [flatFee, setFlatFee] = useState('0')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingAnswer, setSavingAnswer] = useState(false)
  const [addingTierFor, setAddingTierFor] = useState<string | null>(null)

  async function answer(value: 'yes' | 'no') {
    setSavingAnswer(true)
    await setWorksWithCompanies(value)
    setWorks(value)
    setSavingAnswer(false)
  }

  async function handleAdd() {
    if (!name.trim()) { setError(at('onboarding.companies.nameRequired')); return }
    if (askModules && !addAsBooking && !addAsWineOrder) { setError(at('onboarding.companies.moduleRequired')); return }
    const tier = buildTierFromFields(mode, { price, minGuests, maxGuests, tastingPP, tastingLunchPP, flatFee })
    if (!tier) { setError(at('onboarding.companies.priceRequired')); return }

    setLoading(true)
    setError('')
    const result = await createOnboardingCompany(name, tier, {
      isBookingCompany: addAsBooking,
      isWineOrderCompany: addAsWineOrder,
    })
    if ('error' in result) {
      setError(result.error ?? '')
    } else {
      setCompanies(prev => [...prev, {
        ...result.company,
        prices: [{ pricePerPerson: tier.pricePerPerson }],
        contactInfoSet: false,
      }])
      setName('')
      setPrice('')
      setMinGuests('1'); setMaxGuests('10'); setTastingPP(''); setTastingLunchPP(''); setFlatFee('0')
    }
    setLoading(false)
  }

  return (
    <div>
      <IndividualsPricingSection
        locale={locale}
        companyId={individualsCompanyId}
        prices={individualsPrices}
        onPricesChange={setIndividualsPrices}
      />

      <div className={individualsSet ? undefined : 'opacity-40 pointer-events-none select-none'}>
      {!individualsSet && (
        <p className="text-xs mb-4" style={{ color: C.muted }}>{at('onboarding.individuals.gateNote')}</p>
      )}

      {worksWithCompanies === null && (
        <div>
          <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.companies.qualifyQuestion')}</p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.companies.qualifyHint')}</p>
          <div className="flex gap-3">
            <button
              disabled={savingAnswer}
              onClick={() => answer('yes')}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.wine }}
            >
              {at('onboarding.companies.qualifyYes')}
            </button>
            <button
              disabled={savingAnswer}
              onClick={() => answer('no')}
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
              style={{ borderColor: C.border, color: C.text }}
            >
              {at('onboarding.companies.qualifyNo')}
            </button>
          </div>
        </div>
      )}

      {worksWithCompanies === 'no' && (
        <div>
          <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.companies.skippedTitle')}</p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.companies.skippedBody')}</p>
          <button onClick={() => answer('yes')} className="text-sm underline" style={{ color: C.muted }}>
            {at('onboarding.companies.changeAnswer')}
          </button>
        </div>
      )}

      {worksWithCompanies === 'yes' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium" style={{ color: C.text }}>{at('onboarding.companies.addTitle')}</p>
            <button onClick={() => answer('no')} className="text-xs underline" style={{ color: C.muted }}>
              {at('onboarding.companies.changeAnswer')}
            </button>
          </div>
          <p className="text-sm mb-3" style={{ color: C.muted }}>{at('onboarding.companies.addHint')}</p>

          <div className="flex gap-1 mb-3">
            {(['simple', 'detailed'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border"
                style={mode === m
                  ? { backgroundColor: C.wine, borderColor: C.wine, color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
              >
                {at(m === 'simple' ? 'onboarding.companies.modeSimple' : 'onboarding.companies.modeDetailed')}
              </button>
            ))}
          </div>
          <p className="text-xs mb-4" style={{ color: C.muted }}>
            {at(mode === 'simple' ? 'onboarding.companies.priceHint' : 'onboarding.companies.detailedHint')}
          </p>

          <div className="mb-4">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={at('onboarding.companies.namePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
              style={{ borderColor: C.border }}
            />

            {askModules && (
              <div className="mb-3">
                <p className="text-xs mb-1.5" style={{ color: C.muted }}>{at('onboarding.companies.moduleHint')}</p>
                <div className="flex gap-1.5">
                {([
                  { key: 'booking' as const, active: addAsBooking, toggle: () => setAddAsBooking(v => !v), label: 'companies.editPanel.bookings' },
                  { key: 'wineOrder' as const, active: addAsWineOrder, toggle: () => setAddAsWineOrder(v => !v), label: 'nav.wineOrders' },
                ]).map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={m.toggle}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border"
                    style={m.active
                      ? { backgroundColor: C.wine, borderColor: C.wine, color: 'white' }
                      : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
                  >
                    {at(m.label)}
                  </button>
                ))}
                </div>
              </div>
            )}

            {mode === 'simple' ? (
              <div className="flex flex-wrap items-end gap-2">
                <SmallField label={at('onboarding.companies.pricePlaceholder')} value={price} onChange={setPrice} width={180} />
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
                  style={{ backgroundColor: C.wine }}
                >
                  {loading ? at('onboarding.companies.adding') : at('onboarding.companies.addButton')}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <SmallField label={at('companies.priceForm.minGuests')} value={minGuests} onChange={setMinGuests} width={72} />
                <SmallField label={at('companies.priceForm.maxGuests')} value={maxGuests} onChange={setMaxGuests} width={72} />
                <SmallField label={at('companies.priceForm.tastingPP')} value={tastingPP} onChange={setTastingPP} width={110} />
                <SmallField label={at('companies.priceForm.tastingLunchPP')} value={tastingLunchPP} onChange={setTastingLunchPP} width={140} />
                <SmallField label={at('companies.priceForm.flatFee')} value={flatFee} onChange={setFlatFee} width={120} />
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
                  style={{ backgroundColor: C.wine }}
                >
                  {loading ? at('onboarding.companies.adding') : at('onboarding.companies.addButton')}
                </button>
              </div>
            )}
          </div>
          {error && <p className="text-sm mb-4" style={{ color: '#b91c1c' }}>{error}</p>}

          {companies.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                {at('onboarding.companies.addedList')}
              </p>
              <ul className="space-y-1.5">
                {companies.map(c => (
                  <li
                    key={c.id}
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: C.border }}
                  >
                    <div className="flex items-center justify-between text-sm gap-3">
                      <span style={{ color: C.text }}>{c.name}</span>
                      <span className="flex items-center gap-2.5 flex-shrink-0 flex-wrap justify-end">
                        {priceSummary(c.prices) ? (
                          <span className="text-xs font-medium" style={{ color: C.muted }}>{priceSummary(c.prices)}</span>
                        ) : (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: '#fff7ed', color: '#b45309', border: '1px solid #fdba74' }}
                          >
                            ⚠ {at('onboarding.companies.noPricingSet')}
                          </span>
                        )}
                        <HelpHint text={statusHint(at, c)} />
                        {mode === 'detailed' && (
                          <button
                            onClick={() => setAddingTierFor(addingTierFor === c.id ? null : c.id)}
                            className="text-xs underline"
                            style={{ color: C.muted }}
                          >
                            {at('onboarding.companies.addAnotherTier')}
                          </button>
                        )}
                      </span>
                    </div>

                    {addingTierFor === c.id && (
                      <AddTierInline
                        companyId={c.id}
                        locale={locale}
                        onAdded={newTier => {
                          setCompanies(prev => prev.map(co =>
                            co.id === c.id ? { ...co, prices: [...co.prices, { pricePerPerson: newTier.pricePerPerson }] } : co
                          ))
                          setAddingTierFor(null)
                        }}
                        onCancel={() => setAddingTierFor(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {companies.length > 0 && (
            <p className="text-sm" style={{ color: C.muted }}>{at('onboarding.companies.doneBody')}</p>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

function IndividualsPricingSection({ locale, companyId, prices, onPricesChange }: {
  locale: string
  companyId: string
  prices: { pricePerPerson: number }[]
  onPricesChange: (prices: { pricePerPerson: number }[]) => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple')
  const [price, setPrice] = useState('')
  const [minGuests, setMinGuests] = useState('1')
  const [maxGuests, setMaxGuests] = useState('10')
  const [tastingPP, setTastingPP] = useState('')
  const [tastingLunchPP, setTastingLunchPP] = useState('')
  const [flatFee, setFlatFee] = useState('0')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [addingTier, setAddingTier] = useState(false)

  const isSet = prices.length > 0
  const summary = tierSummary(at, prices)

  async function handleSave() {
    const tier = buildTierFromFields(mode, { price, minGuests, maxGuests, tastingPP, tastingLunchPP, flatFee })
    if (!tier) { setError(at('onboarding.companies.priceRequired')); return }
    setLoading(true)
    setError('')
    const result = await addIndividualsPriceTier(tier)
    if ('error' in result) {
      setError(result.error ?? '')
    } else {
      onPricesChange([...prices, { pricePerPerson: tier.pricePerPerson }])
      setPrice('')
      setMinGuests('1'); setMaxGuests('10'); setTastingPP(''); setTastingLunchPP(''); setFlatFee('0')
    }
    setLoading(false)
  }

  return (
    <div className="mb-6 pb-6 border-b" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-2 mb-1">
        <p className="font-medium" style={{ color: C.text }}>{at('onboarding.individuals.title')}</p>
        {isSet && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
            ✓ {at('onboarding.individuals.set')}
          </span>
        )}
      </div>
      <p className="text-sm mb-3" style={{ color: C.muted }}>{at('onboarding.individuals.hint')}</p>

      {isSet ? (
        <div>
          <p className="text-sm" style={{ color: C.muted }}>
            {summary}
            {' — '}
            <button onClick={() => setAddingTier(a => !a)} className="underline" style={{ color: C.muted }}>
              {at('onboarding.companies.addAnotherTier')}
            </button>
          </p>
          {addingTier && (
            <AddTierInline
              companyId={companyId}
              locale={locale}
              onAdded={newTier => {
                onPricesChange([...prices, { pricePerPerson: newTier.pricePerPerson }])
                setAddingTier(false)
              }}
              onCancel={() => setAddingTier(false)}
            />
          )}
        </div>
      ) : (
        <div>
          <div className="flex gap-1 mb-3">
            {(['simple', 'detailed'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border"
                style={mode === m
                  ? { backgroundColor: C.wine, borderColor: C.wine, color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: C.border, color: C.muted }}
              >
                {at(m === 'simple' ? 'onboarding.companies.modeSimple' : 'onboarding.companies.modeDetailed')}
              </button>
            ))}
          </div>

          {mode === 'simple' ? (
            <div className="flex flex-wrap items-end gap-2">
              <SmallField label={at('onboarding.companies.pricePlaceholder')} value={price} onChange={setPrice} width={180} />
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
                style={{ backgroundColor: C.wine }}
              >
                {loading ? at('onboarding.companies.adding') : at('settings.common.save')}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <SmallField label={at('companies.priceForm.minGuests')} value={minGuests} onChange={setMinGuests} width={72} />
              <SmallField label={at('companies.priceForm.maxGuests')} value={maxGuests} onChange={setMaxGuests} width={72} />
              <SmallField label={at('companies.priceForm.tastingPP')} value={tastingPP} onChange={setTastingPP} width={110} />
              <SmallField label={at('companies.priceForm.tastingLunchPP')} value={tastingLunchPP} onChange={setTastingLunchPP} width={140} />
              <SmallField label={at('companies.priceForm.flatFee')} value={flatFee} onChange={setFlatFee} width={120} />
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
                style={{ backgroundColor: C.wine }}
              >
                {loading ? at('onboarding.companies.adding') : at('settings.common.save')}
              </button>
            </div>
          )}
          {error && <p className="text-sm mt-2" style={{ color: '#b91c1c' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

function AddTierInline({ companyId, locale, onAdded, onCancel }: {
  companyId: string
  locale: string
  onAdded: (tier: { pricePerPerson: number }) => void
  onCancel: () => void
}) {
  const at = (key: string) => adminT(locale, key)
  const [minGuests, setMinGuests] = useState('11')
  const [maxGuests, setMaxGuests] = useState('20')
  const [tastingPP, setTastingPP] = useState('')
  const [tastingLunchPP, setTastingLunchPP] = useState('')
  const [flatFee, setFlatFee] = useState('0')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    const min = Number(minGuests)
    const max = Number(maxGuests)
    const tasting = Number(tastingPP)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || tastingPP.trim() === '' || !Number.isFinite(tasting) || tasting <= 0) {
      setError(at('onboarding.companies.priceRequired'))
      return
    }
    setLoading(true)
    setError('')
    const result = await createPrice({
      companyId,
      minGuests: min,
      maxGuests: max,
      pricePerPerson: tasting,
      tastingLunchPricePerPerson: tastingLunchPP.trim() === '' ? tasting : Number(tastingLunchPP),
      registrationPrice: flatFee.trim() === '' ? 0 : Number(flatFee),
    })
    if ('error' in result) {
      setError(result.error ?? '')
    } else {
      onAdded({ pricePerPerson: tasting })
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
      <SmallField label={at('companies.priceForm.minGuests')} value={minGuests} onChange={setMinGuests} width={72} />
      <SmallField label={at('companies.priceForm.maxGuests')} value={maxGuests} onChange={setMaxGuests} width={72} />
      <SmallField label={at('companies.priceForm.tastingPP')} value={tastingPP} onChange={setTastingPP} width={110} />
      <SmallField label={at('companies.priceForm.tastingLunchPP')} value={tastingLunchPP} onChange={setTastingLunchPP} width={140} />
      <SmallField label={at('companies.priceForm.flatFee')} value={flatFee} onChange={setFlatFee} width={120} />
      <div className="flex gap-2 pb-0.5">
        <button
          onClick={handleSave}
          disabled={loading}
          className="text-xs px-3 py-2 rounded-lg font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: C.wine }}
        >
          {at('settings.common.save')}
        </button>
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>
          {at('settings.common.cancel')}
        </button>
      </div>
      {error && <p className="text-xs w-full" style={{ color: '#b91c1c' }}>{error}</p>}
    </div>
  )
}
