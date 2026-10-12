import { ipcRenderer } from 'electron'

// The page colour of networks other than X (TASK-047), from the page itself.

/** "rgb(12, 16, 20)" → "#0c1014", or null for anything else (a transparent background). */
function toHex(color: string): string | null {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color)

  return match
    ? `#${match
        .slice(1)
        .map((part) => Number(part).toString(16).padStart(2, '0'))
        .join('')}`
    : null
}

/**
 * Reports the page's background (`xdeck:theme-color`), for the chrome of a deck with no X column
 * (TASK-047): Electron sends no theme colour event for Instagram's or Facebook's pages. Again
 * whenever the page switches between light and dark (a class on <html>).
 */
export function reportPageTheme(): void {
  let last: string | null = null
  const report = () => {
    const color = document.body ? toHex(getComputedStyle(document.body).backgroundColor) : null
    if (color && color !== last) {
      last = color
      ipcRenderer.sendToHost('xdeck:theme-color', color)
    }
  }

  report()
  new MutationObserver(report).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}
