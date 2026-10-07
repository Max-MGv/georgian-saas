/**
 * Turns the single "Name" box into `Order.name` / `Order.surname`.
 *
 * Those stay two DB columns (the orders CSV export keeps them separate for the
 * winery's own accounting), so a one-box form splits the typed full name at
 * submit time only — first word → `name`, the rest → `surname`. A picked
 * person's name is split the same way.
 *
 * No "must contain a space" rule exists anywhere: neither `createBooking` nor
 * `createOrderAdmin` requires `surname`, so a one-word name is accepted with an
 * empty surname rather than blocked.
 *
 * Shared by the public booking form and the admin New Order form so the two
 * cannot drift on how a name is split (they used to: the admin form kept two
 * boxes and required both).
 */
export function splitFullName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(' ')
  return { name: parts[0] ?? '', surname: parts.slice(1).join(' ') }
}
