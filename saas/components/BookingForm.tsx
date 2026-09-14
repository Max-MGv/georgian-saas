'use client'

// MAINTENANCE: If you add, remove, or rename any label in this form, mirror the change in
// FIELDS.form inside saas/app/admin/content/ContentClient.tsx so the admin panel stays in sync.
// See vault/MaintenanceNotes.md §1 for full details.

import { useState, useEffect, useRef } from 'react'
import { createBooking, type BookingFormData } from '@/app/actions/createBooking'
import { verifyCompanyCode, findCompanyByCode } from '@/app/actions/companies'
import { notifyNewCompany } from '@/app/actions/notifyNewCompany'
import { comboRatePerPerson, findTier } from '@/lib/pricingUtils'
import { t } from '@/lib/t'
import DateInput from '@/components/DateInput'
import NewCompanyPopupView from '@/components/NewCompanyPopupView'
import { buildNewCompanyLabels } from '@/lib/newCompanyPopupLabels'
import AccessCodePopupView from '@/components/AccessCodePopupView'
import { buildAccessCodeLabels } from '@/lib/accessCodePopupLabels'
import BookingConfirmPopupView, { type ReviewRow } from '@/components/BookingConfirmPopupView'
import { dispatchDemoBooked } from '@/lib/demoEvents'
import { parseWeeklyHours, getDayHours, generateHourlySlots, getLeadHours, minBookableInstant, slotMeetsLeadTime, getVisitDurationMinutes, addMinutesToSlot } from '@/lib/bookingHours'

type Price = {
  id: string; minGuests: number; maxGuests: number
  pricePerPerson: number; tastingLunchPricePerPerson: number; registrationPrice: number
}
type Company = {
  id: string; name: string; prices: Price[]; accessCode: string | null
  contactName: string | null; contactPhone: string | null; contactEmail: string | null
  // Per-company payment override (#148). null = follow the Companies section
  // default; true = always skip; false = always require. Label-only here —
  // the real gate is shouldTakePayment(), server-side, in createBooking.ts.
  skipPayment?: boolean | null
}
type MenuItem = { id: string; name: string; type: string }
type MasterclassItem = { id: string; name: string; unitType: string; pricePerUnit: number }

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', faint: 'var(--site-secondary)', wine: 'var(--color-brand)', inputBg: 'var(--site-surface)',
}

// The theme system (lib/themePresets.ts) has no dedicated success/error tokens —
// only bg/surface/text/muted/border/secondary/brand. Blending the semantic hue
// with the theme's own surface/border/text via color-mix() keeps status colors
// recognizable as green/red while automatically adapting to any preset's actual
// tone, light or dark, rather than sitting as a fixed light-mode color that looks
// pasted-in on a dark theme.
const STATUS = {
  successBg: 'color-mix(in srgb, #16a34a 12%, var(--site-surface))',
  successBorder: 'color-mix(in srgb, #16a34a 45%, var(--site-border))',
  successText: 'color-mix(in srgb, #16a34a 65%, var(--site-text))',
  errorBg: 'color-mix(in srgb, #dc2626 10%, var(--site-surface))',
  errorBorder: 'color-mix(in srgb, #dc2626 40%, var(--site-border))',
  errorText: 'color-mix(in srgb, #dc2626 65%, var(--site-text))',
}


type Props = {
  locale?: string
  companies: Company[]
  showCompanyPrice: boolean
  enhancedEnabled?: boolean
  hideCompanyDropdown?: boolean
  menuItems?: MenuItem[]
  masterclassItems?: MasterclassItem[]
  minGuestsTasting?: number
  minGuestsTastingLunch?: number
  blockedDates?: string[]
  /** Booking lead time + working hours/days (#178) — see lib/bookingHours.ts. */
  bookingLeadSplit?: boolean
  bookingLeadHours?: number
  bookingLeadHoursTasting?: number
  bookingLeadHoursTastingLunch?: number
  workingHoursCustom?: boolean
  workingHoursOpen?: string
  workingHoursClose?: string
  workingHoursDaysJson?: string
  /** Expected visit length, minutes, by visit type (#184) — shown on the confirm sheet as "~{hours} hrs · finish around {end}". Settings `visit_duration_tasting` / `visit_duration_tasting_lunch`. */
  visitDurationTasting?: number
  visitDurationTastingLunch?: number
  formContent?: Record<string, string>
  /** On-site UI copy (SiteContent section 'messages', 'onsite_*' keys) — see MaintenanceNotes §23. */
  messagesContent?: Record<string, string>
  displayPriceTasting?: number | null
  displayPriceLunch?: number | null
  individualPrices?: Price[]
  /**
   * Drives the submit button's "…& Pay" label and whether it redirects to
   * checkout when the server returns a checkoutUrl. The server decides
   * authoritatively (shouldTakePayment(), in createBooking.ts) — these props
   * only keep the button honest, computed per Feature 148's precedence:
   *  - `configured`: module on + credentials set — the hard-block half.
   *    Nothing, not even a company's `skipPayment: false` override, can make
   *    the label say "pay" when this is false.
   *  - `individual`/`company`: the Individuals/Companies section defaults
   *    (`configured && paymentEnabledIndividuals/Companies`), used when the
   *    selected company (if any) has no override (`skipPayment === null`).
   */
  onlinePaymentEnabled?: { configured: boolean; individual: boolean; company: boolean }
}

const DEFAULT_PAYMENT_READY = { configured: false, individual: false, company: false }

