export const COLUMN_DEFS = [
  { id: 'orderId',     label: 'Order ID',    defaultVisible: false },
  { id: 'date',        label: 'Date',        defaultVisible: true  },
  { id: 'time',        label: 'Time',        defaultVisible: true  },
  { id: 'contact',     label: 'Contact',     defaultVisible: true  },
  { id: 'type',        label: 'Type',        defaultVisible: true  },
  { id: 'company',     label: 'Company',     defaultVisible: true  },
  { id: 'tasting',     label: 'Tasting',     defaultVisible: true  },
  { id: 'lunch',       label: 'Lunch',       defaultVisible: true  },
  { id: 'guests',      label: 'Total guests',defaultVisible: false },
  { id: 'visit',       label: 'Visit',       defaultVisible: true  },
  { id: 'masterclass', label: 'Masterclass', defaultVisible: true  },
  { id: 'food',        label: 'Food',        defaultVisible: true  },
  { id: 'total',       label: 'Total',       defaultVisible: true  },
  { id: 'status',      label: 'Status',      defaultVisible: true  },
  { id: 'additional',  label: 'Additional',  defaultVisible: false },
] as const

export type ColumnId = typeof COLUMN_DEFS[number]['id']

export const COLUMNS_STORAGE_KEY = 'orders-columns'

export const DEFAULT_VISIBLE = new Set<ColumnId>(
  COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.id as ColumnId)
)
