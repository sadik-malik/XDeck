import { ipcRenderer } from 'electron'
import {
  DIALOG,
  HIDE_INSTAGRAM_BARS_CSS,
  INBOX_LINK,
  isValidInstagramUsername,
  LOGIN_FORM,
  NEW_POST_LINK,
  OWN_AVATAR,
} from '../shared/instagram-user'
import { setStyle } from './scripts'
import { waitForElement } from './wait-for-element'

// Instagram columns (roadmap §9). The same isolated world as the X scripts: DOM only, nothing
// exposed to the page.

/** Instagram's top bar and bottom tab bar, hidden in a column (switchable, like the X scripts). */
export function setInstagramBarsHidden(hidden: boolean): void {
  setStyle('xdeck-hide-instagram-bars', HIDE_INSTAGRAM_BARS_CSS, hidden)
}

/**
 * The logged-in user name, or null: the profile link beside the Messages link in Instagram's
 * navigation, the one that shows the user's avatar. Feed posts show avatars too, but never next to
 * the Messages link.
 */
function findOwnName(): string | null {
  for (const inbox of document.querySelectorAll(INBOX_LINK)) {
    for (let element = inbox.parentElement; element && element !== document.body; ) {
      const own = [...element.querySelectorAll('a[href]')].find((link) =>
        link.querySelector(OWN_AVATAR),
      )
      if (own) {
        const name = /^\/([^/]+)\/?$/.exec(own.getAttribute('href') ?? '')?.[1]

        return name && isValidInstagramUsername(name) ? name : null
      }

      element = element.parentElement
    }
  }

  return null
}

/**
 * Reports the logged-in Instagram user name (`xdeck:instagram-user-name`) once Instagram's
 * navigation shows it; the renderer validates it. A login form instead is reported once
 * (`xdeck:logged-out`), so the column can offer XDeck's login window (TASK-043).
 */
export function findInstagramUserName(): void {
  let loggedOutSent = false
  const report = (): boolean => {
    const name = findOwnName()
    if (name) {
      ipcRenderer.sendToHost('xdeck:instagram-user-name', name)
    } else if (!loggedOutSent && document.querySelector(LOGIN_FORM)) {
      loggedOutSent = true
      ipcRenderer.sendToHost('xdeck:logged-out')
    }

    return name !== null
  }

  if (report()) {
    return
  }
  // The whole document, not <body>, as in waitForElement: a login can replace <body>.
  const observer = new MutationObserver(() => {
    if (report()) {
      observer.disconnect()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

/**
 * Post as Instagram (TASK-044): Instagram has no URL for its create dialog, so the window opens the
 * feed, hides it and clicks New post. Once that dialog has opened and closed again (shared, or
 * closed by the user), it reports `xdeck:post-closed` and the window closes.
 */
export function openInstagramNewPost(): void {
  // Only the create dialog shows: not the feed, its scrollbar or the floating Messages button (a
  // fixed div around a role=button with the Messages icon; found on instagram.com, 2026-10-12).
  setStyle(
    'xdeck-instagram-post',
    `main, div:has(> div[role="button"] > div > svg[aria-label="Messages"]) { visibility: hidden !important; }
html, body { overflow: hidden !important; }`,
    true,
  )
  waitForElement(NEW_POST_LINK, 0, (link) => {
    ;(link as HTMLElement).click()
    let opened = false
    const observer = new MutationObserver(() => {
      const open = document.querySelector(DIALOG) !== null
      if (open) {
        opened = true
      } else if (opened) {
        observer.disconnect()
        ipcRenderer.sendToHost('xdeck:post-closed')
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}
