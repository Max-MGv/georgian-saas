export function wineDisplayName(wine: { name: string; nameKa?: string | null }, locale: string): string {
  if (locale === 'ka' && wine.nameKa && wine.nameKa.trim()) return wine.nameKa
  return wine.name
}
