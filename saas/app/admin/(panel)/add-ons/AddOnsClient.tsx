'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { asTetri, fromMajor, toMajor, formatTetri } from '@/lib/money'
import { createAddOnGroup, updateAddOnGroup, deleteAddOnGroup } from '@/app/actions/addOnGroups'
import { createMasterclassItem, updateMasterclassItem, deleteMasterclassItem } from '@/app/actions/masterclassItems'
import { UNIT_LABELS, UNIT_DESCRIPTIONS, MASTERCLASS_UNITS } from '@/lib/masterclass'
import type { MasterclassUnit } from '@/lib/masterclass'
import { ADDON_VISIT_TYPES, visitTypesTicked, type AddOnVisitType } from '@/lib/addOns'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)', pageBg: 'var(--site-bg)',
}

const inputStyle: CSSProperties = {
  backgroundColor: 'var(--site-surface)',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: '0.875rem',
  color: 'var(--site-text)',
  outline: 'none',
  minWidth: 0,
}

type Item = { id: string; name: string; nameKa: string | null; unitType: string; pricePerUnit: number; active: boolean; sortOrder: number }
type Group = {
  id: string; kind: 'ITEMS' | 'WINE'; nameEn: string; nameKa: string | null; showToCompanies: boolean; showToIndividuals: boolean
  visitTypes: string[]; active: boolean; sortOrder: number; items: Item[]
}
type Result = { error: string } | { success: true } | { success: true; group: unknown }

export default function AddOnsClient({ groups, ungrouped, wineCount, locale = 'en' }: { groups: Group[]; ungrouped: Item[]; wineCount: number; locale?: string }) {
  const at = (key: string) => adminT(locale, key)
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNameKa, setNewNameKa] = useState('')
  const [busy, setBusy] = useState(false)

  /** Runs a server action, shows its error (or a generic one), refreshes the page data on success. */
  async function run(action: () => Promise<Result | void>): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      const r = await action()
      if (r && 'error' in r) { setError(r.error); return false }
      startTransition(() => router.refresh())
      return true
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : at('addons.err.generic'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addGroup() {
    if (!newName.trim()) { setError(at('addons.err.name')); return }
    const ok = await run(() => createAddOnGroup({ nameEn: newName, nameKa: newNameKa }))
    if (ok) { setAddingGroup(false); setNewName(''); setNewNameKa('') }
  }

  return (
    <div>
      <div className="flex items-start gap-1.5 mb-4">
        <p className="text-sm" style={{ color: C.muted }}>{at('addons.description')}</p>
        <HelpHint text={at('help.masterclass.sortOrder')} />
      </div>

      {/* Unit type legend */}
      <div className="rounded-xl border p-4 mb-6" style={{ borderColor: C.border, backgroundColor: C.bg }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.faint }}>{at('masterclass.unitTypes')}</p>
        <div className="space-y-1">
          {MASTERCLASS_UNITS.map(u => (
            <div key={u} className="flex items-baseline gap-2">
              <span className="text-xs font-medium w-24 flex-shrink-0" style={{ color: C.wine }}>{UNIT_LABELS[u]}</span>
              <span className="text-xs" style={{ color: C.faint }}>{UNIT_DESCRIPTIONS[u]}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-sm mb-3" style={{ color: '#b91c1c' }}>{error}</p>}

      {groups.length === 0 && ungrouped.length === 0 && !addingGroup && (
        <p className="text-sm mb-4" style={{ color: C.faint }}>{at('addons.noGroups')}</p>
      )}

      <div className="space-y-5">
        {groups.map(g => (
          <GroupCard key={g.id} group={g} groups={groups} wineCount={wineCount} at={at} busy={busy} run={run} setError={setError} />
        ))}

        {ungrouped.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#f59e0b', backgroundColor: C.bg }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: C.border }}>
              <p className="text-sm font-semibold" style={{ color: C.text }}>{at('addons.ungrouped.title')}</p>
              <p className="text-xs" style={{ color: C.faint }}>{at('addons.ungrouped.hint')}</p>
            </div>
            {ungrouped.map((item, i) => (
              <ItemRow key={item.id} item={item} groups={groups} showMove last={i === ungrouped.length - 1} at={at} busy={busy} run={run} setError={setError} />
            ))}
          </div>
        )}

        {addingGroup ? (
          <div className="rounded-xl border p-4 grid gap-3" style={{ borderColor: C.border, backgroundColor: C.bg }}>
            <label className="grid gap-1 text-xs" style={{ color: C.faint }}>{at('addons.group.nameEn')}
              <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} placeholder={at('addons.group.namePh')} autoFocus maxLength={80}
                onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setAddingGroup(false) }} />
            </label>
            <label className="grid gap-1 text-xs" style={{ color: C.faint }}>{at('addons.group.nameKa')}
              <input style={inputStyle} value={newNameKa} onChange={e => setNewNameKa(e.target.value)} placeholder={at('addons.group.nameKaPh')} maxLength={80} />
            </label>
            <div className="flex gap-2">
              <button onClick={addGroup} disabled={busy || !newName.trim()} className="text-xs px-3 py-1.5 rounded font-medium text-white" style={{ backgroundColor: C.wine }}>{at('addons.group.create')}</button>
              <button onClick={() => { setAddingGroup(false); setNewName(''); setNewNameKa(''); setError('') }} className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingGroup(true)} className="text-sm font-medium" style={{ color: C.wine }}>{at('addons.group.add')}</button>
        )}
      </div>
    </div>
  )
}

