import { app, type BrowserWindow, Notification } from 'electron'
import { accountLabel } from '../shared/accounts'
import { NETWORK_INFO, parseUnreadKey } from '../shared/networks'
import { readAddedAccounts, readFirstAccount, readLabels, readSettings } from './settings'

/** Main → shell renderer: a notification was clicked; show the Notifications column. */
export const REVEAL_NOTIFICATIONS = 'notifications:reveal'

/** The most a count can be: X shows "(20+)" past 20, so anything far above is not a real count. */
export const MAX_UNREAD = 9_999

/**
 * Test hook (unpackaged builds only, like XDECK_USER_DATA): with XDECK_NOTIFY_DRY_RUN=1 nothing is
 * shown on the desktop; each notification is kept in `globalThis.xdeckNotifications` instead, for
 * the E2E specs to read.
 */
const dryRun = !app.isPackaged && process.env.XDECK_NOTIFY_DRY_RUN === '1'

/** The last count per account: the main account under '', added accounts by id (TASK-023). */
const lastCounts = new Map<string, number>()

/**
 * Whether the user is looking at XDeck. A minimized or hidden window is in the background even if
 * Windows still reports it focused (it can, when no other window takes the focus).
 */
function inForeground(win: BrowserWindow): boolean {
  return win.isFocused() && win.isVisible() && !win.isMinimized()
}

/** Shown notifications, kept until clicked or closed: a collected one loses its click handler. */
const live = new Set<Notification>()

/** "3 new notifications on X", "2 new on Instagram", with the account's name when XDeck knows it. */
function notificationText(count: number, key: string | null): string {
  const account = parseUnreadKey(key) ?? { network: 'x' as const, id: null }
  const { network, id } = account
  const what =
    network === 'x'
      ? count === 1
        ? '1 new notification on X'
        : `${count} new notifications on X`
      : `${count} new on ${NETWORK_INFO[network].name}`
  const name =
    id === null
      ? readFirstAccount(network)
      : readAddedAccounts(network).find((candidate) => candidate.id === id)?.username

  return name ? `${accountLabel(network, name, readLabels(network))}: ${what}` : what
}

/**
 * An unread count for one account, read by the renderer from X's page titles ("(3) Home / X")
 * or Instagram's. Each account is counted on its own; the app badge shows them all together. When
 * a count goes up while XDeck is not the focused window, and the setting is on, a desktop
 * notification says so (TASK-019; X's own web push does not reach Electron). `accountId` is null
 * for the main account.
 */
export function reportUnread(
  count: number,
  accountId: string | null,
  win: BrowserWindow | null,
): void {
  const key = accountId ?? ''
  const previous = lastCounts.get(key) ?? 0
  if (count === previous) {
    return
  }

  lastCounts.set(key, count)
  // macOS dock and Linux (Unity) launchers; elsewhere it is a no-op that returns false.
  app.setBadgeCount([...lastCounts.values()].reduce((sum, value) => sum + value, 0))
  if (count <= previous || !readSettings().notifications || !win || inForeground(win)) {
    return
  }

  const body = notificationText(count, accountId)
  if (dryRun) {
    const hook = globalThis as { xdeckNotifications?: string[] }
    hook.xdeckNotifications = [...(hook.xdeckNotifications ?? []), body]

    return
  }

  if (Notification.isSupported()) {
    const notification = new Notification({ title: 'XDeck', body })
    live.add(notification)
    notification.on('close', () => live.delete(notification))
    notification.on('click', () => {
      live.delete(notification)
      if (win.isDestroyed()) {
        return
      }

      if (win.isMinimized()) {
        win.restore()
      }

      win.show()
      win.focus()
      // Which network's notifications column to show.
      const network = parseUnreadKey(accountId)?.network ?? 'x'
      win.webContents.send(REVEAL_NOTIFICATIONS, network)
    })

    notification.show()
  }
  // The taskbar button flashes on Windows (and Linux) until the window is focused.
  win.flashFrame(true)
  win.once('focus', () => win.flashFrame(false))
}
