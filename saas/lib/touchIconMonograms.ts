// Hand-made marks for the iOS bookmark / home-screen icon (app/touch-icon/route.tsx),
// keyed by the logo asset a tenant uses (Tenant.logoUrl) — the mark belongs to the
// logo, so every tenant showing that logo (production Nikalas Marani and the cloned
// Staging Winery) gets it. A tenant with no entry here gets its initials instead.
export type Monogram = { viewBox: string; paths: { d: string; dx?: number }[] }

export const LOGO_MONOGRAMS: Record<string, Monogram> = {
  // The two red letters of the Nikalas Marani wordmark — ნ(იკალას) მ(არანი) — lifted
  // verbatim from public/icons/logo-dark.svg (its .st0 paths) and set side by side.
  '/icons/logo-dark.svg': {
    viewBox: '0 0 104.3 74.6',
    paths: [
      { d: 'M23,74.4c-4.1,0-7.9-1.1-11.6-3.2c-3.7-2.2-6.5-5.3-8.5-9.3S0,53.3,0,48.2v-1V16.6C0,11,1.6,6.9,4.8,4.4 C7.9,1.9,13,0.7,19.9,0.7h20.7v7.5H17.7c-3.6,0-6,0.6-7.2,1.9s-1.9,3.4-1.9,6.6v13.2c4.6-4.7,9.4-7.1,14.3-7.1 c4.8,0,9,1.1,12.5,3.2c3.5,2.2,6.1,5.2,7.8,9.2c1.8,4,2.6,8.3,2.6,13c0,5.1-1,9.6-2.9,13.7s-4.8,7.1-8.5,9.3 C30.9,73.3,27,74.4,23,74.4z M23,67c3.5,0,6.7-1.5,9.5-4.5c2.9-3,4.3-7.7,4.3-14c0-6-1.4-10.6-4.2-13.6s-6-4.6-9.6-4.6 c-3.6,0-6.9,1.5-9.9,4.6c-3,3-4.4,7.6-4.4,13.6c0,6.3,1.5,11,4.5,14C16.2,65.4,19.5,67,23,67z' },
      { d: 'M428.3,47.5v0.6c0,5.1-1,9.6-2.9,13.7c-1.9,4-4.8,7.1-8.5,9.3s-7.5,3.2-11.5,3.2c-4.1,0-7.9-1.1-11.6-3.2 c-3.7-2.2-6.5-5.3-8.5-9.3c-1.9-4-2.9-8.6-2.9-13.7c0-4.7,0.9-9,2.6-13c1.8-4,4.4-7,7.8-9.2c3.5-2.2,7.6-3.2,12.6-3.2 c4.8,0,9.6,2.5,14.2,7.4v-12c0-3.2-1.3-5.8-4-7.9c-2.6-2.1-5.7-3.1-9-3.1c-3.6,0-6.6,0.8-8.9,2.4c-2.4,1.6-3.6,3.8-3.6,6.7h-9 c0-4.6,2-8.4,6.1-11.5c4.1-3.1,9.2-4.6,15.5-4.6c5.8,0,10.8,1.8,15.1,5.3c4.3,3.5,6.4,7.9,6.4,13V47.5z M405.4,67 c3.5,0,6.7-1.5,9.8-4.5c3-3,4.5-7.7,4.5-14c0-6-1.5-10.6-4.4-13.6c-3-3-6.2-4.6-9.9-4.6c-3.6,0-6.8,1.5-9.6,4.6s-4.2,7.6-4.2,13.6 c0,6.3,1.4,11,4.3,14C398.7,65.4,401.9,67,405.4,67z', dx: -324 },
    ],
  },
}

export function monogramSvg(m: Monogram, color: string): string {
  const body = m.paths
    .map(p => (p.dx ? `<path fill="${color}" transform="translate(${p.dx} 0)" d="${p.d}"/>` : `<path fill="${color}" d="${p.d}"/>`))
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m.viewBox}">${body}</svg>`
}
