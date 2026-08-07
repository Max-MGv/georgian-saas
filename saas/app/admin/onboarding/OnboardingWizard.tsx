'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building, Wine as WineIcon, UtensilsCrossed, CreditCard, Phone, Image as ImageIcon, Rocket, type LucideIcon } from 'lucide-react'
import { adminT } from '@/lib/adminT'
import type { OnboardingStatus } from '@/app/actions/onboarding'
import StepNav from './steps/StepNav'
import { C, type StepKey } from './steps/shared'
import CompaniesStep, { type Company } from './steps/CompaniesStep'
import WineStep, { type WizardWine } from './steps/WineStep'
import BookingDetailsStep, { type WizardMenuItem, type WizardMasterclassItem } from './steps/BookingDetailsStep'
import PaymentInfoStep, { type PaymentFields } from './steps/PaymentInfoStep'
import ContactInfoStep from './steps/ContactInfoStep'
import ContentPhotosStep from './steps/ContentPhotosStep'
import ReviewStep from './steps/ReviewStep'

export type OnboardingData = {
  locale: string
  status: OnboardingStatus
  tenantName: string
  bookingOn: boolean
  wineOrdersOn: boolean
  enhancedBookingOn: boolean
  wineDetailLevel: 'PRODUCT' | 'VINTAGE'
  companies: Company[]
  individualsCompanyId: string
  individualsPrices: { pricePerPerson: number }[]
  wines: WizardWine[]
  menuItems: WizardMenuItem[]
  masterclassItems: WizardMasterclassItem[]
  payment: PaymentFields
  onlinePaymentModuleOn: boolean
  onlinePayment: { merchantId: string; secretKeySet: boolean } | null
  contact: { phone: string; email: string; address: string }
  mapsEmbedUrl: string
  logoUrl: string | null
  logoAlt: string | null
  heroBgPath: string | null
}

const STEP_DEFS: { key: StepKey; icon: LucideIcon; labelKey: string }[] = [
  { key: 'companies', icon: Building, labelKey: 'onboarding.step.companies' },
  { key: 'wines', icon: WineIcon, labelKey: 'onboarding.step.wines' },
  { key: 'bookingDetails', icon: UtensilsCrossed, labelKey: 'onboarding.step.bookingDetails' },
  { key: 'payment', icon: CreditCard, labelKey: 'onboarding.step.payment' },
  { key: 'contact', icon: Phone, labelKey: 'onboarding.step.contact' },
  { key: 'photos', icon: ImageIcon, labelKey: 'onboarding.step.photos' },
  { key: 'review', icon: Rocket, labelKey: 'onboarding.step.review' },
]

