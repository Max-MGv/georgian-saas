'use client'

// MAINTENANCE: If you add, remove, or rename any label in this form, mirror the change in
// FIELDS.form inside saas/app/admin/content/ContentClient.tsx so the admin panel stays in sync.
// See vault/MaintenanceNotes.md §1 for full details.

import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { asTetri, formatTetri } from '@/lib/money'
import { createBooking, type BookingFormData } from '@/app/actions/createBooking'
import { useContactSelection } from '@/lib/useContactSelection'
import type { ContactChoice, OrderRole, ResolvedPriceTier } from '@/lib/contactResolution'
import { notifyNewCompany } from '@/app/actions/notifyNewCompany'
import { lineAmount, sumQuantityLines } from '@/lib/orderLines'
import { groupShownOn, localName } from '@/lib/addOns'
import { priceWineOrder } from '@/lib/winePricing'
import { countsFromVisit, findProductTier, notOffered, payingGuests as payingOf, priceCounts, PRODUCTS, productPrice, ratesForCounts, totalGuests as totalOf, type BookingVisitType, type Counts, type Product, type ProductRates } from '@/lib/pricingUtils'
import { checkBookingCounts, countRulesFromSettings, type CountRuleKey, type CountsError } from '@/lib/bookingInput'
import { t } from '@/lib/t'
import DateInput from '@/components/DateInput'
import GuestIcon from '@/components/GuestIcon'
import { tierRangeLabel } from '@/lib/tierRange'
import NationalityPicker from '@/components/NationalityPicker'
import { splitFullName } from '@/lib/splitFullName'
import { countryName } from '@/lib/countries'
import NewCompanyPopupView from '@/components/NewCompanyPopupView'
import { buildNewCompanyLabels } from '@/lib/newCompanyPopupLabels'
import AccessCodePopupView from '@/components/AccessCodePopupView'
import ContactPickerPopupView from '@/components/ContactPickerPopupView'
import { buildAccessCodeLabels } from '@/lib/accessCodePopupLabels'
import BookingConfirmPopupView, { type ReviewRow } from '@/components/BookingConfirmPopupView'
import { dispatchDemoBooked } from '@/lib/demoEvents'
import { parseWeeklyHours, getDayHours, generateHourlySlots, getLeadHours, minBookableInstant, slotMeetsLeadTime, getVisitDurationMinutes, addMinutesToSlot } from '@/lib/bookingHours'

/** A tier row, tetri per person; null = not offered; tastingLunchPrice is all-in (T-152). */
type Price = {
  id: string; minGuests: number; maxGuests: number
  tastingOnlyPrice: number | null; lunchOnlyPrice: number | null; tastingLunchPrice: number | null
}
/**
 * A company in the public list: its name, nothing else (Max, 2026-10-14: no code = unknown
 * company). Price tiers, the payment override, people and details arrive through
 * resolveCompanyContacts() once the guest has entered the code — see `proven` below. Before that,
 * every company's tiers and override were in the homepage's source (and earlier its code, KnownBugs #57).
 */
type Company = { id: string; name: string }
/** What the resolver tells the form about a company proven by its code. */
type ProvenCompany = {
  prices: ResolvedPriceTier[]
  /** The company's flat registration fee per booking, tetri (T-152 D-6). */
  registrationFee: number
  // Per-company payment override (#148). null = follow the Companies section default; true =
  // always skip; false = always require. Label-only — the real gate is shouldTakePayment().
  skipPayment: boolean | null
  /** The company's wine terms (T-22) — its % off and agreed prices per vintage — that price the wine added to the booking. Only ever here once the code is proven. */
  wineDiscountPercent: number | null
  winePrices: Record<string, number>
}
type MenuItem = { id: string; name: string; type: string }
/** One add-on (still `MasterclassItem` in the database) and the group the winery put it in (T-7). */
type AddOnItem = { id: string; name: string; nameKa: string | null; unitType: string; pricePerUnit: number }
type AddOnGroupView = {
  id: string; sortOrder: number; nameEn: string; nameKa: string | null
  showToCompanies: boolean; showToIndividuals: boolean; visitTypes: string[]
  items: AddOnItem[]
}
/** The wine group and its bottles (T-22). `price` is the WEBSITE price; a proven company's own terms are applied on top, client-side and again on the server. */
type WineGroupView = {
  id: string; sortOrder: number; nameEn: string; nameKa: string | null
  showToCompanies: boolean; showToIndividuals: boolean; visitTypes: string[]
  wines: { vintageId: string; name: string; nameKa: string | null; year: number; price: number; color: string }[]
}

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
  /** Company-booking nationality tagging (Plan-CompanyNationality), super-admin only —
   * independent of `enhancedEnabled`/`isEnhanced` below, not nested inside it. */
  nationalityBreakdownEnabled?: boolean
  hideCompanyDropdown?: boolean
  /**
   * The tenant's PER_ORDER roles that apply to bookings, with no people attached
   * (`orderRolesFor()`), in the admin's own sort order.
   *
   * Separate from the people the resolver returns per company, and deliberately so:
   * the detailed variant renders a block per non-contact-person role, and that block
   * has to exist before any company is chosen. Driving it off "does some company have
   * guides" would make the form's shape flicker as the dropdown changed. A role added
   * on the Contact Types screen appears here with no code change — which is the
   * requirement this whole rework exists for.
   */
  bookingRoles?: OrderRole[]
  menuItems?: MenuItem[]
  /** Active groups that have active items, in the winery's order. Which one a guest sees: `groupShownOn()`. */
  addOnGroups?: AddOnGroupView[]
  /** The "Wine for the table" row (T-22): the group and the winery's bookable wines at their WEBSITE price (no company terms in page props). Null = not offered. */
  wineGroup?: WineGroupView | null
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
   * The count-rule settings (`min/max_guests_*` + the three company minimums), raw strings. The form runs the
   * SAME checkBookingCounts() the server does (Plan-PricingModel §4.3) so it can say what is wrong before
   * submitting; the server still decides.
   */
  countRuleSettings?: Partial<Record<CountRuleKey, string>>
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

// splitFullName now lives in lib/splitFullName.ts so the admin New Order form
// splits a single Name box the same way (see that file for the convention).

