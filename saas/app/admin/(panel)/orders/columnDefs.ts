export const COLUMN_DEFS = [
  { id: 'orderId',     labelKey: 'orders.col.orderId',     defaultVisible: false },
  { id: 'date',        labelKey: 'orders.col.date',        defaultVisible: true  },
  { id: 'time',        labelKey: 'orders.col.time',        defaultVisible: true  },
  { id: 'contact',     labelKey: 'orders.col.contact',     defaultVisible: true  },
  { id: 'type',        labelKey: 'orders.col.type',        defaultVisible: true  },
  { id: 'company',     labelKey: 'orders.col.company',     defaultVisible: true  },
  { id: 'tasting',     labelKey: 'orders.col.tasting',     defaultVisible: true  },
  { id: 'lunch',       labelKey: 'orders.col.lunch',       defaultVisible: true  },
  { id: 'guests',      labelKey: 'orders.col.guests',      defaultVisible: false },
  { id: 'visit',       labelKey: 'orders.col.visit',       defaultVisible: true  },
  { id: 'masterclass', labelKey: 'orders.col.masterclass', defaultVisible: true  },
  { id: 'food',        labelKey: 'orders.col.food',        defaultVisible: true  },
  { id: 'total',       labelKey: 'orders.col.total',       defaultVisible: true  },
  { id: 'additional',  labelKey: 'orders.col.additional',  defaultVisible: false },
  { id: 'status',      labelKey: 'orders.col.status',      defaultVisible: true  },
] as const

export type ColumnId = typeof COLUMN_DEFS[number]['id']

export const COLUMNS_STORAGE_KEY = 'orders-columns'

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
  return demo
}
