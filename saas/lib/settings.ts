import {
  DEFAULT_BOOKING_INTRO_UNPAID,
  DEFAULT_BOOKING_INTRO_PAID,
  DEFAULT_BOOKING_INTRO_PENDING_COMPANY,
} from '@/lib/emails/templates/bookingConfirmationTemplate'
import { DEFAULT_WINE_RECEIPT_INTRO } from '@/lib/emails/templates/wineOrderReceiptTemplate'

/**
 * Setting defaults + resolution helpers.
 *
 * Lives in `lib/` rather than `app/actions/settings.ts` because that file is
 * `'use server'`, which may only export async functions — the sync helpers
 * below can't live there.
 *
 * ⚠️ SECURITY: a tenant's full settings map includes payment details
 * (`payment_iban`, `payment_personal_number`, `payment_bank_code`, …). The map
 * returned by `getAllSettings()` is SERVER-ONLY. Never pass the whole map into
 * a client component — read the specific keys you need and pass those as props,
 * the way the public pages already do.
 */

export const SETTING_DEFAULTS: Record<string, string> = {
  show_company_price_after_booking: 'true',
  enable_enhanced_company_booking: 'false',
  invoice_detailed: 'false',
  payment_recipient_name: '',
  payment_personal_number: '',
  payment_bank_name: '',
  payment_bank_code: '',
  payment_iban: '',
  invoice_email_message: '',
  // Feature 181 follow-up (2026-09-13) — the full editable intro (greeting +
  // thank-you, together, with a `{name}` token) for the two automatic
  // (no-human-in-the-loop) customer emails, pre-filled with today's real
  // copy so the admin "Messages" page never shows an empty box. Booking
  // Confirmation gets three — see bookingConfirmationTemplate.ts's comment
  // on why the three variants aren't allowed to share one default.
  booking_email_intro_unpaid: DEFAULT_BOOKING_INTRO_UNPAID,
  booking_email_intro_paid: DEFAULT_BOOKING_INTRO_PAID,
  booking_email_intro_pending_company: DEFAULT_BOOKING_INTRO_PENDING_COMPANY,
  wine_receipt_email_intro: DEFAULT_WINE_RECEIPT_INTRO,
  min_guests_tasting: '4',
  min_guests_tasting_lunch: '4',
  // Booking lead time (#178) — minimum hours-ahead a booking must be made.
  // `booking_lead_split` off: `booking_lead_hours` applies to every visit type.
  // On: the two per-visit-type values apply instead.
  booking_lead_split: 'false',
  booking_lead_hours: '3',
  booking_lead_hours_tasting: '3',
  booking_lead_hours_tasting_lunch: '6',
  // Working hours/days (#178) — `working_hours_custom` off: `working_hours_open`/
  // `working_hours_close` apply to every day. On: `working_hours_days_json`
  // (a WeeklyHours JSON array, see lib/bookingHours.ts) overrides per weekday.
  working_hours_custom: 'false',
  working_hours_open: '12:00',
  working_hours_close: '18:00',
  working_hours_days_json: '',
  maps_embed_url: '',
  admin_language: 'en',
  // Onboarding wizard (#127) — 'yes' | 'no' | '' (unanswered)
  onboarding_works_with_companies: '',
  // Guide mode (#139) — contextual (?) hints throughout the admin panel.
  // Defaults on: gating help behind an opt-in switch defeats its own purpose
  // for the first-time/confused admin who wouldn't know to look for it.
  show_admin_hints: 'true',
}

/** A tenant's settings as `key → value`, straight from the DB (no defaults applied). */
export type SettingsMap = Record<string, string>

/**
 * Resolve one setting out of a settings map, applying the same fallback chain
 * `getSetting()` uses: stored value → coded default → empty string.
 */
export function settingValue(settings: SettingsMap, key: string): string {
  return settings[key] ?? SETTING_DEFAULTS[key] ?? ''
}

/** Convenience for the many settings that are stored as `'true'` / `'false'`. */
export function settingBool(settings: SettingsMap, key: string): boolean {
  return settingValue(settings, key) === 'true'
}

/** Convenience for numeric settings, with a caller-supplied fallback. */
export function settingInt(settings: SettingsMap, key: string, fallback: number): number {
  return parseInt(settingValue(settings, key)) || fallback
}