export default function BookingForm({ locale = 'en', companies, showCompanyPrice, enhancedEnabled, nationalityBreakdownEnabled, hideCompanyDropdown = false, bookingRoles = [], menuItems = [], addOnGroups = [], wineGroup = null, minGuestsTasting = 4, minGuestsTastingLunch = 4, blockedDates = [], formContent = {}, messagesContent = {}, displayPriceTasting = null, displayPriceLunch = null, individualPrices = [], countRuleSettings = {}, onlinePaymentEnabled = DEFAULT_PAYMENT_READY, bookingLeadSplit = false, bookingLeadHours = 3, bookingLeadHoursTasting = 3, bookingLeadHoursTastingLunch = 6, workingHoursCustom = false, workingHoursOpen = '12:00', workingHoursClose = '18:00', workingHoursDaysJson = '', visitDurationTasting = 90, visitDurationTastingLunch = 180 }: Props) {
  const fc = (key: string, tKey: string) => formContent[key] || t(locale, tKey)
  const mc = (key: string, tKey: string, vars?: Record<string, string | number>) => {
    let str = messagesContent[key] || t(locale, tKey)
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v))
    return str
  }
  const [bookingType, setBookingType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL')
  // The guest's choice; `visitType` below is what applies (Lunch only exists on the company simple form only).
  const [visitChoice, setVisitChoice] = useState<BookingVisitType>('TASTING')
  const [guestInput, setGuestInput] = useState('4')
  const [guestWarning, setGuestWarning] = useState('')
  const [companyId, setCompanyId] = useState('')
  /** The chosen company, once proven by its code — null until then (and for "New company"). */
  const [proven, setProven] = useState<ProvenCompany | null>(null)
  // Company-booking nationality tags (Plan-CompanyNationality) — ISO codes, no per-country
  // count. Reset whenever the visitor switches to an INDIVIDUAL booking (see the toggle below).
  const [nationalities, setNationalities] = useState<string[]>([])
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
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  // T-21: once a picked person fills Contact Person, show it as one summary line
  // with an Edit button instead of three filled boxes. Set by applyPickedPerson,
  // cleared by Edit and wherever the form empties these fields.
  const [contactCompact, setContactCompact] = useState(false)
  // T-21: every add-on group starts collapsed to one summary row (T-7: one row per group).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  // Wine for the table (T-22): bottles per vintage id.
  const [wineQty, setWineQty] = useState<Record<string, number>>({})
  /** Which company the four fields above were last filled from — see the effect below. */
  const prevCompanyIdRef = useRef('')

  /**
   * Which role owns the form's existing name / phone / email fields.
   *
   * `contact_person` is a system role seeded per tenant and matched on its `key`, not
   * its label — labels are display-only and renameable, `key` is what code matches on
   * (Plan-ContactRoles Chunk 0). It keeps the four fields it has always had, because
   * those are the columns `Order.name/surname/phone/email` are written from
   * (decision 4). Every *other* booking role gets its own block, detailed variant only
   * — which is the brief's "we also want to add guide info as well … only in the
   * details booking option", generalised so a third role needs no code change.
   */
  const contactPersonRole = useMemo(
    () => bookingRoles.find(r => r.key === 'contact_person') ?? null,
    [bookingRoles]
  )
  const extraRoles = useMemo(
    () => bookingRoles.filter(r => r.key !== 'contact_person'),
    [bookingRoles]
  )
  const roleLabel = useCallback(
    (role: OrderRole) => (locale === 'ka' ? role.labelKa : role.labelEn) || role.labelEn,
    [locale]
  )
  const contactPersonTitle = contactPersonRole ? roleLabel(contactPersonRole) : 'Contact Person'

  /**
   * Put a picked person's details into the form.
   *
   * Only the contact_person role touches the form's own inputs; every other role is
   * rendered straight out of the hook's own state, so there is nothing to copy.
   */
  const applyPickedPerson = useCallback((person: ContactChoice, role: OrderRole) => {
    if (contactPersonRole && role.roleId !== contactPersonRole.roleId) return
    setFullName(person.name)
    if (person.phone) setPhone(person.phone)
    if (person.email) setEmail(person.email)
    setContactCompact(true)
  }, [contactPersonRole])

  const {
    selected: selectedContacts,
    contacts: pickedContacts,
    roleChoices,
    activeRole,
    resolve: resolveContacts,
    pick: pickContact,
    skip: skipContactRole,
    reopenRole,
    setTyped: setTypedContact,
    reset: resetContacts,
  } = useContactSelection({ module: 'BOOKING', onApply: applyPickedPerson })

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
  // The detailed company form's four boxes (T-152 D-3): every guest is in exactly one.
  const [tastingOnlyStr, setTastingOnlyStr] = useState('0')
  const [lunchOnlyStr, setLunchOnlyStr] = useState('0')
  const [tastingLunchStr, setTastingLunchStr] = useState('0')
  const [freeGuestsStr, setFreeGuestsStr] = useState('0')
  const [hotDishVeg, setHotDishVeg] = useState('')
  const [hotDishMeat, setHotDishMeat] = useState('')
  const [foodNotes, setFoodNotes] = useState('')
  const [mcSelections, setMcSelections] = useState<Record<string, { checked: boolean; qtyStr: string }>>({})

  const isEnhanced = !!enhancedEnabled && bookingType === 'COMPANY'
  // Only a proven company counts for pricing and the payment label — never one merely picked.
  const selectedCompany = bookingType === 'COMPANY' && companyId ? proven : null
  // A box is shown only for a product the proven company's ladder offers (D-7); before the code, all of them.
  const offers = (pr: Product) => !selectedCompany || selectedCompany.prices.length === 0 || selectedCompany.prices.some(row => productPrice(row, pr) != null)
  // Individuals and the detailed company form: Tasting / Tasting + Lunch. The company simple form adds Lunch only (D-10),
  // unless the proven company's ladder has no Lunch only price — then a Lunch only choice falls back to Tasting.
  const visitOptions: BookingVisitType[] = bookingType === 'COMPANY' && !isEnhanced && offers('lunchOnly') ?['TASTING', 'TASTING_LUNCH', 'LUNCH'] : ['TASTING', 'TASTING_LUNCH']
  const visitType: BookingVisitType = visitOptions.includes(visitChoice) ? visitChoice : 'TASTING'
  function setVisitType(v: BookingVisitType) {
    setVisitChoice(v)
    // A tasting visit has no lunch boxes (D-9) — clear them so nothing hidden is sent or priced.
    if (v === 'TASTING') { setLunchOnlyStr('0'); setTastingLunchStr('0') }
  }
  // One reading of the count-rule settings, the server's (Lunch only follows Tasting + Lunch, A-5).
  const countRules = countRulesFromSettings(k => countRuleSettings[k] ?? (k === 'min_guests_tasting' ? String(minGuestsTasting) : k === 'min_guests_tasting_lunch' ? String(minGuestsTastingLunch) : ''), visitType, bookingType)
  const minGuests = countRules.groupMin ?? (visitType === 'TASTING' ? minGuestsTasting : minGuestsTastingLunch)
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
  // Only summarise a contact the guest could submit as-is; anything missing shows the boxes.
  const showContactSummary = contactCompact && fullName.trim() !== '' && (!!phone || !!email) && !contactHasError
  const timeSlotHasError = attemptedSubmit && (!timeSlot || !availableSlots.includes(timeSlot))

  function handleDateChange(date: string) {
    setSelectedDate(date)
    const slots = slotsForDate(date)
    if (slots.length > 0 && !slots.includes(timeSlot)) setTimeSlot(slots[0])
  }

  // Independent of isEnhanced by design (Plan-CompanyNationality Chunk 1) — shows for any
  // COMPANY booking once the tenant flag is on, enhanced mode or not.
  const showNationalityPicker = !!nationalityBreakdownEnabled && bookingType === 'COMPANY'
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

  /**
   * A company was chosen from the dropdown.
   *
   * With a code, ask for it. Without one, resolve immediately so this company's people
   * can be offered — before Chunk 7 this branch copied the company's own contact
   * columns, and those columns no longer exist. It also closes the gap Feature 201
   * left behind: the form can now tell "has people" from "has a code", so a company
   * with people but **no** accessCode is no longer unreachable.
   */
  useEffect(() => {
    if (bookingType !== 'COMPANY' || hideCompanyDropdown) return
    resetContacts()
    /**
     * Clear the contact_person fields too — but only when leaving a company we had
     * actually filled them from.
     *
     * Found by walking the form in Chunk 7: the hook resets its own state, but these
     * four inputs belong to the form, so switching companies left the *previous*
     * company's contact person sitting in them. Picking "I am not on this list" for
     * the new company would then have submitted a booking for company B attributed to
     * a person who works at company A. The direct-code path already cleared them
     * (`clearDirectCode`); the dropdown path never did — H3's "reset it everywhere",
     * with one path missed, exactly as that hurdle predicts.
     *
     * Guarded on there having *been* a previous company so a guest who typed their own
     * details first and only then chose a company does not watch them vanish.
     */
    if (prevCompanyIdRef.current && prevCompanyIdRef.current !== companyId) {
      setFullName(''); setPhone(''); setEmail(''); setContactCompact(false)
    }
    prevCompanyIdRef.current = companyId
    setShowCodePopup(false)
    setProven(null)
    // '__new__' is the dropdown's sentinel, not a company — handleSubmit deals with it.
    if (!companyId || companyId === '__new__') return
    if (!companies.some(c => c.id === companyId)) return
    // Every listed company is proven by its code before anything about it is used
    // (Max, 2026-10-14). The list only holds companies that have a code to give.
    setCodeInput('')
    setCodeError('')
    setShowCodePopup(true)
  }, [companyId, bookingType, hideCompanyDropdown])

  async function handleCodeSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!codeInput.trim()) return
    setCodeLoading(true)
    setCodeError('')
    const result = await resolveContacts({ companyId, code: codeInput })
    setCodeLoading(false)
    if ('error' in result) {
      setCodeError(mc('onsite_access_code_error', 'form.access_code_error'))
      return
    }
    setProven({ prices: result.company.bookingPrices, registrationFee: result.company.bookingRegistrationFee, skipPayment: result.company.skipPayment, wineDiscountPercent: result.company.wineDiscountPercent, winePrices: result.company.winePrices })
    // Ask the browser to save the credential natively (triggers "Save password?" prompt)
    if (typeof window !== 'undefined' && 'PasswordCredential' in window) {
      try {
        const companyName = companies.find(c => c.id === companyId)?.name ?? companyId
        // @ts-ignore — PasswordCredential is not in all TS lib versions
        const cred = new window.PasswordCredential({ id: companyName, password: codeInput, name: companyName })
        await navigator.credentials.store(cred)
      } catch {}
    }
    setShowCodePopup(false)
    // Nothing else to do here. A person's own code already named them and the hook has
    // applied their details; a company code leaves a queue of roles to ask about, and
    // the picker below opens itself off `activeRole`. When person codes are on, the
    // resolver deliberately returns no choices at all, so no list is ever shown.
  }

  function handleNotARep() {
    setShowCodePopup(false)
    setCompanyId('')
    setProven(null)
    resetContacts()
    setBookingType('INDIVIDUAL')
  }

  async function handleDirectCodeSubmit() {
    if (!directCode.trim()) return
    setDirectCodeLoading(true)
    setDirectCodeError('')
    // No company chosen first — a tenant-wide lookup. Same resolver, same rules: a code
    // typed directly must behave identically to one entered after the dropdown.
    const result = await resolveContacts({ code: directCode })
    setDirectCodeLoading(false)
    if ('error' in result) {
      setDirectCodeError(mc('onsite_access_code_direct_not_recognised', 'form.access_code_direct_not_recognised'))
      return
    }
    setCompanyId(result.company.id)
    setDirectCompanyName(result.company.name)
    setProven({ prices: result.company.bookingPrices, registrationFee: result.company.bookingRegistrationFee, skipPayment: result.company.skipPayment, wineDiscountPercent: result.company.wineDiscountPercent, winePrices: result.company.winePrices })
  }

  function clearDirectCode() {
    setCompanyId('')
    setProven(null)
    setDirectCompanyName('')
    setDirectCode('')
    setDirectCodeError('')
    resetContacts()
    setFullName(''); setPhone(''); setEmail(''); setContactCompact(false)
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
      dispatchDemoBooked(splitFullName(fullName))
    } else {
      setNewCoStatus('error')
    }
  }

  /**
   * Who to record against this booking, one entry per contact role.
   *
   * The contact_person entry is rebuilt from the **live** form fields rather than from
   * whatever the picker stored, because the guest may have picked someone and then
   * edited the boxes — and those same four fields are what `Order.name/surname/phone/
   * email` are written from (decision 4). Its `personId` is kept when one was picked,
   * so the link survives the edit while the snapshot stays truthful.
   *
   * Every other role comes straight from the hook, whether the person was picked from
   * the list or typed in by hand after "I am not on this list". A typed-in person has
   * no `personId` and that is the point: Chunk 9 stores the facts as snapshots, so
   * somebody who has not been added in the admin panel yet still reaches the order.
   */
  function buildContacts() {
    if (bookingType !== 'COMPANY') return undefined
    const others = pickedContacts.filter(c => c.roleId !== contactPersonRole?.roleId)
    const contactPerson = contactPersonRole
      ? (() => {
          const name = fullName.trim()
          if (!name) return null
          return {
            roleId: contactPersonRole.roleId,
            personId: selectedContacts[contactPersonRole.roleId]?.personId,
            name,
            phone: phone || null,
            email: email || null,
          }
        })()
      : null
    const all = contactPerson ? [contactPerson, ...others] : others
    return all.length > 0 ? all : undefined
  }

  /** Shared with handleNewCompanySubmit so a booking submitted through the
   * "New Company?" popup carries the exact same payload a normal submit
   * would — only `requestedCompanyName` differs.
   *
   * ⚠️ MaintenanceNotes #1 / hurdle H3: this is the ONLY place a booking field may be
   * added. A field set in handleSubmit's own createBooking() call instead is silently
   * dropped by the "New Company?" submit path. That has already happened once. */
  function buildBookingPayload(): BookingFormData {
    return {
      bookingType,
      visitType,
      // '__new__' is the dropdown's "+ New Company" sentinel (see the <select>
      // above) — never a real id, so it must never reach the server as one.
      companyId: bookingType === 'COMPANY' && companyId && companyId !== '__new__' ? companyId : undefined,
      // The code the guest confirmed for that company — the server checks it again (KnownBugs #78).
      companyCode: bookingType === 'COMPANY' && companyId && companyId !== '__new__'
        ? (hideCompanyDropdown ? directCode : codeInput) || undefined
        : undefined,
      // Replaces `guideId` (Plan-ContactRoles Chunk 7). That column was write-only —
      // written on every company booking and read by nothing, so the attribution the
      // guides feature existed for was never actually delivered anywhere (finding F1).
      // Chunk 9 turns these into OrderContact rows with snapshots; Chunk 10 is where
      // they finally get shown.
      contacts: buildContacts(),
      nationalities: showNationalityPicker && nationalities.length > 0 ? nationalities : undefined,
      date: selectedDate,
      timeSlot,
      guestCount: isEnhanced ? totalGuests : guestCount,
      // The four boxes on the detailed company form; the server ignores them anywhere else (A-4).
      ...(isEnhanced ? { boxes: counts } : {}),
      ...splitFullName(fullName),
      email,
      phone,
      ...(isEnhanced ? {
        // A dish picked before switching to a Tasting visit stays in state but is not sent — no lunch guest, no dish (A-11).
        hotDishVegetable: counts.lunchOnly + counts.tastingLunch > 0 ? hotDishVeg || null : null,
        hotDishMeat: counts.lunchOnly + counts.tastingLunch > 0 ? hotDishMeat || null : null,
        foodNotes: foodNotes || null,
      } : {}),
      // Any form can carry add-ons now (T-7): the groups decide who is offered what, and the server checks it again.
      masterclassLines: activeMcLines,
      // Wine for the table (T-22): only ids and bottle counts — the server reads the names, the prices and the company's terms itself.
      wineLines: wineChosen.map(w => ({ vintageId: w.vintageId, quantity: wineQty[w.vintageId]! })),
    }
  }

  // Who is coming. Detailed company form: the four boxes. Everyone else: one count, all on the visit type's
  // product (A-4) — exactly the counts the server will build.
  // Only a box on screen counts: a number typed before the code was proven stays in state but is neither priced
  // nor sent once the proven company turns out not to sell that product — otherwise the guest is stuck behind a
  // "not offered" error whose box they can no longer see (blind review, Chunk 11).
  const boxNum = (v: string) => Math.max(parseInt(v) || 0, 0)
  const lunchVisit = visitType !== 'TASTING'
  const counts: Counts = isEnhanced
    ? {
        tastingOnly: offers('tastingOnly') ? boxNum(tastingOnlyStr) : 0,
        lunchOnly: lunchVisit && offers('lunchOnly') ? boxNum(lunchOnlyStr) : 0,
        tastingLunch: lunchVisit && offers('tastingLunch') ? boxNum(tastingLunchStr) : 0,
        free: boxNum(freeGuestsStr),
      }
    : countsFromVisit(visitType, guestCount)
  const totalGuests = totalOf(counts)
  const payingGuests = payingOf(counts)
  const freeGuests = counts.free

  // The server's own check, mirrored (KnownBugs #93 / Q-3): shown under the guest boxes, blocks submit.
  const countCheck = checkBookingCounts({
    bookingType, layout: isEnhanced ? 'boxes' : 'single', form: 'public', visitType,
    guestCount, tastingOnly: counts.tastingOnly, lunchOnly: counts.lunchOnly, tastingLunch: counts.tastingLunch, free: counts.free,
  }, countRules)
  const productName = (pr: Product) => t(locale, pr === 'tastingOnly' ? 'form.product_tasting_only' : pr === 'lunchOnly' ? 'form.product_lunch_only' : 'form.product_tasting_lunch')
  function countErrorText(e: CountsError): string {
    if (e.code === 'below_group_min') return mc('onsite_err_min_guests', 'form.err_min_guests', { min: e.min })
    if (e.code === 'below_product_min') return mc('onsite_err_product_min', 'form.err_product_min', { min: e.min, product: productName(e.product) })
    if (e.code === 'too_many_free') return mc('onsite_err_too_many_free', 'form.err_too_many_free', { max: e.max })
    if (e.code === 'visit_mismatch' && visitType === 'TASTING_LUNCH') return mc('onsite_err_visit_mismatch', 'form.err_visit_mismatch')
    return mc('onsite_err_guest_counts', 'form.err_guest_counts')
  }
  const countError = !countCheck.ok ? countErrorText(countCheck.error) : null
  const enhancedGuestsHaveError = attemptedSubmit && isEnhanced && !!countError

  // ── Add-ons (T-7) ──
  // The groups this guest is offered: right audience, right visit type (lib/addOns.ts — the server asks the same
  // question again). A selection in a group that is no longer offered (visit type or booking type changed) stays in
  // state but is neither priced nor sent, and comes back if the guest switches back.
  const visibleGroups = addOnGroups.filter(g => g.items.length > 0 && groupShownOn({ active: true, showToCompanies: g.showToCompanies, showToIndividuals: g.showToIndividuals, visitTypes: g.visitTypes }, bookingType, visitType))
  const visibleItems = visibleGroups.flatMap(g => g.items)
  // Per person = the paying guests, flat = once, per piece = what the guest typed (the same rule the server applies).
  const addOnQty = (m: AddOnItem) => m.unitType === 'FLAT' ? 1 : m.unitType === 'PER_PERSON' ? Math.max(payingGuests, 1) : Math.max(parseInt(mcSelections[m.id]?.qtyStr || '1') || 1, 1)
  const activeMcLines = visibleItems
    .filter(m => mcSelections[m.id]?.checked)
    .map(m => ({ masterclassItemId: m.id, quantity: addOnQty(m), pricePerUnit: m.pricePerUnit }))
  const masterclassAmt = sumQuantityLines(activeMcLines)
  const groupTitle = (g: AddOnGroupView) => localName(g.nameEn, g.nameKa, locale)
  const itemTitle = (m: AddOnItem) => localName(m.name, m.nameKa, locale)

  // ── Wine for the table (T-22) ──
  // Offered like any group (audience + visit type). Prices: the website price, or — once the company is PROVEN by its code — its own
  // agreed prices and % (the resolver sent them with the proof; before that nothing about the company is known). Each line is rounded
  // on its own; the server prices it again.
  const wineVisible = !!wineGroup && wineGroup.wines.length > 0
    && groupShownOn({ active: true, showToCompanies: wineGroup.showToCompanies, showToIndividuals: wineGroup.showToIndividuals, visitTypes: wineGroup.visitTypes }, bookingType, visitType)
  const wineTerms = bookingType === 'COMPANY' && selectedCompany ? selectedCompany : null
  const wineChosen = wineVisible ? wineGroup!.wines.filter(w => (wineQty[w.vintageId] ?? 0) > 0) : []
  const winePricing = priceWineOrder(
    wineChosen.map(w => ({ vintageId: w.vintageId, quantity: wineQty[w.vintageId]!, standardPrice: w.price })),
    wineTerms?.winePrices ?? {}, wineTerms?.wineDiscountPercent ?? null,
  )
  const wineAmt = winePricing.total
  const wineBottles = wineChosen.reduce((n, w) => n + wineQty[w.vintageId]!, 0)
  const wineTitle = wineGroup ? localName(wineGroup.nameEn, wineGroup.nameKa, locale) : ''
  /** One bottle of this wine as this guest would pay for it — shows the reason (agreed / −10%) before anything is added. */
  const winePriceNote = (w: WineGroupView['wines'][number]) => {
    const one = priceWineOrder([{ vintageId: w.vintageId, quantity: 1, standardPrice: w.price }], wineTerms?.winePrices ?? {}, wineTerms?.wineDiscountPercent ?? null).lines[0]!
    const std = formatTetri(asTetri(one.unitPrice))
    return one.negotiated ? `${std} · ${t(locale, 'form.wine_agreed')}`
      : one.discountPercent ? `${std} −${one.discountPercent}% = ${formatTetri(asTetri(one.lineTotal))}`
      : std
  }
  function setWineBottles(id: string, q: number) {
    setWineQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(99, q)) }))
  }
  // Where the wine row sits among the groups: the winery's own order (Admin → Add-ons).
  const firstAfterWine = wineVisible ? visibleGroups.find(g => g.sortOrder > wineGroup!.sortOrder) : undefined
  // A function, not a value: it uses labelStyle, which is declared further down this component.
  const renderWineRow = () => wineVisible ? (
    <div key={wineGroup!.id}>
      <label style={labelStyle}>{wineTitle}</label>
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
        <button type="button" aria-expanded={!!openGroups[wineGroup!.id]} aria-controls={`wine-list-${wineGroup!.id}`}
          onClick={() => setOpenGroups(prev => ({ ...prev, [wineGroup!.id]: !prev[wineGroup!.id] }))}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-left"
          style={{ backgroundColor: C.bg, color: wineBottles > 0 ? C.text : C.muted }}>
          <span>
            {wineBottles > 0
              ? `${wineBottles} ${t(locale, wineBottles === 1 ? 'form.bottle_singular' : 'form.bottle_plural')} · ${formatTetri(asTetri(wineAmt))}`
              : t(locale, 'form.addon_choose', { name: wineTitle, n: wineGroup!.wines.length })}
          </span>
          <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: C.faint, transform: openGroups[wineGroup!.id] ? 'rotate(180deg)' : undefined }} fill="none" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {openGroups[wineGroup!.id] && (
          <div id={`wine-list-${wineGroup!.id}`} className="divide-y border-t" style={{ borderColor: C.border }}>
            {wineGroup!.wines.map(w => {
              const q = wineQty[w.vintageId] ?? 0
              const name = `${localName(w.name, w.nameKa, locale)} ${w.year}`
              return (
                <div key={w.vintageId} className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: C.bg }}>
                  <span aria-hidden className="flex-shrink-0 rounded-sm" style={{ width: 8, height: 26, backgroundColor: w.color }} />
                  <div className="flex-1 min-w-0 text-sm" style={{ color: C.text }}>
                    {name}
                    <span className="block text-xs" style={{ color: C.faint }}>{winePriceNote(w)}</span>
                  </div>
                  <div className="flex items-center rounded-md border overflow-hidden flex-shrink-0" style={{ borderColor: C.border }}>
                    <button type="button" onClick={() => setWineBottles(w.vintageId, q - 1)} disabled={q === 0}
                      aria-label={`${t(locale, 'form.wine_less')} — ${name}`}
                      className="w-8 h-8 text-base disabled:opacity-40" style={{ color: C.text, backgroundColor: C.bg }}>−</button>
                    <output aria-label={`${name}`} className="min-w-[2rem] text-center text-sm tabular-nums" style={{ color: C.text }}>{q}</output>
                    <button type="button" onClick={() => setWineBottles(w.vintageId, q + 1)}
                      aria-label={`${t(locale, 'form.wine_more')} — ${name}`}
                      className="w-8 h-8 text-base" style={{ color: C.text, backgroundColor: C.bg }}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  ) : null

  // ── Price preview: priceCounts(), the server's own arithmetic (§4.2) — it cannot drift from it ──
  // Individuals price off the Individuals ladder; a company only once proven by its code. Each product looks up
  // its own row by its own count (D-2). A product with guests that the ladder does not offer is "not offered"
  // (D-7): the server refuses it, so the form says so and blocks submit.
  const priceLadder: Price[] = bookingType === 'INDIVIDUAL' ? individualPrices : (selectedCompany?.prices ?? [])
  const previewRates: ProductRates | null = priceLadder.length
    ? ratesForCounts(priceLadder, counts, bookingType === 'INDIVIDUAL' ? 0 : (selectedCompany?.registrationFee ?? 0))
    : null
  const missingProducts: Product[] = previewRates && payingGuests > 0 ? notOffered(previewRates, counts) : []
  const previewTotal: number | null = previewRates && payingGuests > 0 && missingProducts.length === 0
    ? priceCounts(previewRates, counts, { masterclass: masterclassAmt, extras: 0, wine: wineAmt })
    : null
  // Individuals with no ladder: the home page's display price, as before (an estimate, never stored).
  const basePrice = visitType === 'TASTING' ? displayPriceTasting : displayPriceLunch
  const estimatedTotal: number | null = previewTotal ?? (bookingType === 'INDIVIDUAL' && basePrice != null ? basePrice * guestCount + masterclassAmt + wineAmt : null)
  const individualRate: number | null = bookingType === 'INDIVIDUAL'
    ? (previewRates ? previewRates[visitType === 'TASTING' ? 'tastingOnly' : 'tastingLunch'] : basePrice)
    : null
  const enhancedTotal = previewTotal ?? masterclassAmt + wineAmt

  // T-272 (Max, 2026-10-23): an individual's visit tile shows the Individuals row that prices the current guest
  // count — its range ("3–6 guests"; the last row "7+ guests"; a one-number row "1 guest") and that row's price —
  // instead of the starred display price. Same row lookup as the price preview (findProductTier, A-7). No ladder →
  // null, and the tile keeps the display price. The home page's package cards are a preview and stay as they are.
  const individualTileTier = (visit: 'TASTING' | 'TASTING_LUNCH'): { range: string; price: number | null } | null => {
    const product: Product = visit === 'TASTING' ? 'tastingOnly' : 'tastingLunch'
    const row = findProductTier(individualPrices, product, guestCount)
    if (!row) return null
    const range = tierRangeLabel(locale, row, individualPrices.filter(p => productPrice(p, product) != null))
    return { range, price: productPrice(row, product) }
  }

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

  // Add-ons are part of the total, so the guest sees them listed — one row each,
  // "name × qty" and its price. (Max, QA 2026-10-16 F7; every form since T-7)
  const masterclassReviewRows: ReviewRow[] = activeMcLines.map(l => {
    const item = visibleItems.find(m => m.id === l.masterclassItemId)
    return {
      label: `${item ? itemTitle(item) : t(locale, 'form.add_ons')}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`,
      value: formatTetri(asTetri(lineAmount(l))),
    }
  })

  // Wine for the table: one row per wine, "name year × bottles" and what it costs.
  const wineReviewRows: ReviewRow[] = winePricing.lines.map(l => {
    const w = wineGroup?.wines.find(x => x.vintageId === l.vintageId)
    return { label: `${w ? localName(w.name, w.nameKa, locale) : ""} ${w?.year ?? ""} × ${l.quantity}`.trim(), value: formatTetri(asTetri(l.lineTotal)) }
  })

  const confirmVisitRows: ReviewRow[] = [
    { label: fc('form_visit_type', 'form.visit_type'), value: visitType === 'LUNCH' ? fc('form_lunch_only', 'form.lunch_only') : fc(visitType === 'TASTING' ? 'form_tasting' : 'form_tasting_lunch', visitType === 'TASTING' ? 'form.tasting' : 'form.tasting_lunch') },
    { label: fc('form_date', 'form.date'), value: confirmDateLabel },
    { label: t(locale, 'form.confirm_arrive'), value: timeSlot },
    ...masterclassReviewRows,
    ...wineReviewRows,
  ]

  // The other contact roles (Guide, …) the guest filled in — shown like Contact Person. (F7)
  const extraRoleReviewRows: ReviewRow[] = isEnhanced
    ? extraRoles.flatMap(role => {
        const chosen = selectedContacts[role.roleId]
        const name = chosen?.name?.trim()
        if (!name) return []
        return [{ label: roleLabel(role), value: chosen?.phone ? `${name} · ${chosen.phone}` : name }]
      })
    : []

  // Shown on the review sheet for either branch below — nationality tagging is independent
  // of isEnhanced, so it isn't specific to one guest-count layout or the other.
  const nationalityReviewRows: ReviewRow[] = showNationalityPicker && nationalities.length > 0
    ? [{ label: t(locale, 'form.nationality'), value: nationalities.map(countryName).join(', ') }]
    : []

  const confirmGuestRows: ReviewRow[] = isEnhanced
    ? [
        ...PRODUCTS.filter(pr => counts[pr] > 0).map(pr => ({ label: productName(pr), value: String(counts[pr]) })),
        ...(freeGuests > 0 ? [{ label: t(locale, 'form.guests_free'), value: String(freeGuests) }] : []),
        { label: t(locale, 'form.total'), value: String(totalGuests) },
        { label: contactPersonTitle, value: fullName.trim() },
        ...(phone ? [{ label: fc('form_phone', 'form.phone'), value: phone }] : []),
        ...(email ? [{ label: fc('form_email', 'form.email'), value: email }] : []),
        ...extraRoleReviewRows,
        ...nationalityReviewRows,
      ]
    : [
        { label: fc('form_num_guests', 'form.num_guests'), value: String(guestCount) },
        { label: contactPersonTitle, value: fullName.trim() },
        ...(phone ? [{ label: fc('form_phone', 'form.phone'), value: phone }] : []),
        ...(email ? [{ label: fc('form_email', 'form.email'), value: email }] : []),
        ...nationalityReviewRows,
      ]

  // Same "don't invent a number" rule as the live price preview below: only a
  // known, tier-matched total is shown; an unresolved company rate or unset
  // display price hides the row entirely rather than showing a guess.
  const confirmTotalValue = isEnhanced
    ? (previewTotal != null ? formatTetri(asTetri(previewTotal)) : null)
    : bookingType === 'INDIVIDUAL'
      ? (estimatedTotal != null ? formatTetri(asTetri(estimatedTotal)) : null)
      : (showCompanyPrice && previewTotal != null ? formatTetri(asTetri(previewTotal)) : null)

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
      // #phone specifically, not the first input in this ref's subtree — that's now
      // the merged Name field, not Phone, since this wrapper grew a third field.
      contactWrapRef.current?.querySelector<HTMLInputElement>('#phone')?.focus()
      return
    }
    if (!timeSlot || !availableSlots.includes(timeSlot)) {
      timeSlotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      timeSlotRef.current?.focus()
      return
    }
    // The shared count check (boxes, visit type vs boxes, minimums) and "not offered" products — the server refuses both.
    if ((isEnhanced && countError) || missingProducts.length > 0) {
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
      setNewCoContact(fullName.trim())
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
      dispatchDemoBooked(splitFullName(fullName)) // no-op outside the demo tenant — see lib/demoEvents.ts
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
            {/* confirmedPrice is the server's Order.totalPrice — tetri. Rendered
                raw until 2026-09-18, so a ₾280 booking told the guest "28000"
                (bug #43). Never interpolate a money value; see lib/money.ts. */}
            <p className="text-2xl font-bold" style={{ color: C.wine }}>{formatTetri(asTetri(confirmedPrice))}</p>
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

      {/* Contact picker — the step after a company-level code (KnownBugs #55), now once
          per role the company has people in. `activeRole` is the front of the hook's
          queue, so picking or skipping simply advances it; when the queue empties the
          popup disappears on its own. Never opens at all when person codes are on. */}
      {activeRole && (
        <ContactPickerPopupView
          title={mc('onsite_contact_picker_title', 'form.contact_picker_title')}
          intro={mc('onsite_contact_picker_intro', 'form.contact_picker_intro', {
            company: companies.find(c => c.id === companyId)?.name ?? directCompanyName ?? '',
            role: roleLabel(activeRole),
          })}
          people={activeRole.people}
          onPick={pickContact}
          onNotListed={skipContactRole}
          labels={{ notListed: t(locale, 'form.contact_picker_not_listed') }}
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
            <ToggleButton active={bookingType === 'INDIVIDUAL'} onClick={() => { setBookingType('INDIVIDUAL'); setCompanyId(''); setNationalities([]); resetContacts() }}>
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

        {/* Nationality tagging (Plan-CompanyNationality) — independent of isEnhanced */}
        {showNationalityPicker && (
          <div>
            <label style={labelStyle}>{t(locale, 'form.nationality')}</label>
            <NationalityPicker
              value={nationalities}
              onChange={setNationalities}
              placeholder={t(locale, 'form.nationality_placeholder')}
              emptyText={t(locale, 'form.nationality_empty')}
            />
          </div>
        )}

        {/* Visit type */}
        <div>
          <label style={labelStyle}>{fc('form_visit_type', 'form.visit_type')}</label>
          <div className={visitOptions.length === 3 ? 'grid grid-cols-1 sm:grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}>
            {([
              { value: 'TASTING',       contentKey: 'form_tasting',       labelKey: 'form.tasting',       price: displayPriceTasting },
              { value: 'TASTING_LUNCH', contentKey: 'form_tasting_lunch', labelKey: 'form.tasting_lunch', price: displayPriceLunch },
              { value: 'LUNCH',         contentKey: 'form_lunch_only',    labelKey: 'form.lunch_only',    price: null },
            ] as const).filter(opt => visitOptions.includes(opt.value)).map(opt => {
              // T-272: an individual sees the row their guest count falls in, not the starred display price.
              const tier = bookingType === 'INDIVIDUAL' && opt.value !== 'LUNCH' ? individualTileTier(opt.value) : null
              const price = tier ? tier.price : opt.price
              return (
                // flex-col + mt-auto: the name sits at the top and the guests/price lines at the bottom, so two tiles
                // line up even when one name wraps (Georgian on a phone — T-272, 2026-10-23).
                <button key={opt.value} type="button" onClick={() => setVisitType(opt.value)}
                  className="py-3 px-4 rounded-lg border text-left transition-colors flex flex-col"
                  style={{ backgroundColor: visitType === opt.value ? 'color-mix(in srgb, var(--color-brand) 8%, var(--site-surface))' : C.bg, borderColor: visitType === opt.value ? C.wine : C.border, color: C.text }}>
                  <div className="font-medium text-sm">{fc(opt.contentKey, opt.labelKey)}</div>
                  <div className="mt-auto">
                    {tier && (
                      <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: C.faint }}>
                        <GuestIcon />{tier.range}
                      </div>
                    )}
                    {(bookingType === 'COMPANY' || price != null) && (
                      <div className="text-sm mt-0.5" style={{ color: C.wine }}>
                        {bookingType === 'COMPANY' ? t(locale, 'form.company_rate') : `${price != null ? formatTetri(asTetri(price)) : ''} ${t(locale, 'form.per_pp')}`}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
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
                : <option value="">{t(locale, selectedDate ? 'form.no_slots' : 'form.select_date_first')}</option>}
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
            {/* T-152 D-9: Tasting → Tasting only + Free; Tasting + Lunch → all three products + Free. A product the
                company does not offer has no box (D-7). Every guest is in exactly one box (D-3). */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { labelKey: 'form.product_tasting_only',  value: tastingOnlyStr,  set: setTastingOnlyStr,  hidden: !offers('tastingOnly') },
                { labelKey: 'form.product_lunch_only',    value: lunchOnlyStr,    set: setLunchOnlyStr,    hidden: visitType === 'TASTING' || !offers('lunchOnly') },
                { labelKey: 'form.product_tasting_lunch', value: tastingLunchStr, set: setTastingLunchStr, hidden: visitType === 'TASTING' || !offers('tastingLunch') },
                { labelKey: 'form.guests_free',           value: freeGuestsStr,   set: setFreeGuestsStr,   hidden: false },
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
            {enhancedGuestsHaveError && countError && (
              <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{countError}</p>
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

        {/* Add-ons (T-7): one collapsible row per group the winery offers this guest. Shown on every form — the
            groups carry the rule (Admin → Add-ons: companies / individuals, and which visit types). */}
        {visibleGroups.map(g => {
          const open = !!openGroups[g.id]
          const chosen = activeMcLines.filter(l => g.items.some(m => m.id === l.masterclassItemId))
          const chosenAmt = sumQuantityLines(chosen)
          return (
          <Fragment key={g.id}>
          {firstAfterWine === g && renderWineRow()}
          <div>
            <label style={labelStyle}>{groupTitle(g)}</label>
            {/* T-21: collapsed to one summary row by default — the full list was
                always open and took a lot of room for an optional extra. */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
              <button type="button" aria-expanded={open} aria-controls={`addon-list-${g.id}`}
                onClick={() => setOpenGroups(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-left"
                style={{ backgroundColor: C.bg, color: chosen.length > 0 ? C.text : C.muted }}>
                <span>
                  {chosen.length > 0
                    ? `${t(locale, 'form.mc_selected', { n: chosen.length })} · ${formatTetri(asTetri(chosenAmt))}`
                    : t(locale, 'form.addon_choose', { name: groupTitle(g), n: g.items.length })}
                </span>
                <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: C.faint, transform: open ? 'rotate(180deg)' : undefined }} fill="none" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
              <div id={`addon-list-${g.id}`} className="divide-y border-t" style={{ borderColor: C.border }}>
              {g.items.map(m => {
                const sel = mcSelections[m.id]
                const price = formatTetri(asTetri(m.pricePerUnit))
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: C.bg }}>
                    <input type="checkbox" id={`mc-${m.id}`} checked={!!sel?.checked}
                      onChange={e => toggleMc(m.id, e.target.checked)}
                      className="rounded" />
                    <label htmlFor={`mc-${m.id}`} className="flex-1 text-sm cursor-pointer" style={{ color: C.text }}>
                      {itemTitle(m)}
                      {/* Per person: the guest sees what it comes to and never types a number. Flat: once. Per piece: a quantity box. */}
                      <span className="block text-xs" style={{ color: C.faint }}>
                        {m.unitType === 'PER_PERSON'
                          ? t(locale, 'form.addon_per_person', { price, n: Math.max(payingGuests, 1), guests: t(locale, Math.max(payingGuests, 1) === 1 ? 'form.guest_singular' : 'form.guest_plural'), total: formatTetri(asTetri(m.pricePerUnit * Math.max(payingGuests, 1))) })
                          : m.unitType === 'FLAT'
                            ? t(locale, 'form.addon_flat', { price })
                            : t(locale, 'form.addon_per_piece', { price })}
                      </span>
                    </label>
                    {sel?.checked && m.unitType === 'PER_PIECE' && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.qty')}</span>
                        <input type="number" min={1} max={999} value={sel.qtyStr} aria-label={`${t(locale, 'form.qty')} — ${itemTitle(m)}`}
                          onChange={e => setMcQty(m.id, e.target.value)}
                          onBlur={e => setMcQty(m.id, String(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 999)))}
                          className="w-16 rounded border px-2 py-1 text-sm text-center" style={inputStyle} />
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
              )}
            </div>
          </div>
          </Fragment>
          )
        })}
        {/* The wine row after the last add-on group (or alone), when it is not placed before one above. */}
        {!firstAfterWine && renderWineRow()}

        {/* Enhanced: Food notes */}
        {isEnhanced && (
          <div>
            <label htmlFor="foodNotes" style={labelStyle}>{fc('form_food_notes', 'form.food_notes')} <span style={{ color: C.faint }}>({fc('form_food_notes_sub', 'form.food_notes_sub')})</span></label>
            <textarea id="foodNotes" rows={3} value={foodNotes} onChange={e => setFoodNotes(e.target.value)}
              placeholder={fc('form_food_notes_placeholder', 'form.food_notes_placeholder')}
              className="w-full rounded-lg border px-3 py-2.5 text-sm resize-none" style={inputStyle} />
          </div>
        )}

        {/* Per-role contact details — detailed variant only.
            "now we also want to add guide info as well allright? only in the details
            booking option" (Plan-ContactRoles §1). One block per booking role other
            than contact_person, which already owns the name/phone/email fields below.
            Driven by the tenant's role list, so adding a third contact type on the
            Contact Types screen makes a third block appear with no code change.

            Headings are the role's own admin-managed label from the database, which is
            why none of this is in FIELDS.form — MaintenanceNotes §1's own test for a
            new detailed-only section is "fixed label, or backed by other admin data?",
            and this is the latter, like the masterclass and menu rows above. */}
        {isEnhanced && extraRoles.map(role => {
          const chosen = selectedContacts[role.roleId]
          const offered = roleChoices.find(r => r.roleId === role.roleId)
          return (
            <div key={role.roleId}>
              <div className="flex items-center justify-between mb-1.5">
                <label style={{ ...labelStyle, marginBottom: 0 }}>{roleLabel(role)}</label>
                {/* Re-open the list for this one role. Only offered when there IS a
                    list: with person codes on the resolver sends none, deliberately,
                    and a button that opens an empty popup would be a dead control. */}
                {offered && offered.people.length > 0 && (
                  <button type="button" onClick={() => reopenRole(role.roleId)}
                    className="text-xs font-medium transition-all hover:opacity-75 active:scale-95"
                    style={{ color: 'var(--color-brand)' }}>
                    {t(locale, 'form.contact_role_choose')}
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  aria-label={`${roleLabel(role)} — ${t(locale, 'form.contact_role_name')}`}
                  placeholder={t(locale, 'form.contact_role_name')}
                  value={chosen?.name ?? ''}
                  onChange={e => setTypedContact(role.roleId, { name: e.target.value, phone: chosen?.phone, email: chosen?.email })}
                  className="rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
                <input
                  type="tel"
                  aria-label={`${roleLabel(role)} — ${t(locale, 'form.contact_role_phone')}`}
                  placeholder={t(locale, 'form.contact_role_phone')}
                  value={chosen?.phone ?? ''}
                  onChange={e => setTypedContact(role.roleId, { name: chosen?.name ?? '', phone: e.target.value, email: chosen?.email })}
                  className="rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
                <input
                  type="email"
                  aria-label={`${roleLabel(role)} — ${t(locale, 'form.contact_role_email')}`}
                  placeholder={t(locale, 'form.contact_role_email')}
                  value={chosen?.email ?? ''}
                  onChange={e => setTypedContact(role.roleId, { name: chosen?.name ?? '', phone: chosen?.phone, email: e.target.value })}
                  className="rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
              </div>
            </div>
          )
        })}

        {/* Contact Person — Name/Phone/Email in one row, styled to match the
            per-role blocks above (Guide etc.) rather than two separate
            2-column grids (2026-09-30, Max's request for visual consistency).
            Title is the contact_person role's own live label (Settings →
            Contact Types) — same mechanism the role blocks above use, since
            this is that same role, just the one every tenant has always had.
            Name has no FIELDS.form entry any more (was form_first_name/
            form_last_name) — merging two boxes into one made a "First Name"
            label meaningless, and its placeholder now matches the role
            blocks' own fixed "Name" wording instead. Phone/Email keep their
            existing tenant-editable SiteContent text, just moved from a
            label above the box to placeholder text inside it. See
            MaintenanceNotes.md §1. */}
        <div ref={contactWrapRef}>
          <div className="flex items-center justify-between mb-1.5">
            <label style={{ ...labelStyle, marginBottom: 0 }}>{contactPersonTitle}</label>
            {showContactSummary && (
              <button type="button" aria-label={`${t(locale, 'form.contact_edit')} ${contactPersonTitle}`}
                onClick={() => {
                  setContactCompact(false)
                  requestAnimationFrame(() => contactWrapRef.current?.querySelector<HTMLInputElement>('#name')?.focus())
                }}
                className="text-xs font-medium transition-all hover:opacity-75 active:scale-95"
                style={{ color: 'var(--color-brand)' }}>
                {t(locale, 'form.contact_edit')}
              </button>
            )}
          </div>
          {/* T-21: an autofilled (picked) contact person shows as one line; Edit brings the boxes back. */}
          {showContactSummary ? (
            <div className="rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputStyle, color: C.text }}>
              <span className="font-medium">{fullName}</span>
              {phone && <span style={{ color: C.muted }}> · {phone}</span>}
              {email && <span style={{ color: C.muted }}> · <span className="inline-block max-w-full [overflow-wrap:anywhere]">{email}</span></span>}
            </div>
          ) : (
          <>
          <div className="grid sm:grid-cols-3 gap-3">
            <input id="name" name="name" required value={fullName} onChange={e => setFullName(e.target.value)}
              type="text" aria-label={t(locale, 'form.contact_role_name')} placeholder={t(locale, 'form.contact_role_name')}
              className="rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
            <input id="phone" name="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              aria-label={fc('form_phone', 'form.phone')} placeholder={fc('form_phone', 'form.phone')}
              className="rounded-lg border px-3 py-2.5 text-sm"
              style={{ ...inputStyle, borderColor: contactHasError ? STATUS.errorBorder : inputStyle.borderColor }} />
            <input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              aria-label={fc('form_email', 'form.email')} placeholder={fc('form_email', 'form.email')}
              className="rounded-lg border px-3 py-2.5 text-sm"
              style={{ ...inputStyle, borderColor: contactHasError ? STATUS.errorBorder : inputStyle.borderColor }} />
          </div>
          {contactHasError && (
            <p className="text-xs mt-1" style={{ color: STATUS.errorText }}>{mc('onsite_err_contact', 'form.err_contact')}</p>
          )}
          </>
          )}
        </div>

        {/* Price preview — priceCounts(), the server's arithmetic (T-152) */}
        {missingProducts.length > 0 ? (
          <div className="rounded-lg border p-4" style={{ backgroundColor: STATUS.errorBg, borderColor: STATUS.errorBorder }}>
            <p className="text-sm font-medium" style={{ color: STATUS.errorText }}>
              {mc('onsite_err_not_offered', 'form.err_not_offered', { product: missingProducts.map(productName).join(', ') })}
            </p>
          </div>
        ) : isEnhanced ? (
          payingGuests > 0 && previewRates ? (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.est_total')}</p>
                <p className="font-bold text-2xl" style={{ color: C.wine }}>{formatTetri(asTetri(enhancedTotal))}</p>
              </div>
              <div className="space-y-0.5">
                {PRODUCTS.filter(pr => counts[pr] > 0).map(pr => (
                  <p key={pr} className="text-xs" style={{ color: C.faint }}>{counts[pr]} × {productName(pr)} {formatTetri(asTetri(previewRates[pr] ?? 0))}</p>
                ))}
                {previewRates.registration > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.registration')}: {formatTetri(asTetri(previewRates.registration))}</p>
                )}
                {masterclassAmt > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.add_ons')}: {formatTetri(asTetri(masterclassAmt))}</p>
                )}
                {wineAmt > 0 && (<p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.wine')}: {formatTetri(asTetri(wineAmt))}</p>)}
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
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>{formatTetri(asTetri(individualRate ?? 0))} × {guestCount} {t(locale, guestCount === 1 ? 'form.guest_singular' : 'form.guest_plural')}</p>
                {masterclassAmt > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.add_ons')}: {formatTetri(asTetri(masterclassAmt))}</p>
                )}
                {wineAmt > 0 && (<p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.wine')}: {formatTetri(asTetri(wineAmt))}</p>)}
              </div>
              <p className="font-bold text-2xl" style={{ color: C.wine }}>{formatTetri(asTetri(estimatedTotal))}</p>
            </div>
          ) : (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <p className="text-sm" style={{ color: C.muted }}>{t(locale, 'form.price_after_submit')}</p>
            </div>
          )
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
          disabled={status === 'loading' || missingProducts.length > 0}
          className="w-full font-semibold py-3 rounded-lg transition-colors text-white"
          style={{ backgroundColor: (status === 'loading' || missingProducts.length > 0) ? 'color-mix(in srgb, var(--color-brand) 60%, var(--site-muted))' : C.wine }}>
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
