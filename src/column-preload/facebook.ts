import { ipcRenderer } from 'electron'
import {
  FACEBOOK_DIALOG,
  FACEBOOK_LOGIN_FORM,
  FACEBOOK_POST_BOX,
  FACEBOOK_USER_COOKIE,
  facebookUserInPageData,
  HIDE_FACEBOOK_BARS_CSS,
} from '../shared/facebook-user'
import { setStyle } from './scripts'
import { waitForElement } from './wait-for-element'

// Facebook columns (roadmap §11). The same isolated world as the X scripts: DOM only, nothing
// exposed to the page. Who is logged in comes from the session's cookie in main, not from here.

/** Facebook's top bar and side columns, hidden in a column (switchable, like the X scripts). */
export function setFacebookBarsHidden(hidden: boolean): void {
  setStyle('xdeck-hide-facebook-bars', HIDE_FACEBOOK_BARS_CSS, hidden)
}

/**
 * Reports Facebook's login form once (`xdeck:logged-out`), so the column can offer XDeck's login
 * window instead (TASK-043).
 */
export function reportFacebookLogin(): void {
  const report = (): boolean => {
    if (!document.querySelector(FACEBOOK_LOGIN_FORM)) {
      return false
    }

    ipcRenderer.sendToHost('xdeck:logged-out')

    return true
  }

  if (report()) {
    return
  }

  const observer = new MutationObserver(() => {
    if (report()) {
      observer.disconnect()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

/** The id in the page's c_user cookie: the account the page data must belong to. */
function cookieUser(): string | null {
  const match = new RegExp(`(?:^|; )${FACEBOOK_USER_COOKIE}=([0-9]+)`).exec(document.cookie)

  return match?.[1] ?? null
}

/**
 * Reports the logged-in account's name (`xdeck:account-label`, with its id) from Facebook's page
 * data, once it is there: the accounts menu and column headers name Facebook accounts by it, since
 * the account's name in XDeck is its user id (roadmap §11). Only when the data's id is the session's.
 */
export function findFacebookName(): void {
  const report = (): boolean => {
    const scripts = [...document.querySelectorAll('script:not([src])')]
    for (const script of scripts) {
      const user = facebookUserInPageData(script.textContent ?? '')
      if (user && user.id === cookieUser()) {
        ipcRenderer.sendToHost('xdeck:account-label', user.id, user.name)

        return true
      }
    }

    return false
  }

  if (report()) {
    return
  }

  const observer = new MutationObserver(() => {
    if (report()) {
      observer.disconnect()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  // Facebook writes its data with the page; one that has none by now never will.
  setTimeout(() => observer.disconnect(), 20_000)
}

/**
 * Post as Facebook (roadmap §11): Facebook has no URL for its create-post dialog, so the window
 * opens the feed, hides it and clicks Facebook's post box. Once that dialog has opened and closed
 * again (posted, or closed by the user), it reports `xdeck:post-closed` and the window closes.
 */
export function openFacebookNewPost(): void {
  // Only the dialog shows: not the feed below it or its scrollbar.
  setStyle(
    'xdeck-facebook-post',
    `div[role="main"] { visibility: hidden !important; }
html, body { overflow: hidden !important; }`,
    true,
  )
  waitForElement(FACEBOOK_POST_BOX, 0, (box) => {
    ;(box as HTMLElement).click()
    let opened = false
    const observer = new MutationObserver(() => {
      const open = [...document.querySelectorAll(FACEBOOK_DIALOG)].some((dialog) =>
        dialog.checkVisibility(),
      )
      if (open) {
        opened = true
      } else if (opened) {
        observer.disconnect()
        ipcRenderer.sendToHost('xdeck:post-closed')
      }
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  })
}
