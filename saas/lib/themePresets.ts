export type PresetId =
  | 'cream' | 'sage' | 'clay' | 'midnight'
  | 'amber' | 'rose' | 'olive' | 'straw'
  | 'harbor' | 'plum' | 'emerald' | 'indigo'
  | 'espresso' | 'velvet' | 'forest' | 'deepharbor'

export type ThemeCategory = 'light' | 'dark'

export type ThemeTokens = {
  bg: string
  surface: string
  header: string
  text: string
  muted: string
  border: string
  secondary: string
  brand: string
}

export type ResolvedTheme = ThemeTokens & { brandHover: string }

export type TenantTheme = {
  v: 1
  presetId: PresetId
  primaryColorOverride?: string
}

export const DEFAULT_PRESET_ID: PresetId = 'cream'

export const THEME_PRESETS: Record<PresetId, { name: string; category: ThemeCategory; tokens: ThemeTokens }> = {
  cream: {
    name: 'Cream & wine',
    category: 'light',
    // Exact values from the pre-preset hardcoded site (app/(site)/layout.tsx,
    // SiteNav.tsx, components/BookingForm.tsx's `C` constant) so migrating
    // existing tenants onto this preset is a zero-diff.
    tokens: { bg: '#F5EFE6', surface: '#FFF9F3', header: '#F5EFE6', text: '#1C1008', muted: '#6B5A47', border: '#E0D4C0', secondary: '#A89070', brand: '#7C1D23' },
  },
  sage: {
    name: 'Sage & stone',
    category: 'light',
    tokens: { bg: '#F3F1EA', surface: '#FFFFFF', header: '#EDEBDF', text: '#262A22', muted: '#6E7364', border: '#D8D6C7', secondary: '#8A9478', brand: '#4B5D3A' },
  },
  clay: {
    name: 'Terracotta & clay',
    category: 'light',
    tokens: { bg: '#FBF0E6', surface: '#FFF8F0', header: '#F5E4D3', text: '#3A2415', muted: '#8A6A4E', border: '#E8D2BC', secondary: '#C98A55', brand: '#B5502E' },
  },
  midnight: {
    name: 'Midnight cellar',
    category: 'dark',
    tokens: { bg: '#1E1B18', surface: '#262220', header: '#17140F', text: '#F1E9DD', muted: '#A99A87', border: '#3A332C', secondary: '#A88B5C', brand: '#C9A227' },
  },
  amber: {
    name: 'Amber & walnut',
    category: 'light',
    tokens: { bg: '#FAF3E7', surface: '#FFFDF8', header: '#F2E7D4', text: '#2B1D0E', muted: '#7A6248', border: '#E5D5B8', secondary: '#C9A66B', brand: '#8B5A2B' },
  },
  rose: {
    name: 'Rosé & copper',
    category: 'light',
    tokens: { bg: '#FBF0EE', surface: '#FFF9F8', header: '#F4E4E0', text: '#3A1F1C', muted: '#8C6862', border: '#EAD1CB', secondary: '#D89C8F', brand: '#B4553D' },
  },
  olive: {
    name: 'Olive grove',
    category: 'light',
    tokens: { bg: '#F6F2E4', surface: '#FFFDF6', header: '#ECE6CF', text: '#2C2A16', muted: '#74704F', border: '#DED5B0', secondary: '#A6A05E', brand: '#6B7A2E' },
  },
  straw: {
    name: 'Straw & rust',
    category: 'light',
    tokens: { bg: '#FAF2E0', surface: '#FFFAF0', header: '#F2E6CA', text: '#33230F', muted: '#83683F', border: '#E6D5A9', secondary: '#C99A4A', brand: '#A8471F' },
  },
  harbor: {
    name: 'Harbor blue',
    category: 'light',
    tokens: { bg: '#EFF2F4', surface: '#FFFFFF', header: '#E3E8EC', text: '#1B2733', muted: '#566573', border: '#D2DAE0', secondary: '#7C93A3', brand: '#2C4A63' },
  },
  plum: {
    name: 'Plum & amethyst',
    category: 'light',
    tokens: { bg: '#F5F0F3', surface: '#FFFBFD', header: '#ECE2E9', text: '#2A1A28', muted: '#7A6376', border: '#DFCEDB', secondary: '#B692AE', brand: '#6B2A5C' },
  },
  emerald: {
    name: 'Emerald & moss',
    category: 'light',
    tokens: { bg: '#F0F3EE', surface: '#FCFFFA', header: '#E3E9DF', text: '#182219', muted: '#556354', border: '#CFDBC9', secondary: '#7C9A72', brand: '#1F5C3C' },
  },
  indigo: {
    name: 'Indigo & ink',
    category: 'light',
    tokens: { bg: '#EEF0F4', surface: '#FAFBFD', header: '#E1E4ED', text: '#171A2B', muted: '#55597A', border: '#CDD1E2', secondary: '#8087B0', brand: '#2C2F6B' },
  },
  espresso: {
    name: 'Espresso night',
    category: 'dark',
    tokens: { bg: '#201811', surface: '#2A2119', header: '#2C2219', text: '#F0E6DA', muted: '#A8927B', border: '#3D3226', secondary: '#A9895E', brand: '#C97A3D' },
  },
  velvet: {
    name: 'Velvet noir',
    category: 'dark',
    tokens: { bg: '#1A161C', surface: '#221D26', header: '#241E27', text: '#EFE7EF', muted: '#A296A5', border: '#322B38', secondary: '#8C6D93', brand: '#9B4B8C' },
  },
  forest: {
    name: 'Forest dusk',
    category: 'dark',
    tokens: { bg: '#14201A', surface: '#1B2921', header: '#1D2B23', text: '#E7EFEA', muted: '#93A99C', border: '#2A3B31', secondary: '#6B9179', brand: '#4C9165' },
  },
  deepharbor: {
    name: 'Deep harbor',
    category: 'dark',
    tokens: { bg: '#131A22', surface: '#1B242E', header: '#1C242E', text: '#E6EDF3', muted: '#8FA0AF', border: '#29343F', secondary: '#5B7A93', brand: '#3E7FB0' },
  },
}

