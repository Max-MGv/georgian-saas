'use client'

import type { CSSProperties, ReactNode } from 'react'

/**
 * One contact role's details — a title, an optional "choose someone" control,
 * and Name / Phone / Email in a single row of placeholder-style boxes.
 *
 * This is the layout the public booking form gives every contact role (Contact
 * Person, Guide, …). The admin New Order form renders its blocks through this
 * component so a Contact Person and a Guide look and fill in identically there
 * too, instead of two differently shaped sets of boxes for the same kind of
 * information.
 *
 * Purely presentational: the caller owns the values, the labels (so the admin
 * can use its own language system) and what the "choose" control is — a
 * dropdown on the admin screen.
 */
export default function ContactRoleFields({
  title,
  picker,
  name,
  phone,
  email,
  onChange,
  labels,
  inputStyle,
  titleStyle,
}: {
  /** The role's own admin-managed label, e.g. "Guide". */
  title: string
  /** Rendered between the title and the boxes — e.g. a "choose from the list" select. */
  picker?: ReactNode
  name: string
  phone: string
  email: string
  onChange: (field: 'name' | 'phone' | 'email', value: string) => void
  /** Placeholder text, also used (prefixed with the title) as the accessible name. */
  labels: { name: string; phone: string; email: string }
  inputStyle: CSSProperties
  titleStyle?: CSSProperties
}) {
  return (
    <div>
      <p className="text-xs mb-1.5" style={titleStyle}>{title}</p>
      {picker && <div className="mb-2">{picker}</div>}
      <div className="grid sm:grid-cols-3 gap-3">
        <input
          type="text"
          aria-label={`${title} — ${labels.name}`}
          placeholder={labels.name}
          value={name}
          onChange={e => onChange('name', e.target.value)}
          style={inputStyle}
        />
        <input
          type="tel"
          aria-label={`${title} — ${labels.phone}`}
          placeholder={labels.phone}
          value={phone}
          onChange={e => onChange('phone', e.target.value)}
          style={inputStyle}
        />
        <input
          type="email"
          aria-label={`${title} — ${labels.email}`}
          placeholder={labels.email}
          value={email}
          onChange={e => onChange('email', e.target.value)}
          style={inputStyle}
        />
      </div>
    </div>
  )
}
