import { ipcRenderer } from 'electron'
import { ACCOUNT_AVATAR, AVATAR_PREFIX, PROFILE_LINK } from '../shared/x-user'
import { waitForElement } from './wait-for-element'

/**
 * Swift findUserName, for the login pages only. Reports the logged-in user name
 * (`xdeck:user-name`); the renderer validates it. It comes from the profile link's href (its first
 * path segment) or, where X shows no profile link (narrower than about 700 px, as in the Add X
 * Account dialog, TASK-029), from the avatar in X's account button.
 *
 * Deviation from Swift (TASK-007): a link to another origin never counts. Swift takes the path of
 * any href, so `//evil.example/x` would report `x`.
 */
export function findUserName(): void {
  waitForElement(`${PROFILE_LINK}, ${ACCOUNT_AVATAR}`, 0, (element) => {
    const testId = element.getAttribute('data-testid') ?? ''
    if (testId.startsWith(AVATAR_PREFIX)) {
      const userName = testId.slice(AVATAR_PREFIX.length)
      if (userName) {
        ipcRenderer.sendToHost('xdeck:user-name', userName)
      }

      return
    }

    const href = element.getAttribute('href') ?? ''
    let url: URL
    try {
      url = new URL(href, window.location.origin)
    } catch {
      return
    }

    if (url.origin !== window.location.origin) {
      return
    }

    const userName = url.pathname.split('/').filter(Boolean)[0]
    if (userName) {
      ipcRenderer.sendToHost('xdeck:user-name', userName)
    }
  })
}