type Common = { at: (k: string) => string; busy: boolean; run: (a: () => Promise<Result | void>) => Promise<boolean>; setError: (s: string) => void }

function GroupCard({ group, groups, wineCount, at, busy, run, setError }: Common & { group: Group; groups: Group[]; wineCount: number }) {
  const isWine = group.kind === 'WINE'
  const [editing, setEditing] = useState(false)
  const [nameEn, setNameEn] = useState(group.nameEn)
  const [nameKa, setNameKa] = useState(group.nameKa ?? '')
  const [companies, setCompanies] = useState(group.showToCompanies)
  const [individuals, setIndividuals] = useState(group.showToIndividuals)
  const [visits, setVisits] = useState<AddOnVisitType[]>(visitTypesTicked(group.visitTypes))
  const [order, setOrder] = useState(String(group.sortOrder))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [adding, setAdding] = useState(false)

  function open() {
    setNameEn(group.nameEn); setNameKa(group.nameKa ?? ''); setCompanies(group.showToCompanies); setIndividuals(group.showToIndividuals)
    setVisits(visitTypesTicked(group.visitTypes)); setOrder(String(group.sortOrder)); setError(''); setEditing(true)
  }

  async function save() {
    if (!nameEn.trim()) { setError(at('addons.err.name')); return }
    if (visits.length === 0) { setError(at('addons.err.visits')); return }
    const ok = await run(() => updateAddOnGroup(group.id, {
      nameEn, nameKa, showToCompanies: companies, showToIndividuals: individuals, visitTypes: visits, sortOrder: parseInt(order) || 0,
    }))
    if (ok) setEditing(false)
  }

  const allVisits = visitTypesTicked(group.visitTypes).length === ADDON_VISIT_TYPES.length
  const audience = [group.showToCompanies && at('addons.group.companies'), group.showToIndividuals && at('addons.group.individuals')].filter(Boolean).join(' · ')
  const visitsText = allVisits ? ADDON_VISIT_TYPES.map(v => at(`addons.visit.${v}`)).join(' · ') : visitTypesTicked(group.visitTypes).map(v => at(`addons.visit.${v}`)).join(' · ')

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, backgroundColor: C.bg, opacity: group.active ? 1 : 0.75 }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: C.border, backgroundColor: C.pageBg }}>
        {editing ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs" style={{ color: C.faint }}>{at('addons.group.nameEn')}
                <input style={inputStyle} value={nameEn} onChange={e => setNameEn(e.target.value)} maxLength={80} autoFocus />
              </label>
              <label className="grid gap-1 text-xs" style={{ color: C.faint }}>{at('addons.group.nameKa')}
                <input style={inputStyle} value={nameKa} onChange={e => setNameKa(e.target.value)} placeholder={at('addons.group.nameKaPh')} maxLength={80} />
              </label>
            </div>
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="text-xs mb-1" style={{ color: C.faint }}>{at('addons.group.showTo')}</legend>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: C.text }}>
                <input type="checkbox" checked={companies} onChange={e => setCompanies(e.target.checked)} /> {at('addons.group.companies')}
              </label>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: C.text }}>
                <input type="checkbox" checked={individuals} onChange={e => setIndividuals(e.target.checked)} /> {at('addons.group.individuals')}
              </label>
            </fieldset>
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="text-xs mb-1" style={{ color: C.faint }}>{at('addons.group.visits')}</legend>
              {ADDON_VISIT_TYPES.map(v => (
                <label key={v} className="flex items-center gap-1.5 text-sm" style={{ color: C.text }}>
                  <input type="checkbox" checked={visits.includes(v)} onChange={e => setVisits(prev => e.target.checked ? [...prev, v] : prev.filter(x => x !== v))} /> {at(`addons.visit.${v}`)}
                </label>
              ))}
              <span className="text-xs" style={{ color: C.faint }}>{at('addons.group.visitsHint')}</span>
            </fieldset>
            <label className="flex items-center gap-2 text-xs" style={{ color: C.faint }}>{at('addons.group.order')}
              <input style={{ ...inputStyle, width: 72 }} type="number" min={0} value={order} onChange={e => setOrder(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="text-xs px-3 py-1.5 rounded font-medium text-white" style={{ backgroundColor: C.wine }}>{at('settings.common.save')}</button>
              <button onClick={() => { setEditing(false); setError('') }} className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => run(() => updateAddOnGroup(group.id, { active: !group.active }))}
                  title={group.active ? at('addons.group.shown') : at('addons.group.hidden')} aria-label={group.active ? at('addons.group.shown') : at('addons.group.hidden')}
                  className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.active ? '#16a34a' : '#d1c4b0' }} />
                <h2 className="text-base font-semibold truncate" style={{ color: C.text }}>{group.nameEn}</h2>
                {group.nameKa && <span className="text-sm truncate" style={{ color: C.faint }}>{group.nameKa}</span>}
              </div>
              <p className="text-xs mt-1" style={{ color: C.faint }}>
                {group.active ? (audience || '—') : at('addons.group.hidden')}
                {group.active && <> · {visitsText}</>}
              </p>
            </div>
            <div className="flex gap-1 flex-wrap justify-end">
              {confirmDelete ? (
                <>
                  <span className="text-xs self-center" style={{ color: C.muted }}>{at('addons.group.deleteConfirm')}</span>
                  <button onClick={async () => { await run(() => deleteAddOnGroup(group.id)); setConfirmDelete(false) }} disabled={busy}
                    className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>{at('orders.yes')}</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('orders.no')}</button>
                </>
              ) : (
                <>
                  <button onClick={open} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.edit')}</button>
                  <button onClick={() => setConfirmDelete(true)} disabled={group.items.length > 0 || isWine}
                    title={isWine ? at('addons.wine.noDelete') : group.items.length > 0 ? at('addons.group.hasItems') : at('addons.group.delete')}
                    className="text-xs px-2 py-1 rounded border disabled:opacity-40" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {isWine ? (
        // The wine group has no items: it offers the wines switched on in Admin → Wines.
        <div className="px-5 py-4 text-sm" style={{ color: C.muted }}>
          {wineCount > 0 ? at('addons.wine.count').replace('{n}', String(wineCount)) : at('addons.wine.none')}{' '}
          <a href="/admin/wines" style={{ color: C.wine }}>{at('addons.wine.manage')}</a>
        </div>
      ) : (
        <>
          {group.items.length === 0 && !adding && (
            <div className="px-5 py-4 text-sm" style={{ color: C.faint }}>{at('addons.group.empty')}</div>
          )}
          {group.items.map((item, i) => (
            <ItemRow key={item.id} item={item} groups={groups} showMove={false} last={i === group.items.length - 1 && !adding} at={at} busy={busy} run={run} setError={setError} />
          ))}
          <AddItemRow groupId={group.id} adding={adding} setAdding={setAdding} at={at} busy={busy} run={run} setError={setError} />
        </>
      )}
    </div>
  )
}

