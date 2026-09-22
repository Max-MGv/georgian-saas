'use client'

import { useState, useTransition } from 'react'
import {
  createContactRole, updateContactRole, setContactRoleActive, deleteContactRole,
} from '@/app/actions/contactRoles'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'

/**
 * Contact Roles — the admin screen that makes adding a contact type an admin action rather than
 * a migration (vault/Plan-ContactRoles.md, Chunk 4).
 *
 * A sibling of `SettingsClient.tsx` rather than a section inside it: that file is already
 * ~1560 lines, and this is a self-contained CRUD list with its own state.
 *
 * The one concept an admin has to understand is `scope`, so the copy for it is Max's own
 * framing from the brief — "this is true for this company always" versus "this contact person
 * type is for per order picker" — rather than the words PER_ORDER and COMPANY_LEVEL.
 */

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

const inputStyle = {
  backgroundColor: 'var(--site-surface)',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: '0.8125rem',
  color: C.text,
  outline: 'none',
}

export type ContactScope = 'PER_ORDER' | 'COMPANY_LEVEL'
export type ContactApplies = 'BOOKING' | 'WINE_ORDER' | 'BOTH'

export type Role = {
  id: string
  key: string
  labelEn: string
  labelKa: string
  scope: ContactScope
  appliesTo: ContactApplies
  sortOrder: number
  isActive: boolean
  isSystem: boolean
}

type Props = {
  roles: Role[]
  locale: string
  /** Whether the tenant has the wine-orders module — hides choices they cannot use. */
  wineOrdersOn: boolean
}

function RoleForm({
  initial, locale, wineOrdersOn, busy, onSave, onCancel,
}: {
  initial?: Role
  locale: string
  wineOrdersOn: boolean
  busy: boolean
  onSave: (data: {
    labelEn: string; labelKa: string; scope: ContactScope; appliesTo: ContactApplies; sortOrder: number
  }) => void
  onCancel: () => void
}) {
  const at = (k: string) => adminT(locale, k)
  const [labelEn, setLabelEn] = useState(initial?.labelEn ?? '')
  const [labelKa, setLabelKa] = useState(initial?.labelKa ?? '')
  const [scope, setScope] = useState<ContactScope>(initial?.scope ?? 'PER_ORDER')
  const [appliesTo, setAppliesTo] = useState<ContactApplies>(initial?.appliesTo ?? 'BOTH')
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 100))

  const canSave = labelEn.trim().length > 0 && labelKa.trim().length > 0 && !busy

  return (
    <div className="px-5 py-4 border-b flex flex-col gap-3" style={{ backgroundColor: 'var(--site-bg)', borderColor: C.border }}>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: C.faint }}>{at('contactRoles.labelEn')}</span>
          <input value={labelEn} onChange={e => setLabelEn(e.target.value)} style={{ ...inputStyle, width: 180 }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: C.faint }}>{at('contactRoles.labelKa')}</span>
          <input value={labelKa} onChange={e => setLabelKa(e.target.value)} style={{ ...inputStyle, width: 180 }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: C.faint }}>{at('contactRoles.order')}</span>
          <input
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
      </div>

      {/* scope is create-only: changing it on an existing role would strand every order that
          already recorded a choice in it, so the server refuses the change too. */}
      {!initial && (
        <label className="flex flex-col gap-1">
          <span className="text-xs flex items-center gap-1" style={{ color: C.faint }}>
            {at('contactRoles.scope')}
            <HelpHint text={at('contactRoles.scopeHint')} />
          </span>
          <select value={scope} onChange={e => setScope(e.target.value as ContactScope)} style={{ ...inputStyle, width: 320 }}>
            <option value="PER_ORDER">{at('contactRoles.scope.perOrder')}</option>
            <option value="COMPANY_LEVEL">{at('contactRoles.scope.companyLevel')}</option>
          </select>
        </label>
      )}

      {scope === 'PER_ORDER' && wineOrdersOn && (
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: C.faint }}>{at('contactRoles.appliesTo')}</span>
          <select value={appliesTo} onChange={e => setAppliesTo(e.target.value as ContactApplies)} style={{ ...inputStyle, width: 320 }}>
            <option value="BOTH">{at('contactRoles.appliesTo.both')}</option>
            <option value="BOOKING">{at('contactRoles.appliesTo.booking')}</option>
            <option value="WINE_ORDER">{at('contactRoles.appliesTo.wineOrder')}</option>
          </select>
        </label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({
            labelEn: labelEn.trim(),
            labelKa: labelKa.trim(),
            scope,
            // A company-level role never appears on a form, so its module is meaningless —
            // store BOTH rather than a value that reads as a restriction it does not have.
            appliesTo: scope === 'COMPANY_LEVEL' ? 'BOTH' : (wineOrdersOn ? appliesTo : 'BOOKING'),
            sortOrder: parseInt(sortOrder) || 100,
          })}
          className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
          style={{ backgroundColor: canSave ? C.wine : '#c9bda9' }}
        >
          {at('settings.common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg border"
          style={{ borderColor: C.border, color: C.muted }}
        >
          {at('settings.common.cancel')}
        </button>
      </div>
    </div>
  )
}