export default function OnboardingWizard({ data }: { data: OnboardingData }) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(data.locale, key, vars)
  const router = useRouter()
  const searchParams = useSearchParams()

  const steps = useMemo(() => STEP_DEFS.filter(s =>
    (s.key !== 'wines' || data.wineOrdersOn)
    && (s.key !== 'bookingDetails' || data.enhancedBookingOn)
  ), [data.wineOrdersOn, data.enhancedBookingOn])

  const [doneMap, setDoneMap] = useState<Record<StepKey, boolean>>({
    companies: data.status.companiesStepDone && data.status.individualsPricingSet,
    wines: data.status.wineStepDone,
    bookingDetails: data.status.bookingDetailsStepDone,
    payment: data.status.paymentInfoStepDone,
    contact: data.status.contactInfoStepDone,
    photos: data.status.contentPhotosStepDone,
    review: data.status.launched,
  })

  const stepOverride = searchParams.get('step') as StepKey | null
  const overrideIndex = stepOverride ? steps.findIndex(s => s.key === stepOverride) : -1

  const initialIndex = useMemo(() => {
    if (overrideIndex !== -1) return overrideIndex
    const firstNotDone = steps.findIndex(s => !doneMap[s.key])
    return firstNotDone === -1 ? steps.length - 1 : firstNotDone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [furthestIndex, setFurthestIndex] = useState(initialIndex)

  const goToIndex = useCallback((idx: number) => {
    setCurrentIndex(idx)
    setFurthestIndex(f => Math.max(f, idx))
  }, [])

  const goToKey = useCallback((key: StepKey) => {
    const idx = steps.findIndex(s => s.key === key)
    if (idx !== -1) goToIndex(idx)
  }, [steps, goToIndex])

  const handleSelect = useCallback((key: StepKey) => {
    const idx = steps.findIndex(s => s.key === key)
    if (idx !== -1 && idx <= furthestIndex) goToIndex(idx)
  }, [steps, furthestIndex, goToIndex])

  function setDone(key: StepKey, done: boolean) {
    setDoneMap(prev => (prev[key] === done ? prev : { ...prev, [key]: done }))
  }

  const currentKey = steps[currentIndex].key
  const isLastStep = currentIndex === steps.length - 1

  function goNext() {
    if (currentIndex < steps.length - 1) goToIndex(currentIndex + 1)
  }

  return (
    <div className="rounded-xl border p-6" style={{ borderColor: C.border, backgroundColor: C.bg }}>
      <StepNav
        steps={steps.map(s => ({ key: s.key, icon: s.icon, label: at(s.labelKey), done: doneMap[s.key] }))}
        current={currentKey}
        furthestIndex={furthestIndex}
        onSelect={handleSelect}
      />

      {/* Every step stays mounted once reached, visibility toggled via CSS —
          conditionally rendering (unmount on navigate away) would reset each
          step's local state to its initial server-fetched props on return,
          silently hiding items a user had just added even though they're
          genuinely saved. Steps not yet reached skip mounting entirely
          (no reason to run their effects before the user gets there). */}
      {furthestIndex >= steps.findIndex(s => s.key === 'companies') && (
        <div style={{ display: currentKey === 'companies' ? undefined : 'none' }}>
          <CompaniesStep
            locale={data.locale}
            initialStatus={data.status}
            initialCompanies={data.companies}
            individualsCompanyId={data.individualsCompanyId}
            initialIndividualsPrices={data.individualsPrices}
            bookingModuleOn={data.bookingOn}
            wineOrdersModuleOn={data.wineOrdersOn}
            onDoneChange={done => setDone('companies', done)}
          />
        </div>
      )}
      {steps.some(s => s.key === 'wines') && furthestIndex >= steps.findIndex(s => s.key === 'wines') && (
        <div style={{ display: currentKey === 'wines' ? undefined : 'none' }}>
          <WineStep
            locale={data.locale}
            wineDetailLevel={data.wineDetailLevel}
            initialWines={data.wines}
            onDoneChange={done => setDone('wines', done)}
          />
        </div>
      )}
      {steps.some(s => s.key === 'bookingDetails') && furthestIndex >= steps.findIndex(s => s.key === 'bookingDetails') && (
        <div style={{ display: currentKey === 'bookingDetails' ? undefined : 'none' }}>
          <BookingDetailsStep
            locale={data.locale}
            initialOffersFoodAddons={data.status.offersFoodAddons}
            initialOffersMasterclasses={data.status.offersMasterclasses}
            initialMenuItems={data.menuItems}
            initialMasterclassItems={data.masterclassItems}
            onDoneChange={done => setDone('bookingDetails', done)}
          />
        </div>
      )}
      {furthestIndex >= steps.findIndex(s => s.key === 'payment') && (
        <div style={{ display: currentKey === 'payment' ? undefined : 'none' }}>
          <PaymentInfoStep
            locale={data.locale}
            initialPayment={data.payment}
            onlinePaymentModuleOn={data.onlinePaymentModuleOn}
            initialOnlinePayment={data.onlinePayment}
            onDoneChange={done => setDone('payment', done)}
          />
        </div>
      )}
      {furthestIndex >= steps.findIndex(s => s.key === 'contact') && (
        <div style={{ display: currentKey === 'contact' ? undefined : 'none' }}>
          <ContactInfoStep
            locale={data.locale}
            initialContact={data.contact}
            initialMapsEmbedUrl={data.mapsEmbedUrl}
            onDoneChange={done => setDone('contact', done)}
          />
        </div>
      )}
      {furthestIndex >= steps.findIndex(s => s.key === 'photos') && (
        <div style={{ display: currentKey === 'photos' ? undefined : 'none' }}>
          <ContentPhotosStep
            locale={data.locale}
            tenantName={data.tenantName}
            initialLogoUrl={data.logoUrl}
            initialHeroBgPath={data.heroBgPath}
            onDoneChange={done => setDone('photos', done)}
          />
        </div>
      )}
      {furthestIndex >= steps.findIndex(s => s.key === 'review') && (
        <div style={{ display: currentKey === 'review' ? undefined : 'none' }}>
          <ReviewStep
            locale={data.locale}
            items={steps.map(s => ({ key: s.key, labelKey: s.labelKey, done: doneMap[s.key] }))}
            onJump={goToKey}
            initialLaunchedAt={data.status.launchedAt}
            readyToLaunch={doneMap.companies && (data.wineOrdersOn ? doneMap.wines : true) && doneMap.payment}
            onLaunched={() => setDone('review', true)}
          />
        </div>
      )}

      <div className="mt-8 pt-6 border-t flex items-center justify-between gap-3" style={{ borderColor: C.border }}>
        <a href="/admin/companies" className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.text }}>
          {at('onboarding.finishForNow')}
        </a>
        {!isLastStep && (
          <button
            onClick={goNext}
            className="px-5 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: C.wine }}
          >
            {at('onboarding.continue')} →
          </button>
        )}
      </div>
    </div>
  )
}
