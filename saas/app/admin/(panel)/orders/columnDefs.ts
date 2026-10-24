export const COLUMN_DEFS = [
  { id: 'orderId',     labelKey: 'orders.col.orderId',     defaultVisible: false },
  { id: 'date',        labelKey: 'orders.col.date',        defaultVisible: true  },
  { id: 'time',        labelKey: 'orders.col.time',        defaultVisible: true  },
  { id: 'contact',     labelKey: 'orders.col.contact',     defaultVisible: true  },
  { id: 'type',        labelKey: 'orders.col.type',        defaultVisible: true  },
  { id: 'company',     labelKey: 'orders.col.company',     defaultVisible: true  },
  { id: 'nationality', labelKey: 'orders.col.nationality', defaultVisible: false },
  // The three products (T-152). The ids 'tasting' / 'lunch' are kept — browsers have them saved — and now mean
  // Tasting only / Tasting & Lunch; 'lunchOnly' was added in Plan-PricingModel Chunk 9.
  { id: 'tasting',     labelKey: 'orders.col.tasting',     defaultVisible: true  },
  { id: 'lunchOnly',   labelKey: 'orders.col.lunchOnly',   defaultVisible: true  },
  { id: 'lunch',       labelKey: 'orders.col.lunch',       defaultVisible: true  },
  { id: 'free',        labelKey: 'orders.col.free',        defaultVisible: false },
  { id: 'guests',      labelKey: 'orders.col.guests',      defaultVisible: false },
  { id: 'visit',       labelKey: 'orders.col.visit',       defaultVisible: true  },
  { id: 'masterclass', labelKey: 'orders.col.masterclass', defaultVisible: true  },
  // Wine for the table (T-22) — the saved id of the add-ons column above stays 'masterclass'; this one is new.
  { id: 'tableWine',   labelKey: 'orders.col.tableWine',   defaultVisible: true  },
  { id: 'food',        labelKey: 'orders.col.food',        defaultVisible: true  },
  { id: 'total',       labelKey: 'orders.col.total',       defaultVisible: true  },
  { id: 'additional',  labelKey: 'orders.col.additional',  defaultVisible: false },
  { id: 'status',      labelKey: 'orders.col.status',      defaultVisible: true  },
] as const

export type ColumnId = typeof COLUMN_DEFS[number]['id']

export const COLUMNS_STORAGE_KEY = 'orders-columns'
/** Every column id this browser has been offered — so a column added later still shows by default once. */
export const COLUMNS_SEEN_KEY = 'orders-columns-seen'
/** Columns added after browsers began saving their choices; a saved choice with no "seen" list predates them. */
const ADDED_LATER: ColumnId[] = ['lunchOnly', 'free', 'tableWine']

export const DEFAULT_VISIBLE = new Set<ColumnId>(
  COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.id as ColumnId)
)

import { DEMO_TENANT_ID } from '@/lib/demoTenant'

/**
 * The default visible columns for a browser that has never touched the Columns
 * control. Per-browser, not per-tenant: COLUMNS_STORAGE_KEY lives in
 * localStorage, so this is only ever the *first* impression.
 *
 * The demo hides Food and Masterclass. On /admin/orders the Food column wraps
 * "Veg: Pkhali platter / Meat: Mtsvadi (pork skewers)" onto several lines and
 * pushes rows to ~150px, so about five bookings fit a 900px screen — the first
 * thing a winery owner sees of the back office is data entry rather than a
 * business. Plan-DemoFlowFixes Chunk 7, task 7.1.
 *
 * Deliberately NOT changed for everyone. The task allowed a global change once
 * the default turned out not to be a tenant setting, but a real winery's
 * kitchen wants the food line: that is a product decision with an owner, and it
 * is not this chunk's to make. Every other tenant keeps exactly the columns it
 * had.
 */
export function defaultVisibleFor(tenantId?: string | null): Set<ColumnId> {
  if (tenantId !== DEMO_TENANT_ID) return DEFAULT_VISIBLE
  const demo = new Set(DEFAULT_VISIBLE)
  demo.delete('food')
  demo.delete('masterclass')
  demo.delete('tableWine')
  return demo
}

/**
 * The visible columns for this browser: its saved choice, plus any column it has never been offered at that
 * column's default — without this a browser that saved its choice before a column existed would never see it.
 * Null when nothing is saved (use defaultVisibleFor). Never throws (private windows, blocked storage).
 */
export function readVisibleColumns(tenantId?: string | null): Set<ColumnId> | null {
  try {
    const saved = localStorage.getItem(COLUMNS_STORAGE_KEY)
    if (!saved) return null
    const visible = new Set(JSON.parse(saved) as ColumnId[])
    const seenRaw = localStorage.getItem(COLUMNS_SEEN_KEY)
    const seen = new Set<ColumnId>(seenRaw ? JSON.parse(seenRaw) as ColumnId[] : COLUMN_DEFS.map(c => c.id).filter(id => !ADDED_LATER.includes(id)))
    const defaults = defaultVisibleFor(tenantId)
    for (const c of COLUMN_DEFS) if (!seen.has(c.id) && defaults.has(c.id)) visible.add(c.id)
    return visible
  } catch {
    return null
  }
}

/** Saves the admin's choice and marks every current column as seen. */
export function saveVisibleColumns(visible: Set<ColumnId>) {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visible]))
    localStorage.setItem(COLUMNS_SEEN_KEY, JSON.stringify(COLUMN_DEFS.map(c => c.id)))
  } catch {}
}
