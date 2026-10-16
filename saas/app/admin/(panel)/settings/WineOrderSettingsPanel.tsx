'use client'

import { useState, useTransition } from 'react'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'
import { asTetri, formatTetri, parseMajor, toMajor } from '@/lib/money'
import {
  createDeliveryZone, updateDeliveryZone, deleteDeliveryZone, saveWineOrderRules,
} from '@/app/actions/deliveryZones'
import type { WineOrderRules, UnknownZonePayment } from '@/lib/wineOrderRules'

/**
 * Wine orders — minimum order, pickup, delivery zones (T-8, vault/Plan-WineOrderFeatures.md
 * Chunk 4). A sibling of SettingsClient (already ~1600 lines), like ContactRolesPanel.
 *
 * Nothing here changes the public form until the winery configures it: no zones and pickup off
 * means the form behaves exactly as it did before T-8.
 */

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

const inputStyle = {
  backgroundColor: 'var(--site-surface)',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: '0.875rem',
  color: C.text,
  outline: 'none',
}

export type ZoneRow = { id: string; nameEn: string; nameKa: string | null; fee: number }

function Toggle({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
      style={{ backgroundColor: enabled ? C.wine : '#d1c4b0' }}
    >
      {/* Hit area only — same as SettingsClient's Toggle. */}
      <span aria-hidden="true" className="absolute inset-x-0 -inset-y-2" />
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

function ZoneForm({ initial, locale, busy, onSave, onCancel }: {
  initial?: ZoneRow
  locale: string
  busy: boolean
  onSave: (data: { nameEn: string; nameKa: string; fee: number }) => void
  onCancel: () => void
}) {
  const at = (key: string) => adminT(locale, key)
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '')
  const [nameKa, setNameKa] = useState(initial?.nameKa ?? '')
  const [fee, setFee] = useState(initial ? String(toMajor(asTetri(initial.fee))) : '')
  const parsedFee = fee.trim() === '' ? null : parseMajor(fee)
  const valid = nameEn.trim() !== '' && parsedFee !== null && parsedFee >= 0
  return (
    <div className="flex flex-wrap items-end gap-3 px-5 py-3" style={{ backgroundColor: C.bg }}>
      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: C.faint }}>{at('wineRules.zones.nameEn')}</span>
        <input value={nameEn} onChange={e => setNameEn(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: C.faint }}>{at('wineRules.zones.nameKa')}</span>
        <input value={nameKa} onChange={e => setNameKa(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: C.faint }}>{at('wineRules.zones.fee')}</span>
        <span className="flex items-center gap-1">
          <input type="number" min={0} step="0.01" inputMode="decimal" value={fee}
            onChange={e => setFee(e.target.value)} style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
          <span className="text-sm" style={{ color: C.muted }}>₾</span>
        </span>
      </label>
      <div className="flex gap-2 pb-0.5">
        <button type="button" disabled={busy || !valid}
          onClick={() => parsedFee !== null && onSave({ nameEn, nameKa, fee: parsedFee })}
          className="btn-wine text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-50">
          {at('settings.common.save')}
        </button>
        <button type="button" onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>
          {at('settings.common.cancel')}
        </button>
      </div>
    </div>
  )
}

