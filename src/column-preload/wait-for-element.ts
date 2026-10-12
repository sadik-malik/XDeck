/**
 * Swift waitForElement. Calls `callback` with the element at `index` once it exists, and stops
 * observing after the first call when `once` is set.
 *
 * Deviation from Swift (TASK-007): the selector is checked at once. Swift injects at document start
 * and never needs this, but the setup reaches the preload only after the DOM is ready, so an element
 * that is already there would never see a mutation. If it is missing, the observer runs as before.
 * It watches the whole document, not <body>: X's login app hands over to the timeline by replacing
 * <body>, and an observer on the old one never sees the new page (TASK-023).
 */
export function waitForElement(
  selector: string,
  index: number,
  callback: (element: Element) => void,
  once = true,
): void {
  const existing = document.querySelectorAll(selector)[index]
  if (existing) {
    callback(existing)
    if (once) {
      return
    }
  }

  const observer = new MutationObserver((_mutationsList, observer) => {
    const element = document.querySelectorAll(selector)[index]
    if (element) {
      callback(element)
      if (once) {
        observer.disconnect()
      }
    }
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
}
