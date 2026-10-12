/** How long a column's header stays highlighted after a jump to it, ms. */
const HIGHLIGHT_MS = 900

/**
 * Brings a column into view (the rail's column buttons, keys 1–9) and highlights its header for a
 * moment, so the eye finds the column it jumped to. Returns the column, or null.
 */
export function revealColumn(key: string): HTMLElement | null {
  const column = document.querySelector<HTMLElement>(
    `[data-column][data-column-key="${CSS.escape(key)}"]`,
  )
  if (!column) {
    return null
  }

  column.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  column.dataset.highlight = 'true'
  window.setTimeout(() => {
    delete column.dataset.highlight
  }, HIGHLIGHT_MS)

  return column
}
