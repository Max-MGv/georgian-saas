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
  // Visit duration (#184) — expected length of the visit, minutes, shown on the
  // public confirm-your-booking sheet as an estimated finish time.
  visit_duration_tasting: '90',
  visit_duration_tasting_lunch: '180',
  maps_embed_url: '',
  admin_language: 'en',
  // Onboarding wizard (#127) — 'yes' | 'no' | '' (unanswered)
  onboarding_works_with_companies: '',
  // Guide mode (#139) — contextual (?) hints throughout the admin panel.
  // Defaults on: gating help behind an opt-in switch defeats its own purpose
  // for the first-time/confused admin who wouldn't know to look for it.
  show_admin_hints: 'true',
  // Per-person access codes (Plan-ContactRoles decision 6). Off by default.
  //
  // ⚠️ This governs the codes belonging to PEOPLE (CompanyPerson.code), not the company's own
  // `Company.accessCode`, which is unchanged and always active. Max's wording was "the access
  // code system *they* have now" — "they" being the guides and contact persons who had just
  // been given codes. The distinction is load-bearing: the company code is also the only way
  // the `hide_company_dropdown` booking variant (Features 113/114) can identify a company at
  // all, so disabling it tenant-wide would silently break that variant.
  //
  // Off: no person codes. A company code (or the dropdown) identifies the company, then the
  //      guest picks their guide/contact person from a list, which autofills the form.
  // On:  a person's own code identifies them directly, and the picker is suppressed entirely,
  //      so colleagues never see each other's details. A company code still resolves the
  //      company, but then the guest types their own details as they did before pickers.
  person_codes_enabled: 'false',
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