export default function BookingForm({ locale = 'en', companies, showCompanyPrice, enhancedEnabled, hideCompanyDropdown = false, menuItems = [], masterclassItems = [], minGuestsTasting = 4, minGuestsTastingLunch = 4, blockedDates = [], formContent = {}, messagesContent = {}, displayPriceTasting = null, displayPriceLunch = null, individualPrices = [], onlinePaymentEnabled = DEFAULT_PAYMENT_READY, bookingLeadSplit = false, bookingLeadHours = 3, bookingLeadHoursTasting = 3, bookingLeadHoursTastingLunch = 6, workingHoursCustom = false, workingHoursOpen = '12:00', workingHoursClose = '18:00', workingHoursDaysJson = '', visitDurationTasting = 90, visitDurationTastingLunch = 180 }: Props) {
  const fc = (key: string, tKey: string) => formContent[key] || t(locale, tKey)
  const mc = (key: string, tKey: string, vars?: Record<string, string | number>) => {
    let str = messagesContent[key] || t(locale, tKey)
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v))
    return str
  }
  const [bookingType, setBookingType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL')
  const [visitType, setVisitType] = useState<'TASTING' | 'TASTING_LUNCH'>('TASTING')
  const [guestInput, setGuestInput] = useState('4')
  const [guestWarning, setGuestWarning] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [timeSlot, setTimeSlot] = useState('11:00')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Review-your-visit sheet (#184) — shown once client-side validation (and the
  // "New Company?" check, which still runs first) both pass, before the real
  // createBooking() call in handleConfirmedSubmit.
  const [showConfirm, setShowConfirm] = useState(false)
  // Gates client-side field validation messages/highlighting — false until the
  // first submit attempt, so a first-time visitor never sees red borders
  // before they've done anything. Once true, every gated error is a plain
  // derived boolean (recomputed each render), so it clears itself the moment
  // the underlying field becomes valid — no per-field "touched" bookkeeping.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const dateWrapRef = useRef<HTMLDivElement>(null)
  const contactWrapRef = useRef<HTMLDivElement>(null)
  const timeSlotRef = useRef<HTMLSelectElement>(null)
  const guestsWrapRef = useRef<HTMLDivElement>(null)
  const [confirmedPrice, setConfirmedPrice] = useState<number | null>(null)
  const [confirmedType, setConfirmedType] = useState<'INDIVIDUAL' | 'COMPANY' | null>(null)
  // Per-tenant optional "max guests" cap (server-enforced, never shown pre-submit —
  // see vault/MaintenanceNotes.md context for why this has no visible UI otherwise).
  // Individual bookings over the cap get silently clamped; this is the note telling
  // the customer what happened. Company bookings are never altered — just flagged.
  const [confirmedGuestAdjustedTo, setConfirmedGuestAdjustedTo] = useState<number | null>(null)
  const [confirmedOverMaxNotice, setConfirmedOverMaxNotice] = useState<number | null>(null)
  // True when the just-submitted booking went through the "New Company?" flow
  // (Feature 180) — the success screen adds a note that pricing/account setup
  // is still pending, on top of the usual "we'll be in touch" copy.
  const [confirmedPendingNewCompany, setConfirmedPendingNewCompany] = useState(false)

  // Auto-fill fields (controlled so we can populate them from company profile)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Access code popup
  const [showCodePopup, setShowCodePopup] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)

  // Direct code entry state (used when hideCompanyDropdown=true)
  const [directCode, setDirectCode] = useState('')
  const [directCodeLoading, setDirectCodeLoading] = useState(false)
  const [directCodeError, setDirectCodeError] = useState('')
  const [directCompanyName, setDirectCompanyName] = useState('')

  // New company request popup
  const [showNewCompanyPopup, setShowNewCompanyPopup] = useState(false)
  const [newCoName, setNewCoName] = useState('')
  const [newCoContact, setNewCoContact] = useState('')
  const [newCoPhone, setNewCoPhone] = useState('')
  const [newCoEmail, setNewCoEmail] = useState('')
  const [newCoStatus, setNewCoStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  // True when the popup was opened because "Request Booking" was pressed with
  // no confirmed company code (Feature 180) — the rest of the form already
  // validated, so submitting the popup also submits that booking alongside
  // the registration request. False when opened via the standalone "New
  // Company?" link, which is a pure inquiry and never touches createBooking.
  const [newCompanyIncludesBooking, setNewCompanyIncludesBooking] = useState(false)

  // Enhanced company form state
  const [tastingGuestsStr, setTastingGuestsStr] = useState('0')
  const [lunchGuestsStr, setLunchGuestsStr] = useState('0')
  const [freeGuestsStr, setFreeGuestsStr] = useState('0')
  const [hotDishVeg, setHotDishVeg] = useState('')
  const [hotDishMeat, setHotDishMeat] = useState('')
  const [foodNotes, setFoodNotes] = useState('')
  const [mcSelections, setMcSelections] = useState<Record<string, { checked: boolean; qtyStr: string }>>({})

  const minGuests = visitType === 'TASTING' ? minGuestsTasting : minGuestsTastingLunch
  const guestCount = Math.max(parseInt(guestInput) || minGuests, minGuests)
  const today = new Date().toISOString().split('T')[0]

  const weeklyHours = parseWeeklyHours(workingHoursDaysJson, workingHoursOpen, workingHoursClose)
  const leadHours = getLeadHours(visitType, bookingLeadSplit, bookingLeadHours, bookingLeadHoursTasting, bookingLeadHoursTastingLunch)
  const minInstant = minBookableInstant(new Date(), leadHours)

  function slotsForDate(date: string): string[] {
    if (!date) return []
    const dayHours = getDayHours(date, workingHoursCustom, weeklyHours, workingHoursOpen, workingHoursClose)
    if (dayHours.closed) return []
    return generateHourlySlots(dayHours.open, dayHours.close).filter(s => slotMeetsLeadTime(date, s, minInstant))
  }

  const availableSlots = slotsForDate(selectedDate)
  const isDateBlocked = (date: string) => blockedDates.includes(date)
  const isDayClosed = (date: string) => getDayHours(date, workingHoursCustom, weeklyHours, workingHoursOpen, workingHoursClose).closed
  const isPastDate = selectedDate !== '' && selectedDate < today

  // Derived validation-highlight flags — gated on attemptedSubmit except the
  // date ones, which were already live before this change and stay that way.
  const dateHasError = isPastDate || (selectedDate !== '' && isDateBlocked(selectedDate)) ||
    (selectedDate !== '' && !isPastDate && !isDateBlocked(selectedDate) && isDayClosed(selectedDate)) ||
    (attemptedSubmit && !selectedDate)
  const contactHasError = attemptedSubmit && !phone && !email
  const timeSlotHasError = attemptedSubmit && (!timeSlot || !availableSlots.includes(timeSlot))

  function handleDateChange(date: string) {
    setSelectedDate(date)
    const slots = slotsForDate(date)
    if (slots.length > 0 && !slots.includes(timeSlot)) setTimeSlot(slots[0])
  }

  const isEnhanced = !!enhancedEnabled && bookingType === 'COMPANY'
  const selectedCompany = bookingType === 'COMPANY' ? companies.find(c => c.id === companyId) : null
  // Label-only mirror of shouldTakePayment()'s precedence (#148): hard block
  // (configured) first — nothing beats it — then, for COMPANY bookings, the
  // selected company's override, then the section default. INDIVIDUAL bookings
  // never carry a company, so no override ever applies there (Feature 148 §
  // "edge cases"). Never used for the actual charge decision, which stays
  // server-side in createBooking.ts.
  const paymentLabelActive = !onlinePaymentEnabled.configured
    ? false
    : bookingType === 'INDIVIDUAL'
      ? onlinePaymentEnabled.individual
      : selectedCompany?.skipPayment === true
        ? false
        : selectedCompany?.skipPayment === false
          ? true
          : onlinePaymentEnabled.company

  // Show access code popup when a company with a code is selected; auto-fill directly if no code
  useEffect(() => {
    if (!companyId || bookingType !== 'COMPANY' || hideCompanyDropdown) return
    const company = companies.find(c => c.id === companyId)
    if (!company) return
    if (!company.accessCode) {
      applyProfile({ contactName: company.contactName, contactPhone: company.contactPhone, contactEmail: company.contactEmail })
      return
    }
    setCodeInput('')
    setCodeError('')
    setShowCodePopup(true)
  }, [companyId, bookingType, hideCompanyDropdown])

  function applyProfile(profile: { contactName: string | null; contactPhone: string | null; contactEmail: string | null }) {
    if (profile.contactName) {
      const parts = profile.contactName.trim().split(' ')
      setFirstName(parts[0] ?? '')
      setLastName(parts.slice(1).join(' '))
    }
    if (profile.contactPhone) setPhone(profile.contactPhone)
    if (profile.contactEmail) setEmail(profile.contactEmail)
  }

  async function handleCodeSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!codeInput.trim()) return
    setCodeLoading(true)
    setCodeError('')
    const result = await verifyCompanyCode(companyId, codeInput)
    setCodeLoading(false)
    if ('error' in result) {
      setCodeError(mc('onsite_access_code_error', 'form.access_code_error'))
      return
    }
    // Ask the browser to save the credential natively (triggers "Save password?" prompt)
    if (typeof window !== 'undefined' && 'PasswordCredential' in window) {
      try {
        const companyName = companies.find(c => c.id === companyId)?.name ?? companyId
        // @ts-ignore — PasswordCredential is not in all TS lib versions
        const cred = new window.PasswordCredential({ id: companyName, password: codeInput, name: companyName })
        await navigator.credentials.store(cred)
      } catch {}
    }
    applyProfile(result.profile)
    setShowCodePopup(false)
  }

  function handleNotARep() {
    setShowCodePopup(false)
    setCompanyId('')
    setBookingType('INDIVIDUAL')
  }

  async function handleDirectCodeSubmit() {
    if (!directCode.trim()) return
    setDirectCodeLoading(true)
    setDirectCodeError('')
    const result = await findCompanyByCode(directCode, 'BOOKING')
    setDirectCodeLoading(false)
    if ('error' in result) {
      setDirectCodeError(mc('onsite_access_code_direct_not_recognised', 'form.access_code_direct_not_recognised'))
      return
    }
    setCompanyId(result.company.id)
    setDirectCompanyName(result.company.name)
    applyProfile({ contactName: result.company.contactName, contactPhone: result.company.contactPhone, contactEmail: result.company.contactEmail })
  }

  function clearDirectCode() {
    setCompanyId('')
    setDirectCompanyName('')
    setDirectCode('')
    setDirectCodeError('')
    setFirstName(''); setLastName(''); setPhone(''); setEmail('')
  }

  async function handleNewCompanySubmit() {
    if (!newCoName.trim() || !newCoContact.trim() || !newCoPhone.trim()) return
    setNewCoStatus('submitting')
    const notifyResult = await notifyNewCompany({
      companyName: newCoName.trim(),
      contactName: newCoContact.trim(),
      phone: newCoPhone.trim(),
      email: newCoEmail.trim() || undefined,
      module: 'BOOKING',
    })

    if (!newCompanyIncludesBooking) {
      setNewCoStatus(notifyResult.success ? 'sent' : 'error')
      return
    }

    // Opened from "Request Booking" — the rest of the form already passed
    // validation (see handleSubmit), so submit the booking itself alongside
    // the registration request, carrying the typed-in name so the winery can
    // tell which company it belongs to before a real Company row exists.
    const bookingResult = await createBooking({
      ...buildBookingPayload(),
      requestedCompanyName: newCoName.trim(),
    })

    if (notifyResult.success && bookingResult.success) {
      if (bookingResult.checkoutUrl) {
        window.location.assign(bookingResult.checkoutUrl)
        return
      }
      setConfirmedPrice(bookingResult.totalPrice)
      setConfirmedType(bookingResult.bookingType)
      setConfirmedGuestAdjustedTo(bookingResult.guestCountAdjustedTo ?? null)
      setConfirmedOverMaxNotice(bookingResult.guestCountOverMax ? (bookingResult.guestCountMax ?? null) : null)
      setConfirmedPendingNewCompany(true)
      setShowNewCompanyPopup(false)
      setStatus('success')
      dispatchDemoBooked({ name: firstName, surname: lastName })
    } else {
      setNewCoStatus('error')
    }
  }

  /** Shared with handleNewCompanySubmit so a booking submitted through the
   * "New Company?" popup carries the exact same payload a normal submit
   * would — only `requestedCompanyName` differs. */
  function buildBookingPayload(): BookingFormData {
    return {
      bookingType,
      visitType,
      // '__new__' is the dropdown's "+ New Company" sentinel (see the <select>
      // above) — never a real id, so it must never reach the server as one.
      companyId: bookingType === 'COMPANY' && companyId && companyId !== '__new__' ? companyId : undefined,
      date: selectedDate,
      timeSlot,
      guestCount: isEnhanced ? totalGuests : guestCount,
      name: firstName,
      surname: lastName,
      email,
      phone,
      ...(isEnhanced ? {
        tastingGuestCount: tastingGuests,
        lunchGuestCount: lunchGuests,
        freeGuestCount: freeGuests,
        hotDishVegetable: hotDishVeg || null,
        hotDishMeat: hotDishMeat || null,
        foodNotes: foodNotes || null,
        masterclassLines: activeMcLines,
      } : {}),
    }
  }

  // Enhanced guest counts
  const tastingGuests = Math.max(parseInt(tastingGuestsStr) || 0, 0)
  const lunchGuests = Math.max(parseInt(lunchGuestsStr) || 0, 0)
  const freeGuests = Math.max(parseInt(freeGuestsStr) || 0, 0)
  const totalGuests = isEnhanced ? tastingGuests + lunchGuests + freeGuests : guestCount
  const payingGuests = tastingGuests + lunchGuests
  const enhancedGuestsHaveError = attemptedSubmit && isEnhanced && totalGuests < minGuests

  // Masterclass selections
  const activeMcLines = masterclassItems
    .filter(m => mcSelections[m.id]?.checked)
    .map(m => ({
      masterclassItemId: m.id,
      quantity: Math.max(parseInt(mcSelections[m.id]?.qtyStr || '1') || 1, 1),
      pricePerUnit: m.pricePerUnit,
    }))
  const masterclassAmt = activeMcLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)

  // Price preview
  const enhancedTier = isEnhanced && selectedCompany
    ? findTier(selectedCompany.prices, payingGuests)
    : null
  const enhancedTotal = enhancedTier
    ? tastingGuests * enhancedTier.pricePerPerson +
      lunchGuests * comboRatePerPerson(enhancedTier) +
      enhancedTier.registrationPrice +
      masterclassAmt
    : masterclassAmt

  // Simple form price preview
  const matchedTier = !isEnhanced && selectedCompany
    ? selectedCompany.prices.find(p => guestCount >= p.minGuests && guestCount <= p.maxGuests) ?? null
    : bookingType === 'INDIVIDUAL'
      ? findTier(individualPrices, guestCount) ?? null
      : null
  const tierGap = !isEnhanced && selectedCompany && selectedCompany.prices.length > 0 && !matchedTier
  // No invented default rates — when the tenant has no display price set,
  // the estimate is unknown and the form says "price confirmed after submission"
  const basePrice = visitType === 'TASTING' ? displayPriceTasting : displayPriceLunch
  const matchedTierRate = matchedTier
    ? (visitType === 'TASTING' ? matchedTier.pricePerPerson : comboRatePerPerson(matchedTier))
    : null
  const estimatedTotal = matchedTier
    ? (bookingType === 'INDIVIDUAL' ? matchedTierRate! * guestCount : matchedTier.pricePerPerson * guestCount + matchedTier.registrationPrice)
    : basePrice != null ? basePrice * guestCount : null

  const vegItems = menuItems.filter(m => m.type === 'VEGETABLE')
  const meatItems = menuItems.filter(m => m.type === 'MEAT')

  // ---- Confirm-your-visit sheet (#184): rows + duration note + total ----
  const visitDurationMinutes = getVisitDurationMinutes(visitType, visitDurationTasting, visitDurationTastingLunch)
  const estimatedEndTime = timeSlot ? addMinutesToSlot(timeSlot, visitDurationMinutes) : ''
  const durationHoursLabel = (visitDurationMinutes % 60 === 0 ? visitDurationMinutes / 60 : Math.round((visitDurationMinutes / 60) * 10) / 10).toString()
  const confirmDurationNote = timeSlot
    ? mc('onsite_confirm_duration_note', 'form.confirm_duration_note', { hours: durationHoursLabel, end: estimatedEndTime })
    : null
  const [dateY, dateM, dateD] = selectedDate ? selectedDate.split('-') : ['', '', '']
  const confirmDateLabel = selectedDate ? `${dateD}/${dateM}/${dateY}` : ''

  const confirmVisitRows: ReviewRow[] = [
    { label: fc('form_visit_type', 'form.visit_type'), value: fc(visitType === 'TASTING' ? 'form_tasting' : 'form_tasting_lunch', visitType === 'TASTING' ? 'form.tasting' : 'form.tasting_lunch') },
    { label: fc('form_date', 'form.date'), value: confirmDateLabel },
    { label: t(locale, 'form.confirm_arrive'), value: timeSlot },
  ]

  const confirmGuestRows: ReviewRow[] = isEnhanced
    ? [
        ...(tastingGuests > 0 ? [{ label: t(locale, 'form.guests_tasting'), value: String(tastingGuests) }] : []),
        ...(lunchGuests > 0 ? [{ label: t(locale, 'form.guests_lunch'), value: String(lunchGuests) }] : []),
        ...(freeGuests > 0 ? [{ label: t(locale, 'form.guests_free'), value: String(freeGuests) }] : []),
        { label: t(locale, 'form.total'), value: String(totalGuests) },
        { label: fc('form_first_name', 'form.first_name') + ' ' + fc('form_last_name', 'form.last_name'), value: `${firstName} ${lastName}`.trim() },
        ...(phone ? [{ label: fc('form_phone', 'form.phone'), value: phone }] : []),
        ...(email ? [{ label: fc('form_email', 'form.email'), value: email }] : []),
      ]
    : [
        { label: fc('form_num_guests', 'form.num_guests'), value: String(guestCount) },
        { label: fc('form_first_name', 'form.first_name') + ' ' + fc('form_last_name', 'form.last_name'), value: `${firstName} ${lastName}`.trim() },
        ...(phone ? [{ label: fc('form_phone', 'form.phone'), value: phone }] : []),
        ...(email ? [{ label: fc('form_email', 'form.email'), value: email }] : []),
      ]

  // Same "don't invent a number" rule as the live price preview below: only a
  // known, tier-matched total is shown; an unresolved company rate or unset
  // display price hides the row entirely rather than showing a guess.
  const confirmTotalValue = isEnhanced
    ? (payingGuests > 0 && enhancedTier ? `${enhancedTotal}₾` : null)
    : bookingType === 'INDIVIDUAL'
      ? (estimatedTotal != null ? `${estimatedTotal}₾` : null)
      : (showCompanyPrice && matchedTier ? `${estimatedTotal}₾` : null)

  function toggleMc(id: string, checked: boolean) {
    setMcSelections(prev => ({ ...prev, [id]: { checked, qtyStr: prev[id]?.qtyStr ?? '1' } }))
  }

  function setMcQty(id: string, qtyStr: string) {
    setMcSelections(prev => ({ ...prev, [id]: { checked: prev[id]?.checked ?? true, qtyStr } }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAttemptedSubmit(true)
    if (status === 'error') { setStatus('idle'); setErrorMsg('') }

    // Each check scrolls/focuses its own field and highlights it inline
    // (see dateHasError/contactHasError/timeSlotHasError/enhancedGuestsHaveError
    // and the matching JSX below) instead of a single generic banner — same
    // priority order as before.
    if (!selectedDate || selectedDate < today || isDateBlocked(selectedDate) || isDayClosed(selectedDate)) {
      dateWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!phone && !email) {
      contactWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      contactWrapRef.current?.querySelector('input')?.focus()
      return
    }
    if (!timeSlot || !availableSlots.includes(timeSlot)) {
      timeSlotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      timeSlotRef.current?.focus()
      return
    }
    if (isEnhanced && totalGuests < minGuests) {
      guestsWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    // Checked last, deliberately: everything else about the booking is
    // already valid at this point, so rather than blocking submission
    // outright, open the "New Company?" popup to collect the missing piece —
    // submitting it there sends this exact booking alongside the
    // registration request (Feature 180). Covers both variants: the
    // direct-entry one has no confirmed code (companyId still empty), and
    // the dropdown one has its "+ New Company" sentinel selected instead of
    // a real company — picking that couldn't just open the popup immediately
    // on selection, since the rest of the form (date, guests, contact) may
    // not be filled in yet at that point.
    if (bookingType === 'COMPANY' && ((hideCompanyDropdown && !companyId) || companyId === '__new__')) {
      setNewCompanyIncludesBooking(true)
      setNewCoStatus('idle')
      setNewCoName('')
      setNewCoContact(`${firstName} ${lastName}`.trim())
      setNewCoPhone(phone)
      setNewCoEmail(email)
      setShowNewCompanyPopup(true)
      return
    }
    // Everything validates — show the "review your visit" sheet instead of
    // submitting straight away (Feature 184). The actual createBooking() call
    // happens in handleConfirmedSubmit, once the guest confirms there.
    setShowConfirm(true)
  }

  /** Fired by the confirm sheet's "Confirm & Request Booking" button — the
   * submit logic handleSubmit used to run directly once validation passed. */
  async function handleConfirmedSubmit() {
    setStatus('loading')
    setErrorMsg('')
    const result = await createBooking(buildBookingPayload())
    if (result.success) {
      // Payment tenants: the booking is saved; hand the customer to the
      // gateway. Keep the loading state — this page is about to unload, and
      // flashing the success screen first would say "booked!" pre-payment.
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl)
        return
      }
      setShowConfirm(false)
      setConfirmedPrice(result.totalPrice)
      setConfirmedType(result.bookingType)
      setConfirmedGuestAdjustedTo(result.guestCountAdjustedTo ?? null)
      setConfirmedOverMaxNotice(result.guestCountOverMax ? (result.guestCountMax ?? null) : null)
      setConfirmedPendingNewCompany(false)
      setStatus('success')
      // Name is carried so the live mirror can highlight this exact row.
      dispatchDemoBooked({ name: firstName, surname: lastName }) // no-op outside the demo tenant — see lib/demoEvents.ts
    } else {
      setShowConfirm(false)
      setStatus('error')
      setErrorMsg(result.error)
    }
  }

  if (status === 'success') {
    // Hide the price on the success screen when it's 0 — that means the tenant
    // has no pricing configured and the real price will be confirmed manually
    const showPrice = (confirmedType === 'INDIVIDUAL' || (confirmedType === 'COMPANY' && showCompanyPrice)) && confirmedPrice != null && confirmedPrice > 0
    return (
      <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <div className="text-4xl mb-4">🍷</div>
        <h3 className="text-xl font-bold mb-2" style={{ color: C.text }}>{fc('form_success_heading', 'form.success_heading')}</h3>
        <p style={{ color: C.muted }}>{fc('form_success_body', 'form.success_body')}</p>
        {confirmedPendingNewCompany && (
          <p className="text-sm mt-3" style={{ color: C.muted }}>
            {mc('onsite_pending_company_note', 'form.onsite_pending_company_note')}
          </p>
        )}
        {confirmedGuestAdjustedTo != null && (
          <p className="text-sm mt-3" style={{ color: C.muted }}>
            {t(locale, 'form.guest_count_adjusted', { max: confirmedGuestAdjustedTo })}
          </p>
        )}
        {confirmedOverMaxNotice != null && (
          <p className="text-sm mt-3" style={{ color: C.muted }}>
            {t(locale, 'form.guest_count_over_max_notice', { max: confirmedOverMaxNotice })}
          </p>
        )}
        {showPrice && confirmedPrice != null && (
          <div className="mt-6 inline-block rounded-lg px-6 py-3 border" style={{ backgroundColor: 'var(--site-surface)', borderColor: C.border }}>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: C.faint }}>{t(locale, 'form.est_total_label')}</p>
            <p className="text-2xl font-bold" style={{ color: C.wine }}>{confirmedPrice}₾</p>
          </div>
        )}
      </div>
    )
  }

  const inputStyle = { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }
  const labelStyle: React.CSSProperties = { color: C.muted, fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px', display: 'block' }

  function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button type="button" onClick={onClick}
        className="py-3 px-4 rounded-lg border text-sm font-medium transition-colors text-left w-full"
        style={{ backgroundColor: active ? 'var(--color-brand)' : C.bg, borderColor: active ? 'var(--color-brand)' : C.border, color: active ? '#fff' : C.muted }}>
        {children}
      </button>
    )
  }

  return (
    <>
      {/* Access code popup */}
      {showCodePopup && (
        <AccessCodePopupView
          status={codeLoading ? 'checking' : codeError ? 'error' : 'idle'}
          title={mc('onsite_access_code_title', 'form.access_code_title')}
          intro={mc('onsite_access_code_intro', 'form.access_code_intro', { company: companies.find(c => c.id === companyId)?.name ?? '' })}
          errorMessage={codeError}
          companyName={companies.find(c => c.id === companyId)?.name ?? ''}
          code={codeInput}
          onCodeChange={value => { setCodeInput(value); setCodeError('') }}
          onSubmit={handleCodeSubmit}
          onEnterManually={handleNotARep}
          labels={buildAccessCodeLabels(locale)}
        />
      )}

      {/* New Company popup */}
      {showNewCompanyPopup && (
        <NewCompanyPopupView
          includesBooking={newCompanyIncludesBooking}
          status={newCoStatus}
          title={mc('onsite_new_company_title', 'form.new_company_title')}
          bodyWithBooking={mc('onsite_new_company_body_with_booking', 'form.new_company_body_with_booking')}
          bodyNoBooking={mc('onsite_new_company_body_no_booking', 'form.new_company_body_no_booking')}
          successTitle={mc('onsite_new_company_success_title', 'form.new_company_success_title')}
          successBody={mc('onsite_new_company_success_body', 'form.new_company_success_body')}
          errorMessage={mc('onsite_new_company_error', 'form.new_company_error')}
          name={newCoName}
          contact={newCoContact}
          phone={newCoPhone}
          email={newCoEmail}
          onNameChange={setNewCoName}
          onContactChange={setNewCoContact}
          onPhoneChange={setNewCoPhone}
          onEmailChange={setNewCoEmail}
          onSubmit={handleNewCompanySubmit}
          onClose={() => setShowNewCompanyPopup(false)}
          labels={buildNewCompanyLabels(locale)}
        />
      )}

      {/* Review-your-visit sheet (#184) */}
      {showConfirm && (
        <BookingConfirmPopupView
          labels={{
            heading: mc('onsite_confirm_heading', 'form.confirm_heading'),
            subheading: mc('onsite_confirm_subheading', 'form.confirm_subheading'),
            sectionVisit: t(locale, 'form.confirm_section_visit'),
            sectionGuests: t(locale, 'form.confirm_section_guests'),
            edit: mc('onsite_confirm_edit', 'form.confirm_edit'),
            confirm: paymentLabelActive ? mc('onsite_confirm_button_pay', 'form.confirm_button_pay') : mc('onsite_confirm_button', 'form.confirm_button'),
          }}
          visitRows={confirmVisitRows}
          guestRows={confirmGuestRows}
          durationNote={confirmDurationNote}
          totalLabel={t(locale, 'form.est_total')}
          totalValue={confirmTotalValue}
          submitting={status === 'loading'}
          onEdit={() => setShowConfirm(false)}
          onConfirm={handleConfirmedSubmit}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Booking type */}
        <div>
          <label style={labelStyle}>{fc('form_booking_type', 'form.booking_type')}</label>
          <div className="grid grid-cols-2 gap-3">
            <ToggleButton active={bookingType === 'INDIVIDUAL'} onClick={() => { setBookingType('INDIVIDUAL'); setCompanyId('') }}>
              {fc('form_individual', 'form.individual')}
            </ToggleButton>
            <ToggleButton active={bookingType === 'COMPANY'} onClick={() => setBookingType('COMPANY')}>
              {fc('form_company_type', 'form.company_type')}
            </ToggleButton>
          </div>
        </div>

        {/* Company selector */}
        {bookingType === 'COMPANY' && (
          hideCompanyDropdown ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setNewCompanyIncludesBooking(false); setShowNewCompanyPopup(true); setNewCoStatus('idle'); setNewCoName(''); setNewCoContact(''); setNewCoPhone(''); setNewCoEmail('') }}
                className="self-start text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:opacity-75 active:scale-95"
                style={{ color: 'var(--color-brand)', borderColor: 'var(--color-brand)' }}
              >
                {t(locale, 'form.new_company_chip')}
              </button>
              {directCompanyName ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border"
                  style={{ backgroundColor: STATUS.successBg, borderColor: STATUS.successBorder }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <circle cx="6" cy="6" r="5.5" stroke={STATUS.successText} strokeWidth="1.5" />
                    <path d="M3.5 6l2 2 3-3" stroke={STATUS.successText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-medium flex-1" style={{ color: STATUS.successText }}>{directCompanyName}</span>
                  <button type="button" onClick={clearDirectCode}
                    className="text-base font-bold leading-none hover:opacity-70" style={{ color: STATUS.successText }}>×</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t(locale, 'form.access_code_direct_placeholder')}
                    value={directCode}
                    onChange={e => { setDirectCode(e.target.value.toUpperCase()); setDirectCodeError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDirectCodeSubmit() } }}
                    className="flex-1 rounded-lg border px-3 py-2.5 text-sm font-mono"
                    style={{ ...inputStyle, letterSpacing: '0.06em' }}
                  />
                  <button
                    type="button"
                    onClick={handleDirectCodeSubmit}
                    disabled={directCodeLoading || !directCode.trim()}
                    className="px-4 py-2.5 rounded-lg font-semibold text-sm text-white flex-shrink-0 transition-opacity"
                    style={{ backgroundColor: 'var(--color-brand)', opacity: (directCodeLoading || !directCode.trim()) ? 0.6 : 1 }}
                  >
                    {directCodeLoading ? '…' : t(locale, 'form.access_code_confirm')}
                  </button>
                </div>
              )}
              {directCodeError && (
                <p className="text-xs" style={{ color: STATUS.errorText }}>{directCodeError}</p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label style={{ ...labelStyle, marginBottom: 0 }}>{t(locale, 'form.company')}</label>
                <button
                  type="button"
                  onClick={() => { setNewCompanyIncludesBooking(false); setShowNewCompanyPopup(true); setNewCoStatus('idle'); setNewCoName(''); setNewCoContact(''); setNewCoPhone(''); setNewCoEmail('') }}
                  className="text-xs font-medium transition-all hover:opacity-75 active:scale-95"
                  style={{ color: 'var(--color-brand)' }}
                >
                  {t(locale, 'form.new_company_chip')}
                </button>
              </div>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} required
                className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                <option value="">{t(locale, 'form.company_placeholder')}</option>
                {/* Sentinel, not a real company id — satisfies the <select required>
                    constraint (which otherwise just loops the browser's own "select an
                    item" prompt with no way to proceed) and is treated the same as a
                    missing code in the direct-entry variant: handleSubmit below opens
                    the "New Company?" popup for it instead of forwarding it to the
                    server. Never sent to createBooking() as a companyId — stripped in
                    buildBookingPayload(). */}
                <option value="__new__">{t(locale, 'form.new_company_dropdown_option')}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )
        )}

        {/* Visit type */}
        <div>
          <label style={labelStyle}>{fc('form_visit_type', 'form.visit_type')}</label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'TASTING',       contentKey: 'form_tasting',       labelKey: 'form.tasting',       price: displayPriceTasting },
              { value: 'TASTING_LUNCH', contentKey: 'form_tasting_lunch', labelKey: 'form.tasting_lunch', price: displayPriceLunch },
            ] as const).map(opt => (
              <button key={opt.value} type="button" onClick={() => setVisitType(opt.value)}
                className="py-3 px-4 rounded-lg border text-left transition-colors"
                style={{ backgroundColor: visitType === opt.value ? 'color-mix(in srgb, var(--color-brand) 8%, var(--site-surface))' : C.bg, borderColor: visitType === opt.value ? C.wine : C.border, color: C.text }}>
                <div className="font-medium text-sm">{fc(opt.contentKey, opt.labelKey)}</div>
                {(bookingType === 'COMPANY' || opt.price != null) && (
                  <div className="text-sm mt-0.5" style={{ color: C.wine }}>
                    {bookingType === 'COMPANY' ? t(locale, 'form.company_rate') : `${opt.price}₾ ${t(locale, 'form.per_pp')}`}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Date & time */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div ref={dateWrapRef}>
            <label style={labelStyle}>{fc('form_date', 'form.date')}</label>
            <input type="hidden" name="date" value={selectedDate} />
            <DateInput
              value={selectedDate}
              onChange={handleDateChange}
              min={today}
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              style={{ ...inputStyle, borderColor: dateHasError ? STATUS.errorBorder : inputStyle.borderColor }}
            />
            {attemptedSubmit && !selectedDate && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_select_date', 'form.err_select_date')}</p>
            )}
            {isPastDate && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_future_date', 'form.err_future_date')}</p>
            )}
            {selectedDate && !isPastDate && isDateBlocked(selectedDate) && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_blocked', 'form.err_blocked')}</p>
            )}
            {selectedDate && !isPastDate && !isDateBlocked(selectedDate) && isDayClosed(selectedDate) && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_day_closed', 'form.err_day_closed')}</p>
            )}
          </div>
          <div>
            <label style={labelStyle}>{fc('form_time_slot', 'form.time_slot')}</label>
            <select ref={timeSlotRef} value={timeSlot} onChange={e => setTimeSlot(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              style={{ ...inputStyle, borderColor: timeSlotHasError ? STATUS.errorBorder : inputStyle.borderColor }}>
              {availableSlots.length > 0
                ? availableSlots.map(s => <option key={s} value={s}>{s}</option>)
                : <option value="">{t(locale, 'form.no_slots')}</option>}
            </select>
            {timeSlotHasError && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_lead_time', 'form.err_lead_time', { hours: leadHours })}</p>
            )}
          </div>
        </div>

        {/* Guest count — enhanced vs simple */}
        {isEnhanced ? (
          <div ref={guestsWrapRef}>
            <label style={labelStyle}>{fc('form_guest_counts_header', 'form.guest_counts')}</label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { labelKey: 'form.guests_tasting', value: tastingGuestsStr, set: setTastingGuestsStr, hidden: false },
                { labelKey: 'form.guests_lunch',   value: lunchGuestsStr,   set: setLunchGuestsStr,   hidden: visitType === 'TASTING' },
                { labelKey: 'form.guests_free',    value: freeGuestsStr,    set: setFreeGuestsStr,    hidden: false },
              ] as { labelKey: string; value: string; set: (v: string) => void; hidden: boolean }[]).map(({ labelKey, value, set, hidden }) => hidden ? null : (
                <div key={labelKey}>
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{t(locale, labelKey)}</p>
                  <input type="number" min={0} max={200} value={value}
                    onChange={e => set(e.target.value)}
                    onBlur={e => { const v = parseInt(e.target.value) || 0; set(String(Math.max(v, 0))) }}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ ...inputStyle, borderColor: enhancedGuestsHaveError ? STATUS.errorBorder : inputStyle.borderColor }} />
                </div>
              ))}
            </div>
            {totalGuests > 0 && (
              <p className="text-xs mt-1.5" style={{ color: C.faint }}>
                {t(locale, 'form.total')}: {totalGuests} {totalGuests !== 1 ? t(locale, 'form.guest_plural') : t(locale, 'form.guest_singular')}{payingGuests > 0 ? ` (${payingGuests} ${t(locale, 'form.paying')})` : ''}
              </p>
            )}
            {enhancedGuestsHaveError && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_min_guests', 'form.err_min_guests', { min: minGuests })}</p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor="guestCount" style={labelStyle}>
              {fc('form_num_guests', 'form.num_guests')}
              <span className="block text-xs font-normal mt-0.5" style={{ color: C.faint }}>({t(locale, 'form.minimum')} {minGuests})</span>
            </label>
            <input id="guestCount" name="guestCount" type="number" min={minGuests} max={200}
              value={guestInput}
              onChange={e => { setGuestInput(e.target.value); setGuestWarning('') }}
              onBlur={() => {
                const val = parseInt(guestInput) || 0
                if (val < minGuests) { setGuestInput(String(minGuests)); setGuestWarning(t(locale, 'form.guest_min_warn', { min: minGuests })) }
                else { setGuestInput(String(val)); setGuestWarning('') }
              }}
              required className="rounded-lg border px-3 py-2.5 w-28" style={inputStyle} />
            {guestWarning && <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{guestWarning}</p>}
          </div>
        )}

        {/* Enhanced: Hot dishes (only for TASTING_LUNCH) */}
        {isEnhanced && visitType === 'TASTING_LUNCH' && (vegItems.length > 0 || meatItems.length > 0) && (
          <div>
            <label style={labelStyle}>{fc('form_hot_dish_header', 'form.hot_dish')}</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {vegItems.length > 0 && (
                <div>
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{t(locale, 'form.veg_dish')}</p>
                  <select value={hotDishVeg} onChange={e => setHotDishVeg(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                    <option value="">{t(locale, 'form.choose')}</option>
                    {vegItems.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              )}
              {meatItems.length > 0 && (
                <div>
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{t(locale, 'form.meat_dish')}</p>
                  <select value={hotDishMeat} onChange={e => setHotDishMeat(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                    <option value="">{t(locale, 'form.choose')}</option>
                    {meatItems.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Enhanced: Masterclass add-ons */}
        {isEnhanced && masterclassItems.length > 0 && (
          <div>
            <label style={labelStyle}>{fc('form_masterclass_header', 'form.masterclass')}</label>
            <div className="rounded-lg border divide-y" style={{ borderColor: C.border }}>
              {masterclassItems.map(m => {
                const sel = mcSelections[m.id]
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: C.bg }}>
                    <input type="checkbox" id={`mc-${m.id}`} checked={!!sel?.checked}
                      onChange={e => toggleMc(m.id, e.target.checked)}
                      className="rounded" />
                    <label htmlFor={`mc-${m.id}`} className="flex-1 text-sm cursor-pointer" style={{ color: C.text }}>
                      {m.name}
                      <span className="ml-1 text-xs" style={{ color: C.faint }}>
                        {m.pricePerUnit}₾/{m.unitType === 'PER_PERSON' ? t(locale, 'form.pp') : m.unitType === 'FLAT' ? t(locale, 'form.flat') : t(locale, 'form.pc')}
                      </span>
                    </label>
                    {sel?.checked && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.qty')}</span>
                        <input type="number" min={1} max={999} value={sel.qtyStr}
                          onChange={e => setMcQty(m.id, e.target.value)}
                          onBlur={e => setMcQty(m.id, String(Math.max(parseInt(e.target.value) || 1, 1)))}
                          className="w-16 rounded border px-2 py-1 text-sm text-center" style={inputStyle} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Enhanced: Food notes */}
        {isEnhanced && (
          <div>
            <label htmlFor="foodNotes" style={labelStyle}>{fc('form_food_notes', 'form.food_notes')} <span style={{ color: C.faint }}>({fc('form_food_notes_sub', 'form.food_notes_sub')})</span></label>
            <textarea id="foodNotes" rows={3} value={foodNotes} onChange={e => setFoodNotes(e.target.value)}
              placeholder={fc('form_food_notes_placeholder', 'form.food_notes_placeholder')}
              className="w-full rounded-lg border px-3 py-2.5 text-sm resize-none" style={inputStyle} />
          </div>
        )}

        {/* Name & surname */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" style={labelStyle}>{fc('form_first_name', 'form.first_name')}</label>
            <input id="name" name="name" required value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="surname" style={labelStyle}>{fc('form_last_name', 'form.last_name')}</label>
            <input id="surname" name="surname" required value={lastName} onChange={e => setLastName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          </div>
        </div>

        {/* Contact */}
        <div ref={contactWrapRef}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" style={labelStyle}>{fc('form_phone', 'form.phone')}</label>
              <input id="phone" name="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
                style={{ ...inputStyle, borderColor: contactHasError ? STATUS.errorBorder : inputStyle.borderColor }} />
            </div>
            <div>
              <label htmlFor="email" style={labelStyle}>{fc('form_email', 'form.email')}</label>
              <input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
                style={{ ...inputStyle, borderColor: contactHasError ? STATUS.errorBorder : inputStyle.borderColor }} />
            </div>
          </div>
          {contactHasError && (
            <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_contact', 'form.err_contact')}</p>
          )}
        </div>

        {/* Price preview */}
        {isEnhanced ? (
          payingGuests > 0 && enhancedTier ? (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.est_total')}</p>
                <p className="font-bold text-2xl" style={{ color: C.wine }}>{enhancedTotal}₾</p>
              </div>
              <div className="space-y-0.5">
                {tastingGuests > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{tastingGuests} {t(locale, 'form.guests_tasting')} × {enhancedTier.pricePerPerson}₾</p>
                )}
                {lunchGuests > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{lunchGuests} {t(locale, 'form.guests_lunch')} × {comboRatePerPerson(enhancedTier)}₾</p>
                )}
                {enhancedTier.registrationPrice > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.registration')}: {enhancedTier.registrationPrice}₾</p>
                )}
                {masterclassAmt > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{fc('form_masterclass_header', 'form.masterclass')}: {masterclassAmt}₾</p>
                )}
              </div>
            </div>
          ) : payingGuests === 0 ? null : (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <p className="text-sm" style={{ color: C.muted }}>{t(locale, 'form.price_after_submit')}</p>
            </div>
          )
        ) : bookingType === 'INDIVIDUAL' ? (
          estimatedTotal != null ? (
            <div className="rounded-lg border p-4 flex items-center justify-between" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <div>
                <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.est_total')}</p>
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>{matchedTierRate ?? basePrice}₾ × {guestCount} {t(locale, 'form.guest_plural')}</p>
              </div>
              <p className="font-bold text-2xl" style={{ color: C.wine }}>{estimatedTotal}₾</p>
            </div>
          ) : (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <p className="text-sm" style={{ color: C.muted }}>{t(locale, 'form.price_after_submit')}</p>
            </div>
          )
        ) : tierGap ? (
          <div className="rounded-lg border p-4" style={{ backgroundColor: STATUS.errorBg, borderColor: STATUS.errorBorder }}>
            <p className="text-sm font-medium" style={{ color: STATUS.errorText }}>{t(locale, 'form.no_rate', { n: guestCount })}</p>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              {mc('onsite_no_rate_detail', 'form.no_rate_detail', { n: guestCount })}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
            <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.company_rate_applies')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{t(locale, 'form.price_after_submit')}</p>
          </div>
        )}

        {status === 'error' && (
          <p className="text-sm" style={{ color: STATUS.errorText }}>{errorMsg}</p>
        )}

        <button type="submit"
          disabled={status === 'loading' || (!isEnhanced && !!tierGap)}
          className="w-full font-semibold py-3 rounded-lg transition-colors text-white"
          style={{ backgroundColor: (status === 'loading' || (!isEnhanced && tierGap)) ? 'color-mix(in srgb, var(--color-brand) 60%, var(--site-muted))' : C.wine }}>
          {status === 'loading'
            ? t(locale, 'form.submitting')
            : paymentLabelActive
              ? fc('form_submit_pay', 'form.submit_pay')
              : fc('form_submit', 'form.submit')}
        </button>

        <p className="text-xs text-center" style={{ color: C.faint }}>
          {fc('form_cancel_policy', 'form.cancel_policy')}
        </p>
      </form>
    </>
  )
}
