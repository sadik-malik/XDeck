import { waitForElement } from './wait-for-element'

// Ports of the X scripts in XDeck/WebViewConfigurations.swift. Each one keeps the Swift DOM work
// and selectors. Only the parts the Electron preload forces are changed (see the TASK-006 report).

const POST_AREA_CSS =
  "div:has(> main):has(> :nth-child(4)) > main div:has(> div > div[role='progressbar']) { display: none; }"

const SIDE_HEADER_CSS = 'header { display: none !important; }'

/**
 * Adds or removes one injected <style>, found by id. Swift appended the style once per page. Here a
 * column can stop being the leftmost X column when columns are reordered (TASK-014), so the side
 * header and post area must be shown again, and a repeated setup must not add duplicates.
 */
export function setStyle(id: string, css: string, on: boolean): void {
  const existing = document.getElementById(id)
  if (!on) {
    existing?.remove()

    return
  }

  if (existing) {
    return
  }

  const style = document.createElement('style')
  style.id = id
  style.type = 'text/css'
  style.textContent = css
  document.head.appendChild(style)
}

/** Swift hidePostArea, switchable. */
export function setPostAreaHidden(hidden: boolean): void {
  setStyle('xdeck-hide-post-area', POST_AREA_CSS, hidden)
}

/** Swift hideSideHeader, switchable. */
export function setSideHeaderHidden(hidden: boolean): void {
  setStyle('xdeck-hide-side-header', SIDE_HEADER_CSS, hidden)
}

/**
 * The home timeline tabs (For you, Following, ...). Swift matched a[href='/home'][role='tab'], but X
 * now renders the tabs as div[role='tab'] without an href, so that selector no longer matches and the
 * Following column stayed on For you. Found on real x.com (2026-10-10).
 */
const HOME_TABS = "[role='tablist'] [role='tab']"

/** Swift clickForYouTab (tab 0) and clickFollowingTab (tab 1). */
function clickTab(index: number): void {
  waitForElement(HOME_TABS, index, (element) => {
    ;(element as HTMLElement).click()
  })
}

export function clickForYouTab(): void {
  clickTab(0)
}

export function clickFollowingTab(): void {
  clickTab(1)
}