// ── Color math (HSL round-trip) ──────────────────────────────────────────────
// Edge-runtime safe: no Node APIs, pure arithmetic.

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  let h = 0, s = 0
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = 60 * (((g - b) / delta) % 6); break
      case g: h = 60 * ((b - r) / delta + 2); break
      default: h = 60 * ((r - g) / delta + 4); break
    }
    if (h < 0) h += 360
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number] = [0, 0, 0]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255]
}

// Hover is a lightness bump, not a darken — matches the app's existing
// hardcoded default (#7c1d23 -> #9b2429), which keeps hue/saturation and
// raises lightness by ~0.075. Deriving it means every preset (and any brand
// override) gets a consistent, correctly-tuned hover for free.
const HOVER_LIGHTNESS_DELTA = 0.075

export function deriveBrandHover(brandHex: string): string {
  const [r, g, b] = hexToRgb(brandHex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [nr, ng, nb] = hslToRgb(h, s, Math.min(1, l + HOVER_LIGHTNESS_DELTA))
  return rgbToHex(nr, ng, nb)
}

// ── Resolution ────────────────────────────────────────────────────────────

function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
}

function isPresetId(v: unknown): v is PresetId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, v)
}

// Pre-preset shape, still live on every tenant created before this feature.
type LegacyTheme = { primaryColor?: string; primaryHover?: string }

/**
 * Parses a tenant's raw `theme` JSON column into its preset selection.
 * Handles three cases: the new `{v, presetId, primaryColorOverride?}` shape,
 * the legacy `{primaryColor, primaryHover}` shape (mapped onto the default
 * preset as an override so existing tenants don't change on deploy), and
 * missing/malformed data (falls back to the default preset untouched).
 */
export function parseTenantTheme(raw: unknown): { presetId: PresetId; primaryColorOverride?: string } {
  let presetId: PresetId = DEFAULT_PRESET_ID
  let override: string | undefined

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (isPresetId(obj.presetId)) {
      presetId = obj.presetId
      if (isValidHex(obj.primaryColorOverride)) override = obj.primaryColorOverride
    } else {
      const legacy = obj as LegacyTheme
      if (isValidHex(legacy.primaryColor)) override = legacy.primaryColor
    }
  }

  return { presetId, primaryColorOverride: override }
}

/** Resolves a tenant's raw `theme` JSON column into a full 8-token palette (+ derived hover). */
export function resolveTenantTheme(raw: unknown): ResolvedTheme {
  const { presetId, primaryColorOverride } = parseTenantTheme(raw)
  const tokens = THEME_PRESETS[presetId].tokens
  const brand = primaryColorOverride ?? tokens.brand
  return { ...tokens, brand, brandHover: deriveBrandHover(brand) }
}
