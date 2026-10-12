import { Page } from '@playwright/test'

/**
 * Fills the wine order drawer's "Preferred delivery / pickup date" (T-14), which the public form
 * requires since vault/Plan-WineOrderFeatures.md Chunk 7. Two weeks out by default: far past any
 * lead time, and a Closed Day that far ahead would be unusual — pass `daysAhead` to move it.
 * The field is the shared DateInput (DD/MM/YYYY text box).
 */
export async function fillPreferredWineDate(page: Page, daysAhead = 14) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  await page.getByPlaceholder('DD/MM/YYYY').last().fill(`${dd}/${mm}/${d.getFullYear()}`)
  // DateInput commits on blur.
  await page.getByPlaceholder('DD/MM/YYYY').last().blur()
}
