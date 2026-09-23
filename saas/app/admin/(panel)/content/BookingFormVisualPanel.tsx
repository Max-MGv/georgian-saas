'use client'

// MAINTENANCE: This is a visual replica of BookingForm.tsx for the admin content editor.
// If BookingForm.tsx layout changes (new fields, renamed labels, removed sections),
// mirror those changes here. See vault/MaintenanceNotes.md §1.
//
// Two variants, matching BookingForm.tsx's `isEnhanced` branch (real toggle there is the
// enable_enhanced_company_booking setting + a company booking selected; here it's a manual
// preview toggle so both can be viewed/edited regardless of the tenant's live setting):
// - simple:   single "Number of Guests" field; no hot dish / masterclass / food notes
//             (the real form only renders Food Notes inside the isEnhanced block — never
//             in simple mode, so it must not appear here either)
// - detailed: split guest counts (Tasting/Lunch/Free-Guide), Hot Dish Selection, Masterclass
//             Add-ons, then Food Notes. Only the 3 new section headers are tenant-editable
//             here (see FIELDS.form in ContentClient.tsx) — the guest sub-labels, dropdown
//             option text, masterclass item row and contact-type block are illustrative
//             mockups, not editable content: the real values come from the
//             minGuestsTasting/Lunch settings, the MenuItem/MasterclassItem admin pages
//             and Settings → Contact Types, not from SiteContent.

import EditableText from '@/components/EditableText'

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', faint: 'var(--site-secondary)', wine: 'var(--color-brand)', inputBg: 'var(--site-surface)',
}

type Props = { c: Record<string, string>; locale: string; adminLocale: string; variant: 'simple' | 'detailed' }