export default function ContactRolesPanel({ roles: initialRoles, locale, wineOrdersOn }: Props) {
  const at = (k: string) => adminT(locale, k)
  const [roles, setRoles] = useState(initialRoles)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const sorted = [...roles].sort((a, b) => a.sortOrder - b.sortOrder || a.labelEn.localeCompare(b.labelEn))

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError('')
    startTransition(async () => {
      const result = await fn()
      if (result && 'error' in result && result.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-xl border overflow-hidden mt-6" style={{ borderColor: C.border }}>
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ backgroundColor: 'var(--site-bg)', borderColor: C.border }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--site-secondary)' }}>
          {at('contactRoles.sectionTitle')}
        </p>
        <HelpHint text={at('contactRoles.sectionHint')} />
      </div>

      {error && (
        <div className="px-5 py-3 border-b text-xs" style={{ backgroundColor: '#fef2f2', borderColor: C.border, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {sorted.map(role => (
        <div key={role.id}>
          {editingId === role.id ? (
            <RoleForm
              initial={role}
              locale={locale}
              wineOrdersOn={wineOrdersOn}
              busy={pending}
              onCancel={() => setEditingId(null)}
              onSave={data => run(async () => {
                const r = await updateContactRole(role.id, {
                  labelEn: data.labelEn, labelKa: data.labelKa,
                  appliesTo: data.appliesTo, sortOrder: data.sortOrder,
                })
                if ('error' in r) return r
                setRoles(rs => rs.map(x => x.id === role.id ? { ...x, ...data, scope: x.scope } : x))
                setEditingId(null)
              })}
            />
          ) : confirmingId === role.id ? (
            <div className="px-5 py-4 border-b flex items-center gap-3 text-xs" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <span style={{ color: C.muted }}>{at('contactRoles.deleteConfirm')}</span>
              <button
                type="button"
                onClick={() => run(async () => {
                  const r = await deleteContactRole(role.id)
                  if ('error' in r) { setConfirmingId(null); return r }
                  setRoles(rs => rs.filter(x => x.id !== role.id))
                  setConfirmingId(null)
                })}
                className="px-3 py-1 rounded-lg text-white font-medium"
                style={{ backgroundColor: '#b91c1c' }}
              >
                {at('orders.yes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingId(null)}
                className="px-3 py-1 rounded-lg border"
                style={{ borderColor: C.border, color: C.muted }}
              >
                {at('settings.common.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b flex-wrap"
              style={{ backgroundColor: C.bg, borderColor: C.border, opacity: role.isActive ? 1 : 0.55 }}>
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-2 flex-wrap" style={{ color: C.text }}>
                  {locale === 'ka' ? role.labelKa : role.labelEn}
                  <span className="text-xs font-normal" style={{ color: C.faint }}>
                    {locale === 'ka' ? role.labelEn : role.labelKa}
                  </span>
                  {role.isSystem && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: C.border, color: C.faint }}>
                      {at('contactRoles.builtIn')}
                    </span>
                  )}
                </p>
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>
                  {role.scope === 'PER_ORDER' ? at('contactRoles.scope.perOrderShort') : at('contactRoles.scope.companyLevelShort')}
                  {role.scope === 'PER_ORDER' && wineOrdersOn && ` · ${at(
                    role.appliesTo === 'BOTH' ? 'contactRoles.appliesTo.both'
                      : role.appliesTo === 'BOOKING' ? 'contactRoles.appliesTo.booking'
                      : 'contactRoles.appliesTo.wineOrder'
                  )}`}
                  {!role.isActive && ` · ${at('contactRoles.inactive')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => run(async () => {
                    const r = await setContactRoleActive(role.id, !role.isActive)
                    if ('error' in r) return r
                    setRoles(rs => rs.map(x => x.id === role.id ? { ...x, isActive: !x.isActive } : x))
                  })}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  {role.isActive ? at('contactRoles.turnOff') : at('contactRoles.turnOn')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(role.id)}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  {at('companies.priceTiers.edit')}
                </button>
                {/* A built-in role has no delete button at all, rather than one that always
                    errors — the server refuses it either way, but an absent control is
                    honest where a dead one is not. */}
                {!role.isSystem && (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(role.id)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                  >
                    {at('companies.priceTiers.delete')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <RoleForm
          locale={locale}
          wineOrdersOn={wineOrdersOn}
          busy={pending}
          onCancel={() => setAdding(false)}
          onSave={data => run(async () => {
            const r = await createContactRole(data)
            if ('error' in r) return r
            if ('role' in r && r.role) setRoles(rs => [...rs, r.role as Role])
            setAdding(false)
          })}
        />
      ) : (
        <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ borderColor: C.border, color: C.muted }}
          >
            {at('contactRoles.add')}
          </button>
        </div>
      )}
    </div>
  )
}
