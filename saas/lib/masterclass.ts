export type MasterclassUnit = 'PER_PERSON' | 'PER_PIECE' | 'FLAT'

export const MASTERCLASS_UNITS: MasterclassUnit[] = ['PER_PERSON', 'PER_PIECE', 'FLAT']

export const UNIT_LABELS: Record<MasterclassUnit, string> = {
  PER_PERSON: 'per person',
  PER_PIECE:  'per piece',
  FLAT:       'flat fee',
}

export const UNIT_DESCRIPTIONS: Record<MasterclassUnit, string> = {
  PER_PERSON: 'Multiplied by number of guests automatically',
  PER_PIECE:  'Admin enters quantity manually per order',
  FLAT:       'Fixed charge, added once regardless of guests',
}