function ItemRow({ item, groups, showMove, last, at, busy, run, setError }: Common & { item: Item; groups: Group[]; showMove: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [nameKa, setNameKa] = useState(item.nameKa ?? '')
  const [unit, setUnit] = useState<MasterclassUnit>(item.unitType as MasterclassUnit)
  const [price, setPrice] = useState(String(toMajor(asTetri(item.pricePerUnit))))
  const [order, setOrder] = useState(String(item.sortOrder))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const border = last ? 'none' : `1px solid ${C.border}`

  function open() {
    setName(item.name); setNameKa(item.nameKa ?? ''); setUnit(item.unitType as MasterclassUnit)
    setPrice(String(toMajor(asTetri(item.pricePerUnit)))); setOrder(String(item.sortOrder)); setError(''); setEditing(true)
  }

  async function save() {
    if (!name.trim()) { setError(at('addons.err.name')); return }
    const ok = await run(() => updateMasterclassItem(item.id, {
      name, nameKa, unitType: unit, pricePerUnit: fromMajor(parseFloat(price) || 0), sortOrder: parseInt(order) || 0,
    }))
    if (ok) setEditing(false)
  }

  if (editing) {
    return (
      <div className="grid gap-2 px-5 py-3" style={{ borderBottom: border }}>
        <div className="grid gap-2 sm:grid-cols-2">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} aria-label={at('masterclass.col.name')} maxLength={80} autoFocus />
          <input style={inputStyle} value={nameKa} onChange={e => setNameKa(e.target.value)} placeholder={at('addons.item.nameKaPh')} aria-label={at('addons.item.nameKaPh')} maxLength={80} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select style={inputStyle} value={unit} onChange={e => setUnit(e.target.value as MasterclassUnit)} aria-label={at('masterclass.col.unitType')}>
            {MASTERCLASS_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
          </select>
          <input style={{ ...inputStyle, width: 96 }} type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} aria-label={at('masterclass.col.price')} />
          <input style={{ ...inputStyle, width: 72 }} type="number" min={0} value={order} onChange={e => setOrder(e.target.value)} aria-label={at('menuItems.orderPh')} />
          <button onClick={save} disabled={busy} className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: C.wine }}>{at('settings.common.save')}</button>
          <button onClick={() => { setEditing(false); setError('') }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3" style={{ borderBottom: border }}>
      <div className="flex items-center gap-2 min-w-0 flex-1" style={{ flexBasis: 180 }}>
        <button type="button" onClick={() => run(() => updateMasterclassItem(item.id, { active: !item.active }))}
          title={item.active ? at('masterclass.active') : at('masterclass.inactive')} aria-label={item.active ? at('masterclass.active') : at('masterclass.inactive')}
          className="flex-shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: item.active ? '#16a34a' : '#d1c4b0' }} />
        <div className="min-w-0">
          <span className="text-sm" style={{ color: item.active ? C.text : C.faint, textDecoration: item.active ? 'none' : 'line-through' }}>{item.name}</span>
          {item.nameKa && <span className="text-xs ml-2" style={{ color: C.faint }}>{item.nameKa}</span>}
        </div>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>{UNIT_LABELS[item.unitType as MasterclassUnit] ?? item.unitType}</span>
      <span className="text-sm font-medium" style={{ color: C.wine }}>{formatTetri(asTetri(item.pricePerUnit))}</span>
      <span className="text-xs" style={{ color: C.faint }}>#{item.sortOrder}</span>
      <div className="flex gap-1 items-center flex-wrap">
        {showMove && (
          <select style={{ ...inputStyle, padding: '3px 6px', fontSize: '0.75rem' }} value="" aria-label={at('addons.item.moveTo')}
            onChange={e => { if (e.target.value) run(() => updateMasterclassItem(item.id, { groupId: e.target.value })) }}>
            <option value="">{at('addons.item.moveTo')}</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.nameEn}</option>)}
          </select>
        )}
        {confirmDelete ? (
          <>
            <span className="text-xs" style={{ color: C.muted }}>{at('orders.deleteConfirm')} {at('addons.item.deleteNote')}</span>
            <button onClick={async () => { await run(async () => { await deleteMasterclassItem(item.id) }); setConfirmDelete(false) }} disabled={busy}
              className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>{at('orders.yes')}</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('orders.no')}</button>
          </>
        ) : (
          <>
            <button onClick={open} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.edit')}</button>
            <button onClick={() => setConfirmDelete(true)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
          </>
        )}
      </div>
    </div>
  )
}

