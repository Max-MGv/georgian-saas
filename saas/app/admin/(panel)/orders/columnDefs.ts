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
  { id: 'status',      labelKey: 'orders.col.status',      defaultVisible: true  },
  { id: 'additional',  labelKey: 'orders.col.additional',  defaultVisible: false },
] as const

export type ColumnId = typeof COLUMN_DEFS[number]['id']

export const COLUMNS_STORAGE_KEY = 'orders-columns'

export const DEFAULT_VISIBLE = new Set<ColumnId>(
  COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.id as ColumnId)
)
