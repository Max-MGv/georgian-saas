/**
 * True when the page is running inside one of the live mirror's panes (/live).
 *
 * The mirror embeds the real guest site and the real admin panel as same-origin
 * iframes. Without this, every pane would draw its own demo banner, tour pill
 * and feature rail inside itself — three copies of the chrome, nested in a view
 * whose whole point is to show the two products side by side.
 *
 * Deliberately a frame check rather than a query parameter: a query parameter
 * would have to be threaded through every internal link inside both panes, and
 * would be lost the first time a visitor clicked one.
 */
export function isEmbeddedPane(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin parent: we are definitely framed.
    return true
  }
}
