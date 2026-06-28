'use client'

// MAINTENANCE: This is a visual replica of BookingForm.tsx for the admin content editor.
// If BookingForm.tsx layout changes (new fields, renamed labels, removed sections),
// mirror those changes here. See vault/MaintenanceNotes.md §1.

import EditableText from '@/components/EditableText'

const C = {
  bg: '#fff9f3', border: '#e0d4c0', text: '#1c1008',
  muted: '#6b5a47', faint: '#a89070', wine: 'var(--color-brand)', inputBg: '#fffdf9',
}

type Props = { c: Record<string, string>; locale: string }

export default function BookingFormVisualPanel({ c, locale }: Props) {
  const labelStyle: React.CSSProperties = { color: C.muted, fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px', display: 'block' }
  const inputShell: React.CSSProperties = { backgroundColor: C.inputBg, borderColor: C.border, color: C.faint }

  function ET({ k, fb }: { k: string; fb: string }) {
    return (
      <EditableText contentKey={k} section="form" label={fb} locale={locale} fallback={fb} isAdmin as="span">
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
          <div className="py-3 px-4 rounded-lg border text-left" style={{ backgroundColor: '#fff3ef', borderColor: C.wine }}>
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

      {/* Guests */}
      <div>
        <label style={labelStyle}><ET k="form_num_guests" fb="Number of Guests" /></label>
        <div className="rounded-lg border px-3 py-2.5 w-28 text-sm" style={inputShell}>4</div>
      </div>

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

      {/* Food notes */}
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

      {/* Submit */}
      <div className="w-full font-semibold py-3 rounded-lg text-white text-center text-sm cursor-default select-none" style={{ backgroundColor: C.wine }}>
        <ET k="form_submit" fb="Request Booking" />
      </div>

      {/* Cancel policy */}
      <p className="text-xs text-center" style={{ color: C.faint }}>
        <ET k="form_cancel_policy" fb="48-hour cancellation policy. We will contact you to confirm." />
      </p>

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