export default function BookingFormVisualPanel({ c, locale, adminLocale, variant }: Props) {
  const labelStyle: React.CSSProperties = { color: C.muted, fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px', display: 'block' }
  const inputShell: React.CSSProperties = { backgroundColor: C.inputBg, borderColor: C.border, color: C.faint }
  const isDetailed = variant === 'detailed'

  function ET({ k, fb }: { k: string; fb: string }) {
    return (
      <EditableText contentKey={k} section="form" label={fb} locale={locale} adminLocale={adminLocale} fallback={fb} isAdmin as="span">
        {c[k] ?? null}
      </EditableText>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">

      {/* Booking type */}
      <div>
        <label style={labelStyle}><ET k="form_booking_type" fb="Booking Type" /></label>
        <div className="grid grid-cols-2 gap-3">
          <div className="py-3 px-4 rounded-lg border text-sm font-medium" style={{ backgroundColor: C.wine, borderColor: C.wine, color: '#fff' }}>
            <ET k="form_individual" fb="Individual Booking" />
          </div>
          <div className="py-3 px-4 rounded-lg border text-sm font-medium" style={{ backgroundColor: C.bg, borderColor: C.border, color: C.muted }}>
            <ET k="form_company_type" fb="Tour Company" />
          </div>
        </div>
      </div>

      {/* Visit type */}
      <div>
        <label style={labelStyle}><ET k="form_visit_type" fb="Visit Type" /></label>
        <div className="grid grid-cols-2 gap-3">
          <div className="py-3 px-4 rounded-lg border text-left" style={{ backgroundColor: 'color-mix(in srgb, var(--color-brand) 8%, var(--site-surface))', borderColor: C.wine }}>
            <div className="font-medium text-sm" style={{ color: C.text }}><ET k="form_tasting" fb="Wine Tasting" /></div>
            <div className="text-sm mt-0.5" style={{ color: C.wine }}>50₾ / pp</div>
          </div>
          <div className="py-3 px-4 rounded-lg border text-left" style={{ backgroundColor: C.bg, borderColor: C.border }}>
            <div className="font-medium text-sm" style={{ color: C.text }}><ET k="form_tasting_lunch" fb="Tasting + Lunch" /></div>
            <div className="text-sm mt-0.5" style={{ color: C.wine }}>100₾ / pp</div>
          </div>
        </div>
      </div>

      {/* Date & time */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}><ET k="form_date" fb="Date" /></label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputShell}>DD/MM/YYYY</div>
        </div>
        <div>
          <label style={labelStyle}><ET k="form_time_slot" fb="Time Slot" /></label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputShell}>11:00</div>
        </div>
      </div>

      {/* Guest count — simple: single field / detailed: split Tasting+Lunch+Free-Guide */}
      {isDetailed ? (
        <div>
          <label style={labelStyle}><ET k="form_guest_counts_header" fb="Guest Counts" /></label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Tasting', value: '2' },
              { label: 'Lunch', value: '2' },
              { label: 'Free / Guide', value: '0' },
            ].map(g => (
              <div key={g.label}>
                <p className="text-xs mb-1" style={{ color: C.faint }}>{g.label}</p>
                <div className="rounded-lg border px-3 py-2 text-sm" style={inputShell}>{g.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <label style={labelStyle}><ET k="form_num_guests" fb="Number of Guests" /></label>
          <div className="rounded-lg border px-3 py-2.5 w-28 text-sm" style={inputShell}>4</div>
        </div>
      )}

      {/* Detailed only: Hot Dish Selection */}
      {isDetailed && (
        <div>
          <label style={labelStyle}><ET k="form_hot_dish_header" fb="Hot Dish Selection" /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs mb-1" style={{ color: C.faint }}>Vegetable dish</p>
              <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputShell}>— choose —</div>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: C.faint }}>Meat dish</p>
              <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputShell}>— choose —</div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed only: Masterclass Add-ons */}
      {isDetailed && (
        <div>
          <label style={labelStyle}><ET k="form_masterclass_header" fb="Masterclass Add-ons" /></label>
          <div className="rounded-lg border divide-y" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: C.bg }}>
              <div className="w-4 h-4 rounded border flex-shrink-0" style={{ borderColor: C.border }} />
              <span className="flex-1 text-sm" style={{ color: C.text }}>
                Wine Blending Workshop <span className="text-xs" style={{ color: C.faint }}>25₾/pp</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Detailed only: per-role contact details (Plan-ContactRoles Chunk 7).
          One block per contact type other than Contact Person, which already owns the
          First Name / Last Name / Phone / Email fields below.

          Illustrative, not editable, for the same reason the masterclass row above is:
          the heading is a contact type's own label, managed on Settings → Contact
          Types, so it is other admin data rather than SiteContent. That is
          MaintenanceNotes §1's own test for a new detailed-only section, applied. */}
      {isDetailed && (
        <div>
          <label style={labelStyle}>Guide <span style={{ color: C.faint, fontWeight: 400 }}>(contact type)</span></label>
          <div className="grid sm:grid-cols-3 gap-3">
            {['Name', 'Phone', 'Email'].map(ph => (
              <div key={ph} className="rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputShell, color: C.faint }}>{ph}</div>
            ))}
          </div>
        </div>
      )}

      {/* Name */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}><ET k="form_first_name" fb="First Name" /></label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputShell, color: 'transparent' }}>—</div>
        </div>
        <div>
          <label style={labelStyle}><ET k="form_last_name" fb="Last Name" /></label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputShell, color: 'transparent' }}>—</div>
        </div>
      </div>

      {/* Contact */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}><ET k="form_phone" fb="Phone" /></label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputShell, color: 'transparent' }}>—</div>
        </div>
        <div>
          <label style={labelStyle}><ET k="form_email" fb="Email" /></label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputShell, color: 'transparent' }}>—</div>
        </div>
      </div>

      {/* Food notes — detailed only, matches BookingForm.tsx's isEnhanced gating */}
      {isDetailed && (
        <div>
          <label style={labelStyle}>
            <ET k="form_food_notes" fb="Food Notes" />
            {' '}
            <span style={{ color: C.faint, fontWeight: 400 }}>(<ET k="form_food_notes_sub" fb="allergies, dietary requirements" />)</span>
          </label>
          <div className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ ...inputShell, minHeight: '76px' }}>
            <ET k="form_food_notes_placeholder" fb="Any dietary restrictions or special requests for the kitchen…" />
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="w-full font-semibold py-3 rounded-lg text-white text-center text-sm cursor-default select-none" style={{ backgroundColor: C.wine }}>
        <ET k="form_submit" fb="Request Booking" />
      </div>

      {/* Submit — online-payment variant. The live form shows exactly one of
          these two labels (payment configured or not); the editor shows both so
          either can be edited regardless of the tenant's current setup. */}
      <div className="w-full font-semibold py-3 rounded-lg text-white text-center text-sm cursor-default select-none" style={{ backgroundColor: C.wine }}>
        <ET k="form_submit_pay" fb="Book & Pay" />
      </div>

      {/* Cancel policy */}
      <p className="text-xs text-center" style={{ color: C.faint }}>
        <ET k="form_cancel_policy" fb="48-hour cancellation policy. We will contact you to confirm." />
      </p>

      {/* Confirm-your-visit sheet (#184) — shown to guests as a last review step
          before their booking is actually sent. Not gated behind the simple/
          detailed toggle since its shape (Visit / Guests & contact / Total)
          doesn't change between them — see BookingConfirmPopupView.tsx. */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, backgroundColor: 'color-mix(in srgb, var(--site-surface) 92%, var(--site-secondary))' }}>
        <div className="px-5 py-3.5 border-b border-dashed" style={{ borderColor: C.border }}>
          <h3 className="font-semibold text-sm" style={{ color: C.text }}>Review your visit</h3>
        </div>
        <div className="px-5 py-3.5 text-xs" style={{ color: C.muted }}>
          Shown to guests as a last review step before their booking is sent. Its heading, subheading, duration line, and button text are edited on the <strong>Messages</strong> tab, under "Booking Confirm Sheet" — same place as the other on-site popups, not here.
        </div>
      </div>

      {/* Success state */}
      <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <div className="text-3xl mb-3">🍷</div>
        <h3 className="font-bold text-lg mb-2" style={{ color: C.text }}>
          <ET k="form_success_heading" fb="Booking received!" />
        </h3>
        <p style={{ color: C.muted }}>
          <ET k="form_success_body" fb="Thank you. We will contact you shortly to confirm your visit." />
        </p>
      </div>

    </div>
  )
}