export default function WineOrderSettingsPanel({ rules, zones: initialZones, onlinePaymentOn, locale }: {
  rules: WineOrderRules
  zones: ZoneRow[]
  /** Whether the tenant has the online-payment module — the unknown-zone choice only matters then. */
  onlinePaymentOn: boolean
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // ── Rules ──
  const [minType, setMinType] = useState(rules.minOrder.type)
  const [minValue, setMinValue] = useState(
    rules.minOrder.type === 'bottles' ? String(rules.minOrder.bottles)
    : rules.minOrder.type === 'amount' ? String(toMajor(rules.minOrder.amount))
    : ''
  )
  const [pickup, setPickup] = useState(rules.pickupEnabled)
  const [unknownZone, setUnknownZone] = useState<UnknownZonePayment>(rules.unknownZonePayment)

  function handleSaveRules() {
    setError(''); setSaved(false)
    let value = 0
    if (minType === 'bottles') value = Number.parseInt(minValue, 10)
    if (minType === 'amount') value = parseMajor(minValue) ?? 0
    if (minType !== 'off' && !(Number.isInteger(value) && value > 0)) {
      setError(at('wineRules.min.invalid'))
      return
    }
    startTransition(async () => {
      const r = await saveWineOrderRules({ minType, minValue: value, pickupEnabled: pickup, unknownZonePayment: unknownZone })
      if ('error' in r) { setError(r.error ?? ''); return }
      setSaved(true)
    })
  }

  // ── Zones ──
  const [zones, setZones] = useState(initialZones)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function run(fn: () => Promise<void>) {
    setError('')
    startTransition(fn)
  }

  const zoneName = (z: ZoneRow) => (locale === 'ka' && z.nameKa) || z.nameEn

  return (
    <div className="rounded-xl border overflow-hidden mt-6" style={{ borderColor: C.border }}>
      <div className="px-5 py-3 border-b" style={{ backgroundColor: 'var(--site-bg)', borderColor: C.border }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--site-secondary)' }}>{at('wineRules.sectionTitle')}</p>
        <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('wineRules.sectionHint')}</p>
      </div>

      {error && (
        <div className="px-5 py-3 border-b text-xs" style={{ backgroundColor: '#fef2f2', borderColor: C.border, color: '#b91c1c' }}>{error}</div>
      )}

      <div className="divide-y" style={{ borderColor: C.border }}>
        {/* Minimum order */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 px-5 py-3" style={{ backgroundColor: C.bg }}>
          <span className="text-sm sm:w-48 sm:flex-shrink-0 flex items-center gap-1" style={{ color: C.muted }}>
            {at('wineRules.min.label')}
            <HelpHint text={at('wineRules.min.hint')} />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={at('wineRules.min.label')} value={minType}
              onChange={e => { setMinType(e.target.value as typeof minType); setSaved(false) }}
              style={{ ...inputStyle, width: 150 }}>
              <option value="off">{at('wineRules.min.off')}</option>
              <option value="bottles">{at('wineRules.min.bottles')}</option>
              <option value="amount">{at('wineRules.min.amount')}</option>
            </select>
            {minType !== 'off' && (
              <span className="flex items-center gap-1">
                <input type="number" min={1} step={minType === 'amount' ? '0.01' : '1'} inputMode="decimal"
                  aria-label={at('wineRules.min.value')} value={minValue}
                  onChange={e => { setMinValue(e.target.value); setSaved(false) }}
                  style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
                <span className="text-sm" style={{ color: C.muted }}>{minType === 'amount' ? '₾' : at('wineRules.min.bottlesUnit')}</span>
              </span>
            )}
          </div>
        </div>

        {/* Pickup */}
        <div className="flex items-center justify-between gap-4 px-5 py-3" style={{ backgroundColor: C.bg }}>
          <span className="text-sm flex items-center gap-1" style={{ color: C.muted }}>
            {at('wineRules.pickup.label')}
            <HelpHint text={at('wineRules.pickup.hint')} />
          </span>
          <Toggle enabled={pickup} onChange={v => { setPickup(v); setSaved(false) }} label={at('wineRules.pickup.label')} />
        </div>

        {/* Unknown zone + online payment */}
        {onlinePaymentOn && (
          <div className="flex flex-col gap-2 px-5 py-3" style={{ backgroundColor: C.bg }}>
            <span className="text-sm flex items-center gap-1" style={{ color: C.muted }}>
              {at('wineRules.unknownZone.label')}
              <HelpHint text={at('wineRules.unknownZone.hint')} />
            </span>
            {(['pay_wine_now', 'reservation'] as const).map(option => (
              <label key={option} className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.text }}>
                <input type="radio" name="unknownZonePayment" className="mt-1" checked={unknownZone === option}
                  onChange={() => { setUnknownZone(option); setSaved(false) }} />
                <span>{at(option === 'pay_wine_now' ? 'wineRules.unknownZone.payWine' : 'wineRules.unknownZone.reservation')}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-3" style={{ backgroundColor: C.bg }}>
          <button type="button" onClick={handleSaveRules} disabled={pending}
            className="btn-wine text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-60">
            {pending ? at('settings.common.saving') : at('settings.common.save')}
          </button>
          {saved && !pending && <span className="text-xs" style={{ color: '#16a34a' }}>{at('settings.saved')}</span>}
        </div>

        {/* Delivery zones */}
        <div className="px-5 py-3" style={{ backgroundColor: 'var(--site-bg)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: C.faint }}>
            {at('wineRules.zones.title')}
            <HelpHint text={at('wineRules.zones.hint')} />
          </p>
        </div>
        {zones.length === 0 && !adding && (
          <p className="px-5 py-3 text-xs" style={{ color: C.faint, backgroundColor: C.bg }}>{at('wineRules.zones.none')}</p>
        )}
        {zones.map(z => (
          <div key={z.id}>
            {editingId === z.id ? (
              <ZoneForm initial={z} locale={locale} busy={pending} onCancel={() => setEditingId(null)}
                onSave={data => run(async () => {
                  const r = await updateDeliveryZone(z.id, data)
                  if ('error' in r) { setError(r.error ?? ''); return }
                  setZones(prev => prev.map(p => p.id === z.id ? { ...p, nameEn: data.nameEn.trim(), nameKa: data.nameKa.trim() || null, fee: data.fee } : p))
                  setEditingId(null)
                })} />
            ) : deletingId === z.id ? (
              <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs" style={{ backgroundColor: C.bg }}>
                <span style={{ color: C.muted }}>{at('wineRules.zones.deleteConfirm')}</span>
                <button type="button" disabled={pending} className="px-3 py-1 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#b91c1c' }}
                  onClick={() => run(async () => {
                    const r = await deleteDeliveryZone(z.id)
                    if ('error' in r) { setError(r.error ?? ''); return }
                    setZones(prev => prev.filter(p => p.id !== z.id))
                    setDeletingId(null)
                  })}>{at('orders.yes')}</button>
                <button type="button" onClick={() => setDeletingId(null)} className="px-3 py-1 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm" style={{ backgroundColor: C.bg }}>
                <span className="min-w-0 break-words" style={{ color: C.text }}>{zoneName(z)}</span>
                <span className="font-medium" style={{ color: C.wine }}>{formatTetri(asTetri(z.fee))}</span>
                <button type="button" onClick={() => setEditingId(z.id)} className="text-xs px-2 py-1 rounded border ml-auto" style={{ borderColor: C.border, color: C.muted }}>{at('companies.priceTiers.edit')}</button>
                <button type="button" onClick={() => setDeletingId(z.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
              </div>
            )}
          </div>
        ))}
        {adding ? (
          <ZoneForm locale={locale} busy={pending} onCancel={() => setAdding(false)}
            onSave={data => run(async () => {
              const r = await createDeliveryZone(data)
              if ('error' in r) { setError(r.error ?? ''); return }
              setZones(prev => [...prev, r.zone])
              setAdding(false)
            })} />
        ) : (
          <div className="px-5 py-3" style={{ backgroundColor: C.bg }}>
            <button type="button" onClick={() => setAdding(true)} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>
              {at('wineRules.zones.add')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