function AddItemRow({ groupId, adding, setAdding, at, busy, run, setError }: Common & { groupId: string; adding: boolean; setAdding: (b: boolean) => void }) {
  const [name, setName] = useState('')
  const [nameKa, setNameKa] = useState('')
  const [unit, setUnit] = useState<MasterclassUnit>('PER_PIECE')
  const [price, setPrice] = useState('')

  async function add() {
    if (!name.trim()) { setError(at('addons.err.name')); return }
    const ok = await run(async () => {
      await createMasterclassItem({ name, nameKa, unitType: unit, pricePerUnit: fromMajor(parseFloat(price) || 0), groupId })
    })
    if (ok) { setName(''); setNameKa(''); setUnit('PER_PIECE'); setPrice(''); setAdding(false) }
  }

  if (!adding) {
    return (
      <div className="px-5 py-3 border-t" style={{ borderColor: C.border }}>
        <button onClick={() => setAdding(true)} className="text-xs font-medium" style={{ color: C.wine }}>{at('addons.item.add')}</button>
      </div>
    )
  }
  return (
    <div className="grid gap-2 px-5 py-3 border-t" style={{ borderColor: C.border }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder={at('masterclass.namePh')} aria-label={at('masterclass.col.name')} maxLength={80} autoFocus
          onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }} />
        <input style={inputStyle} value={nameKa} onChange={e => setNameKa(e.target.value)} placeholder={at('addons.item.nameKaPh')} aria-label={at('addons.item.nameKaPh')} maxLength={80} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select style={inputStyle} value={unit} onChange={e => setUnit(e.target.value as MasterclassUnit)} aria-label={at('masterclass.col.unitType')}>
          {MASTERCLASS_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
        </select>
        <input style={{ ...inputStyle, width: 96 }} type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" aria-label={at('masterclass.col.price')} />
        <button onClick={add} disabled={busy || !name.trim()} className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: C.wine }}>{at('orderDetail.masterclass.add')}</button>
        <button onClick={() => { setAdding(false); setError('') }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
      </div>
    </div>
  )
}
